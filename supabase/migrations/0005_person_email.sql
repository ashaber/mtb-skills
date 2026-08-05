-- MTB Skills -- Phase 3.1 -- person.email (first-login onboarding).
--
-- docs/PHASE3_1_ONBOARDING.md: on first Google sign-in there is no
-- `auth_person` row linking the new Supabase `auth.users` `sub` to a coach
-- `person` yet -- something has to create that link. Design: a coach
-- `person` row's email IS the pre-authorization ("this email may sign in as
-- this coach"). This migration adds the column the bootstrap (app/
-- onboarding.py, via the RLS-bypassing app/db.py::service_connection) reads
-- to find that coach row by the JWT's verified `email` claim.
--
-- NOT unique, deliberately: athlete `person` rows may share a coach's
-- family PitZone email (a parent coach + their student athlete can carry
-- the same login email), and athlete rows may simply have no email at all
-- (they never log in -- see app/identity.py's COACH_ROLES exclusion). A
-- unique constraint here would reject legitimate seed/import data.
--
-- No RLS change needed: 0002_rls.sql's `person_select` policy already scopes
-- which `person` rows a caller can see (by their own team/ride-group
-- membership) -- `email` just rides along as an ordinary column on rows
-- already subject to that policy. The bootstrap path that actually reads
-- `email` cross-caller (to find an as-yet-unlinked coach) does NOT go
-- through RLS at all -- it uses `service_connection()`, a deliberate,
-- narrowly-scoped bypass (see app/db.py's docstring) -- so this migration
-- does not need to (and must not attempt to) carve out a policy allowing an
-- unauthenticated/unlinked caller to read other people's email by RLS.
--
-- Idempotent: `add column if not exists` / `create index if not exists`.

alter table person add column if not exists email text;

create index if not exists person_email_lower_idx on person (lower(email));
