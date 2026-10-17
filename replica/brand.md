# WireForge: Brand Identity and Clean-Room Specification

Date: 2026-10-06  
Workspace: `/Users/zerakjamil/.gemini/antigravity/scratch/cisco-packet-tracer-web`  
Previous Identity: Cisco Packet Tracer (Proprietary Desktop Suite)  
New Independent Identity: **WireForge** (Browser-Native Network Engineering Lab)  
Config File: `replica/brand.json`  
Tokens File: `replica/design/tokens.json`

---

## 1. The Name

### The Positioning Angle
A zero-install, browser-native network simulation and CCNA training lab. Students and engineers design topologies, wire physical hardware, inspect multi-layer packet headers, and execute authentic network operating system commands on any device (Chromebook, iPad, Linux, Mac, Windows) without downloading 500MB desktop installers or navigating corporate LMS barriers.

### 20 Candidate Names across 5 Styles

1. **Descriptive**:
   - `WireTopology`: Plain description of topology wiring; sounds like an academic manual.
   - `PacketGrid`: Clear networking reference; slightly generic.
   - `NetCanvas`: Emphasizes drawing canvas, but misses hands-on engineering feel.
   - `LabRouter`: Too narrow, implies router-only configuration.

2. **Compound**:
   - `WireForge`: **(Top Pick)** Evokes building, shaping, and crafting network infrastructure with hands-on precision.
   - `NetLoom`: Weaving complex networks together; poetic, memorable, and distinct.
   - `SwitchCraft`: Evokes switching and craftsmanship, but easily confused with gaming/Minecraft mods.
   - `TraceCraft`: Focuses on packet tracing and engineering craft; punchy and technical.

3. **Invented**:
   - `Topovio`: Modern phonetic contraction of "topology" with a smooth fluid suffix.
   - `Zytrek`: High-tech sounding, but conveys zero contextual meaning about networks.
   - `Nexora`: Sounds like a pharmaceutical or generic SaaS brand.
   - `Telvy`: Short and friendly, but ambiguous category fit.

4. **Metaphor**:
   - `Beacon`: Signal transmission metaphor, but heavily contested across analytics and IoT brands.
   - `Loom`: Interconnected threads, but conflicts with the video recording tool Loom.
   - `Prism`: Refracting packets, but saturated across enterprise security suites.
   - `GridPulse`: Living heartbeat of connected nodes and real-time packet flow.

5. **Verb**:
   - `Trace`: Direct action, but clashes with Linux `traceroute` command and distributed tracing APM tools.
   - `Wire`: Punchy, but too broad and difficult to trademark as a standalone mark.
   - `Route`: Core networking action, but generic dictionary word with high collision risk.
   - `Relay`: Communications verb, frequently used in email delivery and GraphQL services.

---

### Cut to Top 5 Candidates

We applied three statutory trademark and positioning filters:
1. **Not confusingly similar to the original** in sound, look, or meaning (no "PacketTracer-like", no "Cisco-twin", no "PT-something").
2. **Short, memorable, spellable on first hearing**, free of awkward meanings in major world languages.
3. **Reinforces the angle** (active network building, topology exploration, hands-on packet laboratory).

The top 5 finalists:
1. **WireForge** (Selected Winner) -- Active creation of network topologies, robust, industrial, engineering-focused.
2. **NetLoom** -- Elegant metaphor of weaving networks, distinct from traditional IT software names.
3. **Topovio** -- Modern invented name anchored in "topology", clean global trademark profile.
4. **TraceCraft** -- Combines packet tracing with artisan network design.
5. **GridPulse** -- Real-time packet telemetry and responsive simulation.

---

## 2. Screening Checks Matrix

Audit Date: 2026-10-06.  
*Note: These are screening checks, not formal legal clearance. A trademark attorney should conduct an exhaustive search prior to commercial filing.*

