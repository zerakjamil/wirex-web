# cli-anything-packet-tracer — Test Plan

All tests run against the **real** Cisco Packet Tracer 9.0.1 application on this
machine through the Accessibility bridge. There is no simulation layer and no
graceful skip: if the application is missing or not running, the E2E suite
fails.

## Test Inventory Plan

| File | Scope | Planned tests |
| --- | --- | --- |
| `test_core.py` | Pure unit tests with fixture AX trees and a fake bridge | 16 |
| `test_full_e2e.py` | Live application + installed CLI subprocess | 13 |

## Unit Test Plan (`test_core.py`)

| Module | Areas | Tests |
| --- | --- | --- |
| `core/inventory.py` | tree flattening order; menu cleaning (Apple menu dropped, submenus flattened); workspace chrome (modes/toolbar/tools); palette groups, subcategory rows, stock models from the captured main-window fixture; config group/page parsing (GLOBAL/ROUTING/SWITCHING/INTERFACE) from the captured Router1 fixture; page content capture (labels, fields, buttons, tables); HTML→text stripping; help directory listing and single-page lookup | 9 |
| `core/session.py` | locked JSON round-trip; undo/redo apply `before`/`after` through a fake bridge; reset clears both stacks | 3 |
| `core/ax.py` | `PACKET_TRACER_AX_HELPER` override; dry-run click resolves the target through `find` and never calls the helper's click path | 2 |
| `packet_tracer_cli.py` | `--help` renders; `--json find` with a monkeypatched bridge; `set` records an undo entry in a temp session file | 3 |

Edge cases covered: missing fixtures, empty trees, Apple menu filtering,
identifier-less nodes, malformed help pages, absent device windows.

## E2E Test Plan (`test_full_e2e.py`)

Live workflows against the running application:

1. `doctor` reports the installed bundle, version, running process, AX trust and window count.
2. Window listing contains the main `Cisco Packet Tracer` window.
3. Menu bar exposes File/Edit/Options/View/Tools/Extensions/Help, and Extensions contains `Activity Wizard ...`.
4. `Activity Wizard` resolves as a real AX button with an AXPress action.
5. The main window tree carries Qt identifiers (`PtApp.CAppWindowBase…`).
6. Bundled help lists pages and `config_routers` text describes the Config tab levels and the equivalent IOS command pane.
7. `inventory menus` writes a JSON artifact with ≥ 6 menus and the Extensions items.
8. `inventory palette` drives the live palette accordion and records Router/End-Device models (e.g. `ISR4331`, `PC-PT`). Slow but real.
9. `inventory config` returns the category tree when a device window is open; when none is open it must return an explicit empty result (asserted both ways).

CLI subprocess tests (installed `cli-anything-packet-tracer`):

10. `--help` exits 0.
11. `--json doctor` parses and reports `installed`/`running`.
12. `--json windows` lists the main window.
13. `--json inventory menus --out <tmp>` writes a non-empty JSON artifact with parsed menus.

## Realistic Workflow Scenarios

**W1 — Feature inventory for parity planning**
Simulates: an engineer enumerating what the shipped Packet Tracer can do before
extending wireX.
Operations: `doctor` → `inventory menus` → `inventory palette` → `inventory config`
→ `inventory help`.
Verified: JSON artifacts parse, contain the expected menu/palette/config/help
structures, and are written to stable paths for diffing.

**W2 — Driving a live device from the CLI**
Simulates: an agent operating a device's Config tab without a human.
Operations: `windows` → `tree --window <device>` → `config categories` →
`click --identifier ... --mode mouse` → `get` a field → `set` a value → `session undo`.
Verified: the page switch changes the recorded content labels; `set` records an
undo entry and `session undo` restores the previous value.

**W3 — Agent discovery surface**
Simulates: a fresh agent installing the harness.
Operations: `--help` → `preview capture` → `preview latest` → `session show`.
Verified: exit codes, JSON shape, and the preview bundle path.

---

# Test Documentation

## How to run

```bash
cd tools/packet-tracer/agent-harness
PATH="$PWD/.venv/bin:$PATH" CLI_ANYTHING_FORCE_INSTALLED=1 \
  .venv/bin/python -m pytest cli_anything/packet_tracer/tests -v
```

- `test_core.py` — offline, fixtures captured from the live app.
- `test_full_e2e.py` — requires Cisco Packet Tracer running; fails rather than skips.

## Results

| Suite | Result | Notes |
| --- | --- | --- |
| `test_core.py` | 17 passed | Fixtures: `main_tree.json`, `config_tree.json`, `workspace_tree.json`. |
| `test_full_e2e.py` | 16 passed | Live AX reads, palette sweep, config state, CLI subprocess. |

E2E coverage detail:

- Bundle discovery reports `9.0.1` via the install folder name fallback (the app's
  `Info.plist` carries no version keys).
- The palette sweep drove the real accordion and returned 7 categories, 6 network
  subcategories and Router/End-Device models (`1841`, `ISR4331`, `Router-PT`, `PC-PT`).
- `get` on an unknown target exits 1 with `{"ok": false, "error": ...}`.
- `--dry-run click` resolves the target through `find` and never posts a click.

## Artifacts produced by this suite's runs

| Artifact | Producer | Content |
| --- | --- | --- |
| `replica/pt-9.0.1/inventory.json` | `inventory all` | 9 menus, workspace chrome, 181 palette models, config tree, 150 help pages. |
| `replica/pt-9.0.1/config-Router1.json` | `config map --window Router1` | All 8 config pages with labels, fields, live values and buttons. |
| `replica/pt-9.0.1/GAP_REPORT.md` | `tools/packet-tracer/gap_report.py` | Model-by-model diff against the wireX catalog (44/181 recognized). |

## Known limitations

- `Legacy` palette subcategory reports 0 models: its model list may require scrolling
  the subcategory scroll area before the rows appear in the AX tree.
- `ptax screenshot` needs Screen Recording permission, which this host has not granted;
  the harness records structure instead of pixels and marks captures accordingly.
