import { describe, it, expect } from 'vitest';
import {
  selectRecentPractices,
  computeAttendanceRate,
  levelsForAthlete,
  buildHcDashboardRows,
} from '../../src/hc-dashboard.js';

describe('selectRecentPractices', () => {
  it('returns empty array for empty/null/undefined input', () => {
    expect(selectRecentPractices([])).toEqual([]);
    expect(selectRecentPractices(null)).toEqual([]);
    expect(selectRecentPractices(undefined)).toEqual([]);
  });

  it('sorts by date descending (most recent first)', () => {
    const practices = [
      { id: 'p1', date: '2026-08-01' },
      { id: 'p2', date: '2026-08-08' },
      { id: 'p3', date: '2026-08-04' },
    ];
    expect(selectRecentPractices(practices).map(p => p.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('caps at the fixed window size (default 5)', () => {
    const practices = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    }));
    const recent = selectRecentPractices(practices);
    expect(recent).toHaveLength(5);
    // the 5 most recent dates: p7,p6,p5,p4,p3 (0-indexed dates 08..04)
    expect(recent.map(p => p.id)).toEqual(['p7', 'p6', 'p5', 'p4', 'p3']);
  });

  it('respects an explicit windowSize override', () => {
    const practices = [
      { id: 'p1', date: '2026-08-01' },
      { id: 'p2', date: '2026-08-02' },
      { id: 'p3', date: '2026-08-03' },
    ];
    expect(selectRecentPractices(practices, 2).map(p => p.id)).toEqual(['p3', 'p2']);
  });

  it('does not mutate the input array', () => {
    const practices = [{ id: 'p1', date: '2026-08-01' }, { id: 'p2', date: '2026-08-02' }];
    const copy = [...practices];
    selectRecentPractices(practices);
    expect(practices).toEqual(copy);
  });
});

describe('computeAttendanceRate', () => {
  const recentIds = ['p1', 'p2', 'p3'];

  it('counts only "attending" records within the recent practice window', () => {
    const attendance = [
      { practice_id: 'p1', person_id: 'a1', status: 'attending' },
      { practice_id: 'p2', person_id: 'a1', status: 'absent' },
      { practice_id: 'p3', person_id: 'a1', status: 'attending' },
      { practice_id: 'p4', person_id: 'a1', status: 'attending' }, // outside window
    ];
    expect(computeAttendanceRate('a1', attendance, recentIds)).toEqual({ attended: 2, total: 3 });
  });

  it('ignores attendance rows for other people', () => {
    const attendance = [
      { practice_id: 'p1', person_id: 'a2', status: 'attending' },
    ];
    expect(computeAttendanceRate('a1', attendance, recentIds)).toEqual({ attended: 0, total: 3 });
  });

  it('handles no attendance records at all', () => {
    expect(computeAttendanceRate('a1', [], recentIds)).toEqual({ attended: 0, total: 3 });
    expect(computeAttendanceRate('a1', null, recentIds)).toEqual({ attended: 0, total: 3 });
  });

  it('total reflects an empty recent-practice window (no practices yet)', () => {
    expect(computeAttendanceRate('a1', [], [])).toEqual({ attended: 0, total: 0 });
  });
});

describe('levelsForAthlete', () => {
  it('defaults every skill to 0 with no confirmed levels', () => {
    expect(levelsForAthlete('a1', [])).toEqual({ body_position: 0, braking: 0, cornering: 0 });
    expect(levelsForAthlete('a1', null)).toEqual({ body_position: 0, braking: 0, cornering: 0 });
  });

  it('picks each skill level for the matching athlete only', () => {
    const confirmed = [
      { athlete_id: 'a1', skill: 'body_position', level: 3 },
      { athlete_id: 'a1', skill: 'braking', level: 2 },
      { athlete_id: 'a1', skill: 'cornering', level: 4 },
      { athlete_id: 'a2', skill: 'cornering', level: 5 },
    ];
    expect(levelsForAthlete('a1', confirmed)).toEqual({ body_position: 3, braking: 2, cornering: 4 });
    expect(levelsForAthlete('a2', confirmed)).toEqual({ body_position: 0, braking: 0, cornering: 5 });
  });
});

describe('buildHcDashboardRows', () => {
  const people = [
    { id: 'a1', name: 'Zed Athlete', role: 'athlete', ride_group_name: 'Group A' },
    { id: 'a2', name: 'Amy Athlete', role: undefined, ride_group_name: null }, // legacy record, treated as athlete
    { id: 'c1', name: 'Coach Carl', role: 'coach', ride_group_name: 'Group A' },
  ];
  const practices = [
    { id: 'p1', date: '2026-08-01' },
    { id: 'p2', date: '2026-08-02' },
  ];
  const attendance = [
    { practice_id: 'p1', person_id: 'a1', status: 'attending' },
    { practice_id: 'p2', person_id: 'a1', status: 'attending' },
    { practice_id: 'p1', person_id: 'a2', status: 'absent' },
  ];
  const confirmedLevels = [
    { athlete_id: 'a1', skill: 'body_position', level: 3 },
    { athlete_id: 'a2', skill: 'braking', level: 1 },
  ];

  it('excludes coaches — only athlete rows', () => {
    const rows = buildHcDashboardRows({ people, practices, attendance, confirmedLevels });
    expect(rows.map(r => r.id)).toEqual(['a2', 'a1']); // sorted by name
    expect(rows.some(r => r.id === 'c1')).toBe(false);
  });

  it('sorts rows alphabetically by name', () => {
    const rows = buildHcDashboardRows({ people, practices, attendance, confirmedLevels });
    expect(rows.map(r => r.name)).toEqual(['Amy Athlete', 'Zed Athlete']);
  });

  it('attaches ride_group_name, attendance, and per-skill levels per row', () => {
    const rows = buildHcDashboardRows({ people, practices, attendance, confirmedLevels });
    const zed = rows.find(r => r.id === 'a1');
    expect(zed).toMatchObject({
      ride_group_name: 'Group A',
      attended: 2,
      total: 2,
      levels: { body_position: 3, braking: 0, cornering: 0 },
    });
    const amy = rows.find(r => r.id === 'a2');
    expect(amy).toMatchObject({
      ride_group_name: null,
      attended: 0,
      total: 2,
      levels: { body_position: 0, braking: 1, cornering: 0 },
    });
  });

  it('handles an empty roster gracefully', () => {
    expect(buildHcDashboardRows({ people: [], practices: [], attendance: [], confirmedLevels: [] })).toEqual([]);
  });

  it('handles missing/undefined inputs gracefully', () => {
    expect(buildHcDashboardRows({})).toEqual([]);
  });
});
