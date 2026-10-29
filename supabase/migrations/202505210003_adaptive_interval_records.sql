begin;

create table public.swimmers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_id text,
  name text not null,
  external_identifier text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swimmers_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.swimmers is
  'Coach-owned swimmer identities used by adaptive interval performance records.';

create unique index swimmers_owner_legacy_id_unique
  on public.swimmers(owner_id, legacy_id)
  where legacy_id is not null;
create index swimmers_owner_name_idx
  on public.swimmers(owner_id, lower(name));

create trigger swimmers_set_updated_at
before update on public.swimmers
for each row execute function public.set_updated_at();

create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  swimmer_id uuid not null references public.swimmers(id) on delete cascade,
  legacy_id text,
  event_distance integer not null,
  stroke text not null,
  course text not null,
  time_seconds numeric(10, 3) not null,
  recorded_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint performance_records_distance_positive
    check (event_distance > 0),
  constraint performance_records_time_positive
    check (time_seconds > 0),
  constraint performance_records_course_valid
    check (course in ('SCY', 'SCM', 'LCM')),
  constraint performance_records_stroke_valid check (
    stroke in (
      'freestyle',
      'backstroke',
      'breaststroke',
      'butterfly',
      'individual medley',
      'kick',
      'pull',
      'other'
    )
  )
);

comment on table public.performance_records is
  'Measured swimmer performances. Estimated working times and recommendations remain derived SetPiece snapshot data.';

create unique index performance_records_owner_legacy_id_unique
  on public.performance_records(owner_id, legacy_id)
  where legacy_id is not null;
create index performance_records_owner_swimmer_idx
  on public.performance_records(owner_id, swimmer_id);
create index performance_records_match_idx
  on public.performance_records(owner_id, course, stroke, event_distance);

create trigger performance_records_set_updated_at
before update on public.performance_records
for each row execute function public.set_updated_at();

commit;
