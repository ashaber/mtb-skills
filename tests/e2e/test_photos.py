"""
Photo upload and roster thumbnail display tests.
Defect: rider photos set on the card view were not rendering as thumbnails on
the roster page (CSS height:100% in a flex/align-items:center context resolved
to auto on some browsers; missing overflow:hidden on the button).
"""
import os
import pytest
from playwright.sync_api import Page, expect

FIXTURE_PNG = os.path.join(os.path.dirname(__file__), 'fixtures', 'tiny.png')


def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-person"]')


def open_card(page: Page, name: str) -> None:
    """Navigate to a rider's full card via the mono-btn."""
    page.locator('.mono-btn').filter(has_text='').first.click()


def test_photo_shows_on_card_after_upload(page: Page) -> None:
    add_athlete(page, 'Photo Rider')
    # Open card via mono-btn (first athlete row)
    page.locator('[data-a="go-card"]').first.click()
    expect(page.locator('.card-photo-empty')).to_be_visible()

    page.set_input_files('#photo-upload', FIXTURE_PNG)
    # After upload, card re-renders: upload label gone, card-photo img appears
    expect(page.locator('.card-photo-empty')).to_be_hidden()
    expect(page.locator('img.card-photo')).to_be_visible()


def test_photo_thumbnail_visible_on_roster_after_upload(page: Page) -> None:
    add_athlete(page, 'Roster Photo Rider')
    page.locator('[data-a="go-card"]').first.click()
    page.set_input_files('#photo-upload', FIXTURE_PNG)
    expect(page.locator('img.card-photo')).to_be_visible()

    # Navigate back to roster
    page.click('[data-a="go-roster"]')
    expect(page.locator('.hdr-title')).to_contain_text('Roster')

    # Roster row should show img.mono-photo, not the initials div
    expect(page.locator('img.mono-photo').first).to_be_visible()
    expect(page.locator('.mono-btn .mono').first).to_be_hidden()


def test_photo_persists_across_reload(page: Page) -> None:
    add_athlete(page, 'Persist Photo Rider')
    page.locator('[data-a="go-card"]').first.click()
    page.set_input_files('#photo-upload', FIXTURE_PNG)
    expect(page.locator('img.card-photo')).to_be_visible()

    page.reload()
    expect(page.locator('img.mono-photo').first).to_be_visible()
