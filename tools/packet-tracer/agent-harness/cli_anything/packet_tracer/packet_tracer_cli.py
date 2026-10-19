"""cli-anything-packet-tracer — drive the real Cisco Packet Tracer from an agent.

The CLI talks to a live Packet Tracer installation through the macOS
Accessibility API.  It never simulates application state: every read comes from
the running app and every mutation is applied to the running app.  JSON output
is available for every command via ``--json``.
"""

from __future__ import annotations

import json
import shlex
import sys
import time
from pathlib import Path
from typing import Any

import click

from .core import AXBridge, AXError, Session
from .core import inventory as inv
from .core.app import bundle_version, doctor as app_doctor, find_bundle, launch as app_launch
from .core.session import Mutation
from .utils.repl_skin import ReplSkin

SOFTWARE = "packet_tracer"
VERSION = "1.0.0"
SKIN = ReplSkin("packet_tracer", VERSION)


class State:
    """Shared per-invocation state."""

    def __init__(self, json_output: bool, dry_run: bool):
        self.json_output = json_output
        self.dry_run = dry_run
        self.bridge = AXBridge(dry_run=dry_run)
        self.session = Session().load()
        self.session_path = self.session.path


def emit(state: State, payload: Any, human: list[str] | None = None) -> None:
    """Emit JSON, or human lines when provided and JSON was not requested."""
    if state.json_output or human is None:
        click.echo(json.dumps(payload, indent=2, ensure_ascii=False, default=str))
    else:
        for line in human:
            click.echo(line)


def require_bridge(state: State) -> None:
    """Fail early with an actionable message when the helper cannot be used."""
    info = state.bridge.doctor()
    if not info.get("running"):
        raise AXError(
            "Cisco Packet Tracer is not running.\n"
            "Start it with:  cli-anything-packet-tracer launch"
        )


def default_window(state: State, window: str | None) -> str | None:
    if window:
        state.session.last_window = window
        state.session.save()
        return window
    return state.session.last_window


def _human_element(element: Any) -> str:
    position = f" at {element.position[0]:.0f},{element.position[1]:.0f}" if element.position else ""
    value = f" = {element.value!r}" if element.value else ""
    return f"{element.role}  {element.label}{value}{position}"


# ---------------------------------------------------------------------------
# Group


@click.group(
    invoke_without_command=True,
    context_settings={"help_option_names": ["-h", "--help"], "max_content_width": 110},
    help=__doc__,
)
@click.option("--json", "json_output", is_flag=True, help="Machine-readable JSON output.")
@click.option("--dry-run", is_flag=True, help="Resolve targets and report intended actions without applying them.")
@click.pass_context
def cli(ctx: click.Context, json_output: bool, dry_run: bool) -> None:
    ctx.obj = State(json_output, dry_run)
    if ctx.invoked_subcommand is None:
        run_repl()


# ---------------------------------------------------------------------------
# Environment


@cli.command()
@click.option("--launch", "do_launch", is_flag=True, help="Launch Packet Tracer when it is not running.")
@click.pass_obj
def doctor(state: State, do_launch: bool) -> None:
    """Verify the app bundle, AX helper and live application state."""
    if do_launch:
        app_launch(state.bridge)
    info = app_doctor(state.bridge)
    human = [
        f"bundle      {info.get('bundle') or '(not installed)'}",
        f"version     {info.get('version') or '?'}",
        f"running     {info.get('running')}",
        f"pid         {info.get('pid', '-')}",
        f"AX trusted  {info.get('accessibilityTrusted')}",
        f"windows     {', '.join(w.get('title', '?') for w in info.get('windows', [])) or '-'}",
    ]
    emit(state, info, human)


@cli.command()
@click.option("--wait", "wait_seconds", type=float, default=90.0, show_default=True, help="Seconds to wait for the first window.")
@click.pass_obj
def launch(state: State, wait_seconds: float) -> None:
    """Launch or activate Packet Tracer and wait until it is usable."""
    result = app_launch(state.bridge, wait=wait_seconds)
    emit(state, result, [f"launched pid={result.get('pid')} windows={result.get('windows')}"])


