begin;

-- Repair legacy Auth users that may have been created while the profile
-- trigger was unavailable. Client-side profile inserts remain revoked.
insert into public.profiles (
  id,
  display_name,
  organization
)
select
  auth_user.id,
  coalesce(auth_user.raw_user_meta_data ->> 'display_name', ''),
  coalesce(auth_user.raw_user_meta_data ->> 'organization', '')
from auth.users auth_user
on conflict (id) do nothing;

-- Public discovery must not depend on every historical auth user having a
-- profile row. The function remains a narrow safe projection: it requires an
-- authenticated caller and explicitly filters to active public content.
create or replace function public.search_public_library(
  p_item_type text default 'set',
  p_query text default '',
  p_stroke text default '',
  p_distance integer default null,
  p_goal text default '',
  p_equipment text default '',
  p_sort text default 'newest',
  p_limit integer default 12,
  p_offset integer default 0
)
returns table (
  id uuid,
  item_type text,
  name text,
  description text,
  category text,
  structure jsonb,
  creator_display_name text,
  creator_organization text,
  created_at timestamptz,
  updated_at timestamptz,
  in_collection boolean,
  is_own boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with public_items as (
    select
      source.id,
      'set'::text as item_type,
      source.name,
      source.description,
      null::text as category,
      source.structure,
      source.owner_id,
      source.created_at,
      source.updated_at
    from public.sets source
    where p_item_type = 'set'
      and source.visibility = 'public'
      and source.archived_at is null

    union all

    select
      source.id,
      'piece'::text as item_type,
      source.name,
      source.description,
      source.category,
      source.structure,
      source.owner_id,
      source.created_at,
      source.updated_at
    from public.set_pieces source
    where p_item_type = 'piece'
      and source.visibility = 'public'
      and source.archived_at is null
  ),
  filtered as (
    select
      item.*,
      coalesce(nullif(profile.display_name, ''), 'LaneLink Coach')
        as creator_display_name,
      coalesce(profile.organization, '') as creator_organization,
      (
        item.owner_id = (select auth.uid())
        or (
          item.item_type = 'set'
          and exists (
            select 1
            from public.saved_sets saved
            where saved.coach_id = (select auth.uid())
              and saved.set_id = item.id
          )
        )
        or (
          item.item_type = 'piece'
          and exists (
            select 1
            from public.saved_pieces saved
            where saved.coach_id = (select auth.uid())
              and saved.piece_id = item.id
          )
        )
      ) as in_collection
    from public_items item
    left join public.profiles profile on profile.id = item.owner_id
    where (select auth.uid()) is not null
      and (
        coalesce(btrim(p_query), '') = ''
        or lower(
          item.name || ' ' || item.description || ' '
          || coalesce(item.category, '') || ' ' || item.structure::text
        ) like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        coalesce(btrim(p_stroke), '') = ''
        or lower(item.structure::text)
          like '%"stroke": "' || lower(btrim(p_stroke)) || '"%'
      )
      and (
        p_distance is null
        or item.structure::text
          like '%"distance": ' || p_distance::text || '%'
      )
      and (
        coalesce(btrim(p_goal), '') = ''
        or lower(item.structure::text)
          like '%"goal": "' || lower(btrim(p_goal)) || '"%'
      )
      and (
        coalesce(btrim(p_equipment), '') = ''
        or lower(item.structure::text)
          like '%"' || lower(btrim(p_equipment)) || '"%'
      )
  )
  select
    filtered.id,
    filtered.item_type,
    filtered.name,
    filtered.description,
    filtered.category,
    filtered.structure,
    filtered.creator_display_name,
    filtered.creator_organization,
    filtered.created_at,
    filtered.updated_at,
    filtered.in_collection,
    filtered.owner_id = (select auth.uid()) as is_own,
    count(*) over () as total_count
  from filtered
  order by
    case when p_sort = 'alphabetical' then lower(filtered.name) end asc,
    case when p_sort <> 'alphabetical' then filtered.created_at end desc,
    filtered.id
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_public_library(
  text, text, text, integer, text, text, text, integer, integer
) from public;
grant execute on function public.search_public_library(
  text, text, text, integer, text, text, text, integer, integer
) to authenticated;

-- Duplication uses the same explicit public-only boundary. Security definer
-- avoids cross-owner visibility depending on client-side select policy state;
-- ownership of the inserted row is always forced to the authenticated caller.
create or replace function public.duplicate_public_library_item(
  p_item_type text,
  p_item_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  copied_item jsonb;
begin
  if caller_id is null then
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
        caller_id,
        source.id,
        source.name || ' Copy',
        source.description,
        'private',
        source.structure,
        source.schema_version,
        source.planned_for,
        coalesce(nullif(profile.display_name, ''), 'LaneLink Coach'),
        coalesce(profile.organization, '')
      from public.sets source
      left join public.profiles profile on profile.id = source.owner_id
      where source.id = p_item_id
        and source.visibility = 'public'
        and source.archived_at is null
        and source.owner_id <> caller_id
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
        caller_id,
        source.id,
        source.name || ' Copy',
        source.description,
        source.category,
        'private',
        source.structure,
        source.schema_version,
        coalesce(nullif(profile.display_name, ''), 'LaneLink Coach'),
        coalesce(profile.organization, '')
      from public.set_pieces source
      left join public.profiles profile on profile.id = source.owner_id
      where source.id = p_item_id
        and source.visibility = 'public'
        and source.archived_at is null
        and source.owner_id <> caller_id
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

revoke all on function public.duplicate_public_library_item(text, uuid)
from public;
grant execute on function public.duplicate_public_library_item(text, uuid)
to authenticated;

commit;