| Candidate | US Trademark (USPTO Classes 9/42) | EU Trademark (EUIPO / TMview) | Canada (CIPO) | Global (WIPO) | Domain Status | App Stores (iOS / Play) | Handles (GitHub, X) | Web Category Search |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **WireForge** *(Winner)* | Clear in network simulation / EdTech (Screened 2026-10-06) | No conflicting network sim marks (Screened 2026-10-06) | Clear in Class 9 software (Screened 2026-10-06) | Clear in network education (Screened 2026-10-06) | `wireforge.dev` to register; `wireforge.app` to register | No networking lab apps under WireForge | `@wireforgeapp` available | Zero competing network topology tools |
| **NetLoom** | Screened: textile marks exist, Class 42 network tools clear | Screened: No conflicting simulation marks | Clear in Class 9 | Clear in Class 9/42 | `netloom.dev` to register | Clear in App Store search | `@netloom_app` available | No network simulator match |
| **Topovio** | Clear in Class 9 and Class 42 (Screened 2026-10-06) | Clear across EU member offices | Clear | Clear | `topovio.com` to register; `topovio.dev` available | Clear in both stores | `@topovio` available on GitHub and X | No category collisions |
| **TraceCraft** | Screened: Software dev logging marks exist, network sim clear | Clear in EUIPO | Clear in CIPO | Clear in WIPO | `tracecraft.dev` to register | Clear in Education category | `@tracecraft_lab` available | Occasional developer blog references |
| **GridPulse** | Screened: Energy grid monitoring marks exist in Class 9/42 | Energy sector marks active; risk of conflict | Energy utility marks active | Energy sector conflicts | `gridpulse.dev` to register | Utility meter apps exist | Mixed availability |

**Selection**: **WireForge** provides the strongest brand resonance, engineering credibility, and clear regulatory separation from the original software.

---

## 3. Design Palette & Tokens

### Palette Strategy
The original desktop suite relies on proprietary Cisco Cyan (`#00bceb`), dark navy (`#002c3d`), and flat 1990s desktop grey. WireForge adopts an independent, high-contrast palette:
- **Primary Brand Accent**: Electric Indigo (`#4338ca`), evoking deep computing architecture and modern developer tooling.
- **Background & Canvas**: Pure Neutral (`#ffffff` light, `#0b0f19` obsidian dark canvas).
- **Surface Elevation**: Subtle cool slate (`#f8fafc`).
- **Telemetry Indicators**: High-contrast Cyber Emerald (`#047857`) for link UP / STP forwarding, Amber (`#d97706`) for STP learning/blocked, and Crimson (`#b91c1c`) for link DOWN.

### Token Roles & Values (`replica/design/tokens.json`)

| Token Role | Hex Code | Purpose & Semantic Role |
| :--- | :--- | :--- |
| `bg` | `#ffffff` | Primary background, light canvas, document surface |
| `surface` | `#f8fafc` | Card background, side panels, toolbars, modal containers |
| `border` | `#e2e8f0` | Dividers, panel borders, subtle container outlines |
| `border-input` | `#64748b` | Form input borders, focus outlines (passes UI 3.0:1) |
| `text` | `#0f172a` | Primary headings, body copy, terminal active headers |
| `text-muted` | `#475569` | Secondary captions, interface labels, port indices |
| `accent` | `#4338ca` | Primary brand actions, selected nodes, active tabs |
| `on-accent` | `#ffffff` | High-contrast text on accent buttons and badges |
| `danger` | `#b91c1c` | Error alerts, port down states, delete triggers |
| `success` | `#047857` | Link operational state, packet delivery success |

### Contrast Verification (`contrast.py`)
Executed via `python3 /Users/zerakjamil/.agents/skills/replica-design/contrast.py replica/design/tokens.json`:
- `text` on `bg`: **17.85:1** (AAA Pass)
- `text` on `surface`: **17.06:1** (AAA Pass)
- `text-muted` on `bg`: **7.58:1** (AAA Pass)
- `text-muted` on `surface`: **7.24:1** (AAA Pass)
- `on-accent` on `accent`: **7.90:1** (AAA Pass)
- `accent` on `bg`: **7.90:1** (AAA Pass)
- `danger` on `bg`: **6.47:1** (AA Pass)
- `success` on `bg`: **5.48:1** (AA Pass)
- `border-input` on `bg`: **4.76:1** (UI Pass > 3.0:1)

**Result**: 9 pairs checked, **0 failing AA**.

---

## 4. Logo Design Brief

### The Core Concept
*One line*: A geometric anvil fusing into interconnected circuit nodes, symbolizing the active forging of network topologies.

### Mark Type
Combination mark: An abstract geometric emblem paired with a clean, modern sans-serif wordmark (**WireForge**).

### Technical Specifications
- **Scalability**:
  - **16x16 px Favicon**: Crisp silhouette with two angled circuit traces meeting at an energized diamond intersection. Recognizable at single-digit point sizes in browser tabs.
  - **1024x1024 px App Icon**: Full-resolution isometric emblem with subtle depth bevel, set against a dark obsidian gradient (`#0f172a` to `#1e1b4b`) with zero transparency (App Store compliant).
