-- MTB Skills -- Phase 3.0 -- Row-Level Security.
--
-- Implements the AuthZ matrix from docs/PHASE3_TEAM_VISIBILITY_PLAN.md,
-- "AuthZ -- Row-Level Security":
--
--   | Policy            | SELECT                          | INSERT/UPDATE                  |
--   |--------------------|----------------------------------|---------------------------------|
--   | Ride-group coach  | rows where ride_group_id = theirs | observations/confirmed_levels  |
--   |                    |                                  | for athletes in their own group |
--   | HC / TD           | rows where team_id = theirs       | anything in their team          |
--   | League staff      | rows where league_id = theirs     | none (read-only)                |
--   | Cross-team        | denied                            | denied                          |
--
-- This file assumes `auth.uid()` exists (Supabase provides it in prod; the
-- test-only shim at tests/db/setup_test_auth.sql defines a stand-in). It
-- does NOT define auth.uid() itself.
--
-- Idempotent: every `create policy` is preceded by `drop policy if exists`,
-- and helper functions use `create or replace function`.
--
-- ASSUMPTION (flagged for orchestrator review): person.team_id is NOT NULL
-- for every role including 'league_staff', but league staff conceptually
-- operate across an entire league, not one team. We treat a league_staff
-- person's team_id as an administrative anchor only, and derive their real
-- scope by expanding via team.league_id -> every team in that league. If
-- league staff should instead get a nullable team_id / a separate
-- `league_staff(person_id, league_id)` table, this policy needs to change
-- alongside the schema.

-- ==========================================================================
-- Helper functions -- SECURITY DEFINER so they can read person/auth_person/
-- team even though those tables have RLS enabled (avoids recursive-policy
-- evaluation: a policy on `person` cannot safely subquery `person` under its
-- own RLS). Each is STABLE (safe to call repeatedly within one statement)
-- and pins search_path to prevent search-path hijacking.
-- ==========================================================================

-- All person ids belonging to the calling auth user (a coach may have more
-- than one, per the plan's resolved "multi-team coaches" question).
create or replace function app_caller_person_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select ap.person_id
    from auth_person ap
    where ap.auth_user_id = auth.uid()
$$;

-- Ride groups the caller coaches directly (role='coach', own ride_group_id).
create or replace function app_caller_ride_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.ride_group_id
    from auth_person ap
    join person p on p.id = ap.person_id
    where ap.auth_user_id = auth.uid()
      and p.role = 'coach'
      and p.ride_group_id is not null
$$;

-- Teams the caller has full (HC/TD) authority over.
create or replace function app_caller_hc_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.team_id
    from auth_person ap
    join person p on p.id = ap.person_id
    where ap.auth_user_id = auth.uid()
      and p.role in ('head_coach','team_director')
$$;

-- Leagues the caller has league_staff standing in (via their anchor team).
create or replace function app_caller_league_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select t.league_id
    from auth_person ap
    join person p on p.id = ap.person_id
    join team t on t.id = p.team_id
    where ap.auth_user_id = auth.uid()
      and p.role = 'league_staff'
      and t.league_id is not null
$$;

-- team_id of any of the caller's own person rows -- i.e. "my team(s)",
-- regardless of role. NOTE: this is intentionally used ONLY for team/league
-- display visibility below (seeing your own team's/league's name), NEVER
-- for person/ride_group/observation/confirmed_level SELECT policies -- a
-- plain ride-group coach's own team_id must NOT grant them visibility into
-- the rest of their team's groups/rosters/observations. (An earlier draft
-- of this migration made exactly that mistake by reusing one "readable
-- team ids" helper everywhere; the RLS test suite in tests/db/test_rls.py
-- caught it -- see test_ride_group_coach_cannot_see_other_group_in_same_team.)
create or replace function app_caller_own_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select p.team_id
    from auth_person ap
    join person p on p.id = ap.person_id
    where ap.auth_user_id = auth.uid()
$$;

-- Every team_id reachable via league-staff read-only expansion (every team
-- in a league the caller has league_staff standing in). Safe to OR into
-- person/ride_group/observation/confirmed_level SELECT policies because no
-- INSERT/UPDATE policy anywhere grants league_staff a matching write --
-- this helper's use is read-only by construction of the policy set, not by
-- anything enforced inside the helper itself.
create or replace function app_caller_league_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select t.id
    from team t
    where t.league_id in (select app_caller_league_ids())
$$;

grant execute on function app_caller_person_ids() to public;
grant execute on function app_caller_ride_group_ids() to public;
grant execute on function app_caller_hc_team_ids() to public;
grant execute on function app_caller_league_ids() to public;
grant execute on function app_caller_own_team_ids() to public;
grant execute on function app_caller_league_team_ids() to public;

-- ==========================================================================
-- league
-- ==========================================================================
alter table league enable row level security;

drop policy if exists league_select on league;
-- Matrix: any of the three roles can read the league(s) reachable through
-- their own team, or (league staff) their league-staff league directly
-- (used for display, e.g. showing a league name in the UI -- this does NOT
-- grant visibility into another team's rosters/observations, see the
-- ride_group/person/observation/confirmed_level policies below).
create policy league_select on league
for select
using (
    id in (select t.league_id from team t where t.id in (select app_caller_own_team_ids()))
    or id in (select app_caller_league_ids())
);

-- No write policy: league provisioning is out of scope for coach-facing
-- RLS roles (admin/service_role only, outside this policy set) -- default
-- deny once RLS is enabled covers this.

-- ==========================================================================
-- team
-- ==========================================================================
alter table team enable row level security;

drop policy if exists team_select on team;
-- Matrix: own team (any role, via app_caller_own_team_ids() -- HC/TD's own
-- person row already has team_id set, so a separate hc_team_ids() clause
-- would be redundant here), or any team in a league the caller has
-- league_staff standing in.
create policy team_select on team
for select
using (
    id in (select app_caller_own_team_ids())
    or id in (select app_caller_league_team_ids())
);

