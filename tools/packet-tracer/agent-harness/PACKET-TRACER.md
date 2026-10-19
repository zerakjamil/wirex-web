# Cisco Packet Tracer 9.0.1 — Harness Target Notes

## Target

| Field | Value |
| --- | --- |
| Software | Cisco Packet Tracer 9.0.1 |
| Vendor | Cisco Systems / Networking Academy |
| License | Proprietary, free for NetAcad users |
| Platform | macOS (target build evaluated on Darwin 26, arm64) |
| Bundle | `/Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app` |
| Bundle ID | `com.netacad.PacketTracer9.0.1` |
| GUI toolkit | Qt (QtWebEngine for embedded views) |
| CLI surface | None — Packet Tracer ships no scripting interface |

## Why an Accessibility harness

Packet Tracer exposes no command line, no scripting bridge and no stable
file-level automation contract for its live workspace. The only faithful surface
is the running application itself, so this harness drives the GUI through the
macOS Accessibility (AX) API.

The Swift helper in `cli_anything/packet_tracer/utils/ptax.swift` performs AX
reads, presses, real mouse clicks (some Qt tree rows only respond to physical
mouse events) and keyboard synthesis. A few companion facts:

* Qt rows expose `AXCheckBox` roles; toggling a row through `AXPress` changes
  its selected state but does **not** always fire the page switch. The harness
  therefore uses `--mode mouse` for tree navigation and page mapping.
* Qt object names arrive through `AXIdentifier`
  (e.g. `...CDeviceTypesBox.group_Network_Devices`), which makes device palette
  and Config tab extraction deterministic.
* The bundle carries its documentation as HTML under `Contents/help/default/`;
  the harness parses those pages so the feature inventory covers what the UI
  does not surface in one view.

## Environment prerequisites

* macOS with Accessibility permission granted to the terminal / agent that runs
  the CLI (System Settings → Privacy & Security → Accessibility).
* Xcode command line tools (`swiftc`) when the helper has not been prebuilt.
* Packet Tracer installed and licensed for the current user.

## Inventory sources

| Section | Source |
| --- | --- |
| `menus` | live menu bar via AX |
| `workspace` | live main window chrome, modes and tools |
| `palette` | live device palette accordion (top-level groups, subcategories, models) |
| `config` | live device Config tab category tree, optionally every page's fields |
| `help` | bundled help HTML pages shipped inside the application bundle |

Artifacts are written as JSON so the wireX parity checklist can diff them
against its own catalog.
