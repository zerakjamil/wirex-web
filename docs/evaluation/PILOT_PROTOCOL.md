# CCNA Academy novice pilot protocol

Version 1.0 · 2026-10-21 · wireX

## 1. Purpose

This is a feasibility pilot, not a confirmatory trial. It answers four practical questions:

- **RQ1 — Learning:** do target novices improve from pre-test to post-test after using the Academy?
- **RQ2 — Transfer:** can they build and troubleshoot a small VLAN/trunk/inter-VLAN network they have not seen before?
- **RQ3 — Retention:** do they still remember the core concepts 7–10 days later?
- **RQ4 — Usability:** where do they get stuck, what misconceptions remain, and is the interface usable without a guide?

A separate instructor review answers a fifth question: are the Academy's 52 sections and 39 checks technically correct and clear? See [`CONTENT_REVIEW.md`](./CONTENT_REVIEW.md).

## 2. Design

Single-group, pre/post/delayed feasibility design:

```
screener → consent → pre-test → Academy study → transfer task → survey
                                                              ↓
                                                delayed test 7–10 days later
```

There is no control group. Pre/post gains may include testing effects, motivation, or ordinary instruction. The transfer task and delayed check reduce, but do not eliminate, that ambiguity. Do not describe the result as “proven better than Packet Tracer.”

## 3. Participants

### Novices (target 5–8)

Include a participant only if all are true:

- age 18 or older;
- comfortable reading English technical material (the course content is English);
- has completed no more than roughly four weeks of introductory networking instruction;
- has **not** previously configured VLANs, 802.1Q trunks, or router-on-a-stick;
- has not seen the Academy checks, this protocol, or the test items;
- volunteers and signs the consent form.

Exclude anyone who has professionally configured Cisco or equivalent enterprise switching, teaches networking, or has already used the Academy.

“Last-minute CCNA2” students are eligible if they meet the prior-configuration criterion. Record their course status, but do not use course grades as an outcome.

### Instructors (2)

Each instructor should have at least two years of CCNA teaching experience and current familiarity with VLANs, trunks, and inter-VLAN routing. They must not be the person who wrote the Academy content. They review independently.

### Sample-size honesty

Five to eight participants cannot support precise population estimates. Report every participant, the paired differences, and a bootstrap interval. Do not report a p-value as if the study were powered. The purpose is to find fatal usability or learning problems before a larger study.

## 4. Session schedule

### Session 1 — 120 minutes

| Minutes | Activity | Notes |
| --- | --- | --- |
| 0–10 | Welcome, consent, anonymous ID | Collect consent separately; do not put names in the data file. |
| 10–25 | Pre-test (12 items) | Closed book, no Academy. Shuffle item order per participant if practical. |
| 25–30 | Orientation | Show how to open the Academy and the lab workspace. Do not teach the content. |
| 30–70 | Academy study | Participant chooses sections; the optional 14-task practical exam is available, but not required. Observer records blockers and time without prompting. |
| 70–75 | Break | |
| 75–110 | Transfer task | 35 minutes. Follow the task in `INSTRUMENTS.md`. Inject the fault at the specified point. |
| 110–120 | Survey and short interview | Survey first; then 5-minute open-ended questions. |

If a participant finishes early, do not fill the time with hints. Record the time and let them stop.

### Delayed check — 20–25 minutes, 7–10 days later

| Minutes | Activity |
| --- | --- |
| 0–12 | Delayed test (8 items) |
| 12–17 | Configuration-recall task (5 commands) |
| 17–25 | Short interview and data check |

### Instructor review — 90 minutes per instructor

Independent review of the 39 checks and a sample of sections, using [`CONTENT_REVIEW.md`](./CONTENT_REVIEW.md). Allow up to two hours if the reviewer reads every section.

## 5. Measures

### Primary learning measure

12-item concept test, 0–12, same form before and after. The items are in [`INSTRUMENTS.md`](./INSTRUMENTS.md). Score with the answer key; a second person re-scores a random 25% to catch keying errors.

### Transfer measure

20-point build-and-troubleshoot task, scored blind by two instructors with the rubric in `INSTRUMENTS.md`. The task is novel: it is not one of the Academy's guided labs. Participants may use the Academy during the task only if the protocol says so. For the primary transfer score, **do not** allow Academy access during the task; the point is transfer, not look-up.

### Retention measure

8-item delayed test (0–8) plus a 5-point configuration-recall checklist. Report them separately; do not blend them into the post-test score.

### Usability and process measures

- 6-item post-session survey (1–5) plus open-ended questions.
- Observer notes: time to first meaningful action, blockers, questions asked, whether the participant found the course rail, search, theory round, practical exam, rescue, and lab launch.
- Optional practical-exam result: score (0–14), time, and which checkpoints were still failing. Report descriptively; it is part of the intervention, so it is not the primary transfer endpoint.
- Optional think-aloud for 2–3 participants, with separate consent for audio/screen recording.
- Optional Academy progress export: ask the participant to open the browser console and copy `localStorage.getItem('wirex-academy-v1')` only if they consent. The record contains section/check IDs, not names. If this is awkward, rely on observation instead.

### Instructor content review

See `CONTENT_REVIEW.md`. Report the number of checks rated correct by both instructors, all P0/P1 findings, and the resolution status.

## 6. Blinding and scoring