-- No write policy: team provisioning is admin/service_role only.

-- ==========================================================================
-- ride_group
-- ==========================================================================
alter table ride_group enable row level security;

drop policy if exists ride_group_select on ride_group;
-- Matrix: ride-group coach sees their own group; HC/TD sees every group in
-- their team; league staff sees every group across their league (read-only).
create policy ride_group_select on ride_group
for select
using (
    id in (select app_caller_ride_group_ids())
    or team_id in (select app_caller_hc_team_ids())
    or team_id in (select app_caller_league_team_ids())
);

drop policy if exists ride_group_insert on ride_group;
drop policy if exists ride_group_update on ride_group;
-- Matrix: only HC/TD manage ride groups (create/reassign) -- a ride-group
-- lead can only "recommend" a move per the plan doc, never execute one.
-- INSERT/UPDATE only (no DELETE policy): matches the matrix's "write" verbs
-- and keeps the pilot's data model append-only-leaning; deleting a ride
-- group is an out-of-scope admin action for now, not an RLS-granted one.
create policy ride_group_insert on ride_group
for insert
with check (team_id in (select app_caller_hc_team_ids()));

create policy ride_group_update on ride_group
for update
using (team_id in (select app_caller_hc_team_ids()))
with check (team_id in (select app_caller_hc_team_ids()));

-- ==========================================================================
-- person
-- ==========================================================================
alter table person enable row level security;

drop policy if exists person_select on person;
-- Matrix: ride-group coach sees people in their own group (including
-- fellow coaches and athletes); HC/TD sees everyone on their team; league
-- staff sees everyone across their league (read-only). A caller can also
-- always see their own person row (covers HC/TD/league_staff rows whose
-- ride_group_id is null and who might not otherwise match).
create policy person_select on person
for select
using (
    id in (select app_caller_person_ids())
    or ride_group_id in (select app_caller_ride_group_ids())
    or team_id in (select app_caller_hc_team_ids())
    or team_id in (select app_caller_league_team_ids())
);

drop policy if exists person_insert on person;
drop policy if exists person_update on person;
-- Matrix: roster management (add/edit coaches & athletes, assign ride
-- groups) is HC/TD-only, matching the plan doc's "HC dashboard -- Roster
-- management" feature. Ride-group coaches do not write person rows.
-- INSERT/UPDATE only -- no DELETE policy (see ride_group note above).
create policy person_insert on person
for insert
with check (team_id in (select app_caller_hc_team_ids()));

create policy person_update on person
for update
using (team_id in (select app_caller_hc_team_ids()))
with check (team_id in (select app_caller_hc_team_ids()));

-- ==========================================================================
-- observation
-- ==========================================================================
alter table observation enable row level security;

drop policy if exists observation_select on observation;
create policy observation_select on observation
for select
using (
    ride_group_id in (select app_caller_ride_group_ids())
    or team_id in (select app_caller_hc_team_ids())
    or team_id in (select app_caller_league_team_ids())
);

drop policy if exists observation_insert_ride_group_coach on observation;
drop policy if exists observation_update_ride_group_coach on observation;
-- Ride-group coach: insert/update only within their own group, and only
-- where the row's team_id actually matches that group's team (prevents a
-- caller from pairing their own ride_group_id with a spoofed team_id).
-- INSERT/UPDATE only -- observations are append-only by design (plan doc:
-- "Append-only, no conflict"); no DELETE policy is granted here.
create policy observation_insert_ride_group_coach on observation
for insert
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = observation.ride_group_id)
);

create policy observation_update_ride_group_coach on observation
for update
using (
    ride_group_id in (select app_caller_ride_group_ids())
)
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = observation.ride_group_id)
);

drop policy if exists observation_insert_hc on observation;
drop policy if exists observation_update_hc on observation;
-- HC/TD: insert/update anything in their team.
create policy observation_insert_hc on observation
for insert
with check (team_id in (select app_caller_hc_team_ids()));

create policy observation_update_hc on observation
for update
using (team_id in (select app_caller_hc_team_ids()))
with check (team_id in (select app_caller_hc_team_ids()));

-- League staff: SELECT only -- no write policy is defined for them, and RLS
-- default-denies writes for any role with no matching policy.

-- ==========================================================================
-- confirmed_level
-- ==========================================================================
alter table confirmed_level enable row level security;

drop policy if exists confirmed_level_select on confirmed_level;
create policy confirmed_level_select on confirmed_level
for select
using (
    ride_group_id in (select app_caller_ride_group_ids())
    or team_id in (select app_caller_hc_team_ids())
    or team_id in (select app_caller_league_team_ids())
);

drop policy if exists confirmed_level_insert_ride_group_coach on confirmed_level;
drop policy if exists confirmed_level_update_ride_group_coach on confirmed_level;
create policy confirmed_level_insert_ride_group_coach on confirmed_level
for insert
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = confirmed_level.ride_group_id)
);

create policy confirmed_level_update_ride_group_coach on confirmed_level
for update
using (
    ride_group_id in (select app_caller_ride_group_ids())
)
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = confirmed_level.ride_group_id)
);

drop policy if exists confirmed_level_insert_hc on confirmed_level;
drop policy if exists confirmed_level_update_hc on confirmed_level;
create policy confirmed_level_insert_hc on confirmed_level
for insert
with check (team_id in (select app_caller_hc_team_ids()));

create policy confirmed_level_update_hc on confirmed_level
for update
using (team_id in (select app_caller_hc_team_ids()))
with check (team_id in (select app_caller_hc_team_ids()));

-- League staff: SELECT only, same as observation.
