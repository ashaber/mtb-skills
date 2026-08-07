-- MTB Skills -- Phase 3.x -- feedback (in-app 💬 feedback-modal submissions).
--
-- Moves the `type:'feedback'` stream out of the Google Sheet (CLAUDE.md's
-- Phase 2 sheet-webhook path) and into this table. Scope is deliberately
-- narrow: ONLY feedback submissions. The `type:'engagement'` usage-tracking
-- stream (src/feedback.js's `_flushEngagement`) is untouched and keeps
-- posting to the sheet -- that's a separate item, not this migration's
-- concern.
--
-- Access model -- RLS enabled, ZERO policies (deny-all):
--   There is no coach/athlete persona behind a feedback submission -- the
--   POST /api/feedback endpoint is intentionally ANONYMOUS (no JWT, no
--   Depends(get_caller); see backend/app/routes.py). With no verified
--   identity, there is no `auth.uid()` for any of 0002_rls.sql's
--   app_caller_*() helpers to key off of, so this table cannot reuse any of
--   that policy machinery -- and it shouldn't try to: nothing about a
--   feedback row should ever be selectable/writable by an ordinary
--   `authenticated` caller, coach or otherwise.
--
--   So: `enable row level security` with NO `create policy` at all. Under
--   Postgres RLS, "no policy matches" means deny -- for EVERY role that
--   isn't the table owner/a role with BYPASSRLS, every SELECT/INSERT/
--   UPDATE/DELETE is denied, full stop. That is exactly the access model
--   here: only `app.db.service_connection` (the same deliberate,
--   documented RLS-bypass app.onboarding already uses to link a coach's
--   first login -- see that module's docstring) writes this table, running
--   as the connecting owner/superuser role, which bypasses RLS by
--   Postgres's own design (same mechanism as `owner_conn` in this repo's
--   test fixtures). No `grant` to `authenticated` is issued below, on
--   purpose -- unlike 0003_grants.sql's tables, `authenticated` gets no
--   SQL-privilege foothold on `feedback` at all, so even a coincidental
--   future policy mistake here still can't be reached without the
--   privilege grant this migration deliberately withholds.
--
--   Practical effect: a coach's browser never talks to this table directly
--   (there's no Supabase anon/authenticated credential in play for
--   feedback at all -- the frontend calls the backend's anonymous REST
--   endpoint, which alone holds DATABASE_URL). Andrew reads submissions
--   with a normal SQL client connected as the owner role -- there is no
--   dev-facing read API for this table and none is planned.
--
-- No minors' PII beyond what a submitter chooses to type into the feedback
-- modal (self-reported name/email/league/team/role -- CLAUDE.md's global
-- "never log secrets, API keys, or PII" is a logging rule, not a storage
-- rule; storing self-reported optional contact info a submitter volunteers
-- is the whole point of a feedback form). `user_agent` is captured
-- server-side from the request header, never trusted from the body (see
-- backend/app/routes.py).
--
-- Idempotency: matches 0001_schema.sql's style -- `create table if not
-- exists` with the full column list inline, `create index if not exists`.
create table if not exists feedback (
    id           uuid primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),
    page         text,
    role         text,
    user_name    text,
    email        text,
    league       text,
    team         text,
    comment      text,
    has_drawing  boolean not null default false,
    screenshot   text,
    drawing      text,
    app_version  text,
    user_agent   text
);
create index if not exists feedback_created_at_idx on feedback(created_at);

alter table feedback enable row level security;
-- Deliberately NO `create policy` statements -- see the access-model note
-- above. RLS-on-no-policy is default-deny for every non-owner role; only
-- `app.db.service_connection` (owner-role, RLS-bypassing) ever touches this
-- table.
