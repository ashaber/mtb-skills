"""Pydantic request bodies for the `/api/*` data endpoints (app/routes.py).

Kept separate from routes.py so the request contract (what the frontend
workstream builds against) is easy to scan on its own. Validation failures
here surface as 400 JSON errors, not FastAPI's default 422 -- see
app/main.py's `RequestValidationError` handler.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Skill(str, Enum):
    """Matches the `skill` check constraint on `observation` /
    `confirmed_level` (supabase/migrations/0001_schema.sql) and
    app/schema.md's skill identifier table."""

    body_position = "body_position"
    braking = "braking"
    cornering = "cornering"


class ObservationIn(BaseModel):
    """POST /api/observations body. `session_date` defaults to today
    (server-assigned) when omitted -- see app/routes.py.

    `id` is optional and CLIENT-generated: observations are append-only and
    offline-first (app/schema.md), so the client mints the UUID locally and
    sends it, making the push idempotent -- re-posting the same id after a
    pull is a no-op (union by id) rather than a duplicate. Omitted (e.g. a
    non-sync direct create) -> the server generates one."""

    id: UUID | None = None
    athlete_id: UUID
    skill: Skill
    level_observed: int = Field(ge=1, le=5)
    session_date: date | None = None
    notes: str | None = None


class ConfirmedLevelIn(BaseModel):
    """POST /api/confirmed-levels body. Upserted last-write-wins by
    `(athlete_id, skill)` -- see app/routes.py."""

    athlete_id: UUID
    skill: Skill
    level: int = Field(ge=1, le=5)


class PracticeStatus(str, Enum):
    """Matches the `status` check constraint on `practice`
    (supabase/migrations/0010_practice_attendance.sql) and the local
    frontend model's own active/ended toggle (src/storage.js's
    createPractice/endPractice/reopenPractice)."""

    active = "active"
    ended = "ended"


class PracticeIn(BaseModel):
    """POST /api/practices body. `id` is optional and CLIENT-generated,
    same offline-first idempotent-push pattern as ObservationIn's `id` --
    see its docstring (client mints the UUID locally, re-posting the same
    id after a pull is a no-op via `on conflict (id) do nothing`, not a
    duplicate). `session_date` defaults to today (server-assigned) when
    omitted, same as ObservationIn's `session_date`.

    `ride_group_id` omitted -> app/routes.py's create_practice attributes
    the practice to the caller's own coach ride_group_id if they have one
    (the common "my group's practice" case), else their team (a team-wide
    practice, no single ride group -- HC/TD only, since a plain ride-group
    coach has no ride_group-less write policy on `practice`, see
    0010_practice_attendance.sql's practice_insert_ride_group_coach)."""

    id: UUID | None = None
    ride_group_id: UUID | None = None
    session_date: date | None = None
    status: PracticeStatus | None = None


class AttendanceStatus(str, Enum):
    """Matches the `status` check constraint on `attendance`
    (supabase/migrations/0010_practice_attendance.sql) and the local
    frontend model's attending/absent toggle (src/storage.js's
    toggleAttendance)."""

    attending = "attending"
    absent = "absent"


class AttendanceIn(BaseModel):
    """POST /api/attendance body. Upserted last-write-wins by
    `(practice_id, person_id)` -- see app/routes.py. `person_id` mirrors
    ObservationIn's `athlete_id`: coaches are attendable too, same
    "coaches are assessable" posture as observation/confirmed_level (see
    app/routes.py's `_resolve_athlete_scope` docstring) -- this field is
    deliberately not role-filtered."""

    practice_id: UUID
    person_id: UUID
    status: AttendanceStatus = AttendanceStatus.attending


# Matches the `role` check constraint on `person`
# (supabase/migrations/0001_schema.sql) and app/identity.py's COACH_ROLES
# plus 'athlete'.
VALID_ROSTER_ROLES = ("league_staff", "head_coach", "team_director", "coach", "athlete")


