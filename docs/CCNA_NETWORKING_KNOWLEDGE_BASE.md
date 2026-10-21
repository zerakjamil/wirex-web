# Cisco CCNA 200-301 Volume 1: Core Networking Knowledge Base

> **Target Audience**: AI Agents, Automated Network Reasoning Engines, and Network Engineers.
>
> **Source Material**: Cisco CCNA 200-301 Official Cert Guide (Volume 1) — Chapters 1, 2, 6, and 8.
>
> **Structure & Purpose**: High-density, precise technical extraction omitting visual noise, presentation filler, and redundant meta-commentary while retaining 100% of architectural models, protocol specifications, packet structures, cabling standards, CLI syntax, and operational state matrices.

---

## Table of Contents
1. [Chapter 1: Introduction to TCP/IP Networking](#1-chapter-1-introduction-to-tcpip-networking)
   - 1.1 [Enterprise Network Topology](#11-enterprise-network-topology)
   - 1.2 [Evolution of Networking Models](#12-evolution-of-networking-models)
   - 1.3 [TCP/IP Architecture: Original vs. Updated Models](#13-tcpip-architecture-original-vs-updated-models)
   - 1.4 [OSI 7-Layer Reference Model vs. TCP/IP Models](#14-osi-7-layer-reference-model-vs-tcpip-models)
   - 1.5 [OSI Layer Definitions & Functional Architecture](#15-osi-layer-definitions--functional-architecture)
   - 1.6 [OSI Model Protocols and Physical Devices](#16-osi-model-protocols-and-physical-devices)
   - 1.7 [Layer Interaction: Same-Layer vs. Adjacent-Layer](#17-layer-interaction-same-layer-vs-adjacent-layer)
   - 1.8 [Data Encapsulation Hierarchy & Protocol Data Units (PDUs)](#18-data-encapsulation-hierarchy--protocol-data-units-pdus)
   - 1.9 [Application Layer Mechanics (HTTP Example)](#19-application-layer-mechanics-http-example)
   - 1.10 [Transport Layer Mechanics (TCP Error Recovery)](#110-transport-layer-mechanics-tcp-error-recovery)
   - 1.11 [Network Layer Routing & Hop-by-Hop Forwarding Logic](#111-network-layer-routing--hop-by-hop-forwarding-logic)
2. [Chapter 2: Fundamentals of Ethernet LANs](#2-chapter-2-fundamentals-of-ethernet-lans)
   - 2.1 [LAN Architectural Topologies: SOHO to Multi-Tier Campus](#21-lan-architectural-topologies-soho-to-multi-tier-campus)
   - 2.2 [IEEE 802.3 Ethernet Standards & Physical Media](#22-ieee-8023-ethernet-standards--physical-media)
   - 2.3 [UTP Cabling, Transceivers, and Circuit Fundamentals](#23-utp-cabling-transceivers-and-circuit-fundamentals)
   - 2.4 [UTP Pinouts: Straight-Through vs. Crossover Rules](#24-utp-pinouts-straight-through-vs-crossover-rules)
   - 2.5 [Gigabit UTP (1000BASE-T) 4-Pair Bi-Directional Operation](#25-gigabit-utp-1000base-t-4-pair-bi-directional-operation)
   - 2.6 [Fiber-Optic Cabling: Multimode vs. Single-Mode](#26-fiber-optic-cabling-multimode-vs-single-mode)
   - 2.7 [10-Gbps Optical Ethernet Standards](#27-10-gbps-optical-ethernet-standards)
   - 2.8 [Comprehensive Physical Media Comparison](#28-comprehensive-physical-media-comparison)
   - 2.9 [IEEE 802.3 Ethernet Frame Format](#29-ieee-8023-ethernet-frame-format)
   - 2.10 [MAC Addressing: Structure, Types, and Terminology](#210-mac-addressing-structure-types-and-terminology)
   - 2.11 [EtherType Protocol Identification](#211-ethertype-protocol-identification)
   - 2.12 [Switch Forwarding vs. Legacy Hub Collisions (Duplex Modes)](#212-switch-forwarding-vs-legacy-hub-collisions-duplex-modes)
3. [Chapter 6: Configuring Basic Switch Management](#3-chapter-6-configuring-basic-switch-management)
   - 3.1 [Cisco IOS CLI Privilege Modes & Navigation](#31-cisco-ios-cli-privilege-modes--navigation)
   - 3.2 [Simple Password Authentication Configuration](#32-simple-password-authentication-configuration)
   - 3.3 [Local Username Database Authentication](#33-local-username-database-authentication)
   - 3.4 [Centralized AAA Server Authentication (RADIUS / TACACS+)](#34-centralized-aaa-server-authentication-radius--tacacs)
   - 3.5 [Secure Shell (SSH v2) Configuration & Verification](#35-secure-shell-ssh-v2-configuration--verification)
   - 3.6 [Switch Virtual Interface (SVI) Management IP](#36-switch-virtual-interface-svi-management-ip)
   - 3.7 [Switch Default Gateway Requirement](#37-switch-default-gateway-requirement)
   - 3.8 [Static vs. Dynamic (DHCP) Switch IP Configuration](#38-static-vs-dynamic-dhcp-switch-ip-configuration)
   - 3.9 [CLI History Buffer Management](#39-cli-history-buffer-management)
   - 3.10 [Productivity & Safety Commands for Lab/Production](#310-productivity--safety-commands-for-labproduction)
4. [Chapter 8: Implementing Ethernet Virtual LANs (VLANs & Trunking)](#4-chapter-8-implementing-ethernet-virtual-lans-vlans--trunking)
   - 4.1 [VLAN Concept & Broadcast Domain Segmentation](#41-vlan-concept--broadcast-domain-segmentation)
   - 4.2 [Multi-Switch VLANs & The Necessity of Trunking](#42-multi-switch-vlans--the-necessity-of-trunking)
   - 4.3 [IEEE 802.1Q Frame Tagging Architecture](#43-ieee-8021q-frame-tagging-architecture)
   - 4.4 [Inter-VLAN Routing Requirement (Layer 2 vs. Layer 3)](#44-inter-vlan-routing-requirement-layer-2-vs-layer-3)
   - 4.5 [Configuring VLANs and Access Ports](#45-configuring-vlans-and-access-ports)
   - 4.6 [Dynamic Trunking Protocol (DTP) & Administrative Modes](#46-dynamic-trunking-protocol-dtp--administrative-modes)
   - 4.7 [Trunking Operational Negotiation Matrix](#47-trunking-operational-negotiation-matrix)
   - 4.8 [IP Telephony & Voice VLAN Integration](#48-ip-telephony--voice-vlan-integration)
   - 4.9 [Administrative & Operational VLAN States (Active vs. Shutdown)](#49-administrative--operational-vlan-states-active-vs-shutdown)
   - 4.10 [Trunking Verification & Operational Mismatch Troubleshooting](#410-trunking-verification--operational-mismatch-troubleshooting)
5. [Cisco IOS Command Quick Reference](#5-cisco-ios-command-quick-reference)

---

# 1. Chapter 1: Introduction to TCP/IP Networking

## 1.1 Enterprise Network Topology
An enterprise network provides connectivity for diverse internal endpoints and infrastructure:
- **Wired Endpoints**: Workstations and local servers connect via copper Ethernet cables directly into Layer 2/Layer 3 switches (e.g., `SW1`).
- **Wireless Endpoints**: Mobile devices and laptops connect through Wireless Access Points (APs), which in turn uplink over Ethernet to local switches.
- **Enterprise Infrastructure**: Campus access and distribution switches aggregate traffic into an Enterprise Network backbone/cloud connecting internal data centers, regional branches, and Internet boundary routers.

```
+--------------------+        Ethernet
| Workstations / PCs |-------------------+
+--------------------+                   |
                                         v
+--------------------+        Ethernet  +-----+       +--------------------+
| Local Servers      |----------------->| SW1 |------>| Enterprise Network |
+--------------------+                  +-----+       |     (Cloud/WAN)    |
                                         ^            +--------------------+
+--------------------+   802.11   +----+ | Ethernet
| Wireless Clients   | ~ ~ ~ ~ ~ >| AP |-+
+--------------------+   Wi-Fi    +----+
```

---

## 1.2 Evolution of Networking Models
- **1980s (Proprietary Silos)**: Vendor-specific architectures dominated corporate IT (IBM Systems Network Architecture [SNA], Digital Equipment Corporation DECnet). Heterogeneous communication was impossible without expensive, proprietary protocol translators.
- **1990s (Multi-Vendor Coexistence)**: Organizations bridged legacy proprietary stacks (IBM, DEC) with open networking protocols. TCP/IP emerged as the cross-platform internetworking standard.
- **2000s to Present (Universal TCP/IP Convergence)**: Proprietary protocols were phased out completely. TCP/IP is now the global, universal open networking architecture across public and private networks.

---

## 1.3 TCP/IP Architecture: Original vs. Updated Models
The TCP/IP model exists in two iterations:

```
+---------------------------------------+---------------------------------------+
| Original TCP/IP Model (RFC 1122 - 4L) | Updated TCP/IP Model (5-Layer Model)  |
+---------------------------------------+---------------------------------------+
| Layer 4: Application                  | Layer 5: Application                  |
+---------------------------------------+---------------------------------------+
| Layer 3: Transport                    | Layer 4: Transport                    |
+---------------------------------------+---------------------------------------+
| Layer 2: Internet                     | Layer 3: Network (Internet)           |
+---------------------------------------+---------------------------------------+
| Layer 1: Link (Network Access)        | Layer 2: Data Link                    |
|                                       +---------------------------------------+
|                                       | Layer 1: Physical                     |
+---------------------------------------+---------------------------------------+
```

### Protocol Examples per Layer
- **Application**: HTTP, HTTPS, POP3, SMTP, IMAP, DNS, DHCP, FTP, Telnet, SSH, SNMP.
- **Transport**: TCP (reliable connection-oriented), UDP (best-effort connectionless).
- **Network / Internet**: IP (IPv4, IPv6), ICMP, ARP (resolves IP to MAC), routing protocols (OSPF, EIGRP, BGP).
- **Data Link**: Ethernet (IEEE 802.3), Wi-Fi (IEEE 802.11), HDLC, PPP.
- **Physical**: RJ-45, Cat5e/Cat6 copper, SFP/SFP+ optical transceivers, cabling standards.

---

## 1.4 OSI 7-Layer Reference Model vs. TCP/IP Models
The Open Systems Interconnection (OSI) reference model was developed by the International Organization for Standardization (ISO). While TCP/IP is the implemented protocol stack, OSI remains the standard descriptive model for networking concepts.

```
OSI 7-Layer Model            Original TCP/IP (4L)        Updated TCP/IP (5L)
+---+--------------+        +---+-------------+         +---+-------------+
| 7 | Application  |---+    | 4 | Application |         | 5 | Application |
+---+--------------+   |    |   |             |         |   |             |
| 6 | Presentation |---+----+   |             |         |   |             |
+---+--------------+   |    |   |             |         |   |             |
| 5 | Session      |---+    +---+-------------+         +---+-------------+
+---+--------------+        | 3 | Transport   |         | 4 | Transport   |
| 4 | Transport    |------->+---+-------------+-------->+---+-------------+
+---+--------------+        | 2 | Internet    |         | 3 | Network     |
| 3 | Network      |------->+---+-------------+-------->+---+-------------+
+---+--------------+        | 1 | Link        |         | 2 | Data Link   |
| 2 | Data Link    |---+    |   |             |-------->+---+-------------+
+---+--------------+   +--->|   |             |         | 1 | Physical    |
| 1 | Physical     |---+    +---+-------------+         +---+-------------+
+---+--------------+
```

*Mnemonic for OSI Layers (7 down to 1)*: **A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing.

---

## 1.5 OSI Layer Definitions & Functional Architecture

| Layer Number | Layer Name | Functional Description | Primary Capabilities |
|---|---|---|---|
| **Layer 7** | **Application** | Interface between communications software and application processes residing on the host. | User authentication, resource identification, service advertisement. |
| **Layer 6** | **Presentation** | Negotiates and defines data formatting, encoding, and syntax translation. | Data formatting (ASCII, EBCDIC, binary, JPEG, MPEG), encryption/decryption, data compression. |
| **Layer 5** | **Session** | Initiates, controls, manages, and terminates bidirectional conversations (sessions). | Session establishment, simplex/half-duplex/full-duplex dialogue separation, checkpointing and recovery. |
| **Layer 4** | **Transport** | End-to-end data delivery across the network between host processes. | Segmentation, reassembly, service-point addressing (ports), connection management, flow control, error recovery. |
| **Layer 3** | **Network** | Logical addressing, packet routing (forwarding), and path determination. | Global hierarchical logical addressing (IPv4/IPv6), packet forwarding across intermediate routers, routing table maintenance. |
| **Layer 2** | **Data Link** | Rules and protocols governing medium access and node-to-node hop forwarding. | Physical addressing (MAC), medium access control (CSMA/CD), framing (header + trailer), error detection via Frame Check Sequence (FCS). |
| **Layer 1** | **Physical** | Physical transmission of raw bit streams over physical media. | Pinouts, connectors (RJ-45), signaling voltages, optical light pulses, bit timing/encoding, medium specifications. |

---

## 1.6 OSI Model Protocols and Physical Devices

| Layer Name | Protocols & Specifications | Representative Network Devices |
|---|---|---|
| **Layers 5–7** (Application, Presentation, Session) | HTTP, HTTPS, Telnet, SSH, FTP, TFTP, SMTP, POP3, IMAP, DNS, DHCP, SNMP, VoIP (SIP/RTP) | End hosts, servers, application firewalls, Layer 7 proxies |
| **Layer 4** (Transport) | TCP, UDP | End hosts, stateful firewalls |
| **Layer 3** (Network) | IPv4, IPv6, ICMP, ICMPv6, IPsec, OSPF, EIGRP, BGP | Routers, Layer 3 multilayer switches |
| **Layer 2** (Data Link) | Ethernet (IEEE 802.3), Wi-Fi (IEEE 802.11), HDLC, PPP, Frame Relay | Layer 2 LAN switches, Wireless Access Points, Cable/DSL modems |
| **Layer 1** (Physical) | RJ-45, TIA/EIA-568A/B, 10BASE-T, 100BASE-TX, 1000BASE-T, 10GBASE-LR | LAN Hubs (repeaters), patch panels, cables, fiber transceivers (SFP/SFP+) |

---

## 1.7 Layer Interaction: Same-Layer vs. Adjacent-Layer

```
Computer A                                               Computer B
+-----------------------+                               +-----------------------+
| Layer N (e.g., TCP)   | <=== Same-Layer Interaction ===> | Layer N (e.g., TCP)   |
| Uses header info      |      (via Protocol Header)    | Uses header info      |
+-----------------------+                               +-----------------------+
          |  ^
 Adjacent |  | Adjacent
    Layer |  | Layer
  Service |  | Request
          v  |
+-----------------------+                               +-----------------------+
| Layer N-1 (e.g., IP)  |                               | Layer N-1 (e.g., IP)  |
+-----------------------+                               +-----------------------+
```

1. **Same-Layer Interaction on Different Computers**:
   - Two peer hosts use a common protocol at Layer $N$ to communicate.
   - The transmitting host inserts a protocol header containing instructions (e.g., TCP sequence number, flags); the receiving host's Layer $N$ reads and acts upon those header fields.
2. **Adjacent-Layer Interaction on the Same Computer**:
   - On a single host, Layer $N$ requests services from the adjacent lower Layer $N-1$.
   - Layer $N-1$ processes the payload from Layer $N$, encapsulates it, and provides a service (e.g., IP provides packet forwarding to TCP; Ethernet provides frame transit to IP).

---

## 1.8 Data Encapsulation Hierarchy & Protocol Data Units (PDUs)

Data encapsulation is the systematic process where higher-layer protocol data is wrapped inside headers (and optional trailers) at each successive layer before transmission.

### The 5 Steps of Encapsulation
1. **Step 1 (Application)**: Application prepares user data (e.g., HTTP GET request or HTML response).
2. **Step 2 (Transport)**: Transport layer wraps data with a TCP or UDP header $\rightarrow$ **Segment**.
3. **Step 3 (Network)**: Network layer wraps segment with an IP header containing Source and Destination IP addresses $\rightarrow$ **Packet**.
4. **Step 4 (Data Link)**: Data link layer wraps packet with a Link Header (LH) and Link Trailer (LT) containing MAC addresses and FCS error detection $\rightarrow$ **Frame**.
5. **Step 5 (Physical)**: Physical layer encodes the frame into electrical signals, optical pulses, or radio waves $\rightarrow$ **Bits**.

```
Encapsulation Flow:

[ Application Data ]
         |
         v
[ L4 Header | Application Data ]                         = L4PDU (Segment)
         |
         v
[ L3 Header | L4 Header | Application Data ]             = L3PDU (Packet)
         |
         v
[ LH | L3 Header | L4 Header | Application Data | LT ]   = L2PDU (Frame)
         |
         v
0110100101101011001010100101010110101101010100010101     = L1 (Bits)
```

*Terminology*:
- **PDU (Protocol Data Unit)**: The formal OSI term for data and headers at a specific layer (`L4PDU`, `L3PDU`, `L2PDU`).
- **LH**: Link Header (contains Source MAC, Destination MAC, EtherType).
- **LT**: Link Trailer (contains Frame Check Sequence / CRC).
- **Segment**: Layer 4 PDU (TCP/UDP).
- **Packet**: Layer 3 PDU (IP).
- **Frame**: Layer 2 PDU (Ethernet).

---

## 1.9 Application Layer Mechanics (HTTP Example)
The Hypertext Transfer Protocol (HTTP) illustrates request-reply client-server application logic:

```
Web Server "Larry"                                             Web Browser "Bob"
        |                                                              |
        |<================ 1. HTTP Request (GET home.htm) =============|
        |                  Header: [GET home.htm]                      |
        |                                                              |
        |================= 2. HTTP Reply (OK + Payload) ===============>|
        |                  Header: [OK] | Data: [home.htm partial]     |
        |                                                              |
        |================= 3. Data-Only Message =======================>|
        |                  Data: [More of file home.htm]               |
        v                                                              v
```

1. **Client Request**: Browser Bob creates an HTTP `GET home.htm` header and dispatches it over TCP connection to Larry.
2. **Server Response**: Server Larry generates an HTTP header with status code `200 OK` followed by the initial block of data for `home.htm`.
3. **Payload Streaming**: For large files exceeding a single maximum transmission unit (MTU), the application stream is segmented and delivered across subsequent packets.

---

## 1.10 Transport Layer Mechanics (TCP Error Recovery)
TCP provides guaranteed end-to-end delivery using Sequence Numbers (SEQ) and Acknowledgments (ACK):

```
Web Server "Larry"                                             Web Browser "Bob"
        |                                                              |
        |---- 1. [TCP SEQ=1] [HTTP OK | Web Page] -------------------->| (Received)
        |                                                              |
        |---- 2. [TCP SEQ=2] [Data: More Web Page] ----X (LOST!)       | (Dropped)
        |                                                              |
        |---- 3. [TCP SEQ=3] [Data: Rest of Web Page] ---------------->| (Received)
        |                                                              |
        |<--- 4. [TCP ACK: Send 2 Next] -------------------------------| (Requests SEQ=2)
        |                                                              |
        |---- 5. [TCP SEQ=2] [Data: More Web Page] (Retransmission) -->| (Recovered)
        v                                                              v
```

- When packet with `SEQ=2` is dropped by network congestion, Bob detects a sequence gap when receiving `SEQ=3`.
- Bob issues a TCP acknowledgment asking for `Send 2 Next`.
- Larry retransmits `SEQ=2`, repairing the transmission without application intervention.

---

## 1.11 Network Layer Routing & Hop-by-Hop Forwarding Logic

### Network Topology
```
Subnet: 1.0.0.0/8             Subnet: 2.0.0.0/8
+-------------------+        +-------------------+
| Larry (1.1.1.1)   |        | Bob (2.2.2.2)     |
+-------------------+        +-------------------+
          |                            |
       (LAN 1)                      (LAN 2)
          v                            v
      +-------+     WAN Link       +-------+
      |  R1   |------------------->|  R2   |
      +-------+                    +-------+
          \                            /
           \                          /
            \       +-------+        /
             +----->|  R3   |<------+
                    +-------+
                        |
                     (LAN 3)
                        v
               +-------------------+
               | Archie (3.3.3.3)  |
               +-------------------+
               Subnet: 3.0.0.0/8
```

### Step-by-Step Routing Execution (Larry sending to Bob)
1. **Packet Construction**:
   - Source IP: `1.1.1.1`
   - Destination IP: `2.2.2.2`
   - Payload: TCP segment containing HTTP data.
2. **Host Routing Decision**:
   - Larry checks destination `2.2.2.2` against local subnet mask (`1.0.0.0/8`).
   - Destination is off-subnet. Larry routes packet to its configured **Default Gateway** (Router `R1`).
3. **Hop 1 Forwarding (Larry $\rightarrow$ R1 via Ethernet)**:
   - Encapsulation: `[Eth Header: Dest MAC = R1, Src MAC = Larry | IP Packet | Eth Trailer]`.
   - R1 receives frame, performs CRC check on FCS trailer, strips Ethernet header/trailer (decapsulation).
4. **Intermediate Forwarding (R1 $\rightarrow$ R2)**:
   - R1 examines Destination IP `2.2.2.2`.
   - R1 inspects its routing table: network `2.0.0.0/8` has next hop `R2` via outgoing interface.
   - R1 encapsulates IP packet in the appropriate Layer 2 link frame (e.g., HDLC/PPP/Ethernet) and transmits to R2.
5. **Final Hop Forwarding (R2 $\rightarrow$ Bob via Ethernet)**:
   - R2 decapsulates incoming Layer 2 frame.
   - R2 routing table shows `2.0.0.0/8` is directly connected on its local LAN interface.
   - R2 encapsulates IP packet into an Ethernet frame:
     - Dest MAC: Bob's MAC address (resolved via ARP)
     - Src MAC: R2's LAN interface MAC address
   - Bob receives frame, verifies FCS, strips Layer 2 header, delivers IP packet to Transport layer.

---

# 2. Chapter 2: Fundamentals of Ethernet LANs

## 2.1 LAN Architectural Topologies: SOHO to Multi-Tier Campus

### SOHO (Small Office / Home Office) LAN
- **Wired SOHO**: Broadband router with integrated switch ports or external Layer 2 switch connecting wired PCs and printers.
- **Wired + Wireless SOHO**: Router connects to a switch and an Access Point (AP), extending connectivity to mobile devices and tablets.

### Multi-Tier Enterprise Campus Architecture
For physical buildings with multiple floors, structured cabling connects distributed access switches to centralized distribution/core switches:

```
3rd Floor:  [ PC3 ] ----- [ AP ] ----- [ Switch SW3 ]
                                              | (Vertical Riser)
2nd Floor:  [ PC2 ] ----- [ AP ] ----- [ Switch SW2 ]
                                              | (Vertical Riser)
1st Floor:  [ PC1 ] ----- [ AP ] ----- [ Switch SW1 ]
                                              |
                                              v
                              [ Distribution Switch SWD ]
                                              |
                                              v
                                      [ Core Router ] =====> Enterprise Core / WAN
```

---

## 2.2 IEEE 802.3 Ethernet Standards & Physical Media

| Speed | Informal Name | Formal IEEE Standard | Media Type | Maximum Transmission Distance |
|---|---|---|---|---|
| **10 Mbps** | 10BASE-T | IEEE 802.3 | Copper (UTP Cat3/Cat5) | 100 meters |
| **100 Mbps** | 100BASE-TX (Fast Ethernet) | IEEE 802.3u | Copper (UTP Cat5/Cat5e) | 100 meters |
| **1000 Mbps (1 Gbps)** | 1000BASE-T (Gigabit Ethernet) | IEEE 802.3ab | Copper (UTP Cat5e/Cat6) | 100 meters |
| **1000 Mbps (1 Gbps)** | 1000BASE-LX | IEEE 802.3z | Long-wavelength Optical Fiber | 5,000 meters (5 km) |
| **10 Gbps** | 10GBASE-T (10 Gig Ethernet) | IEEE 802.3an | Copper (UTP Cat6/Cat6a) | 100 meters (55m Cat6, 100m Cat6a) |

> **Architectural Invariant**: A Layer 2 frame forwarded across multiple physical segments (e.g., 10 Mbps copper $\rightarrow$ 1 Gbps fiber $\rightarrow$ 10 Gbps fiber $\rightarrow$ 100 Mbps copper) undergoes changes in physical encoding and signaling, but the **Ethernet Data Link Frame format remains identical end-to-end**.

---

## 2.3 UTP Cabling, Transceivers, and Circuit Fundamentals
- **Electrical Circuit**: Transmission across copper requires a closed loop. One pair of wires (two copper conductors) forms a single electrical circuit transmitting in one direction:
  - Wire 1 carries the outgoing current from transmitter.
  - Wire 2 provides the reference/return path to complete the circuit at the receiver.
- **Twisting Cancelation**: Twisting paired conductors cancels out Electromagnetic Interference (EMI) and Radio Frequency Interference (RFI) via differential signaling and crosstalk reduction.
- **RJ-45 Physical Interface**:
  - Connectors: 8-pin male RJ-45 modular plug.
  - Ports: 8-pin female RJ-45 modular jack.
- **Modular Optical Interfaces**: High-speed switches utilize hot-swappable transceivers (e.g., SFP for 1 Gbps, SFP+ for 10 Gbps) inserted into modular chassis cages (e.g., Cisco Catalyst 3560CX).

---

## 2.4 UTP Pinouts: Straight-Through vs. Crossover Rules

### 10BASE-T and 100BASE-TX Pair Usage
10BASE-T and 100BASE-TX use **only 2 pairs (4 wires)** of an 8-wire UTP cable:
- Pair on Pins 1 & 2
- Pair on Pins 3 & 6
- Pins 4, 5, 7, and 8 are completely unused.

### Pinout Rules by Device Class
Devices fall into two distinct physical transmission categories:

```
Category A Devices (Transmit on 1,2 | Receive on 3,6):
- PC Network Interface Cards (NICs)
- Routers
- Wireless Access Points (Ethernet port)

Category B Devices (Transmit on 3,6 | Receive on 1,2):
- Switches
- Hubs
```

### Cabling Selection Rules
1. **Straight-Through Cable**: Connects devices in **different** categories (Category A to Category B).
   - Pin 1 $\rightarrow$ Pin 1
   - Pin 2 $\rightarrow$ Pin 2
   - Pin 3 $\rightarrow$ Pin 3
   - Pin 6 $\rightarrow$ Pin 6
   - *Use Cases*: PC to Switch, PC to Hub, Router to Switch, Router to Hub.
2. **Crossover Cable**: Connects devices in the **same** category (Category A to Category A, or Category B to Category B).
   - Pin 1 $\rightarrow$ Pin 3
   - Pin 2 $\rightarrow$ Pin 6
   - Pin 3 $\rightarrow$ Pin 1
   - Pin 6 $\rightarrow$ Pin 2
   - *Use Cases*: Switch to Switch, Switch to Hub, Hub to Hub, Router to Router, PC to PC, PC to Router.

```
Straight-Through Pinout (PC to Switch):
PC (Category A)                      Switch (Category B)
Pin 1 (Tx+) ------------------------ Pin 1 (Rx+)
Pin 2 (Tx-) ------------------------ Pin 2 (Rx-)
Pin 3 (Rx+) ------------------------ Pin 3 (Tx+)
Pin 6 (Rx-) ------------------------ Pin 6 (Tx-)

Crossover Pinout (Switch to Switch / PC to PC):
Node 1                               Node 2
Pin 1 (Tx+) -------------\ /-------- Pin 1 (Tx+)
Pin 2 (Tx-) ------------- X -------- Pin 2 (Tx-)
Pin 3 (Rx+) -------------/ \-------- Pin 3 (Rx+)
Pin 6 (Rx-) ------------------------ Pin 6 (Rx-)
```

*(Note: Auto-MDIX allows switch ports to dynamically detect pin configurations and internally flip transmit/receive pairs, rendering physical crossover cables optional on modern hardware).*

---

## 2.5 Gigabit UTP (1000BASE-T) 4-Pair Bi-Directional Operation
- Unlike 10/100BASE-T, **1000BASE-T requires all 4 pairs (8 wires)**: Pins (1,2), (3,6), (4,5), and (7,8).
- High throughput is achieved by transmitting and receiving **simultaneously in both directions on all four pairs** using hybrid circuits and Digital Signal Processing (DSP) for echo and crosstalk cancellation.

---

## 2.6 Fiber-Optic Cabling: Multimode vs. Single-Mode

### Physical Construction of Optical Fiber
- **Core**: High-purity silica glass cylinder carrying the light pulses.
- **Cladding**: Optical glass layer surrounding the core with a lower refractive index, forcing light rays back into the core via **total internal reflection**.
- **Buffer**: Protective inner plastic coating.
- **Strengthener**: Aramid yarn (Kevlar) preventing stretching.
- **Outer Jacket**: External PVC/plenum casing.

```
       +--------------------------------------------+ Outer Jacket
       |  +--------------------------------------+  | Strengthener (Aramid/Kevlar)
       |  |  +--------------------------------+  |  | Buffer
       |  |  |  +--------------------------+  |  |  | Cladding
       |  |  |  |  +====================+  |  |  |  | Core (Glass)
=======[==|==|==|==( Light Transmission )==|==|==|==]=======>
       |  |  |  |  +====================+  |  |  |  |
       |  |  |  +--------------------------+  |  |  |
       |  |  +--------------------------------+  |  |
       |  +--------------------------------------+  |
       +--------------------------------------------+
```

### Multimode Fiber (MMF)
- **Core Diameter**: Large (50 or 62.5 microns).
- **Light Source**: Inexpensive Light Emitting Diodes (LEDs) or Vertical-Cavity Surface-Emitting Lasers (VCSELs).
- **Dispersion**: Light enters at multiple angles (modes), bouncing off cladding. Waves arrive at slightly different times (**modal dispersion**), limiting maximum transmission distances to ~300 to 500 meters.

### Single-Mode Fiber (SMF)
- **Core Diameter**: Very narrow (~9 microns).
- **Light Source**: High-powered solid-state Lasers.
- **Dispersion**: Light travels in a straight line along the center axis without internal reflection. Virtually zero modal dispersion; supports long distance transmission (10 km to 40+ km).

### Dual-Strand Operation
Optical fiber links operate in full duplex using two paired physical strands:
- **Tx Strand**: Transmit port on Switch 1 connects to Receive (Rx) port on Switch 2.
- **Rx Strand**: Receive port on Switch 1 connects to Transmit (Tx) port on Switch 2.

---

## 2.7 10-Gbps Optical Ethernet Standards

| Standard | Fiber Type | Core / Optical Specification | Maximum Distance (without repeaters) |
|---|---|---|---|
| **10GBASE-S** | Multimode (MM) | 850 nm Short-wavelength optical laser | 400 meters |
| **10GBASE-LX4** | Multimode (MM) | 1310 nm Wavelength Division Multiplexing | 300 meters |
| **10GBASE-LR** | Single-mode (SM) | 1310 nm Long-wavelength optical laser | 10 kilometers |
| **10GBASE-E** | Single-mode (SM) | 1550 nm Extra-long wavelength optical laser | 30 kilometers |

---

## 2.8 Comprehensive Physical Media Comparison

| Selection Criteria | Unshielded Twisted Pair (UTP) | Multimode Fiber (MMF) | Single-Mode Fiber (SMF) |
|---|---|---|---|
| **Relative Cable Cost** | Low | Medium | Medium |
| **Switch Port / Transceiver Cost** | Low | Medium | High |
| **Typical Maximum Distance** | 100 meters | ~500 meters | Up to 40 km |
| **Susceptibility to EMI/RFI** | Moderate / Some | None (Immune) | None (Immune) |
| **Risk of Cable Signal Eavesdropping** | Moderate / Some | None | None |

---

## 2.9 IEEE 802.3 Ethernet Frame Format

```
+----------+-----+-------------+------------+------+--------------+-----+
| Preamble | SFD | Destination | Source MAC | Type | Data and Pad | FCS |
| (7 B)    | (1) | MAC (6 B)   | (6 B)      | (2)  | (46-1500 B)  | (4) |
+----------+-----+-------------+------------+------+--------------+-----+
<------------------------- Header -------------------------> <Payload>  <Trailer>
```

| Field Name | Length in Bytes | Functional Purpose |
|---|---|---|
| **Preamble** | 7 bytes | 56 alternating bits (`10101010...`) used by receiving NIC to synchronize clock timing. |
| **Start Frame Delimiter (SFD)**| 1 byte | Byte pattern `10101011` (`0xAB`) signaling that the next byte is the Destination MAC address. |
| **Destination MAC Address** | 6 bytes | 48-bit physical address identifying the intended recipient network interface. |
| **Source MAC Address** | 6 bytes | 48-bit physical address identifying the transmitting network interface. |
| **Type (EtherType)** | 2 bytes | Identifies the upper-layer protocol encapsulated inside the frame (`0x0800` = IPv4, `0x86DD` = IPv6). |
| **Data and Pad** | 46 to 1500 bytes| Contains the Layer 3 PDU (packet). Minimum payload size is 46 bytes; if payload is smaller, sender adds padding to meet the 64-byte minimum frame size (excluding preamble/SFD). Maximum standard payload is 1500 bytes (MTU). |
| **Frame Check Sequence (FCS)**| 4 bytes | 32-bit Cyclic Redundancy Check (CRC). Receiving node calculates CRC and compares to FCS; if mismatch occurs, frame is silently discarded. |

*Frame Size Rules*:
- Minimum Ethernet Frame Size (Destination MAC through FCS): **64 bytes**.
- Maximum Ethernet Frame Size (Destination MAC through FCS): **1518 bytes** (excluding 802.1Q tags).

---

## 2.10 MAC Addressing: Structure, Types, and Terminology
- **Physical Address Structure**: 48 bits (6 bytes), represented as 12 hexadecimal digits (e.g., `0060.2F3A.07BC` or `00:60:2F:3A:07:BC`).
  - **First 24 bits (6 hex digits)**: **OUI** (Organizationally Unique Identifier), globally registered and assigned to vendors by the IEEE.
  - **Last 24 bits (6 hex digits)**: **Vendor Assigned** (serial interface number assigned by the hardware manufacturer).
- **Alternative Terminology**:
  - **MAC Address**: Media Access Control sublayer address.
  - **Burned-In Address (BIA)**: Permanently encoded ROM address on the NIC.
  - **Ethernet / LAN / NIC Address**: Equivalent Layer 2 hardware identifiers.
- **Transmission Addressing Types**:
  1. **Unicast**: Targets a single specific network interface.
  2. **Broadcast**: Targets all devices residing on the local LAN broadcast domain (`FFFF.FFFF.FFFF`).
  3. **Multicast**: Targets a dynamically registered subset of devices on the LAN (IPv4 multicast MACs start with prefix `01-00-5E`).

---

## 2.11 EtherType Protocol Identification
The 2-byte Type field identifies the encapsulated Layer 3 protocol:
- `0x0800`: IPv4 (Internet Protocol Version 4)
- `0x86DD`: IPv6 (Internet Protocol Version 6)
- `0x0806`: ARP (Address Resolution Protocol)

---

## 2.12 Switch Forwarding vs. Legacy Hub Collisions (Duplex Modes)

```
Legacy Hub Network (Half Duplex / Shared Medium):
[ Host A ] ---\
               +---> [ Shared Hub 1 ] (Collision Domain) ---> [ Host Larry ]
[ Host B ] ---/          (COLLISION!)

Modern Switched Network (Full Duplex / Microsegmentation):
[ Host 1 ] <--- 10 Mbps Full ---> [ SW1 ] <--- 1 Gbps Full ---> [ SW2 ] <--- 100 Mbps Full ---> [ Host 2 ]
                                  (Buffers frames, looks up MAC table, zero collisions)
```

### Full Duplex vs. Half Duplex

| Feature | Half Duplex | Full Duplex |
|---|---|---|
| **Transmission Capability** | Transmit OR Receive (cannot do both simultaneously) | Transmit AND Receive simultaneously |
| **Collision Potential** | Collisions occur under concurrent transmission | Collisions impossible (separate transmit/receive channels) |
| **CSMA/CD Algorithm** | Required and active (Carrier Sense / Collision Detection)| Disabled (not needed) |
| **Typical Hardware** | Legacy Hubs, shared coax, or mismatched switch ports | Layer 2/3 Switches connected to modern NICs |
| **Link Utilization** | Limited (typically 50-60% practical throughput) | 100% bidirectional line rate |

---

# 3. Chapter 6: Configuring Basic Switch Management

## 3.1 Cisco IOS CLI Privilege Modes & Navigation

```
Mode: User EXEC
Prompt: Switch>
Access: Connect via Console or VTY.
Privilege: View basic status, ping, traceroute. Cannot modify configuration.
          |
          | Command: enable
          v
Mode: Privileged EXEC (Enable Mode)
Prompt: Switch#
Access: Protected by enable secret password.
Privilege: Full inspection (show), debugging, reloads, file operations.
          |
          | Command: configure terminal
          v
Mode: Global Configuration Mode
Prompt: Switch(config)#
Privilege: System-wide configuration changes.
          |
          +---> line console 0          ===> Switch(config-line)#
          +---> line vty 0 15           ===> Switch(config-line)#
          +---> interface <int-id>      ===> Switch(config-if)#
```

---

## 3.2 Simple Password Authentication Configuration
Simple password security relies on a single shared password per line:

```cisco
Switch# configure terminal
Switch(config)# hostname SW1

! Protect Privileged EXEC mode with an MD5/SHA encrypted password
Switch(config)# enable secret cisco-enable-pass

! Configure Console Port access password
Switch(config)# line console 0
Switch(config-line)# password cisco-console-pass
Switch(config-line)# login
Switch(config-line)# exit

! Configure Remote VTY (Telnet/SSH) lines 0 through 15
Switch(config)# line vty 0 15
Switch(config-line)# password cisco-vty-pass
Switch(config-line)# login
Switch(config-line)# end
```

---

## 3.3 Local Username Database Authentication
Local username authentication enhances accountability by requiring individual user credentials stored in the switch's local database:

```cisco
Switch# configure terminal
! Create user accounts with encrypted passwords
Switch(config)# username wendell secret odom_secret
Switch(config)# username admin secret admin_secret

! Enforce local database lookup on the console port
Switch(config)# line console 0
Switch(config-line)# login local
Switch(config-line)# exit

! Enforce local database lookup on remote VTY lines
Switch(config)# line vty 0 15
Switch(config-line)# login local
Switch(config-line)# end
```

---

## 3.4 Centralized AAA Server Authentication (RADIUS / TACACS+)
In enterprise deployments, maintaining local user databases across thousands of switches is impractical. Switches forward authentication requests to external Authentication, Authorization, and Accounting (AAA) servers:

```
+------------+       1. Telnet / SSH        +------------+   2. Access-Request   +------------+
| Workstation| ---------------------------> | Switch SW1 | --------------------> | AAA Server |
|   Client   | <--------------------------- |            | <-------------------- | (RADIUS /  |
+------------+     4. CLI Prompt Granted    +------------+   3. Access-Accept    |  TACACS+)  |
                                                                                 +------------+
```

1. User attempts login on Switch `SW1`.
2. `SW1` encapsulates credentials in a RADIUS or TACACS+ packet and queries central AAA Server `S1`.
3. AAA server evaluates central directory (e.g., Active Directory / LDAP) and returns `Approved`.
4. Switch opens CLI prompt for user.

---

## 3.5 Secure Shell (SSH v2) Configuration & Verification
SSH encrypts CLI sessions, replacing insecure clear-text Telnet.

### Configuration Sequence
```cisco
Switch# configure terminal

! Step 1: Configure a unique hostname (mandatory for crypto key generation)
Switch(config)# hostname SW1

! Step 2: Configure a domain name (combined with hostname to form the device FQDN)
SW1(config)# ip domain-name example.com

! Step 3: Generate RSA public/private key pairs (minimum 1024 bits for SSHv2)
SW1(config)# crypto key generate rsa
The name for the keys will be: SW1.example.com
How many bits in the modulus [512]: 1024

! Step 4: Configure local user credentials
SW1(config)# username admin secret StrongAdminPass123

! Step 5: Configure VTY lines to use local login and allow only SSH
SW1(config)# line vty 0 15
SW1(config-line)# login local
SW1(config-line)# transport input ssh
SW1(config-line)# end
```

### Verification Commands
```cisco
SW1# show ip ssh
SSH Enabled - version 2.0
Authentication timeout: 120 secs; Authentication retries: 3

SW1# show ssh
Connection Version Mode Encryption  Hmac       State           Username
0          2.0     IN   aes128-cbc  hmac-sha1  Session started admin
```

---

## 3.6 Switch Virtual Interface (SVI) Management IP
Because a Layer 2 switch lacks routed physical ports by default, remote IP management requires a logical **Switch Virtual Interface (SVI)**:
- An SVI acts as the switch’s internal virtual host interface.
- By default, all ports are assigned to VLAN 1, making `interface vlan 1` the default management SVI.
- In production, security best practices dictate configuring the SVI on a dedicated Management VLAN (e.g., VLAN 99 or VLAN 2).

```
+-------------------------------------------------------------+
| Switch Internal Architecture                                |
|                                                             |
| Physical Ports (Fa0/1 - Fa0/24)                             |
|       |               |               |                     |
|       v               v               v                     |
| +---------------------------------------------------------+ |
| | VLAN 1 (Layer 2 Broadcast Domain)                       | |
| +---------------------------------------------------------+ |
|                              ^                              |
|                              | Internal Virtual Link        |
|                              v                              |
|               +-----------------------------+               |
|               | SVI: interface vlan 1       |               |
|               | IP: 192.168.1.200/24        | (Embedded     |
|               +-----------------------------+  Virtual Host)|
+-------------------------------------------------------------+
```

---

## 3.7 Switch Default Gateway Requirement
- A Layer 2 switch uses its SVI IP address to communicate with management stations.
- If the managing network engineer's workstation is on a **different subnet/network**, the switch cannot reply using Layer 2 MAC delivery alone.
- The switch must have an `ip default-gateway` configured pointing to the local router interface on that subnet; otherwise, reply packets destined for remote subnets are dropped.

```cisco
Switch(config)# ip default-gateway 192.168.1.1
```

---

## 3.8 Static vs. Dynamic (DHCP) Switch IP Configuration

### Static Management Configuration
```cisco
SW1# configure terminal
SW1(config)# interface vlan 1
SW1(config-if)# ip address 192.168.1.200 255.255.255.0
SW1(config-if)# no shutdown
SW1(config-if)# exit
SW1(config)# ip default-gateway 192.168.1.1
SW1(config)# end
```

### Dynamic Management Configuration via DHCP
```cisco
SW1# configure terminal
SW1(config)# interface vlan 1
SW1(config-if)# ip address dhcp
SW1(config-if)# no shutdown
SW1(config-if)# end
```

### DHCP Verification Commands
```cisco
SW1# show dhcp lease
Temp IP addr: 192.168.1.101  for peer on Interface: Vlan1
Temp sub net mask: 255.255.255.0
   DHCP Lease server: 192.168.1.1, state: 3 Bound
   Lease: 86400 secs,  Renewal: 43200 secs,  Rebind: 75600 secs
Temp default-gateway addr: 192.168.1.1

SW1# show interfaces vlan 1
Vlan1 is up, line protocol is up
  Hardware is EtherSVI, address is 0019.e86a.6fc0 (bia 0019.e86a.6fc0)
  Internet address is 192.168.1.101/24

SW1# show ip default-gateway
192.168.1.1
```

---

## 3.9 CLI History Buffer Management

| Command | Configuration Mode | Functional Description |
|---|---|---|
| `show history` | Privileged EXEC | Displays the command strings currently stored in the active terminal history buffer. |
| `terminal history size <x>` | Privileged EXEC | Dynamically changes the history buffer recall depth for the **current login session only**. |
| `history size <x>` | Line Configuration (`line con 0` / `line vty 0 15`) | Permanently sets the default command history buffer size for all users logging into that line. |

---

## 3.10 Productivity & Safety Commands for Lab/Production

```cisco
Switch# configure terminal

! Disable DNS name lookup so typos are not interpreted as domain names (avoids 30s broadcast hang)
Switch(config)# no ip domain-lookup

! Apply ergonomic settings to Console and VTY lines
Switch(config)# line console 0
Switch(config-line)# exec-timeout 0 0        ! Disables idle auto-logout (0 mins 0 secs)
Switch(config-line)# logging synchronous    ! Prevents unsolicited log messages from breaking typed CLI text
Switch(config-line)# history size 50        ! Expands history buffer depth
Switch(config-line)# exit

Switch(config)# line vty 0 15
Switch(config-line)# exec-timeout 0 0
Switch(config-line)# logging synchronous
Switch(config-line)# history size 50
Switch(config-line)# end
```

---

# 4. Chapter 8: Implementing Ethernet Virtual LANs (VLANs & Trunking)

## 4.1 VLAN Concept & Broadcast Domain Segmentation
A **Broadcast Domain** encompasses all devices that receive a broadcast frame transmitted by any host within the group.

- **Without VLANs**: Creating separate broadcast domains requires physically separate switches (e.g., Switch 1 for Subnet 1, Switch 2 for Subnet 2).
- **With VLANs**: A single physical Layer 2 switch is partitioned into multiple logical broadcast domains:
  - Traffic in VLAN 1 (Subnet 1) is completely isolated from VLAN 2 (Subnet 2) at Layer 2.
  - Broadcasts sent by a host in VLAN 1 never leak into VLAN 2.

```
Without VLANs (2 Physical Switches):
[ PC: Dino ] ----+                  [ PC: Wilma ] ----+
                 v                                    v
[ PC: Fred ] --> [ SW1 (Subnet 1) ] [ PC: Betty ] --> [ SW2 (Subnet 2) ]

With VLANs (1 Physical Switch):
[ PC: Dino ] ----(VLAN 1 / Subnet 1)----+
                                        |
[ PC: Fred ] ----(VLAN 1 / Subnet 1)----+---> [ Switch SW1 ]
                                        |     (Internal Isolation)
[ PC: Wilma ] ---(VLAN 2 / Subnet 2)----+
                                        |
[ PC: Betty ] ---(VLAN 2 / Subnet 2)----+
```

---

## 4.2 Multi-Switch VLANs & The Necessity of Trunking
When VLANs span across multiple switches:
- **Without Trunking**: Requires one physical inter-switch cable per VLAN (Port Fa0/1 connects VLAN 10; Port Fa0/2 connects VLAN 20). This results in port waste and scalability collapse.
- **With Trunking**: A single physical link (**Trunk Link**) multiplexes traffic for multiple VLANs simultaneously by injecting a tag into the Ethernet frame header.

```
Trunking Mechanism across Two Switches:
[ PC 11 (VLAN 10) ]
        | (Untagged Frame)
        v
    +-------+                       VLAN Tagged Frame                      +-------+
    |  SW1  | ===========================================================> |  SW2  |
    +-------+   Trunk Link (Gi0/1 <-> Gi0/2): [Tag: VLAN 10][Ethernet]    +-------+
                                                                               | (Tag Stripped)
                                                                               v
                                                                      [ PC 13 (VLAN 10) ]
```

1. Host PC 11 transmits standard untagged Ethernet frame to switch access port.
2. `SW1` inserts an 802.1Q header with `VLAN ID = 10` and forwards frame across the trunk link.
3. `SW2` reads the tag, removes the 802.1Q header, and forwards the original untagged frame out access ports in VLAN 10.

---

## 4.3 IEEE 802.1Q Frame Tagging Architecture
IEEE 802.1Q is the industry-standard trunking protocol. It inserts a **4-byte (32-bit)** header directly between the Source MAC address and the EtherType field:

```
Standard Ethernet Frame:
+---------------+------------------+--------------+------------------+---------+
| Dest MAC (6B) | Source MAC (6B)  | Type (2B)    | Data (46-1500 B) | FCS (4B)|
+---------------+------------------+--------------+------------------+---------+

802.1Q Tagged Frame:
+---------------+------------------+--------------+-----------+------------------+---------+
| Dest MAC (6B) | Source MAC (6B)  | 802.1Q (4B)  | Type (2B) | Data (46-1500 B) | FCS (4B)|
+---------------+------------------+--------------+-----------+------------------+---------+
                                    /            \
        +--------------------------+              +--------------------------+
       /                                                                      \
      +----------------------------+-----------+------+------------------------+
      | Tag Protocol ID (TPID)     | Priority  | Flag | VLAN Identifier (VID)  |
      | 16 bits (0x8100)           | 3 bits    | 1 bit| 12 bits                |
      +----------------------------+-----------+------+------------------------+
```

### 802.1Q Tag Field Breakdown
1. **Tag Protocol Identifier (TPID)**: 16 bits (2 bytes). Set to `0x8100` to indicate an 802.1Q tagged frame.
2. **Priority Code Point (PCP)**: 3 bits. Defines Class of Service (CoS) for Layer 2 Quality of Service (QoS) prioritization (values 0–7).
3. **Drop Eligible Indicator (DEI) / CFI**: 1 bit. Indicates frames eligible to be dropped in the presence of congestion.
4. **VLAN Identifier (VID)**: 12 bits. Identifies the VLAN to which the frame belongs:
   - $2^{12} = 4096$ possible values (VLANs 0 to 4095).
   - Reserved values: `0` (priority tag only) and `4095` (reserved).
   - Normal range: `1 - 1005`.
   - Extended range: `1006 - 4094`.

*(Note: Adding the 4-byte tag modifies the frame contents, requiring the sending switch to recalculate the 4-byte FCS trailer).*

---

## 4.4 Inter-VLAN Routing Requirement (Layer 2 vs. Layer 3)
A Layer 2 switch enforces complete broadcast isolation: **A Layer 2 switch will never forward traffic between different VLANs**.
To route packets between VLANs, an external Layer 3 Router or Multilayer Switch is mandatory.

### Two-Physical-Interface Router Method
```
Subnet 10 (VLAN 10)                                          Subnet 20 (VLAN 20)
[ Host Dino ]                                                        [ Host Betty ]
      |                                                                    ^
      v                                                                    |
+-------------------------------------------------------------------------------+
| Switch SW1                                                                    |
|  [ Access Port: VLAN 10 ]                         [ Access Port: VLAN 20 ]   |
|            |                                                 ^                |
|            v                                                 |                |
|  [ Port Fa0/1 (VLAN 10) ]                         [ Port Fa0/2 (VLAN 20) ]    |
+------------|-------------------------------------------------|----------------+
             |                                                 |
             v                                                 |
         +-------+                                             |
         | F0/0  | (IP: 10.1.1.1)               (IP: 20.1.1.1) | F0/1            |
         +-----------------------------------------------------+
         | Router R1 (Routes Layer 3 IP Packet Internally)     |
         +-----------------------------------------------------+
```

---

## 4.5 Configuring VLANs and Access Ports

### Step 1: Create and Name VLANs
```cisco
SW1# configure terminal
SW1(config)# vlan 2
SW1(config-vlan)# name Freds-vlan
SW1(config-vlan)# exit
```

### Step 2: Assign Interfaces to VLANs
```cisco
SW1(config)# interface range fastethernet 0/13 - 14
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# switchport access vlan 2
SW1(config-if-range)# end
```

### Auto-Creation Shortcut
If an interface is assigned to an unconfigured VLAN, Cisco IOS automatically provisions the VLAN:
```cisco
SW1(config)# interface range fastethernet 0/15 - 16
SW1(config-if-range)# switchport access vlan 3
% Access VLAN does not exist. Creating vlan 3
```
*(The auto-created VLAN is assigned the default name `VLAN0003`).*

### Verification Commands
```cisco
SW1# show vlan brief

VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Fa0/1, Fa0/2, Fa0/3, Fa0/4,
                                                Fa0/5, Fa0/6, Fa0/7, Fa0/8,
                                                Fa0/9, Fa0/10, Fa0/11, Fa0/12,
                                                Fa0/17, Fa0/18, Fa0/19, Fa0/20,
                                                Fa0/21, Fa0/22, Fa0/23, Fa0/24
2    Freds-vlan                       active    Fa0/13, Fa0/14
3    VLAN0003                         active    Fa0/15, Fa0/16
1002 fddi-default                     act/unsup
1003 token-ring-default               act/unsup
1004 fddinet-default                  act/unsup
1005 trnet-default                    act/unsup

SW1# show vlan id 2
VLAN id: 2 Name: Freds-vlan
Status: active    Ports: Fa0/13, Fa0/14
```

---

## 4.6 Dynamic Trunking Protocol (DTP) & Administrative Modes
DTP is a proprietary Cisco protocol that negotiates trunking state and encapsulation between connected switch ports.

### `switchport mode` Options

| Administrative Mode Option | Functional Behavior |
|---|---|
| `switchport mode access` | Permanently disables trunking; interface operates strictly as a static access (non-trunk) port. |
| `switchport mode trunk` | Permanently enables trunking; port will trunk regardless of neighbor configuration. Initiates DTP frames. |
| `switchport mode dynamic desirable` | **Actively initiates** DTP negotiation. Converts link to a trunk if neighbor is set to `trunk`, `dynamic desirable`, or `dynamic auto`. |
| `switchport mode dynamic auto` | **Passively listens** for DTP negotiation. Will form a trunk only if neighbor actively initiates (`trunk` or `dynamic desirable`). Defaults to access if neighbor is also `dynamic auto`. |

---

## 4.7 Trunking Operational Negotiation Matrix

| SW1 Configured Mode | SW2: `access` | SW2: `dynamic auto` | SW2: `dynamic desirable` | SW2: `trunk` |
|---|---|---|---|---|
| **`access`** | **Access** | **Access** | **Access** | **DO NOT USE** *(Severe Mismatch)* |
| **`dynamic auto`** | **Access** | **Access** *(Default out-of-box)*| **Trunk** | **Trunk** |
| **`dynamic desirable`**| **Access** | **Trunk** | **Trunk** | **Trunk** |
| **`trunk`** | **DO NOT USE** *(Severe Mismatch)* | **Trunk** | **Trunk** | **Trunk** |

> **Critical Gotchas**:
> 1. Two switches connected with factory-default configurations (`dynamic auto` on both ends) will **remain in access mode** and will **never trunk** because neither side initiates negotiation.
> 2. Connecting a port configured as `access` to a port configured as `trunk` causes a severe misconfiguration: frames tagged by the trunking switch are dropped or misdirected by the access switch.

---

## 4.8 IP Telephony & Voice VLAN Integration

### Legacy Cabling vs. Integrated IP Phone Switch
- **Legacy Architecture**: Requires two independent UTP cables per workstation—one cable to an Ethernet data switch, one cable to a PBX telephone wall jack.
- **Modern IP Telephony**: A single UTP cable runs from the wiring closet switch to a Cisco IP Phone. The IP phone contains an internal **3-port Layer 2 switch**:
  - Port 1: Internal connection to the phone's voice DSP logic.
  - Port 2 (Upstream): Connects to the wiring closet switch port.
  - Port 3 (Downstream Access): Connects via patch cable to the user's PC.

```
+---------------+
| Wiring Closet |
| Switch (SW1)  |
+---------------+
        |
        | Single UTP Cable (Carries both Data & Voice VLANs)
        v
+------------------------------------+
| Cisco IP Phone (Integrated Switch) |
|   - Internal Phone Voice Core      |
+------------------------------------+
        |
        | Patch Cable (Untagged Data)
        v
+---------------+
| User PC       |
+---------------+
```

### Voice & Data VLAN Configuration
```cisco
SW1# configure terminal
SW1(config)# vlan 10
SW1(config-vlan)# name Data_VLAN
SW1(config)# vlan 11
SW1(config-vlan)# name Voice_VLAN

SW1(config)# interface range fastethernet 0/1 - 4
SW1(config-if-range)# switchport mode access
SW1(config-if-range)# switchport access vlan 10
SW1(config-if-range)# switchport voice vlan 11
SW1(config-if-range)# end
```

### Tagging Mechanics on Voice Ports
- **PC Data**: The PC transmits standard untagged frames. The IP phone passes them through unmodified. The switch classifies untagged frames into the **Data VLAN (VLAN 10)** (Native/Access).
- **IP Phone Voice**: The phone tags its own voice frames with an **802.1Q header** specifying **VLAN 11** and Class of Service (CoS) priority bits (`CoS = 5`) for QoS prioritization.

### Verification of Voice Port
```cisco
SW1# show interfaces fastethernet 0/4 switchport
Name: Fa0/4
Switchport: Enabled
Administrative Mode: static access
Operational Mode: static access
Administrative Trunking Encapsulation: dot1q
Operational Trunking Encapsulation: native
Negotiation of Trunking: Off
Access Mode VLAN: 10 (Data_VLAN)
Trunking Native Mode VLAN: 1 (default)
Voice VLAN: 11 (Voice_VLAN)
```

---

## 4.9 Administrative & Operational VLAN States (Active vs. Shutdown)

### VLAN Status Definitions in `show vlan brief`
- `active`: VLAN is provisioned and actively switching frames.
- `act/lshut` (Active / Locally Shut): VLAN exists in database but has been administratively disabled using the `shutdown` command.
- `act/unsup`: Default legacy VLANs (FDDI, Token Ring) unsupported on modern Ethernet switching hardware.

### Administratively Disabling and Enabling VLANs
```cisco
! Method 1: Sub-configuration mode
SW1(config)# vlan 20
SW1(config-vlan)# shutdown          ! Shuts down VLAN 20 (status becomes act/lshut)
SW1(config-vlan)# no shutdown       ! Re-enables VLAN 20

! Method 2: Global configuration mode (modern IOS)
SW1(config)# shutdown vlan 20
SW1(config)# no shutdown vlan 10
```

---

## 4.10 Trunking Verification & Operational Mismatch Troubleshooting

### Primary Verification Command
`show interfaces <interface> switchport` reveals the internal DTP and trunking parameters:
```cisco
SW1# show interfaces gigabit 0/1 switchport
Name: Gi0/1
Switchport: Enabled
Administrative Mode: dynamic desirable      <-- What was configured
Operational Mode: trunk                     <-- Actual running state
Administrative Trunking Encapsulation: dot1q
Operational Trunking Encapsulation: dot1q
Negotiation of Trunking: On                 <-- DTP enabled
Access Mode VLAN: 1 (default)
Trunking Native Mode VLAN: 1 (default)
```

### Checking Active Trunks
```cisco
SW1# show interfaces trunk

Port        Mode             Encapsulation  Status        Native vlan
Gi0/1       desirable        802.1q         trunking      1

Port        Vlans allowed on trunk
Gi0/1       1-4094

Port        Vlans allowed and active in management domain
Gi0/1       1,2,3,10,11

Port        Vlans in spanning tree forwarding state and not pruned
Gi0/1       1,2,3,10,11
```

### The `nonegotiate` Operational Mismatch Trap
When static trunking is combined with DTP suppression on one side:

```
[ Switch SW1 ]                                               [ Switch SW2 ]
Interface Gi0/1                                              Interface Gi0/2
Administrative Mode: trunk                                   Administrative Mode: dynamic desirable
Negotiation: OFF (switchport nonegotiate)                    Negotiation: ON
Operational Mode: TRUNK                                      Operational Mode: STATIC ACCESS (DISCARD!)
        |                                                            ^
        |==== 802.1Q Tagged Frame (VLAN 10) =========================|
        |                                                   Frame has 802.1Q Tag;
        v                                                   Port is Access -> DISCARD!
```

- **Configuration on SW1**:
  ```cisco
  SW1(config-if)# switchport mode trunk
  SW1(config-if)# switchport nonegotiate
  ```
  *(SW1 statically trunks and stops sending DTP frames).*
- **Configuration on SW2**:
  ```cisco
  SW2(config-if)# switchport mode dynamic desirable
  ```
  *(SW2 listens for DTP frames before trunking).*
- **Failure State**: Because SW1 does not send DTP packets, SW2 never receives trunk negotiation messages. SW2's operational state remains **static access**.
- **Symptom**: SW1 sends 802.1Q tagged frames. SW2 receives tagged frames on an access port, detects illegal 802.1Q encapsulation, and **discards the frames**. Inter-switch communication fails completely.

---

# 5. Cisco IOS Command Quick Reference

### System, Security, and Management Setup
```cisco
! Hostname and DNS
hostname <name>
no ip domain-lookup

! Passwords and Accounts
enable secret <password>
username <user> secret <password>

! Line Security & Ergonomics
line console 0
  password <pass>
  login local
  logging synchronous
  exec-timeout 0 0
  history size <n>

line vty 0 15
  login local
  transport input ssh
  logging synchronous
  exec-timeout 0 0

! SSH Generation
ip domain-name <domain.com>
crypto key generate rsa [modulus 1024]

! SVI and Default Gateway
interface vlan <vlan-id>
  ip address <ip-address> <subnet-mask>
  no shutdown
ip default-gateway <router-ip>
```

### VLAN & Trunking Setup
```cisco
! VLAN Creation and Administrative State
vlan <vlan-id>
  name <vlan-name>
  [shutdown | no shutdown]

! Access Port Assignment
interface <int-id>
  switchport mode access
  switchport access vlan <vlan-id>

! Voice VLAN Port Assignment
interface <int-id>
  switchport mode access
  switchport access vlan <data-vlan-id>
  switchport voice vlan <voice-vlan-id>

! Static Trunk Configuration
interface <int-id>
  switchport trunk encapsulation dot1q   ! (Required on older Catalyst hardware)
  switchport mode trunk
  switchport nonegotiate                 ! (Disables DTP generation)

! Dynamic Trunking Configuration
interface <int-id>
  switchport mode dynamic desirable      ! (Actively negotiates trunk)
  switchport mode dynamic auto           ! (Passively negotiates trunk)
```

### Verification & Inspection
```cisco
show running-config
show ip ssh
show ssh
show interfaces vlan <id>
show ip default-gateway
show dhcp lease
show history
show vlan brief
show vlan id <id>
show interfaces <int-id> switchport
show interfaces trunk
show interfaces <int-id> trunk
```

---

## Source, clean-room, and correction notes

This knowledge base is a paraphrase and reorganization of the Cisco CCNA
200-301 Official Cert Guide, Volume 1 (chapters 1, 2, 6, and 8), the CCNA2
Labs 1–6 decks, and the supplied chapter PDFs. It is the source for the
in-product CCNA Academy, not a reproduction of Cisco courseware.

Cisco, Packet Tracer, and CCNA are trademarks of Cisco Systems, Inc. wireX is
not affiliated with, endorsed by, or sponsored by Cisco. No Cisco logos,
artwork, screenshots, or slide text are included.

Known lecture-deck errors and ambiguities were corrected rather than copied:

- `channel-group 1 mode ac` is not a valid mode pairing; EtherChannel modes are
  taught as on/active or desirable/passive, with LACP or PAgP named explicitly.
- A `/27` provides 30 usable hosts, not 12.
- `192.168.1.128/26` starts at `.128`, not `.127`.
- "Blocked" is an STP state, not a port role; the role/state distinction is
  preserved.

See [`CCNA_ACADEMY.md`](CCNA_ACADEMY.md) for the learning design, file map,
verification, and the educational-efficacy evidence that is still open.