@cli.command()
@click.pass_obj
def bundle(state: State) -> None:
    """Report the installed application bundle."""
    path = find_bundle()
    payload = {"bundle": str(path) if path else None, "version": bundle_version(path)}
    emit(state, payload, [f"{payload['bundle'] or '(not installed)'}  v{payload['version'] or '?'}"])


@cli.command()
@click.pass_obj
def windows(state: State) -> None:
    """List application windows."""
    require_bridge(state)
    items = state.bridge.windows()
    human = [f"{item.get('title', '?')}  {item.get('size')}" for item in items]
    emit(state, {"windows": items}, human or ["(no windows)"])


# ---------------------------------------------------------------------------
# Inspection


@cli.command()
@click.option("--window", help="Window title (exact or substring). Defaults to the session window.")
@click.option("--depth", type=int, default=6, show_default=True)
@click.option("--out", type=click.Path(dir_okay=False, path_type=Path), help="Write the tree JSON to this file.")
@click.pass_obj
def tree(state: State, window: str | None, depth: int, out: Path | None) -> None:
    """Dump the Accessibility tree of a window."""
    require_bridge(state)
    target = default_window(state, window)
    payload = state.bridge.tree(window=target, depth=depth)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        payload["path"] = str(out)
    emit(state, payload, [f"tree of {payload.get('title')!r} written" + (f" to {out}" if out else "")] if out else None)


@cli.command()
@click.argument("name", required=False)
@click.option("--identifier", help="Match by Accessibility identifier (substring).")
@click.option("--role", help="Restrict to an AX role, e.g. AXButton.")
@click.option("--contains", is_flag=True, help="Substring match instead of exact.")
@click.option("--window", help="Window title (exact or substring).")
@click.option("--limit", type=int, default=20, show_default=True)
@click.pass_obj
def find(state: State, name: str | None, identifier: str | None, role: str | None, contains: bool, window: str | None, limit: int) -> None:
    """Find Accessibility elements by name or identifier."""
    require_bridge(state)
    if not name and not identifier:
        raise click.UsageError("provide NAME or --identifier")
    matches = state.bridge.find(name=name, role=role, contains=contains, window=window, limit=limit, identifier=identifier)
    payload = {
        "count": len(matches),
        "matches": [
            {
                "role": element.role,
                "label": element.label,
                "description": element.description,
                "value": element.value,
                "position": element.position,
                "size": element.size,
                "identifier": element.identifier,
                "actions": list(element.actions),
            }
            for element in matches
        ],
    }
    emit(state, payload, [_human_element(element) for element in matches] or ["(no matches)"])


@cli.command(name="get")
@click.argument("target", required=False)
@click.option("--name", help="Element title/description/value.")
@click.option("--identifier", help="Accessibility identifier (substring).")
@click.option("--role", help="Restrict to an AX role.")
@click.option("--contains", is_flag=True)
@click.pass_obj
def get_element(state: State, target: str | None, name: str | None, identifier: str | None, role: str | None, contains: bool) -> None:
    """Read a single element including its current value."""
    require_bridge(state)
    lookup = name or target
    if not lookup and not identifier:
        raise click.UsageError("provide TARGET or --identifier")
    element = state.bridge.get(name=lookup, role=role, contains=contains, identifier=identifier)
    payload = {
        "role": element.role,
        "label": element.label,
        "description": element.description,
        "value": element.value,
        "identifier": element.identifier,
        "actions": list(element.actions),
    }
    emit(state, payload, [_human_element(element)])


# ---------------------------------------------------------------------------
# Interaction


@cli.command(name="click")
@click.argument("target", required=False)
@click.option("--role", help="Restrict to an AX role.")
@click.option("--identifier", help="Treat TARGET as an identifier substring.")
@click.option("--contains", is_flag=True)
@click.option("--index", type=int, default=0, show_default=True)
@click.option("--window", help="Window title (exact or substring).")
@click.option("--mode", type=click.Choice(["press", "mouse"]), default="press", show_default=True,
              help="AXPress, or a real mouse click (required by some Qt tree rows).")
