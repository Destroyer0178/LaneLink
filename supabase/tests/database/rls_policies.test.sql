begin;

create extension if not exists pgtap;

select plan(30);

create schema if not exists tests;

create or replace function tests.try_sql(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return true;
exception
  when others then
    return false;
end;
$$;

grant usage on schema tests to authenticated;
grant execute on function tests.try_sql(text) to authenticated;

-- Test identities. Passwords are managed by Supabase Auth; these rows only
-- create local test users inside the rolled-back pgTAP transaction.
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'coach-a@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Coach A"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-0000000000b2',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'coach-b@example.test',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Coach B"}'::jsonb,
    now(),
    now()
  );

insert into public.sets (
  id,
  owner_id,
  name,
  visibility,
  structure
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1',
    'Coach A Private Set',
    'private',
    '{"sections":[]}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-0000000000a1',
    'Coach A Public Set',
    'public',
    '{"sections":[]}'::jsonb
  );

insert into public.set_pieces (
  id,
  owner_id,
  name,
  category,
  visibility,
  structure
)
values
  (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1',
    'Coach A Private Piece',
    'Main Set',
    'private',
    '{"id":"private-piece","name":"Private","category":"Main Set","instructions":"4 x 100","repeats":4,"distance":100}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-0000000000a1',
    'Coach A Public Piece',
    'Main Set',
    'public',
    '{"id":"public-piece","name":"Public","category":"Main Set","instructions":"4 x 100","repeats":4,"distance":100}'::jsonb
  );

insert into public.swimmers (
  id,
  owner_id,
  name
)
values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  'Coach A Swimmer'
);

insert into public.performance_records (
  id,
  owner_id,
  swimmer_id,
  event_distance,
  stroke,
  course,
  time_seconds
)
values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1',
  '30000000-0000-0000-0000-000000000001',
  100,
  'freestyle',
  'SCY',
  60
);

insert into public.saved_sets (coach_id, set_id)
values (
  '00000000-0000-0000-0000-0000000000a1',
  '10000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::integer from public.sets where id = '10000000-0000-0000-0000-000000000001'$$,
  array[1],
  'an owner can read their private set'
);

select results_eq(
  $$select count(*)::integer from public.set_pieces where id = '20000000-0000-0000-0000-000000000001'$$,
  array[1],
  'an owner can read their private piece'
);

select ok(
  tests.try_sql(
    $$update public.sets set description = 'updated' where id = '10000000-0000-0000-0000-000000000001'$$
  ),
  'an owner can update their set'
);

select ok(
  tests.try_sql(
    $$update public.set_pieces set description = 'updated' where id = '20000000-0000-0000-0000-000000000001'$$
  ),
  'an owner can update their piece'
);

select ok(
  not tests.try_sql(
    $$insert into public.sets (owner_id, name, visibility, structure) values ('00000000-0000-0000-0000-0000000000b2', 'Spoofed', 'private', '{"sections":[]}'::jsonb)$$
  ),
  'a coach cannot insert a set owned by another user'
);

select ok(
  not tests.try_sql(
    $$insert into public.set_pieces (owner_id, name, category, visibility, structure) values ('00000000-0000-0000-0000-0000000000b2', 'Spoofed', 'Main Set', 'private', '{}'::jsonb)$$
  ),
  'a coach cannot insert a piece owned by another user'
);

select ok(
  not tests.try_sql(
    $$update public.sets set owner_id = '00000000-0000-0000-0000-0000000000b2' where id = '10000000-0000-0000-0000-000000000001'$$
  ),
  'a coach cannot transfer an owned set by changing owner_id'
);

select results_eq(
  $$select count(*)::integer from public.profiles$$,
  array[1],
  'direct profile access is limited to the current coach'
);

select results_eq(
  $$select count(*)::integer from public.public_profiles$$,
  array[2],
  'the public profile directory exposes both display names'
);

select hasnt_column(
  'public',
  'public_profiles',
  'preferences',
  'the public profile directory does not expose private preferences'
);

select results_eq(
  $$select count(*)::integer from public.swimmers$$,
  array[1],
  'a coach can read their own swimmers'
);

