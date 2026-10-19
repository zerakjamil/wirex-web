# cli-anything-packet-tracer

An agent-facing CLI and REPL that drives the **real** Cisco Packet Tracer desktop
application on macOS through the Accessibility API.

```bash
cd agent-harness
python3 -m venv .venv
.venv/bin/pip install -e .
.venv/bin/cli-anything-packet-tracer doctor   # or: .venv/bin/cli-anything-packet-tracer
```

Running with no subcommand starts the REPL. Every command supports `--json`.

```text
doctor                     bundle, version, process, AX trust, windows
launch                     start or activate the app
bundle / windows           installation facts, open windows
tree / find / get          inspect the Accessibility tree
click / set / key / type   drive the GUI (clicks, values, keyboard)
menu list|click            menu bar inspection and activation
config categories|map      per-device Config tab: category tree, page fields
inventory menus|workspace|palette|config|help|all   feature inventory → JSON
help-page <name>           render a bundled help page as text
preview capture|latest     snapshot the workspace for review
session show|undo|redo|reset   persistent state and undo of value changes
```

## How it works

`utils/ptax.swift` is a small Swift program that walks the process Accessibility
tree (`AXUIElement`), performs presses, synthesizes real mouse clicks where Qt
widgets require them, and sends key events. The Python package wraps it:

- `core/ax.py` — bridge to the helper: resolve/browse elements, click, set,
  keyboard, menus, windows, dry-run mode.
- `core/app.py` — bundle discovery/launch and `doctor`.
- `core/inventory.py` — extract menus, workspace chrome, the device palette,
  the Config tab category tree with every page's fields, and the bundled help
  catalog.
- `core/session.py` — locked JSON session with an undo/redo stack of value
  changes; `session undo` replays them against the live application.
- `packet_tracer_cli.py` — the Click command surface, REPL, and JSON contract.

## Tests

```bash
.venv/bin/pip install pytest
PATH="$PWD/.venv/bin:$PATH" CLI_ANYTHING_FORCE_INSTALLED=1 .venv/bin/python -m pytest cli_anything/packet_tracer/tests -v
```

`tests/test_core.py` runs fully offline against fixtures captured from the app;
`tests/test_full_e2e.py` requires Packet Tracer to be running and fails (never
skips) if it is not. See `cli_anything/packet_tracer/tests/TEST.md` for the plan
and test documentation.

## Notes

- Accessibility permission is required for the terminal that runs the CLI.
- Window references are by title, never index: Packet Tracer reorders window
  indices as device windows open and close.
- `PACKET_TRACER_AX_HELPER` overrides the helper binary path;
  `PACKET_TRACER_STATE_DIR` relocates session state.
- Use this harness on installations you are licensed to operate and within the
  vendor's terms.
