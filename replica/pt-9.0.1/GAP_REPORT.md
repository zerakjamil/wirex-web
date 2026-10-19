# Packet Tracer 9.0.1 → wireX gap report

Source inventory: `replica/pt-9.0.1/inventory.json`
Captured from: /Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app (version 9.0.1)

## Menu bar (live capture)

- **Cisco Packet Tracer**: About Cisco Packet Tracer, Preferences..., Exit and Logout, Services, Hide Cisco Packet Tracer, Hide Others, Show All, Quit Cisco Packet Tracer
- **File**: New, Open ..., Open Samples ..., Recent Files, Save, Save As ..., Save As PKZ ..., Reset Activity, Print ...
- **Edit**: Copy, Paste, Undo, Redo, Writing Tools, AutoFill, Start Dictation…, Emoji & Symbols
- **Options**: Algorithm Settings, User Profile ..., View Command Log
- **View**: Zoom, Toolbars, Simulation Mode, Realtime Mode, Logical View, Physical View, Show Viewport, Show Workspace List, Enter Full Screen
- **Tools**: Drawing Palette ..., Custom Devices Dialog, Script Project Manager ..., Cluster Associations Dialog
- **Extensions**: Activity Wizard ..., Listening Ports ..., Multiuser, IPC, Scripting, Clear Terminal Agent, Marvel, Resource Attributes
- **Window**: Enter Full Screen, Router1
- **Help**: Getting Started, Contents, Tutorials, Accessibility, Report an Issue

## Workspace chrome

- Modes: Logical Mode, Physical Mode, Realtime Mode, Simulation Mode
- Tools: Select, Inspect, Delete, Resize, Place Note, Draw Line, Draw Rectangle, Draw Ellipse, Draw Freeform, Add Simple PDU, Add Complex PDU
- Toolbar: Go Back One Level (Alt+Left), Create New Cluster (Shift+U), Move Object(Shift+M), Set Background Image (Shift+I), Environment (Shift+E)

## Device palette

Live capture lists **181** stock/custom models across 7 categories.

| Category | Subcategory | PT models | in wireX | missing |
| --- | --- | --- | --- | --- |
| Network Devices | Routers | 18 | 12 | 819HG-4G-IOX, CGR1240, IR1101, IR8340, PT8200, 2811 IOS15 |
| Network Devices | Switches | 11 | 6 | 2960 IOS15, IE-2000, IE-3400, IE-9320, Bridge-PT |
| Network Devices | Hubs | 3 | 2 | Repeater-PT |
| Network Devices | Wireless Devices | 15 | 6 | AccessPoint-PT-AC, Linksys-WRT300N, HomeRouter-PT-AC, DLC100, Central-Office-Server, WLC-2504, WLC-3504, 3702i, Meraki-MX65W |
| Network Devices | Security | 4 | 0 | 5505, 5506-X, ISA-3000, CyberObserver |
| Network Devices | WAN Emulation | 4 | 4 | — |
| End Devices | End Devices | 15 | 7 | Meraki-Server, NetworkController, 7960, Analog-Phone-PT, TabletPC-PT, WirelessEndDevice-PT, WiredEndDevice-PT, Sniffer |
| End Devices | Smart Home | 21 | 5 | AC, Appliance, Bluetooth Speaker, Ceiling Fan, Furnace, Garage Door, Home Speaker, Humidifier, Humiture Monitor, Lawn Sprinkler, Light, Motion Detector, Portable Music Player, Sound Frequency Detector, Water Level Monitor, Webcam |
| End Devices | Smart City | 16 | 0 | Atm Pressure Monitor, Beacon, Carbon Dioxide Detector, Carbon Monoxide Detector, Fire Monitor, Fire Sprinkler, Humidity Monitor, Old Car, RFID Card, RFID Reader, Smart LED, Street Lamp, Temperature Monitor, Trip Sensor, Water Drain, Wind Detector |
| End Devices | Industrial - OT | 6 | 0 | PLC-PT, DataHistorianServer, Blower, HMI, Signal Generator, Smart LED |
| End Devices | Power Grid | 4 | 0 | Battery, Power Meter, Solar Panel, Wind Turbine |
| Components | Boards | 3 | 0 | MCU-PT, SBC-PT, Thing |
| Components | Actuators | 14 | 0 | Air Cooler, Alarm, Ceiling Sprinkler, Dimmable LED, Floor Sprinkler, Heating Element, LCD, LED, Motor, Piezo Speaker, RGB LED, Servo, Smart LED, Speaker |
| Components | Sensors | 21 | 2 | Flex Sensor, Generic Environment Sensor, Generic Sensor, Humidity Sensor, Humiture Sensor, Membrane Potentiometer, Metal Sensor, Motion Sensor, Photo Sensor, Potentiometer, Push Button Toggle Switch, Rocker Switch, Smoke Sensor, Sound Sensor, Temperature Sensor, Toggle Push Button, Trip Wire, Water Sensor, Wind Sensor |
| Connections | Connections | 13 | 0 | Automatically Choose Connection Type, Console, Copper Straight-Through, Copper Cross-Over, Single Mode Fiber, Multi Mode Fiber, Phone, Coaxial, Serial DCE, Serial DTE, Octal, IoT Custom Cable, USB |
| Connections | Structured Cabling | 4 | 0 | Copper Patch Panel, Fiber Patch Panel, Copper Wall Mount, Fiber Wall Mount |
| Miscellaneous | Miscellaneous | 8 | 0 | 1841 WIC-2T, 2621XM NM-2FE2W (2) WIC-2T, 2811 with IOS 12, 2811 NM-ESW-161 (2) WIC-2T, 2960 with IOS 12, PT8000 Activated, Wireless Laptop, Wireless PC |
| Multiuser Connection | Multiuser Connection | 1 | 0 | Multiuser Connection |

