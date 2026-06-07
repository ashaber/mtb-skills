"""
Phase 1 Playwright test suite.
Each test gets a fresh browser context (clean localStorage) parameterised
across Chromium (412×915 Android) and WebKit (390×844 iOS Safari).
"""
import json
import shutil
import pytest
from playwright.sync_api import Page, expect


# ── Helpers ───────────────────────────────────────────────────────────────────

def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="add-athlete"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-athlete"]')


def open_athlete(page: Page, name: str) -> None:
    page.get_by_text(name, exact=True).click()


def open_skill(page: Page, skill: str) -> None:
    page.click(f'[data-a="go-skill"][data-skill="{skill}"]')


def pick_level(page: Page, n: int) -> None:
    page.click(f'[data-a="pick"][data-n="{n}"]')


def confirm_skill(page: Page, skill: str, level: int) -> None:
    """Open skill view, confirm a level, navigate back to athlete profile."""
    open_skill(page, skill)
    pick_level(page, level)
    page.click('[data-a="confirm-lv"]')
    page.click('[data-a="go-athlete"]')


# ── Load ──────────────────────────────────────────────────────────────────────

def test_app_loads(page: Page) -> None:
    expect(page.locator('.hdr-title')).to_have_text('MTB Skills')


def test_roster_empty_state(page: Page) -> None:
    expect(page.get_by_text('No athletes yet')).to_be_visible()


# ── Roster & athlete profile ──────────────────────────────────────────────────

def test_add_athlete(page: Page) -> None:
    add_athlete(page, 'Sam Rivera')
    expect(page.get_by_text('Sam Rivera')).to_be_visible()


def test_athlete_profile_shows_skills(page: Page) -> None:
    add_athlete(page, 'Jordan Lee')
    open_athlete(page, 'Jordan Lee')
    expect(page.get_by_text('Trail Readiness')).to_be_visible()
    for skill_name in ('Body Position', 'Braking', 'Cornering'):
        expect(page.get_by_text(skill_name)).to_be_visible()


def test_delete_athlete(page: Page) -> None:
    add_athlete(page, 'To Delete')
    open_athlete(page, 'To Delete')
    page.on('dialog', lambda d: d.accept())
    page.click('[data-a="del-athlete"]')
    expect(page.get_by_text('To Delete')).not_to_be_visible()


# ── Observations ──────────────────────────────────────────────────────────────

def test_log_observation(page: Page) -> None:
    add_athlete(page, 'Morgan Kim')
    open_athlete(page, 'Morgan Kim')
    open_skill(page, 'braking')
    pick_level(page, 3)
    page.click('[data-a="log-obs"]')
    expect(page.locator('.obs-row')).to_have_count(1)


def test_observation_history_multiple(page: Page) -> None:
    add_athlete(page, 'Casey Storm')
    open_athlete(page, 'Casey Storm')
    open_skill(page, 'cornering')
    for level in (2, 3, 2):
        pick_level(page, level)
        page.click('[data-a="log-obs"]')
    expect(page.locator('.obs-row')).to_have_count(3)


def test_picker_toggle(page: Page) -> None:
    """Tapping the same level twice deselects it."""
    add_athlete(page, 'Devon Cruz')
    open_athlete(page, 'Devon Cruz')
    open_skill(page, 'body_position')
    pick_level(page, 2)
    expect(page.locator('[data-a="log-obs"]')).to_be_visible()
    pick_level(page, 2)  # toggle off
    expect(page.locator('[data-a="log-obs"]')).not_to_be_visible()


# ── Confirmed level ───────────────────────────────────────────────────────────

def test_confirm_level_updates_header_badge(page: Page) -> None:
    add_athlete(page, 'Alex Chen')
    open_athlete(page, 'Alex Chen')
    open_skill(page, 'body_position')
    pick_level(page, 2)
    page.click('[data-a="confirm-lv"]')
    # Skill view header should now show the confirmed level badge
    expect(page.locator('.hdr .lv2')).to_be_visible()


def test_confirm_level_updates_roster_chip(page: Page) -> None:
    add_athlete(page, 'Priya Singh')
    open_athlete(page, 'Priya Singh')
    confirm_skill(page, 'braking', 3)
    page.click('[data-a="go-roster"]')
    # Roster chip for Priya should show a lv3 badge
    row = page.locator('.row', has_text='Priya Singh')
    expect(row.locator('.lv3')).to_be_visible()


# ── Trail readiness ───────────────────────────────────────────────────────────

def test_trail_readiness_starts_empty(page: Page) -> None:
    add_athlete(page, 'New Rider')
    open_athlete(page, 'New Rider')
    expect(page.locator('.pill-yes')).to_have_count(0)


def test_trail_readiness_green(page: Page) -> None:
    """BP≥2, Braking≥2, Cornering≥1 unlocks Green."""
    add_athlete(page, 'Riley Park')
    open_athlete(page, 'Riley Park')
    for skill, level in (('body_position', 2), ('braking', 2), ('cornering', 1)):
        confirm_skill(page, skill, level)
    expect(page.locator('.pill-yes')).to_have_count(1)
    expect(page.locator('.pill-yes')).to_contain_text('Green')


