/**
 * Frontend env var plumbing.
 *
 * Unused in Phase 3.0 — nothing in the current app reads these. They're
 * wired up now so 3.1 (auth) and 3.2 (Supabase-backed db store) can start
 * consuming them without another plumbing pass. Every value defaults to an
 * empty string when the underlying Vite env var isn't set, so importing
 * this module is always safe.
 */

function readEnv(key) {
  try {
    return import.meta.env?.[key] ?? '';
  } catch {
    return '';
  }
}

export const SUPABASE_URL = readEnv('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY');
export const BACKEND_URL = readEnv('VITE_BACKEND_URL');
export const GOOGLE_CLIENT_ID = readEnv('VITE_GOOGLE_CLIENT_ID');
