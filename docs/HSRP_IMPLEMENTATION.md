# HSRP gateway redundancy

wireX models HSRP groups on routed router interfaces and multilayer-switch SVIs. Supported IOS configuration is `standby <group> ip <virtual-ip>`, `standby <group> priority <0-255>`, and `standby <group> preempt`; `show standby [group]` reports configured VIP, priority, preemption and the current local election state. The virtual gateway uses the HSRP v1 MAC pattern `00:00:0c:07:ac:<group>`.

The default 14-device enterprise campus uses HSRP group 10 on VLAN 10 and group 20 on VLAN 20. Its client-facing gateways remain `192.168.10.1` and `192.168.20.1`. Switch1 owns physical SVI addresses `.10.2` and `.20.3`, and is preferred for VLAN 10; Switch2 owns `.10.3` and `.20.2`, and is preferred for VLAN 20. The preference split keeps both cores active while retaining a standby gateway in each VLAN. The VLAN 20 DHCP pool starts at `.4` because `.1` is virtual and `.2`/`.3` belong to the physical SVIs.

When a preferred core loses power, its groups elect the operational peer and the engine flushes learned copies of the virtual MAC. End-to-end packets then use the remaining core. On recovery, the configured higher-priority `preempt` member becomes active again. Switch ports still follow their own STP startup and reconvergence timers, so gateway election can precede user-data forwarding. The regression verifies that the transient loss is visible and traffic succeeds once the forwarding path reconverges.

## Verification

- Packet-engine integration configures two routers with two HSRP LANs, resolves and routes a real ping through the virtual gateway, powers off the active router, confirms standby takeover, restores the higher-priority preempting router and verifies traffic after the connected switch ports return to forwarding.
- The default-campus store integration confirms split active roles, routed traffic, Switch1 power failure, Switch2 takeover, successful inter-VLAN traffic, and preemptive failback after STP convergence.
- Production-browser acceptance inspects the default campus HSRP groups, sends VLAN and inter-VLAN traffic, takes Switch1 down, verifies Switch2 becomes the VLAN 10 active gateway and delivers a packet, restores Switch1, and checks `show standby 10` in its CLI window.
- PKT import tests apply HSRP commands to the live model, including removal commands. PKT export/import tests preserve live group settings, replace a stale supported VIP, and retain imported HSRP timer directives that the engine does not yet implement.
- Workspace tests preserve HSRP configuration and remove transient elected-role state so election is recomputed after reload. Validation rejects duplicate/invalid groups, bad priorities, non-boolean preemption and virtual IPs outside the interface subnet.
- `rtk npm run check` passes 396 tests, TypeScript and an optimized production build; lint reports zero errors and 28 warnings; the production dependency audit reports zero advisories. The full production-browser suite passes 27/27.

## Current limits

The simulator performs a deterministic election from configured priority, interface IP and operational links. It does not send HSRP Hello packets, model active/standby timers, authentication, object/interface tracking, HSRP v2, IPv6 HSRP, GLBP or VRRP. Power/link failure is the implemented failover trigger; routing-path degradation that leaves the HSRP interface operational does not trigger a role change. STP may delay traffic after a core is restored. HSRP does not close the wider VLAN/router-on-a-stick, official Packet Tracer interoperability, instructor acceptance or full replacement release gates.
