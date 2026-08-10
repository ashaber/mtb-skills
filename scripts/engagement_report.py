#!/usr/bin/env python3
"""Standalone local reporting script over the `feedback` / `engagement`
tables (supabase/migrations/0011_feedback.sql, 0012_engagement.sql).

WHY THIS IS A SCRIPT, NOT AN API ENDPOINT
------------------------------------------
Both tables are deliberately RLS deny-all with zero policies -- read the two
migrations' access-model comments in full before changing anything here.
There is no "admin" role anywhere in this app's identity model
(app/identity.py's `COACH_ROLES` only covers coach personas), and the
migrations say outright: "there is no dev-facing read API for this table and
none is planned." The only code path allowed to bypass RLS on these tables
is `app.db.service_connection`, and that function's own docstring restricts
it to exactly one caller: `app.onboarding.bootstrap_link` (first-login
account linking). Adding a new FastAPI route that reads `feedback` or
`engagement` -- even one gated behind some notion of "admin" -- would be a
new, web-reachable read path for this data, which is a security-architecture
decision this app has not made.

So instead: this script runs on Andrew's own machine, connects directly to
Postgres as the table owner/service role -- exactly the way he already
queries prod/ITG with a plain SQL client per the migrations' own documented
access model (owner role bypasses RLS by Postgres's own design; RLS applies
to every role except the table owner and roles with BYPASSRLS) -- and
formats the result as a static report. It does not add a new access path;
it automates the one that already exists (a human with the DB credential
querying directly).

USAGE
-----
Reads the connection string from `DATABASE_URL` (same env var name as
backend/app/config.py's `Settings.database_url` -- point it at the SAME
Supabase project you want to report on: prod or ITG, direct connection,
not the transaction pooler, since this is a one-shot script rather than
pooled app traffic). Fails fast if unset, per CLAUDE.md's "Environment and
secrets" standard.

    DATABASE_URL='postgresql://postgres:<pw>@<host>:5432/postgres' \\
        python scripts/engagement_report.py

    # Write to a specific path instead of the default ./engagement_report.html
    DATABASE_URL='...' python scripts/engagement_report.py --output /tmp/report.html

    # Only look at the last N days (default: all time)
    DATABASE_URL='...' python scripts/engagement_report.py --days 30

Output is a single self-contained HTML file -- inline CSS, no external
requests, no JS framework -- styled to match this repo's existing
`public/about.html` house look (warm paper background, single accent color).
A static HTML file (rather than a terminal report) was chosen because the
two things Andrew asked to see -- submissions-over-time and a
most-visited-pages breakdown -- read far better as bar charts than as
ASCII tables, and a file he can open in a browser (or email himself) is
easier to skim on a "nightly glance" than scrolling terminal output. If a
future increment wants a quick CLI glance too, the aggregation functions
below are already separated from rendering and would support a second,
terminal-only renderer without touching the DB/aggregation layer.

PRIVACY
-------
`feedback.email` is self-reported, optional contact info a submitter
volunteers -- CLAUDE.md's "never log secrets, API keys, or PII" is a
logging-stream rule, not a storage rule, and this table's own migration
comment says the same. Consistent with that spirit anyway, no chart or
summary section in this report aggregates or displays email addresses --
`email` appears ONLY in the clearly-labeled "Raw feedback detail" table at
the bottom, which is understood to be sensitive and is not something to
paste into Slack/a doc without redacting it first.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg

# --------------------------------------------------------------------------
# DB access
# --------------------------------------------------------------------------


def get_database_url(env: dict[str, str] | None = None) -> str:
    """Reads DATABASE_URL, failing fast (CLAUDE.md's "fail fast on startup
    if required env vars are missing") rather than surfacing a confusing
    psycopg connection error further down."""
    source = env if env is not None else os.environ
    url = source.get("DATABASE_URL", "").strip()
    if not url:
        raise SystemExit(
            "DATABASE_URL environment variable is required -- point it at the "
            "Postgres instance you want to report on (see this script's "
            "module docstring for the exact form to use)."
        )
    return url


def connect(database_url: str) -> psycopg.Connection:
    """Plain connection as whatever role `database_url` authenticates as --
    the table-owner/service role. Deliberately does NOT `SET ROLE
    authenticated` or set `request.jwt.claims` (unlike
    app.db.rls_connection) -- this is the same RLS-bypass mechanism
    tests/backend/conftest.py's `owner_conn` fixture and
    app.db.service_connection both use, applied here as a plain standalone
    script rather than a pytest fixture or an app.db helper. Read-only:
    every query in this module is a SELECT."""
    return psycopg.connect(database_url, autocommit=True)


_FEEDBACK_COLUMNS = (
    "id",
    "created_at",
    "page",
    "role",
    "user_name",
    "email",
    "league",
    "team",
    "comment",
    "has_drawing",
    "app_version",
)

_ENGAGEMENT_COLUMNS = (
    "id",
    "created_at",
    "session_id",
    "session_start",
    "duration_sec",
    "user_name",
    "league",
    "team",
    "event_count",
    "events",
    "app_version",
)


def fetch_feedback_rows(conn: psycopg.Connection, since: datetime | None = None) -> list[dict[str, Any]]:
    """All `feedback` rows (optionally since a cutoff), oldest first.
    `screenshot`/`drawing` (base64 image blobs) are deliberately NOT
    selected -- this report never needs the image bytes, and pulling ~3MB
    text blobs per row would make this query needlessly slow."""
    query = f"select {', '.join(_FEEDBACK_COLUMNS)} from feedback"
    params: tuple[Any, ...] = ()
    if since is not None:
        query += " where created_at >= %s"
        params = (since,)
    query += " order by created_at"
    rows = conn.execute(query, params).fetchall()
    return [dict(zip(_FEEDBACK_COLUMNS, row)) for row in rows]


def fetch_engagement_rows(conn: psycopg.Connection, since: datetime | None = None) -> list[dict[str, Any]]:
    """All `engagement` rows (optionally since a cutoff), oldest first."""
    query = f"select {', '.join(_ENGAGEMENT_COLUMNS)} from engagement"
    params: tuple[Any, ...] = ()
    if since is not None:
        query += " where created_at >= %s"
        params = (since,)
    query += " order by created_at"
    rows = conn.execute(query, params).fetchall()
    return [dict(zip(_ENGAGEMENT_COLUMNS, row)) for row in rows]


# --------------------------------------------------------------------------
# Aggregation -- pure functions over already-fetched rows, no DB/HTML here.
# Kept separate from fetch_*/render_* so they're testable without either a
# live DB connection or string-diffing HTML (CLAUDE.md: "test the data
# logic, not HTML pixel-for-pixel").
# --------------------------------------------------------------------------


def bucket_counts_by_day(rows: list[dict[str, Any]], date_field: str = "created_at") -> dict[date, int]:
    """{day: count}, only for days that actually have a row -- callers that
    want a zero-filled contiguous range use `fill_date_range` below."""
    counts: Counter[date] = Counter()
    for row in rows:
        value = row.get(date_field)
        if value is None:
            continue
        counts[value.date()] += 1
    return dict(counts)


def bucket_counts_by_week(rows: list[dict[str, Any]], date_field: str = "created_at") -> dict[date, int]:
    """{week_start (Monday): count}."""
    counts: Counter[date] = Counter()
    for row in rows:
        value = row.get(date_field)
        if value is None:
            continue
        day = value.date()
        week_start = day - timedelta(days=day.weekday())
        counts[week_start] += 1
    return dict(counts)


def fill_date_range(bucketed: dict[date, int], start: date, end: date, step_days: int = 1) -> list[tuple[date, int]]:
    """Zero-fills `bucketed` (from bucket_counts_by_day/week) across every
    step in [start, end] so a bar chart doesn't silently skip empty
    days/weeks -- an empty day should read as a visible zero bar, not a gap
    that looks like missing data."""
    if start > end:
        return []
    out: list[tuple[date, int]] = []
    current = start
    while current <= end:
        out.append((current, bucketed.get(current, 0)))
        current += timedelta(days=step_days)
    return out


def count_by_field(rows: list[dict[str, Any]], field: str, *, blank_label: str = "(blank)") -> Counter[str]:
    """Counter keyed by `row[field]`, blank/None normalized to `blank_label`
    so self-reported optional fields (league/team/role) still show up as a
    visible bucket instead of silently vanishing from the breakdown."""
    counts: Counter[str] = Counter()
    for row in rows:
        value = row.get(field)
        label = value.strip() if isinstance(value, str) and value.strip() else blank_label
        counts[label] += 1
    return counts


def count_has_drawing(rows: list[dict[str, Any]]) -> int:
    return sum(1 for row in rows if row.get("has_drawing"))


def recent_comments(rows: list[dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    """Most recent feedback rows that actually have a comment, newest
    first, capped at `limit`. Deliberately excludes `email` -- this is the
    "comments" view meant for a quick skim/summary, not the raw detail
    table (see `raw_feedback_detail` below), and CLAUDE.md's "never log
    PII" spirit says a summary view shouldn't carry contact info even
    though this whole report is local, not a log stream."""
    with_comment = [row for row in rows if row.get("comment")]
    with_comment.sort(key=lambda row: row.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    out = []
    for row in with_comment[:limit]:
        out.append(
            {
                "created_at": row.get("created_at"),
                "page": row.get("page"),
                "role": row.get("role"),
                "league": row.get("league"),
                "team": row.get("team"),
                "comment": row.get("comment"),
                "has_drawing": bool(row.get("has_drawing")),
            }
        )
    return out


def raw_feedback_detail(rows: list[dict[str, Any]], limit: int = 200) -> list[dict[str, Any]]:
    """The one place in this report `email`/`user_name` appear -- newest
    first, capped at `limit` so an old, very active deployment doesn't
    produce an unbounded HTML table. Callers must keep this in a clearly
    labeled section (see `render_html`); do not fold this into a chart or
    a cross-submission aggregate."""
    ordered = sorted(rows, key=lambda row: row.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return ordered[:limit]


# --- engagement-specific ---------------------------------------------------

_DURATION_BUCKETS = (
    ("0-30s", 0, 30),
    ("30-60s", 30, 60),
    ("1-5min", 60, 300),
    ("5-15min", 300, 900),
    ("15-30min", 900, 1800),
    ("30min+", 1800, None),
)


def duration_distribution(rows: list[dict[str, Any]]) -> list[tuple[str, int]]:
    """[(bucket_label, count)] in a fixed, human-ordered bucket sequence
    (not sorted by count) -- rows with a null `duration_sec` are excluded
    (session still in progress / never flushed a duration), same posture
    as the rest of this module: don't guess at missing data."""
    counts = {label: 0 for label, _lo, _hi in _DURATION_BUCKETS}
    for row in rows:
        duration = row.get("duration_sec")
        if duration is None:
            continue
        for label, lo, hi in _DURATION_BUCKETS:
            if duration >= lo and (hi is None or duration < hi):
                counts[label] += 1
                break
    return [(label, counts[label]) for label, _lo, _hi in _DURATION_BUCKETS]


def session_count(rows: list[dict[str, Any]]) -> int:
    """Distinct `session_id` count, falling back to row count for any rows
    missing a session_id (each still represents a real flush)."""
    ids = {row["session_id"] for row in rows if row.get("session_id")}
    missing = sum(1 for row in rows if not row.get("session_id"))
    return len(ids) + missing


def _iter_events(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flattens every row's `events` jsonb array into one list of event
    dicts. psycopg hands jsonb back already decoded (list[dict]) per
    app/schemas.py's EngagementIn; a row with events=None contributes
    nothing."""
    out: list[dict[str, Any]] = []
    for row in rows:
        events = row.get("events")
        if not events:
            continue
        for event in events:
            if isinstance(event, dict):
                out.append(event)
    return out


def top_event_types(rows: list[dict[str, Any]], limit: int = 10) -> list[tuple[str, int]]:
    """Most common `event['type']` values across every row's `events`
    array (src/feedback.js's `_trackEvent` -- every tracked event has a
    `type`: page_view, log_obs, confirm_level, export, add_person,
    feedback)."""
    counts: Counter[str] = Counter()
    for event in _iter_events(rows):
        event_type = event.get("type")
        if event_type:
            counts[str(event_type)] += 1
    return counts.most_common(limit)


def top_pages_viewed(rows: list[dict[str, Any]], limit: int = 10) -> list[tuple[str, int]]:
    """Most-visited tabs/pages: counts `event['page']` on `type ==
    'page_view'` events specifically (src/main.js fires `page_view` with
    `{ page: s.tab }` once per switchTab() -- see D24; NOT once per every
    draw() call). Other event types may also carry a `page` prop (e.g. the
    in-app feedback-submission event) but those aren't page NAVIGATION
    signal, so they're excluded here to avoid double-counting."""
    counts: Counter[str] = Counter()
    for event in _iter_events(rows):
        if event.get("type") == "page_view" and event.get("page"):
            counts[str(event["page"])] += 1
    return counts.most_common(limit)


# --------------------------------------------------------------------------
# Rendering -- self-contained static HTML, inline CSS, house style matching
# public/about.html (warm paper background, single accent color, no
# external requests/fonts/scripts).
# --------------------------------------------------------------------------

_PALETTE = {
    "bg": "#f4f2ec",
    "surface": "#fff",
    "border": "#e9e5dc",
    "ink": "#1c1b18",
    "dim": "#8d877a",
    "accent": "#d94626",
}


def _esc(value: Any) -> str:
    return html.escape(str(value)) if value is not None else ""


def _bar_rows(pairs: list[tuple[str, int]], *, max_bars: int = 20) -> str:
    """Simple horizontal single-hue bar chart as plain HTML/CSS -- one
    series (a count), so no categorical color assignment is needed (x-axis
    label already carries category identity; see dataviz skill's
    color-formula guidance on when a legend/multi-hue palette is actually
    required). Native `title` attribute gives an exact-value tooltip on
    hover without any JS."""
    pairs = pairs[:max_bars]
    if not pairs:
        return '<p class="empty">No data.</p>'
    peak = max(count for _label, count in pairs) or 1
    rows_html = []
    for label, count in pairs:
        pct = round((count / peak) * 100, 1)
        rows_html.append(
            f'<div class="bar-row" title="{_esc(label)}: {count}">'
            f'<span class="bar-label">{_esc(label)}</span>'
            f'<span class="bar-track"><span class="bar-fill" style="width:{pct}%"></span></span>'
            f'<span class="bar-value">{count}</span>'
            f"</div>"
        )
    return '<div class="bars">' + "".join(rows_html) + "</div>"


def _stat_tile(label: str, value: Any) -> str:
    return f'<div class="stat"><div class="stat-value">{_esc(value)}</div><div class="stat-label">{_esc(label)}</div></div>'


_COMMENT_DISPLAY_CAP = 300


def _truncate(text: str, limit: int = _COMMENT_DISPLAY_CAP) -> str:
    """Display-only truncation -- `comment` can be up to 5000 chars
    (FeedbackIn's own cap), which would otherwise blow out the width of
    the recent-comments table for one long submission. Full text is
    unaffected in the underlying data, only in what's rendered here."""
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"


def _comments_table(comments: list[dict[str, Any]]) -> str:
    if not comments:
        return '<p class="empty">No comments in range.</p>'
    rows_html = []
    for row in comments:
        created = row["created_at"].strftime("%Y-%m-%d %H:%M") if row.get("created_at") else ""
        drawing_tag = " 🖌" if row.get("has_drawing") else ""
        comment_text = _truncate(str(row.get("comment") or ""))
        rows_html.append(
            "<tr>"
            f"<td>{_esc(created)}</td>"
            f"<td>{_esc(row.get('page'))}</td>"
            f"<td>{_esc(row.get('role'))}</td>"
            f"<td>{_esc(row.get('league'))}</td>"
            f"<td>{_esc(row.get('team'))}</td>"
            f"<td>{_esc(comment_text)}{drawing_tag}</td>"
            "</tr>"
        )
    return (
        "<table><thead><tr><th>Time</th><th>Page</th><th>Role</th><th>League</th>"
        "<th>Team</th><th>Comment</th></tr></thead><tbody>" + "".join(rows_html) + "</tbody></table>"
    )


def _raw_detail_table(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return '<p class="empty">No feedback rows in range.</p>'
    rows_html = []
    for row in rows:
        created = row["created_at"].strftime("%Y-%m-%d %H:%M") if row.get("created_at") else ""
        rows_html.append(
            "<tr>"
            f"<td>{_esc(created)}</td>"
            f"<td>{_esc(row.get('user_name'))}</td>"
            f"<td>{_esc(row.get('email'))}</td>"
            f"<td>{_esc(row.get('league'))}</td>"
            f"<td>{_esc(row.get('team'))}</td>"
            f"<td>{_esc(row.get('page'))}</td>"
            "</tr>"
        )
    return (
        "<table><thead><tr><th>Time</th><th>Name</th><th>Email</th><th>League</th>"
        "<th>Team</th><th>Page</th></tr></thead><tbody>" + "".join(rows_html) + "</tbody></table>"
    )


@dataclass(frozen=True)
class ReportData:
    """Everything `render_html` needs, computed ahead of time so rendering
    itself has no aggregation logic in it."""

    generated_at: datetime
    since: datetime | None
    feedback_total: int
    feedback_weekly: list[tuple[date, int]]
    feedback_by_role: list[tuple[str, int]]
    feedback_by_league: list[tuple[str, int]]
    feedback_by_team: list[tuple[str, int]]
    feedback_drawing_count: int
    feedback_comments: list[dict[str, Any]]
    feedback_raw: list[dict[str, Any]]
    engagement_session_count: int
    engagement_weekly: list[tuple[date, int]]
    engagement_duration_dist: list[tuple[str, int]]
    engagement_by_league: list[tuple[str, int]]
    engagement_by_team: list[tuple[str, int]]
    top_pages: list[tuple[str, int]]
    top_events: list[tuple[str, int]]


def build_report_data(
    feedback_rows: list[dict[str, Any]],
    engagement_rows: list[dict[str, Any]],
    since: datetime | None = None,
    now: datetime | None = None,
) -> ReportData:
    """Runs every aggregation function above over the fetched rows and
    packages the results. Split out from `render_html` so tests can assert
    on this structured data without parsing HTML."""
    now = now or datetime.now(timezone.utc)

    feedback_weekly_bucketed = bucket_counts_by_week(feedback_rows)
    engagement_weekly_bucketed = bucket_counts_by_week(engagement_rows)

    all_weeks_source = feedback_rows + engagement_rows
    if all_weeks_source:
        all_dates = [row["created_at"].date() for row in all_weeks_source if row.get("created_at")]
        range_start, range_end = min(all_dates), max(all_dates)
    else:
        range_start = range_end = now.date()

    feedback_weekly = fill_date_range(feedback_weekly_bucketed, range_start, range_end, step_days=7)
    engagement_weekly = fill_date_range(engagement_weekly_bucketed, range_start, range_end, step_days=7)

    return ReportData(
        generated_at=now,
        since=since,
        feedback_total=len(feedback_rows),
        feedback_weekly=feedback_weekly,
        feedback_by_role=count_by_field(feedback_rows, "role").most_common(),
        feedback_by_league=count_by_field(feedback_rows, "league").most_common(),
        feedback_by_team=count_by_field(feedback_rows, "team").most_common(),
        feedback_drawing_count=count_has_drawing(feedback_rows),
        feedback_comments=recent_comments(feedback_rows),
        feedback_raw=raw_feedback_detail(feedback_rows),
        engagement_session_count=session_count(engagement_rows),
        engagement_weekly=engagement_weekly,
        engagement_duration_dist=duration_distribution(engagement_rows),
        engagement_by_league=count_by_field(engagement_rows, "league").most_common(),
        engagement_by_team=count_by_field(engagement_rows, "team").most_common(),
        top_pages=top_pages_viewed(engagement_rows),
        top_events=top_event_types(engagement_rows),
    )


def render_html(data: ReportData) -> str:
    p = _PALETTE
    since_label = data.since.strftime("%Y-%m-%d") if data.since else "all time"
    weekly_pairs = [(d.strftime("%b %d"), c) for d, c in data.feedback_weekly]
    engagement_weekly_pairs = [(d.strftime("%b %d"), c) for d, c in data.engagement_weekly]

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Engagement &amp; Feedback Report</title>
<style>
  :root {{ --bg:{p['bg']}; --surface:{p['surface']}; --border:{p['border']}; --ink:{p['ink']}; --dim:{p['dim']}; --accent:{p['accent']}; }}
  *, *::before, *::after {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif; background:var(--bg); color:var(--ink); line-height:1.5; -webkit-font-smoothing:antialiased; }}
  .page {{ max-width:920px; margin:0 auto; padding:40px 24px 80px; }}
  header {{ margin-bottom:32px; padding-bottom:20px; border-bottom:2px solid var(--border); }}
  header h1 {{ font-size:28px; font-weight:800; letter-spacing:-.5px; margin-bottom:6px; }}
  header p {{ font-size:14px; color:var(--dim); }}
  section {{ margin-bottom:36px; }}
  h2 {{ font-size:19px; font-weight:700; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border); }}
  h3 {{ font-size:14px; font-weight:700; margin:18px 0 8px; color:var(--ink); }}
  .stat-grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px; margin-bottom:8px; }}
  .stat {{ background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px; text-align:center; }}
  .stat-value {{ font-size:26px; font-weight:800; color:var(--accent); }}
  .stat-label {{ font-size:12px; color:var(--dim); margin-top:4px; text-transform:uppercase; letter-spacing:.04em; }}
  .grid-2 {{ display:grid; grid-template-columns:1fr 1fr; gap:24px; }}
  @media (max-width:640px) {{ .grid-2 {{ grid-template-columns:1fr; }} }}
  .bars {{ display:flex; flex-direction:column; gap:6px; }}
  .bar-row {{ display:grid; grid-template-columns:120px 1fr 40px; align-items:center; gap:8px; font-size:13px; }}
  .bar-label {{ color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
  .bar-track {{ background:var(--border); border-radius:4px; height:14px; overflow:hidden; }}
  .bar-fill {{ display:block; height:100%; background:var(--accent); border-radius:4px; min-width:2px; }}
  .bar-value {{ color:var(--dim); text-align:right; font-variant-numeric:tabular-nums; }}
  .empty {{ font-size:13px; color:var(--dim); font-style:italic; }}
  table {{ width:100%; border-collapse:collapse; margin:8px 0 4px; font-size:13px; }}
  th {{ text-align:left; font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--dim); padding:0 8px 8px 0; border-bottom:1px solid var(--border); }}
  td {{ padding:7px 8px 7px 0; vertical-align:top; border-top:1px solid var(--border); color:var(--ink); }}
  .pii-warning {{ background:#fef3c7; border:1px solid #f3d98b; color:#92620a; border-radius:8px; padding:10px 14px; font-size:13px; margin-bottom:10px; }}
  .table-scroll {{ overflow-x:auto; }}
  footer {{ text-align:center; font-size:12px; color:var(--dim); margin-top:40px; }}
</style>
</head>
<body>
  <div class="page">
    <header>
      <h1>Engagement &amp; Feedback Report</h1>
      <p>Generated {_esc(data.generated_at.strftime('%Y-%m-%d %H:%M UTC'))} &middot; range: {_esc(since_label)} &rarr; now &middot; local report, not deployed anywhere</p>
    </header>

    <section>
      <h2>Overview</h2>
      <div class="stat-grid">
        {_stat_tile('Feedback submissions', data.feedback_total)}
        {_stat_tile('With a drawing', data.feedback_drawing_count)}
        {_stat_tile('Engagement sessions', data.engagement_session_count)}
      </div>
    </section>

    <section>
      <h2>Feedback</h2>
      <h3>Submissions per week</h3>
      {_bar_rows(weekly_pairs)}
      <div class="grid-2">
        <div>
          <h3>By role</h3>
          {_bar_rows(data.feedback_by_role)}
        </div>
        <div>
          <h3>By league</h3>
          {_bar_rows(data.feedback_by_league)}
        </div>
      </div>
      <h3>By team</h3>
      {_bar_rows(data.feedback_by_team)}
      <h3>Recent comments</h3>
      <div class="table-scroll">{_comments_table(data.feedback_comments)}</div>
    </section>

    <section>
      <h2>Engagement</h2>
      <h3>Sessions per week</h3>
      {_bar_rows(engagement_weekly_pairs)}
      <h3>Session duration distribution</h3>
      {_bar_rows(data.engagement_duration_dist)}
      <div class="grid-2">
        <div>
          <h3>Sessions by league</h3>
          {_bar_rows(data.engagement_by_league)}
        </div>
        <div>
          <h3>Sessions by team</h3>
          {_bar_rows(data.engagement_by_team)}
        </div>
      </div>
      <div class="grid-2">
        <div>
          <h3>Most-visited pages/tabs</h3>
          {_bar_rows(data.top_pages)}
        </div>
        <div>
          <h3>Top event types</h3>
          {_bar_rows(data.top_events)}
        </div>
      </div>
    </section>

    <section>
      <h2>Raw feedback detail</h2>
      <div class="pii-warning">Contains self-reported name/email. Not aggregated or charted anywhere above -- do not paste this table into a shared doc/Slack without redacting it first.</div>
      <div class="table-scroll">{_raw_detail_table(data.feedback_raw)}</div>
    </section>

    <footer>mtb-skills &middot; scripts/engagement_report.py &middot; run locally, never deployed</footer>
  </div>
</body>
</html>
"""


# --------------------------------------------------------------------------
# CLI entry point
# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0] if __doc__ else "")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("engagement_report.html"),
        help="Path to write the HTML report to (default: ./engagement_report.html)",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=None,
        help="Only include rows from the last N days (default: all time)",
    )
    args = parser.parse_args(argv)

    database_url = get_database_url()

    since: datetime | None = None
    if args.days is not None:
        since = datetime.now(timezone.utc) - timedelta(days=args.days)

    try:
        with connect(database_url) as conn:
            feedback_rows = fetch_feedback_rows(conn, since=since)
            engagement_rows = fetch_engagement_rows(conn, since=since)
    except psycopg.Error as exc:
        print(f"error: could not read from database: {exc}", file=sys.stderr)
        return 1

    data = build_report_data(feedback_rows, engagement_rows, since=since)
    html_out = render_html(data)
    args.output.write_text(html_out, encoding="utf-8")

    print(
        f"wrote {args.output} "
        f"({data.feedback_total} feedback rows, {len(engagement_rows)} engagement rows)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
