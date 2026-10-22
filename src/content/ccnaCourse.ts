import { generatedCcnaChapters } from './ccnaCourse.generated'
import type { LessonId } from '@/simulator/trainingLabs'

export interface CcnaSection {
  id: string
  number: string
  title: string
  markdown: string
  chapterId: string
  chapterTitle: string
  chapterLabel: string
  chapterOrder: number
}

export interface CcnaChapter {
  id: string
  bookNumber: string
  title: string
  label: string
  kicker: string
  description: string
  accent: string
  order: number
  sections: CcnaSection[]
}

export interface CcnaSectionNote {
  why?: string
  trap?: string
  lab?: {
    lesson: LessonId
    label: string
    description: string
  }
}

export interface CcnaCheck {
  id: string
  sectionId: string
  prompt: string
  options: string[]
  answer: number
  explanation: string
}

export interface CcnaRescuePath {
  id: string
  title: string
  minutes: number
  description: string
  sectionIds: string[]
  lab?: {
    lesson: LessonId
    label: string
    description: string
  }
}

const chapterPresentation: Record<string, Omit<CcnaChapter, 'id' | 'bookNumber' | 'title' | 'order' | 'sections'>> = {
  ch1: {
    label: 'Chapter 1',
    kicker: 'Foundations',
    description: 'How hosts, layers, and packets actually move.',
    accent: '#0f766e',
  },
  ch2: {
    label: 'Chapter 2',
    kicker: 'Ethernet',
    description: 'Cables, frames, MAC addresses, and duplex.',
    accent: '#0369a1',
  },
  ch6: {
    label: 'Chapter 6',
    kicker: 'Management',
    description: 'CLI modes, passwords, SSH, SVIs, and gateways.',
    accent: '#b45309',
  },
  ch8: {
    label: 'Chapter 8',
    kicker: 'VLANs',
    description: 'Broadcast domains, trunks, 802.1Q, DTP, and voice.',
    accent: '#6d28d9',
  },
  ch9: {
    label: 'Chapter 9',
    kicker: 'Redundancy',
    description: 'STP and EtherChannel turn parallel links into a safe, resilient design.',
    accent: '#0e7490',
  },
  appendix: {
    label: 'Appendix',
    kicker: 'Reference',
    description: 'The commands you will type under pressure.',
    accent: '#475569',
  },
}

export const ccnaChapters: CcnaChapter[] = generatedCcnaChapters.map(chapter => ({
  ...chapter,
  ...chapterPresentation[chapter.id],
  order: chapter.courseOrder,
  sections: chapter.sections.map(section => ({
    ...section,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    chapterLabel: chapterPresentation[chapter.id].label,
    chapterOrder: chapter.courseOrder,
  })),
}))

export const ccnaSections: CcnaSection[] = ccnaChapters.flatMap(chapter => chapter.sections)
export const ccnaSectionById = new Map(ccnaSections.map(section => [section.id, section]))
export const ccnaChapterById = new Map(ccnaChapters.map(chapter => [chapter.id, chapter]))