**Catalog coverage: 44/181 models recognized (24.3%).**

### Missing models, grouped by category

- **Network Devices / Routers**: 819HG-4G-IOX, CGR1240, IR1101, IR8340, PT8200, 2811 IOS15
- **Network Devices / Switches**: 2960 IOS15, IE-2000, IE-3400, IE-9320, Bridge-PT
- **Network Devices / Hubs**: Repeater-PT
- **Network Devices / Wireless Devices**: AccessPoint-PT-AC, Linksys-WRT300N, HomeRouter-PT-AC, DLC100, Central-Office-Server, WLC-2504, WLC-3504, 3702i, Meraki-MX65W
- **Network Devices / Security**: 5505, 5506-X, ISA-3000, CyberObserver
- **End Devices / End Devices**: Meraki-Server, NetworkController, 7960, Analog-Phone-PT, TabletPC-PT, WirelessEndDevice-PT, WiredEndDevice-PT, Sniffer
- **End Devices / Smart Home**: AC, Appliance, Bluetooth Speaker, Ceiling Fan, Furnace, Garage Door, Home Speaker, Humidifier, Humiture Monitor, Lawn Sprinkler, Light, Motion Detector, Portable Music Player, Sound Frequency Detector, Water Level Monitor, Webcam
- **End Devices / Smart City**: Atm Pressure Monitor, Beacon, Carbon Dioxide Detector, Carbon Monoxide Detector, Fire Monitor, Fire Sprinkler, Humidity Monitor, Old Car, RFID Card, RFID Reader, Smart LED, Street Lamp, Temperature Monitor, Trip Sensor, Water Drain, Wind Detector
- **End Devices / Industrial - OT**: PLC-PT, DataHistorianServer, Blower, HMI, Signal Generator, Smart LED
- **End Devices / Power Grid**: Battery, Power Meter, Solar Panel, Wind Turbine
- **Components / Boards**: MCU-PT, SBC-PT, Thing
- **Components / Actuators**: Air Cooler, Alarm, Ceiling Sprinkler, Dimmable LED, Floor Sprinkler, Heating Element, LCD, LED, Motor, Piezo Speaker, RGB LED, Servo, Smart LED, Speaker
- **Components / Sensors**: Flex Sensor, Generic Environment Sensor, Generic Sensor, Humidity Sensor, Humiture Sensor, Membrane Potentiometer, Metal Sensor, Motion Sensor, Photo Sensor, Potentiometer, Push Button Toggle Switch, Rocker Switch, Smoke Sensor, Sound Sensor, Temperature Sensor, Toggle Push Button, Trip Wire, Water Sensor, Wind Sensor
- **Connections / Connections**: Automatically Choose Connection Type, Console, Copper Straight-Through, Copper Cross-Over, Single Mode Fiber, Multi Mode Fiber, Phone, Coaxial, Serial DCE, Serial DTE, Octal, IoT Custom Cable, USB
- **Connections / Structured Cabling**: Copper Patch Panel, Fiber Patch Panel, Copper Wall Mount, Fiber Wall Mount
- **Miscellaneous / Miscellaneous**: 1841 WIC-2T, 2621XM NM-2FE2W (2) WIC-2T, 2811 with IOS 12, 2811 NM-ESW-161 (2) WIC-2T, 2960 with IOS 12, PT8000 Activated, Wireless Laptop, Wireless PC
- **Multiuser Connection / Multiuser Connection**: Multiuser Connection

