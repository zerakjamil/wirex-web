"""Accessibility bridge for Cisco Packet Tracer on macOS.

Packet Tracer has no scripting interface.  The harness therefore drives the
real application through the macOS Accessibility (AX) API.  A small Swift
helper (``utils/ptax.swift``) performs the AX calls; this module owns helper
discovery, compilation and the JSON command surface the CLI consumes.

The real software is a hard dependency: when Packet Tracer is not running or
the helper cannot be built, every command fails loudly with an actionable
message instead of falling back to a simulation.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class AXError(RuntimeError):
    """Raised when the Accessibility bridge or Packet Tracer itself fails."""


HELPER_ENV = "PACKET_TRACER_AX_HELPER"
SWIFT_SOURCE = Path(__file__).resolve().parent.parent / "utils" / "ptax.swift"


def _default_helper_path() -> Path:
    return Path(__file__).resolve().parent.parent / "utils" / "ptax"


def resolve_helper(recompile: bool = False) -> Path:
    """Return the path to the compiled ``ptax`` helper, building it if needed."""
    override = os.environ.get(HELPER_ENV)
    if override:
        path = Path(override).expanduser()
        if not path.exists():
            raise AXError(f"{HELPER_ENV} points at a missing file: {path}")
        return path

    helper = _default_helper_path()
    if helper.exists() and not recompile:
        return helper

    if not SWIFT_SOURCE.exists():
        raise AXError(f"AX helper source is missing: {SWIFT_SOURCE}")

    compiler = shutil.which("swiftc")
    if not compiler:
        raise AXError(
            "swiftc is required to build the Packet Tracer AX helper.\n"
            "Install the Xcode command line tools:  xcode-select --install"
        )

    helper.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            compiler,
            "-O",
            "-o",
            str(helper),
            str(SWIFT_SOURCE),
            "-framework",
            "ApplicationServices",
            "-framework",
            "AppKit",
        ],
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0 or not helper.exists():
        raise AXError(f"failed to build {helper}:\n{result.stderr.strip()}")
    return helper


@dataclass
class Element:
    """One AX node as reported by the helper."""

    role: str
    title: str
    description: str
    value: str
    position: tuple[float, float] | None
    size: tuple[float, float] | None
    identifier: str = ""
    actions: tuple[str, ...] = ()

    @property
    def label(self) -> str:
        return self.title or self.description or self.identifier

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> "Element":
        position = payload.get("position")
        size = payload.get("size")
        return cls(
            role=payload.get("role", ""),
            title=payload.get("title", ""),
            description=payload.get("description", ""),
            value=str(payload.get("value", "")),
            position=(position[0], position[1]) if position else None,
            size=(size[0], size[1]) if size else None,
            identifier=payload.get("identifier", ""),
            actions=tuple(payload.get("actions", ())),
        )


class AXBridge:
    """Thin, typed wrapper around the ``ptax`` Swift helper."""

    def __init__(self, helper: Path | None = None, dry_run: bool = False):
        self.helper = helper
        self.dry_run = dry_run

    # -- process plumbing -------------------------------------------------

    def _helper(self) -> Path:
        if self.helper is None:
            self.helper = resolve_helper()
        return self.helper

    def _run(self, *args: str, timeout: float = 120.0) -> Any:
        command = [str(self._helper()), *args]
        try:
            result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        except FileNotFoundError as exc:  # pragma: no cover - environment failure
            raise AXError(f"AX helper vanished: {command[0]}") from exc
        except subprocess.TimeoutExpired as exc:
            raise AXError(f"AX helper timed out after {timeout:.0f}s: {' '.join(args)}") from exc

        output = result.stdout.strip()
        if not output:
            raise AXError(
                f"AX helper produced no output (exit {result.returncode}): "
                f"{' '.join(args)}\n{result.stderr.strip()}"
            )
        try:
            payload = json.loads(output)
        except json.JSONDecodeError as exc:
            raise AXError(f"AX helper returned non-JSON output: {output[:400]}") from exc

        if not payload.get("ok"):
            raise AXError(str(payload.get("error", "unknown AX failure")))
        return payload.get("data")

    # -- commands ---------------------------------------------------------

    def doctor(self) -> dict[str, Any]:
        return self._run("doctor")

    def windows(self) -> list[dict[str, Any]]:
        return self._run("windows").get("windows", [])

    def tree(self, window: str | None = None, depth: int = 6, actions: bool = False) -> dict[str, Any]:
        args = ["tree", "--depth", str(depth)]
        if window:
            args += ["--window", window]
        if actions:
            args.append("--actions")
        return self._run(*args)

    def find(
        self,
        name: str | None = None,
        role: str | None = None,
        contains: bool = False,
        window: str | None = None,
        limit: int = 20,
        identifier: str | None = None,
    ) -> list[Element]:
        args = ["find", "--limit", str(limit)]
        if name:
            args += ["--name", name]
        if identifier:
            args += ["--identifier", identifier]
        if role:
            args += ["--role", role]
        if contains:
            args.append("--contains")
        if window:
            args += ["--window", window]
        if not name and not identifier:
            raise AXError("find requires a name or identifier")
        data = self._run(*args)
        return [Element.from_json(item) for item in data.get("matches", [])]

    def get(
        self,
        name: str | None = None,
        role: str | None = None,
        contains: bool = False,
        identifier: str | None = None,
    ) -> Element:
        args = ["get"]
        if name:
            args += ["--name", name]
        if identifier:
            args += ["--identifier", identifier]
        if role:
            args += ["--role", role]
        if contains:
            args.append("--contains")
        if not name and not identifier:
            raise AXError("get requires a name or identifier")
        return Element.from_json(self._run(*args))

    def click(
        self,
        name: str | None = None,
        role: str | None = None,
        index: int = 0,
        window: str | None = None,
        mode: str = "press",
        contains: bool = False,
        identifier: str | None = None,
        count: int = 1,
    ) -> dict[str, Any]:
        args = ["click", "--index", str(index), "--mode", mode]
        if count > 1:
            args += ["--count", str(count)]
        if name:
            args += ["--name", name]
        if identifier:
            args += ["--identifier", identifier]
        if not name and not identifier:
            raise AXError("click requires a name or identifier")
        if role:
            args += ["--role", role]
        if contains:
            args.append("--contains")
        if window:
            args += ["--window", window]
        if self.dry_run:
            match = self.find(name, role=role, contains=contains, window=window, limit=index + 1, identifier=identifier)
            if index >= len(match):
                raise AXError(f"no element matched {name or identifier!r} at index {index}")
            element = match[index]
            return {
                "dryRun": True,
                "wouldClick": name or identifier,
                "role": element.role,
                "position": element.position,
                "size": element.size,
            }
        return self._run(*args)

    def click_at(self, x: float, y: float, count: int = 1) -> dict[str, Any]:
        """Click absolute screen coordinates (workspace canvas interactions)."""
        args = ["click-at", "--x", str(int(x)), "--y", str(int(y))]
        if count > 1:
            args += ["--count", str(count)]
        if self.dry_run:
            return {"dryRun": True, "wouldClickAt": [x, y], "count": count}
        return self._run(*args)

    def set_value(
        self,
        name: str | None = None,
        value: str = "",
        role: str | None = None,
        index: int = 0,
        window: str | None = None,
        contains: bool = False,
        identifier: str | None = None,
    ) -> dict[str, Any]:
        args = ["set", "--value", value, "--index", str(index)]
        if name:
            args += ["--name", name]
        if identifier:
            args += ["--identifier", identifier]
        if not name and not identifier:
            raise AXError("set requires a name or identifier")
        if role:
            args += ["--role", role]
        if contains:
            args.append("--contains")
        if window:
            args += ["--window", window]
        if self.dry_run:
            match = self.find(name, role=role, contains=contains, window=window, limit=index + 1, identifier=identifier)
            if index >= len(match):
                raise AXError(f"no element matched {name or identifier!r} at index {index}")
            element = match[index]
            return {
                "dryRun": True,
                "wouldSet": name or identifier,
                "from": element.value,
                "to": value,
                "role": element.role,
            }
        return self._run(*args)

    def menubar(self) -> list[dict[str, Any]]:
        return self._run("menubar").get("menus", [])

    def menu_click(self, path: str) -> dict[str, Any]:
        if self.dry_run:
            return {"dryRun": True, "wouldClickMenu": path}
        return self._run("menu-click", "--path", path)

    def activate(self) -> dict[str, Any]:
        return self._run("activate")

    def type_text(self, text: str) -> dict[str, Any]:
        if self.dry_run:
            return {"dryRun": True, "wouldType": text}
        return self._run("type", "--text", text)

    def key(self, combo: str) -> dict[str, Any]:
        if self.dry_run:
            return {"dryRun": True, "wouldPress": combo}
        return self._run("key", "--combo", combo)

    def screenshot(self, window: str, out: str) -> dict[str, Any]:
        return self._run("screenshot", "--window", window, "--out", out)

    # -- convenience ------------------------------------------------------

    def wait_for(
        self,
        name: str,
        role: str | None = None,
        contains: bool = False,
        window: str | None = None,
        timeout: float = 30.0,
        interval: float = 0.5,
    ) -> Element:
        deadline = time.monotonic() + timeout
        last_error: Exception | None = None
        while time.monotonic() < deadline:
            try:
                matches = self.find(name, role=role, contains=contains, window=window, limit=1)
                if matches:
                    return matches[0]
            except AXError as exc:
                last_error = exc
            time.sleep(interval)
        detail = f" (last error: {last_error})" if last_error else ""
        raise AXError(f"timed out waiting for {name!r}{detail}")
