# wireX

wireX is a free, browser-based network simulation and CCNA learning workspace.
It targets the Cisco Packet Tracer 9.0.1 student workflow — place devices, cable
them, configure IOS-style CLIs, run packets, inspect PDUs, and save or reopen a
workspace — and wraps the simulator in the **CCNA Academy**, a guided reading,
retrieval, and live practical-exam layer for first-time students and last-minute
CCNA2 exam candidates.

wireX is an independent project. It is not affiliated with, endorsed by, or
sponsored by Cisco Systems, Inc. Cisco, Packet Tracer, and CCNA are trademarks of
Cisco Systems, Inc.

## Why students use it

- **Free and account-free.** No license server, login, cohort, or installation
  is required to start a lab in the browser.
- **A real learning loop, not a quiz widget.** The Academy's 52 sections connect
  concepts to 39 checks, a 10-point theory round, and a 14-point practical exam
  that runs on a live two-switch campus. A correct answer is never a substitute
  for a working topology.
- **Built for the night before lab.** Three rescue paths give a 45-, 30-, or
  120-minute route through the highest-yield sections, with progress and a lab
  handoff.
- **Most of the exam is hands-on.** The practical exam is 14 of 24 points. The
  grader reads VLANs, access ports, LACP, trunks, router subinterfaces, STP
  priority, and a real cross-VLAN ping from simulator state.
- **Accessible by default.** Light and dark themes, English/Arabic/Central
  Kurdish UI, RTL layouts, keyboard-operable controls, reduced-motion support,
  and a phone-friendly course drawer.
- **Student work stays put.** Academy progress is stored locally in the browser;
  opening a lab uses the simulator's existing workspace backup and restore path.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The first-visit chooser can open the Academy, load
a practice lab, or start an empty workspace.

For a production preview that serves the optimized standalone build:

```bash
npm run electron:prep
PORT=3005 npm start
```

Then open <http://127.0.0.1:3005>.

## The CCNA Academy

Press **Academy** in the title bar, open **Tools → CCNA Academy…**, use the
welcome chooser, or click **Read concept** beside a training lesson.

The Academy contains:

- 52 sections across six chapters: TCP/IP, Ethernet LANs, basic switch
  management, VLANs/trunking, redundant LAN design (STP and EtherChannel), and an
  IOS command appendix.
- 39 checks with immediate explanations and retry.
- A 24-point skills exam: 10 theory questions plus 14 hands-on checkpoints on a
  two-switch, one-router campus.
- Three time-boxed rescue paths.
- Search across titles, chapters, and body text.
- Links into the existing `tcpip`, `ethernet`, `vlans`, `campus`, `stp`, and
  `channel` guided lessons.
- A per-device walkthrough for every practice lesson: topology, prerequisites, complete
  switch-by-switch commands, verification, and common mistakes. Commands fade
  out of Recall, Troubleshoot, and Exam mode.

The **Exam** view opens on the practical briefing. The 14 checked tasks cover
VLAN creation and names, access ports, an LACP bundle, 802.1Q trunks,
router-on-a-stick subinterfaces, STP root priority, and a cross-VLAN ping. The
simulator opens with the current workspace backed up; **Check my work** grades
the live topology, and **Return to exam briefing** brings the score back into the
Academy. The theory tab is 10 randomized questions. The two scores combine out
of 24.

Course prose is English and explicitly LTR; the surrounding UI follows the app
locale. Progress is stored under `wirex-academy-v1`; practical scores persist with
the existing training progress.

Read the full design, source attribution, file map, and open efficacy evidence in
[`docs/CCNA_ACADEMY.md`](docs/CCNA_ACADEMY.md).

## Simulator scope

The workspace includes the student-facing surfaces needed for CCNA labs:

- Routers, switches, end devices, servers, security appliances, wireless
  controllers/APs, phones, IoT things, and physical workspace containers.
- Ethernet, fiber, serial, console, and wireless links; physical rack/module
  views; power and cable state.
- IOS-style CLI configuration, running-config, verification commands, and
  protocol state.
- Packet forwarding, simulation/backstep, PDU inspection, event filtering, and
  traffic generation.
