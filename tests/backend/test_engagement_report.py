"""Tests for scripts/engagement_report.py -- the standalone local reporting
script over the `feedback` / `engagement` tables (see that script's module
docstring for the full access-control reasoning: both tables are RLS
deny-all with no dev-facing read API, so this is a script Andrew runs
himself with a direct DB credential, not a FastAPI endpoint).

Two layers of coverage, split the same way the script itself is split:

  * Pure aggregation-function tests (bucket_counts_by_*, count_by_field,
    duration_distribution, top_event_types, ...) run with NO live DB at
    all -- they're plain Python over hand-built row dicts, so they run in
    every CI job, not just the `db` job.
  * `fetch_feedback_rows` / `fetch_engagement_rows` integration tests seed
    real rows via `owner_conn` (this directory's shared fixture, same RLS-
    bypass mechanism the script's own `connect()` uses) and assert the
    fetch functions read them back correctly -- proving the DB layer, not
    just the aggregation math. These require MTB_TEST_DB_URL and skip
    (per tests/backend/conftest.py) when it's unset.

HTML rendering itself is checked only for the couple of things that matter
(the PII posture: email never appears outside the raw-detail table) --
CLAUDE.md's brief is explicit that pixel-for-pixel HTML testing isn't
required here.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import psycopg
import pytest

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import engagement_report as er  # noqa: E402  (path insert must run first)


def _dt(y: int, m: int, d: int, hh: int = 12) -> datetime:
    return datetime(y, m, d, hh, 0, 0, tzinfo=timezone.utc)


# --------------------------------------------------------------------------
# get_database_url -- fail-fast behavior.
# --------------------------------------------------------------------------


def test_get_database_url_raises_when_unset() -> None:
    with pytest.raises(SystemExit):
        er.get_database_url(env={})


def test_get_database_url_strips_and_returns_value() -> None:
    assert er.get_database_url(env={"DATABASE_URL": "  postgresql://x  "}) == "postgresql://x"


# --------------------------------------------------------------------------
# bucket_counts_by_day / by_week / fill_date_range
# --------------------------------------------------------------------------


def test_bucket_counts_by_day_groups_and_ignores_null_dates() -> None:
    rows = [
        {"created_at": _dt(2026, 8, 1)},
        {"created_at": _dt(2026, 8, 1, 23)},
        {"created_at": _dt(2026, 8, 2)},
        {"created_at": None},
    ]
    counts = er.bucket_counts_by_day(rows)
    assert counts == {date(2026, 8, 1): 2, date(2026, 8, 2): 1}


def test_bucket_counts_by_week_groups_to_monday() -> None:
    # 2026-08-03 is a Monday; 2026-08-05 is in the same ISO week.
    rows = [{"created_at": _dt(2026, 8, 3)}, {"created_at": _dt(2026, 8, 5)}, {"created_at": _dt(2026, 8, 10)}]
    counts = er.bucket_counts_by_week(rows)
    assert counts == {date(2026, 8, 3): 2, date(2026, 8, 10): 1}


def test_fill_date_range_zero_fills_gaps() -> None:
    bucketed = {date(2026, 8, 1): 3, date(2026, 8, 3): 1}
    filled = er.fill_date_range(bucketed, date(2026, 8, 1), date(2026, 8, 3))
    assert filled == [(date(2026, 8, 1), 3), (date(2026, 8, 2), 0), (date(2026, 8, 3), 1)]


def test_fill_date_range_empty_when_start_after_end() -> None:
    assert er.fill_date_range({}, date(2026, 8, 5), date(2026, 8, 1)) == []


# --------------------------------------------------------------------------
# count_by_field / count_has_drawing
# --------------------------------------------------------------------------


def test_count_by_field_normalizes_blank_and_none() -> None:
    rows = [{"role": "Coach"}, {"role": "coach"}, {"role": ""}, {"role": "  "}, {"role": None}, {"role": "Coach"}]
    # note: values are NOT case-folded (self-reported free text is kept
    # verbatim) -- "Coach" and "coach" are distinct buckets by design.
    counts = er.count_by_field(rows, "role")
    assert counts["Coach"] == 2
    assert counts["coach"] == 1
    assert counts["(blank)"] == 3


def test_count_has_drawing_counts_only_true() -> None:
    rows = [{"has_drawing": True}, {"has_drawing": False}, {"has_drawing": None}, {"has_drawing": True}]
    assert er.count_has_drawing(rows) == 2


# --------------------------------------------------------------------------
# recent_comments -- excludes email, sorted newest-first, capped.
# --------------------------------------------------------------------------


def test_recent_comments_excludes_rows_without_comment_and_sorts_desc() -> None:
    rows = [
        {"created_at": _dt(2026, 8, 1), "comment": "old", "email": "a@example.com", "page": "roster"},
        {"created_at": _dt(2026, 8, 3), "comment": "new", "email": "b@example.com", "page": "practice"},
        {"created_at": _dt(2026, 8, 2), "comment": "", "email": "c@example.com"},  # blank comment -> excluded
        {"created_at": _dt(2026, 8, 2), "comment": None, "email": "d@example.com"},
    ]
    out = er.recent_comments(rows)
    assert [c["comment"] for c in out] == ["new", "old"]
    for c in out:
        assert "email" not in c


def test_recent_comments_respects_limit() -> None:
    rows = [{"created_at": _dt(2026, 8, i), "comment": f"c{i}"} for i in range(1, 11)]
    out = er.recent_comments(rows, limit=3)
    assert len(out) == 3
    assert out[0]["comment"] == "c10"


# --------------------------------------------------------------------------
# raw_feedback_detail -- the one place email is allowed to appear.
# --------------------------------------------------------------------------


def test_raw_feedback_detail_includes_email_and_sorts_desc_and_caps() -> None:
    rows = [{"created_at": _dt(2026, 8, i), "email": f"{i}@example.com"} for i in range(1, 5)]
    out = er.raw_feedback_detail(rows, limit=2)
    assert len(out) == 2
    assert out[0]["email"] == "4@example.com"
    assert out[1]["email"] == "3@example.com"


# --------------------------------------------------------------------------
# duration_distribution -- fixed bucket order, nulls excluded.
# --------------------------------------------------------------------------


def test_duration_distribution_buckets_correctly() -> None:
    rows = [
        {"duration_sec": 10},  # 0-30s
        {"duration_sec": 45},  # 30-60s
        {"duration_sec": 120},  # 1-5min
        {"duration_sec": 600},  # 5-15min
        {"duration_sec": 1000},  # 15-30min
        {"duration_sec": 5000},  # 30min+
        {"duration_sec": None},  # excluded
    ]
    dist = er.duration_distribution(rows)
    assert dist == [
        ("0-30s", 1),
        ("30-60s", 1),
        ("1-5min", 1),
        ("5-15min", 1),
        ("15-30min", 1),
        ("30min+", 1),
    ]


def test_duration_distribution_boundary_values() -> None:
    # Boundaries are [lo, hi) -- 30 belongs to "30-60s", not "0-30s".
    rows = [{"duration_sec": 0}, {"duration_sec": 30}, {"duration_sec": 1800}]
    dist = dict(er.duration_distribution(rows))
    assert dist["0-30s"] == 1
    assert dist["30-60s"] == 1
    assert dist["30min+"] == 1


# --------------------------------------------------------------------------
# session_count
# --------------------------------------------------------------------------


def test_session_count_dedupes_ids_and_counts_missing_ids_individually() -> None:
    rows = [
        {"session_id": "s1"},
        {"session_id": "s1"},  # same session flushed twice -> counted once
        {"session_id": "s2"},
        {"session_id": None},  # no session id -> still counts as one session
        {"session_id": ""},
    ]
    assert er.session_count(rows) == 4  # s1, s2, + 2 missing-id rows


# --------------------------------------------------------------------------
# top_event_types / top_pages_viewed
# --------------------------------------------------------------------------


def test_top_event_types_counts_across_rows() -> None:
    rows = [
        {"events": [{"type": "page_view", "page": "roster"}, {"type": "log_obs", "athlete_id": "x"}]},
        {"events": [{"type": "page_view", "page": "practice"}]},
        {"events": None},
    ]
    top = er.top_event_types(rows)
    assert dict(top) == {"page_view": 2, "log_obs": 1}


def test_top_pages_viewed_only_counts_page_view_events() -> None:
    rows = [
        {
            "events": [
                {"type": "page_view", "page": "roster"},
                {"type": "page_view", "page": "roster"},
                {"type": "page_view", "page": "guide"},
                # a 'feedback' event also happens to carry a `page` prop --
                # must NOT be counted as a page-view/navigation signal.
                {"type": "feedback", "page": "settings"},
                # export events nest an unrelated `type` key inside props --
                # must not be confused with the event's own top-level type.
                {"type": "export", "props": {"type": "data"}},
            ]
        }
    ]
    top = dict(er.top_pages_viewed(rows))
    assert top == {"roster": 2, "guide": 1}
    assert "settings" not in top


# --------------------------------------------------------------------------
# build_report_data -- end-to-end assembly over hand-built rows.
# --------------------------------------------------------------------------


def test_build_report_data_assembles_expected_totals() -> None:
    feedback_rows = [
        {"created_at": _dt(2026, 8, 3), "role": "Coach", "league": "PNW", "team": "A", "comment": "hi", "has_drawing": False, "email": "a@example.com"},
        {"created_at": _dt(2026, 8, 3), "role": "Coach", "league": "PNW", "team": "A", "comment": None, "has_drawing": True, "email": "b@example.com"},
    ]
    engagement_rows = [
        {
            "created_at": _dt(2026, 8, 3),
            "session_id": "s1",
            "duration_sec": 90,
            "league": "PNW",
            "team": "A",
            "events": [{"type": "page_view", "page": "roster"}],
        }
    ]
    data = er.build_report_data(feedback_rows, engagement_rows, now=_dt(2026, 8, 10))

    assert data.feedback_total == 2
    assert data.feedback_drawing_count == 1
    assert data.engagement_session_count == 1
    assert dict(data.feedback_by_role) == {"Coach": 2}
    assert dict(data.top_pages) == {"roster": 1}
    # exactly one week bucket (both rows fall in the same week).
    assert sum(count for _label, count in data.feedback_weekly) == 2


def test_build_report_data_handles_empty_input() -> None:
    data = er.build_report_data([], [], now=_dt(2026, 8, 10))
    assert data.feedback_total == 0
    assert data.engagement_session_count == 0
    # With no rows at all, the date range collapses to "now" -- a single
    # zero-count bucket, not an empty list, so the chart still renders a
    # visible (zero) week rather than a blank chart.
    assert data.feedback_weekly == [(date(2026, 8, 10), 0)]
    assert data.top_pages == []


# --------------------------------------------------------------------------
# render_html -- long-comment truncation (display-only).
# --------------------------------------------------------------------------


def test_render_html_truncates_long_comments_for_display() -> None:
    long_comment = "x" * 5000
    feedback_rows = [{"created_at": _dt(2026, 8, 3), "comment": long_comment, "has_drawing": False}]
    data = er.build_report_data(feedback_rows, [], now=_dt(2026, 8, 10))
    out = er.render_html(data)

    assert long_comment not in out  # never dumped verbatim into the page
    assert "x" * 300 in out  # truncated prefix is still present
    assert "…" in out


def test_render_html_leaves_short_comments_untouched() -> None:
    short_comment = "totally normal length comment"
    feedback_rows = [{"created_at": _dt(2026, 8, 3), "comment": short_comment, "has_drawing": False}]
    data = er.build_report_data(feedback_rows, [], now=_dt(2026, 8, 10))
    out = er.render_html(data)

    assert short_comment in out
    assert "…" not in out


# --------------------------------------------------------------------------
# render_html -- PII posture: email appears ONLY in the raw-detail section.
# --------------------------------------------------------------------------


def test_render_html_never_leaks_email_outside_raw_detail_section() -> None:
    feedback_rows = [
        {
            "created_at": _dt(2026, 8, 3),
            "role": "Coach",
            "league": "PNW",
            "team": "A",
            "comment": "great app",
            "has_drawing": False,
            "email": "very-unique-marker@example.com",
            "user_name": "Andrew",
            "page": "roster",
        }
    ]
    data = er.build_report_data(feedback_rows, [], now=_dt(2026, 8, 10))
    out = er.render_html(data)

    assert "very-unique-marker@example.com" in out  # present once, in raw detail
    raw_section_start = out.index("Raw feedback detail")
    # Everything BEFORE the raw-detail section (overview stats, charts,
    # recent-comments table) must not contain the email address.
    assert "very-unique-marker@example.com" not in out[:raw_section_start]


def test_render_html_produces_well_formed_looking_document() -> None:
    data = er.build_report_data([], [], now=_dt(2026, 8, 10))
    out = er.render_html(data)
    assert out.startswith("<!DOCTYPE html>")
    assert "<title>Engagement &amp; Feedback Report</title>" in out
    assert out.rstrip().endswith("</html>")


# --------------------------------------------------------------------------
# DB integration -- fetch_feedback_rows / fetch_engagement_rows against a
# live seeded Postgres. Requires MTB_TEST_DB_URL (skips otherwise, see
# tests/backend/conftest.py).
# --------------------------------------------------------------------------


def test_fetch_feedback_rows_reads_seeded_rows(db_url: str, owner_conn: psycopg.Connection) -> None:
    marker_email = f"andrew+{uuid.uuid4().hex[:8]}@example.com"
    owner_conn.execute(
        """
        insert into feedback (page, role, user_name, email, league, team, comment, has_drawing)
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        ("roster", "Coach", "Andrew", marker_email, "PNW", "Test Team", "great app", False),
    )
    # er.connect() is the script's own connection helper (plain
    # owner/service-role connection, same RLS-bypass mechanism owner_conn
    # uses) -- exercised here directly, not re-implemented.
    conn = er.connect(db_url)
    try:
        rows = er.fetch_feedback_rows(conn)
    finally:
        conn.close()

    matching = [r for r in rows if r["email"] == marker_email]
    assert len(matching) == 1
    row = matching[0]
    assert row["page"] == "roster"
    assert row["role"] == "Coach"
    assert row["comment"] == "great app"
    assert row["has_drawing"] is False
    assert isinstance(row["created_at"], datetime)


