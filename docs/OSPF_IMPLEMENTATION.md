# OSPF milestone, 2026-10-08

## Production browser failover acceptance, 2026-10-12

`e2e/gre.spec.ts` now verifies OSPF-selected GRE underlay failover in the production browser build. It observes the remote tunnel endpoint route on the preferred physical link, shuts both primary interfaces, confirms the route moves to the backup, then restores the primary and confirms route reselection. PC-to-PC Simple PDUs succeed before failure, during backup operation and after recovery, while the GRE OSPF neighbor remains Full. The tested fixture has two directly connected routers and static inner LAN routes; this is not evidence for multihop convergence, all failure modes or full OSPF parity. The complete production browser suite passes 22/22. Full replacement launch remains blocked by the other gates in `REPLACEMENT_GATES.md`.

## Try the lab

Open **Help > Practice Labs > OSPF route learning and failover**. The five-device lab has three routers, two PCs, two normal transit links and a more expensive backup link. Loading it replaces the current topology, so save your current lab first.

In Realtime, allow neighbor discovery and database exchange to complete. Open R1's CLI:

```text
enable
show ip ospf neighbor
show ip ospf database
show ip route
```

R1 learns 192.168.3.0/24 through 10.0.12.2 with cost 3. Student-A can ping Student-B at 192.168.3.10. Inspect the actual control envelopes to see Hello, database description, link-state request, update and acknowledgment payloads.

On R1, disable the preferred transit interface:

```text
configure terminal
interface GigabitEthernet0/1
shutdown
end
show ip route
```

After the next protocol step, the remote LAN uses next hop 10.0.13.3 with cost 11. `no shutdown` restores the cheaper path after discovery and database synchronization. Removing all usable paths withdraws the learned route. No static route is needed between these LANs.

Simulation mode pauses the protocol clock and packets. Capture / Forward advances one simulation tick. Auto Play resumes packet travel and timers. A broadcast interface waits for its election interval; point-to-point interfaces start exchanging immediately after bidirectional Hellos.

## Implemented behavior

- Intra-area IPv4 OSPF on routers and routing-enabled multilayer switches.
- Hello discovery, bidirectional neighbor recognition, database descriptions, requests, updates, acknowledgment and retry.
- Init, 2-Way, ExStart, Exchange, Loading and Full states driven by received packets.
- Broadcast DR/BDR election using priority and router ID, stable incumbent preference, and 2-Way DROTHER pairs; point-to-point adjacency without election.
- A scoped link-state database and shortest-path routes. The packet engine uses the learned next hop; connected and static routes take precedence for the same prefix.
- Cost-based alternate paths, shutdown/power/link withdrawal, Hello/Dead timers, LSA refresh/aging and retry after lost updates.
- Router IDs, network statements/removal, passive interfaces/default/exceptions, interface cost/priority/network type/timers, process removal and `clear ip ospf process`.
- Live CLI neighbor/database/interface/protocol/route output. Mismatches identify the receiving interface, peer address and conflicting values.
- Supported OSPF settings survive JSON and internal PKT export/import. Reload discards operational neighbors and learned routes so discovery starts again; configuration remains.
- Control traffic respects existing cables, bridge forwarding, VLAN gates, 802.1Q subinterfaces, SVIs and applicable ACLs. Packet admission remains bounded at 256.
- OSPF control packets can use an operational IPv4 GRE Tunnel interface. The outer GRE packet follows ordinary underlay routing and ARP; the receiver decapsulates the OSPF control PDU onto the matching tunnel interface. GRE defaults to point-to-point OSPF network type. Two-router regressions learn a remote LAN over Tunnel0, carry a returned PC-to-PC echo, and withdraw then restore the OSPF route after keepalive detects and recovers from a remote tunnel mismatch. Production browser acceptance observes the Full neighbor and learned route.
- OSPF clocks and learned tables do not recreate canvas device views or trigger a browser autosave every tick.

The protocol reference is [RFC 2328](https://www.rfc-editor.org/rfc/rfc2328.html), especially neighbor states, Hello processing, DR/BDR election, database synchronization and shortest-path calculation.

## Boundaries

This is an educational protocol model with structured packets, not a binary OSPF wire implementation. Router links and attached prefixes use a compact router-LSA representation. Broadcast transit-network/type-2 LSAs, full database-description master/slave negotiation and MTU checks are not represented. Inter-area ABR routes, external redistribution, stub/NSSA areas, authentication, virtual links, ECMP and OSPFv3 remain unfinished. GRE keepalive timers control tunnel line state, but full OSPF convergence across every underlay failure and topology is not certified. Imported unsupported OSPF commands do not imply these behaviors exist.

The dynamic-routing release gate remains open for broader OSPF parity, multihop convergence and additional failure topologies. RIPv2 has separate tunnel regressions. This browser case closes only the direct two-router GRE underlay failover evidence gap.

## Verification

The OSPF regression suite checks actual control packet types and states, a received ICMP echo reply across three routers, path cost/failover/recovery, dead timer expiry, area/subnet/timer/router-ID mismatches, passive interfaces, broadcast roles, update retransmission, process restart/removal, internal PKT settings, reload and the selectable practice lab. On 2026-10-08 the repository gate passed 243 tests, lint with zero errors (31 warnings), the production/TypeScript build, offline manifest generation and the production dependency audit. The Next.js runtime is pinned to patched 16.3.8.

Production-browser interaction is verified by automated desktop flows, including the GRE failover case above. This is not manual GUI, audio, mobile or offline acceptance evidence, and internal PKT round trips are not official Cisco interoperability certification.
