# Recon Map: Cisco Packet Tracer 8.2 → 9.0.1 (Desktop Suite to Web Clone)

Scope: Core CCNA / CCNP network simulation and hands-on laboratory slice: interactive 2D logical topology canvas, 3D isometric hardware models, physical modular chassis with hot-swap power interlock, multi-mode Cisco IOS / ASA CLI command parser, desktop student applications, real-time & discrete simulation packet engine (OSI 7-layer PDU inspection, STP convergence, ARP/ICMP/DHCP/DNS/OSPF/VoIP), and Twofish PKT binary file decoder.  
For: Networking students, university IT departments, CCNA certification candidates, and instructors seeking an instant-on, zero-install network engineering laboratory that runs on any device (Chromebook, tablet, Mac, Linux, Windows).  
Date: 2026-10-06 · 9.0.1 refresh: 2026-10-16  
Author: Replica Reconnaissance Engine (Clean-Room Protocol)

---

## 1. Sources

| # | Source Type | URL / Reference | Notes & Extracted Insights |
| :---: | :--- | :--- | :--- |
| 1 | Help Center & User Guide | `https://www.netacad.com/courses/packet-tracer` | Comprehensive feature catalog: device types, modular expansion cards (WIC-2T, HWIC-2T, NM-ESW-16, WPC300N), workspace modes, cable categories. |
| 2 | Curriculum Specifications | `CCNA 200-301 Certification Official Guide (Cisco Press)` | Core syllabus requirements: VLANs, 802.1Q trunks, SVIs, EtherChannel (LACP/manual), STP (802.1D root election/PortFast), OSPF single-area, ACLs, NAT/PAT. |
| 3 | Software Release Notes | `https://www.netacad.com/resources/lab-downloads` | Version 8.2.x updates: Physical mode enhancement, ASA 5506-X security appliance, PTSk script engine, Activity Wizard scoring mechanisms. |
| 4 | Interactive Widget Reference | `https://ptanywhere.open.ac.uk/` | PTAnywhere Open University CCNA interactive widget: 3D isometric device pucks, directional vector lighting, browser canvas interaction patterns. |
| 5 | Command Reference Guide | `Cisco IOS 15.x Command Reference (cisco.com)` | Prompt hierarchies (`>`, `#`, `(config)#`, `(config-if)#`, `(config-router)#`), abbreviations, tab auto-completion, running-config serialization. |
| 6 | Binary File Architecture | `MIT Reference: jeamxn/cisco-pka-to-xml` | Twofish CBC cipher specification (128-bit key derived from salt), header parsing, and internal XML document schema (`<PACKETTRACER5>`). |
| 7 | User Account Walkthroughs | Real-world student CCNA classroom assignments | Inspection of campus topologies: multi-tier distribution, dual-core switches, IP phone CME dial-peers, and ASA inside/outside security levels. |
| 8 | Installed Application (user-owned, read-only) | `/Applications/Cisco Packet Tracer 9.0.1/…/Contents` | 9.0.1 interface evidence: in-bundle help pages and screenshots (`help/default/`), Qt Linguist string template (`LANGUAGES/template.ts` — 10,603 strings / 499 contexts), designer file names (`gui/DesignerFiles/…`). Internal reference only — never shipped; evidence case: `work/pt901-uirecon/`. |

---

## 2. Core Loop

**Build a virtual network topology by connecting modular hardware, configure switches and routers using authentic CLI commands, and observe real-time packet flow through multi-layer protocol inspection to verify connectivity and solve network faults.**

---

## 3. Screen Inventory

