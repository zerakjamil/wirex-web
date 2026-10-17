# IPv6 implementation

Scope: IPv6 dual-stack support for the packet engine. This is the first workstream
for the `IPv6 and further Packet Tracer protocols` release gate in
`REPLACEMENT_GATES.md`. Target inventory: Packet Tracer 9.0.1, already captured in
`PT_RECON.md` and the internal case `work/pt901-uirecon/`.

Status: slices 1–5 (address layer, engine ICMPv6 + NDP, CLI + UI, SLAAC + DHCPv6, OSPFv3) implemented 2026-10-16/17.

## Slices

| Slice | Scope | Status |
| --- | --- | --- |
| 1. Address layer | `protocols/ipv6.ts`: parse/format (RFC 5952), prefix math, subnet membership, link-local/multicast classification, EUI-64 interface IDs, solicited-node multicast address + MAC, `address/prefix` CLI parsing. Covered by `ipv6.test.ts` | Done 2026-10-16 |
| 2. Engine ICMPv6 + NDP | Interface `ipv6Addresses` config, `ipv6NeighborTable`, Neighbor Solicitation/Advertisement in place of ARP, ICMPv6 Echo request/reply flows, connected + static IPv6 route lookup, host `ipv6DefaultGateway`, router forwarding with hop-limit decrement, `createPingPackets` accepts IPv6 targets, ping results complete on IPv6 echo replies. Covered by `ipv6Engine.test.ts` (5 tests) | Done 2026-10-16 |
| 3. CLI + UI | `ipv6 unicast-routing`, `ipv6 address <addr>/<prefix>` and `eui-64`, `no ipv6 address`, `ipv6 enable`, `ipv6 route <prefix>/<len> <next-hop>` (+ `no` form), `show ipv6 interface brief` / `show ipv6 interface <name>`, `show ipv6 route`, `show ipv6 neighbors`, running-config lines, `ping <v6-target>` accepted in CLI and the PC ping UIs, Config tab interface IPv6 field, Desktop IP app IPv6 address + gateway fields. Covered by `ipv6Cli.test.ts` (4 tests) plus E2E flow F08 | Done 2026-10-16 |
| 4. Autoconfiguration | SLAAC (router solicitation/advertisement, advertised /64 prefix + EUI-64 address formation, default gateway from the RA source), DHCPv6 client/server (`ipv6 dhcp pool` + `address prefix`, interface `ipv6 dhcp server <pool>`, Solicit/Advertise/Request/Reply over UDP 546/547 with server-side bindings), interface `ipv6 address autoconfig` / `ipv6 address dhcp`, `ipv6 nd managed-config-flag` / `other-config-flag`, `show ipv6 dhcp pool` / `show ipv6 dhcp binding`, Desktop IP app IPv6 mode selector (Static / Auto Config / DHCPv6). Covered by `ipv6SlaacDhcp.test.ts` (5 tests) plus E2E flow F09 | Done 2026-10-16 |
| 5. Routing protocols | OSPFv3: per-interface `ipv6 ospf <process> area <area>` (+ cost/priority), `ipv6 router ospf <process>` + `router-id`, link-local Hello to `ff02::5`, DBD/LSR/LSU/LSAck exchange, DR/BDR election, prefix LSAs, Dijkstra route installation as `O` IPv6 routes, `show ipv6 ospf` / `neighbor` / `database` / `interface`, `no ipv6 router ospf`, `no ipv6 ospf ... area`, running-config. Covered by `ospfv3.test.ts` (4 tests) plus E2E flow F10. RIPng not required by the target inventory (PT labs use OSPFv3) | Done 2026-10-17 |

## Slice 2 notes

- `PacketProtocol` gains `ICMPv6`; `PacketPdu.payload` gains
  `icmpv6Type` (`echo-request`, `echo-reply`, `neighbor-solicitation`,
  `neighbor-advertisement`) and `ndpTargetAddress`.
- `NetworkPort.ipv6Addresses` holds statically configured global addresses;
  the EUI-64 link-local address is derived from the MAC on demand (not stored).
- Frames are intercepted in the tick after the STP ingress check and handled by
  a dedicated IPv6 path for non-bridge devices; switches/hubs keep using the
  normal MAC-learning and flooding path, so multicast NS frames flood naturally.
- Router-created Neighbor Solicitations inherit `pingId` from the pending echo
  request, exactly like the ARP path (`outgoing.pendingPacket = pdu;
  outgoing.pingId = pdu.pingId`). Without this the ping result was marked
  failed mid-path because the ping id left the in-flight set.
- Tests cover: same-segment NDP + echo round trip with neighbor learning,
  default-gateway routing in both directions, static routes across two routers
  with next-hop neighbor resolution, no-route rejection, and unanswered
  solicitation failure (no fabricated echo reply).

## Slice 3 notes

