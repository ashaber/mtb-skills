-- MTB Skills -- Phase 3.x -- ride-group coach may add an athlete to their
-- own group (walk-up SA / one-time-waiver record).
--
-- docs/PHASE3_RECONCILIATION_PLAN.md, decision (a): "a ride-group coach may
-- add an athlete (walk-up SA / one-time waiver) to their own group." Before
-- this migration, supabase/migrations/0002_rls.sql's `person_insert` policy
-- is HC/TD-only -- a plain ride-group coach could not add ANY person row,
-- including an athlete showing up to their own practice unannounced. This
-- migration adds a SECOND, narrower INSERT policy alongside the existing
-- one. RLS INSERT policies are OR'd together (Postgres allows a write if
-- ANY policy on the table permits it), so this is purely additive -- a
-- ride-group coach gains exactly one new capability: inserting a
-- `role = 'athlete'` person into a ride_group they coach. It does NOT
-- touch, replace, or weaken `person_insert` -- HC/TD keep their existing
-- team-wide insert/update authority completely unchanged, and this policy
-- grants a plain coach nothing beyond athlete rows in their own group (they
-- still cannot insert a `coach`/`head_coach`/`team_director`/`league_staff`
-- row via this policy, and still cannot insert into a ride_group they don't
-- coach -- app_caller_ride_group_ids() only returns groups where the caller
-- is the `role = 'coach'` occupant, per 0002_rls.sql).
--
-- team_id is pinned via a subquery against the target ride_group row,
-- mirroring the existing observation_insert_ride_group_coach / confirmed_
-- level_insert_ride_group_coach idiom already in 0002_rls.sql (both pin
-- `team_id = (select rg.team_id from ride_group rg where rg.id = ...)`).
-- Without this, a caller could pair a ride_group_id they coach with an
-- unrelated team_id in the same INSERT and produce a person row whose
-- team_id and ride_group_id disagree. app/routes.py's POST /api/athletes
-- always derives team_id server-side from the ride_group row itself, so
-- this can't happen through the app's own API today -- the pin is defense
-- in depth for any other caller of this policy (e.g. a direct
-- PostgREST/Supabase client hitting the table without going through the
-- backend at all).
--
-- No UPDATE/DELETE grant here -- a ride-group coach can add a walk-up
-- athlete but cannot edit/reassign/remove person rows (that remains HC/TD-
-- only via the existing `person_update` policy; no `person_delete` policy
-- exists for anyone, matching 0002_rls.sql's "no DELETE policy" note for
-- ride_group/person/observation/confirmed_level generally).
--
-- Idempotent: `drop policy if exists` then `create policy`.

drop policy if exists person_insert_athlete_own_group on person;
create policy person_insert_athlete_own_group on person
for insert
with check (
    role = 'athlete'
    and ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = person.ride_group_id)
);
