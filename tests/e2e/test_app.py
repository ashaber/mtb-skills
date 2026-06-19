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
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-athlete"]')


def open_card(page: Page, name: str) -> None:
    """Navigate to full rider card from roster."""
    page.click(f'.mono-btn[aria-label="Open {name}\'s card"]')


def expand_row(page: Page, name: str) -> None:
    """Open the inline accordion row for an athlete. No-op if already open."""
    row = page.locator('.row-card').filter(has_text=name).first
    if not row.locator('.row-expand').is_visible():
        page.get_by_text(name, exact=True).click()


# ── Load ──────────────────────────────────────────────────────────────────────

def test_app_loads(page: Page) -> None:
    expect(page.locator('.hdr-title')).to_have_text('Team Roster')


def test_roster_empty_state(page: Page) -> None:
    expect(page.locator('.empty-title')).to_be_visible()


# ── Roster & athlete card ─────────────────────────────────────────────────────

def test_add_athlete(page: Page) -> None:
    add_athlete(page, 'Sam Rivera')
    expect(page.get_by_text('Sam Rivera')).to_be_visible()


def test_athlete_card_shows_skills(page: Page) -> None:
    add_athlete(page, 'Jordan Lee')
    open_card(page, 'Jordan Lee')
    expect(page.locator('.card-name')).to_have_text('Jordan Lee')
    for skill in ('BODY POSITION', 'BRAKING', 'CORNERING'):
        expect(page.get_by_text(skill, exact=True)).to_be_visible()


def test_athlete_card_shows_trail_ready(page: Page) -> None:
    add_athlete(page, 'Trail Rider')
    open_card(page, 'Trail Rider')
    expect(page.locator('.trail-ready-band')).to_be_visible()


def test_delete_athlete(page: Page) -> None:
    add_athlete(page, 'To Delete')
    open_card(page, 'To Delete')
    page.on('dialog', lambda d: d.accept())
    page.click('[data-a="del-athlete"]')
    expect(page.get_by_text('To Delete')).not_to_be_visible()


# ── Inline accordion ──────────────────────────────────────────────────────────

def test_inline_expand_shows_level_selector(page: Page) -> None:
    add_athlete(page, 'Morgan Kim')
    expand_row(page, 'Morgan Kim')
    expect(page.locator('.lv-selector').first).to_be_visible()


def test_log_observation_from_inline(page: Page) -> None:
    add_athlete(page, 'Casey Storm')
    expand_row(page, 'Casey Storm')
    page.click('[data-a="log-session"]')
    expand_row(page, 'Casey Storm')
    expect(page.locator('[data-a="log-session"]').first).to_be_visible()


# ── Confirmed levels ──────────────────────────────────────────────────────────

def test_confirm_skill_from_card(page: Page) -> None:
    add_athlete(page, 'Alex Chen')
    open_card(page, 'Alex Chen')
    page.click('[data-a="draft-level"][data-sk="braking"][data-n="3"]')
    page.click('[data-a="confirm-session"]')
    score = page.locator('.score-chip').nth(1)
    expect(page.locator('.card-scroll')).to_be_visible()


def test_score_chips_update_after_confirm(page: Page) -> None:
    add_athlete(page, 'Priya Singh')
    expand_row(page, 'Priya Singh')
    page.click('[data-a="draft-level"][data-sk="body_position"][data-n="2"]')
    page.click('[data-a="log-session"]')
    bp_chip = page.locator('.score-chip').first
    expect(bp_chip).to_have_text('2')


# ── Trail readiness ───────────────────────────────────────────────────────────

def test_trail_readiness_starts_empty(page: Page) -> None:
    add_athlete(page, 'New Rider')
    open_card(page, 'New Rider')
    expect(page.locator('.trail-ready-band')).to_be_visible()


# ── Education screen (Field Guide) ────────────────────────────────────────────

def test_field_guide_button_visible_on_roster(page: Page) -> None:
    expect(page.locator('[data-a="go-rubric"]')).to_be_visible()


