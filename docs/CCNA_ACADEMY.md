# CCNA Academy

Status: implemented 2026-10-21. Free, account-free learning layer inside the
wireX Packet Tracer-compatible workspace.

The Academy is not a second simulator and not a learning-management system. It
is a guided reading, retrieval, and live practical-exam layer over the simulator
that already exists. It adds no devices, protocols, services, or grading backend.
Students read a short concept, answer a check, then configure a real topology the
simulator grades from its own state.

## Audience and promise

The primary audience is a first-time networking student and a CCNA2 student who
is short on time before lab or exam day. The promise is deliberately narrow:

> Read it. Wire it. Prove it.

Every core section ends with a check and, where one exists, a link into an
existing guided lab. The exam is weighted toward doing: 14 of its 24 points come
from hands-on checkpoints, and only 10 from multiple-choice theory. The learning
loop is concept → retrieval → real simulator state, not video watching or quiz
farming.

## What is in the layer

| Item | Count | Notes |
| --- | ---: | --- |
| Sections | 52 | 49 core sections plus 3 appendix command-reference sections |
| Chapters | 6 | TCP/IP, Ethernet LANs, basic switch management, VLANs/trunking, redundant LAN design (STP/EtherChannel), and the command appendix |
| Checks | 39 | One or more per core section; immediate explanation and retry |
| Skills exam | 24 points | 10 theory questions + 14 live practical checkpoints; most points come from the simulator |
| Theory round | 10 questions | Random selection from all checks; score, weak-chapter review, and rescue entry |
| Practical exam | 14 tasks | One two-switch, one-router campus: VLANs, access ports, LACP, trunks, router-on-a-stick, STP, and ping |
| Rescue paths | 3 | 45-minute VLANs, 30-minute switch management, 120-minute exam sprint |
| Guided-lab links | 6 lessons | `tcpip` → 1.8, `ethernet` → 2.9, `vlans` → 4.5, `campus` → 3.6, `stp` → 9.3, `channel` → 9.5 |
| Lesson walkthroughs | 7 | Per-device topology, prerequisites, copyable commands, verification, expected output, and common mistakes; exam walkthrough stays hidden in exam mode |

Progress is stored locally under `wirex-academy-v1`: read sections, correct
checks, last section, active rescue path, and best theory score. Practical scores
persist with the existing training progress and are read back into the exam view.
Reset progress is available on the Academy home screen and asks for confirmation.
There is no account, server sync, certificate, or instructor gradebook.

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
- **Spacing and mastery.** The practical exam draws from the whole switching
  sequence, not the current section. Rescue paths are short, ordered
  reread-and-prove plans for the night before a lab.
- **Performance-first assessment.** The exam table shows the point split before
  the student starts: 10 theory, 14 practical. The practical briefing lists all
  14 checkpoints and opens the real simulator. The grader reads VLAN IDs and
  names, access mode, LACP state, trunk membership, dot1Q subinterfaces, STP
  priority, and a successful cross-VLAN ping; it does not trust free-text
  answers.
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

The Academy is one overlay with four views: Learn, Exam, Rescue, and the reader.
It can be opened from:

- the first-visit welcome chooser;
- the `Academy` button in the title bar;
- **Tools → CCNA Academy…** and **Help → CCNA Course & Checks**;
- **Read concept** in the training catalog and the active training panel.

Opening a section from a training lesson preserves the student's workspace. The
lab action closes the Academy first and then starts the existing guided lesson
through `useTrainingStore.start(lesson, 'guided')`. The practical exam uses
`start('exam', 'exam')`; it backs up the current workspace, loads the exam
topology, and restores the workspace when the student exits.

## Using it

1. Open **Learn** and choose a chapter, or continue where you stopped.
2. Read the short section. Use the why/trap callout and the copy buttons for
   commands.
3. Answer the check. Read the explanation even when correct.
4. Mark the section read. The progress ring and chapter counts update.
5. Open the matching lab when one is offered. Use **Exam → Practical** for the
   14-task live exam, or **Exam → Theory** for a 10-question round.
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
| `src/components/academy/AcademyPractice.tsx` | Practical exam briefing/results, 10-question theory round, weak-chapter review |
| `src/components/academy/AcademyRescue.tsx` | Rescue chooser and active checklist |
| `src/components/academy/academy.css` | Scoped light/dark/RTL/responsive design system |
| `src/store/academyStore.ts` | Progress state, validation, persistence, reset |
| `src/components/academy/actions.ts` | Academy-to-training handoff, including the practical exam |
| `src/simulator/trainingLabs.ts` | Guided labs plus the 14-check practical exam topology |
| `src/store/trainingStore.ts` | Live lab grading, exam score persistence, workspace backup |
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

