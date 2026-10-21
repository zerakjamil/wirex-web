# Pilot analysis plan

Version 1.0 · 2026-10-21

## 1. Status

This is the pre-registered analysis for the single-group novice feasibility pilot in [`PILOT_PROTOCOL.md`](./PILOT_PROTOCOL.md). The thresholds and rules below were fixed before recruitment and before any participant data were collected.

Do not change a threshold after seeing the data. If the plan must change, record it in the [deviations log](#10-deviations-log) with the date, the old rule, the new rule, and the reason. Report both the pre-registered and the changed result.

The plan is executable:

```bash
npm run pilot:analyze -- docs/evaluation/private/pilot-data.csv
```

The command writes `docs/evaluation/private/pilot-report.md` and `pilot-report.json`. `docs/evaluation/private/` is gitignored. Do not commit participant data or these reports.

## 2. Input contract

Start from [`pilot-data-template.csv`](./pilot-data-template.csv). One row is one participant. The required columns are:

| Column | Type | Range / values | Use |
| --- | --- | --- | --- |
| `participant_id` | text | pseudonymous, unique | Audit and joins only; not published |
| `cohort` | text | free text | Describes recruitment group |
| `prior_networking_weeks` | integer | 0–520 | Eligibility and description |
| `prior_vlan_config` | yes/no | yes/no | Eligibility and description |
| `setup_minutes` | number | 0–600 | Feasibility criterion |
| `pre_score_12` | integer | 0–12 | Primary learning measure |
| `post_score_12` | integer | 0–12 | Primary learning measure |
| `gain` | integer | -12–12 | Redundant; the analyzer recomputes and warns on mismatch |
| `transfer_rater_a_20` | number | 0–20 | Inter-rater agreement |
| `transfer_rater_b_20` | number | 0–20 | Inter-rater agreement |
| `transfer_consensus_20` | number | 0–20 | Transfer criterion |
| `transfer_critical_error` | yes/no | yes/no | Transfer criterion |
| `delayed_mcq_8` | integer | 0–8 | Retention |
| `config_recall_5` | integer | 0–5 | Retention |
| `survey_mean_5` | number | 1–5 | Descriptive usability |
| `survey_find_5` | number | 1–5 | Usability criterion (survey item 1) |
| `completed_session` | yes/no | yes/no | Completion |
| `completed_delayed` | yes/no | yes/no | Completion |
| `protocol_deviations` | text | free text | Qualitative audit |
| `notes` | text | free text | Private; not copied into the report |

Validation is strict on types and ranges. The analyzer refuses to write a report if the CSV has errors. A `P-XXXX` placeholder row is rejected on purpose.

`completed_session` and `completed_delayed` are required. A score is used only when its completion flag and score are both present. The analyzer excludes missing values pairwise instead of imputing them.

## 3. Estimands

### 3.1 Primary: paired pre/post gain

For each session completer with both scores, `d_i = post_i - pre_i`.

Report:

- n, pre mean, post mean, mean gain, gain SD, gain median, gain range;
- the percentage with `d_i >= 2`;
- a 95% percentile bootstrap interval for the mean gain (10,000 resamples, seed `20261021`);
- Cohen's dz as a descriptive only (`mean(d) / SD(d)`).

The interval describes uncertainty in this small sample. It is not a population confidence guarantee and it is not a significance test.

### 3.2 Transfer

Use the adjudicated `transfer_consensus_20` for participants with a score. Report n, mean, SD, median, percentage at or above 14/20, percentage at or above 12/20 (descriptive), critical-error count and rate, and unknown critical-error flags.

Inter-rater agreement uses participants with both rater scores: exact agreement, within 1 point, within 2 points, mean absolute difference, and Pearson r. If the two totals differ by more than 2 points, the rubric asks for adjudication; keep both original sheets.

### 3.3 Retention

Use `delayed_mcq_8` for participants with `completed_delayed = yes` and a score. Use `config_recall_5` for session completers with a score.

Report delayed mean, SD, median, range; delayed/post mean ratio; percentage at or above 6/8; recall mean and percentage at or above 4/5.

### 3.4 Feasibility and process

Report enrolled count, session completers, delayed completers, session completion rate, delayed completion rate of enrolled, delayed completion rate of session completers, and setup-time mean/SD/median/range.

### 3.5 Usability

Report `survey_mean_5` and `survey_find_5` descriptively. The usability criterion uses item 1 only: “I could find the section I needed without help.”

Interface abandonment is not reliably inferable from the CSV. Check the observer notes and protocol deviations before declaring the usability criterion met.

### 3.6 Qualitative

Code observer notes and open survey answers into navigation blockers, terminology confusion, misconceptions, simulator friction, translation/layout issues, and “would use again.” Quote with anonymous IDs only. Do not turn one quote into a quantitative claim.

## 4. Decision rules

These are the pre-registered go/no-go rules for a **pilot claim**. They are not a shipping gate and not proof that the Academy causes learning.

| ID | Criterion | Rule | If not estimable |
| --- | --- | --- | --- |
| `sample` | Target sample | 5–8 novices complete Session 1 | `not-met` if fewer than 5 |
| `session-completion` | Session feasibility | ≥80% of enrolled complete Session 1 | `not-met` if no rows |
| `delayed-completion` | Delayed feasibility | ≥80% of enrolled complete the delayed check | `not-met` if no rows |
| `setup` | Setup feasibility | Median setup time ≤10 minutes | `insufficient` if no setup values |
| `learning` | Learning | Mean gain ≥3.0/12, bootstrap 95% interval lower bound >0, and ≥75% gain ≥2 | `insufficient` if fewer than 5 paired scores |
| `transfer` | Transfer | ≥70% score ≥14/20, median ≥15/20, and ≤25% critical errors | `insufficient` if fewer than 5 scores or any critical-error flag is unknown |
| `retention` | Retention | Delayed mean ≥70% of post mean, ≥60% score ≥6/8, and ≥60% recall ≥4/5 | `insufficient` if delayed or recall data are missing |
| `usability` | Usability | Mean ≥4.0 on item 1 and no interface abandonment in the notes | `insufficient` if no item-1 values |
| `content-review` | Content | Two instructors accept ≥90% of checks with zero unresolved P0 findings | `not-assessed` by the CSV |
| `language-review` | Native strings | Zero unresolved P0 translation findings and ≥95% accepted or minor | `not-assessed` by the CSV |
| `p0-blocker` | Blockers | No unresolved P0 blocker remains | `not-assessed` by the CSV |
| `fidelity` | Simulator fidelity | External acceptance checks pass | `not-assessed` by the CSV |

A failed criterion is not averaged away. Report it, describe what changed, and rerun only after the change is documented.

## 5. Missing data and exclusions

- Do not impute the primary outcome.
- Use pairwise available data and report the denominator for every statistic.
- A participant who withdraws is included only with consent and only for the data already collected.
- If `completed_delayed` is not `yes`, a delayed score is excluded and a warning is emitted.
- If a critical-error flag is empty for a participant with a transfer score, the transfer criterion is `insufficient`, not `met`.
- Do not drop a participant because their gain is negative or because they are an outlier. Report the individual value. If an exclusion is justified by a protocol violation, record it in `protocol_deviations` before analysis.

## 6. Inference and multiplicity

This is a single-group feasibility pilot with 5–8 participants. The analysis is descriptive. Do not report p-values, “statistical significance,” or a causal effect.

The bootstrap interval is a resampling description of the observed gains. Cohen's dz is reported for comparability only. The decision rules are fixed; do not search for a favorable subgroup or a favorable threshold after the fact.

If a comparison group is added later, that is a new study with a new pre-registration, randomization or a justified quasi-experimental design, and a larger sample.

## 7. Reproducibility

```bash
# 1. Copy the template into the private folder.
mkdir -p docs/evaluation/private
cp docs/evaluation/pilot-data-template.csv docs/evaluation/private/pilot-data.csv

# 2. Enter one row per participant, then run:
npm run pilot:analyze -- docs/evaluation/private/pilot-data.csv

# 3. Inspect the Markdown report and the JSON audit file.
```

Useful options:

```bash
npm run pilot:analyze -- <csv> \
  --out-md docs/evaluation/private/pilot-report.md \
  --out-json docs/evaluation/private/pilot-report.json \
  --seed 20261021 \
  --resamples 10000
```

The analyzer is tested by `src/content/pilotAnalysis.test.ts`. The tests cover CSV quoting, schema validation, duplicate IDs, range checks, gain mismatch, pairwise exclusion, the bootstrap, inter-rater agreement, every criterion status, and report rendering.

## 8. Privacy

- Participant IDs are pseudonyms. Do not put names, emails, student numbers, or hostnames in the CSV.
- Keep the CSV, reports, rater sheets, and recordings in `docs/evaluation/private/` or another access-controlled location.
- The report intentionally omits raw `notes`.
- Publish only aggregate counts, anonymized findings, and the pre-registered decision table.
- Delete or archive the raw data according to the host institution's policy after the study.

## 9. Limits

- No control group; cannot attribute gains to the Academy rather than practice, the simulator, the instructor, or test familiarity.
- Small convenience sample; wide interval; limited generalizability.
- The instruments are original but not yet validated against an external criterion.
- Instructors are not blinded to the product, though they are blind to condition and to the Academy content review when grading transfer.
- The English-only instruments do not validate learning in Arabic or Sorani.
- The delayed check tests retention of selected concepts, not the whole course.
- A passing pilot supports a cautious claim (“piloted with target novices”); it does not support “students learn faster” or “better than Packet Tracer.”

## 10. Deviations log

Record any change to this plan before analyzing the data.

| Date | Change | Reason | Approved by |
| --- | --- | --- | --- |
|  |  |  |  |

## 11. Version history

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-10-21 | Initial pre-registration aligned with `PILOT_PROTOCOL.md` and the executable analyzer. |
