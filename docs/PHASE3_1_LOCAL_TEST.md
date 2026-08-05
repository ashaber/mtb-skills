# Phase 3.1 — Interactive login/sync test (local)

The one non-automated gate for 3.1: sign in with Google for real and watch a coach's data round-trip through FastAPI under RLS. Run against the **`mtb-itg`** Supabase project. ~10 min.

## 1. Backend env + run
Get the values: `DATABASE_URL` = mtb-itg **transaction pooler** (`:6543`) string (Connect dialog); `SUPABASE_URL` = `https://<itg-ref>.supabase.co` (same as `VITE_SUPABASE_URL`); `GOOGLE_CLIENT_ID` = your `VITE_GOOGLE_CLIENT_ID`. The backend verifies Supabase's ES256 tokens via the project's JWKS (derived from `SUPABASE_URL`) — no JWT secret needed on modern projects.

```bash
cd backend
export DATABASE_URL='postgresql://postgres.<itg-ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres'
export SUPABASE_URL='https://<itg-ref>.supabase.co'
export GOOGLE_CLIENT_ID='<clientid>.apps.googleusercontent.com'
export SESSION_SECRET="$(openssl rand -hex 32)"     # required by config; unused in 3.1
export ALLOWED_ORIGINS='http://localhost:5173'
# (SUPABASE_JWT_SECRET only if your project still uses legacy HS256 signing.)
../.venv/bin/pip install -r requirements.txt        # now pulls pyjwt[crypto] for ES256
../.venv/bin/uvicorn app.main:app --reload --port 8000
# health check in another shell: curl localhost:8000/health  -> {"status":"ok"}
```

## 2. Frontend env + run
Create `.env.local` at the repo root (Vite auto-loads it):
```
VITE_SUPABASE_URL=https://<itg-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<mtb-itg anon / sb_publishable_… key>
VITE_GOOGLE_CLIENT_ID=<clientid>.apps.googleusercontent.com
VITE_BACKEND_URL=http://localhost:8000
```
```bash
npm run dev     # http://localhost:5173
```

## 3. Seed the test scenario (Supabase → SQL Editor, mtb-itg)
> Requires migration **0005** applied (adds `person.email`). With the onboarding
> auto-link (PR #21) you do **not** hand-insert an `auth_person` row — you put
> **your Google email on a coach `person` row**, and first sign-in links you
> automatically. (In the real pilot these rows come from the HC roster import;
> this SQL stands in for it during the test.)

In the SQL Editor, paste this — it makes **your email** the Head Coach of Team A,
with a second coach who already logged an observation (the "other coach's score"
you should see) and a Team B athlete you must NOT be able to touch. **Replace
`you@gmail.com` with the Google address you'll sign in with.** Idempotent — safe
to re-run:
```sql
insert into league(id,name) values ('00000000-0000-0000-0000-0000000000a1','Idaho') on conflict (id) do nothing;
insert into team(id,league_id,name) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','Boise'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1','Meridian') on conflict (id) do nothing;
insert into ride_group(id,team_id,name) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','Group A1') on conflict (id) do nothing;
insert into person(id,team_id,ride_group_id,role,name,email) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',null,'head_coach','You (HC)','you@gmail.com'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','coach','Coach Sam',null),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','athlete','Alice (Team A)',null),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b2',null,'athlete','Carol (Team B)',null) on conflict (id) do nothing;
-- your email on the HC row is the whole "give a coach your email" step (also fixes an older seed that lacked it):
update person set email='you@gmail.com' where id='00000000-0000-0000-0000-0000000000d1';
-- run ONCE: Coach Sam's observation for Alice (the score you should see):
insert into observation(id,athlete_id,team_id,coach_id,ride_group_id,session_date,skill,level_observed)
  values (gen_random_uuid(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c1',current_date,'braking',2);
```

## 4. Sign in → auto-link
Open :5173 → Settings → **Sign in with Google** → pick the account whose email you
put on the HC row. First sign-in verifies your email and auto-creates the
`auth_person` link (onboarding bootstrap). No manual linking needed.

## 5. Reload the app → verify the round-trip
Back on :5173, reload (or Settings → **Sync now**). Expect:
- ✅ Signed-in state shows your name/email; sync summary shows rows pulled.
- ✅ **Alice appears on your roster with Coach Sam's braking-2 observation** — you're seeing another coach's score (the whole point).
- ✅ **Carol (Team B) is NOT on your roster** — RLS scoping.
- ✅ Log a new observation for Alice → it pushes (check `select * from observation` in Supabase; your `coach_id` = the HC person).
- ✅ (Backdoor check) a direct `POST /api/observations` for Carol's id returns **403** — RLS blocks cross-team writes. (You won't see Carol in the UI to try it; this is the automated `tests/backend` proof.)

## Troubleshooting
- **Sign-in loops / "redirect" error** → the redirect URL isn't allow-listed. Supabase → Authentication → URL Configuration → Redirect URLs must include `http://localhost:5173/**`; Site URL = `http://localhost:5173`.
- **Backend 401 / "could not resolve signing key"** → the JWKS fetch from `SUPABASE_URL` failed. Check `SUPABASE_URL` is exactly `https://<itg-ref>.supabase.co` (no trailing path) and the backend can reach the internet. (Asymmetric ES256 verification is now built in — `pyjwt[crypto]` + JWKS.)
- **Backend 500 / "could not connect"** → check the `DATABASE_URL` is the `:6543` transaction pooler and the password is right.
- **CORS error in the browser console** → backend `ALLOWED_ORIGINS` must be exactly `http://localhost:5173`.
- **403 "not a recognized coach" after seeding** → the email on the coach `person` row doesn't match the Google account you signed in with (case-insensitive). Re-check the `update person set email=...` used your real sign-in address, and that migration 0005 (`person.email`) is applied.
- **`column p.email does not exist`** in the backend log → migration **0005** isn't applied to that project. Apply it (SQL Editor): `alter table person add column if not exists email text; create index if not exists person_email_lower_idx on person (lower(email));`.

## Cleanup (optional)
`delete from league where id='00000000-0000-0000-0000-0000000000a1';` (cascades where FKs allow; or truncate the test rows) — do this before the pilot uses the project, or seed pilot data instead.