The content builder fails if the source collapses to fewer than 50 sections,
and the course test asserts unique section IDs, so a broken heading structure
cannot ship silently.

## Verification

At the 2026-10-22 checkpoint:

- `npm run check` passes **725/725 unit tests**, including 28 Academy and
  training-guide core tests (8 course-content, 8 markdown, 9 store/persistence,
  3 training-guide; the guide test executes every guide and hint-sheet command block against the CLI
  engine), 5 table-regression tests, 1 practical-exam integration test,
  2 review-packet tests, and 12 pilot-analysis tests.
- ESLint reports **0 errors / 28 existing warnings**.
- The optimized production/TypeScript build passes, the production dependency
  audit reports **0 vulnerabilities**, and `electron:prep` succeeds.
- The targeted production-browser suite `e2e/ccna-academy.spec.ts` passes
  **9/9**:
  1. read a concept, answer a check, mark it read, persist across reload, and
     reset progress;
  2. open from the title bar, search the course, and launch a guided lab;
  3. start the 14-task practical exam, see 14 live tasks in the simulator, and
     return to the exam briefing;
  4. open the matching concept from the training catalog;
  5. complete a 10-question theory round and enter a rescue path;
  6. Arabic chrome with English course content still LTR;
  7. mobile course drawer closes after section selection;
  8. open the full LACP walkthrough, configure both switches through the real
     CLI, and complete the EtherChannel lesson;
  9. configure the exam through the real CLI and move from 13/14 to 14/14
     with a cross-VLAN ping.
- The axe accessibility audit `e2e/academy-a11y.spec.ts` passes **2/2** across
  light-theme home, reader, practical exam, theory round, and rescue plus
  dark-theme home and reader at WCAG 2.1 A/AA, with no serious or critical
  violations. The view
  switcher uses a labelled tabpanel, `aria-controls`, a roving tab stop, and
  direction-aware Left/Right/Home/End keys. Closing the dialog returns focus to
  its opener; selecting a section moves focus to the reader title; and the
  practice result heading receives focus. The light muted text token was
  darkened from `#64767c` to `#5b6d73` to reach AA on the rail.
- Light, dark, RTL, reader, practical exam, theory round, rescue, and mobile
  layouts were reviewed in a real Chromium production build. Converted content
  tables were checked as real Markdown tables in both themes; only topology and
  flow diagrams remain monospace.

The full production-browser suite now passes **87/87**, including these nine
Academy scenarios and the two axe audits. The host-load-sensitive
`simulation-scale` bound `longestTaskMs < 500` passes: the full 87-test run
measured **137 ms**, and the latest targeted run measured **89 ms** (8/8 pings,
queue peak 2,132; full run p95 tick 93.7 ms, engine p95 12.7 ms). The measurement
now waits for the 300-node topology to commit and paint before the realtime
window opens, so the setup render cannot be mistaken for simulation cost. The bound itself is unchanged. The
targeted Academy and axe specs were also run separately against the production
server at `127.0.0.1:3005`.

## Limits and open evidence

These are deliberate boundaries, not hidden gaps:

- **Educational efficacy is not yet validated.** Unit and browser tests prove
  that the reading, checks, navigation, persistence, lab handoff, RTL layout,
  and mobile drawer work. They do not prove that novices learn more. A credible
  pilot needs 5–8 target novices, 2 CCNA instructors, a pre-test, a post-test, a
  delayed transfer task, and blind instructor grading. A comparison condition
  is needed before claiming superiority over simulator-only study; the
  single-group feasibility kit in [`docs/evaluation/`](evaluation/README.md) can
  find fatal problems but cannot establish that stronger claim.
- **Content is English only.** The UI chrome is translated to English, Arabic,
  and Central Kurdish, but the course prose is English. Native-speaker
  proofreading of the Arabic and Central Kurdish UI strings is still required;
  the packet and protocol are in
  [`docs/evaluation/STRINGS_REVIEW.md`](evaluation/STRINGS_REVIEW.md).
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
