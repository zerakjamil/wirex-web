"""Unit tests: fixtures and fakes only, no live application required."""

from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path

import pytest
from click.testing import CliRunner

HERE = Path(__file__).resolve().parent
PACKAGE_ROOT = HERE.parent
sys.path.insert(0, str(PACKAGE_ROOT.parent.parent))

from cli_anything.packet_tracer import packet_tracer_cli as cli_module  # noqa: E402
from cli_anything.packet_tracer.core import inventory as inv  # noqa: E402
from cli_anything.packet_tracer.core.ax import AXBridge, AXError, Element  # noqa: E402
from cli_anything.packet_tracer.core.session import Mutation, Session  # noqa: E402

FIXTURES = HERE / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Fakes


class FakeBridge:
    """Records calls and replays captured AX trees."""

    def __init__(self, trees: dict[str | None, dict] | None = None, menus: list | None = None):
        self.trees = trees or {}
        self._menus = menus or []
        self.calls: list[tuple] = []
        self.window_list = [{"title": "Cisco Packet Tracer", "position": [0, 30], "size": [1920, 960]}]

    def tree(self, window=None, depth=6, actions=False):
        self.calls.append(("tree", window, depth))
        return self.trees.get(window, self.trees.get(None, {"title": window, "tree": {}}))

    def windows(self):
        return list(self.window_list)

    def menubar(self):
        return self._menus

    def click(self, name=None, identifier=None, window=None, mode="press", **_kwargs):
        self.calls.append(("click", name, identifier, window, mode))
        return {"clicked": name or identifier, "method": mode}

    def doctor(self):
        return {"running": True, "pid": 4242, "windowCount": len(self.window_list)}

    def find(self, name=None, role=None, contains=False, window=None, limit=20, identifier=None):
        self.calls.append(("find", name, identifier))
        return []

    def get(self, name=None, role=None, contains=False, identifier=None):
        self.calls.append(("get", name, identifier))
        return Element(role="AXTextField", title=name or "", description="", value="old", position=None, size=None)

    def set_value(self, name=None, value="", role=None, index=0, window=None, contains=False, identifier=None):
        self.calls.append(("set", name, value))
        return {"set": name or identifier, "value": value, "role": role or "AXTextField"}


class FakeHelperBridge(AXBridge):
    """AXBridge wired to a stub helper script, for dry-run behavior."""

    def __init__(self, helper: Path, dry_run: bool = False):
        super().__init__(helper=helper, dry_run=dry_run)


@pytest.fixture()
def fake_helper(tmp_path: Path) -> tuple[Path, Path]:
    """Executable stub helper that answers ``find`` and logs every invocation."""
    log = tmp_path / "calls.log"
    script = tmp_path / "ptax"
    script.write_text(
        "#!/usr/bin/env python3\n"
        "import json, sys\n"
        f"open({str(log)!r}, 'a').write(' '.join(sys.argv[1:]) + '\\n')\n"
        "args = sys.argv[1:]\n"
        "if args and args[0] == 'find':\n"
        "    print(json.dumps({'ok': True, 'data': {'count': 1, 'matches': [{'role': 'AXButton', 'title': 'Target', 'description': '', 'value': '', 'position': [10, 20], 'size': [30, 10], 'actions': ['AXPress']}]}}))\n"
        "else:\n"
        "    print(json.dumps({'ok': True, 'data': {}}))\n"
    )
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return script, log


# ---------------------------------------------------------------------------
# core.inventory


def test_flatten_preserves_document_order():
    tree = {"role": "root", "children": [{"role": "a"}, {"role": "b", "children": [{"role": "c"}]}]}
    roles = [node["role"] for node in inv.flatten(tree)]
    assert roles == ["root", "a", "b", "c"]


def test_extract_menus_drops_apple_and_flattens_submenus():
    raw = [
        {"title": "Apple", "items": [{"title": "About"}]},
        {"title": "File", "items": [{"title": "New"}, {"title": "Open", "items": [{"title": "Lab", "enabled": True}]}]},
        {"title": "Extensions", "items": [{"title": "Activity Wizard ...", "enabled": True}]},
    ]
    menus = inv.extract_menus(raw)
    assert [menu["title"] for menu in menus] == ["File", "Extensions"]
    file_items = {item["title"]: item for item in menus[0]["items"]}
    assert file_items["Open"]["items"] == ["Lab"]
    assert menus[1]["items"][0]["title"] == "Activity Wizard ..."


