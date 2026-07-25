"""
e2e tests for IDEA-015 — level progression deltas and progressive content disclosure.

Tier 1 (rider card): selecting a level shows a concise strip of what improves.
Tier 2 (Field Guide): full delta strip + expandable "How to progress" coaching.
Tier 3: link out to the long-form written reference.
"""
import pytest
from playwright.sync_api import Page, expect


def add_athlete(page: Page, name: str) -> None:
    page.click('[data-a="open-add"]')
    page.fill('#inp-name', name)
    page.click('[data-m="save-person"]')


def open_guide_skill(page: Page) -> None:
    """Open the Guide tab on the first skill sub-tab."""
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    page.locator('[data-a="rubric-tab"]').first.click()


# ── Tier 1: rider card ───────────────────────────────────────────────────────

def test_card_level_1_always_offers_a_route_into_the_guide(page: Page) -> None:
    """Level 1 is the baseline. A progression block there is optional content —
    with or without it, the coach must still be able to reach the guide."""
    add_athlete(page, 'Baseline Rider')
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()

    # Default draft level is 1 for every skill.
    deep_links = page.locator('.layer--in [data-a="go-rubric-level"][data-n="1"]')
    assert deep_links.count() == 3, 'each skill block needs a level-1 guide link'


def test_card_selecting_level_shows_what_improves(page: Page) -> None:
    """Tapping a level on the full card reveals the three delta categories."""
    add_athlete(page, 'Delta Rider')
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()

    page.locator('[data-a="preview-level"][data-n="3"]').first.click()

    strip = page.locator('.layer--in .sb-prog').first
    expect(strip).to_be_visible()
    expect(strip).to_contain_text('WHAT IMPROVES AT LEVEL 3')
    # All three categories present
    expect(strip.locator('.prog-line--adds')).to_have_count(1)
    expect(strip.locator('.prog-line--resolves')).to_have_count(1)
    expect(strip.locator('.prog-line--terrain')).to_have_count(1)
    # Each category carries its directional icon
    expect(strip.locator('.prog-icon svg')).to_have_count(3)


def test_card_strip_updates_when_level_changes(page: Page) -> None:
    """The strip re-renders to match the newly selected level."""
    add_athlete(page, 'Switch Rider')
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()

    page.locator('[data-a="preview-level"][data-n="2"]').first.click()
    expect(page.locator('.layer--in .sb-prog').first).to_contain_text('WHAT IMPROVES AT LEVEL 2')

    page.locator('[data-a="preview-level"][data-n="5"]').first.click()
    expect(page.locator('.layer--in .sb-prog').first).to_contain_text('WHAT IMPROVES AT LEVEL 5')


def test_card_no_longer_shows_breaks_columns(page: Page) -> None:
    """The old 'when it breaks' / 'what breaks' columns are gone from the card."""
    add_athlete(page, 'Clean Copy Rider')
    page.click('[data-a="go-card"]')
    expect(page.locator('.layer--in')).to_be_visible()
    page.locator('[data-a="preview-level"][data-n="3"]').first.click()

    expect(page.locator('.layer--in .sb-rubric-row')).to_have_count(0)
    card_text = page.locator('.layer--in').inner_text().lower()
    assert 'break' not in card_text, 'card must not use the word "break" (confusable with brakes)'


def test_card_more_info_deep_links_to_that_level(page: Page) -> None:
    """'More info' opens the Guide scrolled to the level the coach is viewing."""
    add_athlete(page, 'Deep Link Rider')
    page.click('[data-a="go-card"]')
    page.locator('[data-a="preview-level"][data-n="4"]').first.click()

    page.locator('.sb-prog .sb-prog-more').first.click()
    expect(page.locator('#sheet')).to_be_visible()

    target = page.locator('#sheet .rubric-card[data-lv="4"]')
    expect(target).to_be_visible()
    # The level-4 card should be scrolled to the top of the sheet's viewport,
    # i.e. above the level-5 card and near the top of the scroll container.
    box = target.bounding_box()
    scroll_box = page.locator('#sheet .sheet-rubric-body, #sheet .sheet-scroll').first.bounding_box()
    assert box is not None and scroll_box is not None
    assert box['y'] - scroll_box['y'] < 200, 'level 4 card should be scrolled near the top'


def test_card_does_not_show_how_to_drills(page: Page) -> None:
    """Drills belong to the Guide, not the card — that is the progressive split."""
    add_athlete(page, 'No Drills Rider')
    page.click('[data-a="go-card"]')
    page.locator('[data-a="preview-level"][data-n="3"]').first.click()

    expect(page.locator('.layer--in .progress-details')).to_have_count(0)


# ── Tier 2: Field Guide ──────────────────────────────────────────────────────

def test_guide_shows_full_progression_with_labels(page: Page) -> None:
    """Guide tier shows the same deltas with category labels and more items."""
    open_guide_skill(page)

    prog = page.locator('.rubric-card[data-lv="3"] .rc-prog')
    expect(prog).to_contain_text('What improves at Level 3')
    expect(prog).to_contain_text('Adds')
    expect(prog).to_contain_text('Fewer failures')
    expect(prog).to_contain_text('Terrain')


