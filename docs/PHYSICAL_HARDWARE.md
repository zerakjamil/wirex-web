# Physical device views

Updated 2026-10-19.

Every model in the device shelf opens a Physical tab, covering all 15 device families. The shared shelf catalog is `src/simulator/deviceCatalog.ts`; the view reads the device's actual interfaces and installed modules rather than drawing placeholder ports.

## Controls

- Front/rear view, zoom, and power are available on every device. Access points, laptops and hubs keep their connector strip visible on both faces; rack units, desktops, phones and the generic appliances show the correct face.
- Port LEDs reflect carrier and switch learning state. Power off removes carrier without changing administrative shutdown configuration.
- Selecting an interface shows its MAC, IP, VLAN, administrative state and connected peer. Disconnect removes the actual cable; Connect creates a cable through the same store action used by the canvas and checks connector compatibility and occupancy.
- Replaceable cards require power off. Select a card and press Install in an empty bay, or drag the card into the bay. Eject removes its interfaces and cables, clears peer connections and removes routes/ARP/MAC entries owned by those interfaces.
- Multiport serial and Ethernet cards create all interfaces. Bay indices remain stable when another module is ejected. Fixed interfaces survive module removal.
- Hardware actions participate in workspace undo. Power, installed modules, interface ownership and bay gaps survive native workspace persistence.
- Controls support English, Arabic and Central Kurdish, RTL layout, dark mode and narrow independently resized device windows.

## Device chassis

`HardwareChassis.tsx` renders the physical hardware from the device's own `HardwareProfile` and port list; it is not a fixed picture with clickable hotspots. The chassis switches on the modeled shape (`rack`, `tower`, `laptop`, `phone`, `access-point`, `printer`, `cloud`, `modem`, `display`, `tablet`, `handheld`, `hub`) and on the device type inside the rack family.

