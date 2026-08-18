import { describe, it, expect, vi, beforeEach } from 'vitest';

// viewSettings's Account section (where the D26 team-switcher row lives) is
// entirely gated on isAuthConfigured() (src/auth.js) -- forced true here so
// that branch is reachable under jsdom, where the real env-var-driven
// isAuthConfigured() would otherwise always be false. Same mocking pattern
// tests/unit/sync.test.js already uses for the same module.
vi.mock('../../src/auth.js', () => ({
  isAuthConfigured: () => true,
}));

import { modalTeamSwitcher, viewRoster, viewSettings } from '../../src/views.js';
import { saveCachedIdentity, saveActivePersonaId, savePerson } from '../../src/storage.js';

beforeEach(() => {
  localStorage.clear();
});

const PERSONA_A = { person_id: 'pa', role: 'team_director', team_id: 'team-a', ride_group_id: null, name: 'Traveling Coach', team_name: 'Team A' };
const PERSONA_B = { person_id: 'pb', role: 'coach', team_id: 'team-b', ride_group_id: 'g1', name: 'Traveling Coach', team_name: 'Team B' };
const SOLO_PERSONA = { person_id: 'p1', role: 'coach', team_id: 't1', ride_group_id: 'g1', name: 'Solo Coach', team_name: 'Solo Team' };

function minimalSettingsState(overrides = {}) {
  return {
    tab: 'settings',
    settingsQR: null,
    feedbackQR: null,
    authUser: { email: 'coach@example.com', name: 'Solo Coach' },
    syncing: false,
    syncSummary: null,
    syncAt: null,
    ...overrides,
  };
}

describe('modalTeamSwitcher (D26)', () => {
  it('renders a fallback (no <select>) when fewer than 2 personas are cached', () => {
    saveCachedIdentity([SOLO_PERSONA]);
    const html = modalTeamSwitcher();
    expect(html).toContain('Switch Team');
    expect(html).not.toContain('<select');
  });

  it('renders a fallback when there is no cached identity at all', () => {
    const html = modalTeamSwitcher();
    expect(html).not.toContain('<select');
  });

  it('renders one <option> per persona, labeled "team_name — role"', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    const html = modalTeamSwitcher();
    expect(html).toContain('Team A — Team Director');
    expect(html).toContain('Team B — Coach');
  });

  it('marks the currently-active persona as the selected <option>', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    saveActivePersonaId('pb');
    const html = modalTeamSwitcher();
    const optionB = html.match(/<option value="pb"[^>]*>/)[0];
    expect(optionB).toContain('selected');
    const optionA = html.match(/<option value="pa"[^>]*>/)[0];
    expect(optionA).not.toContain('selected');
  });

  it('has a Switch button wired to the save-team-switch sheet action', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    const html = modalTeamSwitcher();
    expect(html).toContain('data-m="save-team-switch"');
  });

  it('escapes an untrusted team_name to avoid HTML injection', () => {
    saveCachedIdentity([
      { ...PERSONA_A, team_name: '<img src=x onerror=alert(1)>' },
      PERSONA_B,
    ]);
    const html = modalTeamSwitcher();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});

describe('viewSettings — team-switcher row (D26)', () => {
  it('shows no "Switch team" control for a single-persona coach', () => {
    saveCachedIdentity([SOLO_PERSONA]);
    const html = viewSettings(minimalSettingsState());
    expect(html).not.toContain('Switch team');
  });

  it('shows no "Switch team" control when there is no cached identity at all', () => {
    const html = viewSettings(minimalSettingsState());
    expect(html).not.toContain('Switch team');
  });

  it('shows a "Switch team" control for a multi-persona coach', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    saveActivePersonaId('pa');
    const html = viewSettings(minimalSettingsState());
    expect(html).toContain('Switch team');
    expect(html).toContain('data-a="open-team-switcher"');
  });

  it('shows the active team + role label for a multi-persona coach', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    saveActivePersonaId('pb');
    const html = viewSettings(minimalSettingsState());
    expect(html).toContain('Team B — Coach');
  });

  it('shows "No team selected yet" when a multi-persona coach has not picked one', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    const html = viewSettings(minimalSettingsState());
    expect(html).toContain('No team selected yet');
  });

  it('renders no Account section at all when signed out (unaffected by D26)', () => {
    saveCachedIdentity([PERSONA_A, PERSONA_B]);
    const html = viewSettings(minimalSettingsState({ authUser: null }));
    expect(html).not.toContain('Switch team');
  });
});

describe('viewSettings — magic-link sign-in (IDEA-031)', () => {
  it('shows the Google button and an email input + button when signed out', () => {
    const html = viewSettings(minimalSettingsState({ authUser: null }));
    expect(html).toContain('data-a="sign-in-google"');
    expect(html).toContain('data-a="sign-in-magic-link"');
    expect(html).toContain('id="inp-magic-link-email"');
  });

  it('shows a confirmation message instead of the input once a link has been sent', () => {
    const html = viewSettings(minimalSettingsState({ authUser: null, magicLinkSent: 'coach@example.com' }));
    expect(html).not.toContain('id="inp-magic-link-email"');
    expect(html).toContain('coach@example.com');
    expect(html).toContain('Check your email');
  });

  it('escapes an untrusted magicLinkSent value', () => {
    const html = viewSettings(minimalSettingsState({ authUser: null, magicLinkSent: '<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('does not render the magic-link UI at all when signed in', () => {
    const html = viewSettings(minimalSettingsState());
    expect(html).not.toContain('id="inp-magic-link-email"');
    expect(html).not.toContain('data-a="sign-in-magic-link"');
  });
});

const HC_PERSONA = { person_id: 'hc1', role: 'head_coach', team_id: 't1', ride_group_id: null, name: 'HC', team_name: 'Team' };

function minimalRosterState(overrides = {}) {
  return {
    roster_filter: 'all',
    roster_group_filter: 'all',
    taking_attendance: false,
    today_practice: null,
    authUser: { email: 'hc@example.com', name: 'HC' },
    draft: {},
    expandedId: null,
    ...overrides,
  };
}

describe('viewRoster — group-assign button on coach rows', () => {
  it('shows the reassign-group button on a coach row for an HC/TD caller', () => {
    saveCachedIdentity([HC_PERSONA]);
    const coach = savePerson({ name: 'Floater Coach', role: 'coach' });
    const html = viewRoster(minimalRosterState());
    expect(html).toContain(`data-a="open-assign-group" data-id="${coach.id}"`);
  });

  it('still shows it on an athlete row too (unaffected regression check)', () => {
    saveCachedIdentity([HC_PERSONA]);
    const athlete = savePerson({ name: 'Rider', role: 'athlete' });
    const html = viewRoster(minimalRosterState());
    expect(html).toContain(`data-a="open-assign-group" data-id="${athlete.id}"`);
  });

  it('does not show it on a coach row when the caller is not HC/TD', () => {
    saveCachedIdentity([{ ...HC_PERSONA, role: 'coach', ride_group_id: 'g1' }]);
    const coach = savePerson({ name: 'Floater Coach', role: 'coach' });
    const html = viewRoster(minimalRosterState());
    expect(html).not.toContain(`data-a="open-assign-group" data-id="${coach.id}"`);
  });

  it('does not show it on a coach row when signed out', () => {
    saveCachedIdentity([HC_PERSONA]);
    const coach = savePerson({ name: 'Floater Coach', role: 'coach' });
    const html = viewRoster(minimalRosterState({ authUser: null }));
    expect(html).not.toContain(`data-a="open-assign-group" data-id="${coach.id}"`);
  });
});