- CLI anchors: config `ipv6 unicast-routing` / `ipv6 route` and interface
  `ipv6 address` / `no ipv6 address` / `ipv6 enable` in
  `src/simulator/ios/ciscoParser.ts`; show handling for `show ipv6 ...` lives in
  `handleShowCommands`; results travel through `newIpv6Routes` /
  `removedIpv6Routes` on `IosExecutionResult` and are applied to
  `device.ipv6RoutingTable` in `src/store/networkStore.ts`.
- `ipv6 address <addr>/<prefix>` replaces an entry for the same address and
  otherwise appends (multiple global addresses per interface are allowed, IOS
  style). `eui-64` requires a /64, masks the host bits and derives the interface
  ID from the port MAC; the result is stored as a normal static address.
- `ipv6 enable` is accepted and succeeds because link-local addressing is always
  available in this simulator (the link-local address is derived from the MAC on
  demand). Static link-local configuration (`ipv6 address fe80::1 link-local`)
  is rejected with an explanatory message; it is not supported yet.
- `ipv6 route <prefix>/<len> <next-hop>` is next-hop only (no interface form, no
  AD/metric keywords). Because the CLI stores no egress interface, the engine
  resolves the port at forward time: the route's `interfaceName` is matched
  first, then it falls back to an up port with a configured IPv6 address that is
  on-link with the next hop. Unresolvable static routes are skipped, matching
  the "route present but inactive" IOS behavior in spirit.
- Connected IPv6 routes are not stored; `show ipv6 route` derives them from
  operational port addresses (single source of truth). Static entries show as
  `S` with `[1/0]`; future OSPFv3 entries will show as `O` with distance 110.
- Divergence from PT worth knowing: routers in this simulator forward IPv6 by
  default (`config.ipv6Routing !== false`), where PT requires
  `ipv6 unicast-routing`. The command is accepted and flips the flag in both
  directions, so labs that follow PT steps behave identically; only an omission
  behaves differently. Documented in the gate row as a known simplification.
- UI: the Config tab interface editor gets an `IPv6 Address/Prefix` field, and
  the Desktop "IP Configuration" app gets IPv6 address + IPv6 default gateway
  fields. Both address inputs keep a local draft so partially typed text is not
  committed until it parses as `address/prefix`; on blur the field snaps back to
  the committed canonical value. New i18n labels exist in EN/AR/CKB.
- Not yet supported (tracked for later slices or the gap map): IPv6 addressing
  in `config-subif` sub-interfaces, static link-local addresses, IPv6
  access lists/tunnels, and VT interface-level `show ipv6` variants beyond
  the implemented ones.

## Slice 4 notes

- SLAAC anchors: an interface with `ipv6 address autoconfig` (or `ipv6 address
  dhcp`) sends a Router Solicitation (ICMPv6 type 133) to `ff02::2`; any up
  router interface with IPv6 routing enabled answers with a Router
  Advertisement (type 134) to `ff02::1` carrying its on-link /64 prefixes, the
  managed/other config flags and a router lifetime. Hosts with autoconfig
  form `prefix + EUI-64` addresses (`source: 'slaac'`) and set
  `config.ipv6DefaultGateway` to the RA source link-local address. The RA is
  multicast, so switches flood it to the whole segment like other IPv6
  multicast.
- DHCPv6 is packet-level like DHCPv4: Solicit (UDP 546 -> 547, sent to
  `ff02::1:2` / `33:33:00:01:00:02`, hop limit 1) from the client, Advertise
  and Reply unicast back from the server, Request unicast to the server. The
  `DHCPv6` protocol label in the engine rides the same IPv6 intercept as
  `ICMPv6`; switches still flood by destination MAC.
- Server side: `ipv6 dhcp pool <name>` enters `config-dhcpv6` mode where
  `address prefix <prefix>/<len>` (stored on `config.dhcpv6Pools`),
  interface `ipv6 dhcp server <pool>` binds a pool to the interface. A router
  answers on interfaces with a bound pool; a non-router device with
  `dhcpv6Pools` (a future server-side service) answers with its first pool.
  Allocation starts at `<prefix>::100` (or the pool's `startAddress` when
  present) and skips the server's own addresses and existing bindings
  (`config.dhcpv6Bindings`); requested addresses are honored when free.
- Client side: `ipv6 address dhcp` sets the port flag and both a Router
  Solicitation and a DHCPv6 Solicit are emitted (the RA supplies the default
  gateway, the Reply the address, stored as `source: 'dhcpv6'` plus a
  `config.dhcpv6Lease` record). Host-mode switches from the Desktop IP app
  (`setIpv6HostMode`) drive the same packet paths as the CLI.
- Dynamic addresses never appear in `show running-config`; the config lines
  (`ipv6 address autoconfig`, `ipv6 address dhcp`) print instead. Removing
  the mode strips its addresses (`no ipv6 address autoconfig` / `dhcp`).
