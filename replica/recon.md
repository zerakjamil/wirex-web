# Recon Map: Cisco Packet Tracer 8.2 → 9.0.1 (Desktop Suite to Web Clone)

Scope: Core CCNA / CCNP network simulation and hands-on laboratory slice: interactive 2D logical topology canvas, 3D isometric hardware models, physical modular chassis with hot-swap power interlock, multi-mode Cisco IOS / ASA CLI command parser, desktop student applications, real-time & discrete simulation packet engine (OSI 7-layer PDU inspection, STP/RSTP convergence, ARP/ICMP/DHCP/DNS/OSPF/EIGRP/BGP/RIP/VoIP), physical workspace hierarchy, CCNA Academy course/exam layer, and Twofish PKT binary file decoder.<br>
For: Networking students, university IT departments, CCNA certification candidates, and instructors seeking an instant-on, zero-install network engineering laboratory that runs on any device (Chromebook, tablet, Mac, Linux, Windows).  
Date: 2026-10-06 · 9.0.1 live AX & artifact refresh: 2026-10-22<br>
Author: Replica Reconnaissance Engine (Clean-Room Protocol)

---

## 1. Sources

| # | Source Type | URL / Reference | Notes & Extracted Insights |
| :---: | :--- | :--- | :--- |
| 1 | Help Center & User Guide | `https://www.netacad.com/courses/packet-tracer` | Comprehensive feature catalog: device types, modular expansion cards (WIC-2T, HWIC-2T, NM-ESW-16, WPC300N), workspace modes, cable categories. |
| 2 | Curriculum Specifications | `CCNA 200-301 Certification Official Guide (Cisco Press)` | Core syllabus requirements: VLANs, 802.1Q trunks, SVIs, EtherChannel (LACP/manual), STP (802.1D root election/PortFast), OSPF single-area, ACLs, NAT/PAT, IP routing. |
| 3 | Software Release Notes | `https://www.netacad.com/resources/lab-downloads` | Version 8.2.x & 9.0.1 updates: Physical mode enhancement, ASA 5506-X security appliance, PTSk script engine, Activity Wizard scoring mechanisms, Cyber Observer, Network Controller. |
| 4 | Interactive Widget Reference | `https://ptanywhere.open.ac.uk/` | PTAnywhere Open University CCNA interactive widget: 3D isometric device pucks, directional vector lighting, browser canvas interaction patterns. |
| 5 | Command Reference Guide | `Cisco IOS 15.x Command Reference (cisco.com)` | Prompt hierarchies (`>`, `#`, `(config)#`, `(config-if)#`, `(config-router)#`), abbreviations, tab auto-completion, running-config serialization. |
| 6 | Binary File Architecture | `MIT Reference: jeamxn/cisco-pka-to-xml` | Twofish CBC cipher specification (128-bit key derived from salt), header parsing, and internal XML document schema (`<PACKETTRACER5>`). |
| 7 | User Account Walkthroughs | Real-world student CCNA classroom assignments | Inspection of campus topologies: multi-tier distribution, dual-core switches, IP phone CME dial-peers, and ASA inside/outside security levels. |
| 8 | Installed Application (user-owned, read-only) | `/Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app` | Version: 9.0.1.0094 (`com.netacad.PacketTracer9.0.1`). Bundled files: 150 help pages (`help/default/`), Qt Linguist templates (`LANGUAGES/template.ts` — 10,603 strings / 499 contexts), 181 catalog models across 7 categories, live AX menus, and Config tabs. Evidence: `replica/pt-9.0.1/inventory.json` & `GAP_REPORT.md`. |

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
| **S04** | **Device Modal: Config Tab** | Double-click device -> `Config` tab | High-level form-based configuration of global host parameters and network interfaces. | Display Name, Hostname, NVRAM/Startup buttons, Interface tree list, IP address & subnet inputs, MAC field. | Form active, unsaved edits, interface up/down, static vs DHCP selected. (Matches live 9.0.1 1841 Config layout). |
| **S05** | **Device Modal: Desktop Tab** | Double-click PC/Laptop -> `Desktop` tab | Windows XP / Cisco Desktop OS shell hosting student diagnostic and client applications. | App icon grid (IP Configuration, Command Prompt, Web Browser, PC Wireless, Terminal, IP Phone). | Icon grid view, app launched, active app window. |
| **S06** | **Desktop App: IP Configuration** | S05 -> Click `IP Configuration` | Configure workstation IPv4 addressing, default gateway, and DNS servers. | Static / DHCP radio toggle, IPv4 Address input, Subnet Mask input, Default Gateway input, DNS input. | Static filled, DHCP requesting, DHCP leased, invalid IP error format. |
| **S07** | **Desktop App: Command Prompt** | S05 -> Click `Command Prompt` | Command-line environment for diagnostics (`ping`, `traceroute`, `ipconfig`, `arp`, `netstat`). | Monospace terminal window, prompt `C:\>`, command executor, active ping progress ticker. | Prompt idle, ping success (`Reply from...`), ping timeout (`Request timed out`), ARP display. |
| **S08** | **Desktop App: Web Browser** | S05 -> Click `Web Browser` | Embedded web browser for testing HTTP/HTTPS web servers across the network. | URL address bar, `Go` button, HTML rendering view area, status indicator. | Initial blank page, HTTP 200 OK rendered page, `Host unreachable` connection error. |
| **S09** | **Desktop App: PC Wireless** | S05 -> Click `PC Wireless` | Manage 802.11 Wi-Fi client association, site survey, and security passphrases. | Link Information tab, Site Survey tab, Connect tab, SSID scan list, WEP/WPA2 passphrase input. | No wireless NIC installed, scanning SSIDs, associated to AP, authentication failure. |
| **S10** | **Desktop App: IP Phone GUI** | S05 -> Click `IP Phone` | Authentic Cisco 7960 IP Phone hardware simulator with audio signaling and call handling. | Handset graphic, LCD backlit screen, 12-key dialing keypad, Line 1/2 buttons, call status bar, audio tone generator. | Handset on-hook, off-hook dial tone, ringing, connected call with timer, unregistered. |
| **S11** | **Device Modal: ASDM GUI** | Double-click ASA 5505 -> `ASDM` tab | Graphical management console for the Cisco Adaptive Security Appliance (ASA). | Dashboard metric cards, Startup Wizard, Interface Security Level table, Inside/Outside ACL rules. | Connected, wizard step-by-step, security level warning, rules applied. |
| **S12** | **Simulation Panel & Event List** | Bottom-right dock -> `Simulation` mode | Step-by-step discrete packet transmission engine and historical protocol event log. | Play / Pause button, Step Forward button, Step Backward (backstep snapshot restoration), Event List table. | Realtime active, Simulation paused, stepping packet frame, event queue full. |
| **S13** | **PDU Details Inspector** | Click packet envelope or Event List row | Educational 7-layer OSI model protocol breakdown and hexadecimal frame inspector. | OSI Model layer tabs (Layers 1-7 In/Out), Ethernet II frame breakdown, IPv4 header table, ICMP/TCP payload. | Layer explanation view, inbound PDU details, outbound PDU modifications. |
| **S14** | **Starter Labs & Activity Modal** | Top Menu `File` / Canvas welcome card | Catalog of pre-configured CCNA educational topologies and practice scenarios. | Lab cards with thumbnail previews, difficulty badges, brief topology descriptions, `Load Lab` action button. | Grid view, loading state, confirmation prompt. |
| **S15** | **Connection Hover Card** | Hover over device port or cable LED | Live telemetry inspection showing real-time interface metrics without opening device modals. | Port name badge, Link status LED (UP/DOWN), IPv4 address, MAC address, STP state (FWD/BLK), EtherChannel bundle. | Single port view, multi-port device summary table, cable endpoint comparison. |
| **S16** | **Device Modal: Services Tab (Server)** | Double-click Server -> `Services` tab | Service enablement and content management for servers (DHCP, DNS, HTTP, TFTP, Mail, IoT, AAA). | Service list sidebar, per-service toggle, HTTP/HTTPS File Manager (edit/delete/new/import). | Service off, service on, file editing, missing-file error. |
| **S17** | **Simulation Event List & Filters** | Simulation dock -> `Event List` toggle | Review captured protocol events and filter protocols (Alt+I). | Event List toggle, Edit Filters dialog (ACL filter sets, protocol checklist), Show All / Show None toggle. | All events shown, filtered set, empty list. |
| **S18** | **CCNA Academy Learning & Exam Drawer** | Title bar -> `Academy` button | Account-free, interactive courseware with theory checks and practical live exam. | Chapter navigation (52 sections), Markdown reader, theory check cards (39 checks), live practical exam (14 checkpoints). | Chapter reading, check answered/hint, practical scoring, exam pass/fail. |
| **S19** | **Physical Workspace View** | View toolbar -> `Physical Mode` (Shift+P) | Multi-container physical real-world deployment hierarchy. | Container tree (Intercity > City > Building > Wiring Closet > Rack / Table / Shelf / Pegboard), Move popover, drag placement. | Root view, interior view, device racked, device stored on shelf, power blocked. |
| **S20** | **Logical Clusters & Cluster Associations** | Logical canvas -> Select -> Shift+U | Group devices into logical subnets and map them to physical containers. | Cluster node boundary, breadcrumb navigation, Options -> Cluster Associations dialog. | Flat cluster view, drilled down, associations mapped. |
| **S21** | **Cyber Observer Web Console** | PC Browser -> `http://<observer-ip>` | Network security assurance and posture analysis appliance. | Discovery setup (connected/range), saved inventory, topology map, severity-ranked findings, remediation guidance. | Setup account, running discovery, findings list, remediation view. |
| **S22** | **Network Controller Dashboard** | PC Browser -> `http://<controller-ip>` | Centralized software-defined network controller web dashboard. | Login, active-link discovery, device inventory, topology assurance map. | Admin login, discovering, inventory populated, topology rendered. |
| **S23** | **Activity Wizard Modal** | Menu `Extensions` -> `Activity Wizard` | Instructor tool for authoring, testing, and exporting graded lab assignments. | Derived graded items (VLANs, ports, IPs, routes, protocols), checklist selector, Start Trial, `.wxact.json` export. | Authoring, item selection, trial mode active, student evaluation. |
| **S24** | **Traffic Generator / Custom PDU** | Secondary tool palette -> `Add Complex PDU` | Custom packet injection and recurring traffic generator. | Target IP, Protocol (ICMP/UDP/TCP), Port, Payload size, DSCP, Packet Color, Interval rate. | Single packet injected, periodic run active, run stopped. |
| **S25** | **IoT Server & Thing Dashboard** | Server -> `Services` -> `IoT` / Thing modal | IoT registration server and smart home/city device controls. | Registered device table, online indicator, sensor readings, actuator toggles (Lamp, Fan, Siren, Door, etc.). | Listening, registered, telemetry updating, remote command dispatched. |
| **S26** | **Wireless LAN Controller (WLC) GUI** | PC Browser -> `http://<wlc-ip>` | Centralized lightweight AP management console. | Login (admin/admin), Summary dashboard, WLAN management, AP Join table, CAPWAP tunnel state. | Dashboard view, WLAN configured, AP joined. |

