"""Structured JSON logging to stdout.

Per Andrew's global standard (~/.claude/CLAUDE.md "Logging"): every service
logs structured JSON to stdout, never to files inside containers. Field
shape mirrors the user's Node.js pattern exactly: `level`, `msg`, `ts`
(ISO-8601), plus whatever extra fields the call site passes.

Errors also go to stdout (not stderr) -- Cloud Run/Docker's log collector
treats both streams the same way, and keeping everything on one stream keeps
log ordering simple to reason about for a small skeleton service like this
one. (swim-coach's equivalent module splits error to stderr; either
satisfies "never log to files," this repo keeps it on one stream.)
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any


class JsonLogger:
    """One JSON object per line, written to stdout."""

    def __init__(self, name: str) -> None:
        self.name = name

    def _emit(self, level: str, msg: str, fields: dict[str, Any]) -> None:
        payload = {
            "level": level,
            "msg": msg,
            "logger": self.name,
            "ts": datetime.now(timezone.utc).isoformat(),
            **fields,
        }
        # default=str so a stray non-JSON-serializable value (Path, UUID,
        # Exception, etc.) degrades to its string form instead of raising
        # and losing the whole log line.
        print(json.dumps(payload, default=str), file=sys.stdout, flush=True)

    def info(self, msg: str, **fields: Any) -> None:
        self._emit("info", msg, fields)

    def warn(self, msg: str, **fields: Any) -> None:
        self._emit("warn", msg, fields)

    def error(self, msg: str, **fields: Any) -> None:
        self._emit("error", msg, fields)


def get_logger(name: str) -> JsonLogger:
    return JsonLogger(name)
