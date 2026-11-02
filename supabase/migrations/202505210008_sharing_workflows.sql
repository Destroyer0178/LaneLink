begin;

alter table public.sets
  add column source_creator_display_name text,
  add column source_creator_organization text;

alter table public.set_pieces
  add column source_creator_display_name text,
  add column source_creator_organization text;

comment on column public.sets.source_creator_display_name is
  'Snapshot of the original public creator name when an independent copy is made.';
comment on column public.set_pieces.source_creator_display_name is
  'Snapshot of the original public creator name when an independent copy is made.';

create or replace function public.duplicate_public_library_item(
  p_item_type text,
  p_item_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  copied_item jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;

  if p_item_type = 'set' then
    with inserted as (
      insert into public.sets (
        owner_id,
        source_set_id,
        name,
        description,
        visibility,
        structure,
        schema_version,
        planned_for,
        source_creator_display_name,
        source_creator_organization
      )
      select
        (select auth.uid()),
        source.id,
        source.name || ' Copy',
        source.description,
        'private',
        source.structure,
        source.schema_version,
        source.planned_for,
        profile.display_name,
        profile.organization
      from public.sets source
      join public.public_profiles profile on profile.id = source.owner_id
      where source.id = p_item_id
        and source.visibility = 'public'
        and source.archived_at is null
        and source.owner_id <> (select auth.uid())
      returning
        id,
        name,
        description,
        structure,
        visibility,
        source_creator_display_name,
        source_creator_organization
    )
    select jsonb_build_object(
      'id', inserted.id,
      'item_type', 'set',
      'name', inserted.name,
      'description', inserted.description,
      'category', null,
      'structure', inserted.structure,
      'visibility', inserted.visibility,
      'source_creator_display_name', inserted.source_creator_display_name,
      'source_creator_organization', inserted.source_creator_organization
    )
    into copied_item
    from inserted;
  elsif p_item_type = 'piece' then
    with inserted as (
      insert into public.set_pieces (
        owner_id,
        source_piece_id,
        name,
        description,
        category,
        visibility,
        structure,
        schema_version,
        source_creator_display_name,
        source_creator_organization
      )
      select
        (select auth.uid()),
        source.id,
        source.name || ' Copy',
        source.description,
        source.category,
        'private',
        source.structure,
        source.schema_version,
        profile.display_name,
        profile.organization
      from public.set_pieces source
      join public.public_profiles profile on profile.id = source.owner_id
      where source.id = p_item_id
        and source.visibility = 'public'
        and source.archived_at is null
        and source.owner_id <> (select auth.uid())
      returning
        id,
        name,
        description,
        category,
        structure,
        visibility,
        source_creator_display_name,
        source_creator_organization
    )
    select jsonb_build_object(
      'id', inserted.id,
      'item_type', 'piece',
      'name', inserted.name,
      'description', inserted.description,
      'category', inserted.category,
      'structure', inserted.structure,
      'visibility', inserted.visibility,
      'source_creator_display_name', inserted.source_creator_display_name,
      'source_creator_organization', inserted.source_creator_organization
    )
    into copied_item
    from inserted;
  else
    raise exception 'Unsupported public library item type.';
  end if;

  if copied_item is null then
    raise exception 'The public item was not found or cannot be duplicated.'
      using errcode = 'P0002';
  end if;

  return copied_item;
end;
$$;

comment on function public.duplicate_public_library_item(text, uuid) is
  'Creates an independent private copy of another coach public item. Nested JSON content is preserved exactly and attribution is snapshotted.';

revoke all on function public.duplicate_public_library_item(text, uuid)
from public;
grant execute on function public.duplicate_public_library_item(text, uuid)
to authenticated;

commit;