@click.pass_obj
def click_element(state: State, target: str | None, role: str | None, identifier: str | None, contains: bool, index: int, window: str | None, mode: str) -> None:
    """Click an element by name or identifier."""
    require_bridge(state)
    if not target and not identifier:
        raise click.UsageError("provide TARGET or --identifier")
    name = None if identifier else target
    result = state.bridge.click(name=name, identifier=identifier or (target if not name else None), role=role,
                                index=index, window=window, mode=mode, contains=contains)
    emit(state, result, [f"clicked {result.get('clicked')!r} via {result.get('method')}"])


@cli.command(name="click-at")
@click.argument("x", type=int)
@click.argument("y", type=int)
@click.option("--count", type=int, default=1, show_default=True, help="Click count (2 = double click).")
@click.pass_obj
def click_at(state: State, x: int, y: int, count: int) -> None:
    """Click absolute screen coordinates (workspace canvas interactions)."""
    require_bridge(state)
    result = state.bridge.click_at(x, y, count)
    emit(state, result, [f"clicked at {x},{y} x{count}"])


@cli.command(name="set")
@click.argument("target")
@click.argument("value")
@click.option("--role", help="Restrict to an AX role.")
@click.option("--identifier", help="Treat TARGET as an identifier substring.")
@click.option("--window", help="Window title (exact or substring).")
@click.option("--no-undo", is_flag=True, help="Do not record this change for undo.")
@click.pass_obj
def set_value(state: State, target: str, value: str, role: str | None, identifier: str | None, window: str | None, no_undo: bool) -> None:
    """Set the value of a text field."""
    require_bridge(state)
    name = None if identifier else target
    element = state.bridge.get(name=name, role=role, identifier=identifier or (target if not name else None))
    result = state.bridge.set_value(name=name, value=value, role=role,
                                    identifier=identifier or (target if not name else None), window=window)
    if not no_undo and not state.dry_run:
        state.session.record_set(
            Mutation(
                label=element.label,
                role=element.role,
                window=window,
                name=name,
                identifier=identifier,
                before=element.value,
                after=value,
            )
        )
    emit(state, result, [f"{element.label or target}: {element.value!r} -> {value!r}"])


@cli.command()
@click.argument("combo")
@click.pass_obj
def key(state: State, combo: str) -> None:
    """Send a key combination, e.g. ``cmd+s`` or ``shift+return``."""
    require_bridge(state)
    result = state.bridge.key(combo)
    emit(state, result, [f"pressed {combo}"])


@cli.command(name="type")
@click.argument("text")
@click.pass_obj
def type_text(state: State, text: str) -> None:
    """Type text into the focused field."""
    require_bridge(state)
    result = state.bridge.type_text(text)
    emit(state, result, [f"typed {len(text)} characters"])


@cli.group()
def menu() -> None:
    """Inspect and click menu bar items."""


@menu.command(name="list")
@click.pass_obj
def menu_list(state: State) -> None:
    """Show the full menu bar."""
    require_bridge(state)
    menus = inv.extract_menus(state.bridge.menubar())
    human: list[str] = []
    for entry in menus:
        human.append(entry["title"])
        for item in entry["items"]:
            human.append(f"  {item['title']}")
            for sub in item.get("items", []):
                human.append(f"    {sub}")
    emit(state, {"menus": menus}, human or ["(no menus)"])


@menu.command(name="click")
@click.argument("path")
@click.pass_obj
def menu_click(state: State, path: str) -> None:
    """Click a menu item, e.g. ``"File>Open ..."``."""
    require_bridge(state)
    result = state.bridge.menu_click(path)
    emit(state, result, [f"clicked menu {path}"])


# ---------------------------------------------------------------------------
# Config tab


@cli.group()
def config() -> None:
    """Inspect the per-device Config tab."""


