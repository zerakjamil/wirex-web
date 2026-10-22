# Cyber Observer implementation

PT 9.0.1's **Cyber Observer** is modelled as a real Security appliance with a
browser management console. It is not a Network Controller alias: it has its
own hardware, state, discovery snapshot format, inventory, findings and UI.

## Hardware

- Model `CyberObserver`, internally `type: 'security'` with no ASA, NAT,
  inspection, routing-table or ASDM defaults.
- Two fixed copper gigabit interfaces (`GigabitEthernet0`,
  `GigabitEthernet1`), no module bays, no built-in switch ports.
- Factory name `CyberObserver<index>`, 2U rack height, 5 W draw.
- In-house 2U monitoring-appliance chassis: bronze face, shield/radar panel,
  `PWR`/`SYS`/`MON` lamps, and the two real interface jacks. The rear face shows
  the fan and power inlet. No vendor artwork is used.
- The device has **no Desktop, native GUI, CLI or ASDM tab**. The Config tab
  shows the management URL and account state. The product console is reached
  from another PC.

## Management path

1. Place a PC on the same reachable network as the appliance.
2. Configure the PC and one Cyber Observer interface with addresses in the same
   subnet, and connect the interfaces with an active link.
3. Open the PC's **Desktop → Web Browser** and browse to
   `http://<observer-management-ip>`.

The engine serves an HTTP 200 fallback document (`CYBER_OBSERVER_HTTP_PAGE`)
from the appliance. When the browser receives a successful HTTP transaction
whose `destinationDeviceId` resolves to a Cyber Observer, it renders the
interactive console instead. The console is loaded with `next/dynamic`, so it
does not inflate the initial canvas bundle or the simulation-scale case.

## Account setup and login

- First visit creates a local administrator account in the console.
- The stored value is a deterministic FNV-1a 32-bit classroom digest, never the
  plaintext password. This is obfuscation for a shared lab file, **not a
  security boundary**; workspace files are not encrypted.
- State lives in
  `DeviceConfig.cyberObserver = { accounts, discoveries, lastDiscoveryId }`.
- The workspace schema validates account names, digest shape, discovery IDs,
  statuses, reasons, timestamps, unique device IDs and IPv4 ranges.
- The signed-in session is runtime-only and resets when the window is closed.

## Discovery

The appliance supports two real modes:

- **Connected topology** walks active-link adjacency from the appliance,
  includes itself, and inventories every reachable powered device that has a
  configured management IPv4 address. Intermediate unaddressed switches are
  traversed but not inventoried.
- **IP range** uses the same reachable set and keeps configured addresses inside
  the inclusive IPv4 start/end range. The appliance itself is always included so
  the snapshot can represent the monitoring point.

Discovery requires the appliance to be powered, addressed and attached to at
least one active link. Failure reasons are stable codes: `power-off`, `no-ip`,
`no-active-link` and `invalid-range`. Every run, including a failed run, is
stored as a snapshot with a timestamp, mode, optional range, status and device
IDs. Snapshots are capped at 20. Selecting an older snapshot switches the
inventory and topology to that historical device set; deleting a device later
filters it out of live inventory while the saved snapshot keeps its IDs.

The implementation follows **active-link adjacency**, not scan packets, CDP or
an external controller. The UI states this. It does not emit probe traffic.

## Inventory and status

Inventory is the selected snapshot resolved against the live device list. Each
row shows the device name, model, first management address, finding count and
status:

- `active` — powered, has a management address, and at least one addressed
  interface is administratively and physically up.
- `idle` — powered and addressed, but no addressed interface is up.
- `no-ip` — powered but has no configured management address.
- `off` — powered off.

The appliance includes itself in its own inventory.

## Findings

Findings are configuration checks over the live discovered inventory. They are
**not CVEs** and do not claim a vulnerability database. The console states that
no external CVE feed or firmware matching is modeled.

| Code | Severity | Evidence and check |
| --- | --- | --- |
| `default-password` | critical | An admin-like account on a modeled Network Controller or Cyber Observer hashes to `cisco`, `admin`, `password` or `1234` |
| `http-management` | medium | The appliance's management address is served over plain HTTP |
| `open-wireless` | high | An autonomous AP uses open authentication, or an enabled WLC WLAN uses no security |
| `wep-wireless` | high | An autonomous AP or enabled WLC WLAN uses WEP |
| `default-snmp` | medium | A device exposes the `public` or `private` SNMP community |
| `permit-any-inbound` | medium | An ISA-3000 data interface has a permit-any rule in its inbound ACL |
| `unreachable` | high | A snapshot member is powered off |
| `management-address-missing` | medium | A snapshot member has no configured management address |

Findings carry the raw simulator evidence (username, URL, SSID, community,
interface/ACL or device name) and a remediation string. They are sorted by
severity, device name and stable ID. The findings view filters by severity; the
dashboard shows counts and the top five.

## Console surfaces

- **Dashboard** — discovered-device count, open findings, critical/high counts,
  last discovery, top findings and live device health.
- **Discovery** — connected or IPv4-range run, optional name, persisted history,
  view/delete actions and stable failure notices.
- **Network devices** — snapshot inventory, management addresses, active links,
  per-device finding list and details.
- **Findings** — severity filter, evidence and recommended action.
- **Assurance** — device topology from canvas positions and active links,
  coloured by worst finding severity, with a selectable detail panel and legend.

## Deliberate omissions

The following PT-only surfaces are not faked because the simulator has no
corresponding state:

- external CVE/vulnerability database and CVE matching
- firmware inventory, firmware upgrade and firmware-to-CVE correlation
- threat mitigation/response actions
- the PT IE-9320 network sensor
- automatic new-device detection after a snapshot
- multi-user accounts, RADIUS/LDAP, roles or HTTPS management
- clientless VPN and live controller interoperation
- a native Cyber Observer Desktop/GUI/CLI shell
- active scan/probe traffic or packet-level discovery

## Tests

- `src/simulator/cyberObserver.test.ts` — 14 tests covering fixed hardware and
  HTTP service, management-address selection, connected and IP-range discovery,
  unmanaged-switch traversal, failure reasons, snapshot inventory, device
  status, configuration findings, WEP/open WLANs, unreachable/addressless
  members and digest behavior.
- `src/simulator/workspaceSchema.test.ts` — a Cyber Observer account and
  discovery round-trip plus invalid-account, invalid-range and invalid-status
  rejection.
- `e2e/cyber-observer.spec.ts` — two fixed NICs, no modules or native
  Desktop/CLI/ASDM, physical chassis, Config management URL, PC browser setup,
  discovery, inventory, findings, topology, sign-out/login and persisted state.

## Verification

- `npm test` 702/702 at the Cyber Observer checkpoint; 724/724 at the 2026-10-22 Academy checkpoint (14 Cyber Observer unit tests plus the workspace-schema round-trip and targeted browser flow)
- `tsc --noEmit` clean
- ESLint 0 errors / 28 existing warnings
- `npm run electron:prep` green
- targeted Cyber Observer browser flow 1/1
- full production-browser suite and the unchanged simulation-scale bound are
  recorded in `docs/HANDOFF.md` for the release run
