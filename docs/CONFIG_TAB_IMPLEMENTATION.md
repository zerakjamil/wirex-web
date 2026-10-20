# Config Tab Implementation

Packet Tracer's Config tab is the form front-end for Cisco IOS configuration.
wireX renders the same four-level category tree, keeps the form edits and the
engine in sync, and shows the equivalent IOS commands at the bottom of the page.
The surrounding device window uses Packet Tracer's per-device tab sets and its
compact 22 px control density.

## Tree model

`src/simulator/configPages.ts` is a pure function over device state:

| Group | Pages | Applies to |
| --- | --- | --- |
| GLOBAL | Settings, Algorithm Settings | every device; Algorithm Settings on routers, switches, PCs, laptops, servers, tablets and smartphones (not printers) |
| ROUTING | Static, RIP | routers, L3 switches (3560/3650) |
| SWITCHING | VLAN Database | switches, routers 1841/2811 |
| INTERFACE | one page per port | any device with ports |

The captured Packet Tracer 9.0.1 reference for a Cisco 1841
(`replica/pt-9.0.1/config-Router1.json`) contains the same eight pages: Settings,
Algorithm Settings, Static, RIP, VLAN Database and three GigabitEthernet
interfaces.

## Page behavior

- **Settings** — Packet Tracer's Global Settings layout: Display Name, then
  Hostname / Device Clock / NVRAM only on IOS devices. Display Name is
  `device.name` and is independent of `config.hostname`; the window title and
  canvas label use the display name, falling back to the hostname and model.
  NVRAM holds Startup Config and Running Config blocks with PT's six actions:
  save running config to NVRAM, erase NVRAM, export running/startup config to
  file, load a file into startup config, and merge a file into the running
  config (merged lines are executed through the IOS parser so they take effect).
  End devices get the IP Configuration Static/DHCP radios, gateway/DNS fields,
  and an IPv6 Static/Auto Config pair backed by `setIpv6HostMode` on the primary
  Ethernet port.
- **Algorithm Settings** — PT's Global Settings override checkbox plus the TCP
  parameters persisted in `config.algorithmSettings`. While the checkbox is
  ticked the page shows `ALGORITHM_DEFAULTS` and the inputs are disabled;
  unticking stores the local override. This page has no Cisco IOS equivalent,
  so the command pane says so.
- **Static Routes** — network/mask/next-hop form plus a table of `type: 'S'`
  routes. Add and Remove run `ip route` / `no ip route` through
  `executeIosCommand`, so the routing engine installs and withdraws the route.
- **RIP** — network statements stored in `config.ripNetworks`, which
  `src/simulator/rip.ts` reads directly.
- **VLAN Database** — VLAN number/name form backed by `config.vlans`; Add and
  Remove run the `vlan` / `name` / `no vlan` CLI path.
- **INTERFACE** — existing per-port editor: MAC, port status switch, IPv4, IPv6
  and (on switches) access/trunk mode with the access VLAN.

## Device window tabs

Tabs are assembled per device family, mirroring PT 9.0.1:

| Family | Tabs |
| --- | --- |
| routers, switches, security appliances | Physical, Config, CLI, Attributes |
| wireless LAN controller | Physical, Config, GUI, CLI, Attributes |
| PCs, laptops, servers, tablets, smartphones | Physical, Config, Desktop, Attributes; servers add Services |
| IP phones | Physical, Config, GUI, Attributes |
| access points, hubs, clouds, modems, printers, TVs, IoT | Physical, Config, Attributes; IoT adds IoT |

The Attributes table comes from `src/simulator/deviceAttributes.ts`, a table
harvested from the `EXT_ATTRIBUTES` blocks in PT's bundled `.pkt` labs (93
models) with category fallbacks. It shows MTBF, cost, power source, rack units,
wattage, PT_MODEL and PT_VERSION; the bottom row has PT's Top checkbox and
Refresh action.

## Wireless access points

