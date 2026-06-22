"""
Sprint 1d e2e tests: People schema, roster filter, practice attendance.
"""
import json
import re
import pytest
from playwright.sync_api import Page, expect


# ── Helpers ───────────────────────────────────────────────────────────────────

def add_athlete(page: Page, name: str, category: str = '') -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    if category:
        page.select_option('#inp-category', category)
    page.click('[data-m="save-person"]')


def add_coach(page: Page, name: str, level: str = '2') -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click(f'[data-m="role-tab"][data-role="coach"]')
    page.click(f'[data-m="coach-level-btn"][data-n="{level}"]')
    page.click('[data-m="save-person"]')


def start_attendance(page: Page) -> None:
    """Navigate to Practice tab and start attendance (enters roster attendance mode)."""
    page.click('[data-a="switch-tab"][data-tab="practice"]')
    page.click('[data-a="start-attendance"]')


# ── Add person modal ──────────────────────────────────────────────────────────

def test_add_person_modal_has_role_tabs(page: Page) -> None:
    page.click('[data-a="open-add"]')
    expect(page.locator('[data-m="role-tab"][data-role="athlete"]')).to_be_visible()
    expect(page.locator('[data-m="role-tab"][data-role="coach"]')).to_be_visible()


def test_add_person_modal_defaults_to_athlete(page: Page) -> None:
    page.click('[data-a="open-add"]')
    expect(page.locator('[data-m="role-tab"][data-role="athlete"]')).to_have_class(re.compile(r"role-tab--active"))
    expect(page.locator('#athlete-fields')).to_be_visible()
    expect(page.locator('#coach-fields')).to_be_hidden()


def test_add_person_modal_role_switch_shows_coach_fields(page: Page) -> None:
    page.click('[data-a="open-add"]')
    page.click('[data-m="role-tab"][data-role="coach"]')
    expect(page.locator('#coach-fields')).to_be_visible()
    expect(page.locator('#athlete-fields')).to_be_hidden()
    expect(page.locator('[data-m="coach-level-btn"][data-n="1"]')).to_be_visible()
    expect(page.locator('[data-m="coach-level-btn"][data-n="2"]')).to_be_visible()
    expect(page.locator('[data-m="coach-level-btn"][data-n="3"]')).to_be_visible()


def test_add_person_modal_category_dropdown_has_nine_options(page: Page) -> None:
    page.click('[data-a="open-add"]')
    options = page.locator('#inp-category option')
    # 9 categories + 1 placeholder "— select —"
    expect(options).to_have_count(10)


def test_add_athlete_with_category_appears_on_roster(page: Page) -> None:
    add_athlete(page, 'Sam JV1', 'JV1')
    expect(page.get_by_text('Sam JV1')).to_be_visible()
    # Category label should show in row meta
    expect(page.locator('.row-grade').first).to_have_text('JV1')


def test_add_athlete_ms_advanced_shows_category(page: Page) -> None:
    add_athlete(page, 'Morgan MS', 'MS Advanced')
    expect(page.get_by_text('Morgan MS')).to_be_visible()
    expect(page.locator('.row-grade').first).to_have_text('MS Advanced')


def test_add_coach_appears_on_roster(page: Page) -> None:
    add_coach(page, 'Coach Riley', '2')
    # With default filter (all), coach shows
    expect(page.get_by_text('Coach Riley')).to_be_visible()


def test_add_coach_shows_level_in_row(page: Page) -> None:
    add_coach(page, 'Coach Pat', '3')
    # NICA level appears in row meta (.row-grade) as "L3"
    expect(page.locator('.row-grade').first).to_have_text('L3')


def test_add_coach_shows_skill_chips(page: Page) -> None:
    add_coach(page, 'Coach Kim', '1')
    # Coach rows show BP/BRK/CRN skill chips (same as athletes)
    expect(page.locator('.chips-caret').first).to_contain_text('BP')


def test_coach_requires_level_selection(page: Page) -> None:
    """Saving a coach without selecting a level should not add them."""
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', 'No Level Coach')
    page.click('[data-m="role-tab"][data-role="coach"]')
    # Don't select a level — try saving
    page.click('[data-m="save-person"]')
    # Modal should stay open (flash toast fires, not closed)
    expect(page.locator('#inp-name')).to_be_visible()


# ── Roster filter chips ───────────────────────────────────────────────────────

