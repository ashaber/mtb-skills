-- MTB Skills -- Phase 3.x -- one ride_group per (team_id, name); merge dups.
--
-- supabase/migrations/0001_schema.sql created ride_group with NO uniqueness
-- on (team_id, name), and app/roster.py's _find_or_create_ride_group used a
-- plain SELECT-then-INSERT. That left a real split-brain hazard: if two
-- import runs (or any two callers) ever resolved the "same" group under
-- names that lower() differently only by prior state, a team could end up
-- with TWO "Droid" ride_group rows. RLS scopes a ride-group coach to the
-- group id ON THEIR OWN person row (0002_rls.sql app_caller_ride_group_ids),
-- so if the coach sits on Droid-A while some athletes were assigned Droid-B,
-- the coach literally cannot see those athletes -- POST /api/observations
-- 403s "athlete_not_in_scope" for a rider who is, by name, in "their" group.
-- This migration makes that state unrepresentable going forward and repairs
-- any team already in it.
--
-- Step 1 -- MERGE existing duplicates. For each (team_id, lower(name)) with
-- more than one group, keep a single canonical row (the lexicographically
-- smallest id, deterministic) and repoint every reference to it -- person,
-- observation, confirmed_level all carry ride_group_id -- before deleting
-- the redundant group rows. No row is orphaned and no observation/level is
-- lost; they simply move onto the surviving group. (auth_person does not
-- reference ride_group, so nothing else needs repointing.)
--
-- Step 2 -- a UNIQUE INDEX on (team_id, lower(name)) so a duplicate can
-- never be created again; app/roster.py's _find_or_create_ride_group now
-- inserts with `on conflict (team_id, lower(name)) do nothing` against it.
--
-- Idempotent: after the first run there are no duplicates left, so the merge
-- loop is a no-op on re-apply, and the index is `if not exists`.

do $$
declare
    r record;
begin
    for r in
        select rg.id as dup_id, canon.canon_id
        from ride_group rg
        join (
            select team_id, lower(name) as lname, min(id::text)::uuid as canon_id
            from ride_group
            group by team_id, lower(name)
        ) canon
          on canon.team_id = rg.team_id
         and lower(rg.name) = canon.lname
        where rg.id <> canon.canon_id
    loop
        update person          set ride_group_id = r.canon_id where ride_group_id = r.dup_id;
        update observation     set ride_group_id = r.canon_id where ride_group_id = r.dup_id;
        update confirmed_level set ride_group_id = r.canon_id where ride_group_id = r.dup_id;
        delete from ride_group where id = r.dup_id;
    end loop;
end $$;

create unique index if not exists ride_group_team_lname_uidx
    on ride_group (team_id, lower(name));