def test_fetch_engagement_rows_reads_seeded_rows_including_jsonb_events(
    db_url: str, owner_conn: psycopg.Connection
) -> None:
    session_id = f"sess_{uuid.uuid4().hex[:8]}"
    owner_conn.execute(
        """
        insert into engagement (session_id, duration_sec, league, team, event_count, events)
        values (%s, %s, %s, %s, %s, %s)
        """,
        (session_id, 42, "PNW", "Test Team", 1, '[{"type": "page_view", "page": "roster"}]'),
    )
    conn = er.connect(db_url)
    try:
        rows = er.fetch_engagement_rows(conn)
    finally:
        conn.close()

    matching = [r for r in rows if r["session_id"] == session_id]
    assert len(matching) == 1
    row = matching[0]
    assert row["duration_sec"] == 42
    # jsonb comes back already decoded as native Python -- proves the
    # fetch layer, not just top_event_types' own parsing.
    assert row["events"] == [{"type": "page_view", "page": "roster"}]


def test_fetch_rows_respects_since_cutoff(db_url: str, owner_conn: psycopg.Connection) -> None:
    marker = f"since_cutoff_{uuid.uuid4().hex[:8]}"
    owner_conn.execute(
        "insert into feedback (page, comment) values (%s, %s)",
        (marker, "recent row"),
    )
    conn = er.connect(db_url)
    try:
        future_cutoff = datetime.now(timezone.utc) + timedelta(days=1)
        rows = er.fetch_feedback_rows(conn, since=future_cutoff)
    finally:
        conn.close()

    assert all(r["page"] != marker for r in rows)


