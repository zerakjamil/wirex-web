# Back stepping and event filters implementation

Scope: the Simulation panel's Back control (Alt+B) and the Event List's
protocol filters — the PT 9 familiar-affordance item selected after the IoT
increment. Target inventory: Packet Tracer 9.0.1's Simulation panel (Back
button, event table with `Time | Last Device | At Device | Type` columns, the
`Edit Filters` / `Show All` / `Show None` dialog), already captured in
`PT_RECON.md` and the internal case `work/pt901-uirecon/`.

Status: reversible simulation journal, engine event stream, event sidebar,
filters and browser acceptance landed 2026-10-17.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Reversible journal | `src/store/networkStore.ts` | `SimulationSnapshot` is a `structuredClone` of the whole simulation slice — devices, links, in-flight packets, TCP receive buffers, outstanding segments, ping/HTTP/email/DNS/UDP/DHCP result and transaction records, warnings, `simulationTick` and the event buffer. Depth is adaptive: `simulationHistoryLimitFor(deviceCount)` returns 50 (≤60 devices), 20 (>60) and 8 (>150). A snapshot is pushed **before** every tick/step and only in Simulation mode |
| Back action | `networkStore.stepSimulationBack`, `CiscoBottomBar.tsx` | Simulation-mode only; pops the newest snapshot, restores it, sets `simulationPlaying:false`. UI: a `Back` button first in the simulation controls row (disabled while the journal is empty, tooltip `Back (Alt+B)`) and the `Alt+B` shortcut |
| Journal invalidation | `networkStore.ts` module scope | A module-level `internalSimulationSet` flag is set before every tick/step/back `set()`; a single `useNetworkStore.subscribe` consumes the flag first and otherwise drops the journal and the event buffer whenever `devices`/`links`/`inFlightPackets`/`pingResults` references change outside those paths. `clearSimulation` and `toggleSimulationMode` clear both explicitly. Any new traffic, topology edit, lab load or reset therefore restarts the run instead of restoring stale history |
| Engine event stream | `src/simulator/engine.ts` | `stepSimulationTick` gained a 7th `collectEvents = false` parameter. When true (Simulation mode) every packet delivery in the tick becomes one `SimulationEvent`: `id = ${packetId}:${status}` deduplicated per tick, `timestamp = simulationTick`, per-hop `sourceDeviceId = packet.fromDeviceId`, `destDeviceId = delivery.receiverDeviceId`, `protocol = packet.pdu.protocol` and `status = delivered ? 'received' : 'dropped'`. Deliveries whose packet left the in-flight map (TCP retransmissions, wireless inner frames) are skipped. Realtime mode passes `false`, so the hot path is unchanged |
| Event store | `networkStore.ts` | `simulationEvents: SimulationEvent[]` appended each step in Simulation mode, capped at `SIMULATION_EVENT_LIMIT = 300` |
| Event List UI | `src/components/cisco/CiscoBottomBar.tsx`, `globals.css` | The `.pt-pdu-window` sidebar gained `PDUs | Events` tabs (Simulation mode only; hidden in Realtime, where the window keeps the original PDU layout). The `.pt-event-table` renders `Time | Last Device | At Device | Type` with per-protocol chips, `data-protocol` hooks for tests, an `events` row count and a `Show All / None` toolbar toggle. Time is `timestamp × SIMULATION_TICK_MS` rendered in seconds with three decimals |
| Edit Filters | `CiscoBottomBar.tsx`, `src/store/workspaceStore.ts` | `Edit Filters` opens an absolutely-positioned `role="dialog"` popover above the dock with one checkbox per protocol (`PACKET_PROTOCOLS`, `src/types/network.ts`), plus `Show All`, `Show None` and close. State lives in `workspaceStore.hiddenEventProtocols` (default empty) with `setEventProtocolVisible`, `showAllEventFilters`, `showNoneEventFilters` and `toggleEventFilters`; it is view state and is not part of `snapshot()` |
| Rewind status | `workspaceStore.ts` | The ICMP and UDP transaction subscriptions downgrade a terminal PDU row back to `In Progress` when the matching `pingResults`/`udpTransactions` record is `pending` again after a Back step, so the PDU table follows the rewound timeline; the missing-record `Failed` path is retained for genuine topology replacement |
| Localization | `src/i18n/messages.ts` | 24 new strings, all EN/AR/CKB triples (tab names, event table headers, filter dialog, empty-state messages, protocol names); the localization test enforces non-empty Arabic-script columns |

## Semantics

- One Back step rewinds exactly one recorded tick: tick counter, in-flight
  packets, TCP state, application results and the event list all return to the
  state captured before that step; the PDU table follows through the existing
  result subscriptions.
- The journal covers the uninterrupted run of simulation steps. Firing new
  traffic (including a new PDU or ping), editing devices or links, loading a
  lab, `Reset Simulation` or switching modes drops it; the Back button is
  disabled while it is empty.
- Events are recorded per hop — one row per link traversal/delivery with the
  previous and current device, mirroring PT's `Last Device → At Device` pairs —
  and they are rewind-consistent because the buffer is part of the snapshot.
- Filters are pure view state: hidden protocols affect only what the Events
  tab renders, never the engine, the journal or what is stored.

## Documented simplifications (no parity claim)

- Not implemented from PT's Event List: column sorting, CSV/print export, the
  full PT column set (source/destination addresses and info badges), and
  event-driven "jump to next event" scanning beyond the existing 7-step
  Capture/Forward batch.
- Back depth is bounded (50/20/8 steps by topology size) rather than an
  unbounded session journal; bounding keeps `structuredClone` cost and memory
  predictable on the 288-host campus labs.
- The journal snapshots the simulation slice, not the workspace: PDU rows keep
  their user-owned metadata (notes, colors) and are reconciled through result
  subscriptions rather than being rebuilt from snapshots.

## Verification

Unit — `src/simulator/backstep.test.ts` (10 tests): a step then Back restores
tick, packet count and journal depth; events are recorded only in Simulation
mode and stay empty in Realtime; Back is a no-op in Realtime or with an empty
journal; firing new traffic restarts the journal; `clearSimulation` empties
packets and the journal; recorded events map per-hop with unique ids and
include ARP and ICMP hops into and out of the far host; `simulationHistoryLimitFor`
boundaries (2→50, 60→50, 61→20, 150→20, 151→8); a functional cap run of 58
steps on a 3-device lab keeps exactly a 50-entry journal while the tick
advances 58; a completed PDU row rewinds to `In Progress` and its result
record back to `pending`; filter actions cover hide/show/toggle/show-all/none
and `setPduView`.

Browser — `e2e/backstep.spec.ts` against the production build: Back is visible
and disabled at the start of a session; Capture/Forward advances the timeline
and enables it; Back and `Alt+B` each rewind exactly one recorded tick; the
Events tab shows per-hop ARP and ICMP rows with `data-protocol` chips; `Edit
Filters` hides ICMP rows while ARP rows remain; `Show None` yields the
filter-specific empty-state message and `Show All` restores every row; the
sidebar `Show All / None` toggle hides and restores all rows; the PDUs tab
still renders the original table.

Full gates at landing: `npm test` 489/489 (10 new), `npx tsc --noEmit` clean,
lint zero errors and 28 pre-existing warnings, `npm run electron:prep` green,
and the production-browser suite ran 40 flows with the machine-load-sensitive
realtime scale case passing every functional assertion but exceeding its
pacing bound only under sustained external load (load average 27).