def test_extract_workspace_reports_modes_toolbar_and_tools():
    fixture = load_fixture("workspace_tree.json")
    workspace = inv.extract_workspace(fixture)
    mode_names = [mode["name"] for mode in workspace["modes"]]
    assert set(mode_names) == {"Realtime Mode", "Simulation Mode", "Logical Mode", "Physical Mode"}
    realtime = next(mode for mode in workspace["modes"] if mode["name"] == "Realtime Mode")
    assert realtime["value"] == "1"
    assert [tool["name"] for tool in workspace["tools"]][:2] == ["Select", "Inspect"]
    assert workspace["tools"][0]["hotkey"] == "Esc"
    assert any(button["name"].startswith("Environment") for button in workspace["toolbar"])
    scenario_names = [scenario["name"] for scenario in workspace["scenarios"]]
    assert "Scenario 0" in scenario_names and "New" in scenario_names


def test_extract_palette_reads_groups_types_and_models():
    fixture = load_fixture("main_tree.json")
    bridge = FakeBridge(trees={"Cisco Packet Tracer": fixture})
    report = inv.extract_palette(bridge, window="Cisco Packet Tracer", pause=0)
    names = [category["name"] for category in report["categories"]]
    assert names == list(inv.PALETTE_TOP_LEVEL)
    first = report["categories"][0]
    assert first["subcategories"], "network devices subcategories were not parsed"
    model_names = {model["name"] for sub in first["subcategories"] for model in sub["models"]}
    assert {"1841", "ISR4331", "Router-PT"} <= model_names
    sources = {model["source"] for sub in first["subcategories"] for model in sub["models"]}
    assert sources <= {"stock", "custom"}, sources
    assert sources == {"stock", "custom"}, "fixture must exercise both stock and custom models"
    # every group was clicked and every subcategory was clicked
    clicks = [call for call in bridge.calls if call[0] == "click"]
    assert len(clicks) >= len(inv.PALETTE_TOP_LEVEL)


def test_extract_config_groups_and_pages():
    fixture = load_fixture("config_tree.json")
    bridge = FakeBridge(trees={"Router1": fixture})
    report = inv.extract_config(bridge, "Router1", select_pages=False)
    groups = {group["name"]: group for group in report["groups"]}
    assert set(groups) == {"GLOBAL", "ROUTING", "SWITCHING", "INTERFACE"}
    assert [page["name"] for page in groups["GLOBAL"]["pages"]] == ["Settings", "Algorithm Settings"]
    assert [page["name"] for page in groups["ROUTING"]["pages"]] == ["Static", "RIP"]
    assert groups["ROUTING"]["pages"][0]["selected"] is True
    assert [page["name"] for page in groups["INTERFACE"]["pages"]] == [
        "GigabitEthernet0/0/0",
        "GigabitEthernet0/0/1",
        "GigabitEthernet0/0/2",
    ]


def test_extract_config_select_pages_captures_content():
    fixture = load_fixture("config_tree.json")
    bridge = FakeBridge(trees={"Router1": fixture})
    report = inv.extract_config(bridge, "Router1", select_pages=True)
    routing = next(group for group in report["groups"] if group["name"] == "ROUTING")
    static = next(page for page in routing["pages"] if page["name"] == "Static")
    content = static["content"]
    assert "Static Routes" in content["labels"]
    assert {"Network", "Mask", "Next Hop"} <= set(content["labels"])
    assert len(content["fields"]) == 3
    assert "Add" in content["buttons"] and "Remove" in content["buttons"]
    assert "Equivalent IOS Commands" in content["labels"]
    assert content["tables"] and isinstance(content["tables"][0]["columns"], list)


def test_extract_config_rejects_window_without_tree():
    bridge = FakeBridge(trees={"Other": {"title": "Other", "tree": {"role": "AXWindow"}}})
    with pytest.raises(AXError):
        inv.extract_config(bridge, "Other")


def test_html_to_text_strips_tags(tmp_path: Path):
    page = tmp_path / "page.htm"
    page.write_text("<html><head><title>Devices</title><style>b{}</style></head><body><h1>Routers</h1><p>ISR4331 &amp; 2911</p></body></html>", encoding="utf-8")
    text = inv.html_to_text(page)
    assert "Routers" in text and "ISR4331 & 2911" in text
    assert "<" not in text and "b{}" not in text


