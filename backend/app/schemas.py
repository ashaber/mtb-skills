"""Pydantic request bodies for the `/api/*` data endpoints (app/routes.py).

Kept separate from routes.py so the request contract (what the frontend
workstream builds against) is easy to scan on its own. Validation failures
here surface as 400 JSON errors, not FastAPI's default 422 -- see
app/main.py's `RequestValidationError` handler.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


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
    category (CLAUDE.md's Phase 2b column-mapping table) are intentionally
    NOT modeled here -- the `person` table has no columns for them yet, so
    they are simply not accepted (not silently accepted-and-dropped)."""

    name: str
    role: str = "athlete"
    email: str | None = None
    ride_group: str | None = None
    external_id: str | None = None

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

    @field_validator("email", "ride_group", "external_id")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class RosterImportIn(BaseModel):
    """POST /api/roster/import body. `rows` must be non-empty -- an empty
    import is almost certainly a client bug (e.g. a sheet fetch that
    silently returned nothing), not a legitimate no-op request."""

    rows: list[RosterRowIn] = Field(min_length=1)
