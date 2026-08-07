-- MTB Skills -- Phase 3.x -- practice + attendance backend tables.
--
-- Brings the frontend-only practice/attendance model (src/storage.js:
-- findTodaysPractice/createPractice/endPractice/reopenPractice/savePractice
-- /getPractices, toggleAttendance/getAttendance/getAttendanceStatus) into
-- the backend so a coach's practice sessions and who showed up become
-- visible to their HC/TD and league staff the same way observation
-- (0001_schema.sql/0002_rls.sql) already is. RLS below mirrors
-- observation's team-visibility model EXACTLY -- no new scoping is
-- invented (see the "RLS" section below).
--
-- practice -- one row per practice session. ride_group_id is nullable: a
-- team-wide practice (HC/TD-run, no single ride group) has NULL here; a
-- ride-group-scoped practice (the common "my group's practice" case)
-- carries that group's id. team_id is required on every row either way --
-- same denormalization rationale as observation (0001_schema.sql's
-- header): RLS filters on team_id/ride_group_id directly rather than
-- re-deriving via a join at query time.
--
-- attendance -- one row per (practice, person); unique index enforces at
-- most one attendance record per person per practice, which is also the
-- LWW upsert target the backend writes through (`on conflict (practice_id,
-- person_id) do update ...`, see app/routes.py). team_id + ride_group_id
-- are ALSO denormalized here (not just derivable via practice_id) for the
-- same RLS-speed reason as observation, and because the authorizing scope
-- for an attendance row is the TARGET PERSON's own ride_group/team (mirrors
-- observation's athlete_id-keyed scoping, see app/routes.py's
-- _resolve_athlete_scope) -- which can legitimately differ from the parent
-- practice row's own ride_group_id (e.g. an HC marking a walk-up athlete
-- from a different group present at a practice).
--
-- Idempotency: `create table if not exists` with the full column list
-- inline is sufficient for "safe to re-apply" on a brand-new table (see
-- 0001_schema.sql's header); unique/plain indexes are `if not exists`;
-- policies are `drop policy if exists` then `create policy`, matching
-- 0002_rls.sql's idiom; the grants block is guarded the same way
-- 0003_grants.sql's is.

create table if not exists practice (
    id            uuid primary key default gen_random_uuid(),
    team_id       uuid not null references team(id),
    ride_group_id uuid references ride_group(id),
    session_date  date not null,
    status        text not null default 'active' check (status in ('active', 'ended')),
    created_by    uuid references person(id),
    created_at    timestamptz not null default now()
);
create index if not exists practice_team_date_idx on practice(team_id, session_date);

create table if not exists attendance (
    id            uuid primary key default gen_random_uuid(),
    practice_id   uuid not null references practice(id),
    person_id     uuid not null references person(id),
    team_id       uuid not null references team(id),
    ride_group_id uuid references ride_group(id),
    status        text not null default 'attending' check (status in ('attending', 'absent')),
    marked_by     uuid references person(id),
    marked_at     timestamptz not null default now()
);
-- One attendance row per person per practice -- the LWW upsert target
-- app/routes.py's POST /api/attendance writes through via
-- `on conflict (practice_id, person_id) do update ...`.
create unique index if not exists attendance_practice_person_uidx on attendance(practice_id, person_id);

-- ==========================================================================
-- RLS -- mirrors observation_select / observation_insert_ride_group_coach /
-- observation_update_ride_group_coach / observation_insert_hc /
-- observation_update_hc from 0002_rls.sql EXACTLY, table-for-table. No
-- DELETE policy on either table (same "append-only-leaning, no DELETE
-- policy" posture as observation/confirmed_level/ride_group/person). League
-- staff: SELECT only -- no write policy is defined for them, and RLS
-- default-denies writes for any role with no matching policy, same as
-- observation.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- practice
-- --------------------------------------------------------------------------
alter table practice enable row level security;

drop policy if exists practice_select on practice;
create policy practice_select on practice
for select
using (
    ride_group_id in (select app_caller_ride_group_ids())
    or team_id in (select app_caller_hc_team_ids())
    or team_id in (select app_caller_league_team_ids())
);

drop policy if exists practice_insert_ride_group_coach on practice;
drop policy if exists practice_update_ride_group_coach on practice;
-- Ride-group coach: insert/update only within their own group, and only
-- where the row's team_id actually matches that group's team (prevents a
-- caller from pairing their own ride_group_id with a spoofed team_id) --
-- same pin idiom as observation_insert_ride_group_coach. A practice with a
-- NULL ride_group_id (team-wide) can never satisfy this policy (NULL is
-- never `in` any set), which is intentional -- a plain ride-group coach
-- cannot create a team-wide practice; only HC/TD can, via the policy below.
create policy practice_insert_ride_group_coach on practice
for insert
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = practice.ride_group_id)
);

create policy practice_update_ride_group_coach on practice
for update
using (
    ride_group_id in (select app_caller_ride_group_ids())
)
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = practice.ride_group_id)
);

drop policy if exists practice_insert_hc on practice;
drop policy if exists practice_update_hc on practice;
-- HC/TD: insert/update anything in their team, including a NULL-ride_group
-- (team-wide) practice.
create policy practice_insert_hc on practice
for insert
with check (team_id in (select app_caller_hc_team_ids()));

create policy practice_update_hc on practice
for update
using (team_id in (select app_caller_hc_team_ids()))
with check (team_id in (select app_caller_hc_team_ids()));

-- --------------------------------------------------------------------------
-- attendance
-- --------------------------------------------------------------------------
alter table attendance enable row level security;

drop policy if exists attendance_select on attendance;
create policy attendance_select on attendance
for select
using (
    ride_group_id in (select app_caller_ride_group_ids())
    or team_id in (select app_caller_hc_team_ids())
    or team_id in (select app_caller_league_team_ids())
);

drop policy if exists attendance_insert_ride_group_coach on attendance;
drop policy if exists attendance_update_ride_group_coach on attendance;
create policy attendance_insert_ride_group_coach on attendance
for insert
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = attendance.ride_group_id)
);

create policy attendance_update_ride_group_coach on attendance
for update
using (
    ride_group_id in (select app_caller_ride_group_ids())
)
with check (
    ride_group_id in (select app_caller_ride_group_ids())
    and team_id = (select rg.team_id from ride_group rg where rg.id = attendance.ride_group_id)
);

drop policy if exists attendance_insert_hc on attendance;
drop policy if exists attendance_update_hc on attendance;
create policy attendance_insert_hc on attendance
for insert
with check (team_id in (select app_caller_hc_team_ids()));

create policy attendance_update_hc on attendance
for update
using (team_id in (select app_caller_hc_team_ids()))
with check (team_id in (select app_caller_hc_team_ids()));

-- ==========================================================================
-- Grants -- for the real Supabase `authenticated` role, same guarded style
-- as 0003_grants.sql (a no-op wherever `authenticated` doesn't exist). This
-- is a SEPARATE grant, not an edit to 0003_grants.sql itself (that
-- migration is not touched by this one) -- `practice`/`attendance` didn't
-- exist when 0003 ran, so their grant has to live in whichever later
-- migration creates them, here. scripts/db_test.sh's own
-- `grant ... on all tables in schema public to app_user` step (run after
-- every migration apply) separately covers the test-only `app_user` role
-- for these two new tables without any changes needed there.
-- ==========================================================================
do $$
begin
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        grant select, insert, update on practice   to authenticated;
        grant select, insert, update on attendance to authenticated;
    end if;
end
$$;