def test_help_listing_and_read(tmp_path: Path):
    bundle = tmp_path / "Packet Tracer.app"
    help_dir = bundle / "Contents" / "help" / "default"
    help_dir.mkdir(parents=True)
    (help_dir / "config_routers.htm").write_text("<html><body><h1>Configuring Routers</h1><p>GLOBAL, ROUTING, SWITCHING, and INTERFACE</p></body></html>", encoding="utf-8")
    (help_dir / "devicesAndModules_routers.htm").write_text("<html><body><h1>Routers</h1></body></html>", encoding="utf-8")
    entries = inv.list_help(bundle)
    assert {entry["file"] for entry in entries} == {"config_routers.htm", "devicesAndModules_routers.htm"}
    text = inv.read_help(bundle, "config_routers")
    assert "SWITCHING" in text
    with pytest.raises(AXError):
        inv.read_help(bundle, "does-not-exist")


# ---------------------------------------------------------------------------
# core.session


def test_session_roundtrip(tmp_path: Path):
    path = tmp_path / "session.json"
    session = Session(path=path)
    session.last_window = "Router1"
    session.record_set(Mutation(label="Hostname", role="AXTextField", window="Router1", name="Hostname", identifier=None, before="Router", after="Core"))
    reloaded = Session(path=path).load()
    assert reloaded.last_window == "Router1"
    assert len(reloaded.undo_stack) == 1
    assert reloaded.undo_stack[0].after == "Core"


def test_session_undo_redo_applies_values(tmp_path: Path):
    bridge = FakeBridge()
    path = tmp_path / "session.json"
    session = Session(path=path)
    session.record_set(Mutation(label="Hostname", role="AXTextField", window="Router1", name="Hostname", identifier=None, before="Router", after="Core"))
    undone = session.undo(bridge)
    assert undone["value"] == "Router"
    assert ("set", "Hostname", "Router") in bridge.calls
    redone = session.redo(bridge)
    assert redone["value"] == "Core"
    assert session.undo_stack[0].after == "Core"


def test_session_reset_clears_stacks(tmp_path: Path):
    path = tmp_path / "session.json"
    session = Session(path=path)
    session.record_set(Mutation(label="x", role="AXTextField", window=None, name="x", identifier=None, before="a", after="b"))
    session.reset()
    reloaded = Session(path=path).load()
    assert reloaded.undo_stack == [] and reloaded.redo_stack == []
    assert reloaded.last_window is None


# ---------------------------------------------------------------------------
# core.ax


def test_resolve_helper_env_override(tmp_path: Path):
    helper = tmp_path / "custom-ptax"
    helper.write_text("#!/bin/sh\nexit 0\n")
    helper.chmod(0o755)
    os.environ["PACKET_TRACER_AX_HELPER"] = str(helper)
    try:
        from cli_anything.packet_tracer.core.ax import resolve_helper

        assert resolve_helper() == helper
    finally:
        del os.environ["PACKET_TRACER_AX_HELPER"]


def test_dry_run_click_never_calls_helper_click(fake_helper):
    script, log = fake_helper
    bridge = FakeHelperBridge(script, dry_run=True)
    result = bridge.click("Target")
    assert result["dryRun"] is True
    assert result["wouldClick"] == "Target"
    logged = log.read_text() if log.exists() else ""
    assert "find" in logged
    assert " click " not in logged and not logged.startswith("click")


# ---------------------------------------------------------------------------
# CLI wiring


def test_cli_help_lists_core_commands():
    result = CliRunner().invoke(cli_module.cli, ["--help"])
    assert result.exit_code == 0
    for command in ("doctor", "tree", "click", "config", "inventory", "session", "preview"):
        assert command in result.output


def test_cli_find_json_with_fake_bridge(monkeypatch):
    class Bridge(FakeBridge):
        def find(self, name=None, role=None, contains=False, window=None, limit=20, identifier=None):
            return [Element(role="AXButton", title=name, description="", value="", position=(1.0, 2.0), size=(3.0, 4.0), actions=("AXPress",))]

    monkeypatch.setattr(cli_module, "AXBridge", lambda dry_run=False: Bridge())
    result = CliRunner().invoke(cli_module.cli, ["--json", "find", "Activity Wizard"])
    assert result.exit_code == 0, result.output
    payload = json.loads(result.output)
    assert payload["count"] == 1
    assert payload["matches"][0]["role"] == "AXButton"


def test_cli_set_records_undo(monkeypatch, tmp_path: Path):
    class Bridge(FakeBridge):
        pass

    session_path = tmp_path / "session.json"
    monkeypatch.setattr(cli_module, "AXBridge", lambda dry_run=False: Bridge())
    monkeypatch.setattr(cli_module, "Session", lambda: Session(path=session_path))
    result = CliRunner().invoke(cli_module.cli, ["set", "Hostname", "Core"])
    assert result.exit_code == 0, result.output
    stored = json.loads(session_path.read_text())
    assert stored["undo"][0]["before"] == "old"
    assert stored["undo"][0]["after"] == "Core"
