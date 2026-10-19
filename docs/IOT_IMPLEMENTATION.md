# IoT devices and sensors implementation

Scope: smart-home IoT things and an IoT registration server for the packet
engine — the device-library breadth item after the wireless LAN controller.
Target inventory: Packet Tracer 9.0.1 (its IoT tab, smart devices and
registration server), already captured in `PT_RECON.md` and the internal case
`work/pt901-uirecon/`.

Status: device types, protocol model, UI, starter lab, unit tests and browser
acceptance landed 2026-10-17.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Device type | `src/types/network.ts`, `src/simulator/deviceFactory.ts`, `deviceCatalog.ts` | `DeviceType 'iot'` with twelve models (`Lamp-PT`, `Fan-PT`, `Siren-PT`, `Sprinkler-PT`, `Door-PT`, `Window-PT`, `Blinds-PT`, `Thermostat-PT`, `Smoke-Detector-PT`, `Water-Detector-PT`, `Light-Sensor-PT`, `Push-Button-PT`), an `IoT Devices` shelf and per-model labels. `config.iotKind` discriminates the twelve behaviors; `config.iotState` is the persisted thing state; `config.iotServerAddress` (`'auto'` default) pins a manual server. The server side reuses `server` devices with `config.iotServiceEnabled` and `config.iotCredentials` (default `admin`/`admin`). `iotRuntime` / `iotServerRuntime` are volatile runtime state and may be absent after load |
| Ports | `deviceFactory.ts` | Things carry `FastEthernet0` + `Wireless0`, both admin-up; the wired port is used in this increment. Host paths (ARP, ICMP, DHCP) work unchanged, so things can ping, get DHCP leases and be pinged |
| Protocol model | `src/simulator/iot.ts` | Discovery, registration, periodic state reports, remote commands and command acknowledgements as simulated IP/UDP application messages on ports 5683 (server) and 5684 (client). Discovery uses the limited broadcast address `255.255.255.255` because the engine has no IP-multicast. PDU builders, `prepareIotTick`, local/remote state helpers and runtime helpers live in the module |
| Engine dispatch | `src/simulator/engine.ts` | IoT messages are handled in a **top-level protocol section** (like the DHCP section), not inside the `localIp` application chain: a broadcast destination never matches a local port address, so the app chain can never see the discovery frame. Unicast matches use the normal `localIp`; broadcast discovery falls back to the receiving port / an up addressed port. Every path ends in `continue`, so non-IoT receivers ignore the frame silently |
| Realtime loop | `src/store/networkStore.ts` | `hasIotActivity(devices)` keeps `tickSimulation`/`stepSimulation` advancing while an IoT thing or an enabled IoT server exists, so discovery/report timers run with no packets in flight (the same lesson the WLC acceptance test taught for CAPWAP) |
| Thing UI | `src/components/modals/IotTabs.tsx`, `DeviceModal.tsx` | `IoT` tab (default for things): registration badge (`Registered` / `Searching for an IoT server…`), network-card list with IPv4 addresses and an `Obtain DHCP Address` button, discovery address editor (`auto` or a manual IPv4), local controls per kind (toggle, open/close, level slider, temperature ±, smoke test, button press) and a scope footnote |
| Server UI | `IotTabs.tsx` (`IotServiceSection` in the server `Services` tab) | Enable checkbox, `admin`/`admin` credential fields and a `Registered devices (n)` list showing name, kind, address, online state and last-report age; actuators get remote control buttons (`Turn on`/`Turn off`, `Open`/`Close`, `Set level`, temperature steps, `Press`); sensors show state text only |
| Canvas + palette | `src/components/canvas/Cisco3DIcons.tsx`, `DeviceNode.tsx`, `DeviceNavigator.tsx`, `CiscoBottomBar.tsx` | `Iot3DIcon` with per-kind details (bulb glow on, fan blades, open door, thermometer level, smoke tint…), navigator name/label and the `IoT Devices` shelf |
| Starter lab | `src/simulator/starterLabs.ts` (`getIotLab`), `SampleLabsModal.tsx` | `R1` (2911, DHCP pool `192.168.10.100–150`), `SW1` (2960, PortFast), `IoTServer` (192.168.10.10, service enabled, `admin`/`admin`) and six things at `.21–.26` (deterministic names `Lamp0`, `Fan1`, `Door2`, `Thermostat3`, `SmokeDetector4`, `Siren5`), 8 links and a guided note; the lab list gained a "Smart Home with IoT Server" card |
| Shared labs | `src/simulator/workspaceSchema.ts` | `iot` joined the validated device types plus `iotKind`/`iotState`/`iotServerAddress`/`iotServiceEnabled` validation, so `#lab=` share links and workspace restores accept IoT topologies |
| Localization | `src/i18n/messages.ts` | Every new UI string ships EN/AR/CKB triples (the localization test enforces non-empty Arabic-script columns) |

## Protocol model

Timing constants use the 60 ms simulated tick (`SIMULATION_TICK_MS`):

| Constant | Ticks | Wall time | Meaning |
| --- | --- | --- | --- |
| `IOT_DISCOVERY_INTERVAL_TICKS` | 20 | ~1.2 s | Thing discovery broadcast cadence (repeats while searching and periodically after registration, so a restarted server is found again) |
| `IOT_REPORT_INTERVAL_TICKS` | 50 | ~3 s | Periodic state report cadence once registered |
| `IOT_CLIENT_STALE_TICKS` | 150 | ~9 s | Server-side freshness window (`Online` vs `Last seen …`) |
| `IOT_CLIENT_EXPIRE_TICKS` | 600 | ~36 s | Server-side client pruning |

