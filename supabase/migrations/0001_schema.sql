-- MTB Skills -- Phase 3.0 -- initial multi-tenant schema.
--
-- Org hierarchy: league -> team -> ride_group -> person (coach/athlete).
-- observation / confirmed_level carry a denormalized team_id + ride_group_id
-- (in addition to athlete_id/coach_id) purely for RLS-policy speed -- see
-- docs/PHASE3_TEAM_VISIBILITY_PLAN.md, "Proposed Phase-3 schema".
--
-- Idempotency: every statement is guarded (`create table if not exists`,
-- `create index if not exists`). `create table if not exists` with the full
-- column/constraint list inline is sufficient for "safe to re-apply" on a
-- brand-new table -- the whole statement is a no-op if the table already
-- exists. `alter table ... add column if not exists` is the idiom reserved
-- for LATER migrations that evolve one of these tables (e.g. a future
-- 0003_*.sql adding a column here) -- there is nothing to evolve yet in this
-- file, so it is not used below.
--
-- RLS is enabled and policy-guarded in 0002_rls.sql, not here.

create extension if not exists pgcrypto; -- gen_random_uuid()

-- --------------------------------------------------------------------------
-- league -- top of the org hierarchy. League staff (Phase 5 dashboard) read
-- across every team in their league; not otherwise used by the pilot UI yet.
-- --------------------------------------------------------------------------
create table if not exists league (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- team -- one per school/program. The multi-tenant boundary: every
-- observation/confirmed_level ultimately traces back to exactly one team_id.
-- --------------------------------------------------------------------------
create table if not exists team (
    id         uuid primary key default gen_random_uuid(),
    league_id  uuid references league(id),
    name       text not null,
    created_at timestamptz not null default now()
);
create index if not exists team_league_idx on team(league_id);

-- --------------------------------------------------------------------------
-- ride_group -- a team's sub-unit (e.g. "Group A"). lead_coach_id is
-- advisory metadata (not FK-enforced -- the coach's actual person row is
-- what RLS keys off of via person.ride_group_id).
-- --------------------------------------------------------------------------
create table if not exists ride_group (
    id             uuid primary key default gen_random_uuid(),
    team_id        uuid not null references team(id),
    name           text not null,
    lead_coach_id  uuid,
    created_at     timestamptz not null default now()
);
create index if not exists ride_group_team_idx on ride_group(team_id);

-- --------------------------------------------------------------------------
-- person -- every human the app knows about: coaches AND athletes, both
-- represented as rows here (athlete persons are data, never logins -- see
-- "Identity / person resolution" in the plan doc). ride_group_id is a
-- coach's *own* group when role='coach' (drives RLS scope) or an athlete's
-- home ride group. league_staff/head_coach/team_director rows normally
-- leave ride_group_id null.
-- --------------------------------------------------------------------------
create table if not exists person (
    id             uuid primary key default gen_random_uuid(),
    team_id        uuid not null references team(id),
    ride_group_id  uuid references ride_group(id),
    role           text not null check (role in ('league_staff','head_coach','team_director','coach','athlete')),
    name           text not null,
    external_id    text,
    created_at     timestamptz not null default now()
);
create index if not exists person_team_idx on person(team_id);
create index if not exists person_ride_group_idx on person(ride_group_id);
create index if not exists person_external_id_idx on person(external_id);

-- --------------------------------------------------------------------------
-- auth_person -- links a Supabase auth.users id to one or more person rows.
-- Many-to-many on purpose: a coach could (rarely) have more than one person
-- row (e.g. traveling TD across teams, additive-later per the plan's
-- resolved open question #6), and a login always resolves to a *coach*
-- persona (athlete persons never get a login / auth_user_id).
-- --------------------------------------------------------------------------
create table if not exists auth_person (
    auth_user_id  uuid not null,
    person_id     uuid not null references person(id),
    created_at    timestamptz not null default now(),
    primary key (auth_user_id, person_id)
);
create index if not exists auth_person_person_idx on auth_person(person_id);

-- --------------------------------------------------------------------------
-- observation -- a single skill observation logged during a practice.
-- team_id + ride_group_id are denormalized copies (not re-derived via joins
-- at read time) so RLS policies can filter on them directly and cheaply.
-- --------------------------------------------------------------------------
create table if not exists observation (
    id              uuid primary key default gen_random_uuid(),
    athlete_id      uuid not null references person(id),
    team_id         uuid not null references team(id),
    coach_id        uuid references person(id),
    ride_group_id   uuid references ride_group(id),
    session_date    date not null,
    skill           text not null check (skill in ('body_position','braking','cornering')),
    level_observed  int not null check (level_observed between 1 and 5),
    notes           text,
    created_at      timestamptz not null default now()
);
create index if not exists observation_team_idx on observation(team_id);
create index if not exists observation_ride_group_idx on observation(ride_group_id);
create index if not exists observation_athlete_idx on observation(athlete_id);

-- --------------------------------------------------------------------------
-- confirmed_level -- a coach-confirmed skill level for an athlete (distinct
-- from a raw observation). Same denormalization rationale as observation.
-- --------------------------------------------------------------------------
create table if not exists confirmed_level (
    id             uuid primary key default gen_random_uuid(),
    athlete_id     uuid not null references person(id),
    team_id        uuid not null references team(id),
    coach_id       uuid references person(id),
    ride_group_id  uuid references ride_group(id),
    skill          text not null check (skill in ('body_position','braking','cornering')),
    level          int not null check (level between 1 and 5),
    confirmed_at   timestamptz not null default now(),
    created_at     timestamptz not null default now()
);
create index if not exists confirmed_level_team_idx on confirmed_level(team_id);
create index if not exists confirmed_level_ride_group_idx on confirmed_level(ride_group_id);
create index if not exists confirmed_level_athlete_idx on confirmed_level(athlete_id);
