"""End-to-end tests: real Cisco Packet Tracer, real helper, real CLI subprocess.

These tests fail (never skip) when the application is missing or not running.
Run with the harness venv active:

    PATH="$PWD/.venv/bin:$PATH" .venv/bin/pytest -v tests/test_full_e2e.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent.parent))

from cli_anything.packet_tracer.core import inventory as inv  # noqa: E402
from cli_anything.packet_tracer.core.app import bundle_version, find_bundle  # noqa: E402
from cli_anything.packet_tracer.core.ax import AXBridge, AXError  # noqa: E402

MAIN_WINDOW = "Cisco Packet Tracer"


def _resolve_cli(name: str) -> list[str]:
    """Resolve the installed CLI command; falls back to ``python -m`` for dev."""
    force = os.environ.get("CLI_ANYTHING_FORCE_INSTALLED", "").strip() == "1"
    path = shutil.which(name)
    if path:
        print(f"[_resolve_cli] Using installed command: {path}")
        return [path]
    if force:
        raise RuntimeError(f"{name} not found in PATH. Install with: pip install -e .")
    module = "cli_anything.packet_tracer.packet_tracer_cli"
    print(f"[_resolve_cli] Falling back to: {sys.executable} -m {module}")
    return [sys.executable, "-m", module]


@pytest.fixture(scope="session")
def bridge() -> AXBridge:
    return AXBridge()


@pytest.fixture(scope="session")
def live_info(bridge: AXBridge) -> dict:
    info = bridge.doctor()
    if not info.get("running"):
        pytest.fail("Cisco Packet Tracer is not running; open the application and rerun")
    return info


@pytest.fixture(scope="session")
def device_windows(bridge: AXBridge) -> list[str]:
    return [w["title"] for w in bridge.windows() if MAIN_WINDOW not in w.get("title", "")]


# ---------------------------------------------------------------------------
# Live application


def test_app_bundle_is_installed():
    bundle = find_bundle()
    assert bundle is not None, "Cisco Packet Tracer bundle was not found in /Applications"
    assert bundle.exists()
    assert bundle_version(bundle), "bundle has no version metadata"
    print(f"\n  bundle: {bundle} ({bundle_version(bundle)})")


def test_doctor_reports_running_and_trusted(live_info):
    assert live_info.get("accessibilityTrusted") is True, "Accessibility permission is not granted"
    assert live_info.get("windowCount", 0) >= 1


def test_windows_include_main_window(bridge: AXBridge):
    titles = [w["title"] for w in bridge.windows()]
    assert MAIN_WINDOW in titles, titles
    print(f"\n  windows: {titles}")


def test_menubar_exposes_extensions_and_activity_wizard(bridge: AXBridge):
    menus = inv.extract_menus(bridge.menubar())
    titles = [menu["title"] for menu in menus]
    for expected in ("File", "Edit", "Options", "View", "Tools", "Extensions", "Help"):
        assert expected in titles, f"missing menu {expected}: {titles}"
    extensions = next(menu for menu in menus if menu["title"] == "Extensions")
    item_titles = [item["title"] for item in extensions["items"]]
    assert "Activity Wizard ..." in item_titles, item_titles
    print(f"\n  menus: {titles}\n  extensions: {item_titles}")


def test_find_activity_wizard_button(bridge: AXBridge):
    matches = bridge.find("Activity Wizard", contains=True, limit=5)
    assert matches, "Activity Wizard button was not found"
    assert any("AXPress" in match.actions for match in matches), [m.actions for m in matches]


def test_main_window_tree_carries_qt_identifiers(bridge: AXBridge):
    tree = bridge.tree(window=MAIN_WINDOW, depth=8)
    identifiers = [node.get("identifier", "") for node in inv.flatten(tree["tree"])]
    assert any(identifier.startswith("PtApp.CAppWindowBase") for identifier in identifiers)


def test_help_pages_describe_config_tab():
    bundle = find_bundle()
    entries = inv.list_help(bundle)
    files = {entry["file"] for entry in entries}
    assert "config_routers.htm" in files
    assert len(entries) >= 100, f"only {len(entries)} help pages found"
    text = inv.read_help(bundle, "config_routers")
    lowered = text.lower()
    assert "global" in lowered and "routing" in lowered and "interface" in lowered
    assert "equivalent cisco ios commands" in lowered
    print(f"\n  help pages: {len(entries)} (config_routers.htm: {len(text):,} chars)")


# ---------------------------------------------------------------------------
# Inventory artifacts


def test_inventory_menus_writes_real_artifact(bridge: AXBridge, tmp_path: Path):
    bundle = find_bundle()
    report = inv.build_inventory(bridge, bundle, ["menus"])
    out = tmp_path / "menus.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    assert out.stat().st_size > 0
    stored = json.loads(out.read_text(encoding="utf-8"))
    titles = [menu["title"] for menu in stored["menus"]]
    assert len(titles) >= 6
    assert "Extensions" in titles
    print(f"\n  menus artifact: {out} ({out.stat().st_size:,} bytes, {len(titles)} menus)")


def test_inventory_palette_reports_real_models(bridge: AXBridge):
    report = inv.extract_palette(bridge, window=MAIN_WINDOW, pause=0.4)
    categories = {category["name"]: category for category in report["categories"]}
    assert set(inv.PALETTE_TOP_LEVEL) <= set(categories), list(categories)
    network = categories["Network Devices"]
    routers = next(sub for sub in network["subcategories"] if sub["name"] == "Routers")
    router_models = {model["name"] for model in routers["models"]}
    assert {"1841", "ISR4331", "Router-PT"} <= router_models, sorted(router_models)
    end_devices = categories["End Devices"]
    flat_models = {model["name"] for sub in end_devices["subcategories"] for model in sub["models"]}
    assert "PC-PT" in flat_models, sorted(flat_models)
    print(
        f"\n  palette: {len(categories)} categories, "
        f"{sum(len(c['subcategories']) for c in report['categories'])} subcategories, "
        f"routers={len(router_models)} end-devices={len(flat_models)}"
    )
    # Restore the default palette view for humans looking at the screen.
    bridge.click(name="Network Devices", window=MAIN_WINDOW)


def test_inventory_config_handles_live_state(bridge: AXBridge, device_windows: list[str], tmp_path: Path):
    if device_windows:
        target = device_windows[0]
        report = inv.extract_config(bridge, target, select_pages=False)
        groups = {group["name"]: group for group in report["groups"]}
        assert "GLOBAL" in groups, list(groups)
        assert any(page["name"] == "Settings" for page in groups["GLOBAL"]["pages"])
        out = tmp_path / "config.json"
        out.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(f"\n  config artifact: {out} ({len(report['groups'])} groups on {target!r})")
    else:
        # No device window is open; the command must return an explicit empty result.
        report = inv.build_inventory(bridge, find_bundle(), ["config"])
        assert report["config"] == {"window": None, "groups": []}


# ---------------------------------------------------------------------------
# CLI subprocess


class TestCLISubprocess:
    CLI_BASE = _resolve_cli("cli-anything-packet-tracer")

    def _run(self, args: list[str], check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(self.CLI_BASE + args, capture_output=True, text=True, check=check)

    def test_help(self):
        result = self._run(["--help"])
        assert "doctor" in result.stdout and "inventory" in result.stdout

    def test_doctor_json(self):
        result = self._run(["--json", "doctor"])
        payload = json.loads(result.stdout)
        assert payload["installed"] is True
        assert payload["running"] is True
        assert payload["accessibilityTrusted"] is True

    def test_windows_json(self):
        result = self._run(["--json", "windows"])
        payload = json.loads(result.stdout)
        titles = [window["title"] for window in payload["windows"]]
        assert MAIN_WINDOW in titles, titles

    def test_inventory_menus_artifact(self, tmp_path: Path):
        out = tmp_path / "cli-menus.json"
        result = self._run(["--json", "inventory", "menus", "--out", str(out)])
        payload = json.loads(result.stdout)
        assert payload["path"] == str(out)
        stored = json.loads(out.read_text(encoding="utf-8"))
        assert any(menu["title"] == "Extensions" for menu in stored["menus"])
        print(f"\n  CLI artifact: {out} ({out.stat().st_size:,} bytes)")

    def test_dry_run_click_reports_target(self):
        result = self._run(["--json", "--dry-run", "click", "Activity Wizard"])
        payload = json.loads(result.stdout)
        assert payload["dryRun"] is True
        assert payload["wouldClick"] == "Activity Wizard"

    def test_unknown_target_fails_loudly(self):
        result = self._run(["--json", "get", "definitely-not-a-real-element-xyz"], check=False)
        assert result.returncode == 1
        payload = json.loads(result.stdout)
        assert payload["ok"] is False and payload["error"]
