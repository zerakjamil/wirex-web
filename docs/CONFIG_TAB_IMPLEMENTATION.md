# Config Tab Implementation

Packet Tracer's Config tab is the form front-end for Cisco IOS configuration.
wireX renders the same four-level category tree, keeps the form edits and the
engine in sync, and shows the equivalent IOS commands at the bottom of the page.

## Tree model

`src/simulator/configPages.ts` is a pure function over device state:

| Group | Pages | Applies to |
| --- | --- | --- |
| GLOBAL | Settings, Algorithm Settings | every device; Algorithm Settings on routers and switches |
| ROUTING | Static, RIP | routers, L3 switches (3560/3650) |
| SWITCHING | VLAN Database | switches, routers 1841/2811 |
| INTERFACE | one page per port | any device with ports |

The captured Packet Tracer 9.0.1 reference for a Cisco 1841
(`replica/pt-9.0.1/config-Router1.json`) contains the same eight pages: Settings,
Algorithm Settings, Static, RIP, VLAN Database and three GigabitEthernet
interfaces.

## Page behavior

- **Settings** — hostname (also relabels the canvas device), a ticking device
  clock, and gateway/DNS for PC, laptop and server. NVRAM holds Startup Config
  and Running Config blocks with PT's six actions: save running config to NVRAM,
  erase NVRAM, export running/startup config to file, load a file into startup
  config, and merge a file into the running config (merged lines are executed
  through the IOS parser so they take effect).
- **Algorithm Settings** — PT's four TCP parameters persisted in
  `config.algorithmSettings`. This page has no Cisco IOS equivalent, so the
  command pane says so.
- **Static Routes** — network/mask/next-hop form plus a table of `type: 'S'`
  routes. Add and Remove run `ip route` / `no ip route` through
  `executeIosCommand`, so the routing engine installs and withdraws the route.
- **RIP** — network statements stored in `config.ripNetworks`, which
  `src/simulator/rip.ts` reads directly.
- **VLAN Database** — VLAN number/name form backed by `config.vlans`; Add and
  Remove run the `vlan` / `name` / `no vlan` CLI path.
- **INTERFACE** — existing per-port editor: MAC, port status switch, IPv4, IPv6
  and (on switches) access/trunk mode with the access VLAN.

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

- `src/simulator/configPages.test.ts` — 12 unit tests for tree gating, per-page
  commands and algorithm defaults.
- `e2e/config-parity.spec.ts` — 4 browser tests: tree + Settings + pane,
  static-route add/remove round trip, algorithm settings notice, and the
  interface port-status switch.
- `e2e/flows.spec.ts` F08 now navigates GLOBAL → Settings → INTERFACE before
  filling the IPv6 field, matching the new default page.

## Known deviation

Packet Tracer shows a separate **Display Name** field. wireX has no independent
display-name state, so editing the hostname is what relabels the device in the
workspace. A distinct field would need a new store action and canvas label
source; it is not exposed rather than faked.
