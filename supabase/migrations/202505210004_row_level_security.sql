begin;

alter table public.profiles enable row level security;
alter table public.sets enable row level security;
alter table public.set_pieces enable row level security;
alter table public.saved_sets enable row level security;
alter table public.saved_pieces enable row level security;
alter table public.swimmers enable row level security;
alter table public.performance_records enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()));

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "sets_select_owned_or_public"
on public.sets
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (visibility = 'public' and archived_at is null)
);

create policy "sets_insert_owned"
on public.sets
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "sets_update_owned"
on public.sets
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "sets_delete_owned"
on public.sets
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "set_pieces_select_owned_or_public"
on public.set_pieces
for select
to authenticated
using (
  owner_id = (select auth.uid())
  or (visibility = 'public' and archived_at is null)
);

create policy "set_pieces_insert_owned"
on public.set_pieces
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "set_pieces_update_owned"
on public.set_pieces
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "set_pieces_delete_owned"
on public.set_pieces
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "saved_sets_select_own"
on public.saved_sets
for select
to authenticated
using (coach_id = (select auth.uid()));

create policy "saved_sets_insert_public_reference"
on public.saved_sets
for insert
to authenticated
with check (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.sets source_set
    where source_set.id = set_id
      and source_set.visibility = 'public'
      and source_set.archived_at is null
  )
);

create policy "saved_sets_delete_own"
on public.saved_sets
for delete
to authenticated
using (coach_id = (select auth.uid()));

create policy "saved_pieces_select_own"
on public.saved_pieces
for select
to authenticated
using (coach_id = (select auth.uid()));

create policy "saved_pieces_insert_public_reference"
on public.saved_pieces
for insert
to authenticated
with check (
  coach_id = (select auth.uid())
  and exists (
    select 1
    from public.set_pieces source_piece
    where source_piece.id = piece_id
      and source_piece.visibility = 'public'
      and source_piece.archived_at is null
  )
);

create policy "saved_pieces_delete_own"
on public.saved_pieces
for delete
to authenticated
using (coach_id = (select auth.uid()));

create policy "swimmers_select_own"
on public.swimmers
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "swimmers_insert_own"
on public.swimmers
for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "swimmers_update_own"
on public.swimmers
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "swimmers_delete_own"
on public.swimmers
for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "performance_records_select_own"
on public.performance_records
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy "performance_records_insert_own"
on public.performance_records
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.swimmers swimmer
    where swimmer.id = swimmer_id
      and swimmer.owner_id = (select auth.uid())
  )
);

create policy "performance_records_update_own"
on public.performance_records
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.swimmers swimmer
    where swimmer.id = swimmer_id
      and swimmer.owner_id = (select auth.uid())
  )
);

create policy "performance_records_delete_own"
on public.performance_records
for delete
to authenticated
using (owner_id = (select auth.uid()));

grant usage on schema public to authenticated;

grant select, insert, update, delete
on public.profiles,
   public.sets,
   public.set_pieces,
   public.saved_sets,
   public.saved_pieces,
   public.swimmers,
   public.performance_records
to authenticated;

commit;
