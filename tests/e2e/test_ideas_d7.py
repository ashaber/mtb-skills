"""
e2e tests for:
- IDEA-013: full card level selector previews description without logging observation
- IDEA-014: feedback mode toggle in Settings persists via localStorage
- D7: sheet grip swipe-down closes the sheet
- D7: Settings About section has "Learn more" link
"""
import pytest
from playwright.sync_api import Page, expect


# ── Helpers ───────────────────────────────────────────────────────────────────

def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-person"]')


def open_card(page: Page, name: str) -> None:
    """Click the athlete row to open the drill-in card."""
    page.click(f'[data-a="go-card"]')


# ── IDEA-013: preview-level shows description, does not log observation ───────

def test_clicking_level_on_full_card_shows_description(page: Page) -> None:
    """Clicking a level on the full card updates the level description without saving."""
    add_athlete(page, 'Preview Rider')
    # Open athlete card
    page.click('[data-a="go-card"]')
    # Card should be visible in the layer
    expect(page.locator('.layer--in')).to_be_visible()
    # Click level 4 on the full card (data-a="preview-level")
    page.locator('[data-a="preview-level"][data-n="4"]').first.click()
    # Level description should appear (the card displays detail for selected level)
    expect(page.locator('.layer--in')).to_contain_text('4')


def test_preview_level_does_not_save_observation(page: Page) -> None:
    """Clicking a level on full card must not increase observation count."""
    add_athlete(page, 'No Save Rider')
    # Check initial observation count via export
    initial_export = page.evaluate("""() => {
        const data = JSON.parse(localStorage.getItem('mtb_observations') || '[]');
        return data.length;
    }""")
    # Open card and click a level
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()
    page.locator('[data-a="preview-level"][data-n="3"]').first.click()
    # Observation count must not have increased
    after_export = page.evaluate("""() => {
        const data = JSON.parse(localStorage.getItem('mtb_observations') || '[]');
        return data.length;
    }""")
    assert after_export == initial_export, (
        f'Expected no new observations, got {after_export - initial_export} new'
    )


def test_log_observation_button_saves_observation(page: Page) -> None:
    """Log Observation button on full card does save observations."""
    add_athlete(page, 'Log Rider')
    initial_count = page.evaluate("""() =>
        JSON.parse(localStorage.getItem('mtb_observations') || '[]').length
    """)
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()
    # Click Log session / Log observation button
    page.locator('[data-a="log-session"]').click()
    after_count = page.evaluate("""() =>
        JSON.parse(localStorage.getItem('mtb_observations') || '[]').length
    """)
    assert after_count > initial_count, 'Expected observations to be saved after log-session'


# ── IDEA-014: feedback toggle persists ───────────────────────────────────────

def test_feedback_mode_is_on_by_default(page: Page) -> None:
    """Feedback mode defaults to on (localStorage key absent = on)."""
    val = page.evaluate("() => localStorage.getItem('mtb_feedback_mode')")
    # Default: key absent or 'true'
    assert val != 'false', f'Expected feedback on by default, got {val!r}'


def test_feedback_toggle_off_persists_to_localstorage(page: Page, base_url: str) -> None:
    """Setting feedback to off via localStorage and reloading removes the button."""
    page.evaluate("() => localStorage.setItem('mtb_feedback_mode', 'false')")
    page.reload()
    expect(page.locator('#fb-btn')).to_have_count(0)
    # Turn back on
    page.evaluate("() => localStorage.setItem('mtb_feedback_mode', 'true')")
    page.reload()
    expect(page.locator('#fb-btn')).to_be_visible(timeout=3000)


# ── D7: sheet grip swipe-down closes sheet ────────────────────────────────────

def test_sheet_grip_click_closes_sheet(page: Page) -> None:
    """Clicking the sheet grip dismisses the sheet."""
    add_athlete(page, 'Grip Rider')
    # Open the rubric sheet from the guide tab
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    # Tap the first rubric skill to open a sheet
    page.locator('[data-a="rubric-tab"]').first.click()
    # Open sheet via go-rubric-skill (from card would also work)
    # Use guide tab drill-in: click a skill block if available, else use add form
    # Simplest: open add-person modal (any sheet)
    page.click('[data-a="switch-tab"][data-tab="roster"]')
    page.click('[data-a="open-add"]')
    # Sheet should be visible
    expect(page.locator('#sheet')).to_be_visible()
    # Click the grip
    page.locator('.sheet-grip').click()
    # Sheet should close (empty)
    expect(page.locator('#sheet')).to_be_empty()


def test_sheet_grip_swipe_down_closes_sheet(page: Page) -> None:
    """Swiping down on the sheet grip via touch events dismisses the sheet."""
    add_athlete(page, 'Swipe Rider')
    page.click('[data-a="open-add"]')
    expect(page.locator('#sheet')).to_be_visible()
    # Dispatch real touch events on the grip element — mouse events don't fire touch handlers
    page.evaluate("""() => {
        const grip = document.querySelector('.sheet-grip');
        if (!grip) return;
        const startY = 300, endY = 360;
        grip.dispatchEvent(new TouchEvent('touchstart', {
            touches: [new Touch({ identifier: 1, target: grip, clientX: 200, clientY: startY })],
            bubbles: true
        }));
        grip.dispatchEvent(new TouchEvent('touchend', {
            changedTouches: [new Touch({ identifier: 1, target: grip, clientX: 200, clientY: endY })],
            bubbles: true
        }));
    }""")
    expect(page.locator('#sheet')).to_be_empty()


# ── D7: Settings About has Learn more link ────────────────────────────────────

def test_settings_about_has_learn_more_link(page: Page) -> None:
    """Settings About section must include the 'Learn more' link to about.html."""
    page.click('[data-a="switch-tab"][data-tab="settings"]')
    link = page.locator('a[href*="about.html"]')
    expect(link).to_be_visible()
    expect(link).to_contain_text('Learn more')
