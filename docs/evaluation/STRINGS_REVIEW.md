# Native Arabic and Central Kurdish UI proofreading

Version 1.0 · 2026-10-21

## 1. Scope

This review covers the **Academy-related UI chrome** in Arabic (`ar`) and Central Kurdish / Sorani (`ckb`): navigation, buttons, labels, empty states, feedback, dialogs, and entry points. It does **not** cover the English course content, which is intentionally English and marked `dir="ltr"` inside the Academy.

The Academy UI currently has English, Arabic, and Central Kurdish values in `src/i18n/messages.ts`. The automated test only checks that the Arabic and Kurdish values contain Arabic-script characters. It cannot tell whether the meaning, tone, or terminology is right. That is this review.

## 2. Reviewers

Engage two reviewers:

- one native Arabic speaker with familiarity with networking terminology;
- one native Central Kurdish (Sorani) speaker with familiarity with networking terminology.

Ideally at least one reviewer has taught or studied CCNA material. A native speaker without networking context can still catch grammar and tone, but may not catch a wrong technical term. Record which type of reviewer completed each language.

Reviewers work independently. Do not let one language's reviewer rewrite the other language by analogy; Arabic and Sorani have different technical conventions.

## 3. Materials

- [`generated/academy-ui-strings.csv`](./generated/academy-ui-strings.csv): key, English source, Arabic, Central Kurdish, and the source files where the key is used. The packet has 174 unique keys: 117 added for the Academy plus shared chrome keys used by its entry points.
- The running Academy in Arabic and Kurdish, light and dark, desktop and mobile widths.
- This protocol and the glossary section below.

Regenerate the CSV after any UI-string change:

```bash
npm run review:export
```

Do not hand-edit the generated CSV. Put verdicts and suggestions in a separate copy.

## 4. Procedure

For each row:

1. Read the English source and the current translation.
2. Mark the translation:
   - **accepted** — correct and natural; no change needed.
   - **minor** — understandable but awkward, inconsistent, or stylistically weak.
   - **major** — ambiguous, grammatically wrong, or likely to confuse a student.
   - **critical** — reverses the meaning, gives a dangerous instruction, or is missing/empty.
3. Write a suggested replacement for every `minor`, `major`, or `critical` row. Keep the same meaning and the same UI function.
4. Note any term that should be added to the glossary or kept in Latin script.
5. Check the rendered screen, not just the CSV:
   - Arabic and Kurdish text direction;
   - punctuation at the end of RTL sentences;
   - mixed English commands or protocol names inside RTL text;
   - truncation in buttons, tabs, rail labels, and dialogs at 390 px and 1440 px;
   - screen-reader labels for icon-only controls;
   - the English course content remains LTR inside the RTL chrome.

Do not change the English source to make a translation easier. If the English is ambiguous, flag it separately; the English is the source of truth for the course.

## 5. What “good” looks like

- A student can predict what a button will do before pressing it.
- Technical terms are consistent across the Academy: the same English term is translated the same way every time, or deliberately kept in Latin script every time.
- Commands, protocol names, and CLI literals remain in Latin script and are not translated.
- The tone is direct and student-facing, not formal government Arabic or literal machine translation.
- The Kurdish is Sorani, written in Arabic script, with consistent orthography. Do not mix Kurmanji or Arabic dialect forms.
- RTL sentences do not end with a Latin question mark or a misplaced parenthesis.
- The text fits the control. If it cannot fit without an unclear abbreviation, propose a shorter phrasing.

## 6. Severity and acceptance

| Severity | Meaning | Required action |
| --- | --- | --- |
| **P0 — Critical** | Reverses meaning, gives a wrong/dangerous instruction, missing text, or a label that makes a control unusable. | Fix before launch; re-review. |
| **P1 — Major** | Ambiguous, grammatically wrong, inconsistent technical term, or likely to mislead. | Fix or explicitly accept with rationale. |
| **P2 — Minor** | Awkward style, punctuation, length, or consistency that does not change meaning. | Fix in the next pass; may ship if documented. |

The language gate passes only when, for each language:

- there are **zero unresolved P0** findings;
- at least **95% of reviewed strings** are accepted or need only minor edits;
- the reviewer signs off on the glossary decisions;
- the RTL screenshots show no clipped controls or reversed bilingual text.

If a language fails, do not ship that language as “reviewed.” It may remain available with an explicit “community translation, not yet proofread” note, or be hidden until fixed.

## 7. Suggested glossary decisions

These are prompts for the reviewer, not mandated translations. Record the final decision for each term.

| English | Guidance | Arabic decision | Sorani decision |
| --- | --- | --- | --- |
| VLAN | Keep `VLAN` in Latin script; do not invent an acronym. |  |  |
| trunk | Keep `trunk` or use the established local networking term consistently. |  |  |
| access port | Translate the concept, but keep `access` if that is how local courses teach it. |  |  |
| native VLAN | Keep `native VLAN` or use a consistent mixed form. |  |  |
| router-on-a-stick | Keep the English idiom or use the local course idiom; do not translate literally if it becomes unclear. |  |  |
| default gateway | Use the term students will see in the CCNA exam and local course. |  |  |
| subnet mask | Use the standard local term. |  |  |
| ping | Keep `ping` in Latin script. |  |  |
| switch / router | Prefer the term used in the local CCNA course; be consistent. |  |  |
| CLI command | Keep the command exactly as typed; never translate it. |  |  |

## 8. Applying accepted changes

1. Apply only accepted suggestions to `src/i18n/messages.ts`. Keep the three-value array shape: `[English, Arabic, Central Kurdish]`.
2. Do not change the English value unless the English source itself was wrong and the change is reviewed separately.
3. Run:

```bash
npm test
npx tsc --noEmit
npm run lint
```

4. Rebuild the production preview with `npm run electron:prep` if you need to inspect it.
5. Capture RTL screenshots at 1440×900 and 390×844, light and dark, for:
   - Academy home;
   - reader with a check;
   - practice result;
   - rescue path;
   - mobile course drawer open and closed.
6. Re-run the Arabic/CKB E2E test and the accessibility suite.
7. Regenerate the CSV packet and record the new review status.

## 9. Sign-off sheet

| Field | Arabic reviewer | Sorani reviewer |
| --- | --- | --- |
| Name |  |  |
| Native language |  |  |
| Networking background |  |  |
| Date started |  |  |
| Date completed |  |  |
| Strings reviewed |  |  |
| Accepted |  |  |
| Minor |  |  |
| Major |  |  |
| Critical |  |  |
| Glossary signed off? |  |  |
| RTL screenshots checked? |  |  |
| Recommendation |  |  |

Do not commit reviewer names or contact details to the public repository. Store the sign-off in the access-controlled pilot folder and publish only aggregate results and anonymized examples.

## 10. What this does not prove

- It does not validate the English course content.
- It does not prove that AR/CKB novices learn better; the pilot instruments are English-only unless separately translated and validated.
- It does not prove that every future string will be translated correctly. Add a review step when new keys are added.
- It does not replace an accessibility audit. Run both.