- Assign each participant a random ID such as `P-7F3A`. The ID is the only identifier in the data file.
- The pre/post tests are multiple choice; score them from the answer key. The scorer may see the ID but not the participant's name.
- For the transfer task, export the workspace and rename the file to the anonymous ID. Remove names from device hostnames if the participant used them.
- Two instructors grade each workspace independently. They may run `show` commands and inspect configs in wireX. They must not see pre/post scores, survey responses, or each other's scores.
- Record both scores. If they differ by more than 2 points, a third reviewer or a consensus discussion resolves the discrepancy. Report exact agreement and within-2 agreement.
- Do not let the Academy author adjudicate alone.

## 7. Analysis plan

### Descriptive first

For each participant, report:

- pre-test, post-test, gain;
- transfer score (rater A, rater B, consensus);
- delayed test and config recall;
- survey mean;
- completion status and any protocol deviation.

Report means, medians, standard deviations (or ranges), and individual values. With n≤8, individual values matter more than a single mean.

### Paired gain

Compute `d_i = post_i - pre_i`. Report the mean gain and a 95% bootstrap percentile interval (10,000 resamples). A simple Python snippet:

```python
import numpy as np
gains = np.array([...])  # one value per participant
rng = np.random.default_rng(20261021)
means = [rng.choice(gains, size=len(gains), replace=True).mean() for _ in range(10_000)]
print(gains.mean(), np.percentile(means, [2.5, 97.5]))
```

Also report a paired Cohen's dz for descriptives, but do not treat it as a population effect size. If the interval is wide, say so.

### Transfer and retention

- Transfer: mean/median, number and percentage at or above 14/20, and the list of critical errors.
- Rater agreement: exact agreement, within-2 agreement, and mean absolute difference. If a third rater is used, report the adjudicated score separately.
- Retention: delayed mean and the ratio `delayed mean / post mean`. Also report the number at or above 6/8 and 4/5 on the recall task.

### Qualitative

Transcribe observer notes and interviews. Code into: navigation blockers, terminology confusion, misconceptions, simulator friction, translation/layout issues, and “would use again.” Report representative quotes with the anonymous ID. Do not turn a single quote into a quantitative claim.

### Missing data

Report who missed the delayed check and why. Do not impute the primary outcome. If a participant withdraws, report the available data only with consent.

## 8. Success criteria

Treat these as go/no-go for a **pilot claim**, not for shipping the product. The product can ship while the pilot is pending, but the marketing claim “students learn faster” cannot.

| Area | Criterion |
| --- | --- |
| Feasibility | ≥80% of enrolled novices complete Session 1 and the delayed check; median setup time ≤10 minutes; no unresolved P0 blocker. |
| Learning | Mean pre/post gain ≥3.0 of 12; bootstrap 95% interval lower bound >0; ≥75% of participants gain ≥2 points. |
| Transfer | ≥70% score ≥14/20; median ≥15/20; no more than 25% commit a critical error (no trunk, wrong VLAN on all access ports, duplicate address, or unrecovered fault). |
| Retention | Delayed mean ≥70% of the post-test mean; ≥60% score ≥6/8; ≥60% score ≥4/5 on config recall. |
| Content | Two instructors independently rate ≥90% of the 39 checks technically correct; zero unresolved P0 errors; all P1 errors resolved or explicitly accepted with a written rationale. |
| Usability | Mean ≥4.0/5 on “I could find what I needed”; no participant abandons the transfer task because of the interface rather than the networking content. |
| Native strings | Zero unresolved P0 translation errors; ≥95% of reviewed strings accepted or needing only minor edits; terminology decisions recorded. |

If a criterion fails, do not average it away. Revise the Academy or the instrument and say what changed. A failed pilot is useful evidence; a hidden failure is not.

## 9. Ethics and data handling

- Use an information sheet and consent form approved by the relevant institution. If this is not institution-affiliated, use a plain-language consent form and follow local requirements.
- Participation is voluntary. Participants may stop at any time and may withdraw their data before analysis.
- Do not collect names, student IDs, grades, or employer information in the pilot data file.
- Recordings are optional and stored separately from scores, encrypted at rest. Delete raw recordings after transcription or within 12 months, whichever is sooner.
- Keep consent forms and the linkage key in a separate access-controlled location, not in this repository.
- Do not publish small-cell results that could identify a participant. With n=5–8, report aggregate results and anonymous illustrative quotes.
- Disclose that the Academy is a study aid, not a Cisco certification product, and that the pilot is run by the project team.

## 10. Limitations to state in the report

- No control group; gains may reflect testing, motivation, or concurrent instruction.
- Small convenience sample; no population inference.
- Same-form pre/post test may overstate gain through item memory.
- The transfer task is newly written and not independently validated.
- The instruments are English-only; AR/CKB learners may perform differently.
- Simulator fidelity is not Packet Tracer; a transfer task in wireX measures wireX performance, not real-device dexterity.
- The author and raters may share blind spots; independent instructor review reduces but does not remove them.
- A single site and a short delay limit generalization.

## 11. Artifacts to keep

- Completed consent forms (separate, access-controlled).
- Anonymous score sheet (`pilot-data-template.csv` or equivalent).
- Transfer workspace exports named by anonymous ID.
- Two independent rater sheets.
- Observer notes and interview transcripts.
- Analysis script and output.
- A short report with the protocol version, deviations, all individual scores, criteria, and limitations.

Do not publish the answer key alongside recruitment material. Keep it in a separate file available only to the scorer.
