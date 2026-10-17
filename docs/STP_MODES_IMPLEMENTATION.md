# Rapid PVST+ and MSTP implementation, 2026-10-17

Switches now support `spanning-tree mode pvst|rapid-pvst|mst` with working rapid convergence and MST instances. This is a switching-protocol increment on top of the existing per-VLAN BPDU engine, not a full 802.1w/802.1s parity claim and not the complete replacement release gate. The classic per-VLAN model stays the default (`pvst`), so existing labs behave exactly as before unless a switch is moved to a rapid mode.

## Student workflow

Choose the protocol with `spanning-tree mode pvst|rapid-pvst|mst` (`no spanning-tree mode` restores the default). Priorities and root placement work per VLAN as before (`spanning-tree vlan <1-4094> root primary|secondary|priority <n>`, plus `no ... priority` to reset). In `mst` mode, per-instance controls replace per-VLAN ones:

- `spanning-tree mst <1-4094> root primary|secondary|priority <multiple of 4096>` — the priority applies to every VLAN mapped to that instance.
- `spanning-tree mst configuration` — enters a real `(config-mst)#` prompt with `name <word>` (≤ 32 chars), `revision <0-65535>`, `instance <1-4094> vlan <list>` and `no instance <n>` / `no name` / `no revision`. VLAN lists accept commas and ranges (`10,20`, `30-31`), moving a VLAN between instances removes it from the old one, and VLANs without a mapping stay in instance 0 (CIST).
- `no spanning-tree portfast default`, interface `no spanning-tree portfast|cost|link-type`, and `spanning-tree link-type point-to-point|shared`.

Inspect with:

- `show spanning-tree vlan <id>` — the existing per-VLAN view, now with a `Spanning tree enabled protocol ieee|rstp|mstp` line
- `show spanning-tree summary` — mode line, root-bridge list and per-VLAN/per-instance Blocking/Listening/Learning/Forwarding counts
- `show spanning-tree mst [<instance>]` — instance view with mapped VLAN list, bridge/root addresses, costs and port roles
- `show spanning-tree mst configuration` — region name, revision, instance count and the compressed VLAN map
- `show running-config` — `spanning-tree mode`, `spanning-tree mst <n> priority`, the `spanning-tree mst configuration` block and interface `link-type` lines

## Rapid behavior

- In `rapid-pvst` and `mst` modes, a Root or Designated port on a point-to-point switch link passes through a `STP_RAPID_SYNC_TICKS` = 17-tick (≈1 s) sync window and then forwards — modeling the RSTP proposal/agreement handshake single-window instead of the two 15-second 802.1D listening/learning delays. A blocked Alternate port that becomes the new Root port after a root-port loss therefore recovers in ≤ 60 ticks in the measured test, while the same scenario in `pvst` needs the 30-second sequence (test asserts > 400 ticks).
- PortFast edge ports (per-port or `portfast default`) forward immediately in every mode; Alternate ports are always discarding; a port whose role leaves Alternate re-enters the sync window in rapid modes or the classic timers otherwise.
- A port is treated as point-to-point when its peer is another switch, unless the port explicitly says `spanning-tree link-type shared`; shared links (hub peers or the explicit setting) keep the classic 15-second timers even in rapid modes.
- BPDUs are still the same simulated per-VLAN configuration vectors through the existing Hello (2 s) / Max Age (20 s) / hold machinery; only the port-state transitions differ by mode.

## MST model

MST is realized as the existing per-VLAN state machinery synchronized through per-instance priority: `stpPriorityForVlan` returns `mstPriorities[instance]` (default 32768) for every VLAN of the instance in `mst` mode, so all VLANs mapped to one instance converge on the same root and roles on ports that carry them, and `stpPriorities` is ignored in `mst` mode. The test builds the classic load-balancing demo: VLAN 10 → instance 1 rooted at one switch and VLAN 20 → instance 2 rooted at another, in the same physical topology, while a PVST priority set to 0 on the second switch is proven not to move the VLAN 10 root. The instance view reports through the lowest carried VLAN of the instance; instance 0 lists the unmapped remainder with range compression.

## Evidence

- `src/simulator/stpModes.test.ts` — five tests: CLI/region round-trip (`mode`, `config-mst` prompts, name/revision/instance mapping incl. VLAN moves and `no` forms, invalid revision 70000 and instance 0 errors, per-instance priority and root commands, `show spanning-tree mst configuration` / `summary` output, running-config lines, `no spanning-tree mode`); rapid sync window vs classic listening vs explicit shared-link downgrade on the same converged topology; rapid alternate-link promotion after root-port loss (≤ 60 ticks) versus `pvst` (> 400 ticks); MST two-instance root steering with PVST-priority-ignored proof; mode-labelled show views on a converged lab.
- E2E flow F12 (production browser) configures `spanning-tree mode rapid-pvst`, an MST region (`name WIREX`, `revision 7`, `instance 1 vlan 10,20`) and verifies the region view, instance row and `Switch is in rapid-pvst mode` summary from the real UI.
- Current whole-repository verification is recorded in `LAUNCH_READINESS.md` and `HANDOFF.md`: 463/463 unit tests, lint zero errors with the 28 existing warnings, the optimized build with zero production-dependency advisories, and 35/35 production-browser flows including the realtime scale case (longest task 251 ms against the 500 ms bound).

## Remaining boundaries

A single MST region is assumed — region-mismatch handling and CIST interop between mismatched regions are not modeled. There are no per-instance port costs (`spanning-tree mst <n> cost`), no BPDU filter/guard, root guard, loop guard or BPDU skew detection, no topology-change notification flooding and no explicit proposal/agreement PDUs (the sync window stands in for the handshake). Rapid timers are the fixed simulated constants rather than negotiated RSTP timers, EtherChannel member failure/recovery acceptance is unchanged from before, and measured acceptance against external switch output has not been performed. The STP/EtherChannel row in `REPLACEMENT_GATES.md` remains open.
