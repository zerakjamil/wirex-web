# Traffic Generator desktop app implementation

Scope: PT 9.0.1's **Traffic Generator** desktop application (PC and laptop
Desktop tab) — delivered in two increments: the reduced model (2026-10-17) and
the raw-injection / source-settings / persistence depth pass (2026-10-18).
Target inventory: the dialog layout captured in the installed application's
`BaseTrafficGenerator.ui` (Source Settings / L2 Config / L3 Config / PDU
Settings / Simulation Settings groups, Single Shot · Periodic modes, `Send` /
`Stop` / `Test`, the interval and DSCP messages) and the behavior read from
`CTrafficGenerator.cpp` (immediate first PDU, `Stop`, Ctrl+F4 close), recorded
read-only in `work/pt901-uirecon/` (`evidence/ui_strings.csv`) and summarized
in `PT_RECON.md`.

Status: model, store wiring, desktop app dialog, canvas labeling, browser
acceptance and the depth pass landed; the `Traffic Generator Desktop App` row
in `replica/features.csv` flips to `clone` `yes` with the reductions below.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Model | `src/simulator/trafficGenerator.ts` | Pure module: `TrafficGeneratorApplication = 'icmp' \| 'http' \| 'tftp' \| 'udp' \| 'raw-udp' \| 'raw-tcp' \| 'dns' \| 'ntp'`, `TrafficGeneratorSettings` (application, target, path, fileName, port, data, packetColor, dscp, sourcePort, payloadSize, autoSelectPort, outgoingPortId, sourceMac, sourceIp), `TrafficGeneratorRun` (id, deviceId, settings, intervalSeconds, sentCount, startedTick, nextDueTick, lastRequestId), the application catalog and color presets, `defaultTrafficGeneratorSettings`, `parseTrafficGeneratorInterval` (strict decimal, 0.001–1,000,000 s, `interval-invalid` vs `interval-range`), `trafficGeneratorIntervalTicks` (60 ms `SIMULATION_TICK_MS`, floor of one tick), `trafficGeneratorPaddedData` (dots padding to the requested byte size), `trafficGeneratorFrameOptions` (lifts the pinned port, source overrides, color and DSCP for the raw injectors), `validateTrafficGeneratorSettings` (per-application target shape, port range, source port 0/1–65535, payload 0–1472, MAC and IPv4 override shape, DSCP 0–63, DNS rejects IPv4 literals), `trafficGeneratorPduMatches` and `stampTrafficGeneratorPackets` |
| Raw injectors | `src/simulator/engine.ts` | `createRawUdpPackets` crafts a bare IPv4/UDP datagram (fire-and-forget, no `udpRequestId`, service `raw`, payload padded to the configured size, ACL-checked like the application flows) and `createRawTcpPackets` crafts a TCP SYN (`tcpApplication 'RAW'`, hash-derived sequence and automatic source port). Both accept a pinned outgoing port (`trafficGeneratorRoute`) plus source-MAC / source-IPv4 overrides and bake the color (root frame and ARP `pendingPacket`) and DSCP into the PDUs |
| Raw TCP receiver | `src/simulator/engine.ts` | A SYN delivered to a device is answered with `SYN-ACK` when port 80 has the modeled HTTP listener (`server` with `httpServiceEnabled`), otherwise `RST-ACK` with an error reason; the client completes the handshake with an `ACK`. The exchange shows the real three-way handshake — or the reset — on the canvas and in PDU details |
| Store state and actions | `src/store/networkStore.ts` | `trafficGenerators: TrafficGeneratorRun[]`; `startTrafficGenerator` (validate → one run per device, replacing any previous run → immediate first dispatch → `nextDueTick = tick + intervalTicks`), `stopTrafficGenerator`, `sendTrafficGeneratorOnce` (validate → dispatch → stamp the new frames), `requestRawUdp` / `requestRawTcp` (queue the crafted frames through the same `MAX_IN_FLIGHT_PACKETS` guard, return the synthetic request id used for counting), `advanceTrafficGenerators` (dispatch every due run once per tick, re-arm `nextDueTick`, drop runs whose device disappeared). Dispatch maps ICMP/HTTP/TFTP/UDP/DNS/NTP to the existing flows, pads UDP Echo to `payloadSize`, and routes `raw-udp` / `raw-tcp` to the injectors |
| Outgoing port and overrides | `src/components/modals/TrafficGeneratorApp.tsx`, `src/store/networkStore.ts` | Source Settings gains the PT `Auto Select Port` checkbox and, when unchecked, an Outgoing Port selector over the device's ports (existence validated as `port-unknown`). L2 Config and L3 Config stay editable source MAC / source IPv4 override fields enabled for the raw injectors, with the routing-table note shown inline |
| Run persistence | `src/store/workspacePersistence.ts`, `src/simulator/workspaceSchema.ts` | Periodic runs persist through both autosave paths (localStorage and SQLite): device id, settings, interval and sent count. Restore resumes each run at the current tick (the workspace clock resets to 0 on load) and drops runs whose source device is missing or whose settings no longer validate. Autosave compares a run template projection (device, settings, interval) so per-tick progress does not churn writes, and the unload flush captures the latest sent counts |
| Tick integration | `src/store/networkStore.ts` | `tickSimulation` and `stepSimulation` gained a `hasGeneratorActivity` term in their idle early-return and call `advanceTrafficGenerators()` after their main `set()`, so runs fire in both Realtime and Simulation modes — the same idle-tick failure mode CAPWAP (`hasCapwapActivity`) and IoT (`hasIotActivity`) fixed |
| Packet labeling | `src/types/network.ts`, `src/simulator/trafficGenerator.ts`, `src/components/canvas/CableEdge.tsx`, `src/components/modals/PduDetailsModal.tsx` | `PacketPdu.generatorColor?: string` and `payload.dscp?: number`; stamping correlates frames by the same request id the send actions put on their PDUs (`pingId`, `tcpRequestId`/`httpRequestId`, `dnsRequestId`, `udpRequestId`), including a frame's `pendingPacket`; ARP frames keep the color but hand DSCP to the pending IP packet. The raw injectors bake the same fields at build time. The canvas marker/badge body, flap and label take the run color, and the PDU details headers tab shows `TOS / DSCP: 0x…` when set |
| Desktop app | `src/components/modals/TrafficGeneratorApp.tsx`, `DeviceModal.tsx` | PC/laptop Desktop gains a **Traffic Generator** card opening a PT-shaped dialog (`pt-traffic-generator`): Source Settings (source device, `Auto Select Port`, outgoing port), L2 Config (source MAC override, `Resolved by ARP` destination), L3 Config (source IP override, destination), PDU Settings (application picker with `UDP (raw)` and `TCP (raw)`, per-app request path / file name / destination port / source port / payload size / data, packet color swatches with `Automatic`, DSCP input), Simulation Settings (Single Shot · Periodic, interval in seconds, `Test` / `Send` / `Stop` / `Close`, status chip `pt-tg-status`, counter `pt-tg-count`, alerts `pt-tg-error`). String parse errors and validation error codes map to localized messages in the component — the store never holds English |
| Close shortcut | `TrafficGeneratorApp.tsx` | Ctrl+F4 returns to the Desktop (PT muscle memory), mirroring the recon of `CTrafficGenerator.cpp` |
| Lifecycle | `src/store/networkStore.ts`, `src/store/workspacePersistence.ts` | Runs are workspace state: they persist through localStorage / SQLite autosave and are dropped for missing devices on restore. They stay out of `.pkt` export, share URLs, `SimulationSnapshot` and the training backup. `deleteDevice`, `clearSimulation` and `resetTopology` purge runs (`loadLab` clears them and the restore path re-applies the saved set) |
| Localization | `src/i18n/messages.ts` | 53 strings as EN/AR/CKB triples (41 from the reduced model plus 12 added by the depth pass: `Auto Select Port`, `Source Port`, `Payload Size (bytes)`, the two raw application labels, the raw and routing-table hints, and the five new validation messages). Status/statusbar simulation messages stay plain English per the existing convention |

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
- **Raw UDP is fire-and-forget.** The datagram starts from an empty ARP/route
  decision like any other packet, carries the configured source/destination
  ports and a payload padded to the requested byte size, and produces no
  transaction row — nothing answers a bare datagram. This matches the
  reference tool, where a crafted UDP PDU is simply sent.
