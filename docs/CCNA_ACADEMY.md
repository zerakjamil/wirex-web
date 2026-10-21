# CCNA Academy

Status: implemented 2026-10-21. Free, account-free learning layer inside the
wireX Packet Tracer-compatible workspace.

The Academy is not a second simulator and not a learning-management system. It
is a guided reading, retrieval, and rescue layer over the simulator that already
exists. It adds no devices, protocols, services, or grading backend. Students
read a short concept, answer a check, then open a real guided lab and configure
the same topology the simulator evaluates.

## Audience and promise

The primary audience is a first-time networking student and a CCNA2 student who
is short on time before lab or exam day. The promise is deliberately narrow:

> Read it. Wire it. Prove it.

Every core section ends with a check and, where one exists, a link into an
existing guided lab. The learning loop is concept → retrieval → real simulator
state, not video watching or quiz farming.

## What is in the layer

| Item | Count | Notes |
| --- | ---: | --- |
| Sections | 46 | 43 core sections plus 3 appendix command-reference sections |
| Chapters | 5 | TCP/IP, Ethernet LANs, basic switch management, VLANs/trunking, and the command appendix |
| Checks | 33 | One or more per core section; immediate explanation and retry |
| Practice round | 10 questions | Random selection from all checks; score, weak-chapter review, and rescue entry |
| Rescue paths | 3 | 45-minute VLANs, 30-minute switch management, 120-minute exam sprint |
| Guided-lab links | 4 lessons | `tcpip` → 1.8, `ethernet` → 2.9, `vlans` → 4.5, `campus` → 3.6 |

Progress is stored locally under `wirex-academy-v1`: read sections, correct
checks, last section, active rescue path, and best practice score. Reset progress
is available on the Academy home screen and asks for confirmation. There is no
account, server sync, certificate, or instructor gradebook.

## Learning design

The content was organized with backward design rather than by copying slide
order:

- **Backward design.** The target performances are the CCNA 200-301 objectives
  and the CCNA2 labs: explain a packet's path, read a switching table, configure
  VLANs and trunks, verify a lab, and diagnose a broken topology. Sections and
  checks serve those performances.
- **Task and prerequisite analysis.** The chapter order follows dependencies:
  addressing and encapsulation before Ethernet, Ethernet before switching and
  VLANs, and commands last as a reference rather than as the entry point.
- **Cognitive load control.** Sections are short, use one idea per heading, and
  put command syntax in copyable code blocks. The reader exposes a why/trap
  callout where a common misconception needs to be confronted.
- **Retrieval and feedback.** Every core section has a check with an immediate
  explanation. Wrong answers can be retried; correct checks are recorded.
- **Worked examples with fading.** The reader shows the concept and command
  pattern, the check removes the pattern, and the lab asks the student to
  produce and verify it in the simulator.
- **Spacing and mastery.** Practice draws from the whole course, not the current
  section. Rescue paths are short, ordered reread-and-prove plans for the night
  before a lab.
- **Accessibility and RTL.** The layer uses a native modal dialog, semantic
  headings, keyboard-operable controls, visible focus, reduced-motion support,
  responsive layouts, and logical CSS properties. Course content stays English
  and explicitly LTR; the UI chrome follows the app locale (English, Arabic, or
  Central Kurdish) and flips to RTL.