def test_trail_readiness_black(page: Page) -> None:
    """3-3-3 unlocks Green, Blue, and Black (not Double Black)."""
    add_athlete(page, 'Kai Torres')
    open_athlete(page, 'Kai Torres')
    for skill in ('body_position', 'braking', 'cornering'):
        confirm_skill(page, skill, 3)
    expect(page.locator('.pill-yes')).to_have_count(3)
    expect(page.locator('.pill-no')).to_have_count(1)  # Dbl Black still locked


# ── Rubric reference ──────────────────────────────────────────────────────────

def test_rubric_toggle(page: Page) -> None:
    add_athlete(page, 'Drew Tang')
    open_athlete(page, 'Drew Tang')
    open_skill(page, 'braking')
    expect(page.locator('.fail-list')).to_have_count(0)
    page.click('[data-a="toggle-rubric"]')
    expect(page.locator('.fail-list')).to_have_count(1)
    page.click('[data-a="toggle-rubric"]')
    expect(page.locator('.fail-list')).to_have_count(0)


def test_rubric_updates_with_picked_level(page: Page) -> None:
    add_athlete(page, 'Finley Bowen')
    open_athlete(page, 'Finley Bowen')
    open_skill(page, 'cornering')
    page.click('[data-a="toggle-rubric"]')
    pick_level(page, 4)
    # Rubric header should mention level 4
    expect(page.locator('.rubric-toggle')).to_contain_text('Level 4')


# ── Persistence ───────────────────────────────────────────────────────────────

def test_persist_across_reload(page: Page, base_url: str) -> None:
    """Athlete and observation survive a full page reload."""
    add_athlete(page, 'Phoenix Dunn')
    open_athlete(page, 'Phoenix Dunn')
    open_skill(page, 'braking')
    pick_level(page, 3)
    page.click('[data-a="log-obs"]')
    page.reload()
    expect(page.get_by_text('Phoenix Dunn')).to_be_visible()
    open_athlete(page, 'Phoenix Dunn')
    open_skill(page, 'braking')
    expect(page.locator('.obs-row')).to_have_count(1)


# ── Offline ───────────────────────────────────────────────────────────────────

def test_offline_interactions(page: Page) -> None:
    """After cutting the network, all localStorage-backed interactions still work."""
    add_athlete(page, 'Sage Okafor')
    page.context.set_offline(True)
    open_athlete(page, 'Sage Okafor')
    open_skill(page, 'cornering')
    pick_level(page, 2)
    page.click('[data-a="log-obs"]')
    expect(page.locator('.obs-row')).to_have_count(1)
    page.context.set_offline(False)


# ── Export / import ───────────────────────────────────────────────────────────

def test_json_export_structure(page: Page) -> None:
    """Exported file contains all required keys; athlete data and log are present."""
    add_athlete(page, 'Taylor West')
    open_athlete(page, 'Taylor West')
    open_skill(page, 'braking')
    pick_level(page, 3)
    page.click('[data-a="log-obs"]')
    page.goto(page.url)  # back to root (reload)
    page.click('[data-a="open-settings"]')
    with page.expect_download() as dl_info:
        page.click('[data-m="export"]')
    dl = dl_info.value
    assert dl.suggested_filename.startswith('mtb-skills-')
    assert dl.suggested_filename.endswith('.json')
    with open(dl.path()) as f:
        data = json.load(f)
    for key in ('athletes', 'observations', 'confirmed_levels', 'log', 'exported_at', 'schema_version'):
        assert key in data, f'Export missing key: {key}'
    assert any(a['name'] == 'Taylor West' for a in data['athletes']), 'Athlete missing from export'
    athlete = next(a for a in data['athletes'] if a['name'] == 'Taylor West')
    assert 'team_id' in athlete
    assert 'id' in athlete
    assert len(data['log']) > 0, 'Log should contain at least the app.init entry'


def test_import_round_trip(page: Page, base_url: str, tmp_path) -> None:
    """Export → clear → import restores all data with no loss."""
    add_athlete(page, 'Import Test')
    open_athlete(page, 'Import Test')
    open_skill(page, 'braking')
    pick_level(page, 3)
    page.click('[data-a="log-obs"]')
    pick_level(page, 3)
    page.click('[data-a="confirm-lv"]')
    # Navigate back to roster to export
    page.click('[data-a="go-athlete"]')
    page.click('[data-a="go-roster"]')
    page.click('[data-a="open-settings"]')
    with page.expect_download() as dl_info:
        page.click('[data-m="export"]')
    export_path = tmp_path / 'backup.json'
    shutil.copy(dl_info.value.path(), export_path)
    # Clear all data
    page.locator('[data-m="close"]').click()
    page.evaluate('localStorage.clear()')
    page.reload()
    expect(page.get_by_text('No athletes yet')).to_be_visible()
    # Import
    page.click('[data-a="open-settings"]')
    page.set_input_files('#imp-file', str(export_path))
    expect(page.get_by_text('Import Test')).to_be_visible()
    # Verify observation persisted
    open_athlete(page, 'Import Test')
    open_skill(page, 'braking')
    expect(page.locator('.obs-row')).to_have_count(1)
    expect(page.locator('.hdr .lv3')).to_be_visible()  # confirmed level badge