Message exchange (all unicast replies use the normal ARP/routing host paths):

1. **Discovery** — thing broadcasts `255.255.255.255` UDP 5684→5683. Every
   enabled IoT server answers with a **discovery reply** carrying its address;
   other receivers ignore the frame.
2. **Registration** — the thing records the server (`serverId`, `serverName`,
   `serverAddress`), flips to `registered`, and sends a register message with
   its current state summary.
3. **Reports** — every ~3 s the thing sends its state summary; the server
   refreshes `lastSeenTick` and shows the age in the client list.
4. **Remote controls** — the server Services list issues a real control packet
   (UDP 5683→5684); the thing applies the patch, bumps `controlsApplied`, and
   sends a command acknowledgement; the server records the round trip. A thing
   registered to a different server rejects the command with an explicit drop
   reason.
5. **Self-healing** — discovery repeats; a client that stops reporting goes
   stale after ~9 s and is pruned after ~36 s; disabling the server's service
   stops all answers, and re-enabling it restores registration without manual
   steps.

Local edits (the thing's own `IoT` tab) change `config.iotState` directly and
are carried to the server by the next report — no packets are generated. Remote
edits (the server's Services list) always travel as packets.

## Packet Tracer Smart Home shelf (2026-10-20)

Packet Tracer 9.0.1's Smart Home palette lists 21 models. wireX now carries all
21, using 28 shelf entries in total (the original twelve `*-PT` models remain so
existing labs keep loading).

| PT shelf model | Simulated class | State and controls |
| --- | --- | --- |
| AC | thermostat | temperature setpoint 16–30 °C |
| Furnace | thermostat | temperature setpoint 10–30 °C |
| Ceiling Fan | fan | power on/off |
| Light | lamp | power on/off |
| Appliance | appliance | power on/off |
| Bluetooth Speaker, Home Speaker, Portable Music Player | speaker | power on/off |
| Garage Door | door | open/close |
| Lawn Sprinkler | sprinkler | power on/off |
| Humidifier | humidifier | output level 0–100 % |
| Water Level Monitor | water-detector | water level 0–100 % |
| Humiture Monitor | humiture | temperature 0–50 °C and humidity 0–100 % |
| Motion Detector | motion-sensor | motion detected/clear |
| Sound Frequency Detector | sound-sensor | sound level 0–100 dB |
| Webcam | camera | stream on/off |

New classes (`appliance`, `speaker`, `humidifier`, `humiture`,
`motion-sensor`, `sound-sensor`, `camera`) have their own default state,
sanitizers, state summaries, canvas art and IoT-tab controls. Registration
records the model string as well as the class, so the server's client list shows
"Ceiling Fan" or "Humiture Monitor" instead of a generic class label.

Sensors (humiture, motion, sound, water level) report state and have no remote
control; actuators accept the same local and server-issued controls as the
original things. Smart-city, industrial-OT, power-grid and MCU/breadboard
shelves are still outside this implementation.

## Documented simplifications (no parity claim)

- The application layer is structured simulator metadata over IP/UDP ports
  5683/5684; it is **not** CoAP, MQTT or any other standard wire format, and
  there is no TLS.
- Registration is not authenticated: the credentials are stored and displayed
  (PT's default `admin`/`admin`) but the protocol does not validate them.
- No MCU/SBC board programming, blockly-style rule editing, condition
  triggers, Bluetooth pairing or IoT cloud/home-gateway services.
- Sensors (smoke, water, light) report state but have no remote control; the
  push button is a moment of local state.
- Discovery uses the limited broadcast because the engine has no IP
  multicast; there is no DHCP option 43/vendor bootstrap, mDNS or SSDP.
- No measured acceptance against real Packet Tracer IoT output has been
  performed.

## Verification

- `npx tsc --noEmit` clean.
- `npm test` passes 479/479, including 8 new `iot.test.ts` tests: factory
  defaults/catalog/spec lookup; discovery → registration → periodic reports
  with server-side client records; remote commands reaching registered things
  with acknowledgements; the store actions (`sendIotControl` requires
  registration; `setIotState` edits locally); state helper sanitization and
  summaries per kind; the `hasIotActivity` gate and client freshness; a thing
  without an address staying silent and an unserved thing staying in
  `searching`; and server-side pruning of long-silent clients.
- Lint: zero errors, 28 pre-existing warnings. Build (`npm run electron:prep`)
  green.
- Production-browser suite passes 38 of 39 flows on this build, including both
  new `e2e/iot.spec.ts` specs: the
  starter lab is loaded through the real `Help → Practice Labs` dialog, all
  six things register in realtime, the server `Services` tab lists all six
  clients, and remote `Turn on` / `Open` commands from that list reach the
  devices and are acknowledged; the second spec restores a hand-built lab
  through `#lab=`, opens the thing's `IoT` tab, verifies the `Registered`
  badge, edits local state, and confirms the server keeps tracking the thing.
  The machine-load-sensitive realtime scale case passed every functional
  assertion (8/8 pings, queue peak 2,132, drained with no warnings) but
  exceeded its pacing bounds under sustained external machine load (load
  average 25–102; the identical unit suite measured 105.9 s against its 6.1 s
  quiet-machine baseline).
