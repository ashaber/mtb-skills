"""
Conference sprint e2e tests:
- Practice reflection flow (End Practice → sheet → Save or Skip)
- Feedback mode: session overlay, floating button
- Normal URL: no feedback UI
"""
import re
import pytest
from playwright.sync_api import Page, expect


# ── Helpers ───────────────────────────────────────────────────────────────────

def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-person"]')


def start_practice(page: Page) -> None:
    """Go to Practice tab and start a new practice."""
    page.click('[data-a="switch-tab"][data-tab="practice"]')
    page.click('[data-a="start-attendance"]')


def end_practice_via_tab(page: Page) -> None:
    """Navigate to Practice tab and click End Practice to open reflection sheet."""
    page.click('[data-a="switch-tab"][data-tab="practice"]')
    page.click('[data-a="end-practice"]')


# ── Practice reflection ───────────────────────────────────────────────────────

def test_end_practice_opens_reflection_sheet(page: Page) -> None:
    add_athlete(page, 'Reflect Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    expect(page.locator('#sheet')).to_contain_text('End Practice')


def test_reflection_sheet_has_mood_selector(page: Page) -> None:
    add_athlete(page, 'Mood Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    # 5 mood buttons
    expect(page.locator('.mood-btn')).to_have_count(5)


def test_reflection_mood_select_toggles_active(page: Page) -> None:
    add_athlete(page, 'Happy Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    # Click mood 4 (🙂)
    page.locator('.mood-btn[data-n="4"]').click()
    expect(page.locator('.mood-btn[data-n="4"]')).to_have_class(re.compile(r'mood-btn--active'))


def test_reflection_save_ends_practice(page: Page) -> None:
    add_athlete(page, 'Save Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    page.locator('.mood-btn[data-n="3"]').click()
    page.fill('#inp-reflection', 'Great session')
    page.click('[data-m="save-reflection"]')
    # Sheet should close, practice tab should show ended state
    expect(page.locator('#sheet')).to_be_empty()
    expect(page.locator('.practice-meta--ended')).to_be_visible()


def test_reflection_persists_after_reload(page: Page, base_url: str) -> None:
    add_athlete(page, 'Persist Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    page.locator('.mood-btn[data-n="5"]').click()
    page.fill('#inp-reflection', 'Best practice ever')
    page.click('[data-m="save-reflection"]')
    page.reload()
    page.click('[data-a="switch-tab"][data-tab="practice"]')
    # Mood emoji should appear in meta
    expect(page.locator('.practice-meta--ended')).to_contain_text('😊')


def test_skip_ends_practice_without_reflection(page: Page) -> None:
    add_athlete(page, 'Skip Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    page.click('[data-m="skip-end-practice"]')
    expect(page.locator('#sheet')).to_be_empty()
    expect(page.locator('.practice-meta--ended')).to_be_visible()
    # No mood emoji
    expect(page.locator('.practice-meta--ended')).not_to_contain_text('😊')


def test_view_edit_reflection_button_on_ended_practice(page: Page) -> None:
    add_athlete(page, 'View Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    page.click('[data-m="skip-end-practice"]')
    # Ended practice card has a reflection button
    expect(page.locator('[data-a="view-reflection"]')).to_be_visible()


def test_view_reflection_opens_sheet_with_existing_data(page: Page) -> None:
    add_athlete(page, 'Edit Rider')
    start_practice(page)
    page.click('[data-a="exit-attendance"]')
    end_practice_via_tab(page)
    page.fill('#inp-reflection', 'Original note')
    page.click('[data-m="save-reflection"]')
    # Now re-open
    page.click('[data-a="view-reflection"]')
    expect(page.locator('#inp-reflection')).to_have_value('Original note')


# ── Feedback mode ─────────────────────────────────────────────────────────────

def test_feedback_on_by_default(page: Page) -> None:
    """Feedback mode defaults to on — floating button is visible on the normal URL."""
    expect(page.locator('#fb-btn')).to_be_visible(timeout=5000)
    # No session overlay — that was removed in IDEA-014
    expect(page.locator('#fb-overlay')).to_have_count(0)


def test_feedback_off_when_disabled_in_settings(page: Page, base_url: str) -> None:
    """When feedback is toggled off in settings, the button should not appear."""
    # Disable via localStorage before loading
    page.evaluate("() => localStorage.setItem('mtb_feedback_mode', 'false')")
    page.goto(base_url)
    expect(page.locator('#fb-btn')).to_have_count(0)


def test_feedback_mode_shows_floating_button_immediately(page: Page, base_url: str) -> None:
    """Feedback button appears as soon as ?feedback=true loads — no overlay gate."""
    page.goto(base_url + '?feedback=true')
    expect(page.locator('#fb-btn')).to_be_visible(timeout=5000)
    # No overlay
    expect(page.locator('#fb-overlay')).to_have_count(0)


def test_feedback_modal_shows_profile_fields_on_first_open(page: Page, base_url: str) -> None:
    """First time opening modal shows inline name/league/role fields."""
    page.goto(base_url + '?feedback=true')
    page.click('#fb-btn', timeout=5000)
    expect(page.locator('#fb-profile')).to_be_visible()
    expect(page.locator('.fb-role-btn[data-role="Coach"]')).to_be_visible()
    expect(page.locator('.fb-role-btn[data-role="Athlete"]')).to_be_visible()


def test_feedback_submit_disabled_without_role_and_content(page: Page, base_url: str) -> None:
    page.goto(base_url + '?feedback=true')
    page.click('#fb-btn', timeout=5000)
    expect(page.locator('#fb-submit')).to_be_disabled()


def test_feedback_selecting_role_and_comment_enables_submit(page: Page, base_url: str) -> None:
    page.goto(base_url + '?feedback=true')
    page.click('#fb-btn', timeout=5000)
    page.click('.fb-role-btn[data-role="Coach"]')
    page.fill('#fb-comment', 'Great tool!')
    expect(page.locator('#fb-submit')).to_be_enabled()