@config.command(name="categories")
@click.option("--window", help="Device window title (defaults to the first open device window).")
@click.option("--out", type=click.Path(dir_okay=False, path_type=Path))
@click.pass_obj
def config_categories(state: State, window: str | None, out: Path | None) -> None:
    """Show the GLOBAL/ROUTING/.../INTERFACE category tree of a device."""
    require_bridge(state)
    target = window or _first_device_window(state)
    if not target:
        raise AXError("no device window is open; open a device's Config tab first")
    payload = inv.extract_config(state.bridge, target, select_pages=False)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        payload["path"] = str(out)
    human: list[str] = []
    for group in payload["groups"]:
        human.append(group["name"])
        for page in group["pages"]:
            marker = "*" if page.get("selected") else " "
            human.append(f"  [{marker}] {page['name']}")
    emit(state, payload, human or ["(empty category tree)"])


@config.command(name="map")
@click.option("--window", help="Device window title.")
@click.option("--out", type=click.Path(dir_okay=False, path_type=Path), required=True)
@click.pass_obj
def config_map(state: State, window: str | None, out: Path) -> None:
    """Visit every Config page and record its fields and buttons."""
    require_bridge(state)
    target = window or _first_device_window(state)
    if not target:
        raise AXError("no device window is open; open a device's Config tab first")
    payload = inv.extract_config(state.bridge, target, select_pages=True)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    state.session.last_config_window = target
    state.session.save()
    pages = sum(len(group["pages"]) for group in payload["groups"])
    emit(state, {"window": target, "pages": pages, "path": str(out)},
         [f"mapped {pages} config pages from {target!r} -> {out}"])


def _first_device_window(state: State) -> str | None:
    for window in state.bridge.windows():
        title = window.get("title", "")
        if title and "Packet Tracer" not in title:
            return title
    return None


# ---------------------------------------------------------------------------
# Inventory


@cli.command()
@click.argument("section", required=False, default="all",
                type=click.Choice(["menus", "workspace", "palette", "config", "help", "all"], case_sensitive=False))
@click.option("--out", type=click.Path(dir_okay=False, path_type=Path), help="Write the inventory JSON here.")
@click.option("--config-window", help="Device window used for the config section.")
@click.option("--select-pages", is_flag=True, help="Also visit every Config page (slow, thorough).")
@click.pass_obj
def inventory(state: State, section: str, out: Path | None, config_window: str | None, select_pages: bool) -> None:
    """Extract a feature inventory from the live application and bundled help."""
    require_bridge(state)
    bundle_path = find_bundle()
    sections = ["menus", "workspace", "palette", "config", "help"] if section == "all" else [section]
    payload = inv.build_inventory(
        state.bridge,
        bundle_path,
        sections,
        config_window=config_window,
        select_pages=select_pages,
    )
    payload["bundle"] = str(bundle_path) if bundle_path else None
    payload["version"] = bundle_version(bundle_path)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        state.session.last_inventory = str(out)
        state.session.save()
        payload["path"] = str(out)
    summary = {
        "sections": payload.get("sections"),
        "windows": [w.get("title") for w in payload.get("windows", [])],
        "menus": len(payload.get("menus", [])),
        "paletteCategories": len(payload.get("palette", {}).get("categories", [])),
        "configGroups": len(payload.get("config", {}).get("groups", [])),
        "helpPages": len(payload.get("help", [])),
        "path": str(out) if out else None,
    }
    emit(state, summary,
         [f"{key}: {value}" for key, value in summary.items() if value is not None])


@cli.command()
@click.argument("name")
@click.pass_obj
def help_page(state: State, name: str) -> None:
    """Print a bundled Packet Tracer help page as text."""
    text = inv.read_help(find_bundle(), name)
    emit(state, {"page": name, "text": text}, [text])


# ---------------------------------------------------------------------------
# Preview


@cli.group()
def preview() -> None:
    """Capture lightweight workspace previews for review."""


def _preview_dir() -> Path:
    return Path.home() / ".local" / "share" / "cli-anything" / "packet-tracer" / "previews"


