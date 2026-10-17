# Traffic Generator desktop app implementation

Scope: PT 9.0.1's **Traffic Generator** desktop application (PC and laptop
Desktop tab) — the replacement-order completeness item selected after the
physical workspace / logical clusters increment. Target inventory: the dialog
layout captured in the installed application's `BaseTrafficGenerator.ui`
(Source Settings / L2 Config / L3 Config / PDU Settings / Simulation Settings
groups, Single Shot · Periodic modes, `Send` / `Stop` / `Test`, the interval and
DSCP messages) and the behavior read from `CTrafficGenerator.cpp` (immediate
first PDU, `Stop`, Ctrl+F4 close), recorded read-only in `work/pt901-uirecon/`
(`evidence/ui_strings.csv`) and summarized in `PT_RECON.md`.

Status: model, store wiring, desktop app dialog, canvas labeling and browser
acceptance landed 2026-10-17.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Model | `src/simulator/trafficGenerator.ts` | Pure module: `TrafficGeneratorApplication = 'icmp' \| 'http' \| 'tftp' \| 'udp' \| 'dns' \| 'ntp'`, `TrafficGeneratorSettings` (application, target, path, fileName, port, data, packetColor, dscp), `TrafficGeneratorRun` (id, deviceId, settings, intervalSeconds, sentCount, startedTick, nextDueTick, lastRequestId), the application catalog and color presets, `defaultTrafficGeneratorSettings`, `parseTrafficGeneratorInterval` (strict decimal, 0.001–1,000,000 s, `interval-invalid` vs `interval-range`), `trafficGeneratorIntervalTicks` (60 ms `SIMULATION_TICK_MS`, floor of one tick), `validateTrafficGeneratorSettings` (per-application target shape, port range, DSCP 0–63, DNS rejects IPv4 literals), `trafficGeneratorPduMatches` and `stampTrafficGeneratorPackets` |
| Store state and actions | `src/store/networkStore.ts` | `trafficGenerators: TrafficGeneratorRun[]`; `startTrafficGenerator` (validate → one run per device, replacing any previous run → immediate first dispatch → `nextDueTick = tick + intervalTicks`), `stopTrafficGenerator`, `sendTrafficGeneratorOnce` (validate → dispatch through the existing application actions → stamp the new frames), `advanceTrafficGenerators` (dispatch every due run once per tick, re-arm `nextDueTick`, drop runs whose device disappeared). Dispatch maps to the existing flows: `sendPing`, `requestHttp`, `requestTftpRead`, `requestUdpEcho`, `requestDns`, `requestNtp` |
| Tick integration | `src/store/networkStore.ts` | `tickSimulation` and `stepSimulation` gained a `hasGeneratorActivity` term in their idle early-return and call `advanceTrafficGenerators()` after their main `set()`, so runs fire in both Realtime and Simulation modes — the same idle-tick failure mode CAPWAP (`hasCapwapActivity`) and IoT (`hasIotActivity`) fixed |
| Packet labeling | `src/types/network.ts`, `src/simulator/trafficGenerator.ts`, `src/components/canvas/CableEdge.tsx`, `src/components/modals/PduDetailsModal.tsx` | `PacketPdu.generatorColor?: string` and `payload.dscp?: number`; stamping correlates frames by the same request id the send actions put on their PDUs (`pingId`, `tcpRequestId`/`httpRequestId`, `dnsRequestId`, `udpRequestId`), including a frame's `pendingPacket`; ARP frames keep the color but hand DSCP to the pending IP packet. The canvas marker/badge body, flap and label take the run color, and the PDU details headers tab shows `TOS / DSCP: 0x…` when set |
| Outgoing-port preview | `src/simulator/engine.ts` | `outgoingRoute` is now exported; the dialog shows the resolved port name or `No route` for the typed target. PT's `Auto Select Port` control is deliberately omitted (read-only preview instead of a selector) |
| Desktop app | `src/components/modals/TrafficGeneratorApp.tsx`, `DeviceModal.tsx` | PC/laptop Desktop gains a **Traffic Generator** card opening a PT-shaped dialog (`pt-traffic-generator`): Source Settings (source device, outgoing-port preview), L2 Config (source MAC, `Resolved by ARP` destination), L3 Config (source IP, destination), PDU Settings (application picker, per-app request path / file name / port and data, packet color swatches with `Automatic`, DSCP input), Simulation Settings (Single Shot · Periodic, interval in seconds, `Test` / `Send` / `Stop` / `Close`, status chip `pt-tg-status`, counter `pt-tg-count`, alerts `pt-tg-error`). String's parse errors and validation error codes map to localized messages in the component — the store never holds English |
| Close shortcut | `TrafficGeneratorApp.tsx` | Ctrl+F4 returns to the Desktop (PT muscle memory), mirroring the recon of `CTrafficGenerator.cpp` |
| Lifecycle | `src/store/networkStore.ts` | Runs are runtime-only: never written to `.wf.json`, `.pkt`, SQLite, share URLs, `SimulationSnapshot` or the training backup. `deleteDevice`, `clearSimulation`, `loadLab` and `resetTopology` purge runs; a run whose device disappears is dropped at the next tick |
| Localization | `src/i18n/messages.ts` | 41 new strings as EN/AR/CKB triples (group titles, application labels, modes, actions, validation messages, the DSCP hint). Status/statusbar simulation messages stay plain English per the existing convention |