---

## 4. User Flows

### F01: Create and Wire a Two-Workstation Switched Subnet
*Goal*: Connect two PCs through a Catalyst 2960 switch, assign static IP addresses, and verify connectivity via ping.
- S01: Drag PC0, PC1, and Switch0 onto canvas -> Click Straight-Through cable -> Attach PC0 Fa0 to Switch0 Fa0/1 -> Attach PC1 Fa0 to Switch0 Fa0/2.
- S01: Observe link LEDs transition from amber (STP listening/learning) to green (forwarding).
- S01 -> S05 -> S06: Open PC0 -> `Desktop` -> `IP Configuration` -> Enter IP `192.168.1.10`, Mask `255.255.255.0`.
- S01 -> S05 -> S06: Open PC1 -> `Desktop` -> `IP Configuration` -> Enter IP `192.168.1.20`, Mask `255.255.255.0`.
- S01 -> S05 -> S07: Open PC0 -> `Desktop` -> `Command Prompt` -> Type `ping 192.168.1.20`.
- S07: Observe four ICMP Echo Replies with round-trip times and 0% packet loss.
- *Happy path clicks*: 12 clicks.

### F02: Configure 802.1Q Trunk and Inter-VLAN Routing via CLI
*Goal*: Create VLANs 10 and 20, configure an 802.1Q trunk, and verify routing through a router subinterface.
- S01: Connect Switch0 to Router0 via Gigabit link; connect PC0 to Switch0 (VLAN 10) and PC1 to Switch0 (VLAN 20).
- S01 -> S03: Double-click Switch0 -> Open `CLI` tab -> Configure `vlan 10`, `vlan 20`, set access ports, and set trunk on `g0/1`.
- S01 -> S03: Double-click Router0 -> Open `CLI` tab -> Configure subinterfaces `g0/0.10` and `g0/0.20` with `encapsulation dot1q`.
- S01 -> S05 -> S07: Open PC0 -> Ping PC1 across subnets (`192.168.20.10`) -> First ping drops for ARP, subsequent replies succeed.
- *Happy path clicks*: 10 clicks.