- VLANs, trunks, STP/Rapid PVST+/MST, EtherChannel, OSPF, EIGRP, BGP, RIP, HSRP,
  GRE, NAT/PAT, ACLs, DHCP, DNS, HTTP, email, IPv6, and the activity-assessment
  workflow.
- Workspace persistence, sample labs, PKT import/export codecs, and a local
  desktop packaging path.

PT 9.0.1 parity is tracked honestly rather than assumed. The delivered items and
the remaining external gates are in
[`docs/PT_PARITY_GAP_MAP.md`](docs/PT_PARITY_GAP_MAP.md) and
[`docs/REPLACEMENT_GATES.md`](docs/REPLACEMENT_GATES.md).

## Project map

| Path | Responsibility |
| --- | --- |
| `src/app` | Next.js App Router shell, layout, and local APIs |
| `src/components/cisco` | Desktop, title/menu bars, workspace and training UI |
| `src/components/academy` | CCNA Academy views, markdown renderer, and scoped CSS |
| `src/simulator` | Engine, devices, protocols, CLI, physical model, training labs |
| `src/store` | Zustand stores, persistence, workspace and Academy state |
| `src/content` | Generated CCNA course data and hand-authored checks/notes |
| `src/i18n` | English, Arabic, and Central Kurdish messages and locale state |
| `e2e` | Production-browser Playwright flows |
| `docs` | Implementation notes, gates, handoff, and source knowledge base |

## Verification

```bash
npm test          # unit tests
npm run lint      # ESLint
npm run check     # unit + lint + production build + production audit
```

Targeted Academy browser flow against a production server:

```bash
npm run electron:prep
PORT=3005 npm start &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3005 \
  npx playwright test e2e/ccna-academy.spec.ts e2e/academy-a11y.spec.ts
```

At the 2026-10-22 checkpoint:

- `npm run check` passes **724/724 unit tests**.
- ESLint reports **0 errors / 28 existing warnings**.
- The optimized production build, TypeScript check, and production dependency
  audit pass with **0 vulnerabilities**.
- The full production-browser suite passes **87/87**, including the targeted
  CCNA Academy scenarios **9/9** and the axe accessibility audit **2/2**.
- The unchanged `simulation-scale` `longestTaskMs < 500` bound measured
  **134 ms** in the full 87-test run (and **142 ms** in the latest targeted run)
  after setup rendering was excluded from the realtime window (8/8 pings, queue
  peak 2,132; full run p95 tick 100.2 ms, engine p95 11.3 ms).

Instructor/educational acceptance, native AR/CKB proofreading, and external
Packet Tracer interoperability remain open. Current evidence and caveats are
recorded in [`docs/HANDOFF.md`](docs/HANDOFF.md) and
[`docs/LAUNCH_READINESS.md`](docs/LAUNCH_READINESS.md).

## Documentation

- [CCNA Academy](docs/CCNA_ACADEMY.md)
- [Academy evaluation kit](docs/evaluation/README.md)
- [CCNA source knowledge base](docs/CCNA_NETWORKING_KNOWLEDGE_BASE.md)
- [PT ↔ wireX gap map](docs/PT_PARITY_GAP_MAP.md)
- [Replacement gates](docs/REPLACEMENT_GATES.md)
- [Launch readiness](docs/LAUNCH_READINESS.md)
- [Handoff log](docs/HANDOFF.md)
- [Cyber Observer implementation](docs/CYBER_OBSERVER_IMPLEMENTATION.md)

## Attribution and notices

The course material is paraphrased and reorganized from the Cisco CCNA 200-301
Official Cert Guide, Volume 1, the CCNA2 Labs 1–6 decks, and supplied chapter
PDFs. No Cisco logos, artwork, screenshots, or slide text are reproduced. See
[`docs/CCNA_ACADEMY.md`](docs/CCNA_ACADEMY.md) for the clean-room position and
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for dependency notices.

## License

The wireX source code and original course material are released under the
[MIT License](LICENSE). Third-party components remain under their respective
licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Cisco, Packet
Tracer, and CCNA are trademarks of Cisco Systems, Inc.; wireX is independent
and is not affiliated with or endorsed by Cisco.