def test_roster_filter_chips_visible(page: Page) -> None:
    add_athlete(page, 'A')
    expect(page.locator('[data-a="filter-roster"][data-f="all"]')).to_be_visible()
    expect(page.locator('[data-a="filter-roster"][data-f="athletes"]')).to_be_visible()
    expect(page.locator('[data-a="filter-roster"][data-f="coaches"]')).to_be_visible()


def test_roster_filter_chips_visible_on_empty_roster(page: Page) -> None:
    expect(page.locator('[data-a="filter-roster"]')).to_have_count(3)


def test_filter_athletes_hides_coaches(page: Page) -> None:
    add_athlete(page, 'Rider One')
    add_coach(page, 'Coach One', '2')
    page.click('[data-a="filter-roster"][data-f="athletes"]')
    expect(page.get_by_text('Rider One')).to_be_visible()
    expect(page.get_by_text('Coach One')).not_to_be_visible()


def test_filter_coaches_hides_athletes(page: Page) -> None:
    add_athlete(page, 'Rider Two')
    add_coach(page, 'Coach Two', '2')
    page.click('[data-a="filter-roster"][data-f="coaches"]')
    expect(page.get_by_text('Coach Two')).to_be_visible()
    expect(page.get_by_text('Rider Two')).not_to_be_visible()


def test_filter_all_shows_both(page: Page) -> None:
    add_athlete(page, 'Rider All')
    add_coach(page, 'Coach All', '1')
    page.click('[data-a="filter-roster"][data-f="athletes"]')
    page.click('[data-a="filter-roster"][data-f="all"]')
    expect(page.get_by_text('Rider All')).to_be_visible()
    expect(page.get_by_text('Coach All')).to_be_visible()


def test_filter_persists_after_reload(page: Page, base_url: str) -> None:
    add_athlete(page, 'Persist Rider')
    page.click('[data-a="filter-roster"][data-f="coaches"]')
    page.reload()
    # Coaches filter should still be active
    expect(page.locator('[data-a="filter-roster"][data-f="coaches"]')).to_have_class(re.compile(r"filter-chip--active"))



def test_filter_athletes_modal_defaults_to_athlete_role(page: Page) -> None:
    """When athletes filter is active, Add Person modal defaults to athlete."""
    add_athlete(page, 'Rider')
    page.click('[data-a="filter-roster"][data-f="athletes"]')
    page.click('[data-a="open-add"]')
    expect(page.locator('[data-m="role-tab"][data-role="athlete"]')).to_have_class(re.compile(r"role-tab--active"))
    page.click('[data-m="close"]')


def test_filter_coaches_modal_defaults_to_coach_role(page: Page) -> None:
    """When coaches filter is active, Add Person modal defaults to coach."""
    add_athlete(page, 'Rider')
    page.click('[data-a="filter-roster"][data-f="coaches"]')
    page.click('[data-a="open-add"]')
    expect(page.locator('[data-m="role-tab"][data-role="coach"]')).to_have_class(re.compile(r"role-tab--active"))
    page.click('[data-m="close"]')


# ── Practice attendance ───────────────────────────────────────────────────────

def test_start_attendance_button_visible(page: Page) -> None:
    add_athlete(page, 'Any Rider')
    page.click('[data-a="switch-tab"][data-tab="practice"]')
    expect(page.locator('[data-a="start-attendance"]')).to_be_visible()


def test_start_attendance_enters_mode(page: Page) -> None:
    add_athlete(page, 'Attend Rider')
    start_attendance(page)
    expect(page.locator('.hdr-title')).to_have_text('Attendance')
    expect(page.locator('[data-a="exit-attendance"]')).to_be_visible()


def test_attendance_mode_shows_toggle_per_rider(page: Page) -> None:
    add_athlete(page, 'Toggle Rider')
    start_attendance(page)
    expect(page.locator('.attend-toggle').first).to_be_visible()


def test_toggle_attendance_marks_attending(page: Page) -> None:
    add_athlete(page, 'Check Rider')
    start_attendance(page)
    toggle = page.locator('.attend-toggle').first
    toggle.click()
    expect(toggle).to_have_class(re.compile(r"attend-toggle--on"))
    expect(page.locator('.attend-count')).to_contain_text('1 attending')


