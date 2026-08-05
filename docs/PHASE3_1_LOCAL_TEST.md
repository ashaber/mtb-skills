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

## 3. First sign-in (expected 403 — no persona yet)
Open :5173 → Settings → **Sign in with Google** → pick your account. You'll land back signed in, but sync will report an error / no data — **that's expected**: your Google account isn't linked to a coach yet (there's no onboarding/import in 3.1). This first sign-in *creates* your Supabase `auth.users` row, which the seed below needs.

## 4. Seed a minimal test scenario (Supabase → SQL Editor, mtb-itg)
First get your auth user id:
```sql
select id, email from auth.users;            -- copy YOUR id
```
Then paste this, replacing `:MY_AUTH_ID` (from above) — it makes you **Head Coach of Team A**, with a *second* coach who already logged an observation (so you can see another coach's score), plus a Team B athlete you must NOT be able to touch:
```sql
insert into league(id,name) values ('00000000-0000-0000-0000-0000000000a1','Idaho');
insert into team(id,league_id,name) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','Boise'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a1','Meridian');
insert into ride_group(id,team_id,name) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','Group A1');
insert into person(id,team_id,ride_group_id,role,name) values
  ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000b1',null,'head_coach','You (HC)'),
  ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','coach','Coach Sam'),
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','athlete','Alice (Team A)'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000b2',null,'athlete','Carol (Team B)');
-- link YOUR Google login to the HC person:
insert into auth_person(auth_user_id,person_id) values (':MY_AUTH_ID','00000000-0000-0000-0000-0000000000d1');
-- Coach Sam already recorded a skill for Alice — this is the "other coach's score" you should see:
insert into observation(id,athlete_id,team_id,coach_id,ride_group_id,session_date,skill,level_observed)
  values (gen_random_uuid(),'00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c1',current_date,'braking',2);
```

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
- **403 "not a recognized coach" after seeding** → the `auth_person` link didn't match; re-check `:MY_AUTH_ID` equals the `auth.users.id` for the email you signed in with.

## Cleanup (optional)
`delete from league where id='00000000-0000-0000-0000-0000000000a1';` (cascades where FKs allow; or truncate the test rows) — do this before the pilot uses the project, or seed pilot data instead.
