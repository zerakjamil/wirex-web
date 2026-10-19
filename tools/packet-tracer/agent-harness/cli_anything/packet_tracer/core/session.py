"""Persistent harness session: last targets, inventory artifacts, undo/redo.

Every mutation the CLI performs through the Accessibility bridge is recorded
here before it is applied, so ``undo``/``redo`` can replay it against the live
application.  State lives in a locked JSON file under the CLI-Anything data
directory and survives across invocations.
"""

from __future__ import annotations

import fcntl
import json
import os
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterator

from .ax import AXBridge


def default_state_dir() -> Path:
    override = os.environ.get("PACKET_TRACER_STATE_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".local" / "share" / "cli-anything" / "packet-tracer"


DEFAULT_SESSION_PATH = default_state_dir() / "session.json"


@dataclass
class Mutation:
    """One value change performed through the harness."""

    label: str
    role: str
    window: str | None
    name: str | None
    identifier: str | None
    before: str
    after: str

    def to_json(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "Mutation":
        return cls(
            label=payload.get("label", ""),
            role=payload.get("role", ""),
            window=payload.get("window"),
            name=payload.get("name"),
            identifier=payload.get("identifier"),
            before=payload.get("before", ""),
            after=payload.get("after", ""),
        )


@dataclass
class Session:
    """Locked JSON session with an undo/redo stack."""

    path: Path = field(default_factory=lambda: DEFAULT_SESSION_PATH)
    last_window: str | None = None
    last_inventory: str | None = None
    last_config_window: str | None = None
    undo_stack: list[Mutation] = field(default_factory=list)
    redo_stack: list[Mutation] = field(default_factory=list)
    updated_at: float = 0.0

    # -- storage ----------------------------------------------------------

    def _lock_path(self) -> Path:
        return self.path.with_suffix(self.path.suffix + ".lock")

    @contextmanager
    def _locked(self) -> Iterator[None]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        lock_path = self._lock_path()
        with lock_path.open("w") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle, fcntl.LOCK_UN)

    def load(self) -> "Session":
        if not self.path.exists():
            return self
        with self._locked():
            try:
                payload = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                return self
        self.last_window = payload.get("last_window")
        self.last_inventory = payload.get("last_inventory")
        self.last_config_window = payload.get("last_config_window")
        self.undo_stack = [Mutation.from_json(item) for item in payload.get("undo", [])]
        self.redo_stack = [Mutation.from_json(item) for item in payload.get("redo", [])]
        self.updated_at = payload.get("updated_at", 0.0)
        return self

    def save(self) -> None:
        payload = {
            "last_window": self.last_window,
            "last_inventory": self.last_inventory,
            "last_config_window": self.last_config_window,
            "undo": [item.to_json() for item in self.undo_stack],
            "redo": [item.to_json() for item in self.redo_stack],
            "updated_at": time.time(),
        }
        with self._locked():
            self.path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        self.updated_at = payload["updated_at"]

    def to_json(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "lastWindow": self.last_window,
            "lastInventory": self.last_inventory,
            "lastConfigWindow": self.last_config_window,
            "undoDepth": len(self.undo_stack),
            "redoDepth": len(self.redo_stack),
            "updatedAt": self.updated_at,
        }

    # -- mutations --------------------------------------------------------

    def record_set(self, mutation: Mutation) -> None:
        self.undo_stack.append(mutation)
        self.redo_stack.clear()
        self.save()

    def _apply(self, bridge: AXBridge, mutation: Mutation, value: str) -> dict[str, Any]:
        result = bridge.set_value(
            name=mutation.name,
            identifier=mutation.identifier,
            value=value,
            role=mutation.role or None,
            window=mutation.window,
        )
        result["label"] = mutation.label
        result["value"] = value
        return result

    def undo(self, bridge: AXBridge) -> dict[str, Any]:
        if not self.undo_stack:
            raise ValueError("nothing to undo")
        mutation = self.undo_stack.pop()
        result = self._apply(bridge, mutation, mutation.before)
        self.redo_stack.append(mutation)
        self.save()
        return result

    def redo(self, bridge: AXBridge) -> dict[str, Any]:
        if not self.redo_stack:
            raise ValueError("nothing to redo")
        mutation = self.redo_stack.pop()
        result = self._apply(bridge, mutation, mutation.after)
        self.undo_stack.append(mutation)
        self.save()
        return result

    def reset(self) -> None:
        self.last_window = None
        self.last_inventory = None
        self.last_config_window = None
        self.undo_stack.clear()
        self.redo_stack.clear()
        self.save()
