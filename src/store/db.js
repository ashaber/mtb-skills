/**
 * 3.0 stub — real Supabase-backed sync lands in 3.2.
 *
 * This module exists only to give src/store/index.js a second backend to
 * select between, proving out the seam. It is never selected automatically —
 * getStore() only resolves here when someone explicitly sets the
 * `mtb_store_backend` localStorage flag to "db". Every primitive below
 * throws StoreNotEnabledError; there is no network/Supabase code here yet.
 */

import log from '../log.js';

export class StoreNotEnabledError extends Error {
  constructor(op) {
    super(`db store backend is not enabled yet (3.0 stub) — attempted "${op}"`);
    this.name = 'StoreNotEnabledError';
  }
}

function notEnabled(op, key) {
  log.error('store.db.not_enabled', { op, key });
  throw new StoreNotEnabledError(op);
}

export function readCollection(key) {
  return notEnabled('readCollection', key);
}

export function writeCollection(key) {
  return notEnabled('writeCollection', key);
}

export function readObject(key) {
  return notEnabled('readObject', key);
}

export function writeObject(key) {
  return notEnabled('writeObject', key);
}

export function readRaw(key) {
  return notEnabled('readRaw', key);
}

export function writeRaw(key) {
  return notEnabled('writeRaw', key);
}

export function remove(key) {
  return notEnabled('remove', key);
}
