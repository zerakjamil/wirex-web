# CCNA Academy evaluation kit

Status: **ready to run; not yet executed.** This directory contains the instruments and procedures for the three external gates that cannot be closed by the implementation team alone:

1. novice learning efficacy;
2. independent instructor content validation;
3. native Arabic / Central Kurdish (Sorani) UI proofreading.

The kit is deliberately separate from the product. It does not claim that the Academy works. It defines what evidence would justify that claim, how to collect it without leaking the answer key, and what results would force a revision instead of a launch.

## Contents

| File | Use |
| --- | --- |
| [`PILOT_PROTOCOL.md`](./PILOT_PROTOCOL.md) | Participant criteria, session schedule, blinding, analysis, success criteria, ethics, and data handling. |
| [`INSTRUMENTS.md`](./INSTRUMENTS.md) | Original 12-item pre/post test, 8-item delayed test, config-recall task, transfer task, rubric, and survey. |
| [`CONTENT_REVIEW.md`](./CONTENT_REVIEW.md) | Two-instructor review protocol for the 46 sections and 33 checks, with severity and sign-off rules. |
| [`STRINGS_REVIEW.md`](./STRINGS_REVIEW.md) | Native AR/CKB proofreading protocol for the Academy UI strings. |
| [`pilot-data-template.csv`](./pilot-data-template.csv) | Empty scoring sheet with one row per anonymous participant. |
| [`generated/academy-checks.csv`](./generated/academy-checks.csv) | All 33 checks with options, answers, explanations, and section IDs for instructor review. |
| [`generated/academy-sections.csv`](./generated/academy-sections.csv) | All 46 sections by chapter for coverage review. |
| [`generated/academy-ui-strings.csv`](./generated/academy-ui-strings.csv) | Academy-related EN/AR/CKB UI strings with source locations for native review. |

Regenerate the three CSV packets after any content or UI-string change:

```bash
npm run review:export
```

Do not hand-edit the generated CSV files. The UI packet currently contains **174 unique keys**: the 117 keys added specifically for the Academy plus shared chrome keys used by the Academy entry points. Review the whole packet; a shared key can still be wrong in context.

## Minimum credible evidence

The Academy may be described as **piloted with target novices** only when all of the following are true:

- 5–8 eligible novices completed the pre-test and the transfer task, and at least 80% completed the delayed check.
- The pre/post gain meets the protocol's learning criterion, with the uncertainty interval reported, not just a favorable mean.
- At least 70% of participants meet the transfer-task threshold, and two instructors grade independently with acceptable agreement.
- The delayed score meets the retention criterion.
- Two CCNA instructors report zero unresolved P0 content errors and accept at least 90% of the checks as technically correct.
- Native reviewers report zero unresolved P0 translation errors and accept at least 95% of the reviewed UI strings.

These are feasibility-pilot criteria, not proof of superiority over Packet Tracer or any other course. A single-group pilot cannot establish causation. If a stronger claim is needed, add a randomized comparison group and a pre-registered analysis; that is a larger study than this kit.

## What not to do

- Do not recruit colleagues who already know the answer key.
- Do not let the person who built the Academy grade the transfer task unblinded.
- Do not replace failed items with easier ones after seeing the results without disclosing the change.
- Do not report only the mean and omit individual failures.
- Do not use course grades, employment, or compensation decisions as leverage for participation.
- Do not commit participant names, recordings, consent forms, or raw workspaces to this repository.

## Current open gates

- No novice participants recruited.
- No independent CCNA instructor reviews completed.
- No native AR/CKB reviewer engaged.
- The instruments are English-only. Translating and validating them for AR/CKB audiences is a separate step; the UI can be reviewed independently.
