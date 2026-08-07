-- MTB Skills -- Phase 3.x -- engagement (in-app usage-tracking pings).
--
-- Moves the `type:'engagement'` stream out of the Google Sheet (CLAUDE.md's
-- Phase 2 sheet-webhook path) and into this table. This is the LAST stream
-- still posting to the sheet (0011_feedback.sql already moved `type:
-- 'feedback'` submissions to the `feedback` table) -- once this migration's
-- backend endpoint and src/feedback.js's routing both ship, the sheet is
-- unused by this app entirely.
--
-- Access model -- RLS enabled, ZERO policies (deny-all), same as
-- 0011_feedback.sql -- read that migration's full access-model note; this
-- one repeats it with engagement-specific wording rather than pointing at
-- it, so this file stands alone:
--
--   There is no coach/athlete persona behind an engagement ping -- the
--   POST /api/engagement endpoint is intentionally ANONYMOUS (no JWT, no
--   Depends(get_caller); see backend/app/routes.py). With no verified
--   identity, there is no `auth.uid()` for any of 0002_rls.sql's
--   app_caller_*() helpers to key off of, so this table cannot reuse any of
--   that policy machinery -- and it shouldn't try to: nothing about an
--   engagement row should ever be selectable/writable by an ordinary
--   `authenticated` caller, coach or otherwise.
--
--   So: `enable row level security` with NO `create policy` at all. Under
--   Postgres RLS, "no policy matches" means deny -- for EVERY role that
--   isn't the table owner/a role with BYPASSRLS, every SELECT/INSERT/
--   UPDATE/DELETE is denied, full stop. That is exactly the access model
--   here: only `app.db.service_connection` (the same deliberate,
--   documented RLS-bypass app.onboarding already uses to link a coach's
--   first login, and that 0011_feedback.sql's endpoint also uses) writes
--   this table, running as the connecting owner/superuser role, which
--   bypasses RLS by Postgres's own design (same mechanism as `owner_conn`
--   in this repo's test fixtures). No `grant` to `authenticated` is issued
--   below, on purpose -- unlike 0003_grants.sql's tables, `authenticated`
--   gets no SQL-privilege foothold on `engagement` at all, so even a
--   coincidental future policy mistake here still can't be reached without
--   the privilege grant this migration deliberately withholds.
--
--   Practical effect: a coach's browser never talks to this table directly
--   (there's no Supabase anon/authenticated credential in play for
--   engagement at all -- the frontend calls the backend's anonymous REST
--   endpoint, which alone holds DATABASE_URL). Andrew reads pings with a
--   normal SQL client connected as the owner role -- there is no dev-facing
--   read API for this table and none is planned.
--
-- `user_name`/`league`/`team` are self-reported (from src/feedback.js's
-- feedback-session profile, reused for the engagement payload -- see that
-- module's `_flushEngagement`); may be blank/anonymous. `events` is the
-- raw client-tracked interaction log for the session chunk being flushed --
-- stored as jsonb (backend/app/schemas.py accepts it as either a JSON
-- string or a native JSON array and normalizes either shape before
-- insert). `user_agent` is captured server-side from the request header,
-- never trusted from the body, same as 0011_feedback.sql's `feedback.
-- user_agent`. `session_start` is parsed from the client's ISO-string
-- timestamp; if unparseable it is stored as null rather than rejecting the
-- whole ping -- usage data shouldn't be lost to a single bad timestamp
-- (see backend/app/schemas.py's EngagementIn).
--
-- No minors' PII beyond what a submitter's already-saved feedback-session
-- profile carries (self-reported name/league/team -- CLAUDE.md's global
-- "never log secrets, API keys, or PII" is a logging rule, not a storage
-- rule). `events` may contain page/tab names but never comment text or
-- images (that's `feedback`, not `engagement`).
--
-- Idempotency: matches 0001_schema.sql's / 0011_feedback.sql's style --
-- `create table if not exists` with the full column list inline, `create
-- index if not exists`.
create table if not exists engagement (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    session_id    text,
    session_start timestamptz,
    duration_sec  integer,
    user_name     text,
    league        text,
    team          text,
    event_count   integer,
    events        jsonb,
    app_version   text,
    user_agent    text
);
create index if not exists engagement_created_at_idx on engagement(created_at);

alter table engagement enable row level security;
-- Deliberately NO `create policy` statements -- see the access-model note
-- above. RLS-on-no-policy is default-deny for every non-owner role; only
-- `app.db.service_connection` (owner-role, RLS-bypassing) ever touches this
-- table.
