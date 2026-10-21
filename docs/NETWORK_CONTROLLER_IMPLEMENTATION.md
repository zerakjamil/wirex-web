# Network Controller implementation

PT 9.0.1's **Network Controller** is modelled as a real end device with a web
management console, not as a PC alias or a fake server page.

## Hardware

- Model `NetworkController`, internally `type: 'pc'` so it reuses the normal
  host/HTTP path.
- Two fixed copper gigabit interfaces (`GigabitEthernet0`,
  `GigabitEthernet1`), no module bays, no built-in switch ports.
- Factory name `NetworkController<index>`.
- In-house 2U rack-server chassis (front drive array, status lamps, rear NICs)
  and a distinct 3D palette icon. No vendor artwork is used.
- The device has **no Desktop tab and no native GUI/CLI tab**. Configuration is
  limited to the normal Config section (management URL/account status) and the
  two NIC settings. The management application is reached from another PC.

## Management path

1. Place a PC on the same reachable network as the controller.
2. Open the PC's **Desktop → Web Browser**.
3. Browse to `http://<controller-management-ip>`.

The engine serves an HTTP 200 fallback page from the controller. When the
browser receives a successful HTTP transaction whose
`destinationDeviceId` resolves to a Network Controller, the browser renders the
interactive console instead of the fallback document. Normal HTML, DNS and
iframe behavior is unchanged for every other destination.

## Management console

The console is code-split with `next/dynamic` and loaded only when a browser
opens the controller. It never becomes part of the initial canvas bundle.

### Account setup and login

- First visit creates a local administrator account.
- The stored value is a deterministic FNV-1a 32-bit classroom digest, never the
  plaintext password. This is obfuscation for a shared lab file, **not a
  security boundary**; the workspace is not encrypted.
- Accounts and discoveries persist in
  `DeviceConfig.networkController = { accounts, discoveries, lastDiscoveryId }`.
- The signed-in session is runtime-only and resets when the window is closed.

### Discovery

Two real modes are exposed:

- **Connected topology** walks active-link adjacency from the controller,
  including intermediate unaddressed switches, and inventories devices that
  have a configured management IPv4 address.
- **IP range** applies the same reachable graph and keeps addresses inside the
  inclusive start/end range.

For a Layer-3 switch the VLAN interface (`Vlan<n>`) is preferred over a
physical access port that also happens to carry an address. Discovery reports
stable failure reasons (`power-off`, `no-ip`, `no-active-link`,
`invalid-range`) and records each run as a snapshot with a timestamp, mode,
optional range and device IDs. Snapshots are capped at 20; deleting a device
later filters it out of live inventory while the historical snapshot keeps its
ID list.

The implementation deliberately follows **active-link adjacency**, not CDP
frames. The UI states this. It does not emit CDP or interoperate with a real
controller.

### Inventory and topology

- Inventory shows the selected discovery snapshot with name, model/type,
  management address, and live power/port state.
- The topology map uses the canvas positions of the discovered devices and the
  active links between them. Nodes are selectable and show their configured
  management address.
- Selecting an older discovery switches both the inventory and map to that
  snapshot.

## Deliberate omissions

The following PT-only surfaces are not faked because the simulator has no
corresponding state:

- REST/API management endpoints
- path trace
- credential management beyond the local account
- live interoperation with an external controller
- CDP wire behavior
- any native controller GUI/CLI tab

The NC's HTTP service is always enabled; there is no separate service toggle
because PT's sample state did not expose a student-facing switch for it.

## Tests

- `src/simulator/networkController.test.ts` — 10 tests covering fixed hardware,
  management-address selection (including VLAN preference), connected and
  IP-range discovery, intermediate unaddressed switches, failure reasons,
  snapshot inventory, status and digest behavior.
- `src/simulator/http.test.ts` — raw HTTP consumer receives the controller page.
- `e2e/network-controller.spec.ts` — two fixed NICs, no modules/Desktop/CLI,
  chassis ports, Config management URL, PC browser setup/login, discovery,
  inventory, topology, sign-out/login, persisted hashed account and discovery
  snapshot.

## Verification

- `npm test` 661/661
- `tsc --noEmit` clean
- ESLint 0 errors / 28 existing warnings
- `npm run electron:prep` green
- targeted NC browser flow 1/1
- full production-browser suite 75/75
- unchanged simulation-scale bound: **424 ms** (p95 tick 71.6 ms, engine p95
  8.3 ms, 8/8 pings, queue peak 2,132)
