begin;

create extension if not exists pg_trgm;

create index sets_public_search_idx
  on public.sets using gin (
    (lower(name || ' ' || description || ' ' || structure::text)) gin_trgm_ops
  )
  where visibility = 'public' and archived_at is null;

create index set_pieces_public_search_idx
  on public.set_pieces using gin (
    (lower(name || ' ' || description || ' ' || category || ' ' || structure::text)) gin_trgm_ops
  )
  where visibility = 'public' and archived_at is null;

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
security invoker
set search_path = public
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
      profile.display_name as creator_display_name,
      profile.organization as creator_organization,
      (
        item.owner_id = (select auth.uid())
        or (
          item.item_type = 'set'
          and exists (
            select 1 from public.saved_sets saved
            where saved.coach_id = (select auth.uid())
              and saved.set_id = item.id
          )
        )
        or (
          item.item_type = 'piece'
          and exists (
            select 1 from public.saved_pieces saved
            where saved.coach_id = (select auth.uid())
              and saved.piece_id = item.id
          )
        )
      ) as in_collection
    from public_items item
    join public.public_profiles profile on profile.id = item.owner_id
    where (select auth.uid()) is not null
      and (
        coalesce(btrim(p_query), '') = ''
        or lower(item.name || ' ' || item.description || ' ' || coalesce(item.category, '') || ' ' || item.structure::text)
          like '%' || lower(btrim(p_query)) || '%'
      )
      and (
        coalesce(btrim(p_stroke), '') = ''
        or lower(item.structure::text) like '%"stroke": "' || lower(btrim(p_stroke)) || '"%'
      )
      and (
        p_distance is null
        or item.structure::text like '%"distance": ' || p_distance::text || '%'
      )
      and (
        coalesce(btrim(p_goal), '') = ''
        or lower(item.structure::text) like '%"goal": "' || lower(btrim(p_goal)) || '"%'
      )
      and (
        coalesce(btrim(p_equipment), '') = ''
        or lower(item.structure::text) like '%"' || lower(btrim(p_equipment)) || '"%'
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

comment on function public.search_public_library(
  text, text, text, integer, text, text, text, integer, integer
) is
  'Authenticated, paginated public-library search. Returns only explicitly public active content and public creator profile fields.';

revoke all on function public.search_public_library(
  text, text, text, integer, text, text, text, integer, integer
) from public;
grant execute on function public.search_public_library(
  text, text, text, integer, text, text, text, integer, integer
) to authenticated;

commit;