- **Raw TCP shows the handshake.** The SYN is routed like any packet. When it
  arrives at a device that models a TCP listener (an HTTP server on port 80),
  the receiver returns `SYN-ACK` and the client closes the handshake with an
  `ACK`; every other destination port answers `RST-ACK` with the reason "No TCP
  application listens on <ip>:<port>". The server initial sequence is 1 in this
  reduced model (the same simplification the HTTP flow uses).
- **Pinned port and source overrides.** The Auto Select Port control defaults to
  on (routing-table egress). When it is off, the raw injectors send out the
  selected port even if the routing table would choose another one, and the
  L2/L3 override fields replace the port MAC / IP in the crafted frame. The
  application flows keep following the routing table — the dialog states this
  inline. Outgoing-port ids are validated against the live device
  (`port-unknown`).
- **Persisted runs.** A periodic run survives a page reload or workspace
  restore: its device, settings, interval and sent count come back and the
  schedule resumes at the restored tick. A run whose source device no longer
  exists in the saved topology is silently dropped, as is a run whose settings
  no longer validate (so an older save never blocks a workspace load).
- **Honest reductions (recorded, not hidden).** Raw UDP never receives a
  response (no service echo), and raw TCP completes the handshake only against
  the modeled HTTP listener — ports that would have real services in PT answer
  the reset instead. The payload-size editor applies to UDP Echo and raw UDP
  (the flows whose payload is free-form); ICMP, HTTP, TFTP, DNS and NTP keep
  their protocol-defined payloads. Share URLs and `.pkt` export keep excluding
  generator runs. DNS targets must be domain names (IPv4 literals are rejected
  to avoid a pointless numeric lookup).