The design is not claimed to be proven effective by unit tests. See
[Limits and open evidence](#limits-and-open-evidence).

## Source material and clean-room position

The course is a paraphrase and reorganization of material supplied by the
project owner:

- Cisco CCNA 200-301 Official Cert Guide, Volume 1 (chapters 1, 2, 6, and 8).
- The CCNA2 Labs 1–6 slide decks.
- The supplied chapter PDFs.

The cleaned, section-addressable source is
[`CCNA_NETWORKING_KNOWLEDGE_BASE.md`](CCNA_NETWORKING_KNOWLEDGE_BASE.md).
The generated course data is `src/content/ccnaCourse.generated.ts`.

Clean-room rules applied here:

- No Cisco logos, artwork, screenshots, or slide text are reproduced.
- The Academy has its own palette, typography, icon set, layout, and wording.
- Cisco, Packet Tracer, and CCNA are trademarks of Cisco Systems, Inc. wireX is
  not affiliated with, endorsed by, or sponsored by Cisco.
- The simulator string conventions are paraphrased; the Academy does not present
  itself as Packet Tracer.

The source audit also found errors and ambiguities in the lecture material. The
Academy does not reproduce them:

- `channel-group 1 mode ac` is not a valid EtherChannel mode combination in the
  form presented; mode selection is taught as an on/active or desirable/passive
  pair, with LACP or PAgP named explicitly.
- A `/27` is not 12 usable hosts; the material and checks use 30 usable hosts.
- A `192.168.1.128/26` subnet does not start at `.127`; the network address is
  `.128`.
- "Blocked" is not an STP port role. The Academy distinguishes the blocking
  state from the alternate/backup role and teaches the role/state distinction.

## Where students find it

The Academy is one overlay with four views: Learn, Practice, Rescue, and the
reader. It can be opened from:

- the first-visit welcome chooser;
- the `Academy` button in the title bar;
- **Tools → CCNA Academy…** and **Help → CCNA Course & Checks**;
- **Read concept** in the training catalog and the active training panel.

Opening a section from a training lesson preserves the student's workspace. The
lab action closes the Academy first and then starts the existing guided lesson
through `useTrainingStore.start(lesson, 'guided')`, so the normal workspace
backup and restore rules still apply.

## Using it

1. Open **Learn** and choose a chapter, or continue where you stopped.
2. Read the short section. Use the why/trap callout and the copy buttons for
   commands.
3. Answer the check. Read the explanation even when correct.
4. Mark the section read. The progress ring and chapter counts update.
5. Open the matching lab when one is offered, or use **Practice** for a
   10-question mixed round.
6. If time is short, choose a **Rescue** path. Each path lists the minimum
   sections in order, tracks completion, and links to a guided lab.

The course rail is searchable by section title, chapter, and body text. On
phones the rail becomes a drawer and closes after a section is selected.

## Files

| File | Responsibility |
| --- | --- |
| `docs/CCNA_NETWORKING_KNOWLEDGE_BASE.md` | Cleaned, section-addressable source and attribution |
| `scripts/buildCcnaCourse.mjs` | Builds chapters and sections from the knowledge base |
| `src/content/ccnaCourse.generated.ts` | Generated chapter/section data; do not edit by hand |
| `src/content/ccnaCourse.ts` | Chapter metadata, checks, notes, rescue paths, lesson mapping, search, helpers |
| `src/components/academy/markdown.ts` | Small safe markdown parser and plain-text helpers |
| `src/components/academy/MarkdownView.tsx` | Renderer for headings, lists, tables, quotes, code, and inline formatting |
| `src/components/academy/CcnaAcademy.tsx` | Native dialog shell, tabs, course rail, search, mobile drawer |
| `src/components/academy/AcademyHome.tsx` | Home dashboard, hero, chapter grid, reset |
| `src/components/academy/AcademyReader.tsx` | Reader, checks, lab launch, quick hits, progress |
| `src/components/academy/AcademyPractice.tsx` | Random practice round and weak-chapter review |
| `src/components/academy/AcademyRescue.tsx` | Rescue chooser and active checklist |
| `src/components/academy/academy.css` | Scoped light/dark/RTL/responsive design system |
| `src/store/academyStore.ts` | Progress state, validation, persistence, reset |
| `src/components/academy/actions.ts` | Academy-to-training handoff |
| `src/i18n/messages.ts` | English, Arabic, and Central Kurdish Academy UI strings |

## Regenerating and extending the course

The generated file is not the place to make edits.

1. Edit the section text or commands in
   `docs/CCNA_NETWORKING_KNOWLEDGE_BASE.md`.
2. Run `npm run content:ccna`.
3. Keep section IDs stable. Progress, checks, rescue paths, and lab mappings are
   keyed by those IDs.
4. Add or edit checks, why/trap notes, labels, and rescue paths by hand in
   `src/content/ccnaCourse.ts`.
5. Add new UI strings to `src/i18n/messages.ts` in all three locales. Arabic and
   Central Kurdish values must contain Arabic-script text.
6. Mark every English course-content element `dir="ltr"` inside RTL chrome.
7. Run `npm test`, `npm run lint`, and the targeted Academy E2E suite.

The content builder fails if the source collapses to fewer than 40 sections,
and the course test asserts unique section IDs, so a broken heading structure
cannot ship silently.

## Verification

At the 2026-10-21 checkpoint:

- `npm run check` passes **702/702 unit tests**, including 25 new Academy tests:
  8 course-content tests, 8 markdown tests, and 9 store/persistence tests.
- ESLint reports **0 errors / 28 existing warnings**.
- The optimized production/TypeScript build passes, the production dependency
  audit reports **0 vulnerabilities**, and `electron:prep` succeeds.
- The targeted production-browser suite `e2e/ccna-academy.spec.ts` passes
  **6/6**:
  1. read a concept, answer a check, mark it read, persist across reload, and
     reset progress;
  2. open from the title bar, search the course, and launch a guided lab;
  3. open the matching concept from the training catalog;
  4. complete a 10-question practice round and enter a rescue path;
  5. Arabic chrome with English course content still LTR;
  6. mobile course drawer closes after section selection.
- The axe accessibility audit `e2e/academy-a11y.spec.ts` passes **2/2** across
  light-theme home, reader, practice, and rescue plus dark-theme home and
  reader at WCAG 2.1 A/AA, with no serious or critical violations. The view
  switcher uses a labelled tabpanel, `aria-controls`, a roving tab stop, and
  direction-aware Left/Right/Home/End keys. The light muted text token was
  darkened from `#64767c` to `#5b6d73` to reach AA on the rail.
- Light, dark, RTL, reader, practice, rescue, and mobile layouts were reviewed
  in a real Chromium production build.

The full production-browser suite now passes **84/84**, including these six
Academy scenarios and the two axe audits. The formerly host-load-sensitive `simulation-scale`
`longestTaskMs < 500` bound passes at **416 ms** (8/8 pings, p95 tick 81.4 ms,
engine p95 8.6 ms, queue peak 2,132). Earlier runs measured 916 ms, with a
same-host A/B against `80bfc03` at 692 ms under heavy host load; those were
environment artifacts, and the bound was never weakened. The targeted Academy
spec was also run separately against the production server at
`127.0.0.1:3005`.

## Limits and open evidence

These are deliberate boundaries, not hidden gaps:

- **Educational efficacy is not yet validated.** Unit and browser tests prove
  that the reading, checks, navigation, persistence, lab handoff, RTL layout,
  and mobile drawer work. They do not prove that novices learn more. A credible
  pilot needs 5–8 target novices and 2 CCNA instructors, a pre-test, a
  post-test, a delayed transfer task, blind instructor grading, and a comparison
  against the same students using the simulator alone.
- **Content is English only.** The UI chrome is translated to English, Arabic,
  and Central Kurdish, but the course prose is English. Native-speaker
  proofreading of the Arabic and Central Kurdish UI strings is still required.
- **No LMS and no gradebook.** Progress is local to the browser. There is no
  account, cohort, teacher dashboard, certificate, or server-side reporting.
- **No new simulator surface.** The Academy uses existing lessons, workspace
  backup, engine state, and design tokens. It does not add devices, protocols,
  packet behavior, or a second lab format.
- **No PT interoperability claim.** The Academy does not read or write `.pkt`
  files and does not claim parity with Cisco's courseware.
- **External hardware and lab acceptance remain open.** The Academy cannot
  substitute for real switch, WLC, or IoT hardware; the broader replacement gates
  in [`REPLACEMENT_GATES.md`](REPLACEMENT_GATES.md) still apply.
