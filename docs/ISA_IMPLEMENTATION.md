# ISA-3000 industrial security appliance

The ISA-3000 is a real palette model under **Security** and a product-specific
industrial chassis with a routed firewall surface. It is not an alias of the
ASA 5505/5506-X and it does not expose ASDM.

## Hardware

The model layout comes from the PT 9.0.1 sample lab
`Industrial Cybersecurity and Monitoring/Firewall/isa3000_dmz.pkt`:

| Port | Media | Nameif | Security level | Default admin state |
| --- | --- | --- | --- | --- |
| `GigabitEthernet1/1` | fiber SFP | `outside1` | 0 | up |
| `GigabitEthernet1/2` | fiber SFP | `inside1` | 50 | up |
| `GigabitEthernet1/3` | copper | `outside2` | 0 | down |
| `GigabitEthernet1/4` | copper | `inside2` | 100 | up |
| `Management1/1` | copper | `management` | 100 | down, `192.168.1.1/24` |

The appliance has no module bays. The Physical tab groups the SFP uplinks, the
copper data ports, management and the local console separately, with industrial
status LEDs. Model names are nominative; the chassis art is clean-room CSS/SVG.

## Firewall app

The **Firewall** tab manages the inbound extended ACL on one of the four data
interfaces. Management is intentionally excluded.

Each data interface starts with the PT sample's baseline:

```text
access-list outside1_access_in extended permit ip any any
...
access-group outside1_access_in in interface outside1
```

The app can add four kinds of deny rule:

- block a source IPv4 host (all protocols);
- block a destination IPv4 host (all protocols);
- block a supported traffic type (HTTP/TCP 80, DNS/UDP 53, SMTP/TCP 25,
  POP3/TCP 110, TFTP/UDP 69, SNMP/UDP 161, NTP/UDP 123, ICMP echo);
- block one of those traffic types from a source IPv4 host.

New deny rules are inserted above the trailing permit-all rule. The table
renders the full draft that will replace the selected interface ACL, including
remarks and any rules imported from the CLI. Rules can be reordered or removed,
and **Restore permit all** puts a single baseline permit back at the bottom.
**Save Config** writes the ACL and binds it to the interface; **Discard
Changes** restores the saved list. The Equivalent CLI pane shows the exact
ASA-style `access-list ... extended` and `access-group` lines that the save will
produce.

Host rules use `sourceWildcard`/`destWildcard: '0.0.0.0'`, so running-config
prints `host 10.0.0.5` rather than an `undefined` wildcard. The engine evaluates
the saved ACL on inbound packets before forwarding, and the unit suite covers a
real denied ICMP packet and the same packet forwarded after the deny is removed.

## Deliberate boundaries

- Routed firewall behavior only. The sample lab configures `firewall
  transparent`; transparency mode is not modeled and is not exposed as a dead
  control.
- No clientless VPN, global ASA settings, NAT rules, URL/FQDN objects, DPI or
  deep inspection, active/standby failover, or ASDM.
- Only the traffic types listed above are offered. There is no HTTPS, syslog or
  arbitrary port/object control.
- The app owns the selected interface ACL when it saves. It renders every rule
  it will rewrite, so manual CLI rules are visible before replacement.
- No external acceptance against a live ISA-3000 or instructor lab yet. The
  replacement gate for full ASA/security parity stays open.

## Verification

- `src/simulator/isa.test.ts`: hardware layout, default ACL bindings, rule
  builder for all four block kinds, insertion above the baseline, ACL
  formatting, and a packet-level deny/allow path through `stepSimulationTick`.
- `e2e/isa-firewall.spec.ts`: palette placement, tab set (no ASDM), physical
  ports, baseline rule, add/save workflow, equivalent CLI and persisted ACL
  state.
- `npm test` 650/650, `tsc` clean, lint 0 errors / 28 existing warnings,
  `electron:prep` green, targeted ISA E2E 1/1, and the full production-browser
  suite 74/74 with the unchanged simulation-scale bound at 459 ms (p95 tick
  83 ms, engine p95 8.3 ms, 8/8 pings, queue peak 2,132).
