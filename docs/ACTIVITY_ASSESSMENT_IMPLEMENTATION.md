# Instructor activity assessment (Activity Wizard), 2026-10-18

wireX now has the acceptance flow of Cisco Packet Tracer's Activity Wizard as a reduced assessment model: an instructor derives graded items from a finished "answer" network, selects a subset, saves a `.wxact.json` activity file, and a student loads it, works on the cleared network, and runs Check Results to grade live state. This is a reduced model, not a full parity claim for every PT assessment-tree type, and not the complete replacement release gate.

## Author workflow

Open the wizard from the toolbar **Activity Wizard** button or **Tools → Activity Wizard...**. The dialog reads the current network as the answer and lists every assessable item grouped per device, with per-device and global **All / None** toggles and an `n / m selected` counter. Fill in **Activity name** (required; others optional): author and a one-step-per-line instructions list.

- **Start Trial** exits any active training lesson, backs up the current lab, and loads the *initial* student network: the same topology as the answer with every selected facet cleared. The wizard closes and a floating chip names the activity with a status dot.
- **Save Activity File...** downloads `<slug>.wxact.json` (slug from the name; a name with no latin characters falls back to `activity`).

## Student workflow

The chip opens the instruction panel: instructions rendered as a numbered list, **Check Results**, **Reset Activity**, **Save Results...** and **Exit Activity**.

- **Check Results** grades the live network against the activity file and shows each item as *Successful* or *Failed* with the expected value and the observed value, plus `passed / total (percent%)`.
- **Reset Activity** is a two-step confirm (the armed state disarms itself after 4 s) and re-derives the initial network from the activity, discarding checks.
- **Save Results...** downloads `<slug>-results.json` (activity identity, score and per-item status with expected/observed values).
- **Exit Activity** discards the session and restores the lab that was open before the trial started. The autosave and share-link snapshots store that pre-activity backup while a session is active (and omit the physical layout, whose device ids do not match the saved backup), so a reload mid-activity restores both the session and the original lab.

## Assessed facets (v1)

| Kind | Devices | Collected when | Compared |
| --- | --- | --- | --- |
| `vlan` | switch | VLAN table entry, excluding the pristine `VLAN 1 / default` seed | id + name |
| `port-l2` | switch physical ports | access port not on VLAN 1, trunk port, or any port with a voice VLAN | mode, access VLAN, trunk allowed list, native VLAN, voice VLAN |
| `port-ip` | router and switch ports (incl. SVIs, dot1q subinterfaces; GRE excluded) | port has IP + mask | IP + mask |
| `port-admin` | router physical ports and SVIs | answer has `adminStatus up` + IP and no dot1q tag | `up` / `down` |
| `route` | any device | `type 'S'` entry in the routing table | network + mask + next hop |
| `routing-protocol` | any device | one item per protocol (RIP/OSPF/EIGRP/BGP) that is configured | snapshot: RIP version + networks; OSPF process id + network/wildcard/area; EIGRP AS + network/wildcard; BGP AS + neighbors + networks |
| `ip-routing` | switch | `ip routing` enabled | enabled / disabled |
| `ipv4-address` | hosts (PC, laptop, server, printer, tablet, smartphone, TV, phone) | static address (all host facets are skipped when `dhcpEnabled`) | IP + mask |
| `default-gateway` | hosts, and switches without `ip routing` | gateway set | gateway |
| `dns-server` | hosts | DNS server set | DNS server |

Trunk allowed-VLAN semantics: `undefined` means *all* (compared as all), an empty list means *none*, otherwise the sorted lists must match exactly — extra allowed VLANs fail the item.

Not assessed in this reduced model (documented boundaries): ACLs, DHCP pools, HSRP, IPv6, wireless/WLC configuration, OSPF/EIGRP/BGP router-id and passive interfaces, connectivity tests, port shutdown tasks beyond router ports and SVIs, and any *removals* (extras beyond the answer never fail an item; there is no "must not exist" item type).

## File format

`.wxact.json`, `version: 1`:

```json
{
  "version": 1,
  "name": "VLAN and Routing Acceptance",
  "author": "Instructor",
  "instructions": ["Create VLAN 10"],
  "createdAt": "2026-10-18T00:00:00.000Z",
  "items": [{ "id": "switch-1|vlan|10", "deviceId": "switch-1", "label": "VLAN 10", "expected": "name \"Sales\"", "spec": { "kind": "vlan", "vlanId": 10, "name": "Sales" } }],
  "answer": { "devices": [], "links": [], "annotations": [] }
}
```

The parser rejects anything else with a plain-English reason: wrong or missing version, empty name, no items, an item whose `deviceId` is not in the answer, an invalid facet spec, a malformed answer network (duplicate ids, more than 2,000 devices, links whose endpoints do not resolve), oversized arrays and non-object input. The student's initial network is *derived* from the answer at load/trial/reset time, never stored in the file, so the file can be re-derivable after the facet model evolves.

## Scoring

Every selected item has equal weight: `percent = round(passed / total * 100)`, statuses use PT's terms `successful` / `failed`. The counter and results list update on each Check Results; checking again replaces the previous result set.

## Architecture

- `src/simulator/activity.ts` — pure module (no engine/store imports): candidate collection, facet specs, `clearAssessedConfig`, `deriveInitialNetwork`, `evaluateActivityItems`, `scoreActivity`, protocol snapshots/summaries, `serializeActivity` / `parseActivity`, slug/file-name helpers and results-document assembly.
- `src/store/activityStore.ts` — session store (`session`, `error`) with `start`, `loadFromFile`, `check`, `reset`, `exit`, `dismissError`, `resultsJson`, plus `saveActivityToStorage` / `restoreActivityFromStorage` under `wireforge-activity-v1` (32 MB bound for the stored payload). Exposes `window.__wireforgeActivityStore`.
- `src/components/modals/ActivityWizardModal.tsx` — author dialog.
- `src/components/cisco/ActivityWorkspace.tsx` — student chip, instruction panel, results list and the `role="alert"` error box.
- Guards: training and activity are mutually exclusive (`trainingStore.start` exits the activity first; activity entry points exit training first); File → New/Open..., Ctrl+N, the toolbar New button, practice/sample lab loads and exam-revision lab loads all exit an active activity session first; `stripRoutingRuntime` keeps activity answers and backups free of learned routes and routing runtimes.

UI chrome strings are localized (EN/AR/CKB); generated item text, parse errors and status-bar messages stay plain English.

## Evidence

- Unit: `src/simulator/activity.test.ts` (8 tests: candidate derivation and kinds, default-port/DHCP exclusions, trunk allowed semantics, clearing coverage, pass/fail grading with partial fixes, switch ip-routing vs L2 gateway, serialize/parse round-trip and slugging, parser rejections) and `src/store/activityStore.test.ts` (5 tests: trial/clear/check/fix/reset/exit restoration, file load and error surfacing, results export and storage round-trip, autosave storing the pre-activity network, training-starting guard).
- Browser: `e2e/activity.spec.ts` (2 flows: author via toolbar → partial selection → trial → grading → fix to 100% → reset → exit restores the answer; save file → File → New → File → Open Activity... → grade → invalid-file error → exit).
- `npm test` 538/538, `npx tsc --noEmit` clean, lint zero errors (28 pre-existing warnings), `npm run electron:prep` green, full Playwright suite 48/48.

## Remaining boundaries

No password-protected activity files, no submit-to-server or gradebook, no manual item tree editing beyond the derived candidate list, no "must not exist" items, no per-item weighting, and the reduced facet set above. Activity sessions live in browser storage; there is no classroom management around them.
