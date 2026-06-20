"""
Deferred sprint 1d UX features:
- Single-click level recording (roster inline expand)
- Settings: app-share QR code
- Settings: About section
"""
import pytest
from playwright.sync_api import Page, expect


def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-person"]')


def expand_row(page: Page, name: str) -> None:
    """Open inline accordion for a row. Clicks .row-body so pName abbreviation doesn't matter."""
    row = page.locator('.row-card').filter(has_text=name).first
    if not row.locator('.row-expand').is_visible():
        row.locator('.row-body').click()


# ── Single-click level recording ──────────────────────────────────────────────

def test_tapping_level_in_roster_records_observation(page: Page) -> None:
    add_athlete(page, 'Tap Rider')
    expand_row(page, 'Tap Rider')

    row = page.locator('.row-card').filter(has_text='Tap Rider').first
    row.locator('.lv-seg[data-sk="body_position"][data-n="3"]').click()

    expect(page.locator('#toast')).to_contain_text('Lv 3 recorded')


def test_single_click_updates_score_chip(page: Page) -> None:
    add_athlete(page, 'Chip Rider')
    expand_row(page, 'Chip Rider')

    row = page.locator('.row-card').filter(has_text='Chip Rider').first
    row.locator('.lv-seg[data-sk="braking"][data-n="2"]').click()

    # Collapse and re-expand — score chip should show 2
    row.locator('.row-body').click()
    row.locator('.row-body').click()
    expect(row.locator('.score-chip').nth(1)).to_contain_text('2')


def test_single_click_shows_in_card_history(page: Page) -> None:
    add_athlete(page, 'Hist Rider')
    expand_row(page, 'Hist Rider')

    row = page.locator('.row-card').filter(has_text='Hist Rider').first
    row.locator('.lv-seg[data-sk="cornering"][data-n="4"]').click()

    # Navigate to full card — confirmed level for cornering should be 4
    page.locator('[data-a="go-card"]').filter(has_text='Open full rider card').click()
    expect(page.locator('.card-view')).to_be_visible()
    expect(page.locator('.skill-block').filter(has_text='CORNERING')).to_contain_text('LEVEL 4')


def test_no_log_observation_button_in_roster_expand(page: Page) -> None:
    add_athlete(page, 'No Btn')
    expand_row(page, 'No Btn')
    row = page.locator('.row-card').filter(has_text='No Btn').first
    expect(row.locator('[data-a="log-session"]')).to_have_count(0)


def test_open_full_rider_card_button_still_present(page: Page) -> None:
    add_athlete(page, 'Card Link')
    expand_row(page, 'Card Link')
    row = page.locator('.row-card').filter(has_text='Card Link').first
    expect(row.locator('.expand-actions [data-a="go-card"]')).to_be_visible()


# ── Settings: QR + About ──────────────────────────────────────────────────────

def test_coach_share_card_opens_qr(page: Page) -> None:
    """Share button on a coach card must open the QR modal (was broken: getAthletes excluded coaches)."""
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', 'Coach Dan')
    page.click('[data-m="role-tab"][data-role="coach"]')
    page.click('[data-m="coach-level-btn"][data-n="2"]')
    page.click('[data-m="save-person"]')
    # Coaches have no mono-btn; expand row then open full card
    expand_row(page, 'Coach Dan')
    page.locator('.row-card').filter(has_text='Coach Dan').locator('[data-a="go-card"]').click()
    page.click('[data-a="share-card"]')
    expect(page.locator('.share-qr')).to_be_visible(timeout=5000)


def test_settings_modal_opens(page: Page) -> None:
    page.click('[data-a="open-settings"]')
    expect(page.locator('.modal-sheet')).to_contain_text('Settings')


def test_settings_shows_qr_code(page: Page) -> None:
    page.click('[data-a="open-settings"]')
    expect(page.locator('.modal-sheet img[alt="App QR code"]')).to_be_visible(timeout=4000)


def test_settings_shows_about_section(page: Page) -> None:
    page.click('[data-a="open-settings"]')
    expect(page.locator('.modal-sheet')).to_contain_text('About')
    expect(page.locator('.modal-sheet')).to_contain_text('Works offline')


def test_settings_save_still_works(page: Page) -> None:
    page.click('[data-a="open-settings"]')
    page.fill('#inp-team', 'Test League')
    page.click('[data-m="save-settings"]')
    expect(page.locator('.modal-sheet')).to_be_hidden()
    expect(page.locator('.hdr-kicker')).to_contain_text('Test League')