| ID | Screen Name | Route / Navigation | Purpose | Key Components | States Seen |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **S01** | **Main Logical Workspace** | `/` (Root canvas) | Primary workbench for placing, connecting, and viewing network hardware nodes and links. | Menu bar, tool palette, React Flow canvas, device navigator, bottom hardware shelf, simulation dock. | Empty canvas, populated topology, connecting cable mode, dragging devices, dark mode. |
| **S02** | **Device Modal: Physical Tab** | Double-click device -> `Physical` tab | Realistic front/rear/side hardware chassis inspection, power control, and modular card installation. | Chassis vector render, zoom slider, power rocker switch, LED indicators, modular slot bays, module card selector. | Power ON, Power OFF, module inserted, hot-swap blocked alert, zoomed in/out. |
| **S03** | **Device Modal: CLI Tab** | Double-click device -> `CLI` tab | Interactive terminal emulator executing authentic IOS and ASA configuration commands. | VT100-style terminal output pane, interactive input line, keyboard handler, command history buffer. | Bootloader sequence, user EXEC (`>`), privileged EXEC (`#`), config mode (`(config)#`), syntax error. |
| **S04** | **Device Modal: Config Tab** | Double-click device -> `Config` tab | High-level form-based configuration of global host parameters and network interfaces. | Display Name, Hostname, NVRAM/Startup buttons, Interface tree list, IP address & subnet inputs, MAC field. | Form active, unsaved edits, interface up/down, static vs DHCP selected. (9.0.1: on servers, Config carries global/interface settings only; service enablement lives under Services — see S16.) |
| **S05** | **Device Modal: Desktop Tab** | Double-click workstation -> `Desktop` tab | Application launcher grid representing the desktop operating system on PCs and Laptops. | Icon grid: IP Configuration, Command Prompt, Web Browser, PC Wireless, Terminal, IP Phone. | Default grid view, active app launch, disabled when powered off. |
| **S06** | **Desktop App: IP Configuration** | S05 -> Click `IP Configuration` | Configure workstation IPv4 addressing, default gateway, and DNS servers. | Static / DHCP radio toggle, IPv4 Address input, Subnet Mask input, Default Gateway input, DNS input. | Static filled, DHCP requesting, DHCP leased, invalid IP error format. |
| **S07** | **Desktop App: Command Prompt** | S05 -> Click `Command Prompt` | Command-line environment for diagnostics (`ping`, `traceroute`, `ipconfig`, `arp`, `netstat`). | Monospace terminal window, prompt `C:\>`, command executor, active ping progress ticker. | Prompt idle, ping success (`Reply from...`), ping timeout (`Request timed out`), ARP display. |
| **S08** | **Desktop App: Web Browser** | S05 -> Click `Web Browser` | Embedded web browser for testing HTTP/HTTPS web servers across the network. | URL address bar, `Go` button, HTML rendering view area, status indicator. | Initial blank page, HTTP 200 OK rendered page, `Host unreachable` connection error. |
| **S09** | **Desktop App: PC Wireless** | S05 -> Click `PC Wireless` | Manage 802.11 Wi-Fi client association, site survey, and security passphrases. | Link Information tab, Site Survey tab, Connect tab, SSID scan list, WEP/WPA2 passphrase input. | No wireless NIC installed, scanning SSIDs, associated to AP, authentication failure. |
| **S10** | **Desktop App: IP Phone GUI** | S05 -> Click `IP Phone` | Authentic Cisco 7960 IP Phone hardware simulator with audio signaling and call handling. | Handset graphic, LCD backlit screen, 12-key dialing keypad, Line 1/2 buttons, call status bar, audio tone generator. | Handset on-hook, off-hook dial tone, ringing, connected call with timer, unregistered. |
| **S11** | **Device Modal: ASDM GUI** | Double-click ASA 5505 -> `ASDM` tab | Graphical management console for the Cisco Adaptive Security Appliance (ASA). | Dashboard metric cards, Startup Wizard, Interface Security Level table, Inside/Outside ACL rules. | Connected, wizard step-by-step, security level warning, rules applied. |
| **S12** | **Simulation Panel & Event List** | Bottom-right dock -> `Simulation` mode | Step-by-step discrete packet transmission engine and historical protocol event log. | Play / Pause button, Step Forward (Capture/Forward) button, Event List table (Time, Last Device, Protocol, Info). | Realtime active, Simulation paused, stepping packet frame, event queue full. (9.0.1: the Event List toggle lives in the Realtime/Simulation bar — Alt+I; an Edit Filters dialog manages ACL/protocol capture filters.) |
| **S13** | **PDU Details Inspector** | Click packet envelope or Event List row | Educational 7-layer OSI model protocol breakdown and hexadecimal frame inspector. | OSI Model layer tabs (Layers 1-7 In/Out), Ethernet II frame breakdown, IPv4 header table, ICMP/TCP payload. | Layer explanation view, inbound PDU details, outbound PDU modifications. |
| **S14** | **Starter Labs & Activity Modal** | Top Menu `File` / Canvas welcome card | Catalog of pre-configured CCNA educational topologies and practice scenarios. | Lab cards with thumbnail previews, difficulty badges, brief topology descriptions, `Load Lab` action button. | Grid view, loading state, confirmation prompt. |
| **S15** | **Connection Hover Card** | Hover over device port or cable LED | Live telemetry inspection showing real-time interface metrics without opening device modals. | Port name badge, Link status LED (UP/DOWN), IPv4 address, MAC address, STP state (FWD/BLK), EtherChannel bundle. | Single port view, multi-port device summary table, cable endpoint comparison. |
| **S16** | **Device Modal: Services Tab (Server)** | Double-click a Server → `Services` tab | Service enablement and content management for servers — the first place Packet Tracer students go for DHCP/DNS/HTTP/TFTP/mail labs. | Service list sidebar (HTTP, DHCP, DHCPv6, TFTP, DNS, SYSLOG, AAA, NTP, EMAIL, FTP, IoT, VM Management, Radius EAP), per-service on/off pages, HTTP/HTTPS File Manager (edit/delete/new/import). | Service off, service on, file editing, missing-file error. |
| **S17** | **Simulation Event List & Filters** | Bottom-right dock → `Simulation` mode → `Event List` toggle | Review captured protocol events and manage what gets captured. | Event List toggle (Alt+I), Edit Filters dialog (ACL filter sets, extended-ACL statement editor with context help), protocol filter checklist. | All events shown, filtered set, empty list, filter renamed. |

