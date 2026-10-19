# EIGRP implementation, 2026-10-19

EIGRP for IPv4 and IPv6 now exchanges simulated control packets, forms adjacencies, computes composite metrics, installs learned routes that carry real traffic, and runs DUAL's active/query/reply diffusing computation with feasible successors and stuck-in-active recovery. This closes the two gaps recorded for the routing row — active/query states and EIGRPv6 — but it is still a simulated protocol model, not binary interoperability, and it is not the complete replacement release gate.

## IPv4 student workflow

Configure `router eigrp 1` (or any `1-65535` AS), then `network <IPv4> [wildcard]` statements that select the participating interfaces; `no auto-summary` is the documented default and both forms are accepted. `passive-interface <name>`, `passive-interface default` and `no passive-interface <name>` mirror the RIP controls, and `eigrp router-id <A.B.C.D>` sets the displayed router ID. Inspect with:

- `show ip eigrp neighbors` — address, interface, hold timer, uptime
- `show ip eigrp topology` — passive and active prefixes, successor count, FD and per-path `(FD/reported)` pairs
- `show ip eigrp topology active` — only prefixes currently in Active state
- `show ip eigrp interfaces` — per-interface peer counts
- `show ip route` — learned entries as `D` with `[90/<metric>]`
- `show ip protocols` — the `Routing Protocol is "eigrp <AS>"` section with networks, passive interfaces, neighbors and the last rejected packet

`no router eigrp <AS>` clears the process, all learned `D` routes and the runtime; running-config prints the process block. Withdrawal works when a link goes down (neighbor hold expiry drops its candidates and a triggered update propagates the removal) and when `no network` removes a prefix.

## DUAL behaviour

- A **feasible successor** is a remaining candidate whose reported distance is strictly lower than the lost successor's feasible distance. On successor loss the best feasible candidate is promoted immediately with no query, which is the fast-failover path.
- If no feasible candidate exists, the prefix enters **Active** and the router multicasts a Query to `224.0.0.10` / `01:00:5e:00:00:0a` carrying the unreachable metric (`4294967295`). Active prefixes are withheld from the routing table and from advertised updates, so the existing `complete` triggered-update mechanism withdraws them while the query runs.
- A Query received from the current successor removes that neighbor's candidates first. If a path remains, the router answers immediately with its best distance; if other neighbors exist, it propagates the Query and answers the original querier when the remote Reply arrives; if the querier was the only neighbor, it replies with infinity.
- Replies are unicast to the querier with the best distance or infinity. The last outstanding Reply resolves the prefix: the best remaining candidate is installed and Replies are sent to every recorded origin; a prefix with no viable candidate is removed.
- **Stuck-in-active**: if a queried neighbor does not answer within 180 simulated seconds, that neighbor is dropped from the neighbor and candidate tables, a `siaNotice` is recorded, and the prefix resolves with the remaining information. `show ip eigrp topology` appends the notice.
- Active state is persisted as a per-prefix `topology` entry (network/netmask, `since`, pending neighbor keys and querier origins); Passive is represented by the absence of an entry, matching DUAL's normal state.

## EIGRPv6

- Enable IPv6 routing (`ipv6 unicast-routing`), create the process with `ipv6 router eigrp <1-65535>`, set `eigrp router-id <A.B.C.D>`, then `no shutdown`; the process is created shut down, as in IOS. Enable it per interface with `ipv6 eigrp <AS>` (there are no network statements). `passive-interface <interface>`, `passive-interface default` and `no passive-interface <interface>` suppress Hellos on an interface while its connected prefixes are still advertised.
- Adjacencies run between IPv6 link-local addresses derived from the interface MAC over `ff02::a` / `33:33:00:00:00:0a`, with the same 5-second Hello and 15-second Hold timers as IPv4. AS mismatch, duplicate router ID, malformed entries and non-link-local sources are rejected.
- Connected global prefixes are advertised; the composite metric uses the same `256 × (10^7/min bandwidth + cumulative delay/10)` formula and interface defaults. Learned routes install as `D` entries in `show ipv6 route` with distance 90, never over connected prefixes, and are withdrawn on hold expiry or process shutdown.
- Display covers `show ipv6 eigrp neighbors`, `show ipv6 eigrp topology` (prefix, successor count, FD and `via` paths), `show ipv6 eigrp interfaces`, `show ipv6 route` (`D` code with `[90/<metric>]`), and the `ipv6 router eigrp` / interface `ipv6 eigrp` running-config blocks.
- `no ipv6 router eigrp <AS>` flushes the process, runtime, adjacency and all learned `D` routes. `shutdown` stops the process and removes its learned routes; `no shutdown` restores convergence.
- Documented reduction: EIGRPv6 uses the same adjacency, timer, metric, successor-selection and triggered-update model, but it does not repeat the IPv4 active/query diffusing computation. No ECMP/variance, authentication, stub routing, redistribution, default origination or named mode in either address family.

