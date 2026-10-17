# Wireless LAN controller implementation

Scope: a wireless LAN controller with lightweight access points and central
switching for the packet engine. This is the wireless-completeness item after
IPv6, EIGRP and Rapid PVST+/MSTP. Target inventory: Packet Tracer 9.0.1, already
captured in `PT_RECON.md` and the internal case `work/pt901-uirecon/`.

Status: control plane, data plane, UI, starter lab, unit tests and browser
acceptance landed 2026-10-17.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Device types | `src/types/network.ts`, `src/simulator/deviceFactory.ts`, `deviceCatalog.ts` | `DeviceType 'wlc'` with internal model `WLC-PT` and UI label "Wireless LAN Controller"; new AP model `LAP-PT` (lightweight). `config.apMode: 'autonomous' \| 'lightweight'` is the source of truth for AP behavior; `apRuntime` / `wlcRuntime` are volatile runtime state and may be absent after load |
| Ports | `deviceFactory.ts` | WLC: two gigabitethernet ports (`Gi0/0`, `Gi0/1`); the management IP lives on `ports[0]`, so ARP/ICMP for the controller reuse the normal host paths. `LAP-PT`: `Port0` wired + `Port1` wireless |
| Control plane | `src/simulator/capwap.ts` | Discovery (AP broadcast) → Discovery Response (WLC) → Join → Config Update (fingerprint-driven) → Run; Echo keepalives; AP timeout re-entry; both sides self-heal. CAPWAP messages ride the wired broadcast domain at layer 2 (custom ethertype `0x88B5`), described below |
| Data plane | `src/simulator/engine.ts` | AP wireless ingress is encapsulated to the controller MAC (`capwapDataPdu`); AP wired non-CAPWAP frames are dropped ("lightweight access point ... does not forward wired frames locally"); the controller decapsulates, bridges the inner frame onto its wired ports, and tunnels unicast to the owning AP (`wlcRuntime.clientTunnels`) or floods group frames to every registered AP |
| Console | `src/simulator/ios/wlcCli.ts` | AireOS-lite: `show wlan summary`, `show ap summary`, `show client summary`, `show interface summary`, `config wlan create/delete/enable/disable` with validation messages |
| Config + web UI | `src/components/modals/WlcTabs.tsx`, `DeviceModal.tsx` | `Config` tab (Wireless LANs CRUD with id 1–16, SSID, VLAN, security none/WEP/WPA2-PSK, AP Groups read-only `default`, management address editor, tunnel footnote) and a `GUI` tab (browser chrome, `admin`/`admin` sign-in, Monitor/Clients/Management views, WLAN enable/disable, management address save). The site survey for wireless clients lists `apAdvertisedWlans(ap)`, so lightweight APs show the SSIDs pushed by their controller and stay unassociated until the AP is in Run state |
| Canvas + palette | `src/components/canvas/Cisco3DIcons.tsx`, `src/components/cisco/CiscoBottomBar.tsx` | Rack-mount `Wlc3DIcon`; `WLC-PT` appears in the Wireless Devices shelf and places a `wlc` device through the generic placement path |
| Starter lab | `src/simulator/starterLabs.ts` (`getWlcLab`), `SampleLabsModal.tsx` | WLC + 2960 + 2 LAPs + 2 smartphones + wired PC on 192.168.1.0/24, both WLANs pre-created, PortFast on the edge ports, guided note; the lab list gained its own card |
| Localization | `src/i18n/messages.ts` | Every new UI string ships EN/AR/CKB triples (localization test enforces non-empty Arabic-script columns) |
| Realtime loop | `src/store/networkStore.ts` | `hasCapwapActivity(devices)` keeps `tickSimulation`/`stepSimulation` advancing while a controller or lightweight AP exists, so CAPWAP timers run with no packets in flight (found by the browser acceptance test; the engine tests call `stepSimulationTick` directly and did not expose it) |

## CAPWAP control plane

Timing constants use the 60 ms simulated tick (`SIMULATION_TICK_MS`):

