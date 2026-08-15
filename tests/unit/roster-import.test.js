import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCsv, parseRole, mapRows, guessMapping, postImport } from '../../src/roster-import.js';

describe('parseCsv', () => {
  it('parses a quoted header/field containing an embedded comma AND a newline', () => {
    // Real PitZone-shaped quirk: a header like `"First Aid type, expires"`
    // plus a multi-line quoted data cell — a naive split(',')/split('\n')
    // would corrupt both of these; papaparse must not.
    const text =
      'First Name,Last Name,Email,Coach Role,Ride Group,"First Aid type, expires"\n' +
      'Jane,Doe,jane@example.com,HC,Group A,"CPR/First Aid, expires 2027-01-01\nRenewed annually"\n';

    const { columns, rows } = parseCsv(text);

    expect(columns).toEqual([
      'First Name', 'Last Name', 'Email', 'Coach Role', 'Ride Group', 'First Aid type, expires',
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]['First Name']).toBe('Jane');
    expect(rows[0]['First Aid type, expires']).toBe('CPR/First Aid, expires 2027-01-01\nRenewed annually');
  });

  it('drops blank lines and returns an empty array for empty input', () => {
    expect(parseCsv('').rows).toEqual([]);
    expect(parseCsv('Name\n\n\n').rows).toEqual([]);
  });

  it('parses a normal simple CSV', () => {
    const { columns, rows } = parseCsv('First Name,Last Name\nAva,Smith\nLee,Jones\n');
    expect(columns).toEqual(['First Name', 'Last Name']);
    expect(rows).toEqual([
      { 'First Name': 'Ava', 'Last Name': 'Smith' },
      { 'First Name': 'Lee', 'Last Name': 'Jones' },
    ]);
  });
});

describe('parseRole', () => {
  it('maps a value containing "hc" (case-insensitive) to head_coach', () => {
    expect(parseRole('HC')).toBe('head_coach');
    expect(parseRole('hc')).toBe('head_coach');
    expect(parseRole('HC / Lead')).toBe('head_coach'); // compound value
  });

  it('maps a value containing "td" to team_director', () => {
    expect(parseRole('TD')).toBe('team_director');
    expect(parseRole('td')).toBe('team_director');
  });

  it('maps lead/sweep/blank/anything-else on the coach file to coach', () => {
    expect(parseRole('Lead')).toBe('coach');
    expect(parseRole('Sweep')).toBe('coach');
    expect(parseRole('')).toBe('coach');
    expect(parseRole(null)).toBe('coach');
    expect(parseRole(undefined)).toBe('coach');
    expect(parseRole('Coach')).toBe('coach'); // "coach" itself has no "hc"/"td" substring
    expect(parseRole('Ride Leader')).toBe('coach');
    expect(parseRole('Group Ride Coordinator')).toBe('coach');
  });

  it('maps the full-word PitZone export labels (D32) — neither contains the bare "hc"/"td" substring', () => {
    expect(parseRole('Head Coach')).toBe('head_coach');
    expect(parseRole('head coach')).toBe('head_coach');
    expect(parseRole('Team Director')).toBe('team_director');
    expect(parseRole('team director')).toBe('team_director');
  });
});

