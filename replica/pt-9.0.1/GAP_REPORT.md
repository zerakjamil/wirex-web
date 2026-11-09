# Packet Tracer 9.0.1 → wireX gap report

Source inventory: `replica/pt-9.0.1/inventory.json`
Captured from: /Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app (version 9.0.1)

## Menu bar (live capture)

- **Cisco Packet Tracer**: About Cisco Packet Tracer, Preferences..., Exit and Logout, Services, Hide Cisco Packet Tracer, Hide Others, Show All, Quit Cisco Packet Tracer
- **File**: New, Open ..., Open Samples ..., Recent Files, Save, Save As ..., Save As PKZ ..., Reset Activity, Print ...
- **Edit**: Copy, Paste, Undo, Redo, Writing Tools, AutoFill, Start Dictation…, Emoji & Symbols
- **Options**: Algorithm Settings, User Profile ..., View Command Log
- **View**: Zoom, Toolbars, Simulation Mode, Realtime Mode, Logical View, Physical View, Show Viewport, Show Workspace List, Enter Full Screen
- **Tools**: Drawing Palette ..., Custom Devices Dialog, Script Project Manager ..., Cluster Associations Dialog
- **Extensions**: Activity Wizard ..., Listening Ports ..., Multiuser, IPC, Scripting, Clear Terminal Agent, Marvel, Resource Attributes
- **Window**: Enter Full Screen, Router1
- **Help**: Getting Started, Contents, Tutorials, Accessibility, Report an Issue

## Workspace chrome

- Modes: Logical Mode, Physical Mode, Realtime Mode, Simulation Mode
- Tools: Select, Inspect, Delete, Resize, Place Note, Draw Line, Draw Rectangle, Draw Ellipse, Draw Freeform, Add Simple PDU, Add Complex PDU
- Toolbar: Go Back One Level (Alt+Left), Create New Cluster (Shift+U), Move Object(Shift+M), Set Background Image (Shift+I), Environment (Shift+E)

## Device palette

Live capture lists **181** stock/custom models across 7 categories.

| Category | Subcategory | PT models | in wireX | missing |
| --- | --- | --- | --- | --- |
| Network Devices | Routers | 18 | 18 | — |
| Network Devices | Switches | 11 | 11 | — |
| Network Devices | Hubs | 3 | 3 | — |
| Network Devices | Wireless Devices | 15 | 15 | — |
| Network Devices | Security | 4 | 4 | — |
| Network Devices | WAN Emulation | 4 | 4 | — |
| End Devices | End Devices | 15 | 15 | — |
| End Devices | Smart Home | 21 | 21 | — |
| End Devices | Smart City | 16 | 16 | — |
| End Devices | Industrial - OT | 6 | 6 | — |
| End Devices | Power Grid | 4 | 4 | — |
| Components | Boards | 3 | 3 | — |
| Components | Actuators | 14 | 14 | — |
| Components | Sensors | 21 | 21 | — |
| Connections | Connections | 13 | 13 | — |
| Connections | Structured Cabling | 4 | 4 | — |
| Miscellaneous | Miscellaneous | 8 | 8 | — |
| Multiuser Connection | Multiuser Connection | 1 | 1 | — |

**Catalog coverage: 181/181 models recognized (100.0%).**

### Palette labels mapped to an existing model

| PT palette label | wireX model | Reason |
| --- | --- | --- |
| 2811 with IOS 12 | 2811 IOS15 | IOS 12 is a software image; wireX models one IOS surface per platform |
| 2960 with IOS 12 | 2960 IOS15 | IOS 12 is a software image; wireX models one IOS surface per platform |

## Device Config tab (captured from a live 1841)

- **GLOBAL**: Settings, Algorithm Settings
- **ROUTING**: Static, RIP
- **SWITCHING**: VLAN Database
- **INTERFACE**: GigabitEthernet0/0/0, GigabitEthernet0/0/1, GigabitEthernet0/0/2

### Config pages with fields (live values)

- **GLOBAL / Settings**
  - fields: `Hostname`, `Display Name`, `Device Clock:`
  - labels: Equivalent IOS Commands, Global Settings, NVRAM, Startup Config, Running Config, Display Name, Hostname
  - buttons: Merge file to running config, Erase NVRAM, Export running config to file, Save Running config to NVRAM, Load file to startup config, Export startup config to file
- **GLOBAL / Algorithm Settings**
  - fields: `Half Open Session Multiplier`, `Maximum Number of TCP connections`, `Maximum number of opened TCP Sessions`, `Maximum retransmission timeout in milliseconds`
  - labels: Equivalent IOS Commands, Algorithm Settings, Half-Open Session Multiplier:, Maximum Number of Connections:, Maximum Number of Opened Sessions:, Maximum Retransmission Timeout in Milliseconds:
- **ROUTING / Static**
  - fields: `Mask`, `Next Hop`, `Network`
  - labels: Equivalent IOS Commands, Static Routes, Network, Next Hop, Mask
  - buttons: Add, Remove
- **ROUTING / RIP**
  - fields: `Network`
  - labels: Equivalent IOS Commands, RIP Routing, Network
  - buttons: Add, Remove
- **SWITCHING / VLAN Database**
  - fields: `VLAN Number`, `VLAN Number`
  - labels: Equivalent IOS Commands, VLAN Configuration, VLAN Number, VLAN Name
  - buttons: Add, Remove
- **INTERFACE / GigabitEthernet0/0/0**
  - fields: `MAC Address`, `Subnet Mask`, `IP Address`, `Tx Ring Limit`
  - labels: Equivalent IOS Commands, Interface Slot/Port, Port Status, Link Speed, Duplex, MAC Address, Subnet Mask, IP Address, Tx Ring Limit
- **INTERFACE / GigabitEthernet0/0/1**
  - fields: `MAC Address`, `Subnet Mask`, `IP Address`, `Tx Ring Limit`
  - labels: Equivalent IOS Commands, Interface Slot/Port, Port Status, Link Speed, Duplex, MAC Address, Subnet Mask, IP Address, Tx Ring Limit
- **INTERFACE / GigabitEthernet0/0/2**
  - fields: `MAC Address`, `Subnet Mask`, `IP Address`, `Tx Ring Limit`
  - labels: Equivalent IOS Commands, Interface Slot/Port, Port Status, Link Speed, Duplex, MAC Address, Subnet Mask, IP Address, Tx Ring Limit

## Bundled help catalog

150 help pages ship inside the application.
Largest groups: config (19), ot (13), activityWizard (10), workspace (10), model (8), scriptModules (8), iot (7), mode (7), devicesAndModules (6), CLI (5), industrial (5), sampleFilesAndDesignPatterns (5).