export const ccnaSectionNotes: Record<string, CcnaSectionNote> = {
  '1.3': {
    why: 'The four-layer and five-layer TCP/IP models are both used in exams. Know which layer number belongs to which model before you answer a “which layer?” question.',
    trap: 'OSI has seven layers. The original TCP/IP model has four. The updated TCP/IP model has five. Do not mix the numbering.',
  },
  '1.8': {
    why: 'Encapsulation is the mental movie behind every ping, web request, and packet capture in the simulator.',
    trap: 'Segment = Layer 4. Packet = Layer 3. Frame = Layer 2. Bits = Layer 1. The names are not interchangeable.',
    lab: {
      lesson: 'tcpip',
      label: 'Encapsulation and routing lab',
      description: 'Follow a packet from a host through a router and inspect the tables that make it move.',
    },
  },
  '1.11': {
    why: 'Most “the ping failed” mysteries are really a next-hop, ARP, or default-gateway problem. This section gives you the hop-by-hop model to diagnose them.',
    trap: 'A host ARPs for the next hop, not for a remote destination. The destination MAC in the frame is the gateway, while the destination IP stays the remote host.',
    lab: {
      lesson: 'tcpip',
      label: 'Hop-by-hop routing lab',
      description: 'Build a routed path and watch the host, switch, and router tables change.',
    },
  },
  '2.2': {
    why: 'Media limits decide whether a link is legal before you ever configure an IP address.',
    trap: 'Copper UTP is 100 m. Fiber distances depend on the optic and fiber type. “Ethernet” alone does not tell you the distance.',
  },
  '2.4': {
    why: 'Straight-through vs. crossover is a classic exam question and a real cabling decision.',
    trap: 'Straight-through connects different categories (PC to switch). Crossover connects the same category (switch to switch, PC to PC). Auto-MDIX can hide a wrong cable in a lab, but it does not change the rule.',
  },
  '2.9': {
    why: 'Every frame you inspect in the simulator has the same fields. Learn them once and packet analysis becomes readable.',
    trap: 'The FCS is a trailer, not a header. EtherType identifies the payload protocol; it is not part of the IP header.',
    lab: {
      lesson: 'ethernet',
      label: 'Ethernet frame and MAC lab',
      description: 'Generate traffic and inspect the MAC table and frame path.',
    },
  },
  '2.10': {
    why: 'MAC addresses are the Layer 2 delivery labels. Switches make forwarding decisions from them.',
    lab: {
      lesson: 'ethernet',
      label: 'MAC learning lab',
      description: 'Watch the switch learn source MAC addresses and flood unknown destinations.',
    },
  },
  '2.12': {
    why: 'The difference between a hub and a switch explains collisions, duplex, and why modern LANs are full-duplex.',
    trap: 'A switch floods unknown unicast frames; it does not broadcast them forever. A hub repeats every bit out every other port.',
    lab: {
      lesson: 'ethernet',
      label: 'Switching and duplex lab',
      description: 'Compare shared and dedicated links while traffic is running.',
    },
  },
  '3.1': {
    why: 'You cannot configure what you cannot navigate. The prompt tells you which mode you are in and what the device will accept.',
    trap: 'User EXEC is `>`, privileged EXEC is `#`, global configuration is `(config)#`, and interface configuration is `(config-if)#`.',
    lab: {
      lesson: 'campus',
      label: 'Switch CLI and SVI lab',
      description: 'Move between CLI modes and configure a management SVI on a real switch model.',
    },
  },
  '3.2': {
    why: 'Weak management passwords are one of the easiest real-world findings to fix.',
    trap: '`enable secret` stores a hash and takes precedence over `enable password`. `service password-encryption` only weakly scrambles line passwords; it is not a substitute for a secret.',
  },
  '3.5': {
    why: 'SSH is the default remote-management answer. The exam expects the full prerequisite chain, not just one command.',
    trap: 'SSH needs a hostname, a domain name, RSA keys, a local user, and `transport input ssh` on the VTY lines. A missing domain name is a common failure.',
  },
  '3.6': {
    why: 'A Layer 2 switch needs a logical management address. The SVI is that address.',
    trap: 'An SVI is for in-band management. It does not turn a Layer 2 switch into a router or route between VLANs.',
    lab: {
      lesson: 'campus',
      label: 'SVI and trunk lab',
      description: 'Configure VLANs, trunks, and management SVIs, then verify reachability.',
    },
  },
  '3.7': {
    why: 'A management address without a gateway only works from the local subnet.',
    trap: '`ip default-gateway` is for the switch’s own management traffic. It is not a routing table and does not forward user traffic.',
    lab: {
      lesson: 'campus',
      label: 'Management path lab',
      description: 'Trace management reachability across VLANs and trunks.',
    },
  },
  '3.10': {
    why: 'A few line settings remove the most common lab annoyances: DNS hangs, console timeouts, and log messages breaking your typing.',
    trap: '`no ip domain-lookup` prevents a mistyped command from being treated as a hostname. `logging synchronous` keeps log output from splitting your command line.',
    lab: {
      lesson: 'campus',
      label: 'CLI productivity lab',
      description: 'Practice the commands on a live switch CLI.',
    },
  },
  '4.1': {
    why: 'VLANs are the foundation of the whole chapter. If you can explain a broadcast domain, the rest of the configuration makes sense.',
    trap: 'A VLAN is a Layer 2 broadcast domain. It is not automatically an IP subnet; mapping VLANs to subnets is a design choice.',
    lab: {
      lesson: 'vlans',
      label: 'VLAN isolation lab',
      description: 'Put two hosts in separate VLANs and prove that Layer 2 isolation works.',
    },
  },
  '4.2': {
    why: 'Trunks are how VLANs survive between switches without one cable per VLAN.',
    lab: {
      lesson: 'vlans',
      label: 'Trunking lab',
      description: 'Carry multiple VLANs over one inter-switch link.',
    },
  },
  '4.3': {
    why: 'The 802.1Q header is only four bytes, but every trunking troubleshooting question depends on it.',
    trap: 'The tag sits between the source MAC and the EtherType. The VID is 12 bits; the tag is 4 bytes. The FCS is recalculated after tagging.',
    lab: {
      lesson: 'vlans',
      label: '802.1Q trunk lab',
      description: 'Configure a trunk and verify which VLANs are allowed and active.',
    },
  },
  '4.4': {
    why: 'This is the line between switching and routing. A Layer 2 switch will not move a packet between VLANs for you.',
    trap: 'Inter-VLAN routing needs a Layer 3 device: a router with subinterfaces or a multilayer switch with SVIs. A Layer 2 switch alone cannot do it.',
  },
  '4.5': {
    why: 'This is the configuration you will repeat in almost every switching lab.',
    trap: '`switchport mode access` and `switchport access vlan 10` do different jobs. One sets the mode; the other assigns the VLAN.',
    lab: {
      lesson: 'vlans',
      label: 'VLAN and access-port lab',
      description: 'Create VLANs, assign access ports, and verify the result with `show vlan brief`.',
    },
  },
  '4.6': {
    why: 'DTP decides whether a link becomes a trunk. The default mode is a favorite exam trap.',
    trap: '`dynamic auto` waits. Two auto ports stay access. `dynamic desirable` initiates. `trunk` forces trunking and still sends DTP unless `nonegotiate` is set.',
    lab: {
      lesson: 'vlans',
      label: 'DTP and trunk negotiation lab',
      description: 'Change administrative modes and observe the operational result.',
    },
  },
  '4.7': {
    why: 'The negotiation matrix is the fastest way to predict whether a link will trunk before you cable it.',
    trap: 'Access ↔ trunk is a severe mismatch. Tagged frames arrive at an access port and are dropped.',
    lab: {
      lesson: 'vlans',
      label: 'Trunk negotiation lab',
      description: 'Test mode combinations and inspect the operational state.',
    },
  },
  '4.8': {
    why: 'A voice VLAN is a real design pattern, not a separate protocol. The phone’s internal switch is the key.',
    trap: 'The PC sends untagged data. The phone tags voice with 802.1Q and CoS. The switch port uses the access VLAN for data and the voice VLAN for the phone.',
    lab: {
      lesson: 'vlans',
      label: 'VLAN and trunk mechanics lab',
      description: 'Practice the access/trunk mechanics that a voice port builds on.',
    },
  },
  '4.10': {
    why: 'Verification is a scored skill. You need to read `show interfaces trunk` and `show interfaces switchport` without guessing.',
    trap: '`nonegotiate` on one side and `dynamic desirable` on the other leaves one side trunking and the other in access. Tagged frames are discarded.',
    lab: {
      lesson: 'vlans',
      label: 'Trunk verification lab',
      description: 'Break a trunk, inspect the mismatch, and repair it.',
    },
  },
  '9.1': {
    why: 'A redundant cable is only useful if the switch can prevent a Layer 2 loop. This is the reason STP exists.',
    trap: 'A “blocked” port is in a blocking/discarding state; its role may be alternate or backup. Blocked is not a role.',
  },
  '9.2': {
    why: 'Root election explains why one switch forwards and another stands by. You need the bridge ID and path-cost rules to predict the result.',
    trap: 'Priority is compared before the MAC address. A lower priority wins even if the other switch has a lower MAC.',
    lab: {
      lesson: 'stp',
      label: 'STP root election lab',
      description: 'Make Distribution-A the VLAN 10 root and inspect the alternate path.',
    },
  },
  '9.3': {
    why: 'This is the exact configuration pattern used in the STP lab and the practical exam.',
    trap: '`root primary` does not configure ports directly. It lowers the bridge priority for one VLAN so the election produces the root you want.',
    lab: {
      lesson: 'stp',
      label: 'PVST+ root and verification lab',
      description: 'Configure primary and secondary roots, then read the live tree.',
    },
  },
  '9.4': {
    why: 'EtherChannel is the difference between a blocked backup link and usable aggregate bandwidth.',
    trap: '`passive` + `passive` never forms a bundle, and `channel-group 1 mode ac` is not a valid mode. Use `active` or `passive` for LACP.',
  },
  '9.5': {
    why: 'This is the complete two-switch LACP configuration, including the underlay VLAN and trunk settings that must match.',
    trap: 'Configuring only one switch is the most common failure. Both ends need compatible members before the bundle forms.',
    lab: {
      lesson: 'channel',
      label: 'LACP bundle lab',
      description: 'Configure both switches, verify the Port-channel, and test traffic.',
    },
  },
  '9.6': {
    why: 'This lab combines LACP, VLANs, trunks, and per-VLAN roots in one small design.',
    trap: 'A Layer 2 EtherChannel does not route between VLANs. Add a Layer 3 device if the departments must communicate.',
    lab: {
      lesson: 'channel',
      label: 'Integrated redundancy lab',
      description: 'Build the LACP core and steer each VLAN to its intended root.',
    },
  },
}