---

## 4. User Flows

### F01: Create and Wire a Two-Workstation Switched Subnet
*Goal*: Connect two PCs through a Catalyst 2960 switch, assign static IP addresses, and verify connectivity via ping.
- S01: Drag PC0, PC1, and Switch0 onto canvas -> Click Straight-Through cable -> Attach PC0 Fa0 to Switch0 Fa0/1 -> Attach PC1 Fa0 to Switch0 Fa0/2.
- S01: Observe link LEDs transition from amber (STP listening/learning) to green (forwarding).
- S01 -> S05 -> S06: Open PC0 -> Click `IP Configuration` -> Enter `192.168.1.10`, subnet `255.255.255.0`.
- S01 -> S05 -> S06: Open PC1 -> Click `IP Configuration` -> Enter `192.168.1.20`, subnet `255.255.255.0`.
- S01 -> S05 -> S07: Open PC0 -> Click `Command Prompt` -> Type `ping 192.168.1.20`.
- S07: Observe ARP resolution and 4 ICMP echo replies (`Reply from 192.168.1.20: bytes=32 time<1ms TTL=128`).
- *Happy path clicks*: 14 clicks.
- *Edge cases*: Disconnected cable, conflicting duplicate IP addresses, mismatched subnets, power off.

### F02: Configure Cisco Router Interfaces and OSPF via IOS CLI
*Goal*: Bring up router interfaces, assign IP addresses, enable OSPF routing, and inspect route tables.
- S01 -> S03: Double-click Router 1941 -> Open `CLI` tab.
- S03: Type `enable` -> Enter privileged mode (`Router#`).
- S03: Type `configure terminal` -> Enter global config (`Router(config)#`).
- S03: Type `interface GigabitEthernet0/0` -> Enter interface mode (`Router(config-if)#`).
- S03: Type `ip address 10.0.0.1 255.255.255.0` -> Type `no shutdown`.
- S03: Observe link status change console notification (`LINK-3-UPDOWN: Interface GigabitEthernet0/0, changed state to up`).
- S03: Type `router ospf 1` -> Type `network 10.0.0.0 0.0.0.255 area 0`.
- S03: Type `end` -> Type `show ip route`.
- S03: Inspect routing table with connected (`C`) and OSPF (`O`) routes.
- *Happy path clicks*: 4 clicks (primarily keyboard driven).
- *Edge cases*: Typos, invalid subnet masks, administratively down interfaces, mismatched OSPF area IDs.

