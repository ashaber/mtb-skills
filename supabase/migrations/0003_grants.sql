-- MTB Skills -- Phase 3.1 -- grants for the Supabase `authenticated` role.
--
-- RLS policies (0002_rls.sql) decide WHICH rows a role may act on; this
-- migration grants the underlying SQL-privilege layer RLS filters on top
-- of, for the `authenticated` role -- the role Supabase's PostgREST/GoTrue
-- stack switches every logged-in request into (`SET ROLE authenticated`
-- plus the `request.jwt.claims` GUC). Without these grants, RLS is moot --
-- Postgres denies the query before policies are even evaluated.
--
-- Real Supabase pre-creates `authenticated` (and `anon`, `service_role`).
-- Locally/CI, tests/db/setup_test_auth.sql creates a same-named role before
-- this migration runs (see scripts/db_test.sh's apply order: shim, then
-- migrations 0001..0003 in filename order).
--
-- NO grants to `anon` here, or anywhere else in this repo -- anonymous
-- access is default-deny. (RLS would still resolve an anon caller to zero
-- rows/denied writes even with a stray grant, since no policy anywhere
-- matches a caller with no auth.uid() -- but we don't rely on that
-- belt-and-suspenders fact; anon simply never gets a table grant.)
--
-- Idempotent: `grant` is idempotent by nature (re-granting an already-held
-- privilege is a no-op, never an error), and the whole block is additionally
-- guarded on the role's existence so this migration is a safe no-op in any
-- environment where `authenticated` doesn't exist (defensive only -- in real
-- Supabase and in tests/db/setup_test_auth.sql the role always exists by the
-- time this file runs).

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
        grant usage on schema public to authenticated;

        grant select, insert, update on league           to authenticated;
        grant select, insert, update on team              to authenticated;
        grant select, insert, update on ride_group        to authenticated;
        grant select, insert, update on person            to authenticated;
        grant select, insert, update on auth_person       to authenticated;
        grant select, insert, update on observation       to authenticated;
        grant select, insert, update on confirmed_level   to authenticated;

        -- These app_caller_* helper functions (0002_rls.sql) are already
        -- `grant execute ... to public`, which already covers
        -- `authenticated` (every role is implicitly a member of `public`).
        -- Grant to `authenticated` explicitly anyway -- belt-and-suspenders,
        -- matching 0002_rls.sql's own style, and future-proofing against the
        -- public grants ever being narrowed without this file being revisited.
        grant execute on function app_caller_person_ids()      to authenticated;
        grant execute on function app_caller_ride_group_ids()   to authenticated;
        grant execute on function app_caller_hc_team_ids()       to authenticated;
        grant execute on function app_caller_league_ids()         to authenticated;
        grant execute on function app_caller_own_team_ids()         to authenticated;
        grant execute on function app_caller_league_team_ids()       to authenticated;
    end if;
end
$$;
