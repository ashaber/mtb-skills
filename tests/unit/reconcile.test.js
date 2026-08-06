import { describe, it, expect } from 'vitest';
import { detectLocalOnly, autoMatchByName, resolveMyGroups } from '../../src/reconcile.js';

describe('detectLocalOnly', () => {
  it('returns empty array for empty local roster', () => {
    expect(detectLocalOnly([], ['r1', 'r2'])).toEqual([]);
  });

  it('flags every local athlete when remote roster is empty', () => {
    const local = [{ id: 'a1' }, { id: 'a2' }];
    expect(detectLocalOnly(local, [])).toEqual(local);
  });

  it('excludes an athlete already present in the remote roster (already-synced)', () => {
    const local = [{ id: 'a1' }, { id: 'a2' }];
    const result = detectLocalOnly(local, ['a1']);
    expect(result).toEqual([{ id: 'a2' }]);
  });

  it('excludes all local athletes when every id is present remotely', () => {
    const local = [{ id: 'a1' }, { id: 'a2' }];
    expect(detectLocalOnly(local, ['a1', 'a2', 'a3'])).toEqual([]);
  });

  it('accepts a Set as well as an array for remoteRosterIds', () => {
    const local = [{ id: 'a1' }, { id: 'a2' }];
    const result = detectLocalOnly(local, new Set(['a1']));
    expect(result).toEqual([{ id: 'a2' }]);
  });

  it('treats null/undefined remoteRosterIds as nothing remote (everything local-only)', () => {
    const local = [{ id: 'a1' }];
    expect(detectLocalOnly(local, null)).toEqual(local);
    expect(detectLocalOnly(local, undefined)).toEqual(local);
  });

  it('handles null/undefined localAthletes gracefully', () => {
    expect(detectLocalOnly(null, ['a1'])).toEqual([]);
    expect(detectLocalOnly(undefined, ['a1'])).toEqual([]);
  });
});

describe('autoMatchByName', () => {
  it('returns null for an empty remote roster', () => {
    expect(autoMatchByName({ name: 'Alice' }, [])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    const remote = [{ id: 'r1', name: 'Bob' }];
    expect(autoMatchByName({ name: 'Alice' }, remote)).toBeNull();
  });

  it('matches case-insensitively and trims whitespace', () => {
    const remote = [{ id: 'r1', name: 'Alice Smith' }];
    expect(autoMatchByName({ name: '  ALICE smith  ' }, remote)?.id).toBe('r1');
  });

  it('prefers an external_id exact match over a name match', () => {
    const remote = [
      { id: 'r1', name: 'Alice Smith', external_id: 'NICA-999' },
      { id: 'r2', name: 'A Different Alice', external_id: 'NICA-123' },
    ];
    const local = { name: 'Alice Smith', external_id: 'NICA-123' };
    // Name would match r1, but external_id match on r2 must win.
    expect(autoMatchByName(local, remote)?.id).toBe('r2');
  });

  it('falls back to name match when external_id is present locally but not found remotely', () => {
    const remote = [{ id: 'r1', name: 'Alice Smith', external_id: null }];
    const local = { name: 'Alice Smith', external_id: 'NICA-404' };
    expect(autoMatchByName(local, remote)?.id).toBe('r1');
  });

  it('returns null when local has no name and no external_id match', () => {
    expect(autoMatchByName({ name: '' }, [{ id: 'r1', name: 'Alice' }])).toBeNull();
  });

  it('returns null for missing/undefined local argument', () => {
    expect(autoMatchByName(null, [{ id: 'r1', name: 'Alice' }])).toBeNull();
    expect(autoMatchByName(undefined, [{ id: 'r1', name: 'Alice' }])).toBeNull();
  });
});

describe('resolveMyGroups', () => {
  it('returns empty array for no personas', () => {
    expect(resolveMyGroups([], [])).toEqual([]);
    expect(resolveMyGroups(null, [])).toEqual([]);
  });

  it('resolves ride_group_name via the persona\'s own roster row', () => {
    const personas = [{ person_id: 'p1', role: 'coach', ride_group_id: 'g1', name: 'Coach A' }];
    const roster = [{ id: 'p1', ride_group_id: 'g1', ride_group_name: 'JV Boys' }];
    const result = resolveMyGroups(personas, roster);
    expect(result).toEqual([
      { person_id: 'p1', name: 'Coach A', role: 'coach', ride_group_id: 'g1', ride_group_name: 'JV Boys' },
    ]);
  });

  it('falls back to null ride_group_name when the roster row is missing', () => {
    const personas = [{ person_id: 'ghost', role: 'coach', ride_group_id: 'g1', name: 'Coach A' }];
    const result = resolveMyGroups(personas, []);
    expect(result[0].ride_group_name).toBeNull();
    expect(result[0].ride_group_id).toBe('g1');
  });

  it('handles an HC/TD persona with no ride_group_id', () => {
    const personas = [{ person_id: 'p1', role: 'head_coach', ride_group_id: null, name: 'HC' }];
    const roster = [{ id: 'p1', ride_group_id: null, ride_group_name: null }];
    const result = resolveMyGroups(personas, roster);
    expect(result[0].ride_group_id).toBeNull();
    expect(result[0].ride_group_name).toBeNull();
  });

  it('resolves multiple personas independently', () => {
    const personas = [
      { person_id: 'p1', role: 'coach', ride_group_id: 'g1', name: 'Coach A' },
      { person_id: 'p2', role: 'coach', ride_group_id: 'g2', name: 'Coach A (alt)' },
    ];
    const roster = [
      { id: 'p1', ride_group_id: 'g1', ride_group_name: 'JV Boys' },
      { id: 'p2', ride_group_id: 'g2', ride_group_name: 'Varsity Girls' },
    ];
    const result = resolveMyGroups(personas, roster);
    expect(result.map(r => r.ride_group_name)).toEqual(['JV Boys', 'Varsity Girls']);
  });
});