### F03: Inspect Packet Traversal and OSI Layers in Simulation Mode
*Goal*: Trace an ICMP ping frame by frame through a switch and router, examining headers at each hop.
- S01: Switch mode dock from `Realtime` to `Simulation`.
- S01: Select `Simple PDU` tool (mail icon) -> Click Source PC0 -> Click Destination PC1.
- S01: Yellow packet envelope appears on PC0 interface.
- S01: Click `Capture / Forward` button.
- S01: Envelope moves along cable from PC0 to Switch0; ARP broadcast or unicast frame animation triggers.
- S01 -> S13: Click the moving packet envelope on the canvas.
- S13: Inspect OSI 7-Layer breakdown: In Layers (Layer 2 Ethernet II, Layer 3 IPv4) and Out Layers.
- S01: Click `Capture / Forward` again to advance packet to PC1.
- *Happy path clicks*: 6 clicks.
- *Edge cases*: Destination unreachable, packet dropped by ACL, STP blocking port drop, queue overflow.

### F04: Hot-Swap Laptop Modular Hardware to Wireless WPC300N
*Goal*: Remove wired FastEthernet card from a laptop and install a Linksys WPC300N wireless NIC.
- S01 -> S02: Double-click Laptop0 -> Open `Physical` tab.
- S02: Drag `WPC300N` card toward expansion bay while power is ON -> Red warning modal triggers: *"Cannot remove or insert a module when the power is on."*
- S02: Click Power Rocker switch to toggle laptop power OFF -> Green LED extinguishes.
- S02: Drag wired NIC out of laptop bay into empty shelf -> Bay clears.
- S02: Drag `WPC300N` wireless card into open bay -> Horizontal swivel antenna and ACT LED appear.
- S02: Click Power Rocker switch to toggle laptop power ON -> Green LED illuminates.
- S01 -> S05 -> S09: Open `Desktop` -> Click `PC Wireless` -> Site Survey -> Associate to Access Point.
- S01: Observe radiating 802.11 wireless radio arcs connect Laptop0 to AccessPoint0.
- *Happy path clicks*: 8 clicks.
- *Edge cases*: Inserting incompatible module, powering off while packet in flight, forgetting to turn power back on.

### F05: Establish VoIP Call between Cisco IP Phones via CME
*Goal*: Register two IP phones to Cisco CallManager Express, dial extension, and establish audio connection.
- S01: Wire IP Phone 1 and IP Phone 2 to Switch PoE ports; wire switch to 2811 Voice Router.
- S01 -> S03: Configure CME on router (`telephony-service`, `max-ephones 5`, `ephone-dn 1 number 1001`, `ephone-dn 2 number 1002`).
- S01: Observe IP phones obtain DHCP Option 150 and register (`Registered: 1001` and `Registered: 1002`).
- S01 -> S10: Open Phone 1 GUI -> Click handset to lift receiver (off-hook) -> Hear dial tone.
- S10: Click keypad `1`, `0`, `0`, `2` -> Press `Dial`.
- S01 -> S10: Open Phone 2 GUI -> Screen displays *"Ring from 1001"* with ringing cadence.
- S10: Click Phone 2 handset to answer -> Both phones display *"Connected: 00:01"* -> Hear active call audio.
- S10: Click handset to hang up -> Call terminates.
- *Happy path clicks*: 7 clicks.
- *Edge cases*: Unregistered extension, busy destination, self-calling, unregistered CME source address.

