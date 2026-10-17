# EIGRP implementation, 2026-10-17

EIGRP now exchanges simulated control packets, forms adjacencies, computes composite metrics and installs learned routes that carry real traffic. This is a routed routing-protocol increment, not a full DUAL parity claim and not the complete replacement release gate.

## Student workflow

Configure `router eigrp 1` (or any `1-65535` AS), then `network <IPv4> [wildcard]` statements that select the participating interfaces; `no auto-summary` is the documented default and both forms are accepted. `passive-interface <name>`, `passive-interface default` and `no passive-interface <name>` mirror the RIP controls, and `eigrp router-id <A.B.C.D>` sets the displayed router ID. Inspect with:

- `show ip eigrp neighbors` — address, interface, hold timer, uptime
- `show ip eigrp topology` — passive prefixes, successor count, FD and per-path `(FD/reported)` pairs
- `show ip eigrp interfaces` — per-interface peer counts
- `show ip route` — learned entries as `D` with `[90/<metric>]`
- `show ip protocols` — the `Routing Protocol is "eigrp <AS>"` section with networks, passive interfaces, neighbors and the last rejected packet

`no router eigrp <AS>` clears the process, all learned `D` routes and the runtime; running-config prints the process block. Withdrawal works when a link goes down (neighbor hold expiry drops its candidates and a triggered update propagates the removal) and when `no network` removes a prefix.

## Packet and timer behavior

- Hellos go to `224.0.0.10` / `01:00:5e:00:00:0a` every 5 simulated seconds; the advertised hold time is 15 seconds and an adjacency expires after the hold. Every valid received packet refreshes the neighbor.
- A newly discovered neighbor immediately receives a unicast full-table update; topology changes (routes gained or lost, interfaces up/down) trigger multicast updates to all non-passive interfaces on the next tick. Updates carry at most 25 entries per packet; a single-packet update is marked `complete` and lets the receiver withdraw candidates for prefixes the neighbor no longer advertises.
- The composite metric follows the IOS classic formula: `256 × (10^7 / min bandwidth + cumulative delay / 10)` with GigabitEthernet defaults of 1,000,000 kbps / 10 µs, FastEthernet 100,000 kbps / 100 µs and Serial 1,544 kbps / 20,000 µs. Connected prefixes advertise the attached interface's values; a received entry is combined with the receiving interface (min bandwidth, summed delay, hop + 1). For the three-Gigabit campus fixture the learned metrics are 3072 (one router away) and 3328 (two routers away), which lands in the real IOS range for Gigabit campus values.
- Learned routes use administrative distance 90, install the lowest-metric candidate per prefix with a deterministic next-hop tie break, and never install over a directly connected subnet. Split horizon keeps a learned route from being advertised back out of the interface it was learned from.
- EIGRP control traffic also rides operational GRE tunnels: the tunneled Hello/Update follows underlay routing and ARP, and the peer processes it on its Tunnel interface.
- AS mismatch, malformed entries, non-contiguous masks, off-subnet peers and non-router devices are rejected; `show ip protocols` exposes the last rejection reason.

The model is a documented simplification of DUAL: no feasible-successor bookkeeping beyond best-metric selection, no active/query/reply diffusing computation, no stuck-in-active, no variance/ECMP, no MD5 authentication, no stub/offset-list/redistribution/default-origination controls, no named mode, numeric AS only, and no EIGRPv6. Route withdrawal is immediate via `complete` triggered updates rather than the real DUAL query process.

## Evidence

- `src/simulator/eigrp.test.ts` — five packet-level tests: three-router campus convergence with learned metrics and CLI output (`show ip route`, `show ip eigrp neighbors`, `show ip eigrp topology`, `show ip protocols`); a real PC-to-PC echo reply over learned routes; an AS mismatch that blocks the adjacency and fails the ping cleanly; link shutdown withdraws the route and `no router eigrp` flushes runtime and routes; GRE delivery learns the remote LAN through Tunnel0 and returns a routed echo.
- E2E flow F11 configures `router eigrp 1` / `network 10.0.0.0` from the browser CLI and verifies `show ip protocols`, `show ip eigrp topology` and running-config output.
- Current whole-repository verification is recorded in `LAUNCH_READINESS.md` and `HANDOFF.md`: 458/458 unit tests, lint zero errors with the 28 existing warnings, the optimized build with zero production-dependency advisories, and 34/34 production-browser flows including the realtime scale case.

## Remaining boundaries

Payloads are structured educational messages, not binary EIGRP datagrams interoperating with real routers. Packet/ACK nuance, DUAL active-state behavior under multi-path failures, feasible-successor-based fast failover, ECMP, authentication, route redistribution and instructor acceptance remain open. Packet Tracer comparison has not been performed for EIGRP output. The routing row in `REPLACEMENT_GATES.md` remains open.