Autonomous access points and home routers expose PT's wireless interface fields
under INTERFACE on the radio port: SSID, Channel (1-11 with the 2.4 GHz
frequency shown), Authentication (Open, WEP, WPA-PSK, WPA2-PSK), the WEP key,
the WPA passphrase and AES/TKIP encryption. The values live on `DeviceConfig`
(`wirelessSsid`, `wirelessChannel`, `wirelessAuthentication`,
`wirelessPassphrase`, `wirelessWepKey`, `wirelessEncryption`).

`apAdvertisedWlans` turns that state into the profile a client sees. The
PC/laptop PC Wireless site survey shows the configured SSID, channel and
security, and requires a matching key before associating; a wrong key leaves the
device unassociated and shows an inline error. WPA-PSK and WPA2-PSK share the
simulator's reduced `wpa2-psk` profile (no four-way handshake or per-client
PMK). WEP accepts a 10-digit hexadecimal key.

Auto-association on power-up or device creation is limited to open access
points. Secured access points require the site-survey key. An AP radio may carry
several client associations; a client radio holds one. Wireless link lookup
matches both the device and port ID because module-created ports reuse names
such as `Wireless0`.

Lightweight access points show a read-only note in place of the autonomous
fields because their SSID and security come from the WLC. Channel values are
advertised to clients but do not model RF interference.

## Server Services

The server Services tab uses PT's left service list. Implemented services are
HTTP (enable flag plus the HTML served at `/`), DHCP (address-pool editor writing
`config.dhcpPools`, including a starting IP that seeds the first lease), DNS,
TFTP, Email, NTP (master flag plus stratum, served over UDP 123), IoT Server,
SNMP and UDP Echo. The same service panes open from the
server Desktop tiles, with a Back to Desktop control. AAA, Syslog and FTP
are not listed because the simulator does not implement them yet.

## Command sequences

Config actions that touch the engine send a normalized IOS sequence through the
CLI: `enable` only when the device is in user mode, `end` when it is inside a
config submode, then `configure terminal`, the command and `end`. The device is
left in privileged mode, exactly like a CLI user who finished configuring.

## Equivalent IOS Commands pane

`equivalentIosCommands(device, pageId)` renders the commands the selected page
represents, from live device state. Editing the hostname, an interface address
or a route updates the pane immediately. Algorithm Settings is the only page
with no IOS rendering and shows the explanatory notice instead.

## Tests

- `src/simulator/configPages.test.ts` — 14 unit tests for tree gating, per-page
  commands, algorithm defaults and the Global Settings override.
- `src/simulator/deviceAttributes.test.ts` — 3 unit tests for the harvested
  attributes table, aliases and catalog coverage.
- `src/simulator/dhcp.test.ts` — pool starting-IP coverage alongside the
  existing DHCP lifecycle tests.
- `src/simulator/wlc.test.ts` — 3 wireless tests: advertised SSID/channel/security,
  WEP key validation, and open-network-only auto-association.
- `e2e/config-parity.spec.ts` — 14 browser tests: tree + Settings + pane,
  static-route round trip, algorithm override, Attributes, display name vs
  hostname, PC/CLI tab rules, PC Static/DHCP and IPv6 controls, server Services
  list with HTTP/DHCP/NTP editing, server Desktop service tiles, the interface
  port-status switch, and access-point config driving the site survey, wrong-key
  rejection and association.
- `e2e/flows.spec.ts` F08 navigates GLOBAL → Settings → INTERFACE before
  filling the IPv6 field, matching the new default page.

## Known deviations

- AAA, Syslog and FTP are absent until the simulator implements them; no
  placeholder controls are rendered.
- Wireless security is a UI-level association gate, not an 802.11i exchange.
  Smartphones and tablets have no key-entry surface yet, so a secured AP will
  not auto-associate them; they remain usable on open networks.
- The Services panes style the fields they expose, but PT's exact service
  dialogs (file tables, AAA client tables) are reduced to the state the engine
  actually uses.