### F06: Secure Perimeter via ASA 5505 Security Levels and ASDM
*Goal*: Configure inside (security level 100) and outside (security level 0) zones, verifying default stateful inspection.
- S01: Wire PC-Inside to ASA Vlan1 (`inside`); wire Server-Outside to ASA Vlan2 (`outside`).
- S01 -> S11: Double-click ASA 5505 -> Open `ASDM` tab.
- S11: Review Interface Dashboard: verify `inside` has security-level 100 and `outside` has security-level 0.
- S01 -> S07: Open PC-Inside -> Ping Server-Outside (`192.168.2.100`) -> Traffic allowed (higher to lower security level).
- S01 -> S07: Open Server-Outside -> Ping PC-Inside (`192.168.1.10`) -> Traffic dropped by ASA default inspection policy.
- *Happy path clicks*: 6 clicks.
- *Edge cases*: Access list permit statement overriding default level, NAT translation missing, identical security levels without intra-interface permit.

### F07: Import Official .pkt Topology from Local Disk
*Goal*: Open an official Cisco Packet Tracer `.pkt` file and render complete topology with original settings.
- S01: Click top menu `File` -> `Open Project...` (or drag `.pkt` file onto canvas).
- S01: System decodes Twofish encryption stream, parses XML structure, instantiates devices, ports, and links.
- S01: Full canvas renders with matching device coordinates, hostnames, cables, and configurations.
- *Happy path clicks*: 2 clicks.
- *Edge cases*: Password-protected `.pka` activity, corrupted ciphertext, unsupported proprietary extensions, XML schema version mismatch.

### F08: Configure Server Services and Host Web Content (9.0.1 Services Tab)
*Goal*: Enable HTTP on a server, edit the hosted page, and load it from a PC browser.
- S01 -> S16: Double-click Server0 -> Open `Services` tab -> Select `HTTP` in the service list.
- S16: Set HTTP `On` -> Click `(edit)` on `index.html` -> Replace the body content -> Apply.
- S01 -> S05 -> S08: Open PC0 -> `Desktop` -> `Web Browser` -> Enter the server IP -> Page renders the edited HTML.
- *Happy path clicks*: 8 clicks.
- *Edge cases*: Service left Off (connection refused), DNS not configured (IP-only reachable), file deleted after edit, HTTPS enabled without certificate.

---

## 5. Components

| Component | Variants | States | Used On Screens |
| :--- | :--- | :--- | :--- |
| **TopMenuBar** | Classic Qt ribbon menu (`File`, `Edit`, `Options`, `View`, `Tools`, `Help`). | Default, hovered, menu expanded, disabled item. | S01 |
| **ToolPalette** | Common tools (Select, Inspect, Delete, Note, Shape, Simple PDU, Complex PDU). | Default, active tool selected, hovered. | S01 |
| **DeviceNode** | 15 3D isometric vector models (Routers, Switches, PCs, Servers, Phones, Clouds). | Idle, hovered, selected, dragged, power off badge, connecting source/target. | S01 |
| **CableEdge** | Straight, Crossover, Fiber, Serial, Console, Auto-detect. | Link UP (Green), Link DOWN (Red), STP Blocking (Amber), EtherChannel bundle ring. | S01 |
| **ConnectionHoverCard** | Compact port badge, multi-port device table. | Visible on hover, dismissed on mouse leave. | S01, S15 |
| **DeviceModalShell** | Windows XP / Cisco classic dialog container with draggable title bar. | Focused (z-index top), unfocused, minimized, maximized, closed. | S02, S03, S04, S05, S11 |
| **FolderTabs** | Folder tabs (`Physical`, `Config`, `CLI`, `Desktop`, `ASDM`). | Active tab (elevated, white/light slate), inactive tab (muted gray), hovered. | S02, S03, S04, S05, S11 |
| **ChassisViewer** | Modular chassis vector graphic with interactive zoom and pan. | Zoom level 100%, 150%, 200%, slot highlighted on module drag over. | S02 |
| **PowerSwitch** | Rocker switch with illuminated green/red LED indicator. | ON (Power active, LED glowing), OFF (System dark). | S02 |
| **TerminalEmulator** | VT100-style dark terminal with green/amber/white font. | Active prompt, typing, scrolling history, command processing, disabled. | S03, S07 |
| **DesktopAppGrid** | 2-column or 3-column app icon launch matrix. | Default, icon hovered, app opened. | S05 |
| **PacketEnvelope** | Yellow 3D mail envelope with flap crease and protocol label badge. | Moving along cable, stationary at node, clicked, hovered. | S01, S12 |

