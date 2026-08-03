import { describe, it, expect, beforeEach } from 'vitest';
import { getStore, getStoreMode, STORE_BACKEND_KEY } from '../../src/store/index.js';
import * as local from '../../src/store/local.js';
import { StoreNotEnabledError } from '../../src/store/db.js';

beforeEach(() => {
  localStorage.clear();
});

describe('getStoreMode', () => {
  it('defaults to "local" when the flag key is unset', () => {
    expect(getStoreMode()).toBe('local');
  });

  it('defaults to "local" when the flag key holds an unknown value', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'postgres');
    expect(getStoreMode()).toBe('local');
  });

  it('returns "db" only when explicitly set to "db"', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(getStoreMode()).toBe('db');
  });

  it('returns "local" when explicitly set to "local"', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'local');
    expect(getStoreMode()).toBe('local');
  });

  it('uses a flag key distinct from any backend-side STORE_BACKEND var name', () => {
    // The frontend flag must not collide with the backend's own STORE_BACKEND env var name.
    expect(STORE_BACKEND_KEY).not.toBe('STORE_BACKEND');
    expect(STORE_BACKEND_KEY).toBe('mtb_store_backend');
  });
});

describe('getStore factory', () => {
  it('resolves to the local backend module by default', () => {
    const store = getStore();
    expect(store.writeCollection).toBe(local.writeCollection);
    expect(store.readCollection).toBe(local.readCollection);
  });

  it('resolves to the db stub only when explicitly opted in', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    const store = getStore();
    expect(store.readCollection).not.toBe(local.readCollection);
  });

  it('never silently selects db — unknown values fall back to local', () => {
    localStorage.setItem(STORE_BACKEND_KEY, '');
    const store = getStore();
    expect(store.readCollection).toBe(local.readCollection);
  });
});

describe('db stub (dormant in 3.0)', () => {
  it('readCollection throws StoreNotEnabledError', () => {
    expect(() => {
      localStorage.setItem(STORE_BACKEND_KEY, 'db');
      getStore().readCollection('anything');
    }).toThrow(StoreNotEnabledError);
  });

  it('writeCollection throws StoreNotEnabledError', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(() => getStore().writeCollection('anything', [])).toThrow(StoreNotEnabledError);
  });

  it('readObject throws StoreNotEnabledError', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(() => getStore().readObject('anything')).toThrow(StoreNotEnabledError);
  });

  it('writeObject throws StoreNotEnabledError', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(() => getStore().writeObject('anything', {})).toThrow(StoreNotEnabledError);
  });

  it('readRaw throws StoreNotEnabledError', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(() => getStore().readRaw('anything')).toThrow(StoreNotEnabledError);
  });

  it('writeRaw throws StoreNotEnabledError', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(() => getStore().writeRaw('anything', 'x')).toThrow(StoreNotEnabledError);
  });

  it('remove throws StoreNotEnabledError', () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(() => getStore().remove('anything')).toThrow(StoreNotEnabledError);
  });

  it('the db flag itself is stored under mtb_store_backend, not touched by db stub ops', () => {
    // Setting the flag must not itself be routed through the (dormant) db backend.
    localStorage.setItem(STORE_BACKEND_KEY, 'db');
    expect(getStoreMode()).toBe('db');
  });
});

describe('local backend primitives', () => {
  it('readCollection defaults to [] when unset', () => {
    expect(local.readCollection('missing_key')).toEqual([]);
  });

  it('writeCollection / readCollection round-trip', () => {
    local.writeCollection('k1', [{ a: 1 }]);
    expect(local.readCollection('k1')).toEqual([{ a: 1 }]);
  });

  it('readCollection returns [] and does not throw on corrupted JSON', () => {
    localStorage.setItem('bad_key', '{not json');
    expect(local.readCollection('bad_key')).toEqual([]);
  });

  it('readObject returns null when unset', () => {
    expect(local.readObject('missing_obj')).toBeNull();
  });

  it('writeObject / readObject round-trip', () => {
    local.writeObject('obj1', { hello: 'world' });
    expect(local.readObject('obj1')).toEqual({ hello: 'world' });
  });

  it('readRaw returns null when unset', () => {
    expect(local.readRaw('missing_raw')).toBeNull();
  });

  it('writeRaw / readRaw round-trip stores a plain string, not JSON', () => {
    local.writeRaw('raw1', 'hello');
    expect(localStorage.getItem('raw1')).toBe('hello'); // not '"hello"'
    expect(local.readRaw('raw1')).toBe('hello');
  });

  it('remove deletes the key', () => {
    local.writeRaw('gone', 'x');
    local.remove('gone');
    expect(local.readRaw('gone')).toBeNull();
  });
});

describe('regression — storage.js is unchanged with the default (local) flag', () => {
  it('storage.js round-trips people through the same localStorage keys as before', async () => {
    const { saveAthlete, getAthletes } = await import('../../src/storage.js');
    const a = saveAthlete({ name: 'Flag Default Rider' });
    expect(a.id).toBeTruthy();
    // Underlying key is unchanged — mtb_athletes — proving storage.js still
    // resolves to the local backend/localStorage when the flag is unset.
    const raw = JSON.parse(localStorage.getItem('mtb_athletes'));
    expect(raw).toHaveLength(1);
    expect(raw[0].name).toBe('Flag Default Rider');
    expect(getAthletes()).toHaveLength(1);
  });

  it('storage.js still works when the flag is explicitly set to "local"', async () => {
    localStorage.setItem(STORE_BACKEND_KEY, 'local');
    const { saveAthlete, getAthletes } = await import('../../src/storage.js');
    saveAthlete({ name: 'Explicit Local Rider' });
    expect(getAthletes()).toHaveLength(1);
  });
});
