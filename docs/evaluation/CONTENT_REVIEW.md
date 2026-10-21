# Instructor content review protocol

Version 1.0 · 2026-10-21

## 1. Why this exists

The Academy's 46 sections and 33 checks were built from an ingested CCNA knowledge base and then corrected for known deck artifacts. That is not the same as independent instructor validation. This review asks two qualified CCNA instructors to check the content for technical correctness, answer/explanation consistency, and misleading simplifications before the Academy makes any teaching claim.

The reviewers are not asked to approve the product's design or the simulator. They are asked to find content errors.

## 2. Materials

- The running Academy at `http://127.0.0.1:3005` (or the deployed URL), with light and dark themes available.
- [`generated/academy-checks.csv`](./generated/academy-checks.csv): all 33 checks with options, answer, explanation, and section ID.
- [`generated/academy-sections.csv`](./generated/academy-sections.csv): all 46 sections by chapter and number.
- A copy of the CCNA 200-301 blueprint and, where needed, Cisco IOS command reference or IEEE 802.1Q documentation.
- This protocol and a sign-off sheet.

Regenerate the CSV files after any content change:

```bash
npm run review:export
```

Do not edit the generated files. Put findings in a separate copy or review sheet.

## 3. Reviewer qualifications and independence

Each reviewer should:

- have at least two years of CCNA teaching experience;
- be current on VLANs, 802.1Q trunks, router-on-a-stick, and IOS verification commands;
- not be the author of the Academy content;
- review independently, without seeing the other reviewer's findings until both are complete.

If a reviewer is also a pilot instructor, they may do both roles, but the content review and the blind transfer grading are separate tasks. Do not let the content author adjudicate disputes alone.

## 4. Procedure

### 4.1 Check review (all 33 checks)

For each row in `academy-checks.csv`:

1. Read the prompt and all four options.
2. Mark the single best answer **before** looking at the supplied answer.
3. Compare with the supplied answer and explanation.
4. Rate:
   - **Technical correctness:** `correct`, `incorrect`, or `unsure`.
   - **Clarity:** 1 (confusing) to 5 (unambiguous).
   - **Distractor quality:** `good` (plausible but clearly wrong to a prepared student), `weak` (obviously wrong or trick wording), or `ambiguous` (more than one defensible answer).
   - **Answer/explanation consistency:** `consistent`, `partly`, or `inconsistent`.
   - **Deck-artifact flag:** `yes` if the item repeats a known slide/deck error (for example, invalid `channel-group 1 mode ac`, `/27` described as 12 hosts, a subnet starting at `.127`, or “blocked” used as an STP role).
5. Write a specific comment for every `incorrect`, `unsure`, or `ambiguous` rating. Quote the text you would change.

Do not mark an item “correct” only because the answer letter matches the key. The explanation must support the answer without contradicting it.

### 4.2 Section review (all 46 if possible; at minimum the 20 sections mapped to checks and labs)

For each section:

- Check factual claims, command syntax, and cause/effect statements.
- Check that prerequisites are introduced before they are used.
- Flag a simplification only when it would create a misconception that the checks or labs do not later correct.
- Flag any claim that the simulator cannot actually demonstrate, or clearly label it as conceptual.
- Check that Cisco-specific text is paraphrased, not copied verbatim, and that no Cisco logo or artwork is used.
- Check that tables, code blocks, arrows, and superscripts render correctly in the reader.

Record findings by section ID. A finding should include the quoted sentence, why it is wrong or misleading, and a proposed correction.

### 4.3 Simulator alignment

For sections that link to a guided lab, confirm that:

- the lab exists and opens from the Academy;
- the commands and concepts in the section match what the lab asks the student to do;
- the section does not promise a feature the lab or simulator does not support.

Do not grade the lab's visual design here. That is a separate interface review.

## 5. Severity

| Severity | Meaning | Examples | Required action |
| --- | --- | --- | --- |
| **P0 — Critical** | Wrong answer, unsafe or fundamentally false claim, or an explanation that teaches the opposite of the correct behavior. | A check keyed to the wrong option; “a /27 has 12 usable hosts”; “a trunk carries only one VLAN.” | Fix before launch. Re-review the fix. |
| **P1 — Major** | Misleading simplification, missing prerequisite, ambiguous item with more than one defensible answer, or a command that would fail on the stated platform. | “DTP is required for all trunks”; a check that asks for a role STP does not have. | Fix or explicitly accept with a written rationale. Re-review. |
| **P2 — Minor** | Clarity, terminology, typo, formatting, or a weak distractor that does not change the correct answer. | Inconsistent “switchport” spacing; a distractor that is too obviously wrong. | Fix in the next content pass; may ship if documented. |

When in doubt between P0 and P1, use P0. It is cheaper to re-review a correct item than to ship a wrong one.

## 6. Acceptance criteria

The content gate passes only when:

- two instructors independently rate **at least 90% of the 33 checks** as technically correct;
- there are **zero unresolved P0 findings**;
- every P1 finding is either fixed and re-reviewed, or explicitly accepted with a written rationale and a visible learner-facing caveat where appropriate;
- answer/explanation inconsistencies are zero for the checks that are rated correct;
- the reviewers confirm that the sections they reviewed do not contain verbatim Cisco copyrighted text or Cisco branding.

If the 90% threshold fails, do not average across reviewers. List the failing items and fix them, then run a second review on the changed items and a random sample of unchanged items.

## 7. Disagreement and adjudication

1. Both reviewers complete their sheets independently.
2. Compare only after both sheets are complete.
3. For each disagreement, discuss the evidence (blueprint, command reference, RFC/IEEE, simulator behavior).
4. If the reviewers still disagree, add a third qualified reviewer or mark the item `unresolved` and keep it out of the launch claim.
5. Record the final disposition and the reason. Do not silently overwrite the original ratings.

## 8. Sign-off sheet

| Field | Reviewer A | Reviewer B |
| --- | --- | --- |
| Name |  |  |
| Role / institution |  |  |
| Years teaching CCNA |  |  |
| Date started |  |  |
| Date completed |  |  |
| Checks reviewed (of 33) |  |  |
| Checks rated correct |  |  |
| P0 findings |  |  |
| P1 findings |  |  |
| P2 findings |  |  |
| Sections reviewed (of 46) |  |  |
| Verbatim Cisco text found? |  |  |
| Cisco branding found? |  |  |
| Recommendation |  |  |

Attach the completed check sheet and section findings. Do not put reviewer personal data in the public repository; store the sign-off in the access-controlled pilot folder and publish only the aggregate result.

## 9. What this review does not prove

- It does not prove that novices learn better; that is the pilot protocol.
- It does not validate the simulator's fidelity against real hardware.
- It does not replace native-language proofreading.
- It does not validate every one of the 46 sections if the reviewer only samples 20. Record the coverage honestly.
- It does not make the content immune to error. It reduces the chance that a wrong check ships.

## 10. Data handling

- Keep reviewer names and contact details out of the public repo.
- Publish aggregate counts, anonymized findings, and resolution status.
- If a finding includes a participant's work, remove names and identifiers.
- Retain the original review sheets until the next content release, then archive or destroy according to the institution's policy.