## Verification

- `src/simulator/trafficGenerator.test.ts` — 11 tests: interval parsing bounds,
  tick conversion, per-application validation (ICMP IPv4/IPv6, HTTP path, TFTP
  file name, UDP port range, DNS domain shape with IPv4 rejection, NTP IPv4
  only), source-port / payload / override validation, payload padding, frame
  option lifting, DSCP bounds, correlation-id stamping including the ARP
  color-only rule and the TCP/HTTP dual-id match.
- `src/store/trafficGenerator.test.ts` — 13 tests: immediate first dispatch and
  per-device replacement, one-second cadence at 17 ticks with no burst
  catch-up, stop-then-drain, rejections before dispatch (bad target, NaN and
  zero interval, unknown device, unknown port), device-delete / clearSimulation
  / loadLab / resetTopology purging runs, color + DSCP on the wire (ARP keeps
  only the color), idle-network tick advancement while a run is pending, raw
  UDP craft parameters, the raw TCP handshake and reset paths, pinned-port and
  override behavior, UDP Echo payload padding, and the save/restore round trip
  with the missing-device drop.
- `e2e/traffic-generator.spec.ts` — 3 production-browser specs: a single
  `Test` PDU plus out-of-range and non-numeric interval rejections; a periodic
  colored run whose markers render on the canvas (`rect[fill]`), whose DSCP
  reaches the wire, whose counter grows, and whose counter freezes after
  `Stop`; and the raw pass — raw UDP with a pinned port, source MAC/IP
  overrides, source port and payload size frozen in Simulation mode for a
  deterministic read, then a periodic run that survives `page.goto('/')` with
  its settings and sent count and keeps sending after the restore.
- Suite state after the increment: `npm test` 555/555, `npx tsc --noEmit`
  clean, lint zero errors / 28 pre-existing warnings, `npm run electron:prep`
  green, production-browser suite 49/50 — the only red is the known
  machine-boundary `simulation-scale` `longestTaskMs` reading (502–520 ms
  against the unweakened 500 ms threshold; the other assertions, elapsed
  budget and p95 tick interval, pass and the same spec measured 534 ms red at
  the previous commit on this machine).

## Related documents

- `docs/PT_RECON.md` — 9.0.1 Traffic Generator strings and behavior notes.
- `replica/features.csv` row 41 — `Traffic Generator Desktop App` (clone
  `yes`; the reductions above are recorded in the row note).
- `docs/REPLACEMENT_GATES.md`, `docs/PT_PARITY_GAP_MAP.md` — the increment
  reduces the Desktop-app breadth gap; the replacement gates stay open.