@preview.command(name="capture")
@click.option("--out-dir", type=click.Path(file_okay=False, path_type=Path))
@click.pass_obj
def preview_capture(state: State, out_dir: Path | None) -> None:
    """Capture the current windows, tree and workspace state as a preview bundle."""
    require_bridge(state)
    directory = out_dir or _preview_dir()
    directory.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    target = directory / f"preview-{stamp}.json"
    windows = state.bridge.windows()
    main = next((w["title"] for w in windows if "Packet Tracer" in w.get("title", "")), None)
    bundle_payload: dict[str, Any] = {"capturedAt": time.time(), "windows": windows}
    if main:
        bundle_payload["workspace"] = inv.extract_workspace(state.bridge.tree(window=main, depth=8))
    target.write_text(json.dumps(bundle_payload, indent=2), encoding="utf-8")
    emit(state, {"path": str(target), "windows": [w.get("title") for w in windows]},
         [f"preview written to {target}"])


@preview.command(name="latest")
@click.pass_obj
def preview_latest(state: State) -> None:
    """Show the newest preview bundle."""
    directory = _preview_dir()
    bundles = sorted(directory.glob("preview-*.json")) if directory.exists() else []
    if not bundles:
        raise AXError("no preview bundles captured yet; run: preview capture")
    payload = json.loads(bundles[-1].read_text(encoding="utf-8"))
    payload["path"] = str(bundles[-1])
    emit(state, payload, [str(bundles[-1])])


# ---------------------------------------------------------------------------
# Session


@cli.group()
def session() -> None:
    """Inspect or reset the persistent harness session."""


@session.command(name="show")
@click.pass_obj
def session_show(state: State) -> None:
    payload = state.session.to_json()
    emit(state, payload, [f"{key}: {value}" for key, value in payload.items()])


@session.command(name="undo")
@click.pass_obj
def session_undo(state: State) -> None:
    require_bridge(state)
    result = state.session.undo(state.bridge)
    emit(state, result, [f"undo {result.get('label')} -> {result.get('value')!r}"])


@session.command(name="redo")
@click.pass_obj
def session_redo(state: State) -> None:
    require_bridge(state)
    result = state.session.redo(state.bridge)
    emit(state, result, [f"redo {result.get('label')} -> {result.get('value')!r}"])


@session.command(name="reset")
@click.pass_obj
def session_reset(state: State) -> None:
    state.session.reset()
    emit(state, {"reset": True, "path": str(state.session_path)}, ["session state cleared"])


# ---------------------------------------------------------------------------
# REPL


def run_repl() -> None:
    SKIN.print_banner()
    SKIN.hint("Commands: doctor, windows, tree, find, click, set, config categories, inventory, preview capture")
    SKIN.hint("Type 'quit' to exit. Global flags --json/--dry-run are honored per command.")
    while True:
        try:
            raw = input(SKIN.prompt()).strip()
        except (EOFError, KeyboardInterrupt):
            click.echo()
            break
        if not raw:
            continue
        if raw.split()[0] in ("quit", "exit", "q"):
            break
        if raw.split()[0] == "help":
            cli.main(args=["--help"], standalone_mode=False)
            continue
        try:
            args = shlex.split(raw)
        except ValueError as exc:
            SKIN.error(f"cannot parse command: {exc}")
            continue
        if "--json" in args:
            args.remove("--json")
            args.insert(0, "--json")
        try:
            cli.main(args=args, standalone_mode=False, prog_name="cli-anything-packet-tracer")
        except click.ClickException as exc:
            exc.show()
        except AXError as exc:
            SKIN.error(str(exc))
        except SystemExit:
            break
        except Exception as exc:  # noqa: BLE001 - REPL must survive any command failure
            SKIN.error(f"{type(exc).__name__}: {exc}")


# ---------------------------------------------------------------------------
# Error handling


def main(argv: list[str] | None = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    json_mode = "--json" in argv
    try:
        cli.main(args=argv, standalone_mode=True, prog_name="cli-anything-packet-tracer")
    except AXError as exc:
        if json_mode:
            click.echo(json.dumps({"ok": False, "error": str(exc)}))
        else:
            click.echo(f"Error: {exc}", err=True)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
