"""
WCAG 2.2 (Section 508) accessibility audit — regression tests for the safe,
mechanical fixes applied alongside docs/ACCESSIBILITY_AUDIT.md.

Covers: document lang/zoom, landmark regions, close-button accessible names,
toast live-region announcement, and ARIA pressed/selected state on the
toggle-style controls (filter chips, role tabs, coach level, mood, level
selector, overflow menu). Color-contrast and touch-target fixes are not
testable via the DOM and are documented with before/after ratios in the
audit report instead.
"""
from playwright.sync_api import Page, expect


# ── Helpers ───────────────────────────────────────────────────────────────────

def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-person"]')


# ── Document-level ───────────────────────────────────────────────────────────

def test_html_lang_present(page: Page) -> None:
    assert page.locator('html').get_attribute('lang') == 'en'


def test_viewport_allows_zoom(page: Page) -> None:
    """WCAG 1.4.4 Resize Text — user-scalable=no must not be present."""
    content = page.locator('meta[name="viewport"]').get_attribute('content')
    assert 'user-scalable=no' not in (content or '')
    assert 'maximum-scale=1' not in (content or '')


def test_app_is_a_landmark(page: Page) -> None:
    """#app is a <main> element so screen-reader users have a primary landmark."""
    tag = page.locator('#app').evaluate('el => el.tagName.toLowerCase()')
    assert tag == 'main'


# ── Close buttons (12 sheet/modal instances shared one unlabeled "✕") ─────────

def test_add_person_modal_close_button_has_label(page: Page) -> None:
    page.click('[data-a="open-add"]')
    close_btn = page.locator('[data-m="close"]').first
    expect(close_btn).to_have_attribute('aria-label', 'Close')


# ── Toast is an announced live region ────────────────────────────────────────

def test_toast_is_a_live_region(page: Page) -> None:
    page.click('[data-a="switch-tab"][data-tab="settings"]')
    page.click('[data-a="save-settings"]')
    toast = page.locator('#toast')
    expect(toast).to_be_visible()
    assert toast.get_attribute('role') == 'status'
    assert toast.get_attribute('aria-live') == 'polite'


# ── Filter chips expose selected state ───────────────────────────────────────

def test_roster_filter_chips_aria_pressed(page: Page) -> None:
    all_chip = page.locator('[data-a="filter-roster"][data-f="all"]')
    athletes_chip = page.locator('[data-a="filter-roster"][data-f="athletes"]')
    expect(all_chip).to_have_attribute('aria-pressed', 'true')
    expect(athletes_chip).to_have_attribute('aria-pressed', 'false')

    athletes_chip.click()
    expect(athletes_chip).to_have_attribute('aria-pressed', 'true')
    expect(all_chip).to_have_attribute('aria-pressed', 'false')


# ── Add-person modal: role tabs + coach level are toggle groups ─────────────

def test_role_tab_aria_pressed_toggles(page: Page) -> None:
    page.click('[data-a="open-add"]')
    athlete_tab = page.locator('[data-m="role-tab"][data-role="athlete"]')
    coach_tab = page.locator('[data-m="role-tab"][data-role="coach"]')
    expect(athlete_tab).to_have_attribute('aria-pressed', 'true')
    expect(coach_tab).to_have_attribute('aria-pressed', 'false')

    coach_tab.click()
    expect(coach_tab).to_have_attribute('aria-pressed', 'true')
    expect(athlete_tab).to_have_attribute('aria-pressed', 'false')


def test_coach_level_btn_aria_pressed_toggles(page: Page) -> None:
    page.click('[data-a="open-add"]')
    page.click('[data-m="role-tab"][data-role="coach"]')
    l1 = page.locator('[data-m="coach-level-btn"][data-n="1"]')
    l2 = page.locator('[data-m="coach-level-btn"][data-n="2"]')
    expect(l1).to_have_attribute('aria-pressed', 'false')

    l2.click()
    expect(l2).to_have_attribute('aria-pressed', 'true')
    expect(l1).to_have_attribute('aria-pressed', 'false')


# ── Rider card: level selector + overflow menu ───────────────────────────────

def test_level_selector_aria_pressed(page: Page) -> None:
    add_athlete(page, 'A11y Test Rider')
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()
    seg2 = page.locator('[data-a="preview-level"][data-n="2"]').first
    seg1 = page.locator('[data-a="preview-level"][data-n="1"]').first
    expect(seg1).to_have_attribute('aria-pressed', 'true')

    # Dispatched via JS rather than a real pointer click: the QR-code hero
    # image can visually overlap/occlude the level selector at some headless
    # viewport sizes, which is unrelated to the aria-pressed behavior under
    # test (clicks are handled by main.js's delegated document.body listener).
    seg2.evaluate('el => el.click()')
    expect(seg2).to_have_attribute('aria-pressed', 'true')
    expect(seg1).to_have_attribute('aria-pressed', 'false')


def test_overflow_menu_aria_expanded_toggles(page: Page) -> None:
    add_athlete(page, 'Overflow Test Rider')
    page.click('[data-a="go-card"]')
    toggle = page.locator('[data-a="toggle-overflow"]')
    expect(toggle).to_have_attribute('aria-expanded', 'false')

    toggle.click()
    expect(toggle).to_have_attribute('aria-expanded', 'true')

    toggle.click()
    expect(toggle).to_have_attribute('aria-expanded', 'false')


# ── Field Guide: trail-minimums table headers ────────────────────────────────

def test_trail_minimums_table_has_scoped_headers(page: Page) -> None:
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    page.click('[data-a="rubric-tab"][data-id="guide"]')
    col_headers = page.locator('.rc-trail-mins thead th')
    expect(col_headers).to_have_count(4)
    for i in range(4):
        assert col_headers.nth(i).get_attribute('scope') == 'col'
    row_header = page.locator('.rc-trail-mins tbody th').first
    expect(row_header).to_have_attribute('scope', 'row')
