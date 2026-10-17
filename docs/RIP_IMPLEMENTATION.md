# RIP implementation, 2026-10-11

## GRE keepalive and alternate-underlay regressions, 2026-10-12

RIPv2 now has regressions proving that a remote LAN route disappears after GRE keepalive declares Tunnel0 down and returns after the peer destination is repaired, and that a learned route remains installed after the preferred underlay interface is shut. With FastEthernet0/0 down, the test confirms the route stays on Tunnel0 and a returned PC ping's GRE packet exits FastEthernet0/2. The backup fixture does not prove the primary path was passing traffic before failure, and its reply-side route is static, so verified end-to-end dynamic failover remains open. Keepalive recovery allows up to 750 ticks for the peer's periodic RIP update, or 37.5 simulated seconds at the current 50 ms tick; this is a bounded teaching model, not exact IOS wall-clock timing. Focused suites pass: RIP 18/18 and GRE 8/8. The full check passes 347 tests, TypeScript, production build and the zero-vulnerability production dependency audit. The production browser test now confirms RIP route withdrawal and recovery after GRE keepalive failure; browser backup-egress acceptance remains open.

RIP now learns routes from simulated control packets and uses them to forward traffic. It is no longer configuration-only. This completes a routing increment, not the full Packet Tracer replacement release gate.

## Student workflow

Open Help > Practice Labs > RIP route learning and failover. The five-device lab contains three routers, two student PCs and an alternate transit path. On R1, use `enable`, `show ip protocols` and `show ip route`. Student-A can run `ping 192.168.3.10`. Shut R1's GigabitEthernet0/2: the remote LAN changes from metric 1 through R3 to metric 2 through R2. Restore it with `no shutdown`.

Supported controls include `router rip`, classful `network`, `version 1`/`version 2`, `no version`, `auto-summary`/`no auto-summary`, passive interfaces/default/exceptions, `no network` and `no router rip`. Running configuration, internal PKT round trips and browser-local restoration retain these controls. Runtime neighbors, candidate routes and learned O/R routes are discarded on restoration so discovery starts again.

## Packet and timer behavior

- Version 2 updates use 224.0.0.9; default version 1 sends broadcasts. Interfaces must be enabled, powered and operational. Updates stay within their link/VLAN scope. RIPv2 control packets can also use an operational GRE tunnel: the outer packet follows underlay routing and ARP, then the peer processes the update on its matching Tunnel interface. A two-router regression learns the remote LAN through Tunnel0 and carries a returned PC-to-PC echo.
- Learned routes use administrative distance 120, hop-count metrics and a deterministic next-hop tie break. Metric 16 is unreachable. Poison reverse is sent toward the supplying interface; local interface loss also withdraws its network.
- Periodic updates occur every 30 simulated seconds, triggered updates are coalesced for 1 second, routes become invalid after 180 seconds of silence, and invalid candidates are retained for another 60 seconds. These are simulation ticks, frozen by Pause and advanced by Capture/Forward.
- Responses contain at most 25 entries; candidate tables are capped at 2,000 and routing-source records at 512. The shared in-flight queue remains capped at 256. Queue overflow is reported.
- Version mismatch, malformed metrics, off-subnet peers and UDP/520 ACL rejection cannot install routes. `show ip protocols` exposes the last RIP validation failure. PDU inspection exposes the structured request/response and route entries.

The metric, update, timeout and poison-reverse model follows [RFC 2453](https://www.rfc-editor.org/rfc/rfc2453.html). The 60-second garbage interval differs from the RFC's 120-second garbage-collection timer. There is no holddown timer or randomized update jitter.

## Evidence

`rtk npm run check` passed 260 tests at the initial RIP release checkpoint. Eighteen RIP tests now cover actual control traffic, returned ICMP, GRE transport, keepalive-driven route withdrawal/recovery, passive reception, version mismatch, ACL denial, pause/step, timeout/flush, poison reverse, malformed input, summary/VLSM behavior, practice-lab failover and restoration. The GRE backup-underlay case is in `src/simulator/gre.test.ts`. Current whole-repository verification is recorded in `LAUNCH_READINESS.md`.

Fresh production browser acceptance on 127.0.0.1:3005 verified loading the RIP lab, initial metric 1, shutdown failover to metric 2, an actual echo reply over the alternate path, configuration restoration after reload, and return to metric 1 after `no shutdown`. No browser errors/warnings were captured during that flow. Arabic dark-mode catalog layout was inspected at desktop and 390-pixel widths; Central Kurdish controls were exercised. This is not native language proofreading or whole-app responsive acceptance.

The live check caught a connected route displayed for a shut interface. `show ip route` now suppresses disconnected/down connected entries and restores them when the interface is operational. A failing reproduction test passed after the fix. The stale hard-coded practice-lab count was also removed.

![Final production CLI after shutting the direct transit interface: metric 2 through R2, without the down connected network](rip-browser-failover.jpg)

## Remaining boundaries

Payloads are structured educational messages, not binary RIP datagrams interoperating with real routers. GRE transport has RIPv2 route-and-ping, keepalive withdrawal/recovery and alternate-egress regressions plus production browser acceptance for the learned tunnel route; keepalive recovery allows the peer's next periodic update, up to 37.5 simulated seconds. The backup-egress regression uses a static return route, so bidirectional dynamic-protocol failover is not yet verified. Broad underlay failure/convergence combinations remain open. Authentication, route tags, explicit next-hop fields, redistribution, default origination, offset lists, ECMP, per-interface version overrides, custom timers, holddown and RIPng are not implemented. Triggered responses advertise the full supported table. Large campus performance and instructor acceptance remain open.

Internal PKT round trips are not official Cisco interoperability certification. Rewriting routing configuration on export currently does not preserve unknown directives inside imported RIP/OSPF sections. Do not export a complex official lab as a lossless backup until that metadata-preservation gate is addressed. Keep the original PKT file.

Review checked protocol bounds, admission, pause behavior, persistence and forwarding outcomes. New dependencies were not added. Protocol state can still cause device-window rerenders; canvas selectors and autosave ignore runtime-only updates. The unused exported `stripOspfRuntime` and `stripRipRuntime` helpers remain pending cleanup; the shared `stripRoutingRuntime` now handles both.

Next increment: actual TCP/UDP exchanges and DNS/HTTP applications with protocol-specific PDU creation and inspection. Full replacement release gates remain in `REPLACEMENT_GATES.md`.
