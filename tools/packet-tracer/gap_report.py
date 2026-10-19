#!/usr/bin/env python3
"""Diff the live Packet Tracer inventory against wireX's device catalog.

Reads   replica/pt-9.0.1/inventory.json   (captured by cli-anything-packet-tracer)
        src/simulator/deviceCatalog.ts   (wireX catalog)
        src/simulator/iot.ts             (wireX IoT things)
Writes  replica/pt-9.0.1/GAP_REPORT.md

Run from the repo root:

    python3 tools/packet-tracer/gap_report.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INVENTORY = ROOT / "replica" / "pt-9.0.1" / "inventory.json"
CATALOG = ROOT / "src" / "simulator" / "deviceCatalog.ts"
IOT = ROOT / "src" / "simulator" / "iot.ts"
OUTPUT = ROOT / "replica" / "pt-9.0.1" / "GAP_REPORT.md"


def keys_for(name: str) -> set[str]:
    """Normalized lookup keys so PT and wireX spellings of a model can meet."""
    compact = re.sub(r"[^A-Z0-9]", "", name.upper())
    if not compact:
        return set()
    keys = {compact}
    for prefix in ("ISR", "PT", "SRV"):
        if compact.startswith(prefix) and len(compact) > len(prefix):
            keys.add(compact[len(prefix):])
    for suffix in ("PT", "PTEMPTY"):
        if compact.endswith(suffix) and len(compact) > len(suffix):
            keys.add(compact[: -len(suffix)])
    if compact.endswith("EMPTY") and compact != "EMPTY":
        keys.add("EMPTY")
    return keys


def wirex_model_keys() -> dict[str, str]:
    """Map every normalized wireX model key to its original spelling."""
    keys: dict[str, str] = {}
    text = CATALOG.read_text(encoding="utf-8")
    for match in re.finditer(r"models:\[([^\]]*)\]", text):
        for model in re.findall(r"'([^']+)'", match.group(1)):
            for key in keys_for(model):
                keys.setdefault(key, model)
    if IOT.exists():
        for model in re.findall(r"model:\s*'([^']+)'", IOT.read_text(encoding="utf-8")):
            for key in keys_for(model):
                keys.setdefault(key, model)
    return keys


def main() -> int:
    if not INVENTORY.exists():
        print(f"missing inventory: {INVENTORY}", file=sys.stderr)
        return 1
    inventory = json.loads(INVENTORY.read_text(encoding="utf-8"))
    wirex = wirex_model_keys()

    lines: list[str] = []
    lines.append("# Packet Tracer 9.0.1 → wireX gap report")
    lines.append("")
    lines.append(f"Source inventory: `{INVENTORY.relative_to(ROOT)}`")
    lines.append(f"Captured from: {inventory.get('bundle')} (version {inventory.get('version')})")
    lines.append("")

    menus = inventory.get("menus", [])
    lines.append("## Menu bar (live capture)")
    lines.append("")
    for menu in menus:
        items = ", ".join(item["title"] for item in menu["items"] if item["title"])
        lines.append(f"- **{menu['title']}**: {items}")
    lines.append("")

    workspace = inventory.get("workspace", {})
    lines.append("## Workspace chrome")
    lines.append("")
    lines.append(f"- Modes: {', '.join(mode['name'] for mode in workspace.get('modes', []))}")
    lines.append(f"- Tools: {', '.join(tool['name'] for tool in workspace.get('tools', []))}")
    lines.append(f"- Toolbar: {', '.join(button['name'] for button in workspace.get('toolbar', []))}")
    lines.append("")

    categories = inventory.get("palette", {}).get("categories", [])
    total = sum(len(sub["models"]) for category in categories for sub in category["subcategories"])
    present = 0
    missing: list[tuple[str, str, str]] = []
    lines.append("## Device palette")
    lines.append("")
    lines.append(f"Live capture lists **{total}** stock/custom models across {len(categories)} categories.")
    lines.append("")
    lines.append("| Category | Subcategory | PT models | in wireX | missing |")
    lines.append("| --- | --- | --- | --- | --- |")
    for category in categories:
        for sub in category["subcategories"]:
            names = [model["name"] for model in sub["models"]]
            found = []
            gone = []
            for name in names:
                keys = keys_for(name)
                hit = next((wirex[key] for key in keys if key in wirex), None)
                if hit is not None:
                    found.append(name)
                else:
                    gone.append(name)
                    missing.append((category["name"], sub["name"], name))
            present += len(found)
            if names:
                lines.append(
                    f"| {category['name']} | {sub['name']} | {len(names)} | {len(found)} | "
                    f"{', '.join(gone) if gone else '—'} |"
                )
    lines.append("")
    coverage = (present / total * 100) if total else 0.0
    lines.append(f"**Catalog coverage: {present}/{total} models recognized ({coverage:.1f}%).**")
    lines.append("")
    if missing:
        lines.append("### Missing models, grouped by category")
        lines.append("")
        by_category: dict[str, list[str]] = {}
        for category, sub, name in missing:
            by_category.setdefault(f"{category} / {sub}", []).append(name)
        for key, names in by_category.items():
            lines.append(f"- **{key}**: {', '.join(names)}")
        lines.append("")

    config = inventory.get("config", {})
    if config.get("groups"):
        lines.append("## Device Config tab (captured from a live 1841)")
        lines.append("")
        for group in config["groups"]:
            page_names = ", ".join(page["name"] for page in group["pages"])
            lines.append(f"- **{group['name']}**: {page_names}")
        lines.append("")
    map_file = ROOT / "replica" / "pt-9.0.1" / "config-Router1.json"
    if map_file.exists():
        mapped = json.loads(map_file.read_text(encoding="utf-8"))
        lines.append("### Config pages with fields (live values)")
        lines.append("")
        for group in mapped.get("groups", []):
            for page in group["pages"]:
                content = page.get("content") or {}
                fields = ", ".join(
                    f"`{field.get('label') or '?'}`" for field in content.get("fields", [])
                )
                buttons = ", ".join(content.get("buttons", []))
                lines.append(f"- **{group['name']} / {page['name']}**")
                if fields:
                    lines.append(f"  - fields: {fields}")
                if content.get("labels"):
                    lines.append(f"  - labels: {', '.join(content['labels'])}")
                if buttons:
                    lines.append(f"  - buttons: {buttons}")
        lines.append("")

    help_entries = inventory.get("help", [])
    if help_entries:
        lines.append("## Bundled help catalog")
        lines.append("")
        lines.append(f"{len(help_entries)} help pages ship inside the application.")
        by_kind: dict[str, int] = {}
        for entry in help_entries:
            by_kind[entry["category"]] = by_kind.get(entry["category"], 0) + 1
        top = ", ".join(f"{kind} ({count})" for kind, count in sorted(by_kind.items(), key=lambda kv: -kv[1])[:12])
        lines.append(f"Largest groups: {top}.")
        lines.append("")

    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    print(f"coverage: {present}/{total} models ({coverage:.1f}%)")
    print(f"missing: {len(missing)} models")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
