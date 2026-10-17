# Physical device views

Updated 2026-10-07.

Every model in the device shelf opens a Physical tab, covering all 15 device families. The shared shelf catalog is `src/simulator/deviceCatalog.ts`; the view reads the device's actual interfaces and installed modules rather than drawing placeholder ports.

## Controls

- Front/rear view, zoom, and power are available on every device.
- Port LEDs reflect carrier and switch learning state. Power off removes carrier without changing administrative shutdown configuration.
- Selecting an interface shows its MAC, IP, VLAN, administrative state and connected peer. Disconnect removes the actual cable; Connect creates a cable through the same store action used by the canvas and checks connector compatibility and occupancy.
- Replaceable cards require power off. Select a card and press Install in an empty bay, or drag the card into the bay. Eject removes its interfaces and cables, clears peer connections and removes routes/ARP/MAC entries owned by those interfaces.
- Multiport serial and Ethernet cards create all interfaces. Bay indices remain stable when another module is ejected. Fixed interfaces survive module removal.
- Hardware actions participate in workspace undo. Power, installed modules, interface ownership and bay gaps survive native workspace persistence.
- Controls support English, Arabic and Central Kurdish, RTL layout, dark mode and narrow independently resized device windows.

## Implementation and boundaries

`PhysicalDeviceView.tsx` replaces the old device-specific Physical session. `physical.css` provides container-based reflow. `physicalHardware.ts` defines device shapes, bays, module interfaces and cable compatibility. `networkStore.ts` applies changes to simulation state.

Chassis illustrations are responsive schematic SVGs, not verified photographs or exact chassis layouts for each Cisco SKU. The available module and port behavior follows WireForge's modeled device inventory. OEM slot/transceiver certification, electrical power budgets/PoE, USB peripherals, cellular radio service, and audio accessories are not implemented by this change. Those unsupported adapters are not offered as functioning expansion cards.

Older imported interfaces without module ownership metadata use conservative removal: known host NICs and serial modules can be inferred; fixed uplinks are never removed merely because their type matches a module. Unspecified Ethernet media in legacy files remains compatible with existing imported fiber labs.

Network protocols retain the simulator's existing capability boundaries. A working connector or a green carrier LED alone does not establish end-to-end IP connectivity. Students still configure addressing, VLANs, trunks, shutdown state and routing through Config/CLI and validate traffic with simulation/diagnostics.

## Verification

`src/store/physicalHardware.test.ts` covers the entire shelf catalog, invalid/occupied/incompatible bays, multiport cards, stable removal, peer cable cleanup, power versus shutdown, empty chassis, WAN connector types, optical/copper incompatibility, fixed server interfaces, persistence and actual ARP/ICMP traffic through a replacement NIC.
