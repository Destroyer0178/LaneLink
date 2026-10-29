# LaneLink Supabase schema

These migrations are version-controlled schema definitions. The frontend uses
the project supplied through its public environment variables, but migration
application to a live project is not verifiable from this repository alone.

Authentication setup is documented in `supabase/AUTH_SETUP.md`.

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
5. `202505210005_rls_hardening.sql`
6. `202505210006_auth_profile_metadata.sql`

## Row Level Security

The RLS migrations enforce authorization in PostgreSQL rather than relying on
frontend checks:

- Coaches can select, insert, update, and delete only rows whose `owner_id`
  matches `auth.uid()`.
- Authenticated coaches can read public, non-archived sets and pieces.
- Public visibility never grants update or delete access to non-owners.
- Saved relationships are owner-only and can only target currently public,
  non-archived items.
- Making an item private or archiving it removes existing saved references.
- Direct profile-table access is owner-only. `public_profiles` exposes only
  `id`, `display_name`, and `organization`.
- Swimmers and measured performance records are private to their owning coach.

The application must use the authenticated Supabase client. Never place the
service-role key in frontend code or a `VITE_*` environment variable.

## Database policy tests

The pgTAP tests are in:

```text
supabase/tests/database/rls_policies.test.sql
```

After installing the Supabase CLI and starting the local stack, run:

```sh
supabase start
supabase db reset
supabase test db
```

The test transaction verifies owner access, public reads, private-ID
protection, owner spoofing prevention, cross-coach write protection, profile
field exposure, saved relationship ownership, adaptive-record privacy, and
public-to-private cleanup.

## Preserving existing LaneLink data

The migrations only create new database objects; they do not read, delete, or
overwrite browser `localStorage`.

After authentication, the application detects existing `swimflow-workouts` and
`swimflow-pieces` records and offers an explicit import into the current coach
account. The import:

1. Requires the coach to choose **Import local data**, avoiding silent
   assignment of shared-browser records to the wrong account.
2. Checks `(owner_id, legacy_id)` before inserting and relies on the unique
   indexes to make retries idempotent.
3. Preserves the complete recursive JSON snapshots and nested local IDs.
4. Reloads the resulting rows from Supabase.
5. Keeps the local records as a backup.

Performance records remain in local storage and require a separate migration
to the normalized swimmer and performance-record tables.

## Frontend repository verification

`src/data/contentRepository.live.test.ts` exercises create, edit, reload,
search, duplicate, and delete against a real authenticated Supabase project.
Use a disposable non-production coach account:

```sh
SUPABASE_TEST_EMAIL=test-coach@example.com \
SUPABASE_TEST_PASSWORD='test-account-password' \
pnpm test src/data/contentRepository.live.test.ts
```

The test is skipped unless the public Supabase environment variables and both
test-account variables are available. It uses the public client and the signed
in test user, never a service-role key.