export const ccnaChecks: CcnaCheck[] = [
  {
    id: 'ch1-ap',
    sectionId: '1.1',
    prompt: 'Which device connects wireless clients to the wired LAN?',
    options: ['Access point', 'Router', 'Layer 2 switch', 'Hub'],
    answer: 0,
    explanation: 'An access point bridges 802.11 wireless clients onto the wired Ethernet LAN. A switch forwards Ethernet frames; a router moves packets between IP networks.',
  },
  {
    id: 'ch1-layer3',
    sectionId: '1.3',
    prompt: 'Which layer of the updated TCP/IP model maps to OSI Layer 3?',
    options: ['Application', 'Transport', 'Network', 'Data Link'],
    answer: 2,
    explanation: 'The updated TCP/IP model calls OSI Layer 3 the Network layer (also called the Internet layer in the original four-layer model).',
  },
  {
    id: 'ch1-presentation',
    sectionId: '1.5',
    prompt: 'Which OSI layer handles encryption, compression, and data-format translation?',
    options: ['Session', 'Presentation', 'Application', 'Transport'],
    answer: 1,
    explanation: 'The Presentation layer negotiates data representation: ASCII vs. EBCDIC, compression, and encryption.',
  },
  {
    id: 'ch1-pdu',
    sectionId: '1.8',
    prompt: 'What is the Layer 2 protocol data unit (PDU) called?',
    options: ['Segment', 'Packet', 'Frame', 'Bit'],
    answer: 2,
    explanation: 'Layer 4 creates a segment, Layer 3 creates a packet, and Layer 2 creates a frame. Layer 1 transmits bits.',
  },
  {
    id: 'ch1-encapsulation',
    sectionId: '1.8',
    prompt: 'Which sequence shows the encapsulation order from application data to the wire?',
    options: [
      'Data → segment → packet → frame → bits',
      'Data → packet → segment → frame → bits',
      'Frame → packet → segment → data → bits',
      'Segment → data → frame → packet → bits',
    ],
    answer: 0,
    explanation: 'Each layer adds its header (and the data link layer adds a trailer) before the physical layer encodes the frame as bits.',
  },
  {
    id: 'ch1-tcp',
    sectionId: '1.10',
    prompt: 'What does TCP use to detect a missing segment?',
    options: ['Sequence numbers and acknowledgments', 'MAC addresses', 'VLAN tags', 'EtherType values'],
    answer: 0,
    explanation: 'TCP receivers notice a gap in sequence numbers and acknowledge the next expected byte, prompting retransmission.',
  },
  {
    id: 'ch1-arp',
    sectionId: '1.11',
    prompt: 'A host sends a packet to a remote subnet. Which MAC address goes in the Ethernet frame?',
    options: ['The remote host’s MAC address', 'The default gateway’s MAC address', 'The switch’s MAC address', 'The broadcast MAC address'],
    answer: 1,
    explanation: 'The host resolves the next hop (its default gateway) with ARP. The destination IP remains the remote host, but the frame is addressed to the gateway.',
  },
  {
    id: 'ch2-distance',
    sectionId: '2.2',
    prompt: 'What is the maximum UTP cable distance for 1000BASE-T?',
    options: ['100 meters', '500 meters', '5 kilometers', '10 kilometers'],
    answer: 0,
    explanation: '1000BASE-T uses UTP copper and is limited to 100 meters, the same general copper limit as 10BASE-T and 100BASE-TX.',
  },
  {
    id: 'ch2-straight',
    sectionId: '2.4',
    prompt: 'A straight-through cable connects which two device categories?',
    options: ['Category A to Category B', 'Category A to Category A', 'Category B to Category B', 'Any two devices, regardless of category'],
    answer: 0,
    explanation: 'Straight-through cables connect different categories, such as a PC (A) to a switch (B). Crossover cables connect the same category.',
  },
  {
    id: 'ch2-pins',
    sectionId: '2.4',
    prompt: 'Which pins does 100BASE-TX use on an MDI interface?',
    options: ['1, 2, 3, and 6', '1, 2, 4, and 5', '3, 6, 7, and 8', 'All eight pins'],
    answer: 0,
    explanation: '100BASE-TX uses two pairs: pins 1–2 and 3–6. On an MDI port, 1 and 2 transmit while 3 and 6 receive; a crossover cable swaps the pairs. Pins 4, 5, 7, and 8 are unused.',
  },
  {
    id: 'ch2-pairs',
    sectionId: '2.5',
    prompt: 'How many wire pairs does 1000BASE-T use?',
    options: ['Two', 'Four', 'Six', 'Eight'],
    answer: 1,
    explanation: '1000BASE-T uses all four pairs and transmits and receives simultaneously in both directions.',
  },
  {
    id: 'ch2-fiber',
    sectionId: '2.6',
    prompt: 'Which fiber type is best for long campus or metro distances?',
    options: ['Multimode fiber', 'Single-mode fiber', 'Cat6 UTP', 'Coaxial cable'],
    answer: 1,
    explanation: 'Single-mode fiber has a very narrow core and almost no modal dispersion, so it supports much longer distances than multimode.',
  },
  {
    id: 'ch2-fcs',
    sectionId: '2.9',
    prompt: 'What is the purpose of the FCS in an Ethernet frame?',
    options: ['Error detection', 'Logical addressing', 'VLAN tagging', 'Flow control'],
    answer: 0,
    explanation: 'The Frame Check Sequence is a trailer used to detect bit errors in the received frame.',
  },
  {
    id: 'ch2-broadcast',
    sectionId: '2.10',
    prompt: 'Which MAC address sends a frame to every device on the LAN?',
    options: ['00:00:00:00:00:00', 'FF:FF:FF:FF:FF:FF', '01:00:5E:00:00:01', 'The switch’s MAC address'],
    answer: 1,
    explanation: 'The all-ones broadcast MAC address is FF:FF:FF:FF:FF:FF. A switch floods it out every other port in the VLAN.',
  },
  {
    id: 'ch2-unknown',
    sectionId: '2.12',
    prompt: 'What does a switch do with a frame whose destination MAC is not in its table?',
    options: ['Drops it', 'Floods it out all ports except the ingress port', 'Sends it to the default gateway', 'Rewrites the destination MAC'],
    answer: 1,
    explanation: 'Unknown unicast frames are flooded within the VLAN. The switch learns the source MAC and forwards later frames more precisely.',
  },
  {
    id: 'ch6-mode',
    sectionId: '3.1',
    prompt: 'Which prompt indicates global configuration mode?',
    options: ['Switch>', 'Switch#', 'Switch(config)#', 'Switch(config-if)#'],
    answer: 2,
    explanation: '`Switch(config)#` is global configuration mode. `>` is user EXEC, `#` is privileged EXEC, and `(config-if)#` is interface configuration.',
  },
  {
    id: 'ch6-secret',
    sectionId: '3.2',
    prompt: 'Which command stores a hashed privileged EXEC password?',
    options: ['enable password', 'enable secret', 'service password-encryption', 'username admin secret'],
    answer: 1,
    explanation: '`enable secret` stores a hash and takes precedence over `enable password`. `service password-encryption` only weakly scrambles line passwords.',
  },
  {
    id: 'ch6-login-local',
    sectionId: '3.3',
    prompt: 'What does `login local` tell a line to use?',
    options: ['The local username database', 'A RADIUS server', 'No authentication', 'Only the enable secret'],
    answer: 0,
    explanation: '`login local` checks the username/password pairs configured with the `username` command on the device.',
  },
  {
    id: 'ch6-ssh',
    sectionId: '3.5',
    prompt: 'Which item is required before generating an RSA key for SSH?',
    options: ['A domain name', 'A VLAN', 'A default gateway', 'A DHCP pool'],
    answer: 0,
    explanation: 'The router or switch needs a hostname and a domain name so it can form the key label (for example, SW1.example.com).',
  },
  {
    id: 'ch6-svi',
    sectionId: '3.6',
    prompt: 'What is an SVI used for on a Layer 2 switch?',
    options: ['Routing between VLANs', 'In-band management', 'Connecting a WAN', 'Preventing spanning-tree loops'],
    answer: 1,
    explanation: 'An SVI gives the switch an IP address for management. It does not make the switch a router.',
  },
  {
    id: 'ch6-gateway',
    sectionId: '3.7',
    prompt: 'Why does a Layer 2 switch need `ip default-gateway`?',
    options: ['To route packets between VLANs', 'To reach management hosts on another subnet', 'To become the root bridge', 'To assign IP addresses to PCs'],
    answer: 1,
    explanation: 'The default gateway is for the switch’s own management traffic when the management station is off-subnet.',
  },
  {
    id: 'ch6-dns',
    sectionId: '3.10',
    prompt: 'Which command prevents a mistyped command from triggering a DNS lookup?',
    options: ['no ip domain-lookup', 'no ip routing', 'ip domain-name', 'logging synchronous'],
    answer: 0,
    explanation: '`no ip domain-lookup` stops the device from treating an unrecognized command as a hostname and waiting for DNS.',
  },
  {
    id: 'ch6-history',
    sectionId: '3.9',
    prompt: 'Which command changes the history buffer for the current session only?',
    options: ['history size', 'terminal history size', 'show history', 'logging synchronous'],
    answer: 1,
    explanation: '`terminal history size` changes the current session. `history size` under line configuration sets the default for users of that line.',
  },
  {
    id: 'ch8-vlan',
    sectionId: '4.1',
    prompt: 'What is a VLAN?',
    options: ['A physical cable', 'A logical broadcast domain', 'A routing protocol', 'A type of IP address'],
    answer: 1,
    explanation: 'A VLAN partitions a switch into separate Layer 2 broadcast domains. It is not automatically an IP subnet.',
  },
  {
    id: 'ch8-tag-size',
    sectionId: '4.3',
    prompt: 'How large is the 802.1Q tag?',
    options: ['2 bytes', '4 bytes', '6 bytes', '8 bytes'],
    answer: 1,
    explanation: 'The 802.1Q tag is 4 bytes: 2 bytes of TPID, 2 bytes of priority/DEI/VID fields.',
  },
  {
    id: 'ch8-tag-place',
    sectionId: '4.3',
    prompt: 'Where is the 802.1Q tag inserted?',
    options: ['Before the destination MAC', 'Between the source MAC and the EtherType', 'After the FCS', 'Inside the IP header'],
    answer: 1,
    explanation: 'The tag sits between the source MAC address and the original EtherType. The FCS is recalculated after tagging.',
  },
  {
    id: 'ch8-routing',
    sectionId: '4.4',
    prompt: 'What is required to route traffic between two VLANs?',
    options: ['A Layer 2 switch', 'A Layer 3 device', 'A hub', 'A straight-through cable'],
    answer: 1,
    explanation: 'A Layer 2 switch isolates VLANs. A router or multilayer switch must route the IP packets between them.',
  },
  {
    id: 'ch8-access',
    sectionId: '4.5',
    prompt: 'Which command assigns an access port to VLAN 10?',
    options: ['switchport access vlan 10', 'switchport trunk allowed vlan 10', 'vlan 10', 'interface vlan 10'],
    answer: 0,
    explanation: '`switchport access vlan 10` assigns the port’s access VLAN. `interface vlan 10` creates an SVI, not an access-port assignment.',
  },
  {
    id: 'ch8-dtp',
    sectionId: '4.6',
    prompt: 'Two switches use the default `dynamic auto` mode on both ends. What happens?',
    options: ['They form a trunk', 'They stay in access mode', 'They form an EtherChannel', 'They become root bridges'],
    answer: 1,
    explanation: '`dynamic auto` waits for the other side to initiate. Two auto ports never initiate, so the link stays access.',
  },
  {
    id: 'ch8-mismatch',
    sectionId: '4.7',
    prompt: 'A port configured as access connects to a port configured as trunk. What is the result?',
    options: ['A working trunk', 'A severe mismatch; tagged frames are dropped', 'Automatic negotiation to access', 'Automatic negotiation to trunk'],
    answer: 1,
    explanation: 'The trunk side sends tagged frames, but the access side does not interpret them as trunk traffic. Tagged VLANs fail; only untagged traffic on the trunk’s native VLAN may still pass.',
  },
  {
    id: 'ch8-voice',
    sectionId: '4.8',
    prompt: 'On a voice VLAN port, how does the IP phone send voice traffic?',
    options: ['Untagged', 'Tagged with 802.1Q and CoS priority', 'Encrypted with IPsec', 'As a broadcast'],
    answer: 1,
    explanation: 'The phone tags its voice frames with the voice VLAN and a CoS value (commonly 5). The PC’s data remains untagged and uses the access VLAN.',
  },
  {
    id: 'ch8-nonegotiate',
    sectionId: '4.10',
    prompt: 'One side is `trunk` + `nonegotiate`; the other is `dynamic desirable`. What happens?',
    options: ['Both sides trunk', 'Both sides stay access', 'One side trunks and the other stays access', 'An EtherChannel forms'],
    answer: 2,
    explanation: 'The `nonegotiate` side does not send DTP. The `dynamic desirable` side never receives a negotiation frame, so it stays access while the other side trunks.',
  },
  {
    id: 'ch8-lshut',
    sectionId: '4.9',
    prompt: 'What does `act/lshut` mean in `show vlan brief`?',
    options: ['Active and forwarding', 'Administratively shut down', 'Unsupported legacy VLAN', 'Trunking and active'],
    answer: 1,
    explanation: '`act/lshut` means the VLAN exists but has been administratively shut down locally.',
  },
  {
    id: 'ch9-loop',
    sectionId: '9.1',
    prompt: 'Why does STP place a redundant port in a blocking/discarding state?',
    options: ['Ethernet has no TTL, so an active loop would keep duplicating frames and broadcasts', 'The port is reserved for inter-VLAN routing', 'The port must stay down until a router is added', 'The port is administratively disabled'],
    answer: 0,
    explanation: 'A Layer 2 loop has no TTL to stop a frame. STP breaks the loop by keeping one path non-forwarding while retaining it as a standby.',
  },
  {
    id: 'ch9-root',
    sectionId: '9.2',
    prompt: 'Two switches have the same bridge priority. Which value decides the root election?',
    options: ['The lowest bridge MAC address', 'The highest port number', 'The highest management IP address', 'The shortest hostname'],
    answer: 0,
    explanation: 'The bridge ID is priority plus MAC. When priorities tie, the lower MAC address produces the lower bridge ID and wins the election.',
  },
  {
    id: 'ch9-primary',
    sectionId: '9.3',
    prompt: 'What does `spanning-tree vlan 10 root primary` do on Distribution-A?',
    options: ['Lowers A’s VLAN 10 bridge priority so A wins the root election', 'Makes every A port a root port', 'Blocks every redundant path on A', 'Creates VLAN 10 on A'],
    answer: 0,
    explanation: 'The command sets a low per-VLAN priority. STP then elects A as root if no other bridge has an even lower bridge ID. It does not assign port roles directly.',
  },
  {
    id: 'ch9-lacp',
    sectionId: '9.4',
    prompt: 'Which LACP mode pairing can form an EtherChannel?',
    options: ['active / active', 'passive / passive', 'active / on', 'auto / auto'],
    answer: 0,
    explanation: 'Active/active forms, and active/passive also forms. Passive/passive never initiates, active/on mixes LACP with static mode, and auto is PAgP.',
  },
  {
    id: 'ch9-members',
    sectionId: '9.5',
    prompt: 'Which condition prevents two physical ports from joining the same LACP Port-channel?',
    options: ['One member is an access port and the other is a trunk', 'The switches use different local channel-group numbers', 'The members connect two different switches', 'The bundle contains two physical links'],
    answer: 0,
    explanation: 'Member interfaces must agree on mode, VLAN, native VLAN, allowed list, and speed/duplex. Local channel-group numbers can differ between switches.',
  },
  {
    id: 'ch9-summary',
    sectionId: '9.6',
    prompt: 'What does a successful `show etherchannel summary` prove?',
    options: ['The members negotiated into one operational Port-channel treated as a single logical link', 'STP is disabled on both switches', 'Every VLAN is routed between the switches', 'The PC default gateways are correct'],
    answer: 0,
    explanation: 'The summary reports bundle state and member flags. It proves the Port-channel is operational; it does not prove routing or end-to-end host configuration.',
  },
]