- **Catalyst switches** render a 1U chassis with rack ears and screws, SYST/RPS/STAT/DUPLX/SPEED status LEDs, a power rocker, two rows of twelve numbered access ports (or the model's actual count), G1/G2 uplinks, and replaceable module bays when the profile has them. The printed MODE column keeps STAT selected; STAT is the real carrier/learning LED.
- **Routers** render a 1U chassis with two module bays on the left and the built-in Gigabit bank on the right. A card's ports are drawn inside its bay with the card's own labels (`Se0/0/0`, `Se0/0/1`, …) instead of being duplicated in the built-in bank. The rear face also shows console, AUX, USB and compact-flash detail; the front face is a proper vented bezel with USB.
- **WLC and ASA** appliances render as 1U rack units with their real Gigabit/Ethernet ports, console/USB detail, status LEDs and power rocker.
- **Desktops** follow Packet Tracer's own workstation render on both faces. The default **Front** face is a 389×932 tower: two 5.25-inch bays with a recessed blank, a divider and a small pill/slot at the panel's right; the floppy, LED and maroon power cluster; a staggered-hole intake grille; a blanking plate; and the card window carrying the installed slot-0 NIC's RJ-45 and link LED. The **Rear** face is wireX's own layout (PT publishes no rear reference): PSU fan and mesh, I/O shield with PS/2/USB/RJ-45/audio/serial/VGA/parallel detail, an expansion-slot stack, a recessed card cage holding the functional ModuleBay, thumbscrews and a rocker power switch. **Servers** get their own wide rack-style chassis (1010×443) instead of the tower: eight SCSI caddies with handles and label inserts, a silver front door with recesses/seams/handle/notch, two right-side expansion slots (the lower one is the slot-0 card window), captive screws, and a dual-PSU-fan rear with I/O shield, slot plates, module bay and rocker. **Laptops** render two faces like Packet Tracer. **Rear** is a 3/4 view of the lid back on the base, with the power button and the replaceable module card plugged into the side; **Top** shows the open keyboard/trackpad deck and the screen panel. Module ports are reachable from both faces.
- **IP phones** render a handset, screen, keypad and the back panel with the two line/PC ports. **Access points** render the antenna body and a connector base with the Ethernet and wireless interfaces. Printers, clouds, modems, displays, tablets and handhelds get shape-specific shells with an attached interface bay. The cloud keeps its ten replaceable-module bays in a labelled grid; laptops keep their single bay in the side I/O panel. Module ports render inside those bays instead of being duplicated in the built-in row.
- **Ports are the actual controls.** Every jack is a button backed by the device's `NetworkPort`: selecting it opens the existing MAC/IP/VLAN/peer panel, and the LED is driven by power, admin state and carrier/STP learning. Module ports live inside their bay, so install/eject, drag-and-drop and the power-off interlock all update the visible hardware immediately.

The module panel under the canvas shows the selected module's catalog name, interface count and its own description, with the power-off install hint below it; selecting a port swaps the description for the port panel, and both are height-capped so the chassis is not clipped in the 680 px device window. On the PC/server front the slot-0 card window is one button carrying the port's accessible name (RJ-45 art plus a status LED) and opens that same port panel, while the rear card cage keeps the full ModuleBay with per-port jacks. The switch MODE column and the console/AUX/USB/CF jacks are deliberately honest: wireX has no duplex/speed telemetry, so those LEDs stay off, and the console/AUX/USB/CF jacks are decorative (console access remains the CLI tab). They are not wired as fake connectable ports.

### Chassis boundaries

The chassis are clean-room CSS/SVG illustrations, not Cisco photographs, product renders or copied trade dress; model names are used nominatively so students recognize the hardware family. Exact SKU bezels, slot counts and port silkscreens are not certified against physical units. Electrical power budgets/PoE, USB peripherals, cellular radio service and audio accessories remain outside the model. Unsupported adapters are not offered as functioning expansion cards.

## Implementation and boundaries

`PhysicalDeviceView.tsx` owns the Physical session and reads the store actions. `HardwareChassis.tsx` draws the model-aware chassis and port jacks. `physical.css` provides the chassis styling and container-based reflow. `physicalHardware.ts` defines device shapes, bays, module interfaces and cable compatibility. `networkStore.ts` applies changes to simulation state.

Older imported interfaces without module ownership metadata use conservative removal: known host NICs and serial modules can be inferred; fixed uplinks are never removed merely because their type matches a module. Unspecified Ethernet media in legacy files remains compatible with existing imported fiber labs.

Network protocols retain the simulator's existing capability boundaries. A working connector or a green carrier LED alone does not establish end-to-end IP connectivity. Students still configure addressing, VLANs, trunks, shutdown state and routing through Config/CLI and validate traffic with simulation/diagnostics.

## Verification

`src/store/physicalHardware.test.ts` covers the entire shelf catalog, invalid/occupied/incompatible bays, multiport cards, stable removal, peer cable cleanup, power versus shutdown, empty chassis, WAN connector types, optical/copper incompatibility, fixed server interfaces, persistence and actual ARP/ICMP traffic through a replacement NIC.

The 2026-10-19 chassis pass was verified with `npm test` 567/567, `npx tsc --noEmit` clean, `npm run lint` 0 errors / 28 pre-existing warnings, `npm run electron:prep` green, `e2e/flows.spec.ts` + `e2e/physical.spec.ts` 20/20 and the full production-browser suite 52/52. The realtime scale stress passed at 305 ms longest task against the unchanged 500 ms bound (p95 tick 65.3 ms, engine p95 7.5 ms, queue peak 2,132, 8/8 pings). Manual browser checks covered the PC tower front/rear, the wide server front/rear, front card-window port selection, face switching, and a live power-off eject/install through the rear card cage (`PT-HOST-NM-1CFE`, `Fa0`) with the port panel open. Packet Tracer's PNG renders were used only as drawing reference for geometry and colour; no Cisco artwork ships.