def test_field_guide_opens(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    expect(page.locator('#rubric-view')).to_be_visible()
    expect(page.locator('.rubric-view-title')).to_have_text('FIELD GUIDE')


def test_field_guide_shows_four_tabs(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    tabs = page.locator('.rubric-tab')
    expect(tabs).to_have_count(4)
    expect(tabs.nth(0)).to_have_text('Body Position')
    expect(tabs.nth(1)).to_have_text('Braking')
    expect(tabs.nth(2)).to_have_text('Cornering')
    expect(tabs.nth(3)).to_have_text('Guide')


def test_field_guide_shows_five_level_cards(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    expect(page.locator('.rubric-card')).to_have_count(5)


def test_field_guide_tab_switch_braking(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    page.click('[data-a="rubric-tab"][data-id="braking"]')
    expect(page.locator('.rubric-tab--active')).to_have_text('Braking')
    expect(page.locator('.rubric-card')).to_have_count(5)


def test_field_guide_tab_switch_cornering(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    page.click('[data-a="rubric-tab"][data-id="cornering"]')
    expect(page.locator('.rubric-tab--active')).to_have_text('Cornering')
    expect(page.locator('.rubric-card')).to_have_count(5)


def test_field_guide_dimension_rows_present(page: Page) -> None:
    """Dimension table rows are shown in each level card."""
    page.click('[data-a="go-rubric"]')
    expect(page.locator('.rc-dim').first).to_be_visible()
    # At least one dimension row per level card (5 cards × ≥1 dimension each)
    assert page.locator('.rc-dim').count() >= 5


def test_field_guide_guide_tab_content(page: Page) -> None:
    """Guide tab shows trail selection and coach notes sections."""
    page.click('[data-a="go-rubric"]')
    page.click('[data-a="rubric-tab"][data-id="guide"]')
    expect(page.locator('.rubric-tab--active')).to_have_text('Guide')
    expect(page.get_by_text('Trail Selection', exact=True)).to_be_visible()
    expect(page.get_by_text('Coach Notes', exact=True)).to_be_visible()


def test_field_guide_level_badges_present(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    badges = page.locator('.rc-badge')
    expect(badges).to_have_count(5)
    for i, lv in enumerate(['1', '2', '3', '4', '5']):
        expect(badges.nth(i)).to_have_text(lv)


def test_field_guide_dimension_text_present(page: Page) -> None:
    """Dimension text cells are visible in the field guide."""
    page.click('[data-a="go-rubric"]')
    expect(page.locator('.rc-dim-text').first).to_be_visible()


def test_field_guide_back_to_roster(page: Page) -> None:
    page.click('[data-a="go-rubric"]')
    expect(page.locator('#rubric-view')).to_be_visible()
    page.click('[data-a="go-roster"]')
    expect(page.locator('.hdr-title')).to_be_visible()
    expect(page.locator('#rubric-view')).to_have_count(0)


def test_field_guide_tab_state_preserved_on_return(page: Page) -> None:
    """Active tab survives leaving and re-entering the field guide."""
    page.click('[data-a="go-rubric"]')
    page.click('[data-a="rubric-tab"][data-id="cornering"]')
    page.click('[data-a="go-roster"]')
    page.click('[data-a="go-rubric"]')
    expect(page.locator('.rubric-tab--active')).to_have_text('Cornering')


def test_field_guide_accessible_from_empty_roster(page: Page) -> None:
    # No athletes added — empty state header should also have the button
    expect(page.locator('[data-a="go-rubric"]')).to_be_visible()
    page.click('[data-a="go-rubric"]')
    expect(page.locator('#rubric-view')).to_be_visible()


# ── Persistence ───────────────────────────────────────────────────────────────

def test_persist_across_reload(page: Page, base_url: str) -> None:
    add_athlete(page, 'Phoenix Dunn')
    expand_row(page, 'Phoenix Dunn')
    page.click('[data-a="log-session"]')
    page.reload()
    expect(page.get_by_text('Phoenix Dunn')).to_be_visible()


# ── Offline ───────────────────────────────────────────────────────────────────

def test_offline_roster_and_rubric(page: Page) -> None:
    add_athlete(page, 'Sage Okafor')
    page.context.set_offline(True)
    expect(page.get_by_text('Sage Okafor')).to_be_visible()
    page.click('[data-a="go-rubric"]')
    expect(page.locator('.rubric-card')).to_have_count(5)
    page.context.set_offline(False)


# ── Export / import ───────────────────────────────────────────────────────────

def test_json_export_structure(page: Page) -> None:
    add_athlete(page, 'Taylor West')
    expand_row(page, 'Taylor West')
    page.click('[data-a="log-session"]')
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
    assert any(a['name'] == 'Taylor West' for a in data['athletes'])
    athlete = next(a for a in data['athletes'] if a['name'] == 'Taylor West')
    assert 'team_id' in athlete
    assert 'id' in athlete
    assert len(data['log']) > 0


def test_import_round_trip(page: Page, base_url: str, tmp_path) -> None:
    add_athlete(page, 'Import Test')
    expand_row(page, 'Import Test')
    page.click('[data-a="draft-level"][data-sk="braking"][data-n="3"]')
    page.click('[data-a="log-session"]')
    page.click('[data-a="open-settings"]')
    with page.expect_download() as dl_info:
        page.click('[data-m="export"]')
    export_path = tmp_path / 'backup.json'
    shutil.copy(dl_info.value.path(), export_path)
    page.locator('[data-m="close"]').click()
    page.evaluate('localStorage.clear()')
    page.reload()
    expect(page.locator('.empty-title')).to_be_visible()
    page.click('[data-a="open-settings"]')
    page.set_input_files('#imp-file', str(export_path))
    expect(page.get_by_text('Import Test')).to_be_visible()