## Device Config tab (captured from a live 1841)

- **GLOBAL**: Settings, Algorithm Settings
- **ROUTING**: Static, RIP
- **SWITCHING**: VLAN Database
- **INTERFACE**: GigabitEthernet0/0/0, GigabitEthernet0/0/1, GigabitEthernet0/0/2

### Config pages with fields (live values)

- **GLOBAL / Settings**
  - fields: `Hostname`, `Display Name`, `Device Clock:`
  - labels: Equivalent IOS Commands, Global Settings, NVRAM, Startup Config, Running Config, Display Name, Hostname
  - buttons: Merge file to running config, Erase NVRAM, Export running config to file, Save Running config to NVRAM, Load file to startup config, Export startup config to file
- **GLOBAL / Algorithm Settings**
  - fields: `Half Open Session Multiplier`, `Maximum Number of TCP connections`, `Maximum number of opened TCP Sessions`, `Maximum retransmission timeout in milliseconds`
  - labels: Equivalent IOS Commands, Algorithm Settings, Half-Open Session Multiplier:, Maximum Number of Connections:, Maximum Number of Opened Sessions:, Maximum Retransmission Timeout in Milliseconds:
- **ROUTING / Static**
  - fields: `Mask`, `Next Hop`, `Network`
  - labels: Equivalent IOS Commands, Static Routes, Network, Next Hop, Mask
  - buttons: Add, Remove
- **ROUTING / RIP**
  - fields: `Network`
  - labels: Equivalent IOS Commands, RIP Routing, Network
  - buttons: Add, Remove
- **SWITCHING / VLAN Database**
  - fields: `VLAN Number`, `VLAN Number`
  - labels: Equivalent IOS Commands, VLAN Configuration, VLAN Number, VLAN Name
  - buttons: Add, Remove
- **INTERFACE / GigabitEthernet0/0/0**
  - fields: `MAC Address`, `Subnet Mask`, `IP Address`, `Tx Ring Limit`
  - labels: Equivalent IOS Commands, Interface Slot/Port, Port Status, Link Speed, Duplex, MAC Address, Subnet Mask, IP Address, Tx Ring Limit
- **INTERFACE / GigabitEthernet0/0/1**
  - fields: `MAC Address`, `Subnet Mask`, `IP Address`, `Tx Ring Limit`
  - labels: Equivalent IOS Commands, Interface Slot/Port, Port Status, Link Speed, Duplex, MAC Address, Subnet Mask, IP Address, Tx Ring Limit
- **INTERFACE / GigabitEthernet0/0/2**
  - fields: `MAC Address`, `Subnet Mask`, `IP Address`, `Tx Ring Limit`
  - labels: Equivalent IOS Commands, Interface Slot/Port, Port Status, Link Speed, Duplex, MAC Address, Subnet Mask, IP Address, Tx Ring Limit

## Bundled help catalog

150 help pages ship inside the application.
Largest groups: config (19), ot (13), activityWizard (10), workspace (10), model (8), scriptModules (8), iot (7), mode (7), devicesAndModules (6), CLI (5), industrial (5), sampleFilesAndDesignPatterns (5).

