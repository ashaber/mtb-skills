import { describe, it, expect } from 'vitest';
import { encodeCard, decodeCard, detectMerge } from '../../src/trading.js';

const ATHLETE = {
  id:                       'abc-123',
  name:                     'Jordan Lee',
  grade:                    9,
  medical_notes:            'Epi pen',
  emergency_contact_name:   'Pat Lee',
  emergency_contact_phone:  '208-555-1234',
};
const CONF = { body_position: 3, braking: 2, cornering: 2 };

describe('encodeCard / decodeCard round-trip', () => {
  it('round-trips all fields', () => {
    const p = decodeCard(encodeCard(ATHLETE, CONF));
    expect(p.v).toBe(1);
    expect(p.source_athlete_id).toBe('abc-123');
    expect(p.name).toBe('Jordan Lee');
    expect(p.grade).toBe(9);
    expect(p.medical_notes).toBe('Epi pen');
    expect(p.emergency_contact_name).toBe('Pat Lee');
    expect(p.emergency_contact_phone).toBe('208-555-1234');
    expect(p.confirmed_levels.body_position).toBe(3);
    expect(p.confirmed_levels.braking).toBe(2);
    expect(p.confirmed_levels.cornering).toBe(2);
  });

  it('null confirmed levels when unconfirmed (0)', () => {
    const p = decodeCard(encodeCard(ATHLETE, { body_position: 0, braking: 0, cornering: 0 }));
    expect(p.confirmed_levels.body_position).toBeNull();
    expect(p.confirmed_levels.braking).toBeNull();
    expect(p.confirmed_levels.cornering).toBeNull();
  });

  it('null safety fields when absent from athlete', () => {
    const p = decodeCard(encodeCard({ id: 'x', name: 'Test' }, {}));
    expect(p.medical_notes).toBeNull();
    expect(p.emergency_contact_name).toBeNull();
    expect(p.emergency_contact_phone).toBeNull();
  });

  it('throws on invalid JSON', () => {
    expect(() => decodeCard('not json')).toThrow();
  });

  it('throws when name is missing', () => {
    expect(() => decodeCard('{"v":1}')).toThrow('valid MTB Skills');
  });

  it('throws on wrong version', () => {
    expect(() => decodeCard('{"v":2,"name":"X"}')).toThrow('valid MTB Skills');
  });

  it('partial confirmed levels survive round-trip', () => {
    const p = decodeCard(encodeCard(ATHLETE, { body_position: 3, braking: 0, cornering: 1 }));
    expect(p.confirmed_levels.body_position).toBe(3);
    expect(p.confirmed_levels.braking).toBeNull();
    expect(p.confirmed_levels.cornering).toBe(1);
  });
});

describe('detectMerge', () => {
  const roster = [
    { id: 'abc-123', name: 'Jordan Lee' },
    { id: 'def-456', name: 'Sam Rivera' },
  ];

  it('returns existing athlete on UUID match', () => {
    expect(detectMerge(roster, 'abc-123')?.name).toBe('Jordan Lee');
  });

  it('returns null when no UUID match', () => {
    expect(detectMerge(roster, 'zzz-999')).toBeNull();
  });

  it('returns null when sourceAthleteId is null', () => {
    expect(detectMerge(roster, null)).toBeNull();
  });

  it('returns null on empty roster', () => {
    expect(detectMerge([], 'abc-123')).toBeNull();
  });
});
