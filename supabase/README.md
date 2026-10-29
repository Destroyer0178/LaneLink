# LaneLink Supabase schema

These migrations are version-controlled schema definitions only. No Supabase
project is currently connected, and the migrations have not been applied to a
live database.

## Schema strategy

- `sets.structure` stores a versioned snapshot compatible with the existing
  `Workout` interface.
- `set_pieces.structure` stores a versioned snapshot compatible with the
  recursive `SetPiece` interface.
- Circuits, repeated rounds, ordered nested children, between-round recovery,
  rest instructions, import metadata, and adaptive interval recommendations
  stay inside the JSONB snapshot. This avoids flattening or losing existing
  fields.
- `saved_sets` and `saved_pieces` are bookmarks to a creator's public item.
- An independent editable copy is a new `sets` or `set_pieces` row whose
  `source_set_id` or `source_piece_id` records provenance.
- `legacy_id` supports idempotent migration of existing browser-local IDs.
- Swimmers and measured performance records are normalized because they are
  reused and queried independently by the adaptive interval engine.
- Passwords and login credentials remain exclusively in Supabase Auth.

No tag tables are included because the current application has categories but
does not have a tag model. Tags can be added later with additive junction tables
without changing the JSONB snapshots.

## Apply to a Supabase project

Install the Supabase CLI using the official Supabase instructions, then run:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`YOUR_PROJECT_REF` must come from your own Supabase project. Do not put database
passwords or service-role keys in the frontend repository.

To validate locally before applying remotely:

```sh
supabase start
supabase db reset
```

`supabase db reset` is destructive and should only be used against the local
Supabase development database. Do not run it against a production database.

Alternatively, review and apply the migration files in timestamp order through
the Supabase SQL editor:

1. `202505210001_core_profiles.sql`
2. `202505210002_workout_content.sql`
3. `202505210003_adaptive_interval_records.sql`
4. `202505210004_row_level_security.sql`

## Preserving existing LaneLink data

The migrations only create new database objects; they do not read, delete, or
overwrite browser `localStorage`.

A later application migration should:

1. Read the existing `swimflow-workouts`, `swimflow-pieces`, and
   `swimflow-performance-records` keys after the coach authenticates.
2. Upsert top-level records using `(owner_id, legacy_id)`.
3. Preserve the complete recursive JSON snapshots and their nested local IDs.
4. Verify server counts or checksums.
5. Keep local data until the coach confirms the server copy is complete.
