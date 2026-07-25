"""
Phase 2a PWA tests.
Covers: manifest presence, rubric.json content, offline load via service worker.
Service worker tests skip WebKit — SW support in Playwright WebKit is unreliable.
"""
import pytest
from playwright.sync_api import Page, expect


# ── Manifest ──────────────────────────────────────────────────────────────────

def test_manifest_linked(page: Page) -> None:
    """HTML references a web app manifest."""
    link = page.locator('link[rel="manifest"]')
    expect(link).to_have_count(1)
    href = link.get_attribute('href')
    assert href and 'manifest' in href


def test_manifest_content(page: Page, base_url: str) -> None:
    """Manifest has required PWA fields."""
    import urllib.request, json
    with urllib.request.urlopen(f'{base_url}/manifest.webmanifest') as r:
        m = json.load(r)
    assert m['name'] == 'MTB Skills Assessment'
    assert m['display'] == 'standalone'
    assert m['theme_color'] == '#d94626'
    assert len(m['icons']) >= 2
    sizes = [i['sizes'] for i in m['icons']]
    assert '192x192' in sizes
    assert '512x512' in sizes


# ── Rubric content ────────────────────────────────────────────────────────────

def test_rubric_json_served(page: Page, base_url: str) -> None:
    """rubric.json is served and contains the three skills."""
    import urllib.request, json
    with urllib.request.urlopen(f'{base_url}/rubric.json') as r:
        data = json.load(r)
    assert 'SKILLS' in data
    assert 'body_position' in data['SKILLS']
    assert 'braking' in data['SKILLS']
    assert 'cornering' in data['SKILLS']
    assert 'TRAIL_GUIDE' in data
    assert 'COACH_NOTES' in data


def test_rubric_content_in_guide(page: Page) -> None:
    """Guide tab shows rubric content loaded from rubric.json."""
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    # Rubric tab buttons carry skill name text — these are exact matches so no strict-mode ambiguity
    expect(page.locator('[data-a="rubric-tab"][data-id="body_position"]')).to_be_visible()
    expect(page.locator('[data-a="rubric-tab"][data-id="braking"]')).to_be_visible()
    expect(page.locator('[data-a="rubric-tab"][data-id="cornering"]')).to_be_visible()


def test_rubric_failure_modes_visible(page: Page) -> None:
    """Failure mode text from rubric.json renders in guide skill cards."""
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    # Level 1 'Standing Ready' dimension text from rubric.json. Scoped to
    # .rc-dim-text — progression content also mentions the saddle.
    expect(page.locator('.rc-dim-text').filter(has_text='Knees pinch saddle').first).to_be_visible()


# ── Offline load (Chromium only — SW needs a secure context + reliable SW API) ──

@pytest.mark.parametrize('page', [
    pytest.param({'name': 'chromium', 'vp': {'width': 412, 'height': 915}}, id='chromium'),
], indirect=True)
def test_offline_load_after_sw_install(page: Page) -> None:
    """After SW installs on first load, app loads from cache with no network."""
    # Wait for SW to finish pre-caching all assets
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)   # SW install + activate + precache

    # Go offline and reload
    page.context.set_offline(True)
    page.reload(wait_until='domcontentloaded')

    # App must render — roster header is the first visible landmark
    expect(page.locator('.hdr-title')).to_be_visible(timeout=10_000)


@pytest.mark.parametrize('page', [
    pytest.param({'name': 'chromium', 'vp': {'width': 412, 'height': 915}}, id='chromium'),
], indirect=True)
def test_offline_guide_still_shows_rubric(page: Page) -> None:
    """Rubric content is available offline after SW install (served from SW cache)."""
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(3000)

    page.context.set_offline(True)
    page.reload(wait_until='domcontentloaded')

    page.click('[data-a="switch-tab"][data-tab="guide"]')
    expect(page.get_by_text('Body Position', exact=False)).to_be_visible(timeout=10_000)