export const ccnaRescuePaths: CcnaRescuePath[] = [
  {
    id: 'vlans-45',
    title: 'VLANs before lab',
    minutes: 45,
    description: 'The highest-yield VLAN path: broadcast domains, trunks, 802.1Q, DTP, and verification.',
    sectionIds: ['4.1', '4.2', '4.3', '4.5', '4.6', '4.7', '4.10'],
    lab: {
      lesson: 'vlans',
      label: 'VLAN and trunk lab',
      description: 'Configure VLANs, access ports, and a trunk, then prove the link works.',
    },
  },
  {
    id: 'switch-30',
    title: 'Switch management before lab',
    minutes: 30,
    description: 'The fastest switch-management path: CLI modes, passwords, SSH, SVI, and default gateway.',
    sectionIds: ['3.1', '3.2', '3.5', '3.6', '3.7', '3.10'],
    lab: {
      lesson: 'campus',
      label: 'Switch CLI and SVI lab',
      description: 'Practice CLI navigation, VLANs, trunks, and management addressing.',
    },
  },
  {
    id: 'exam-120',
    title: 'Two-hour exam sprint',
    minutes: 120,
    description: 'A broad pass over the four chapters for the last two hours before the exam.',
    sectionIds: ['1.3', '1.8', '1.11', '2.2', '2.9', '2.10', '2.12', '3.1', '3.5', '3.6', '3.7', '4.1', '4.3', '4.6', '4.7', '4.10'],
    lab: {
      lesson: 'vlans',
      label: 'VLAN and trunk lab',
      description: 'Finish the sprint by configuring and verifying a real VLAN topology.',
    },
  },
]