describe('mapRows', () => {
  const mapping = {
    firstNameCol: 'First Name',
    lastNameCol: 'Last Name',
    emailCol: 'Email',
    roleCol: 'Coach Role',
    rideGroupCol: 'Ride Group',
    gradeCol: 'Grade',
    categoryCol: 'Racing Category',
  };

  it('combines first + last name and passes grade/category through', () => {
    const rows = [
      {
        'First Name': 'Jane', 'Last Name': 'Doe', 'Email': 'jane@x.example',
        'Coach Role': 'HC', 'Ride Group': 'Group A', 'Grade': '8', 'Racing Category': '8th',
      },
    ];
    const mapped = mapRows(rows, mapping);
    expect(mapped).toEqual([{
      name: 'Jane Doe',
      role: 'head_coach',
      email: 'jane@x.example',
      ride_group: 'Group A',
      grade: '8',
      category: '8th',
      external_id: null,
    }]);
  });

  it('defaults role to athlete when no roleCol is mapped', () => {
    const athleteMapping = { firstNameCol: 'First Name', lastNameCol: 'Last Name' };
    const mapped = mapRows([{ 'First Name': 'Ava', 'Last Name': 'Smith' }], athleteMapping);
    expect(mapped[0].role).toBe('athlete');
  });

  it('drops a row with no name (both first/last blank) instead of sending a blank name', () => {
    const rows = [
      { 'First Name': '', 'Last Name': '  ', 'Email': 'orphan@x.example' },
      { 'First Name': 'Real', 'Last Name': 'Person' },
    ];
    const mapped = mapRows(rows, mapping);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].name).toBe('Real Person');
  });

  it('maps unset optional columns to null, not undefined-string', () => {
    const mapped = mapRows([{ 'First Name': 'Ava', 'Last Name': 'Smith' }], {
      firstNameCol: 'First Name', lastNameCol: 'Last Name',
    });
    expect(mapped[0]).toEqual({
      name: 'Ava Smith',
      role: 'athlete',
      email: null,
      ride_group: null,
      grade: null,
      category: null,
      external_id: null,
    });
  });
});

describe('guessMapping', () => {
  it('matches the real PitZone coach-file headers', () => {
    const columns = ['First Name', 'Last Name', 'Email', 'Coach Role', 'Ride Group'];
    expect(guessMapping(columns)).toEqual({
      firstNameCol: 'First Name',
      lastNameCol: 'Last Name',
      emailCol: 'Email',
      roleCol: 'Coach Role',
      rideGroupCol: 'Ride Group',
      gradeCol: null,
      categoryCol: null,
      externalIdCol: null,
    });
  });

  it('matches the real PitZone athlete-file headers', () => {
    const columns = ['First Name', 'Last Name', 'Rider Email', 'Grade', 'Racing Category'];
    expect(guessMapping(columns)).toEqual({
      firstNameCol: 'First Name',
      lastNameCol: 'Last Name',
      emailCol: 'Rider Email',
      roleCol: null,
      rideGroupCol: null,
      gradeCol: 'Grade',
      categoryCol: 'Racing Category',
      externalIdCol: null,
    });
  });

  it('leaves a field unmapped (null) when no header matches', () => {
    const mapping = guessMapping(['Some Random Column']);
    expect(mapping.firstNameCol).toBeNull();
    expect(mapping.emailCol).toBeNull();
  });

  it('detects an "External ID" column (our export) but not a bare "id" substring', () => {
    // "Rider Email" contains the substring "id" — the guesser must not
    // false-match it as the id column.
    expect(guessMapping(['External ID', 'Rider Email']).externalIdCol).toBe('External ID');
    expect(guessMapping(['Pit Zone ID']).externalIdCol).toBe('Pit Zone ID');
    expect(guessMapping(['Rider Email']).externalIdCol).toBeNull();
  });

  it('maps external_id through when the id column is present', () => {
    const rows = [{ First: 'Ana', Last: 'Vega', 'External ID': 'abc-123' }];
    const mapping = { firstNameCol: 'First', lastNameCol: 'Last', externalIdCol: 'External ID' };
    expect(mapRows(rows, mapping)[0].external_id).toBe('abc-123');
  });
});

describe('postImport', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the Bearer token + rows body and returns the summary', async () => {
    const summary = { people_created: 2, people_updated: 1, groups_created: 1, skipped: [] };
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => summary,
    }));

    const rows = [{ name: 'Jane Doe', role: 'athlete' }];
    const result = await postImport(rows, 'test-token', 'https://api.example.com');

    expect(result).toEqual(summary);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/roster/import');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(opts.body)).toEqual({ rows });
  });

  it('omits the Authorization header when no token is given', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await postImport([], null, 'https://api.example.com');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.headers.Authorization).toBeUndefined();
  });

  it('throws the server error message on a non-2xx response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: 'roster import is head-coach/team-director only' }),
    }));

    await expect(postImport([{ name: 'X' }], 'tok', 'https://api.example.com'))
      .rejects.toThrow('roster import is head-coach/team-director only');
  });

  it('falls back to an HTTP status message when the body has no error field', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('bad json'); } }));
    await expect(postImport([], 'tok', 'https://api.example.com')).rejects.toThrow('HTTP 500');
  });
});