| Constant | Ticks | Wall time | Meaning |
| --- | --- | --- | --- |
| `CAPWAP_DISCOVERY_INTERVAL_TICKS` | 34 | ~2 s | Discovery/Join retry cadence |
| `CAPWAP_ECHO_INTERVAL_TICKS` | 84 | ~5 s | Echo keepalive cadence |
| `CAPWAP_AP_TIMEOUT_TICKS` | 252 | ~15 s | AP session timeout; the controller treats an AP as gone after this silence |

AP states are `idle → discovery → join → run`. The controller answers discovery
broadcasts, accepts joins, pushes its wireless LAN set (fingerprint-driven:
`configSeq` increments on WLAN changes, APs apply and acknowledge the new
sequence, and a mismatched sequence is dropped), and refreshes each session with
echo request/replies. Losing the controller drops the AP out of `run` and client
frames are then refused with explicit reasons; restoring the path lets the AP
re-join by itself.

## Data plane (central switching)

Central switching is the model's only mode (as in Packet Tracer's default WLC
lab behavior):

- A wireless frame entering an AP's radio while the AP is in `run` is
  encapsulated to the controller MAC and sent out the AP's wired port.
- A lightweight AP drops non-CAPWAP frames on its wired port, so clients cannot
  reach the wired LAN except through the controller.
- The controller decapsulates the inner frame, learns the client→AP tunnel in
  `clientTunnels`, and forwards it: unicast to a known client is tunnelled to
  that client's AP; broadcast/multicast (and unknown unicast) flood the wired
  LAN plus every registered AP.
- Wired traffic arriving at the controller and addressed to a known wireless
  client is tunnelled back; broadcasts on the wired side are not re-flooded to
  the wired LAN (they came from it) but do reach the registered APs.
- Frames addressed to the controller itself (its management MAC or an ARP/ICMP
  for its management IP) fall through to normal host handling, so the GUI, CLI
  and pings work without a special case.

## Documented simplifications (no parity claim)

- CAPWAP is layer-2 modeled: control and data frames ride the wired broadcast
  domain with ethertype `0x88B5` instead of IP/UDP (5246/5247). APs therefore do
  not need an IP address, and there is no AP DHCP/option-43/bootstrap flow.
- Client tunneling ignores the WLAN `vlan` value (it is stored and shown, but
  frames are bridged untagged); the controller does not provide inter-VLAN
  client routing.
- Security is configuration-only: `none`/`wep`/`wpa2-psk` (with passphrase
  validation) are stored and displayed; association is not authenticated or
  encrypted.
- AP Groups are read-only (`default`); no group editing or per-group WLAN
  mapping.
- The controller has no DHCP service tab (the engine's DHCP server is gated to
  `server` devices), no RADIUS/802.1X, no mobility/roaming tuning, no HA
  pair/lag, and no foreign/guest anchoring.
- The controller is not a bridge for STP purposes; `LAP-PT` remains a bridge.
- No measured acceptance against real controller output has been performed.

## Verification

- `npx tsc --noEmit` clean.
- `npm test` passes 471/471, including 8 new `wlc.test.ts` tests: factory/catalog
  entries; discovery→join→run with the advertised WLAN list and one registered
  AP; WLAN change propagation through a CAPWAP config update via the CLI;
  central-switched ping with encapsulation, tunnel forwarding and a learned
  client tunnel (no Run-state drops); controller outage and self-recovery after
  the port returns; autonomous-AP regression (still bridges locally, no drops);
  console output plus invalid-command/range/duplicate validation; and the
  starter lab test, which loads `getWlcLab()`, joins both LAPs, and completes a
  phone→wired ping and a cross-AP phone→phone ping that exercises the tunnel in
  both directions.
- Lint: zero errors, 28 pre-existing warnings. Build (`npm run electron:prep`)
  green.
- Production-browser suite passes 37/37 (2 new `e2e/wlc.spec.ts` specs): the
  starter lab is loaded through the real `Help → Practice Labs` dialog and its
  card button, both LAPs reach `run` in realtime, and the controller GUI
  (admin/admin sign-in, AP summary, 2 enabled WLANs, management address) is
  served; the second spec drives the console for WLAN/AP output and a client
  entry after a real store-issued ping populates `clientTunnels`. The realtime
  scale case still passes (longest task 294 ms against the 500 ms bound).
