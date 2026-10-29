# LaneLink Supabase Auth setup

The frontend authentication flow is implemented with
`@supabase/supabase-js`, but it must be paired with a configured Supabase
project and the versioned database migrations.

## Required frontend environment variables

Copy `.env.example` to `.env.local` for local development:

```sh
cp .env.example .env.local
```

Set:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Find both in Supabase Dashboard → Project Settings → API. Projects that still
show legacy keys can use the public `anon` key as
`VITE_SUPABASE_PUBLISHABLE_KEY`.

The publishable/anon key is intended for browser use with RLS. Never put the
service-role key in a `VITE_*` variable or frontend source file.

## Apply database migrations

The profile creation trigger and RLS policies are required by the profile setup
flow:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Migration `202505210006_auth_profile_metadata.sql` updates the Auth trigger to
copy safe signup metadata into `profiles` and backfills profile rows for Auth
users that already exist.

## Supabase Dashboard settings

In Authentication → Providers:

1. Enable the Email provider.
2. Enable or disable Confirm email according to the desired environment.
   LaneLink supports both configurations.
3. Keep secure password requirements enabled. The frontend additionally
   requires at least eight characters.

In Authentication → URL Configuration:

1. Set Site URL to the deployed LaneLink origin.
2. Add the local preview/development URL to Redirect URLs.
3. Add every deployed preview or production origin that should accept email
   verification and password recovery callbacks.

LaneLink supplies the current Vite base URL as the signup and recovery redirect.
Supabase rejects callback URLs that are not allow-listed.

In Authentication → Email Templates:

- Review the Confirm signup template.
- Review the Reset password template.
- Ensure both templates use Supabase's generated confirmation URL.

## Implemented behavior

- Email/password registration
- Optional email confirmation
- Email/password login
- Persistent session restoration and token refresh
- Logout
- Password recovery email
- Recovery-link password update
- Coach profile setup and editing
- Protected access to the planner
- Missing-configuration, loading, success, validation, and error states

## Current scope

Authentication, personal sets, and reusable pieces use the authenticated
Supabase client. CRUD, search, duplication, imports, and reloads are backed by
the owner-scoped `sets` and `set_pieces` tables. Existing browser sets and
pieces can be imported explicitly and idempotently from the in-app migration
banner; the browser copy is retained.

Performance records still use browser `localStorage`. Moving those records to
the normalized swimmer and performance-record tables remains a separate
migration step.
