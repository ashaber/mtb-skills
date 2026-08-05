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

from pydantic import BaseModel, Field


class Skill(str, Enum):
    """Matches the `skill` check constraint on `observation` /
    `confirmed_level` (supabase/migrations/0001_schema.sql) and
    app/schema.md's skill identifier table."""

    body_position = "body_position"
    braking = "braking"
    cornering = "cornering"


class ObservationIn(BaseModel):
    """POST /api/observations body. `session_date` defaults to today
    (server-assigned) when omitted -- see app/routes.py."""

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
