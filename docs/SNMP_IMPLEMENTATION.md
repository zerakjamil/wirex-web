# SNMP teaching model, 2026-10-12

## Supported workflow

Routers and switches can configure an SNMPv2c read-only community from IOS:

```text
enable
configure terminal
snmp-server community classroom ro
snmp-server contact NetLab
snmp-server location Building A
end
show snmp
show running-config
```

The community may omit `ro`, which is the simulator's only supported access mode. `rw` is rejected with an explicit message. `no snmp-server community <name>` removes one community; `no snmp-server community` removes all. Contact and location accept up to 255 characters. Communities accept 1 to 64 ASCII letters, digits, periods, underscores or hyphens and are persisted with the workspace.

Server-PT Config has an SNMP service panel to enable or disable the agent, add/remove read-only communities, and set system contact and location. PC and laptop Desktop exposes an SNMP Manager with the agent IPv4 address, community, operation and numeric OID fields. Requests follow the normal ARP, Ethernet, VLAN, routing and UDP ACL path to port 161. A response completes the manager transaction only after it returns to the source device.

The scalar system objects are `sysDescr.0` (`1.3.6.1.2.1.1.1.0`), `sysContact.0` (`1.3.6.1.2.1.1.4.0`), `sysName.0` (`1.3.6.1.2.1.1.5.0`) and `sysLocation.0` (`1.3.6.1.2.1.1.6.0`). GET of an unknown object returns `noSuchObject`; GETNEXT selects the next supported numeric OID and returns `endOfMibView` after the final object. The description is generated from the device model and wireX simulator identity. Contact, name and location come from device configuration.

## Boundaries

This is a routed protocol teaching model. Packet payloads carry structured SNMP fields as simulator metadata, not encoded BER bytes. It does not implement SNMPv1, SNMPv3, SET/write access, traps/informs, MIB tables beyond the four system scalars, engine IDs, views, authentication/privacy, UDP retransmission or raw SNMP wire serialization. The community is visible to the simulation inspector because SNMPv2c communities are not encrypted.

The request and response PDU model follows the `GetRequest`, `GetNextRequest` and response semantics in [RFC 3416](https://www.rfc-editor.org/rfc/rfc3416.html). The IOS community configuration syntax is based on the [Cisco IOS SNMP command reference](https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/snmp/command/nm-snmp-cr-book/nm-snmp-cr-s2.html); this simulator deliberately limits communities to read-only access.

## Verification

Packet regressions cover a routed GET, GETNEXT ordering, end-of-MIB, unsupported OID, disabled agent, invalid community, malformed OID, client transaction completion, IOS configuration and `show` output, and workspace validation. Production-browser acceptance configures a router through IOS and queries it from a PC, checks a failed community, then configures Server-PT service fields and reads system location. The full production-browser suite passed 10/10. `rtk npm run check` passed 330 tests, lint with zero errors and 31 existing warnings, the production build, a 15-asset offline manifest and `npm audit --omit=dev` with zero vulnerabilities.