- **Deliverables**:
  - `wireforge-logo.svg` (Scalable vector with both dark and light lockups)
  - `wireforge-icon-1024.png` (1024x1024 solid background app icon)
  - `favicon.ico` and `favicon.svg` (Multi-size vector and 16/32/48 ICO)
  - `og-image.png` (1200x630 OpenGraph preview card for social sharing)

### Complete Distinction from Original
- **Original Mark**: Cisco bridge arches (nine vertical blue bars representing the Golden Gate Bridge).
- **WireForge Mark**: Angled 45-degree geometric polygon forming a stylized "W" whose vertices are network topology nodes linked by bus lines. No vertical arch bars, no cyan gradients, no bridge motifs.

---

## 5. Brand Voice & Copywriting

### Voice Pillars (3 Attributes)
1. **Precise** (without being pedantic): We speak in accurate networking terminology (frames, packets, subnets, convergence, trunking) without patronizing jargon or academic stuffiness.
2. **Empowering** (without hand-waving): We build confidence in students and engineers by showing real packet causality and working CLI environments, never hiding the real mechanisms behind magic buttons.
3. **Grounded** (without corporate bloat): We write clean, direct instructions. No marketing hyperbole ("revolutionary", "next-gen"), no corporate NetAcad boilerplate.

### 5 Do and Don't Pairs

| Do | Don't |
| :--- | :--- |
| **Do**: "Drop a switch on the canvas and wire your first subnet." | **Don't**: "Welcome to the premier Cisco Networking Academy Packet Tracer experience." |
| **Do**: "FastEthernet 0/1 is down: check cable seating and duplex." | **Don't**: "An error has occurred in the Packet Tracer engine." |
| **Do**: "Export topology as .wf.json or import standard .pkt files." | **Don't**: "Cisco proprietary PKT save format generated." |
| **Do**: "Run real-time packet inspection to observe ARP resolution." | **Don't**: "Click the simulation mail button to see Packet Tracer magic." |
| **Do**: "Terminal connected. Enter configuration commands below." | **Don't**: "Cisco IOS Command Line Interface (CLI) session started." |

### 10 Core User-Facing Strings Rewritten

| # | Context / Location | Original Cloned String | WireForge Rewritten String |
| :---: | :--- | :--- | :--- |
| 1 | **Application Title** | "Web Cisco Packet Tracer" | "WireForge -- Interactive Network Topology Lab" |
| 2 | **Top Navigation Brand** | "Cisco Packet Tracer Web" | "WireForge Web" |
| 3 | **Window Title Bar** | "Cisco Packet Tracer \| Unsaved Project" | "WireForge \| Network Topology Lab" |
| 4 | **Logical Canvas Header** | "Cisco Packet Tracer Logical Workspace" | "WireForge Logical Workspace" |
| 5 | **About Dialog** | "Packet Tracer Web, an independent browser network simulator with a Cisco-style student workspace." | "WireForge is an independent, zero-install network simulation environment designed for students and network engineers." |
| 6 | **Help Modal Header** | "Packet Tracer Web Help" | "WireForge Lab Guides & Documentation" |
| 7 | **Empty Canvas Callout** | "Drag devices from the bottom tray to begin building your Cisco Packet Tracer network." | "Drag routers, switches, and workstations from the bottom shelf to forge your network." |
| 8 | **Device Modal Tabs** | "Cisco Packet Tracer Classic Folder Tabs" | "Hardware Configuration Tabs" |
| 9 | **Default Web Server** | "&lt;h1&gt;Cisco Packet Tracer Web Server&lt;/h1&gt;" | "&lt;h1&gt;WireForge Web Server&lt;/h1&gt;&lt;p&gt;HTTP/1.1 200 OK -- Service Operational&lt;/p&gt;" |
| 10 | **Topology Export File** | "cisco-lab-1696543210.pkt.json" | "wireforge-lab-1696543210.wf.json" |

---

## 6. Clean-Room Brand Sweep Audit

- Tool: `python3 /Users/zerakjamil/.gemini/config/skills/replica-brand/sweep.py . --config replica/brand.json`
- Avoid Rules: `["Cisco Packet Tracer", "Packet Tracer", "NetAcad"]`
- Prohibited Domains: `["cisco.com", "netacad.com"]`
- Prohibited Legacy Colors: `["#00bceb", "#049fd9", "#005073", "#002c3d"]`
- Target Codebase: All production application code, components, stores, styles, dialogs, and tests.

Update 2026-10-16: the shipped application surface (src, public, launch artifacts) sweeps clean; remaining hits are confined to internal reconnaissance and engineering documents by design. Next: final listing review, then launch.