class RosterRowIn(BaseModel):
    """One row of a POST /api/roster/import body (app/roster.py). The
    client (a future CSV/Google-Sheet-import UI, out of scope for this
    increment) has already parsed a sheet/CSV into rows shaped like this --
    this backend only merges already-parsed rows, it does not parse a CSV
    or fetch a sheet itself.

    Deliberately has NO `team_id` field -- the target team is always the
    caller's own HC/TD team, derived server-side in app/routes.py, never
    taken from the row (see app/roster.py's module docstring). Grade/
    category (CLAUDE.md's Phase 2b column-mapping table) mirror the
    frontend's athlete fields (src/storage.js) -- see supabase/migrations/
    0006_person_grade_category.sql, which added the matching `person`
    columns. A blank/whitespace grade or category is normalized to None,
    same as email/ride_group/external_id below. A non-numeric-looking
    `grade` (e.g. a stray header value from a malformed CSV column mapping)
    is dropped to None rather than rejected -- a bad grade cell shouldn't
    400 an entire import batch.

    `tags` (supabase/migrations/0007_person_tags.sql) is the descriptive
    folksonomy (lead/sweep/floater/...) -- NOT part of CLAUDE.md's Phase 2b
    column-mapping table (no sheet-column source is defined for it yet), but
    carried here so a future importer/UI can set it. Normalized the same way
    as the other optional fields: each entry stripped, lowercased, blanks
    dropped, duplicates collapsed (order-preserving). Defaults to an empty
    list, never None -- matches the column's own `not null default '{}'`."""

    name: str
    role: str = "athlete"
    email: str | None = None
    ride_group: str | None = None
    external_id: str | None = None
    grade: int | None = None
    category: str | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def _name_non_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped

    @field_validator("role", mode="before")
    @classmethod
    def _role_default_and_valid(cls, value: str | None) -> str:
        # Blank/omitted role -> 'athlete' (CLAUDE.md's column-mapping
        # table: "Role, Type -> role (\"athlete\" / \"coach\"), default:
        # athlete").
        if value is None or not str(value).strip():
            return "athlete"
        role = str(value).strip().lower()
        if role not in VALID_ROSTER_ROLES:
            raise ValueError(f"role must be one of {VALID_ROSTER_ROLES}")
        return role

    @field_validator("email", "ride_group", "external_id", "category")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("grade", mode="before")
    @classmethod
    def _grade_numeric_or_none(cls, value: Any) -> int | None:
        # Blank/whitespace -> None (same as the other optional fields). A
        # non-numeric-looking value (e.g. a stray header/label that slipped
        # through a malformed CSV column mapping) is also dropped to None
        # rather than raising -- a bad grade cell shouldn't 400 the whole
        # import batch (CLAUDE.md's Phase 2b "don't 400 on a non-numeric
        # grade" rule).
        if value is None:
            return None
        if isinstance(value, bool):  # bool is an int subclass -- reject explicitly
            return None
        if isinstance(value, int):
            return value
        stripped = str(value).strip()
        if not stripped:
            return None
        try:
            return int(stripped)
        except ValueError:
            try:
                return int(float(stripped))
            except (TypeError, ValueError):
                return None

    @field_validator("tags", mode="before")
    @classmethod
    def _normalize_tags(cls, value: Any) -> list[str]:
        # Blank/whitespace entries dropped, everything lowercased, order-
        # preserving de-dupe -- same "don't 400 on messy input" posture as
        # the other optional fields above. `None` (an omitted/null tags
        # field) normalizes to an empty list rather than being rejected.
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("tags must be a list of strings")
        seen: set[str] = set()
        normalized: list[str] = []
        for item in value:
            cleaned = str(item).strip().lower()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            normalized.append(cleaned)
        return normalized


class RosterImportIn(BaseModel):
    """POST /api/roster/import body. `rows` must be non-empty -- an empty
    import is almost certainly a client bug (e.g. a sheet fetch that
    silently returned nothing), not a legitimate no-op request."""

    rows: list[RosterRowIn] = Field(min_length=1)