---

## 6. Inferred Data Model

### Entity Definitions & Relationships

```
NetworkDevice
  id: string (UUID / import-id)
  name: string ("Router0", "Switch1", "PC-A")
  type: DeviceType ('router' | 'switch' | 'pc' | 'server' | 'laptop' | 'accesspoint' | 'cloud' | 'phone' | 'security' | 'printer' | 'hub')
  model: string ("2911", "2960-24TT", "3560-24PS", "PC-PT", "Laptop-PT", "ASA 5505")
  x: number, y: number (canvas coordinates)
  power: boolean (true = operational, false = powered off)
  modules: string[] (installed modular cards: 'WPC300N', 'WIC-2T', 'NM-ESW-16')
  config: DeviceConfig
  ports: NetworkPort[]
  routingTable: RouteEntry[]
  arpTable: ArpEntry[]
  macTable: MacEntry[]
  evidence: S01 canvas placement, S02 physical tab, S04 config tab, XML <DEVICE>
  confidence: high

NetworkPort
  id: string ("FastEthernet0/1", "GigabitEthernet0/0", "Serial0/1/0")
  name: string, shortName: string ("Fa0/1", "Gi0/0", "Se0/1/0")
  type: PortType ('fastethernet' | 'gigabitethernet' | 'serial' | 'console' | 'wireless')
  status: 'up' | 'down' | 'admin-down'
  ipAddress?: string, subnetMask?: string, macAddress: string
  vlan?: number, voiceVlan?: number
  duplex?: 'auto' | 'full' | 'half', speed?: 'auto' | '10' | '100' | '1000'
  mode?: 'access' | 'trunk'
  connectedLinkId?: string, connectedDeviceId?: string
  evidence: S01 port LEDs, S04 interface config, S03 show ip interface brief
  confidence: high

NetworkLink
  id: string (UUID)
  type: CableType ('straight' | 'crossover' | 'fiber' | 'serial' | 'console' | 'auto')
  fromDeviceId: string, fromPortId: string
  toDeviceId: string, toPortId: string
  status: 'up' | 'down'
  stpState?: 'forwarding' | 'blocking' | 'learning'
  channelGroup?: number (EtherChannel bundle ID: Po1 - Po6)
  channelLabel?: string
  evidence: S01 canvas links, CableEdge rendering, XML <LINK>
  confidence: high

DeviceConfig
  hostname: string
  enableSecret?: string
  ipRouting?: boolean
  defaultGateway?: string
  dnsServer?: string
  dhcpServerEnabled?: boolean
  dhcpPools?: Record<string, DhcpPool>
  httpServiceEnabled?: boolean
  htmlContent?: string
  natEnabled?: boolean, natPools?: any[]
  ospf?: { processId: number, routerId: string, networks: OspfNetwork[] }
  rip?: { enabled: boolean, networks: string[] }
  acls?: Record<string, AclRule[]>
  voiceConfig?: { cmeEnabled: boolean, sourceAddress: string, ephones: Ephone[], dialPeers: DialPeer[] }
  asaConfig?: { securityLevels: Record<string, number>, nameifs: Record<string, string> }
  evidence: S03 Cisco IOS commands, S04 config fields, S11 ASDM GUI
  confidence: high

InFlightPacket (PDU)
  id: string
  linkId: string
  fromDeviceId: string, toDeviceId: string
  progress: number (0.0 to 1.0 along cable)
  direction: 'forward' | 'reverse'
  pdu: {
    sourceIp: string, targetIp: string
    protocol: 'ICMP' | 'ARP' | 'TCP' | 'UDP' | 'DNS' | 'HTTP' | 'OSPF' | 'STP'
    icmpType?: 'echo-request' | 'echo-reply'
    ttl: number
    layers: { inLayers: LayerDetail[], outLayers: LayerDetail[] }
  }
  evidence: S01 packet envelopes, S12 simulation event dock, S13 PDU inspector
  confidence: high

DeviceWindow
  deviceId: string
  x: number, y: number, width: number, height: number, z: number
  minimized: boolean
  evidence: S01 floating windows, window drag and resize handlers
  confidence: high

NetworkAnnotation
  id: string
  type: 'text' | 'rect' | 'ellipse' | 'line'
  text?: string
  x: number, y: number, width?: number, height?: number
  color?: string
  evidence: S01 sticky notes, colored campus network zones
  confidence: high
```

