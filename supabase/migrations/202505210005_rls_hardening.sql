begin;

-- Expose only non-sensitive profile directory fields. The underlying profiles
-- table remains owner-only, including its preferences column.
create view public.public_profiles
with (security_barrier = true)
as
select
  id,
  display_name,
  organization
from public.profiles;

comment on view public.public_profiles is
  'Read-only coach directory exposing display name and organization only. No credentials or private preferences are included.';

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to authenticated;

-- Profiles are created by the auth.users trigger. Clients may only read and
-- update their own row; they cannot insert or delete profile identities.
revoke insert, delete on public.profiles from authenticated;

-- Saved relationships are immutable bookmarks. A coach can insert or delete
-- their own bookmark, but cannot update it into another relationship.
revoke update on public.saved_sets, public.saved_pieces from authenticated;

-- A saved relationship is visible only while the source remains explicitly
-- public and active. This prevents a previously saved UUID from becoming an
-- alternate read path to a private item.
drop policy "saved_sets_select_own" on public.saved_sets;
create policy "saved_sets_select_own_public_source"
on public.saved_sets
for select
to authenticated
using (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.sets source_set
    where source_set.id = set_id
      and source_set.visibility = 'public'
      and source_set.archived_at is null
  )
);

drop policy "saved_pieces_select_own" on public.saved_pieces;
create policy "saved_pieces_select_own_public_source"
on public.saved_pieces
for select
to authenticated
using (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.set_pieces source_piece
    where source_piece.id = piece_id
      and source_piece.visibility = 'public'
      and source_piece.archived_at is null
  )
);

-- Remove bookmarks when an owner makes an item private or archives it. These
-- trigger functions must be security definer because bookmark rows belong to
-- other coaches and are intentionally protected by RLS.
create or replace function public.remove_saved_set_references_when_unpublished()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility <> 'public' or new.archived_at is not null then
    delete from public.saved_sets where set_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.remove_saved_set_references_when_unpublished()
from public;

create trigger sets_remove_saved_references_when_unpublished
after update of visibility, archived_at on public.sets
for each row
when (
  old.visibility is distinct from new.visibility
  or old.archived_at is distinct from new.archived_at
)
execute function public.remove_saved_set_references_when_unpublished();

create or replace function public.remove_saved_piece_references_when_unpublished()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visibility <> 'public' or new.archived_at is not null then
    delete from public.saved_pieces where piece_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.remove_saved_piece_references_when_unpublished()
from public;

create trigger set_pieces_remove_saved_references_when_unpublished
after update of visibility, archived_at on public.set_pieces
for each row
when (
  old.visibility is distinct from new.visibility
  or old.archived_at is distinct from new.archived_at
)
execute function public.remove_saved_piece_references_when_unpublished();

commit;
