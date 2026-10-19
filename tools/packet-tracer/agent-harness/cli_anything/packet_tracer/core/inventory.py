"""Feature inventory extraction from the real Packet Tracer application.

Three sources are combined so the harness never invents capabilities:

* live AX menus and toolbars (`menus`, `workspace`),
* the device palette accordion (`palette`),
* the per-device Config tab category tree and page contents (`config`),
* the help pages shipped inside the application bundle (`help`).

All output is plain JSON so downstream parity tooling can diff it against the
wireX catalog.
"""

from __future__ import annotations

import html.parser
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .ax import AXBridge, AXError

CONFIG_GROUPS = ("GLOBAL", "ROUTING", "SWITCHING", "INTERFACE", "WIRELESS", "SECURITY", "WAN", "VOICE")
PALETTE_TOP_LEVEL = (
    "Network Devices",
    "End Devices",
    "Components",
    "Connections",
    "Miscellaneous",
    "Multiuser Connection",
    "Legacy",
)
FORM_ROLES = ("AXStaticText", "AXTextField", "AXButton", "AXTable", "AXTextArea", "AXRadioButton", "AXCheckBox", "AXComboBox")


def walk(node: dict[str, Any]) -> Iterable[dict[str, Any]]:
    stack = [node]
    while stack:
        current = stack.pop()
        yield current
        stack.extend(reversed(current.get("children", [])))


def flatten(node: dict[str, Any]) -> list[dict[str, Any]]:
    """Depth-first list of nodes in document order."""
    result: list[dict[str, Any]] = []
    stack: list[tuple[dict[str, Any], int]] = [(node, 0)]
    while stack:
        current, depth = stack.pop()
        current["depth"] = depth
        result.append(current)
        for child in reversed(current.get("children", [])):
            stack.append((child, depth + 1))
    return result


def _identifier(node: dict[str, Any]) -> str:
    return node.get("identifier", "")


def _root(payload: dict[str, Any]) -> dict[str, Any]:
    """Return the tree root of a bridge payload, or the node itself."""
    tree = payload.get("tree")
    return tree if isinstance(tree, dict) else payload


def _label(node: dict[str, Any]) -> str:
    return node.get("title") or node.get("description") or _identifier(node)


def _frame(node: dict[str, Any]) -> tuple[float, float, float, float] | None:
    position = node.get("position")
    size = node.get("size")
    if not position or not size:
        return None
    return position[0], position[1], size[0], size[1]


# ---------------------------------------------------------------------------
# Menus and workspace chrome