## Packet and timer behavior

- Hellos go to `224.0.0.10` / `01:00:5e:00:00:0a` every 5 simulated seconds; the advertised hold time is 15 seconds and an adjacency expires after the hold. Every valid received packet refreshes the neighbor. EIGRPv6 uses the corresponding IPv6 multicast group and link-local endpoints.
- A newly discovered neighbor immediately receives a unicast full-table update; topology changes (routes gained or lost, interfaces up/down) trigger multicast updates to all non-passive interfaces on the next tick. Updates carry at most 25 entries per packet; a single-packet update is marked `complete` and lets the receiver withdraw candidates for prefixes the neighbor no longer advertises.
- The composite metric follows the IOS classic formula: `256 × (10^7 / min bandwidth + cumulative delay / 10)` with GigabitEthernet defaults of 1,000,000 kbps / 10 µs, FastEthernet 100,000 kbps / 100 µs and Serial 1,544 kbps / 20,000 µs. Connected prefixes advertise the attached interface's values; a received entry is combined with the receiving interface (min bandwidth, summed delay, hop + 1). For the three-Gigabit campus fixture the learned metrics are 3072 (one router away) and 3328 (two routers away), which lands in the real IOS range for Gigabit campus values.
- Learned routes use administrative distance 90, install the lowest-metric candidate per prefix with a deterministic next-hop tie break, and never install over a directly connected subnet. Split horizon keeps a learned route from being advertised back out of the interface it was learned from.
- EIGRP control traffic also rides operational GRE tunnels: the tunneled Hello/Update follows underlay routing and ARP, and the peer processes it on its Tunnel interface.
- AS mismatch, malformed entries, non-contiguous masks, off-subnet peers and non-router devices are rejected; `show ip protocols` exposes the last rejection reason.

## Evidence

- `src/simulator/eigrp.test.ts` — nine packet-level tests: three-router campus convergence with learned metrics and CLI output (`show ip route`, `show ip eigrp neighbors`, `show ip eigrp topology`, `show ip protocols`); a real PC-to-PC echo reply over learned routes; an AS-mismatch that blocks the adjacency and fails the ping cleanly; link shutdown withdraws the route and `no router eigrp` flushes runtime and routes; GRE delivery learns the remote LAN through Tunnel0 and returns a routed echo; and four DUAL tests — feasible-successor promotion without a query, Active + query + `FD is Inaccessible` + Reply resolution, query propagation when the only path runs through the querier, and the SIA timer dropping an unresponsive neighbor.
- `src/simulator/eigrpv6.test.ts` — five packet-level tests: link-local adjacency, `D` route installation and CLI output with a routed IPv6 ping; passive-interface advertisement without adjacency; AS-mismatch rejection; shutdown/`no shutdown` route removal and restoration; `no ipv6 router eigrp` flushing the process and learned routes.
- E2E flow F11 configures `router eigrp 1` / `network 10.0.0.0` from the browser CLI and verifies `show ip protocols`, `show ip eigrp topology` and running-config output. E2E flow F14 configures `ipv6 router eigrp 1` / `eigrp router-id` / `no shutdown` from the browser CLI and verifies `show ipv6 eigrp neighbors`, `topology`, `interfaces` and running-config.
- Current whole-repository verification: `npm test` 564/564, `npx tsc --noEmit` clean, lint zero errors with the 28 existing warnings, `npm run electron:prep` green, E2E flows 15/15, and the full production-browser suite 50/51 where the only red is the machine-boundary `simulation-scale` `longestTaskMs` wall-clock reading against the unchanged 500 ms bound.

## Remaining boundaries

Payloads are structured educational messages, not binary EIGRP datagrams interoperating with real routers. Packet/ACK nuance, full EIGRPv6 query-FSM parity, ECMP/variance, MD5 authentication, stub/offset-list/redistribution/default-origination controls, named mode and instructor acceptance remain open. Packet Tracer comparison has not been performed for EIGRP output. The routing row in `REPLACEMENT_GATES.md` remains open because the replacement gate requires complete routing parity and independent acceptance; the `replica/features.csv` EIGRP row flips to `clone=yes` because its recorded gap — active/query states and EIGRPv6 — is closed.