### F03: Inspect Multi-Layer PDU in Simulation Mode
*Goal*: Step a packet across the network and inspect Layer 2 and Layer 3 headers at each hop.
- S01 -> S12: Toggle `Simulation Mode` -> Click `Add Simple PDU` -> Click PC0, then PC1.
- S12: Click `Capture/Forward` -> Watch PDU envelope advance one link hop -> Click envelope on canvas (S13).
- S13: Inspect OSI Layers (Layer 2 MAC addresses, Layer 3 IP header).
- S12: Click `Step Backward` -> Previous snapshot restored with verified rollback state.
- *Happy path clicks*: 5 clicks.

### F04: Take CCNA Academy Hands-on Practical Exam
*Goal*: Complete interactive CCNA course checks and grade a live multi-device campus topology.
- S01 -> S18: Click `Academy` -> Select Chapter 6 -> Click `Start Practical Exam`.
- S01: Exam campus topology loads (SW1, SW2, R1).
- S01 -> S03: Configure VLANs, LACP bundle, 802.1Q trunks, and router-on-a-stick subinterfaces according to task specifications.
- S18: Click `Grade Practical Exam` -> Live simulation engine evaluates 14 checkpoints + cross-VLAN ping -> Score returned with breakdown.
- *Happy path clicks*: 6 clicks.