def test_build_report_data_over_live_seeded_rows(db_url: str, owner_conn: psycopg.Connection) -> None:
    """End-to-end: seed via owner_conn (RLS-bypassing, same as the script's
    own connect()), fetch, aggregate -- proving fetch + aggregation compose
    correctly against a real Postgres round-trip (jsonb decode, timestamptz
    handling), not just against hand-built dicts."""
    marker_team = f"team_{uuid.uuid4().hex[:8]}"
    owner_conn.execute(
        """
        insert into feedback (page, role, team, comment, has_drawing)
        values (%s, %s, %s, %s, %s)
        """,
        ("guide", "Coach", marker_team, "seeded for aggregation test", True),
    )
    owner_conn.execute(
        """
        insert into engagement (session_id, duration_sec, team, events)
        values (%s, %s, %s, %s)
        """,
        (f"sess_{uuid.uuid4().hex[:8]}", 15, marker_team, '[{"type": "page_view", "page": "guide"}]'),
    )

    conn = er.connect(db_url)
    try:
        feedback_rows = er.fetch_feedback_rows(conn)
        engagement_rows = er.fetch_engagement_rows(conn)
    finally:
        conn.close()

    data = er.build_report_data(feedback_rows, engagement_rows)

    feedback_team_counts = dict(data.feedback_by_team)
    engagement_team_counts = dict(data.engagement_by_team)
    assert feedback_team_counts.get(marker_team) == 1
    assert engagement_team_counts.get(marker_team) == 1
    assert data.feedback_total >= 1
    assert data.engagement_session_count >= 1