export const ccnaLessonSection: Partial<Record<LessonId, string>> = {
  tcpip: '1.8',
  ethernet: '2.9',
  vlans: '4.5',
  campus: '3.6',
  stp: '9.3',
  channel: '9.5',
}

export const ccnaStats = {
  chapters: ccnaChapters.filter(chapter => chapter.id !== 'appendix').length,
  sections: ccnaSections.filter(section => section.chapterId !== 'appendix').length,
  checks: ccnaChecks.length,
  rescuePaths: ccnaRescuePaths.length,
}

const markdownPlainText = (value: string) => value
  .replace(/```[\s\S]*?(?:```|$)/g, ' ')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_>#|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

export function getSection(sectionId: string): CcnaSection | undefined {
  return ccnaSectionById.get(sectionId)
}

export function getChapter(chapterId: string): CcnaChapter | undefined {
  return ccnaChapterById.get(chapterId)
}

export function getSectionChecks(sectionId: string): CcnaCheck[] {
  return ccnaChecks.filter(check => check.sectionId === sectionId)
}

export function getSectionLab(sectionId: string): CcnaSectionNote['lab'] | undefined {
  return ccnaSectionNotes[sectionId]?.lab
}

export function getSectionSummary(sectionId: string): string {
  const section = getSection(sectionId)
  if (!section) return ''
  const note = ccnaSectionNotes[sectionId]?.why
  if (note) return note
  const withoutCode = section.markdown.replace(/```[\s\S]*?(?:```|$)/g, '')
  const paragraphs = withoutCode.split(/\n{2,}/)
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('>') || trimmed.startsWith('- ')) continue
    const text = markdownPlainText(trimmed)
    if (text.length >= 40) return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text
  }
  const fallback = markdownPlainText(withoutCode)
  if (fallback.length >= 20) return fallback.slice(0, 220)
  return `${section.title}: a command reference you can copy into the simulator CLI.`
}

