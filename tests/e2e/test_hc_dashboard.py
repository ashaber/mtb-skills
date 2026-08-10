"""
Phase 3.4 MVP — HC/TD Team Dashboard (src/views.js viewHcDashboard).

Coverage note: like every other isAuthConfigured()-gated feature in this app
(Settings → Account/Sync, Roster Import — see src/auth.js, src/views.js),
this view only renders once a coach is signed in AND their backend persona
carries head_coach/team_director. The e2e build (tests/e2e/conftest.py's
`base_url` fixture) never sets VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY, so
isAuthConfigured() is false for the whole suite and no existing test drives
a signed-in session either — there's no authed-build fixture in this repo
yet. Full click-through coverage of "HC signs in -> opens dashboard -> sees
their roster" would need one; that's test-infra work shared by every
auth-gated feature, out of scope for this change.

What IS meaningfully testable without that infra, and what these tests
cover:
  1. The entry point stays hidden for the default (signed-out) coach --
     a real regression guard against the button leaking into the UI
     unconditionally.
  2. The view's own defense-in-depth gate (src/views.js's
     isHcOrTd(getCachedIdentity()?.personas) check inside viewHcDashboard,
     independent of the Settings button's visibility) actually renders an
     access-required message rather than roster data when reached directly
     -- exercised by dispatching the real `open-hc-dashboard` click-
     delegation handler (src/main.js's onAppClick), not a mock.
The pure aggregation logic itself (attendance-window selection, rate calc,
per-skill level lookup, row building) is unit-tested in
tests/unit/hc-dashboard.test.js.
"""
from playwright.sync_api import Page, expect


def test_team_dashboard_hidden_without_auth(page: Page) -> None:
    page.click('[data-a="switch-tab"][data-tab="settings"]')
    expect(page.locator('[data-a="open-hc-dashboard"]')).to_have_count(0)
    expect(page.get_by_text('Team dashboard')).to_have_count(0)


def test_team_dashboard_view_gates_on_hc_td_persona(page: Page) -> None:
    # No cached identity at all (never synced / signed out) -> isHcOrTd()
    # sees an empty personas list either way, but exercise the click path
    # for real rather than asserting on cached state alone.
    # Dispatched via a real DOM click (not page.click(), which requires the
    # element to be visible/unobstructed) -- this element only exists to
    # trigger main.js's real document.body click-delegation handler
    # (onAppClick), the same code path the hidden Settings button would use.
    page.evaluate("""() => {
        const btn = document.createElement('button');
        btn.dataset.a = 'open-hc-dashboard';
        btn.id = 'test-open-hc-dashboard';
        document.body.appendChild(btn);
        btn.click();
    }""")
    expect(page.get_by_text('Head-coach or team-director access required')).to_be_visible()
    # Never falls through to rendering the roster table for an unauthorized caller.
    expect(page.locator('.hc-dash-table')).to_have_count(0)
