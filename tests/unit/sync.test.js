import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted so these are defined before the hoisted vi.mock factory runs.
const { mockIsAuthConfigured, mockGetAccessToken } = vi.hoisted(() => ({
  mockIsAuthConfigured: vi.fn(() => true),
  mockGetAccessToken:   vi.fn(async () => 'test-token'),
}));

vi.mock('../../src/auth.js', () => ({
  isAuthConfigured: mockIsAuthConfigured,
  getAccessToken:   mockGetAccessToken,
}));

import { syncNow } from '../../src/sync.js';
import {
  getPeople, getObservations, saveObservation,
  getConfirmedLevels, setConfirmedLevel,
  getCachedIdentity, getRemoteRosterIds,
} from '../../src/storage.js';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

/**
 * Builds a fetch mock that serves fixed GET bodies for the pull endpoints
 * (roster/observations/confirmed-levels/me) and echoes POST bodies back as
 * the "created" row, recording every call for assertions. `me` defaults to
 * an empty personas list — most tests here don't care about identity.
 */
function mockFetch({ roster = [], observations = [], confirmedLevels = [], me = { personas: [] } } = {}) {
  const fn = vi.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    if (method === 'GET' && url.endsWith('/api/roster'))            return jsonResponse(roster);
    if (method === 'GET' && url.endsWith('/api/observations'))      return jsonResponse(observations);
    if (method === 'GET' && url.endsWith('/api/confirmed-levels'))  return jsonResponse(confirmedLevels);
    if (method === 'GET' && url.endsWith('/api/me'))                return jsonResponse(me);
    if (method === 'POST' && url.endsWith('/api/observations'))     return jsonResponse(JSON.parse(opts.body), { status: 201 });
    if (method === 'POST' && url.endsWith('/api/confirmed-levels')) return jsonResponse(JSON.parse(opts.body));
    return jsonResponse({ error: 'unhandled in test mock' }, { ok: false, status: 404 });
  });
  return fn;
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockIsAuthConfigured.mockReturnValue(true);
  mockGetAccessToken.mockResolvedValue('test-token');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('syncNow — gating (no-ops)', () => {
  it('no-ops when auth is not configured', async () => {
    mockIsAuthConfigured.mockReturnValue(false);
    global.fetch = mockFetch();
    const result = await syncNow();
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('no-ops when signed out (no access token)', async () => {
    mockGetAccessToken.mockResolvedValue(null);
    global.fetch = mockFetch();
    const result = await syncNow();
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('no-ops when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    global.fetch = mockFetch();
    const result = await syncNow();
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('syncNow — roster pull (upsert by id)', () => {
  it('upserts remote people into the local store by id', async () => {
    global.fetch = mockFetch({
      roster: [{ id: 'p1', team_id: 't1', ride_group_id: 'rg1', role: 'athlete', name: 'Remote Rider', external_id: null }],
    });
    const result = await syncNow();
    expect(result.pulled).toBeGreaterThan(0);
    const people = getPeople();
    expect(people.find(p => p.id === 'p1')?.name).toBe('Remote Rider');
  });

  it('persists ride_group_id, ride_group_name, tags, external_id, grade, category from the pulled row', async () => {
    global.fetch = mockFetch({
      roster: [{
        id: 'p1', team_id: 't1', role: 'athlete', name: 'Remote Rider',
        ride_group_id: 'rg1', ride_group_name: 'JV Boys',
        tags: ['lead'], external_id: 'NICA-1', grade: 10, category: 'JV2',
      }],
    });
    await syncNow();
    const p = getPeople().find(x => x.id === 'p1');
    expect(p.ride_group_id).toBe('rg1');
    expect(p.ride_group_name).toBe('JV Boys');
    expect(p.tags).toEqual(['lead']);
    expect(p.external_id).toBe('NICA-1');
    expect(p.grade).toBe(10);
    expect(p.category).toBe('JV2');
  });

  it('a roster pull never clobbers a locally-set medical_notes field', async () => {
    const { savePerson } = await import('../../src/storage.js');
    savePerson({ id: 'p1', name: 'Local Name', role: 'athlete', medical_notes: 'Peanut allergy' });
    global.fetch = mockFetch({
      roster: [{ id: 'p1', team_id: 't1', role: 'athlete', name: 'Remote Rider' }],
    });
    await syncNow();
    const p = getPeople().find(x => x.id === 'p1');
    expect(p.name).toBe('Remote Rider'); // roster row IS authoritative for name
    expect(p.medical_notes).toBe('Peanut allergy'); // but not for fields it doesn't carry
  });
});

describe('syncNow — identity + remote-roster-id caches (Phase 3.2)', () => {
  it('caches GET /api/me personas via saveCachedIdentity', async () => {
    const personas = [{ person_id: 'p1', role: 'coach', team_id: 't1', ride_group_id: 'g1', name: 'Coach A' }];
    global.fetch = mockFetch({ me: { personas } });
    await syncNow();
    expect(getCachedIdentity()?.personas).toEqual(personas);
  });

  it('caches the pulled roster ids via saveRemoteRosterIds', async () => {
    global.fetch = mockFetch({
      roster: [{ id: 'p1', role: 'athlete', name: 'A' }, { id: 'p2', role: 'athlete', name: 'B' }],
    });
    await syncNow();
    expect(getRemoteRosterIds()).toEqual(['p1', 'p2']);
  });

  it('does not touch the identity/roster-id caches when sync is gated off (not configured)', async () => {
    mockIsAuthConfigured.mockReturnValue(false);
    global.fetch = mockFetch({ roster: [{ id: 'p1', role: 'athlete', name: 'A' }] });
    await syncNow();
    expect(getCachedIdentity()).toBeNull();
    expect(getRemoteRosterIds()).toBeNull();
  });
});

describe('syncNow — observations (union by id)', () => {
  it('pulls a remote observation into the local store', async () => {
    global.fetch = mockFetch({
      observations: [{ id: 'obs1', athlete_id: 'a1', team_id: 't1', coach_id: 'c1', ride_group_id: 'rg1', session_date: '2026-01-01', skill: 'braking', level_observed: 3, notes: null }],
    });
    await syncNow();
    const obs = getObservations();
    expect(obs).toHaveLength(1);
    expect(obs[0].id).toBe('obs1');
  });

  it('re-pulling the same remote observation does not create a duplicate', async () => {
    const remote = { id: 'obs1', athlete_id: 'a1', team_id: 't1', coach_id: 'c1', session_date: '2026-01-01', skill: 'braking', level_observed: 3, notes: null };
    global.fetch = mockFetch({ observations: [remote] });

    await syncNow();
    await syncNow();

    expect(getObservations()).toHaveLength(1);
  });

  it('pushes local-only observations (not present remotely) with their local id', async () => {
    saveObservation({ id: 'local-obs-1', athlete_id: 'a2', skill: 'cornering', level_observed: 2, session_date: '2026-01-02' });
    // a2 is a backend-known athlete (in the pulled roster) — its local
    // observation is pushed. (A local-ONLY athlete is skipped instead; see
    // the dedicated test below.)
    const fetchMock = mockFetch({ roster: [{ id: 'a2', name: 'A2', role: 'athlete' }], observations: [] });
    global.fetch = fetchMock;

    const result = await syncNow();

    const pushCall = fetchMock.mock.calls.find(
      ([url, opts]) => url.endsWith('/api/observations') && opts?.method === 'POST'
    );
    expect(pushCall).toBeTruthy();
    const body = JSON.parse(pushCall[1].body);
    expect(body.id).toBe('local-obs-1');
    expect(body.athlete_id).toBe('a2');
    expect(result.pushed).toBeGreaterThan(0);
  });

  it('does NOT push a local-only athlete\'s observation — skips it (counted, not errored)', async () => {
    // a-local exists only on this device (not in the pulled roster), so
    // pushing would 403 (athlete_not_in_scope). Sync must skip it cleanly.
    saveObservation({ id: 'local-obs-2', athlete_id: 'a-local', skill: 'braking', level_observed: 3, session_date: '2026-01-04' });
    const fetchMock = mockFetch({ roster: [{ id: 'a2', name: 'A2', role: 'athlete' }], observations: [] });
    global.fetch = fetchMock;

    const result = await syncNow();

    const pushCalls = fetchMock.mock.calls.filter(
      ([url, opts]) => url.endsWith('/api/observations') && opts?.method === 'POST'
    );
    expect(pushCalls).toHaveLength(0);
    expect(result.skipped).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('does not push an observation that already exists remotely', async () => {
    const remote = { id: 'shared-obs', athlete_id: 'a3', team_id: 't1', coach_id: 'c1', session_date: '2026-01-03', skill: 'braking', level_observed: 4, notes: null };
    // Also present locally under the same id (e.g. from a previous sync).
    saveObservation({ ...remote });
    const fetchMock = mockFetch({ observations: [remote] });
    global.fetch = fetchMock;

    await syncNow();

    const pushCalls = fetchMock.mock.calls.filter(
      ([url, opts]) => url.endsWith('/api/observations') && opts?.method === 'POST'
    );
    expect(pushCalls).toHaveLength(0);
  });
});

describe('syncNow — confirmed levels (LWW by athlete_id+skill)', () => {
  it('remote wins when its confirmed_at is newer than local', async () => {
    setConfirmedLevel({ athlete_id: 'a1', skill: 'braking', level: 2, confirmed_at: '2026-01-01T00:00:00.000Z' });
    global.fetch = mockFetch({
      confirmedLevels: [{ id: 'cl-remote', athlete_id: 'a1', team_id: 't1', coach_id: 'c2', skill: 'braking', level: 4, confirmed_at: '2026-01-05T00:00:00.000Z' }],
    });

    await syncNow();

    const levels = getConfirmedLevels({ athlete_id: 'a1', skill: 'braking' });
    expect(levels).toHaveLength(1);
    expect(levels[0].level).toBe(4);
    expect(levels[0].confirmed_at).toBe('2026-01-05T00:00:00.000Z');
  });

  it('local wins (and gets pushed) when its confirmed_at is newer than remote', async () => {
    setConfirmedLevel({ athlete_id: 'a1', skill: 'cornering', level: 5, confirmed_at: '2026-02-01T00:00:00.000Z' });
    const fetchMock = mockFetch({
      roster: [{ id: 'a1', name: 'A1', role: 'athlete' }],
      confirmedLevels: [{ id: 'cl-remote', athlete_id: 'a1', team_id: 't1', coach_id: 'c2', skill: 'cornering', level: 1, confirmed_at: '2026-01-01T00:00:00.000Z' }],
    });
    global.fetch = fetchMock;

    const result = await syncNow();

    // Local value must not be clobbered by the older remote value.
    const levels = getConfirmedLevels({ athlete_id: 'a1', skill: 'cornering' });
    expect(levels[0].level).toBe(5);

    const pushCall = fetchMock.mock.calls.find(
      ([url, opts]) => url.endsWith('/api/confirmed-levels') && opts?.method === 'POST'
    );
    expect(pushCall).toBeTruthy();
    const body = JSON.parse(pushCall[1].body);
    expect(body).toMatchObject({ athlete_id: 'a1', skill: 'cornering', level: 5 });
    expect(result.pushed).toBeGreaterThan(0);
  });

  it('a local-only confirmed level (no remote counterpart) is pushed', async () => {
    setConfirmedLevel({ athlete_id: 'a9', skill: 'body_position', level: 3 });
    const fetchMock = mockFetch({ roster: [{ id: 'a9', name: 'A9', role: 'athlete' }], confirmedLevels: [] });
    global.fetch = fetchMock;

    await syncNow();

    const pushCall = fetchMock.mock.calls.find(
      ([url, opts]) => url.endsWith('/api/confirmed-levels') && opts?.method === 'POST'
    );
    expect(pushCall).toBeTruthy();
  });
});