export function getSectionQuickHits(sectionId: string): string[] {
  const section = getSection(sectionId)
  if (!section) return []
  const hits: string[] = []
  let inCode = false
  for (const line of section.markdown.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCode = !inCode
      continue
    }
    if (inCode) continue
    const match = line.match(/^\s*[-*]\s+(.+)$/)
    if (!match) continue
    const text = markdownPlainText(match[1])
    if (text.length < 12) continue
    hits.push(text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text)
    if (hits.length === 3) break
  }
  return hits
}

export function getSectionCommands(sectionId: string): string[] {
  const section = getSection(sectionId)
  if (!section) return []
  const commands: string[] = []
  const pattern = /^[ \t]*```cisco[ \t]*\n([\s\S]*?)^[ \t]*```/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(section.markdown))) {
    commands.push(match[1].trim())
  }
  return commands
}

export function getReadingMinutes(sectionId: string): number {
  const section = getSection(sectionId)
  if (!section) return 1
  const words = markdownPlainText(section.markdown).split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.min(20, Math.ceil(words / 220)))
}

export function getAdjacentSections(sectionId: string): { previous?: CcnaSection; next?: CcnaSection } {
  const index = ccnaSections.findIndex(section => section.id === sectionId)
  if (index < 0) return {}
  return {
    previous: index > 0 ? ccnaSections[index - 1] : undefined,
    next: index < ccnaSections.length - 1 ? ccnaSections[index + 1] : undefined,
  }
}

export function searchCcnaSections(query: string): CcnaSection[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  return ccnaSections.filter(section => {
    if (section.title.toLowerCase().includes(normalized)) return true
    if (section.chapterTitle.toLowerCase().includes(normalized)) return true
    return section.markdown.toLowerCase().includes(normalized)
  }).slice(0, 24)
}

export function getRescuePath(pathId: string): CcnaRescuePath | undefined {
  return ccnaRescuePaths.find(path => path.id === pathId)
}

export function getRescueSections(path: CcnaRescuePath): CcnaSection[] {
  return path.sectionIds.map(id => getSection(id)).filter((section): section is CcnaSection => Boolean(section))
}

export function getChapterChecks(chapterId: string): CcnaCheck[] {
  const sectionIds = new Set((getChapter(chapterId)?.sections ?? []).map(section => section.id))
  return ccnaChecks.filter(check => sectionIds.has(check.sectionId))
}
