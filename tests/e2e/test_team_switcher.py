"""
D26 team switcher — Playwright coverage for the "no behavior change for a
single-persona / no-backend coach" constraint from the task brief.

The shared `page` fixture (tests/e2e/conftest.py) builds the app with no
VITE_SUPABASE_URL/VITE_BACKEND_URL set, so isAuthConfigured() is false and
runSync()/initAuthSync() no-op entirely for the whole suite (see
src/auth.js's isAuthConfigured() and src/main.js's boot sequence) — the
exact "default/offline" configuration the vast majority of coaches run in
today. That makes this file's assertions genuine, zero-mock regression
coverage for the D26 task brief's constraint 3 ("A single-persona coach
must see NO picker and NO behavior change at all — this is strictly
additive for the >1 case"): the team-switcher UI must be completely inert
here, both for the true default (no cached identity at all) and for the
defensive case where a stale multi-persona identity happens to be cached
locally (e.g. left over from a prior signed-in session) but auth isn't
configured this run.

Interactive coverage of the >1-persona picker flow itself (open, select,
re-scope) lives at the unit level: tests/unit/sync.test.js (syncNow's
needsTeamSelection / team_id-scoped pulls) and tests/unit/views.test.js
(modalTeamSwitcher / viewSettings rendering) exercise the actual decision
logic and DOM output directly. A full browser-level walkthrough would
additionally require mocking Supabase's OAuth/session flow end to end,
which is new test infrastructure this repo doesn't have yet for ANY
auth-gated feature (not just this one) — out of scope for this increment.
"""
from playwright.sync_api import Page, expect


def open_settings(page: Page) -> None:
    page.click('[data-a="switch-tab"][data-tab="settings"]')


def test_no_team_switcher_ui_on_load(page: Page) -> None:
    """Nothing about the team switcher should be visible before the coach
    has done anything at all."""
    expect(page.locator('.sheet-scroll')).to_have_count(0)
    expect(page.get_by_text('Switch Team', exact=True)).to_have_count(0)


def test_settings_shows_no_switch_team_control_when_signed_out(page: Page) -> None:
    open_settings(page)
    expect(page.locator('.hdr-title')).to_have_text('Settings')
    expect(page.get_by_text('Switch team', exact=True)).to_have_count(0)


def test_settings_still_shows_no_switch_team_control_with_a_stale_cached_multi_persona_identity(page: Page) -> None:
    """Defensive case: a coach who previously signed in on a build that HAD
    a backend configured could have a >1-persona `mtb_identity` cache left
    on the device. With auth unconfigured this run (this suite's build),
    the whole Account section — and therefore the team-switcher row inside
    it — must stay hidden regardless of what's cached; it is gated on
    isAuthConfigured() && signed-in, not on persona count alone."""
    page.evaluate("""() => {
        localStorage.setItem('mtb_identity', JSON.stringify({
            personas: [
                { person_id: 'pa', role: 'team_director', team_id: 'team-a', ride_group_id: null, name: 'Coach', team_name: 'Team A' },
                { person_id: 'pb', role: 'coach', team_id: 'team-b', ride_group_id: 'g1', name: 'Coach', team_name: 'Team B' },
            ],
            cached_at: new Date().toISOString(),
        }));
    }""")
    page.reload()
    open_settings(page)
    expect(page.get_by_text('Switch team', exact=True)).to_have_count(0)
    expect(page.get_by_text('Coaching on 2 teams', exact=False)).to_have_count(0)