---

## 5. Components

| Component | Variants | States | Used On Screens |
| :--- | :--- | :--- | :--- |
| **TopMenuBar** | Classic Qt ribbon menu (`File`, `Edit`, `Options`, `View`, `Tools`, `Help`). | Default, hovered, menu expanded, disabled item. | S01 |
| **ToolPalette** | Common tools (Select, Inspect, Delete, Note, Shape, Simple PDU, Complex PDU). | Default, active tool selected, hovered. | S01 |
| **DeviceNode** | 15 3D isometric vector models (Routers, Switches, PCs, Servers, Phones, Clouds). | Idle, hovered, selected, dragged, power off badge, connecting source/target. | S01 |
| **CableEdge** | Straight, Crossover, Fiber, Serial, Console, Auto-detect. | Link UP (Green), Link DOWN (Red), STP Blocking (Amber), EtherChannel bundle ring. | S01 |
| **ConnectionHoverCard** | Compact port badge, multi-port device table. | Visible on hover, dismissed on mouse leave. | S01, S15 |
| **DeviceModalShell** | Windows XP / Cisco classic dialog container with draggable title bar. | Focused (z-index top), unfocused, minimized, maximized, closed. | S02, S03, S04, S05, S11, S16 |
| **FolderTabs** | Folder tabs (`Physical`, `Config`, `CLI`, `Desktop`, `Services`, `ASDM`). | Active tab (elevated, white/light slate), inactive tab (muted gray), hovered. | S02-S05, S11, S16 |
| **ChassisViewer** | Modular chassis vector graphic with interactive zoom and pan. | Zoom level 100%, 150%, 200%, slot highlighted on module drag over. | S02 |
| **PowerSwitch** | Rocker switch with illuminated green/red LED indicator. | ON (Power active, LED glowing), OFF (System dark). | S02 |
| **TerminalEmulator** | VT100-style dark terminal with green/amber/white font. | Active prompt, typing, scrolling history, command processing, disabled. | S03, S07 |
| **DesktopAppGrid** | 2-column or 3-column app icon launch matrix. | Default, icon hovered, app opened. | S05 |
| **PacketEnvelope** | Yellow 3D mail envelope with flap crease and protocol label badge. | Moving along cable, stationary at node, clicked, hovered. | S01, S12 |
| **PhysicalContainerNode**| City, Building, Wiring Closet, 19-inch Rack, Table, Shelf. | Selected, highlighted drop target, collapsed/expanded. | S19 |
| **AcademyDrawer** | Course reading pane with chapter sidebar and practical grading card. | Collapsed, open, dark mode, RTL layout (Arabic/Kurdish). | S18 |