def extract_menus(menus: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned = []
    for menu in menus:
        if menu.get("title") in ("Apple", ""):
            continue
        items = []
        for item in menu.get("items", []):
            entry: dict[str, Any] = {"title": item.get("title", "")}
            if item.get("items"):
                entry["items"] = [sub.get("title", "") for sub in item["items"]]
            if item.get("enabled") is False:
                entry["disabled"] = True
            items.append(entry)
        cleaned.append({"title": menu.get("title", ""), "items": items})
    return cleaned


MODE_IDENTIFIERS = (
    "m_realtimeSwitch",
    "m_simulationSwitch",
    "m_logicalSwitch",
    "m_physicalSwitch",
)


def extract_workspace(main_tree: dict[str, Any]) -> dict[str, Any]:
    """Record the workspace chrome: mode switches, toolbars, tools, scenarios."""
    nodes = flatten(_root(main_tree))
    toolbar = []
    modes = []
    tools = []
    scenarios = []
    for node in nodes:
        role = node.get("role", "")
        label = _label(node)
        description = node.get("description", "")
        identifier = _identifier(node)
        if role == "AXCheckBox" and any(key in identifier for key in MODE_IDENTIFIERS):
            modes.append({"name": label, "value": node.get("value", "")})
        elif role == "AXButton" and "m_logicalToolbar" in identifier:
            toolbar.append({"name": label, "description": description})
        elif role == "AXCheckBox" and "m_pPlToolBar" in identifier:
            hotkey = re.search(r"\(([^)]+)\)\s*$", label)
            tools.append(
                {
                    "name": re.sub(r"\s*\([^)]+\)\s*$", "", label),
                    "hotkey": hotkey.group(1) if hotkey else "",
                }
            )
        elif "UserCreatedPDU" in identifier and role in ("AXButton", "AXComboBox"):
            scenarios.append({"name": label, "description": description, "value": node.get("value", "")})
    return {"toolbar": toolbar, "modes": modes, "tools": tools, "scenarios": scenarios}


# ---------------------------------------------------------------------------
# Device palette


@dataclass
class PaletteModel:
    name: str
    source: str  # stock | custom
    identifier: str


@dataclass
class PaletteCategory:
    name: str
    identifier: str
    subcategories: list[dict[str, Any]] = field(default_factory=list)


def _palette_groups(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [n for n in nodes if "CDeviceTypesBox.group_" in _identifier(n)]


def _palette_types(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Subcategory rows of the currently expanded palette group, in visual order.

    Packet Tracer shows exactly one top-level group expanded at a time, so every
    ``type_`` row present in a snapshot belongs to that group.
    """
    return [
        node
        for node in nodes
        if "CDeviceTypesBox.type_" in _identifier(node) and node.get("role") == "AXCheckBox"
    ]


def _palette_models(nodes: list[dict[str, Any]]) -> list[PaletteModel]:
    models: list[PaletteModel] = []
    for node in nodes:
        identifier = _identifier(node)
        if "CDeviceSpecificBox" not in identifier or ".device_" not in identifier:
            continue
        tail = identifier.split(".device_")[-1]
        parts = tail.split("_", 1)
        name = parts[1].replace("_", "-") if len(parts) > 1 else tail
        models.append(
            PaletteModel(
                name=node.get("title") or name,
                source=node.get("description") or "stock",
                identifier=identifier,
            )
        )
    return models


def extract_palette(bridge: AXBridge, window: str | None = None, pause: float = 0.6) -> dict[str, Any]:
    """Expand every palette group and record its device models."""
    tree = bridge.tree(window=window, depth=18)
    nodes = flatten(_root(tree))
    groups = _palette_groups(nodes)
    if not groups:
        # Palette is collapsed; open the first top-level group and retry.
        bridge.click(name=PALETTE_TOP_LEVEL[0], window=window)
        time.sleep(pause)
        nodes = flatten(_root(bridge.tree(window=window, depth=18)))
        groups = _palette_groups(nodes)

    collected: list[PaletteCategory] = []
    for group in groups:
        identifier = _identifier(group)
        name = group.get("title") or identifier.split("group_")[-1].replace("_", " ")
        bridge.click(identifier=identifier, window=window)
        time.sleep(pause)
        nodes = flatten(_root(bridge.tree(window=window, depth=18)))
        category = PaletteCategory(name=name, identifier=identifier)
        for type_row in _palette_types(nodes):
            type_identifier = _identifier(type_row)
            type_name = type_row.get("title") or type_identifier.split("type_")[-1].replace("_", " ")
            bridge.click(identifier=type_identifier, window=window)
            time.sleep(pause)
            typed_nodes = flatten(_root(bridge.tree(window=window, depth=18)))
            category.subcategories.append(
                {
                    "name": type_name,
                    "identifier": type_identifier,
                    "models": [
                        {"name": model.name, "source": model.source}
                        for model in _palette_models(typed_nodes)
                    ],
                }
            )
        collected.append(category)

    return {
        "categories": [
            {
                "name": category.name,
                "identifier": category.identifier,
                "subcategories": category.subcategories,
            }
            for category in collected
        ]
    }


# ---------------------------------------------------------------------------
# Config tab


def _config_rows(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        n
        for n in nodes
        if "m_menuCfgScrollView" in _identifier(n) and n.get("role") in ("AXButton", "AXCheckBox")
    ]


def _sidebar_right_edge(nodes: list[dict[str, Any]]) -> float:
    edges = []
    for node in nodes:
        frame = _frame(node)
        if frame and "m_menuCfgScrollView" in _identifier(node):
            edges.append(frame[0] + frame[2])
    return (max(edges) if edges else 0.0) + 8.0


def _page_content(nodes: list[dict[str, Any]], sidebar_edge: float) -> dict[str, Any]:
    labels: list[str] = []
    fields: list[dict[str, Any]] = []
    buttons: list[str] = []
    tables: list[dict[str, Any]] = []
    row_labels: list[dict[str, Any]] = []
    for node in nodes:
        identifier = _identifier(node)
        if "m_menuCfgScrollView" in identifier or "CCommandLine" in identifier:
            continue
        if node.get("role") == "AXRadioButton":
            continue
        frame = _frame(node)
        in_config_tab = "m_menuCfgTab" in identifier
        if not in_config_tab and (not frame or frame[0] < sidebar_edge):
            continue
        role = node.get("role", "")
        if role == "AXStaticText":
            value = node.get("description") or node.get("title") or ""
            if value:
                if value not in labels:
                    labels.append(value)
                if frame:
                    row_labels.append({"text": value, "frame": frame})
        elif role in ("AXTextField", "AXTextArea"):
            fields.append(
                {
                    "label": node.get("description") or node.get("title") or "",
                    "value": node.get("value", ""),
                    "frame": frame,
                }
            )
        elif role == "AXButton":
            label = node.get("title") or node.get("description") or ""
            if label and label not in buttons:
                buttons.append(label)
        elif role == "AXTable":
            columns = [child.get("title") for child in node.get("children", []) if child.get("role") == "AXColumn"]
            tables.append({"columns": columns})

    for field in fields:
        if field["label"] or not field["frame"]:
            field.pop("frame", None)
            continue
        field_x, field_y, _, field_height = field["frame"]
        best: tuple[float, str] | None = None
        for candidate in row_labels:
            label_x, label_y, label_width, _ = candidate["frame"]
            if abs(label_y - field_y) > max(14.0, field_height):
                continue
            left_edge = label_x + label_width
            if left_edge > field_x + 4:
                continue
            distance = field_x - left_edge
            if best is None or distance < best[0]:
                best = (distance, candidate["text"])
        if best:
            field["label"] = best[1]
        field.pop("frame", None)
    return {"labels": labels, "fields": fields, "buttons": buttons, "tables": tables}


def extract_config(bridge: AXBridge, window: str, select_pages: bool = False, pause: float = 0.7) -> dict[str, Any]:
    """Record the config category tree, optionally visiting every page."""
    tree = bridge.tree(window=window, depth=14)
    nodes = flatten(_root(tree))
    rows = _config_rows(nodes)
    if not rows:
        raise AXError(f"no Config category tree in window {window!r}")

    groups: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for row in rows:
        role = row.get("role")
        title = row.get("title") or ""
        identifier = _identifier(row).split("scrollAreaWidget.")[-1]
        if role == "AXButton":
            current = {"name": title, "pages": []}
            groups.append(current)
        elif role == "AXCheckBox" and current is not None:
            current["pages"].append(
                {
                    "name": title,
                    "identifier": identifier,
                    "selected": row.get("value") == "1",
                }
            )

    if select_pages:
        sidebar_edge = _sidebar_right_edge(nodes)
        for group in groups:
            for page in group["pages"]:
                full_identifier = f"scrollAreaWidget.{page['identifier']}"
                try:
                    bridge.click(identifier=full_identifier, window=window, mode="mouse")
                except AXError:
                    continue
                time.sleep(pause)
                page_nodes = flatten(_root(bridge.tree(window=window, depth=14)))
                page["content"] = _page_content(page_nodes, sidebar_edge)

    return {"window": window, "groups": groups}


# ---------------------------------------------------------------------------
# Help pages


class _HtmlText(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip = 0
        self.title = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self.skip += 1
        if tag == "title":
            self.parts.append("\nTITLE:")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)

    def text(self) -> str:
        raw = " ".join(self.parts)
        raw = re.sub(r"\s+", " ", raw)
        return raw.strip()


def html_to_text(path: Path) -> str:
    parser = _HtmlText()
    parser.feed(path.read_text(encoding="utf-8", errors="replace"))
    return parser.text()


def help_directory(bundle: Path | None) -> Path | None:
    if not bundle:
        return None
    directory = bundle / "Contents" / "help" / "default"
    return directory if directory.exists() else None


def list_help(bundle: Path | None) -> list[dict[str, Any]]:
    directory = help_directory(bundle)
    if not directory:
        return []
    entries = []
    for path in sorted(directory.glob("*.htm")):
        text = html_to_text(path)
        title = ""
        match = re.match(r"TITLE:\s*(.*?)\s*(?:[A-Z].*?)(?:\s{2,}|$)", text)
        if match:
            title = match.group(1)
        entries.append(
            {
                "file": path.name,
                "title": title or path.stem,
                "category": path.stem.split("_")[0],
                "characters": len(text),
            }
        )
    return entries


def read_help(bundle: Path | None, name: str) -> str:
    directory = help_directory(bundle)
    if not directory:
        raise AXError("Packet Tracer help directory was not found in the application bundle")
    candidate = directory / name
    if not candidate.exists():
        matches = list(directory.glob(f"*{name}*.htm"))
        if not matches:
            raise AXError(f"no help page matched {name!r}")
        candidate = matches[0]
    return html_to_text(candidate)


# ---------------------------------------------------------------------------
# Top level


def build_inventory(
    bridge: AXBridge,
    bundle: Path | None,
    sections: Iterable[str],
    config_window: str | None = None,
    select_pages: bool = False,
) -> dict[str, Any]:
    wanted = set(sections)
    report: dict[str, Any] = {
        "source": "Cisco Packet Tracer (live AX + bundled help)",
        "sections": sorted(wanted),
    }

    windows: list[dict[str, Any]] = []
    if {"menus", "workspace", "palette", "config", "all"} & wanted:
        windows = bridge.windows()
        report["windows"] = windows

    main_window = next(
        (window["title"] for window in windows if "Packet Tracer" in window.get("title", "")),
        "Cisco Packet Tracer",
    )

    if {"menus", "all"} & wanted:
        report["menus"] = extract_menus(bridge.menubar())
    if {"workspace", "all"} & wanted:
        report["workspace"] = extract_workspace(bridge.tree(window=main_window, depth=8))
    if {"palette", "all"} & wanted:
        report["palette"] = extract_palette(bridge, window=main_window)
    if {"config", "all"} & wanted:
        device_windows = [w["title"] for w in windows if "Packet Tracer" not in w.get("title", "")]
        target = config_window or (device_windows[0] if device_windows else None)
        report["config"] = (
            extract_config(bridge, target, select_pages=select_pages) if target else {"window": None, "groups": []}
        )
    if {"help", "all"} & wanted:
        report["help"] = list_help(bundle)

    return report
