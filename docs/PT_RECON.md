# PT 9.0.1 Interface Reconnaissance — Evidence Summary

> Internal engineering note. Reconnaissance was performed on an installed copy of
> Cisco Packet Tracer 9.0.1 on this machine, read-only, offline, under the
> authorized case `work/pt901-uirecon` (case-guard exit 0). All extracted strings,
> screenshots and structure notes stay **in this repository's internal `work/` case
> only**. No Cisco code, assets, copy, icons or trademarks were copied into the
> shipped application. wireX is a clean-room implementation that reproduces
> *familiar workflows*, not protected expression.

## 1. Case record

| Field | Value |
| --- | --- |
| Case root | `work/pt901-uirecon/` |
| Authorization | `scope.md` — static, offline, read-only; `case-guard.sh` exit 0 |
| Sample | `…/Cisco Packet Tracer 9.0.1.app/Contents/MacOS/PacketTracer` (Mach-O universal x86_64+arm64) |
| Primary UI string evidence | `…/Contents/LANGUAGES/template.ts` (Qt Linguist template) |
| SHA-256 (template.ts) | `ad0ff1156830f8ec0448fad3e93d48dece34004d1152e140338626839ca13e60` |
| Extracted inventory | 10,603 strings · 499 contexts · 514 source files (`evidence/ui_strings.csv`) |
| Secondary evidence | `Contents/help/default/*.htm` + `images/*` (official help, shipped in-bundle) |
| Version observed | 9.0.1 (bundle `9X38D433RE`-signed Cisco Developer ID build, hardened, notarized) |

Reproduce the string inventory:

```bash
python3 work/pt901-uirecon/scripts/extract_ts.py   # regenerates evidence/ui_strings.csv
python3 work/pt901-uirecon/scripts/q.py "pattern" # query contexts/files by string
```

## 2. Interface regions (from official in-bundle help)

`Contents/help/default/interfaceOverview.htm` documents ten regions, confirmed
against its labeled screenshot (`images/interfaceOverview_1.jpg`):

1. Menu Bar — File, Edit, Options, View, Tools, Extensions, Window, Help
2. Main Tool Bar — shortcut icons for common commands
3. Common Tools Bar — Select, Inspect, Delete, Resize Shape, Place Note, Drawing Palette, Add Simple PDU, Add Complex PDU
4. Logical/Physical Workspace and Navigation Bar — workspace tabs + back + cluster navigation strip
5. Workspace — logical/physical canvas
6. Realtime/Simulation Bar — clock, Power Cycle Devices, Fast Forward Time; in Simulation mode the play-control buttons and the **Event List toggle**; Realtime/Simulation mode tabs at the right
7. Network Component Box — container of the device-type box, device-specific box and search field
8. Device-Type Selection Box — category icons (device groups)
9. Device-Specific Selection Box — model shelf with paging arrows
10. User Created Packet Window (UCPW) — scenario selector, Fire / Last Status / Source / Destination / Type table, New / Delete, Toggle PDU List Window

## 3. Device window tab superset

The single Qt designer file `gui/DesignerFiles/BaseDeviceWidget.ui` (string context
`CBaseDeviceWidgetClass`) carries the tab labels: **Physical, Config, Services, CLI,
Desktop, Attributes**; `CDeviceDialog.cpp` adds **Programming** for script-capable
devices. Per-device subsets are assembled in code — servers expose **Services**
(DHCP, DNS, TFTP, FTP, HTTP, Mail, NTP, Syslog, AAA, IoT pages…), end devices
expose **Desktop** with GUI apps.

Server service pages enumerated from `gui/DesignerFiles/Server/*.ui` context names:
`Dhcp{,v6}`, `Dns`, `Tftp`, `Ftp`, `Http`, `Mail`, `Ntp`, `Syslog`, `AAA`, `Eap`,
`PapChap`, `Historian`, `Ioe`, `Iox`, `NetworkController`, `Prp`.

Help pages corroborate the Services tab workflow, e.g. `config_DataHistorian.htm`:
"…the Services tab provides control over enabling/disabling…".

## 4. Device selection box structure (string-context evidence)

`CDeviceTypesBox` context strings expose the group tree:

- `[Network Devices]` → Routers, Switches, Hubs, Wireless Devices, Security, WAN Emulation, Multiuser Connection, Custom Made Devices
- `[Components]` → Boards
- `[End Devices]`
- `[Connections]`
- IoT families (Home, Smart City, Industrial, Power Grid, Actuators, Sensors, Miscellaneous)
- "Search for device" field

## 5. Physical view containers (toolbar contexts)

`City / Building / Container / Wiring Closet / Rack / Table / Generic Container /
Intercity / Patch Panel / Wall Mount / Shelf / Pegboard` container tools, plus
`Power Cycle`, and physical-mode support controls.

## 6. Simulation evidence

- Simulation tool bar: Back (Alt+B), Auto Capture/Play (Alt+P), Capture/Forward (Alt+C), Event List (Alt+I)
- Realtime bar: Power Cycle Devices (Alt+S), Fast Forward Time (Alt+D)
- Simulation Panel strings: Event List, Show All/None, Edit Filters, Play Speed
- UCPW columns: Fire · Last Status · Source · Destination · Type
- Simulation panel internals (scenario list, event list table) from `CBaseSimulationPanel` contexts.

## 7. Gap map

Comparisons against the wireX implementation, with launch-blocker classification,
live in [`PT_PARITY_GAP_MAP.md`](PT_PARITY_GAP_MAP.md).