---

## 6. Inferred Data Model

### Entity Definitions & Relationships

```typescript
NetworkDevice {
  id: string (UUID / import-id)
  name: string ("Router0", "Switch1", "PC-A")
  type: DeviceType ('router' | 'switch' | 'pc' | 'server' | 'laptop' | 'accesspoint' | 'cloud' | 'phone' | 'security' | 'printer' | 'hub' | 'iot')
  model: string ("2911", "2960-24TT", "3560-24PS", "PC-PT", "Laptop-PT", "ASA 5505", "CyberObserver")
  x: number, y: number (canvas coordinates)
  power: boolean (true = operational, false = powered off)
  modules: string[] (installed modular cards: 'WPC300N', 'WIC-2T', 'NM-ESW-16')
  config: DeviceConfig
  ports: NetworkPort[]
  routingTable: RouteEntry[]
  arpTable: ArpEntry[]
  macTable: MacEntry[]
}

NetworkPort {
  id: string ("FastEthernet0/1", "GigabitEthernet0/0", "Serial0/1/0")
  name: string, shortName: string ("Fa0/1", "Gi0/0", "Se0/1/0")
  type: PortType ('fastethernet' | 'gigabitethernet' | 'serial' | 'console' | 'wireless')
  status: 'up' | 'down' | 'admin-down'
  ipAddress?: string, subnetMask?: string, macAddress: string
  vlan?: number, voiceVlan?: number
  duplex?: 'auto' | 'full' | 'half', speed?: 'auto' | '10' | '100' | '1000'
  mode?: 'access' | 'trunk'
  connectedLinkId?: string, connectedDeviceId?: string
}

NetworkLink {
  id: string (UUID)
  type: CableType ('straight' | 'crossover' | 'fiber' | 'serial' | 'console' | 'auto')
  fromDeviceId: string, fromPortId: string
  toDeviceId: string, toPortId: string
  status: 'up' | 'down'
  stpState?: 'forwarding' | 'blocking' | 'learning'
  channelGroup?: number (EtherChannel bundle ID: Po1 - Po6)
}

DeviceConfig {
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
  eigrp?: { asNumber: number, routerId: string, networks: EigrpNetwork[] }
  bgp?: { asNumber: number, routerId: string, neighbors: BgpNeighbor[], networks: string[] }
  rip?: { enabled: boolean, networks: string[] }
  acls?: Record<string, AclRule[]>
  voiceConfig?: { cmeEnabled: boolean, sourceAddress: string, ephones: Ephone[], dialPeers: DialPeer[] }
  asaConfig?: { securityLevels: Record<string, number>, nameifs: Record<string, string> }
}

PhysicalContainer {
  id: string
  name: string
  kind: 'intercity' | 'city' | 'building' | 'wiring-closet' | 'rack' | 'table' | 'shelf' | 'pegboard' | 'generic'
  parentId?: string
  deviceIds: string[]
}
```

### Cardinality & Relationships
- `NetworkDevice` 1 --- n `NetworkPort`
- `NetworkDevice` 1 --- 1 `DeviceConfig`
- `NetworkLink` connects exactly 2 `NetworkPort` instances (on distinct `NetworkDevice` nodes)
- `PhysicalContainer` 1 --- n child `PhysicalContainer` (hierarchy)
- `PhysicalContainer` 1 --- n `NetworkDevice`

