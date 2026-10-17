# BGP implementation, 2026-10-17

IPv4 eBGP now exchanges simulated OPEN, KEEPALIVE, UPDATE and NOTIFICATION packets, forms sessions between directly connected routers in different autonomous systems, propagates prefixes with AS-path loop prevention and installs learned routes that carry real traffic. This is a reduced eBGP model, not a full BGP-4 parity claim and not the complete replacement release gate.

## Student workflow

On a routing-capable device (a router, or a Layer 3 switch with `ip routing`) configure `router bgp <1-65535>`, then `bgp router-id <A.B.C.D>`, `neighbor <A.B.C.D> remote-as <1-65535>` and `network <A.B.C.D> [mask <M.M.M.M>]` statements; an omitted mask uses the classful default. `no neighbor <ip>` removes a peer, `no network` removes an announcement and `no router bgp <AS>` clears the process, the runtime and every learned `B` route. `clear ip bgp *` resets all peers to Idle (paths withdrawn, sessions reconverge on the next retry), which is the documented way to force recovery. Re-entering `router bgp` with a different AS is refused — the same convention the EIGRP model documents — and `neighbor <ip> remote-as <local AS>` is refused because iBGP is not supported in this reduced model. Inspect with:

- `show ip bgp` — local networks (with a `(not in routing table)` marker when no connected subnet matches) and learned prefixes: next hop, metric, local preference, weight, AS path
- `show ip bgp summary` (or `show ip bgp neighbors`) — router identifier, local AS, table version, and per-neighbor state, message counters, up/down and prefixes received
- `show ip protocols` — the `Routing Protocol is "bgp <AS>"` section with the router ID and configured neighbors
- `show ip route` — learned entries as `B` with `[20/0]`
- `show running-config` — the whole `router bgp` block

## Packet and timer behavior

- Sessions keepalive every 60 simulated seconds and a peer expires after a 180 second hold time; an idle peer re-sends OPEN every 5 seconds. Port 179 is labeled on the PDU layer text. The TCP handshake is not modeled — sessions ride the deterministic simulator — and this is stated in the PDU details rather than implied.
- The reduced FSM is Idle → OpenSent → OpenConfirm → Established. Receiving an OPEN while OpenConfirm or Established performs a full re-open (learned paths cleared, OPEN and KEEPALIVE re-sent); a KEEPALIVE in OpenConfirm establishes the session and immediately pushes the full current table as UPDATEs. Hold expiry — only tracked while OpenConfirm or Established — and configuration removal reset the session and withdraw the peer's paths.
- Updates advertise the sender's full current best-path set; local-AS is prepended, NEXT_HOP is rewritten to the sender's egress interface and the receiver validates it against the receiving subnet. A peer's own AS in the AS_PATH causes the entry to be dropped (loop prevention). A remote-AS mismatch to the configured neighbor sends NOTIFICATION and resets the session. Entries arrive in chunks of at most 100 with the final chunk marked `complete`; incomplete multi-chunk updates merge per prefix. AS paths are capped at 64 hops and peers at 2,048 learned prefixes.
- Best-path selection is shortest AS_PATH, then lowest next-hop address, then first seen. eBGP routes install at administrative distance 20 and never override directly connected subnets. A `network` statement announces a prefix only while an operational connected subnet matches it.
- eBGP peering is link-local: the neighbor must be directly connected (TTL 1) and frames that cannot be routed are dropped by the engine, leaving the peer in OpenSent.
- BGP control traffic also rides operational GRE tunnels: the tunneled OPEN/KEEPALIVE/UPDATE follows underlay routing and ARP, and the peer processes it on its Tunnel interface.

The model is a documented simplification: no TCP transport modeling, no iBGP sessions, route reflectors or confederations, no capabilities negotiation, communities, MED, local preference or route policies, no IPv6 address families, no route dampening, and no BGP-relevant `show` breadth beyond the commands listed above.

## Evidence

- `src/simulator/bgp.test.ts` — six packet-level tests: two-router establishment with CLI output (`show ip bgp`, `show ip bgp summary`); a real PC-to-PC echo reply over the learned route; a remote-AS mismatch that sends NOTIFICATION, blocks the routes and exposes reasons on both peers; `clear ip bgp *` reset with timer-driven reconvergence; link shutdown with hold-time expiry withdrawing the `B` route; and a three-router chain verifying AS-path prepending, relay through an uninvolved transit router and loop prevention.
- E2E flow F13 configures `router bgp 65001` / `neighbor 10.0.0.2 remote-as 65002` / `network 10.0.0.0 mask 255.255.0.0` from the browser CLI and verifies `show ip bgp summary`, `show ip bgp`, `show ip protocols` and running-config output.
- Current whole-repository verification is recorded in `LAUNCH_READINESS.md` and `HANDOFF.md`: 525/525 unit tests, lint zero errors with the 28 existing warnings, the optimized build with zero production-dependency advisories, and 45 of 46 production-browser flows — every functional flow passes including the new F13, while the realtime scale case passed all functional assertions (8/8 pings, queue peak 2,132, clean drain, no warnings) and exceeded its wall-clock pacing bounds only under sustained external host load (p95 tick interval 359.8 ms at load average 59; 66.7 ms on landing-day conditions; a pre-BGP A/B benchmark showed identical tick distributions).

## Remaining boundaries

Payloads are structured educational messages, not binary BGP-4 datagrams interoperating with real routers. The TCP transport handshake, iBGP, route policy attributes, multiprotocol extensions and larger real-world AS-path behaviors are out of scope for this reduced model. Packet Tracer comparison has not been performed for BGP output. The routing row in `REPLACEMENT_GATES.md` remains open.