class AthleteIn(BaseModel):
    """POST /api/athletes body -- a coach adds ONE athlete to their own
    ride group (docs/PHASE3_RECONCILIATION_PLAN.md decision (a): walk-up SA
    / one-time-waiver record). Authorization is enforced by Postgres RLS
    (supabase/migrations/0008_coach_add_athlete_rls.sql), not by this
    schema -- this schema's job is only to shape/validate the request body.

    Deliberately has NO `role` field -- this endpoint only ever creates
    `role = 'athlete'` rows (app/routes.py hardcodes it in the INSERT), so
    there is no field for a client to set it through. `model_config`
    forbids any extra/unknown field (including a client-supplied `role`),
    surfacing as a 400 "invalid request" via app/main.py's
    RequestValidationError handler -- a client cannot sneak a `role`
    (or `team_id`, which is likewise never taken from the request body and
    is always derived server-side from `ride_group_id`) past this schema."""

    model_config = ConfigDict(extra="forbid")

    name: str
    ride_group_id: UUID
    grade: int | None = None
    category: str | None = None

    @field_validator("name")
    @classmethod
    def _name_non_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class FeedbackIn(BaseModel):
    """POST /api/feedback body -- the 💬 feedback-modal payload
    (src/feedback.js's `_submitFeedback`), routed to this ANONYMOUS backend
    endpoint instead of the Google Sheet (supabase/migrations/0011_feedback.sql).

    No auth on this endpoint (app/routes.py's `POST /api/feedback` has no
    `Depends(get_caller)`) -- there is no persona behind a feedback
    submission, identity is entirely self-reported in these fields. That
    makes this the one open (unauthenticated) write surface in the backend,
    so validation here IS the spam/abuse guard, not just a data-shape
    check: every text field is length-capped, and at least one of
    `comment` / `has_drawing` must be present (mirrors the frontend's own
    submit-ready check in src/feedback.js's `_checkSubmitReady`).

    `type` is accepted but not required/validated against a fixed value --
    the frontend always sends `'feedback'` (the `'engagement'` stream never
    reaches this endpoint, see src/feedback.js's routing), but this schema
    doesn't need to police that; it's the caller's job to only POST feedback
    submissions here in the first place.

    `ConfigDict(extra="ignore")` -- forward-compat: the frontend payload may
    grow fields (e.g. `timestamp`) this backend doesn't persist yet; an
    unknown key should never 400 a feedback submission.

    `screenshot` / `drawing` are base64 PNG data URLs (`canvas.toDataURL`) --
    capped at ~3MB of base64 text each, matching the practical ceiling of a
    single mobile-viewport canvas snapshot with generous headroom, not an
    arbitrary round number. `user_agent` is deliberately NOT a field here --
    app/routes.py captures it server-side from the request's `User-Agent`
    header, never trusting a client-supplied value for it.
    """

    # `populate_by_name=True` -- the frontend sends camelCase keys
    # (`userName`, `hasDrawing`, `screenshotUrl`, `drawingUrl`); the Python
    # side uses snake_case field names to match every other schema/route in
    # this module. `extra="ignore"` per the forward-compat note above.
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: str | None = None
    page: str | None = Field(default=None, max_length=500)
    role: str | None = Field(default=None, max_length=500)
    user_name: str | None = Field(default=None, max_length=500, alias="userName")
    email: str | None = Field(default=None, max_length=500)
    league: str | None = Field(default=None, max_length=500)
    team: str | None = Field(default=None, max_length=500)
    comment: str | None = Field(default=None, max_length=5000)
    has_drawing: bool = Field(default=False, alias="hasDrawing")
    screenshot: str | None = Field(default=None, max_length=3_000_000, alias="screenshotUrl")
    drawing: str | None = Field(default=None, max_length=3_000_000, alias="drawingUrl")
    app_version: str | None = Field(default=None, max_length=500, alias="appVersion")

    @field_validator("comment")
    @classmethod
    def _blank_comment_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("user_name", "email", "league", "team", "page", "role", "app_version")
    @classmethod
    def _blank_optional_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @model_validator(mode="after")
    def _require_comment_or_drawing(self) -> "FeedbackIn":
        # A plain @field_validator("has_drawing") would NOT fire when the
        # client omits `hasDrawing` entirely (pydantic v2 skips per-field
        # validators on a field that falls back to its default, unless
        # `validate_default=True`) -- a model-level `mode="after"` validator
        # runs unconditionally on the fully-built model instead, so an
        # omitted `hasDrawing` + omitted/blank `comment` is still caught.
        if not self.comment and not self.has_drawing:
            raise ValueError("feedback must include a comment or a drawing")
        return self


# Cap on the SERIALIZED `events` JSON, in characters -- bounds the size of
# the jsonb payload `POST /api/engagement` will insert, regardless of
# whether the client sent `events` as a JSON string or a native JSON array
# (see EngagementIn._events_string_or_list below). ~500KB of JSON is
# generous headroom over a normal 15-event flush batch (src/feedback.js's
# `_trackEvent` flushes at 15 events or on the 60s interval, whichever
# comes first) while still bounding this anonymous, unauthenticated write
# surface the same way FeedbackIn caps screenshot/drawing size above.
_MAX_EVENTS_JSON_CHARS = 500_000


