begin;

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  source_set_id uuid references public.sets(id) on delete set null,
  name text not null,
  description text not null default '',
  visibility public.item_visibility not null default 'private',
  structure jsonb not null,
  schema_version integer not null default 1,
  planned_for date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sets_name_not_blank check (length(btrim(name)) > 0),
  constraint sets_schema_version_positive check (schema_version > 0),
  constraint sets_structure_object check (jsonb_typeof(structure) = 'object'),
  constraint sets_structure_has_sections check (
    structure ? 'sections'
    and jsonb_typeof(structure -> 'sections') = 'array'
  )
);

comment on table public.sets is
  'Original coach-owned workouts. structure stores the versioned Workout snapshot, including ordered sections, nested set pieces, circuits, and adaptive interval settings.';
comment on column public.sets.source_set_id is
  'Optional provenance for an independent copy. The copied row has its own owner and structure and does not track future source changes.';
comment on column public.sets.legacy_id is
  'Original browser-local ID used for idempotent migration from localStorage.';

create unique index sets_owner_legacy_id_unique
  on public.sets(owner_id, legacy_id)
  where legacy_id is not null;
create index sets_owner_updated_at_idx
  on public.sets(owner_id, updated_at desc);
create index sets_public_updated_at_idx
  on public.sets(updated_at desc)
  where visibility = 'public' and archived_at is null;
create index sets_source_set_id_idx
  on public.sets(source_set_id)
  where source_set_id is not null;
create index sets_structure_gin_idx
  on public.sets using gin(structure jsonb_path_ops);

create trigger sets_set_updated_at
before update on public.sets
for each row execute function public.set_updated_at();

create table public.set_pieces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  source_piece_id uuid references public.set_pieces(id) on delete set null,
  name text not null,
  description text not null default '',
  category text not null,
  visibility public.item_visibility not null default 'private',
  structure jsonb not null,
  schema_version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint set_pieces_name_not_blank check (length(btrim(name)) > 0),
  constraint set_pieces_schema_version_positive check (schema_version > 0),
  constraint set_pieces_structure_object
    check (jsonb_typeof(structure) = 'object'),
  constraint set_pieces_category_valid check (
    category in (
      'Warmup',
      'Drill',
      'Main Set',
      'Kick',
      'Pull',
      'Sprint',
      'Cooldown'
    )
  )
);

comment on table public.set_pieces is
  'Reusable SetPiece templates. structure preserves standard sets, repeated groups, circuits, nested children, rests, import metadata, and adaptive interval configuration.';
comment on column public.set_pieces.source_piece_id is
  'Optional provenance for an independent copy. Editing the copy never mutates the source template.';

create unique index set_pieces_owner_legacy_id_unique
  on public.set_pieces(owner_id, legacy_id)
  where legacy_id is not null;
create index set_pieces_owner_updated_at_idx
  on public.set_pieces(owner_id, updated_at desc);
create index set_pieces_owner_category_idx
  on public.set_pieces(owner_id, category);
create index set_pieces_public_updated_at_idx
  on public.set_pieces(updated_at desc)
  where visibility = 'public' and archived_at is null;
create index set_pieces_source_piece_id_idx
  on public.set_pieces(source_piece_id)
  where source_piece_id is not null;
create index set_pieces_structure_gin_idx
  on public.set_pieces using gin(structure jsonb_path_ops);

create trigger set_pieces_set_updated_at
before update on public.set_pieces
for each row execute function public.set_updated_at();

create table public.saved_sets (
  coach_id uuid not null references auth.users(id) on delete cascade,
  set_id uuid not null references public.sets(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (coach_id, set_id)
);

comment on table public.saved_sets is
  'A coach bookmark to another creator''s public set. It remains a reference, not an independent copy.';

create index saved_sets_set_id_idx on public.saved_sets(set_id);

create table public.saved_pieces (
  coach_id uuid not null references auth.users(id) on delete cascade,
  piece_id uuid not null references public.set_pieces(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (coach_id, piece_id)
);

comment on table public.saved_pieces is
  'A coach bookmark to another creator''s public piece. Create a new set_pieces row with source_piece_id for an independent editable copy.';

create index saved_pieces_piece_id_idx on public.saved_pieces(piece_id);

commit;