- Known simplifications / by-design limits:
  - RA flags (`managed-config-flag`, `other-config-flag`) are advertised but
    do not change host behavior: an `ipv6 address dhcp` host always runs
    DHCPv6, and autoconfig hosts never fall back to DHCPv6 on the M flag.
  - SLAAC and DHCPv6 address formation is immediate (no DAD/duplicate address
    detection, no RS retransmission timers, no lease renewal, no DHCPv6
    Release/Information-Request/Relay).
  - Routers do not send periodic unsolicited RAs; only advertised in response
    to a solicitation, so all control traffic is event-driven in the
    simulator.
  - The DHCPv6 client sends its Request to the server that advertised
    (unicast on the segment); server reachability is immediate (no
    transaction timers/retries).
  - Sub-interfaces, IPv6 ACLs and DNS-via-DHCPv6 options are out of scope for
    this slice.

## Slice 5 notes

- OSPFv3 lives in `src/simulator/ospfv3.ts`, a deliberate mirror of the proven
  OSPFv2 state machine in `ospf.ts`: same Hello/DBD/LSR/LSU/LSAck exchange,
  DR/BDR election, flooding and SPF. IPv6 differences are the point: link-local
  sources, `ff02::5` / `33:33:00:00:00:05` AllSPFRouters multicast, prefix
  (not netmask) LSAs, router-IDs only in DR/BDR fields, and `O`-type IPv6
  route installation.
- Enablement: `ipv6 router ospf <1-65535>` enters `config-rtr` mode
  (` router-id <A.B.C.D>`), an interface joins with
  `ipv6 ospf <process> area <area>` plus `ipv6 ospf cost <1-65535>` and
  `ipv6 ospf priority <0-255>`. One process per device (mismatched process
  numbers are rejected); numeric area IDs only (no dotted-quad areas, no
  multi-area processes beyond what the LSA DB models per area).
- Router-ID sourcing follows IOS-adjacent behavior: `router-id` config first,
  then the runtime's own ID, then the highest IPv4 address on the device.
  Without either (a pure IPv6 device with no `router-id`), OSPFv3 does not run
  and the runtime is stripped — the CLI hint appears in tests' negative case.
- The engine tick pipeline runs `prepareIpv6OspfTick` between the OSPFv2 and
  RIP passes; outbound control intents ride the same `sendControl` path as the
  other routing protocols. IPv6 frames with `protocol 'OSPF'` and
  `etherType '0x86DD'` are delivered to `receiveOspfv3Packet` before the
  generic MAC filter, so routers accept them and non-OSPFv3 devices reject
  them with a logged reason (same shape as OSPFv2 on PCs).
- Learned routes are installed on `device.ipv6RoutingTable` as
  `{ type: 'O' }` with the neighbor's link-local next hop, the egress
  interface name and the SPF metric; `outgoingIpv6Route` and `show ipv6 route`
  already knew about distance 110, and the store strips `O` routes whenever the
  OSPFv3 runtime resets. Entries are deduplicated by *prefix* (equivalent
  prefixes from different routers on one segment collapse to the lowest
  metric), and prefixes that overlap the router's own connected subnets are
  never installed.
- Timing model: Hello 10 s / Dead 40 s fixed, the standard 40 s DR-election
  wait before the first election (tests must drain past ~700 ticks before an
  adjacency reaches Full), max-age 3600 s, retransmit 5 s, 30-minute LSA
  refresh.
- Known simplifications / by-design limits:
  - Fixed Hello/Dead intervals (no `ipv6 ospf hello-interval|dead-interval`),
    no `ipv6 ospf network point-to-point` override (serials are
    point-to-point automatically), no passive-interface, no authentication
    (IPsec trailer), no instance IDs.
  - No multi-area originate for a second area's process; the runtime tracks
    interfaces and LSAs per area, which is what the (single-process,
    multi-area-capable) labs need.
  - No IPv6 ECMP (lowest metric wins on prefix dedupe), no LSA aging removal
    from `show ipv6 route` before max-age, no graceful restart.
  - `no ipv6 router ospf <process>` clears the runtime and instantly withdraws
    local `O` routes; remote routers drop the prefixes after their own dead
    interval, matching the tested topology-timeout behavior.

## Rules

- One canonical formatting path (`formatIpv6`); stored values are canonical
  compressed lowercase.
- Addresses are 128-bit BigInt internally; every boundary gets unit tests.
- No BigInt literals (tsconfig target ES2017); use `BigInt(...)`.
- Each slice lands with packet-level positive and negative tests, and the full
  `npm test` suite plus `npx tsc --noEmit` stay green.
- When a slice lands with observable packet behavior, record the evidence in
  `REPLACEMENT_GATES.md` and the parity artifacts.
