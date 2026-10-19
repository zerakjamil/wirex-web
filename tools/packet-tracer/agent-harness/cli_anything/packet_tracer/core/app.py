"""Packet Tracer application discovery and lifecycle helpers."""

from __future__ import annotations

import glob
import os
import plistlib
import re
import subprocess
import time
from pathlib import Path
from typing import Any

from .ax import AXBridge, AXError

BUNDLE_GLOBS = (
    "/Applications/Cisco Packet Tracer */Cisco Packet Tracer*.app",
    "/Applications/Cisco Packet Tracer.app",
    os.path.expanduser("~/Applications/Cisco Packet Tracer */Cisco Packet Tracer*.app"),
    os.path.expanduser("~/Applications/Cisco Packet Tracer.app"),
)


def find_bundle() -> Path | None:
    """Return the newest installed Packet Tracer bundle, if any."""
    candidates: list[Path] = []
    for pattern in BUNDLE_GLOBS:
        candidates.extend(Path(path) for path in glob.glob(pattern))
    if not candidates:
        return None
    return sorted(candidates, key=lambda path: path.stat().st_mtime, reverse=True)[0]


def bundle_version(bundle: Path | None = None) -> str | None:
    """Version from the bundle plist, falling back to the install folder name."""
    bundle = bundle or find_bundle()
    if not bundle:
        return None
    plist_path = bundle / "Contents" / "Info.plist"
    if plist_path.exists():
        try:
            with plist_path.open("rb") as handle:
                plist = plistlib.load(handle)
        except (OSError, plistlib.InvalidFileException):
            plist = {}
        version = plist.get("CFBundleShortVersionString") or plist.get("CFBundleVersion")
        if version:
            return str(version)
    for candidate in (bundle.parent.name, bundle.name):
        match = re.search(r"(\d+\.\d+(?:\.\d+)?)", candidate)
        if match:
            return match.group(1)
    return None


def application_name() -> str:
    bundle = find_bundle()
    if bundle:
        return bundle.stem
    return "Cisco Packet Tracer"


def launch(bridge: AXBridge, wait: float = 90.0, bundle: Path | None = None) -> dict[str, Any]:
    """Launch (or activate) Packet Tracer and wait until a window is visible."""
    bundle = bundle or find_bundle()
    if bundle is None:
        raise AXError(
            "Cisco Packet Tracer is not installed.\n"
            "Install it from https://www.netacad.com/courses/packet-tracer and retry."
        )

    doctor = bridge.doctor()
    if not doctor.get("running"):
        subprocess.run(["open", str(bundle)], check=False)

    deadline = time.monotonic() + wait
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            info = bridge.doctor()
            if info.get("running") and info.get("windowCount", 0) > 0:
                return {
                    "bundle": str(bundle),
                    "version": bundle_version(bundle),
                    "pid": info.get("pid"),
                    "windows": info.get("windowCount"),
                    "launched": True,
                }
        except AXError as exc:
            last_error = exc
        time.sleep(1.0)

    raise AXError(f"Packet Tracer did not present a window within {wait:.0f}s ({last_error})")


def doctor(bridge: AXBridge) -> dict[str, Any]:
    """Combine bundle discovery with live AX state."""
    bundle = find_bundle()
    info: dict[str, Any] = {
        "platform": "macOS",
        "bundle": str(bundle) if bundle else None,
        "version": bundle_version(bundle),
        "installed": bundle is not None,
    }
    live = bridge.doctor()
    info.update(live)
    info["installed"] = bundle is not None
    if live.get("running"):
        try:
            info["windows"] = bridge.windows()
        except AXError as exc:
            info["windowsError"] = str(exc)
    return info
