-- MTB Skills -- Phase 3.1 -- RLS for auth_person.
--
-- Closes a least-privilege gap: 0002_rls.sql enabled RLS on the six domain
-- tables but NOT on auth_person, and 0003_grants.sql granted `authenticated`
-- SELECT on it. Net effect without this file: any logged-in user could read
-- the entire auth_user_id -> person_id mapping table. Low severity (UUIDs
-- only; `person` names stay RLS-protected) but unnecessary exposure.
--
-- A caller may see only their OWN mapping rows. Writes are default-denied
-- (no insert/update/delete policy): linking an auth account to a person is a
-- privileged onboarding operation performed via service_role / the backend,
-- never by an authenticated end user.
--
-- The security-definer app_caller_* helper functions in 0002 read auth_person
-- as the function OWNER, so they bypass this RLS -- persona resolution and
-- every existing policy that leans on those helpers are unaffected.
--
-- Idempotent: alter ... enable is a no-op if already enabled; the policy is
-- dropped-if-exists before create.

alter table auth_person enable row level security;

drop policy if exists auth_person_select_own on auth_person;
create policy auth_person_select_own on auth_person
for select
using (auth_user_id = auth.uid());
