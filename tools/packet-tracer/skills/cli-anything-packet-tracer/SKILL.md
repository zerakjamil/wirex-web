---
name: "cli-anything-packet-tracer"
description: "Drive the real Cisco Packet Tracer desktop application on macOS from an agent: inspect windows and the AX tree, click and set controls, navigate the device Config tab, read bundled help, and extract a full feature inventory (menus, palette, config pages, help) as JSON."
---

# cli-anything-packet-tracer

Operate the installed **Cisco Packet Tracer** application through the macOS
Accessibility API. Every read and write hits the live GUI; the harness never
simulates application state.

## Requirements

- macOS with Accessibility permission granted to the terminal / agent
  (System Settings → Privacy & Security → Accessibility).
- Cisco Packet Tracer installed (discovered automatically under `/Applications`).
- Xcode command line tools (`swiftc`) available the first time the helper is
  compiled; afterwards the prebuilt helper is reused.

## Install

```bash
cd tools/packet-tracer/agent-harness
python3 -m venv .venv
.venv/bin/pip install -e .
```

## Quick start

```bash
cli-anything-packet-tracer doctor                 # bundle, version, pid, AX trust
cli-anything-packet-tracer launch                 # start or activate the app
cli-anything-packet-tracer windows                # open windows
cli-anything-packet-tracer --json tree --window "Router1" --out /tmp/router1.json
```

Running with no subcommand opens an interactive REPL.

## Command surface

| Group | Commands |
| --- | --- |
| Environment | `doctor`, `launch`, `bundle`, `windows` |
| Inspection | `tree`, `find`, `get` |
| Interaction | `click`, `set`, `key`, `type` |
| Menus | `menu list`, `menu click "File>Open ..."` |
| Config tab | `config categories`, `config map --out FILE` |
| Inventory | `inventory menus\|workspace\|palette\|config\|help\|all --out FILE` |
| Help | `help-page config_routers` |
| Preview | `preview capture`, `preview latest` |
| Session | `session show\|undo\|redo\|reset` |

## Agent guidance

- Pass `--json` for machine-readable output; every command honors it.
- Use `--dry-run` to resolve a target and confirm the planned action without
  applying it.
- `click` supports `--mode mouse` for Qt tree rows that only switch pages on a
  real mouse event.
- Mutations through `set` are recorded; `session undo` / `session redo` replay
  them against the live app.
- An unclear target fails loudly: exit code 1 with `{"ok": false, "error": ...}`
  in JSON mode.
- Windows are matched by title (exact or substring), never by index — Packet
  Tracer reorders window indices as device windows open and close.

## Common workflows

**Feature inventory for parity planning**

```bash
cli-anything-packet-tracer --json inventory all --out /tmp/pt-inventory.json
```

Writes menus, workspace chrome, palette categories/models, config tree and the
bundled help catalog into one JSON artifact.

**Drive a device's Config tab**

```bash
cli-anything-packet-tracer config categories --window "Router1"
cli-anything-packet-tracer click --identifier "scrollAreaWidget.Static" --mode mouse
cli-anything-packet-tracer --json tree --window "Router1"
cli-anything-packet-tracer set "Hostname" Core-Router
cli-anything-packet-tracer session undo
```

**Read product documentation that ships with the app**

```bash
cli-anything-packet-tracer help-page config_routers
```

## Output contract

- JSON on stdout for `--json`; human tables otherwise.
- Failures exit non-zero; in JSON mode the error object is printed to stdout
  with `ok: false`.
- Artifacts written with `--out` are plain JSON and safe to diff between runs.

## Notes

- The Accessibility helper (`utils/ptax.swift`) is compiled on first use into the
  package directory; set `PACKET_TRACER_AX_HELPER` to reuse an existing binary.
- Session state lives in `~/.local/share/cli-anything/packet-tracer/session.json`
  (override the directory with `PACKET_TRACER_STATE_DIR`).
- This harness is intended for interoperability, accessibility, documentation
  and parity work on installations you are licensed to use.