## Semantics

- **Test vs Send vs Stop.** `Test` sends exactly one PDU immediately and never
  starts a run. In Single Shot mode `Send` also dispatches one PDU; in Periodic
  mode `Send` starts the run (its first PDU is dispatched immediately, matching
  the reference tool) and the button becomes `Stop`. Stopping removes the run
  but the visible counter keeps its value (the component accumulates the count
  of stopped runs), and in-flight labeled packets finish their journey.
- **One run per device.** Starting a run for a device that already has one
  replaces it, so a device can never accumulate parallel schedules.
- **Tick math.** The simulation step is 60 ms, so a one-second interval equals
  17 ticks and `trafficGeneratorIntervalTicks` floors at one tick — the
  shortest possible cadence is one PDU per tick regardless of how small the
  configured interval is. `advanceTrafficGenerators` dispatches at most one
  PDU per run per tick and re-arms `nextDueTick` from the *current* tick, so a
  throttled tab or a paused Simulation can never produce a burst of catch-up
  sends — the schedule slips instead.
- **Runtime-only state.** Runs reconcile against live devices: deleting the
  source device, clearing the simulation, loading a lab or resetting the
  topology stops every run, and undo snapshots that restore an older topology
  cannot leave a run pointing at a missing device.
- **Honest reductions (recorded, not hidden).** The Outgoing Port field is a
  read-only route-lookup preview and PT's `Auto Select Port` control is not
  reproduced; both L2 MAC fields are read-only (`Resolved by ARP`) and the
  dialog offers no L2/L3 override, no payload-size editors beyond the flow
  arguments the model already supports, and no raw UDP/TCP packet injection —
  every dispatch rides the model's real application flows. DNS targets must be
  domain names (IPv4 literals are rejected to avoid a pointless numeric
  lookup), and runs do not survive a page reload. Because raw injection is out
  of scope, the `Traffic Generator Desktop App` row in `replica/features.csv`
  keeps the clone column `no`.

## Verification

- `src/simulator/trafficGenerator.test.ts` — 8 tests: interval parsing bounds,
  tick conversion, per-application validation (ICMP IPv4/IPv6, HTTP path, TFTP
  file name, UDP port range, DNS domain shape with IPv4 rejection, NTP IPv4
  only), DSCP bounds, correlation-id stamping including the ARP color-only
  rule and the TCP/HTTP dual-id match.
- `src/store/trafficGenerator.test.ts` — 7 tests: immediate first dispatch and
  per-device replacement, one-second cadence at 17 ticks with no burst
  catch-up, stop-then-drain, rejections before dispatch (bad target, NaN and
  zero interval, unknown device), device-delete / clearSimulation / loadLab /
  resetTopology purging runs, color + DSCP on the wire (ARP keeps only the
  color), and idle-network tick advancement while a run is pending.
- `e2e/traffic-generator.spec.ts` — 2 production-browser specs: a single
  `Test` PDU plus out-of-range and non-numeric interval rejections, and a
  periodic colored run whose markers render on the canvas (`rect[fill]`),
  whose DSCP reaches the wire, whose counter grows, and whose counter freezes
  after `Stop`.
- Suite state after the increment: `npm test` 519/519, `npx tsc --noEmit`
  clean, lint zero errors / 28 pre-existing warnings, `npm run electron:prep`
  green, production-browser suite 45/45 including the realtime scale spec
  (p95 tick interval 66.7 ms, engine tick p95 8.2 ms, queue peak 2,132,
  drained without warnings) and `npm audit --omit=dev` zero advisories.

## Related documents

- `docs/PT_RECON.md` — 9.0.1 Traffic Generator strings and behavior notes.
- `replica/features.csv` row 41 — `Traffic Generator Desktop App` (clone `no`,
  reduced model recorded).
- `docs/REPLACEMENT_GATES.md`, `docs/PT_PARITY_GAP_MAP.md` — the increment
  reduces the Desktop-app breadth gap; the replacement gates stay open.