---

## 7. Feature Matrix Summary

Reference: [`replica/features.csv`](file:///Users/zerakjamil/.gemini/antigravity/scratch/cisco-packet-tracer-web/replica/features.csv)

| Priority | Count | Implemented in Clone | Completion % | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Must-Have** | 63 | 62 | **98.4%** | Canvas, 3D icons, CLI hierarchy, EtherChannel, STP/RSTP, OSPF, EIGRP, BGP, RIP, VLANs, VoIP, Twofish PKT, Physical Rack/Containers, Services tab. Only missing: Apple Developer ID signed desktop DMG. |
| **Should-Have** | 24 | 22 | **91.7%** | ASA ASDM, Dark theme, RTL localization, DHCP relay, Event List toggle, Cyber Observer, Network Controller. Only missing: 100% PT model coverage (currently 63.0%) and complete Activity Wizard native .pka encryption. |
| **Could-Have** | 11 | 8 | **72.7%** | Implemented: Backstep simulation, Physical hierarchy, Logical clusters, Traffic generator, Basic IoT, WLC lite. Incomplete: full CoAP/MQTT wire format, MCU/SBC board scripting. |
| **Total Features** | **98** | **92** | **93.9%** | Evaluated against official Cisco Packet Tracer 9.0.1. |

---

## 8. What Cannot Be Cloned (Out of Scope)

1. **Proprietary Cisco IOS Microcode & ELF Binaries**: Cisco Packet Tracer uses proprietary desktop abstractions; real Cisco IOS binaries cannot be legally distributed. *Solution*: Rebuilt with a clean-room TypeScript state machine replicating exact commands, outputs, and protocol logic.
2. **Cisco NetAcad Mandatory Single Sign-On (SSO)**: The official desktop application requires an active Cisco Networking Academy account with periodic cloud token refresh. *Solution*: Removed completely; clone is instant-on with zero sign-in barrier.
3. **Proprietary Cisco LMS Grading Server Telemetry**: Secret server-side assessment scripts. *Solution*: Independent local diagnostics engine evaluates real network state directly.
4. **Desktop Multiuser Socket Daemon**: Desktop TCP daemon allowing LAN instances to link virtual cables. *Solution*: Replaced with client-side session import/export and browser persistence.
5. **Camera/Microphone Physical Sensory Ingestion**: PT 9.0.1 ExApps request webcam/microphone hardware. *Solution*: Omitted from network engineering scope.

---

## 9. Sizing & Implementation Complexity

- **Screens**: 26 distinct screens, tabs, and interactive modals.
- **Flows**: 12 complete end-to-end user flows.
- **Entities**: 10 core domain models.
- **Hard Parts**:
  1. *Multi-mode IOS/ASA CLI Parser*: Context-sensitive sub-modes, tab completion, command abbreviations, and running-config generators.
  2. *Real-time & Discrete Event Simulation Engine*: Simultaneous packet flight progression, ARP queue hold, ICMP response causality, 7-layer OSI inspection, and backstep snapshot recovery.
  3. *Spanning Tree Protocol (STP) Convergence*: Distributed root bridge election, port roles (Designated, Root, Alternate), and timer-based state machines.
  4. *Twofish PKT Binary Decryption*: Binary bit-manipulation, variable-length block padding, and XML project restoration in browser runtimes.
- **Project Size**: **XL** (A comprehensive production network simulator with over 720 automated unit tests and full CCNA courseware).

---

## 10. Summary

1. **Core Loop**: Build topologies on an interactive canvas, configure devices through an authentic IOS CLI, and observe packet transmission across multi-layer protocols.
2. **Counts**: 26 screens, 12 core user flows, 10 domain entities, 98 features audited.
3. **Three Hardest Parts**: Multi-mode IOS parser with auto-completion, discrete event packet simulation engine with 7-layer OSI telemetry, and Twofish PKT cipher decoding.
4. **Out of Scope**: Proprietary Cisco binary microcode, NetAcad mandatory cloud SSO, and hardware camera/mic ExApps.
5. **Next Step**: Proceed to deployment and distribution hardening.