class EngagementIn(BaseModel):
    """POST /api/engagement body -- the usage-tracking ping payload
    (src/feedback.js's `_flushEngagement`), routed to this ANONYMOUS backend
    endpoint instead of the Google Sheet (supabase/migrations/
    0012_engagement.sql). This is the LAST stream still posting to the
    sheet before this migration; once it ships, the sheet is unused.

    No auth on this endpoint (app/routes.py's `POST /api/engagement` has no
    `Depends(get_caller)`), same posture as FeedbackIn above -- there is no
    persona behind an engagement ping, identity (`user_name`/`league`/
    `team`) is entirely self-reported (mirrored from the feedback-session
    profile, see src/feedback.js). Every text field is length-capped for
    the same open-write-surface reason FeedbackIn's fields are.

    Every field is optional -- an engagement flush with just a `session_id`
    (or even less) is a legitimate ping -- but `_require_not_empty` below
    still rejects a request body that is entirely empty, since that's
    almost certainly a client bug rather than a real flush.

    `ConfigDict(extra="ignore", populate_by_name=True)` mirrors FeedbackIn:
    forward-compat against payload fields this backend doesn't persist yet,
    and accepts the frontend's camelCase keys via `alias=` while the Python
    side stays snake_case.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: str | None = None
    session_id: str | None = Field(default=None, max_length=500, alias="sessionId")
    session_start: datetime | None = Field(default=None, alias="sessionStart")
    duration_sec: int | None = Field(default=None, ge=0, alias="durationSec")
    user_name: str | None = Field(default=None, max_length=500, alias="userName")
    league: str | None = Field(default=None, max_length=500)
    team: str | None = Field(default=None, max_length=500)
    event_count: int | None = Field(default=None, ge=0, alias="eventCount")
    events: list[Any] | None = None
    app_version: str | None = Field(default=None, max_length=500, alias="appVersion")

    @field_validator("session_id", "user_name", "league", "team", "app_version")
    @classmethod
    def _blank_optional_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("session_start", mode="before")
    @classmethod
    def _session_start_lenient(cls, value: Any) -> Any:
        # `sessionStart` arrives as `new Date(...).toISOString()` (src/
        # feedback.js's `_flushEngagement`) -- a proper ISO 8601 string --
        # but usage data shouldn't be lost to one malformed timestamp: an
        # unparseable value stores as null instead of 400ing the whole
        # ping (CLAUDE.md task brief). Runs `mode="before"` so it can
        # swallow a parse failure itself, rather than letting pydantic's
        # own datetime coercion raise a ValidationError for a bad string.
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            try:
                # `datetime.fromisoformat` (3.11+) doesn't accept a bare
                # trailing "Z" -- normalize it to the equivalent explicit
                # UTC offset it does accept.
                return datetime.fromisoformat(text[:-1] + "+00:00" if text.endswith("Z") else text)
            except ValueError:
                return None
        return None  # unrecognized shape (e.g. a number) -- store null, never 400

    @field_validator("events", mode="before")
    @classmethod
    def _events_string_or_list(cls, value: Any) -> Any:
        # Accepts EITHER a JSON string (what src/feedback.js's
        # `_flushEngagement` sends today: `JSON.stringify(_events)`) OR an
        # already-decoded JSON array -- normalizes either shape to a
        # native list before pydantic stores it, so app/routes.py can hand
        # it straight to psycopg's jsonb adapter without caring which shape
        # the client sent. A string over the size cap is rejected before
        # attempting to parse it (no point paying the json.loads cost on
        # something that will be rejected anyway); the equivalent
        # re-serialized-size check also runs on an already-a-list value, so
        # the cap is enforced the same way regardless of input shape.
        if value is None:
            return None
        if isinstance(value, str):
            if len(value) > _MAX_EVENTS_JSON_CHARS:
                raise ValueError(f"events payload too large (max {_MAX_EVENTS_JSON_CHARS} chars)")
            try:
                value = json.loads(value)
            except (json.JSONDecodeError, TypeError) as exc:
                raise ValueError("events must be valid JSON") from exc
        if not isinstance(value, list):
            raise ValueError("events must be a JSON array, or a JSON string of one")
        if len(json.dumps(value)) > _MAX_EVENTS_JSON_CHARS:
            raise ValueError(f"events payload too large (max {_MAX_EVENTS_JSON_CHARS} chars)")
        return value

    @model_validator(mode="after")
    def _require_not_empty(self) -> "EngagementIn":
        # An omitted/blank `type` doesn't count toward "non-empty" -- it's
        # the caller's job to only POST engagement pings here in the first
        # place (same posture as FeedbackIn's `type`), so a body that is
        # ONLY `{"type": "engagement"}` is still rejected as empty.
        has_content = any(
            [
                self.session_id,
                self.session_start is not None,
                self.duration_sec is not None,
                self.user_name,
                self.league,
                self.team,
                self.event_count is not None,
                self.events,
                self.app_version,
            ]
        )
        if not has_content:
            raise ValueError("engagement payload must not be entirely empty")
        return self


class AssignRideGroupIn(BaseModel):
    """POST /api/roster/assign body -- an HC/TD reassigns (or unassigns) an
    athlete's `ride_group_id`. Authorization is enforced by Postgres RLS's
    `person_update` policy (HC/TD, team-wide -- supabase/migrations/
    0002_rls.sql), not by this schema; app/routes.py's `assign_ride_group`
    additionally guards against pointing a person at a DIFFERENT team's
    ride_group (RLS alone would deny that too, since person_update's `with
    check` re-validates the row's own team_id against the caller's HC team
    ids, but the route makes the guard explicit rather than relying solely
    on the database catching it).

    `ride_group_id: None` means unassign (clears the field) -- required (no
    default) so a caller must say so explicitly rather than an omitted key
    silently doing nothing."""

    model_config = ConfigDict(extra="forbid")

    person_id: UUID
    ride_group_id: UUID | None
