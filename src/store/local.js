/**
 * localStorage-backed store primitives.
 *
 * This is a pure extraction of the read/write mechanism that used to live
 * directly inside src/storage.js (the `load`/`save` helpers plus the ad hoc
 * localStorage.getItem/setItem calls scattered through it). Behavior is
 * unchanged — this module just gives that mechanism a name and an interface
 * so src/storage.js can go through src/store/index.js's getStore() instead
 * of touching `localStorage` directly.
 *
 * Semantics (preserved exactly from the original storage.js):
 *  - readCollection: JSON array at `key`, defaults to [] when unset or on
 *    parse failure (parse failures are logged, not thrown).
 *  - writeCollection: JSON-stringify an array/anything to `key`.
 *  - readObject: JSON.parse of whatever's at `key`, or `null` when unset.
 *    Does NOT catch parse errors — callers that need a non-null default or
 *    error swallowing apply that themselves (matches original getCoach/
 *    getPhoto/getTeamSettings, which each had their own try/catch).
 *  - writeObject: JSON-stringify an object to `key`.
 *  - readRaw / writeRaw: plain string get/set, no JSON encoding — used for
 *    values like the roster filter that were never JSON-encoded originally.
 *  - remove: localStorage.removeItem passthrough.
 */

import log from '../log.js';

export function readCollection(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? [];
  } catch (e) {
    log.error('storage.read.error', { key, error: e.message });
    return [];
  }
}

export function writeCollection(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readObject(key) {
  return JSON.parse(localStorage.getItem(key) ?? 'null');
}

export function writeObject(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readRaw(key) {
  return localStorage.getItem(key);
}

export function writeRaw(key, value) {
  localStorage.setItem(key, value);
}

export function remove(key) {
  localStorage.removeItem(key);
}