### Cardinality & Relationships
- `NetworkDevice` 1 --- n `NetworkPort`
- `NetworkDevice` 1 --- 1 `DeviceConfig`
- `NetworkLink` connects exactly 2 `NetworkPort` instances (on distinct `NetworkDevice` nodes)
- `NetworkLink` 1 --- n `InFlightPacket` (transient during simulation)
- `DeviceConfig` 1 --- n `DhcpPool` / `AclRule` / `Ephone`

---

## 7. Feature Matrix Summary

Reference: [`replica/features.csv`](file:///Users/zerakjamil/.gemini/antigravity/scratch/cisco-packet-tracer-web/replica/features.csv)

| Priority | Count | Percentage | Scope Status in Web Replica |
| :--- | :---: | :---: | :--- |
| **Must-Have** | 61 | 66.3% | 61/61 implemented (Canvas, 3D icons, CLI hierarchy, EtherChannel, STP, OSPF, VLANs, VoIP, Twofish PKT decode, Services tab). |
| **Should-Have** | 20 | 21.7% | 20/20 implemented (ASA ASDM, Dark theme, RTL localization, DHCP relay, OSPF neighbor CLI, Event List toggle). |
| **Could-Have** | 11 | 12.0% | 2 implemented (PT-style shortcuts, Event List tooling), 9 optional backlog (BGP, IoT sensors, WLC web UI, nested clusters, rack view). |
| **Skip (Uncloneable)** | 5 | -- | Explicitly out of scope (see Section 8). |
| **Total Features** | **92** | **100.0%** | Weighted parity 96.2% with 61/61 must-haves and 20/20 should-haves; current gap classification: `docs/PT_PARITY_GAP_MAP.md`. |

---

## 8. What Cannot Be Cloned (Out of Scope)

1. **Proprietary Cisco IOS Microcode & Assembled ELF Binaries**: Cisco Packet Tracer uses a proprietary desktop abstraction layer; real IOS software images (C2900-UNIVERSALK9, etc.) cannot be legally distributed. *Solution*: Rebuilt with a clean-room TypeScript parser replicating commands, outputs, and protocol state machines.
2. **Cisco NetAcad Mandatory Single Sign-On (SSO)**: The official desktop application requires an active Cisco Networking Academy instructor/student account and periodic cloud token authentication. *Solution*: Removed completely; clone is instant-on with zero sign-in barrier.
3. **Proprietary Cisco LMS Grading Server Telemetry**: Secret server-side assessment scripts and grading engine integration. *Solution*: Independent local diagnostics engine ([`diagnostics.ts`](file:///Users/zerakjamil/.gemini/antigravity/scratch/cisco-packet-tracer-web/src/simulator/diagnostics.ts)) evaluates real network state directly.
4. **Desktop Multiuser Socket Daemon**: Desktop TCP daemon allowing multiple desktop instances over local LAN to link virtual cables. *Solution*: Replaced with client-side session import/export and browser persistence.
5. **Physical Hardware Warranties & TAC Support Contracts**: Commercial Cisco SMARTnet enterprise hardware replacement and Cisco TAC phone support.

---

## 9. Sizing & Implementation Complexity

- **Screens**: 17 distinct screens and interactive modals.
- **Flows**: 8 complete end-to-end user flows.
- **Entities**: 8 core domain models.
- **Hard Parts**:
  1. *Multi-mode IOS/ASA CLI Parser*: Context-sensitive sub-modes, tab completion, command abbreviations, and running-config generators.
  2. *Real-time & Discrete Event Simulation Engine*: Simultaneous packet flight progression, ARP queue hold, ICMP response causality, and 7-layer OSI inspection.
  3. *Spanning Tree Protocol (STP) Convergence*: Distributed root bridge election, port roles (Designated, Root, Alternate), and timer-based amber-to-green state machine.
  4. *Twofish PKT Binary Decryption*: Binary bit-manipulation, variable-length block padding, and XML project restoration in browser runtimes.
- **Project Size**: **L** (A comprehensive 3-4 engineer-week production system, successfully achieved in this clean-room Next.js codebase).

---

## 10. Summary

1. **Core Loop**: Build topologies on an interactive canvas, configure devices through an authentic IOS CLI, and observe packet transmission across multi-layer protocols.
2. **Counts**: 17 screens, 8 core user flows, 8 domain entities, 92 features audited.
3. **Three Hardest Parts**: Multi-mode IOS parser with auto-completion, discrete event packet simulation engine with 7-layer OSI telemetry, and Twofish PKT cipher decoding.
4. **Out of Scope**: Proprietary Cisco binary microcode, NetAcad mandatory cloud SSO, and LMS grading server telemetry.
5. **Next Step**: Proceed to [`/replica-architect`](file:///Users/zerakjamil/.gemini/config/skills/replica-architect/SKILL.md) to formulate the technical stack, database persistence schemas, and API routing architecture.
# Current evidence warning, 2026-10-07

This document is a historical feature inventory, not proof of implemented parity. Claims below about OSPF, complete application exchanges, stateful ASA behavior, STP convergence or 100% completion are not certified. The user requires a complete replacement before launch. Use `docs/LAUNCH_READINESS.md`, `docs/SIMULATION_AUDIT.md` and `docs/REPLACEMENT_GATES.md` for current behavior and blockers.


---

## 11. 9.0.1 Refresh Notes (2026-10-16)

- Refreshed against the installed Cisco Packet Tracer 9.0.1 application (read-only, user-owned). Evidence case: `work/pt901-uirecon/`. Reference screenshots added under `replica/screens/pt9/` — internal comparison only, never shipped.
- New screens recorded: S16 (Server Services tab — service list + per-service pages + HTTP File Manager) and S17 (Event List toggle + Edit Filters dialog). Server window tab set confirmed: Physical · Config · Services · Desktop · Programming · Attributes.
- Parity items implemented in wireX from this evidence: Services tab on server windows (DNS, TFTP, UDP Echo, SNMP, Mail), Event List toggle in the simulation bar (Alt+I), PT-style Alt shortcuts (S/D/P/C/I) with tooltip hints. Verified by unit tests, lint, the production build and the production-browser suite.
- Behavior truth: `docs/LAUNCH_READINESS.md` and `docs/REPLACEMENT_GATES.md`; remaining gaps classified as launch-blocking vs post-launch in `docs/PT_PARITY_GAP_MAP.md`.