def test_guide_how_to_progress_expands(page: Page) -> None:
    """The 'How to progress' block is collapsed by default and opens on click."""
    open_guide_skill(page)

    details = page.locator('.rubric-card[data-lv="2"] .progress-details')
    expect(details).to_have_count(1)
    expect(details).to_contain_text('How to progress to Level 3')

    # Collapsed by default — list not visible
    items = details.locator('.progress-list li')
    expect(items.first).not_to_be_visible()

    details.locator('.progress-summary').click()
    expect(items.first).to_be_visible()
    assert items.count() > 0


def test_guide_level_5_has_no_next_level_block(page: Page) -> None:
    """Level 5 is the top — there is no level to progress to."""
    open_guide_skill(page)
    expect(page.locator('.rubric-card[data-lv="5"] .progress-details')).to_have_count(0)


def test_guide_level_1_has_no_delta_but_has_how_to(page: Page) -> None:
    """Level 1 has no delta strip, but still tells you how to reach level 2."""
    open_guide_skill(page)
    card = page.locator('.rubric-card[data-lv="1"]')
    expect(card.locator('.rc-prog')).to_have_count(0)
    expect(card.locator('.progress-details')).to_contain_text('How to progress to Level 2')


# ── Tier 3: long-form reference ──────────────────────────────────────────────

def test_guide_links_to_full_written_reference(page: Page) -> None:
    open_guide_skill(page)
    link = page.locator('.rc-reference-link')
    expect(link).to_be_visible()
    expect(link).to_contain_text('Full written reference')
    expect(link).to_have_attribute('href', 'rubric-reference.md')


def test_reference_doc_is_served(page: Page, base_url: str) -> None:
    """The placeholder reference doc must actually resolve, not 404."""
    res = page.request.get(f'{base_url}/rubric-reference.md')
    assert res.status == 200, f'expected 200, got {res.status}'
    assert 'Full Written Reference' in res.text()


# ── Offline: content comes from the bundled fallback ─────────────────────────

def test_progression_renders_offline(page: Page) -> None:
    """Progression content must survive with no network — it ships bundled."""
    add_athlete(page, 'Offline Rider')
    page.context.set_offline(True)
    try:
        page.click('[data-a="go-card"]')
        expect(page.locator('.layer--in')).to_be_visible()
        page.locator('[data-a="preview-level"][data-n="4"]').first.click()

        strip = page.locator('.layer--in .sb-prog').first
        expect(strip).to_contain_text('WHAT IMPROVES AT LEVEL 4')
        expect(strip.locator('.prog-icon svg')).to_have_count(3)
    finally:
        page.context.set_offline(False)


# ── Retired terminology ──────────────────────────────────────────────────────

def test_gary_test_term_is_not_shown_anywhere_in_guide(page: Page) -> None:
    """The 'Gary Test' term is retired from coach-facing content."""
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    for i in range(3):
        page.locator('[data-a="rubric-tab"]').nth(i).click()
        body = page.locator('#app').inner_text()
        assert 'gary test' not in body.lower(), f'retired term shown on skill tab {i}'


def test_word_break_never_appears_in_the_guide(page: Page) -> None:
    """'Breaks' reads as 'brakes' on trail — it must be gone from all skill tabs."""
    page.click('[data-a="switch-tab"][data-tab="guide"]')
    for i in range(4):
        page.locator('[data-a="rubric-tab"]').nth(i).click()
        body = page.locator('#app').inner_text().lower()
        assert 'break' not in body, f'the word "break" is shown on rubric tab {i}'


# ── Failure lists relocated from the card into the guide ─────────────────────

def test_guide_shows_disqualifier_list(page: Page) -> None:
    """Failure modes moved off the card — they must still exist in the Guide."""
    open_guide_skill(page)
    fails = page.locator('.rubric-card[data-lv="1"] .rc-fails')
    expect(fails).to_be_visible()
    expect(fails).to_contain_text('Any one of these = not this level')
    assert fails.locator('.rc-fail-item').count() > 0


def test_guide_shows_consistency_gate(page: Page) -> None:
    """The consistency gate survives the rename, reworded without 'breaks'."""
    open_guide_skill(page)
    gate = page.locator('.rubric-card[data-lv="3"] .rc-gate')
    expect(gate).to_be_visible()
    expect(gate).to_contain_text('Falls apart')


# ── Terrain must not be expressed as a trail rating ──────────────────────────

def test_terrain_is_descriptive_not_a_trail_rating(page: Page) -> None:
    """Skill level and trail rating are different scales — never equate them."""
    open_guide_skill(page)
    for lv in (2, 3, 4, 5):
        terrain = page.locator(f'.rubric-card[data-lv="{lv}"] .prog-line--terrain').inner_text().lower()
        for rating in ('green', 'blue', 'black', '◆', '■', '●'):
            assert rating not in terrain, f'L{lv} terrain uses trail rating {rating!r}: {terrain}'