def test_toggle_attendance_toggles_back(page: Page) -> None:
    add_athlete(page, 'Back Rider')
    start_attendance(page)
    toggle = page.locator('.attend-toggle').first
    toggle.click()  # → attending
    toggle.click()  # → absent
    expect(toggle).not_to_have_class(re.compile(r"attend-toggle--on"))
    expect(page.locator('.attend-count')).to_contain_text('0 attending')


def test_attending_riders_sort_to_top(page: Page) -> None:
    add_athlete(page, 'Zebra')  # sorts last alphabetically
    add_athlete(page, 'Alpha')  # sorts first alphabetically
    start_attendance(page)
    # Zebra is 2nd alphabetically → use nth(1) of the icon toggle buttons
    toggles = page.locator('.attend-toggle')
    toggles.nth(1).click()  # Zebra (second alphabetically)
    page.click('[data-a="exit-attendance"]')
    # After exit, Zebra should be first row (attending sorts to top)
    first_name = page.locator('.row-name').first.inner_text()
    assert 'ZEBRA' in first_name.upper()


def test_exit_attendance_returns_to_roster(page: Page) -> None:
    add_athlete(page, 'Exit Rider')
    start_attendance(page)
    page.click('[data-a="exit-attendance"]')
    expect(page.locator('.hdr-title')).to_have_text('Roster')


def test_attendance_count_shown_in_mode(page: Page) -> None:
    add_athlete(page, 'Count A')
    add_athlete(page, 'Count B')
    start_attendance(page)
    page.locator('[data-a="toggle-attendance"]').first.click()
    expect(page.locator('.attend-count')).to_contain_text('1 attending')


def test_coaches_visible_in_attendance_mode(page: Page) -> None:
    add_coach(page, 'Coach V', '2')  # keep short so pName() doesn't truncate
    start_attendance(page)
    expect(page.get_by_text('Coach V')).to_be_visible()


def test_attendance_export_downloads_file(page: Page) -> None:
    add_athlete(page, 'Export Rider')
    start_attendance(page)
    page.locator('.attend-toggle').first.click()
    page.click('[data-a="switch-tab"][data-tab="practice"]')
    with page.expect_download() as dl_info:
        page.click('[data-a="export-attendance"]')
    dl = dl_info.value
    assert dl.suggested_filename.startswith('attendance-')
    assert dl.suggested_filename.endswith('.json')
    with open(dl.path()) as f:
        data = json.load(f)
    assert 'practice_date' in data
    assert 'attending' in data
    assert any(a['first_name'] == 'Export' for a in data['attending'])


def test_attendance_persists_after_exit_and_reenter(page: Page) -> None:
    """Attendance records survive exiting attendance mode."""
    add_athlete(page, 'Persist A')
    start_attendance(page)
    page.locator('.attend-toggle').first.click()
    page.click('[data-a="exit-attendance"]')
    # Re-enter attendance mode via Practice tab
    start_attendance(page)
    # Toggle should still show as attending
    expect(page.locator('.attend-toggle').first).to_have_class(re.compile(r"attend-toggle--on"))
    expect(page.locator('.attend-count')).to_contain_text('1 attending')


# ── Schema v2 export ──────────────────────────────────────────────────────────

def test_export_schema_v2_includes_people(page: Page) -> None:
    add_athlete(page, 'Export Athlete', 'JV1')
    add_coach(page, 'Export Coach', '2')
    page.click('[data-a="switch-tab"][data-tab="settings"]')
    with page.expect_download() as dl_info:
        page.click('[data-a="export-data"]')
    with open(dl_info.value.path()) as f:
        data = json.load(f)
    assert data['schema_version'] == 2
    assert 'people' in data
    assert any(p['name'] == 'Export Athlete' and p['role'] == 'athlete' for p in data['people'])
    assert any(p['name'] == 'Export Coach' and p['role'] == 'coach' for p in data['people'])


def test_export_includes_practices_and_attendance(page: Page) -> None:
    add_athlete(page, 'Prac Rider')
    start_attendance(page)
    page.locator('.attend-toggle').first.click()
    page.click('[data-a="exit-attendance"]')
    page.click('[data-a="switch-tab"][data-tab="settings"]')
    with page.expect_download() as dl_info:
        page.click('[data-a="export-data"]')
    with open(dl_info.value.path()) as f:
        data = json.load(f)
    assert 'practices' in data
    assert 'attendance' in data
    assert len(data['practices']) >= 1
    assert len(data['attendance']) >= 1