select results_eq(
  $$select count(*)::integer from public.performance_records$$,
  array[1],
  'a coach can read their own performance records'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::integer from public.sets where id = '10000000-0000-0000-0000-000000000001'$$,
  array[0],
  'another coach cannot read a private set even with its UUID'
);

select results_eq(
  $$select count(*)::integer from public.set_pieces where id = '20000000-0000-0000-0000-000000000001'$$,
  array[0],
  'another coach cannot read a private piece even with its UUID'
);

select results_eq(
  $$select count(*)::integer from public.sets where id = '10000000-0000-0000-0000-000000000002'$$,
  array[1],
  'an authenticated coach can read a public set'
);

select results_eq(
  $$select count(*)::integer from public.set_pieces where id = '20000000-0000-0000-0000-000000000002'$$,
  array[1],
  'an authenticated coach can read a public piece'
);

select results_eq(
  $$with changed as (
      update public.sets
      set name = 'unauthorized'
      where id = '10000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from changed$$,
  array[0],
  'another coach cannot edit a public set'
);

select results_eq(
  $$with removed as (
      delete from public.set_pieces
      where id = '20000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from removed$$,
  array[0],
  'another coach cannot delete a public piece'
);

select ok(
  tests.try_sql(
    $$insert into public.saved_sets (coach_id, set_id) values ('00000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000002')$$
  ),
  'a coach can save a public set'
);

select ok(
  tests.try_sql(
    $$insert into public.saved_pieces (coach_id, piece_id) values ('00000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-000000000002')$$
  ),
  'a coach can save a public piece'
);

select ok(
  not tests.try_sql(
    $$insert into public.saved_sets (coach_id, set_id) values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002')$$
  ),
  'a coach cannot create a saved relationship for another coach'
);

select ok(
  not tests.try_sql(
    $$insert into public.saved_pieces (coach_id, piece_id) values ('00000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-000000000001')$$
  ),
  'a coach cannot save a private piece'
);

select results_eq(
  $$select count(*)::integer from public.saved_sets$$,
  array[1],
  'a coach sees only their own valid saved set relationships'
);

select results_eq(
  $$with removed as (
      delete from public.saved_sets
      where coach_id = '00000000-0000-0000-0000-0000000000a1'
        and set_id = '10000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from removed$$,
  array[0],
  'a coach cannot remove another coach saved relationship'
);

select results_eq(
  $$with removed as (
      delete from public.saved_sets
      where coach_id = '00000000-0000-0000-0000-0000000000b2'
        and set_id = '10000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from removed$$,
  array[1],
  'a coach can remove their own saved set relationship'
);

insert into public.saved_sets (coach_id, set_id)
values (
  '00000000-0000-0000-0000-0000000000b2',
  '10000000-0000-0000-0000-000000000002'
);

select results_eq(
  $$with removed as (
      delete from public.saved_pieces
      where coach_id = '00000000-0000-0000-0000-0000000000b2'
        and piece_id = '20000000-0000-0000-0000-000000000002'
      returning 1
    )
    select count(*)::integer from removed$$,
  array[1],
  'a coach can remove their own saved piece relationship'
);

insert into public.saved_pieces (coach_id, piece_id)
values (
  '00000000-0000-0000-0000-0000000000b2',
  '20000000-0000-0000-0000-000000000002'
);

select results_eq(
  $$select count(*)::integer from public.swimmers$$,
  array[0],
  'another coach cannot read private swimmer records'
);

select results_eq(
  $$select count(*)::integer from public.performance_records$$,
  array[0],
  'another coach cannot read private performance records'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true
);

update public.sets
set visibility = 'private'
where id = '10000000-0000-0000-0000-000000000002';

update public.set_pieces
set visibility = 'private'
where id = '20000000-0000-0000-0000-000000000002';

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',
  true
);

select results_eq(
  $$select count(*)::integer from public.saved_sets where set_id = '10000000-0000-0000-0000-000000000002'$$,
  array[0],
  'making a set private removes and hides saved references'
);

select results_eq(
  $$select count(*)::integer from public.saved_pieces where piece_id = '20000000-0000-0000-0000-000000000002'$$,
  array[0],
  'making a piece private removes and hides saved references'
);

select * from finish();

rollback;
