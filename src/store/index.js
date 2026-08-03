/**
 * Store factory — the seam between src/storage.js and its backing
 * implementation (localStorage today; a Supabase-backed remote store from
 * 3.2 on).
 *
 * Backend selection is driven by a localStorage flag, `mtb_store_backend`
 * ("local" | "db"). This is deliberately a *frontend* flag, distinct from
 * the backend service's own `STORE_BACKEND` env var (a Phase 3 backend
 * config knob, on the server side) — same-sounding name, different side of
 * the wire, different lifecycle. Do not conflate the two.
 *
 * For 3.0 this always resolves to "local" unless a caller explicitly opts
 * in by setting the flag to "db" — which then hits the dormant stub in
 * db.js. Nothing in the shipped app sets this flag yet, so behavior is
 * unchanged by default.
 */

import * as local from './local.js';
import * as db from './db.js';

export const STORE_BACKEND_KEY = 'mtb_store_backend';

const BACKENDS = { local, db };

/**
 * @returns {'local' | 'db'}
 */
export function getStoreMode() {
  let raw;
  try {
    raw = localStorage.getItem(STORE_BACKEND_KEY);
  } catch {
    return 'local';
  }
  return raw === 'db' ? 'db' : 'local';
}

/**
 * @returns {typeof local} the active backend module (same interface as
 *   local.js: readCollection, writeCollection, readObject, writeObject,
 *   readRaw, writeRaw, remove).
 */
export function getStore() {
  return BACKENDS[getStoreMode()] ?? local;
}
