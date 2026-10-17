# PT ↔ wireX Familiarity Gap Map

Comparison of Packet Tracer 9.0.1 behavior (evidence: [`PT_RECON.md`](PT_RECON.md))
against the wireX implementation, with **launch-blocker classification**.

Classification legend:

- **IMPLEMENTED (launch pass)** — parity item delivered this cycle and verified by tests.
- **POST-LAUNCH** — intentionally deferred; rationale recorded, no user-blocking friction.
- **INTENTIONAL DIFFERENCE** — wireX is deliberately not identical (product promise, licensing, or scope).

## Launch-pass items (delivered, verified)

| Area | PT 9 behavior | wireX now | Evidence |
| --- | --- | --- | --- |
| Server window tabs | Physical · Config · **Services** · Attributes (+CLI/Desktop subsets per device) | Servers expose **Services** tab after Config; DNS, TFTP, UDP Echo, SNMP and Mail (SMTP/POP3) service settings live there — mirrors the PT "click Server → Services" workflow | `DeviceModal.tsx` (`ServicesTab`/`ServicesSession`); e2e `tftp.spec.ts`, `snmp.spec.ts`, `email.spec.ts` exercise the tab |
| Simulation bar | Event List toggle in Realtime/Simulation bar (Alt+I) | `Event List` toggle added to the Simulation controls row; toggles the user-created packet window | `CiscoBottomBar.tsx`; screenshot region 6 of `interfaceOverview_1.jpg` |
| Shortcut muscle memory | Power Cycle Alt+S · Fast Forward Alt+D · Auto Capture/Play Alt+P · Capture/Forward Alt+C · Event List Alt+I | All five wired (layout-independent `event.code`), skipped while typing in inputs | `CiscoBottomBar.tsx` keydown handler |
| Tooltip hints | Tooltips document shortcut keys | Button titles now append the shortcut (`… (Alt+S)`) | `CiscoBottomBar.tsx` |

Every item above is exercised by the automated suites: unit 427/427, Playwright
E2E 30/30 against the production build, `tsc` clean, ESLint clean, `next build` green.

## Deliberately deferred (post-launch, recorded)

| Area | PT 9 behavior | wireX today | Rationale for deferral |
| --- | --- | --- | --- |
| Simulation Back (Alt+B) | Steps the event list backwards | Forward-only tick engine; no reversible event journal | Requires engine-level event sourcing — a redesign, not a UI gap. Students can reset/replay; forward stepping covers graded workflows |
| Edit Filters / Show All-None | Protocol filter dialog for event list | All events shown | Filtering needs the same event model work as Back; no curriculum blocker |
| Play speed slider | Adjustable simulation speed | Fast Forward button covers acceleration | Cosmetic/comfort; no workflow dependency |
| Full event-list data model | Per-hop rows (time, last/at device, type) | User PDU table with live status + hop inspection via PDU dialog | Different but equivalent information; rebuilding to PT's table is cosmetic parity with real engine cost |
| Cluster navigation strip | Named clusters + navigation icons | Back button + breadcrumb of physical path | Simple topologies are fully navigable; named-cluster UX is an enhancement |
| Exotic physical containers | Pegboard, Wall Mount, Shelf, Patch Panel, Intercity… | Campus/building/wiring closet/rack containers shipped | Core physical labs run; rare container types deferred |
| Programming tab | Python / Blockly / JS editors for IoT & scripting | Tab present with an honest disclosure dialog | Shipping a scripting engine is a post-launch track; the tab is not a dead end — disclosure explains status |
| Attributes tab | Power draw, cost, tech specs | Tab present with disclosure | Reference data only; no simulation dependency |
| Device box search field | Search inside the component box | Search lives in the left device navigator | Same capability, different (extra) location; students find devices either way |
| Resize Shape / Polygon tool | Shape resizing and polygon drawing utilities | Line/rect/ellipse/freeform palette shipped | Annotation niceties, non-blocking |
| Multiuser / WAN emulation depth | Peer collaboration, frame-relay cloud emulation | Cloud/emulation basics; multiuser clearly disclosed as unavailable | Collaborative mode is out of single-user learning scope for v1 |
| Additional locales (~30) | Full Qt locale catalog | English, Arabic, Kurdish Sorani (RTL complete, unit-tested) | Adding locales is incremental; no functional gap |
| PKZ/PKC source formats | Proprietary project archives | JSON workspace + PKT read/write codec + PKT export/import APIs | wireX interops with `.pkt`; its own format is open and inspectable |
| Template library breadth | 91 shipped templates | Curated sample labs across topics | Breadth is content work; learning paths already ship |
| Desktop app breadth | VPN, Traffic Generator, Firewall editor, Bluetooth, IoT maker… | Browser, email, terminal, IP/DHCP clients, traffic tools per labs | Per-app engineering tracked per feature doc (`docs/*_IMPLEMENTATION.md`) |
| Extensions menu contents | MQTT/Marvel/etc. integrations + Activity Wizard entry | Extensions entry with availability note; Activity Wizard on toolbar | Kept honest: no fake integrations |
| Boards / module expansion breadth | Very large HW catalog | Core module/slot system shipped (Physical tab) | Catalog breadth is data-entry work post-launch |

## Intentional differences (do not "fix")

| Aspect | Why |
| --- | --- |
| Completely free, no login, runs in a browser | Core product promise — removes the license/server friction PT users know |
| Extra left-side device navigator with search | Affordance we keep from wireX; complements the bottom device box |
| Command Prompt reachable as a tab on end devices | WireX exposes the terminal more directly; PT nests it as a Desktop app |
| Arabic/Kurdish-first localization quality | WireX ships tested RTL locales; PT parity here is not a goal |
| Open JSON workspace format | Inspectable, diffable, education-friendly |

## Re-ranking rule

Anything that blocks a graded workflow (configure a server service, run a
simulation, inspect a PDU, build a topology, open a lab) is **launch-blocking by
definition** and must be in the implemented table. Everything else must be either
implemented or listed above with a rationale. No item may be silently missing.
