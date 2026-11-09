export interface CuriousStory {
  id: string
  title: string
  topic: string
  story: string
  inRealLife: [string, string][]
  whereNotPerfect: string
  simpleTruth: string
  cliCommands?: string[]
}

export interface ExamQuestion {
  id: string
  text: string
  type: 'single-choice' | 'true-false' | 'subnet-calc'
  options?: string[]
  answer: number | string
  explanation: string
  curiousAnalogyRef?: string
  highYieldTip?: string
}

export interface SubnetCalcProblem {
  id: string
  networkAddress: string
  cidr: number
  subnetMask: string
  firstHost: string
  lastHost: string
  broadcast: string
  usableHosts: number
  explanation: string
}

export interface PastExamPaper {
  id: string
  title: string
  semester: string
  academicYear: string
  courseCode: string
  instructor: string
  timeLimit: string
  description: string
  pktFile?: string
  labKey: string
  questions: ExamQuestion[]
  subnetProblems?: SubnetCalcProblem[]
  practicalTasks: {
    title: string
    description: string
    cliCommands: string
    verification: string
  }[]
}

export const curiousKidStories: CuriousStory[] = [
  {
    id: 'why-vlans',
    title: 'Why Do We Need VLANs?',
    topic: 'Virtual LANs (802.1Q)',
    story:
      'Fifty kids are shouting in one big room. When Leo drops a red crayon, he yells, "Who lost a crayon?" All fifty kids stop and cover their ears. It is way too noisy. So the teacher puts up two paper walls. Now there are three small rooms: Green, Blue, and Yellow. When Leo speaks, only kids in the Green room hear him. Everyone can finally draw in peace!',
    inRealLife: [
      ['One big noisy room', 'A single large broadcast domain (slow & congested)'],
      ['Paper walls dividing rooms', 'VLANs separating traffic on the same physical switch'],
      ['Only green-room kids hearing', 'Broadcast traffic stays isolated inside its own VLAN'],
    ],
    whereNotPerfect:
      'Paper walls can be pushed over, but switch VLANs provide strict hardware isolation that traffic cannot cross without a router.',
    simpleTruth:
      'A VLAN divides one physical switch into separate virtual networks so noisy broadcasts do not slow down everyone.',
    cliCommands: [
      'vlan 10',
      'name Students',
      'interface fastEthernet 0/1',
      'switchport mode access',
      'switchport access vlan 10',
    ],
  },
  {
    id: 'why-trunks',
    title: 'Why Do We Need Trunk Links?',
    topic: 'Trunking & 802.1Q Tagging',
    story:
      'Two toy castles sit across a sandbox. The Green knights and Blue knights live in both castles. Instead of building ten separate bridges across the sand, the king builds one big stone tunnel. Whenever a knight runs into the tunnel, the gatekeeper sticks a green or blue badge on their helmet. At the other end, the guard reads the badge and sends them straight to their own room!',
    inRealLife: [
      ['One big stone tunnel', 'A single trunk cable connecting two switches'],
      ['Color badge on the helmet', 'The 4-byte 802.1Q VLAN tag added to the frame'],
      ['Guard reading the badge', 'Receiving switch stripping the tag and delivering to the right VLAN'],
    ],
    whereNotPerfect:
      'In real networks, untagged traffic is sent to the Native VLAN, whereas all other frames carry an explicit 802.1Q header.',
    simpleTruth:
      'A trunk port carries traffic for multiple VLANs across a single cable by tagging each frame with a VLAN ID.',
    cliCommands: [
      'interface gigabitEthernet 0/1',
      'switchport mode trunk',
      'switchport trunk allowed vlan 10,20,30',
    ],
  },
  {
    id: 'why-routers',
    title: 'Why Cant Different VLANs Talk Without a Router?',
    topic: 'Inter-VLAN Routing (Router-on-a-Stick)',
    story:
      'Leo is in the Green room. Sam is in the Blue room. The doors are locked from the inside. Leo wants to pass a drawing of a rocket to Sam. Leo slides his drawing under the door to the hallway. Principal Rita picks it up, inspects the badge, unlocks Sam’s door, and hands it to Sam with a smile. Without Rita in the hall, drawings never leave the room!',
    inRealLife: [
      ['Locked classroom door', 'VLAN boundary blocking direct Layer 2 communication'],
      ['Sliding drawing into hallway', 'PC sending packet to its Default Gateway'],
      ['Principal Rita moving papers', 'Router routing packets between subinterfaces (Router-on-a-stick)'],
    ],
    whereNotPerfect:
      'Modern Layer 3 switches can perform this routing in hardware without an external router, but standard Layer 2 switches always need a router.',
    simpleTruth:
      'Switches isolate VLANs at Layer 2; only a router (or Layer 3 switch) can inspect IP addresses and route packets between different VLANs.',
    cliCommands: [
      'interface gigabitEthernet 0/0.10',
      'encapsulation dot1Q 10',
      'ip address 192.168.10.1 255.255.255.0',
      'interface gigabitEthernet 0/0.20',
      'encapsulation dot1Q 20',
      'ip address 192.168.20.1 255.255.255.0',
    ],
  },
  {
    id: 'why-stp',
    title: 'Why Does Spanning Tree Block Ports?',
    topic: 'Spanning Tree Protocol (STP 802.1D / RSTP 802.1w)',
    story:
      'Four mirrors are placed in a circle down a hallway. Jack shines a laser into the mirror. The beam bounces around the circle faster and faster, multiplying until the whole hallway is blinding white fire! A guard steps in and drops a wooden board in front of one mirror. The loop is broken. The hallway is safe again!',
    inRealLife: [
      ['Endlessly multiplying laser', 'Broadcast storm crashing a switched loop in milliseconds'],
      ['Dropping a wooden board', 'STP putting a redundant switch port into the Blocking state'],
      ['Board stays until mirror breaks', 'Blocked port unblocks automatically if the main cable is cut'],
    ],
    whereNotPerfect:
      'STP exchanges BPDU packets every 2 seconds to monitor topology health rather than using physical barriers.',
    simpleTruth:
      'STP prevents network meltdowns by finding redundant loops and putting backup ports to sleep until needed.',
    cliCommands: [
      'show spanning-tree',
      'spanning-tree vlan 10 root primary',
      'show spanning-tree vlan 10 brief',
    ],
  },
  {
    id: 'what-is-portfast',
    title: 'What Does PortFast Do?',
    topic: 'STP PortFast on Edge Ports',
    story:
      'A new puppy walks into obedience class. Normally, the trainer makes new puppies wait thirty seconds at the door, listening and checking if they bite. But Maya’s puppy is tiny, cute, and wearing a house collar. The trainer opens the express gate and lets the puppy dash right in to play!',
    inRealLife: [
      ['Waiting 30 seconds', 'STP Listening (15s) and Learning (15s) timer delay'],
      ['Express gate for friendly puppy', 'PortFast skipping directly to Forwarding state'],
      ['Only for house pets', 'PortFast must only be enabled on ports connected to end PCs, never switches'],
    ],
    whereNotPerfect:
      'If you accidentally plug another switch into a PortFast port, a broadcast loop can form unless BPDU Guard is active.',
    simpleTruth:
      'PortFast lets end-user computers get their IP addresses from DHCP immediately without waiting 30 seconds for STP checks.',
    cliCommands: [
      'interface fastEthernet 0/1',
      'spanning-tree portfast',
      'spanning-tree portfast default',
    ],
  },
  {
    id: 'what-is-subnetting',
    title: 'What Is Subnetting & VLSM?',
    topic: 'Subnetting & Variable Length Subnet Masking',
    story:
      'Chef Marco bakes one giant square pizza with 256 slices. A birthday party with 100 children arrives, so Marco slices off half the pizza (128 slices). A club of 25 chess players arrives, so Marco cuts a quarter of what remains (32 slices). Two friends come for lunch, so he cuts 4 tiny slices. No pizza is thrown away!',
    inRealLife: [
      ['256 slice pizza', 'A /24 network block (256 addresses)'],
      ['128 slices for birthday', 'A /25 subnet (126 usable hosts for Students)'],
      ['32 slices for chess club', 'A /27 subnet (30 usable hosts for Faculty)'],
    ],
    whereNotPerfect:
      'In real subnets, two addresses per block are reserved (Network ID and Broadcast), so usable hosts is always 2^H - 2.',
    simpleTruth:
      'Subnetting cuts a big address block into custom-sized chunks so organizations do not waste precious IP addresses.',
    cliCommands: [
      '! Subnetting calculation formula:',
      '! Total hosts = 2^(32 - prefix)',
      '! Usable hosts = 2^(32 - prefix) - 2',
      '! Block size = 256 - interesting octet value',
    ],
  },
]

export const pastExamPapers: PastExamPaper[] = [
  {
    id: 'midterm-2024-2025',
    title: 'Midterm Examination (2024–2025)',
    semester: 'Fall Semester · 7th Semester',
    academicYear: '2024–2025',
    courseCode: 'NDI704',
    instructor: 'A.Prof. Dr. Reben Kurda & Assist. Lecturer Nihad Kh. Abdullah',
    timeLimit: '60 Minutes',
    description:
      'Original official midterm paper with 3 Switches, central Router, and Laptop console. Tests multi-class network assignments (Class A 110.x, Class B 130.x, Class C 193.x), VLAN 10/20/30 configuration, trunking, and inter-VLAN routing.',
    pktFile: 'Midterm (2024-2025).pkt',
    labKey: 'midterm-2024',
    questions: [
      {
        id: 'm24-q1',
        text: 'In the provided midterm topology, which Cisco IOS command configures the switch port connected to a student PC into VLAN 10?',
        type: 'single-choice',
        options: [
          'switchport mode trunk; switchport trunk native vlan 10',
          'switchport mode access; switchport access vlan 10',
          'vlan 10 access-port enable',
          'ip address 110.110.1.2 255.0.0.0',
        ],
        answer: 1,
        explanation:
          'Access ports connect to end-user devices (PCs, laptops). They must be configured with "switchport mode access" followed by "switchport access vlan <id>".',
        highYieldTip: 'Remember: Trunks carry multiple VLAN tags; access ports strip tags for end devices.',
      },
      {
        id: 'm24-q2',
        text: 'For the Class B network ID 130.130.2.0 with default mask 255.255.0.0, what is the default network class and total host bits?',
        type: 'single-choice',
        options: [
          'Class A, 24 host bits',
          'Class B, 16 host bits',
          'Class C, 8 host bits',
          'Class D, multicast',
        ],
        answer: 1,
        explanation:
          'First octet 130 falls in the Class B range (128–191). The default Class B mask is /16 (255.255.0.0), leaving 32 - 16 = 16 host bits (65,534 usable hosts).',
      },
      {
        id: 'm24-q3',
        text: 'Why must Router-on-a-Stick subinterfaces have "encapsulation dot1Q <vlan>" configured before assigning an IP address?',
        type: 'single-choice',
        options: [
          'It enables routing hardware on the physical chassis',
          'The router needs to know which 802.1Q VLAN tag corresponds to that virtual subinterface',
          'It assigns a MAC address to the router interface',
          'It disables Spanning Tree on the physical cable',
        ],
        answer: 1,
        explanation:
          'Subinterfaces share a single physical trunk link. Cisco IOS requires the 802.1Q encapsulation statement so the router knows which VLAN header to tag/untag on incoming and outgoing frames.',
      },
    ],
    subnetProblems: [
      {
        id: 'm24-sub1',
        networkAddress: '110.110.1.0',
        cidr: 24,
        subnetMask: '255.255.255.0',
        firstHost: '110.110.1.1',
        lastHost: '110.110.1.254',
        broadcast: '110.110.1.255',
        usableHosts: 254,
        explanation: 'Block size is 256. First host = .1 (Default Gateway), last host = .254, broadcast = .255.',
      },
      {
        id: 'm24-sub2',
        networkAddress: '130.130.2.0',
        cidr: 24,
        subnetMask: '255.255.255.0',
        firstHost: '130.130.2.1',
        lastHost: '130.130.2.254',
        broadcast: '130.130.2.255',
        usableHosts: 254,
        explanation: 'Subnetted Class B into /24. Gateway is 130.130.2.1; PCs take .2, .3, .4.',
      },
    ],
    practicalTasks: [
      {
        title: 'Configure Switch VLANs & Access Ports',
        description: 'Create VLAN 10, 20, 30 on SW1, SW2, SW3 and assign Fa0/1, Fa0/2, Fa0/3.',
        cliCommands:
          'vlan 10\nname Net-110\nvlan 20\nname Net-130\nvlan 30\nname Net-193\ninterface fa0/1\nswitchport mode access\nswitchport access vlan 10\ninterface fa0/2\nswitchport mode access\nswitchport access vlan 20\ninterface fa0/3\nswitchport mode access\nswitchport access vlan 30',
        verification: 'show vlan brief',
      },
      {
        title: 'Configure Inter-Switch Trunks',
        description: 'Set inter-switch links (Gig0/1, Gig0/2) as 802.1Q trunks.',
        cliCommands: 'interface range gi0/1 - 2\nswitchport mode trunk',
        verification: 'show interfaces trunk',
      },
      {
        title: 'Router-on-a-Stick Subinterfaces',
        description: 'Configure router subinterfaces for each VLAN with default gateway IPs.',
        cliCommands:
          'interface gi0/0\nno shutdown\ninterface gi0/0.10\nencapsulation dot1Q 10\nip address 110.110.1.1 255.255.255.0\ninterface gi0/0.20\nencapsulation dot1Q 20\nip address 130.130.2.1 255.255.255.0\ninterface gi0/0.30\nencapsulation dot1Q 30\nip address 193.193.3.1 255.255.255.0',
        verification: 'show ip interface brief\nshow ip route',
      },
    ],
  },
  {
    id: 'final-2025-2026-ga',
    title: 'Final Examination (2025–2026) [Group A]',
    semester: 'Fall Semester · 7th Semester',
    academicYear: '2025–2026',
    courseCode: 'NDI704',
    instructor: 'A.Prof. Dr. Reben Kurda',
    timeLimit: '60 Minutes',
    description:
      'Official Group A examination. Covers EtherChannel vs STP port blocking, Layer 2 vs Layer 3 switching, exact subnet math for 125.255.129.0/25, and VLSM allocation for 3 VLANs from a /23 block.',
    pktFile: 'Final exam (2025-2026).pdf',
    labKey: 'final-2025-ga',
    questions: [
      {
        id: 'f25a-q1',
        text: 'EtherChannel helps remove STP port blocking by combining multiple physical links into one logical link. (True or False)',
        type: 'true-false',
        options: ['True', 'False'],
        answer: 0,
        explanation:
          'True! When multiple parallel cables connect two switches without EtherChannel, STP blocks all but one to prevent loops. EtherChannel bundles them into a single logical channel-group, so STP sees only one link and all cables forward data.',
        highYieldTip: 'EtherChannel = Multiplied bandwidth + Zero STP port blocking!',
      },
      {
        id: 'f25a-q2',
        text: 'A switch VLANs perform routing between them at which layer? (Layer 2 or Layer 3)',
        type: 'single-choice',
        options: ['Layer 2', 'Layer 3'],
        answer: 1,
        explanation:
          'Layer 3! Traditional switches switch frames inside the same VLAN at Layer 2. Moving packets between DIFFERENT VLANs requires IP routing at Layer 3 (Multilayer switch or external Router).',
      },
    ],
    subnetProblems: [
      {
        id: 'f25a-calc1',
        networkAddress: '125.255.129.0',
        cidr: 25,
        subnetMask: '255.255.255.128',
        firstHost: '125.255.129.1',
        lastHost: '125.255.129.126',
        broadcast: '125.255.129.127',
        usableHosts: 126,
        explanation:
          '/25 borrows 1 bit in 4th octet (mask 255.255.255.128). Block size is 128 (0 to 127). First host is .1, last host is .126, broadcast is .127. Total usable hosts = 2^7 - 2 = 126.',
      },
      {
        id: 'f25a-vlsm',
        networkAddress: '10.10.11.128',
        cidr: 23,
        subnetMask: '255.255.254.0',
        firstHost: '10.10.10.1',
        lastHost: '10.10.11.254',
        broadcast: '10.10.11.255',
        usableHosts: 510,
        explanation:
          'From 10.10.10.0/23: VLAN 20 Teachers (100 users) -> /25 (10.10.10.0/25). VLAN 10 Students (63 users) -> /25 (10.10.10.128/25). VLAN 30 Admin (6 users + IP cameras) -> /27 (10.10.11.0/27, 30 usable hosts).',
      },
    ],
    practicalTasks: [
      {
        title: 'Group A VLSM Subnet Allocation',
        description: 'Allocate appropriate subnets from 10.10.10.0/23 for Students, Teachers, and Admin.',
        cliCommands:
          '! VLAN 20 Teachers (100 users): 10.10.10.0/25\n! VLAN 10 Students (63 users): 10.10.10.128/25\n! VLAN 30 Admin (6 users + IP cameras): 10.10.11.0/27',
        verification: 'show ip route',
      },
    ],
  },
  {
    id: 'final-2025-2026-gb',
    title: 'Final Examination (2025–2026) [Group B]',
    semester: 'Fall Semester · 7th Semester',
    academicYear: '2025–2026',
    courseCode: 'NDI704',
    instructor: 'A.Prof. Dr. Reben Kurda',
    timeLimit: '120 Minutes',
    description:
      'Official Group B examination. Tests four-link switch STP blocking mechanics, OSI layer of VLANs, subnet math for 8.126.201.128/25, and VLSM sizing for 70 employees, 20 visitors, and 14 admin with future fingerprint scanner growth.',
    pktFile: 'Final exam (2025-2026).pdf',
    labKey: 'final-2025-gb',
    questions: [
      {
        id: 'f25b-q1',
        text: 'A network has two switches connected with four physical links. Without EtherChannel, STP blocks three links. (True or False)',
        type: 'true-false',
        options: ['True', 'False'],
        answer: 0,
        explanation:
          'True! To prevent Layer 2 loops and broadcast storms, STP leaves only ONE active forwarding link between two switches and places the other 3 links into the Blocking/Alternate state.',
      },
      {
        id: 'f25b-q2',
        text: 'VLAN operates mainly at which layer of the OSI model? (Layer 2 or Layer 3)',
        type: 'single-choice',
        options: ['Layer 2', 'Layer 3'],
        answer: 0,
        explanation:
          'Layer 2 (Data Link Layer)! VLAN tags (802.1Q) are inserted directly into the Ethernet frame header at Layer 2.',
      },
    ],
    subnetProblems: [
      {
        id: 'f25b-calc1',
        networkAddress: '8.126.201.128',
        cidr: 25,
        subnetMask: '255.255.255.128',
        firstHost: '8.126.201.129',
        lastHost: '8.126.201.254',
        broadcast: '8.126.201.255',
        usableHosts: 126,
        explanation:
          'Network is in upper half of octet 4 (128 to 255). First usable is .129, last usable is .254, broadcast is .255. Usable hosts = 126.',
      },
    ],
    practicalTasks: [
      {
        title: 'Group B VLSM Subnet Allocation',
        description: 'Allocate from 10.11.110.0/23 for 70 employees, 20 visitors, 14 admin + fingerprint devices.',
        cliCommands:
          '! VLAN 50 Employees (70 users): 10.11.110.0/25 (126 hosts)\n! VLAN 60 Visitors (20 users): 10.11.110.128/27 (30 hosts)\n! VLAN 70 Admin (14 users + fingerprint): 10.11.110.160/27 (30 hosts)',
        verification: 'show ip route',
      },
    ],
  },
  {
    id: 'final-2024-2025-a',
    title: 'Final Examination (2024–2025) [Group A]',
    semester: 'Fall Semester · 1st Attempt',
    academicYear: '2024–2025',
    courseCode: 'NDI704',
    instructor: 'A.Prof. Dr. Reben Kurda',
    timeLimit: '90 Minutes',
    description:
      'Official examination paper featuring dual router WAN connection (R1 1941 to R2 1941 across 195.165.65.0/24), PortFast between switches and PCs, VTY remote management configuration, and VTP modes (Server, Client, Transparent).',
    pktFile: 'Final (2024-2025) [A].pkt',
    labKey: 'final-2024-a',
    questions: [
      {
        id: 'f24a-q1',
        text: 'In Cisco VTP (VLAN Trunking Protocol), what is the behavior of a switch configured in Transparent mode?',
        type: 'single-choice',
        options: [
          'It synchronizes its VLAN database with the Server and deletes local VLANs',
          'It forwards VTP advertisements to other switches but does NOT update its own local database',
          'It can only receive VLANs but cannot create new ones',
          'It turns off all trunk ports',
        ],
        answer: 1,
        explanation:
          'A VTP Transparent switch maintains its own independent local VLAN database (saved in running-config/startup-config). It passes VTP advertisements through its trunk ports to downstream switches without adopting them.',
      },
      {
        id: 'f24a-q2',
        text: 'Why is "spanning-tree portfast" configured on switch access ports connected to end-host PCs?',
        type: 'single-choice',
        options: [
          'To increase the Ethernet link speed from 100Mbps to 1Gbps',
          'To bypass the 30-second Listening and Learning states so PCs obtain DHCP addresses immediately',
          'To encrypt traffic between the PC and the switch',
          'To route IP packets without needing a gateway',
        ],
        answer: 1,
        explanation:
          'Standard 802.1D STP takes 30 to 50 seconds before forwarding traffic on a port. PortFast immediately moves access ports to the Forwarding state, preventing DHCP lease timeouts on boot.',
      },
    ],
    practicalTasks: [
      {
        title: 'Configure Dual Router Routing & VTY',
        description: 'Configure R1 and R2 Gigabit interfaces and enable VTY remote access.',
        cliCommands:
          'line vty 0 4\npassword cisco\nlogin\ntransport input telnet ssh\nexit\nip route 10.0.0.0 255.0.0.0 195.165.65.2',
        verification: 'show ip route\nping 10.0.0.2',
      },
      {
        title: 'Configure PortFast & VTP Modes',
        description: 'Configure S1 as VTP Server, S2 as Client, S3 as Transparent.',
        cliCommands:
          '! On S1 (Server):\nvtp domain wirex.epu\nvtp mode server\nvlan 10\nname Sales\n! On S2 (Client):\nvtp domain wirex.epu\nvtp mode client\n! On S3 (Transparent):\nvtp domain wirex.epu\nvtp mode transparent',
        verification: 'show vtp status\nshow vlan brief',
      },
    ],
  },
  {
    id: 'final-2022-2023',
    title: 'Final Examination (2022–2023)',
    semester: 'Fall Semester',
    academicYear: '2022–2023',
    courseCode: 'NDI704',
    instructor: 'A.Prof. Dr. Reben Kurda',
    timeLimit: '90 Minutes',
    description:
      'Classic multi-VLAN final examination. Combines dual 1941 routers with router-on-a-stick subinterfaces (VLAN 130, 140 on left; VLAN 10, 20 on right), WAN connection (192.168.255.0/24), 3-switch triangle with PortFast, and VTY access.',
    pktFile: 'Final (2022-2023).pkt',
    labKey: 'final-2022',
    questions: [
      {
        id: 'f22-q1',
        text: 'When configuring Router-on-a-Stick for VLAN 130 on interface Gi0/0/1, what is the exact command sequence?',
        type: 'single-choice',
        options: [
          'interface Gi0/0/1.130 -> encapsulation dot1Q 130 -> ip address 130.130.0.1 255.255.0.0',
          'interface Gi0/0/1 -> switchport access vlan 130 -> ip address 130.130.0.1 255.255.0.0',
          'interface vlan 130 -> ip address 130.130.0.1 255.255.0.0',
          'router vlan 130 -> network 130.130.0.0',
        ],
        answer: 0,
        explanation:
          'Subinterfaces on a router require creating the logical unit (.130), binding the 802.1Q tag ("encapsulation dot1Q 130"), and then assigning the IP address that acts as the default gateway.',
      },
    ],
    practicalTasks: [
      {
        title: 'Router Subinterfaces & Static Route',
        description: 'Configure subinterfaces on both routers and add static routes for reachability.',
        cliCommands:
          'interface gi0/0/1.130\nencapsulation dot1Q 130\nip address 130.130.0.1 255.255.0.0\ninterface gi0/0/1.140\nencapsulation dot1Q 140\nip address 140.140.0.1 255.255.0.0\nip route 10.0.0.0 255.0.0.0 192.168.255.1',
        verification: 'show ip route',
      },
    ],
  },
]

export interface PredictedExamSection {
  title: string
  points: number
  description: string
  questions: ExamQuestion[]
  subnetDrill?: SubnetCalcProblem
}

export interface PredictedMidtermPlan {
  title: string
  course: string
  datePrediction: string
  totalPoints: number
  passingScore: number
  overview: string
  sections: PredictedExamSection[]
}

export const predictedMidterm2026: PredictedMidtermPlan = {
  title: "🎯 Dr. Reben Kurda's Predicted Midterm Exam 2026",
  course: 'Network Design & Implementation (NDI704) — College of Erbil Technical Engineering',
  datePrediction: 'Tomorrow Morning',
  totalPoints: 100,
  passingScore: 60,
  overview:
    'Synthesized from past midterms (2024–2025), finals (2022–2026), and course lecture slides (Labs 1, 3, 4, 5, 6). High probability questions focusing on Router-on-a-stick, 3-switch VLAN segmentation, STP Root Bridge election, PortFast, Classful subnetting, and VLSM block sizing.',
  sections: [
    {
      title: 'Round 1: Rapid-Fire Core Theory Duel',
      points: 25,
      description: 'High-yield conceptual checks that appear consistently on NDI704 midterms.',
      questions: [
        {
          id: 'pred-q1',
          text: 'VLANs divide a single physical broadcast domain into multiple logical broadcast domains at Layer 2. (True or False)',
          type: 'true-false',
          options: ['True', 'False'],
          answer: 0,
          explanation:
            'True! By default, all switch ports belong to VLAN 1 (one broadcast domain). Creating VLANs creates separate broadcast domains, improving network performance and security.',
          curiousAnalogyRef: 'why-vlans',
          highYieldTip: 'VLAN = Broadcast domain reduction at Layer 2.',
        },
        {
          id: 'pred-q2',
          text: 'Which field is added to an Ethernet frame by the IEEE 802.1Q standard to identify VLAN membership across trunk links?',
          type: 'single-choice',
          options: [
            'A 4-byte Tag header between the Source MAC and EtherType fields',
            'An IP header option at Layer 3',
            'A 16-byte trailer after the Frame Check Sequence (FCS)',
            'A preamble extension',
          ],
          answer: 0,
          explanation:
            '802.1Q inserts a 4-byte (32-bit) tag into the original Ethernet frame header. It contains the 16-bit Tag Protocol Identifier (TPID = 0x8100) and the 16-bit Tag Control Information (TCI, with a 12-bit VLAN ID allowing 4094 VLANs).',
          curiousAnalogyRef: 'why-trunks',
        },
        {
          id: 'pred-q3',
          text: 'In Spanning Tree Protocol (STP 802.1D), how is the Root Bridge elected in a network?',
          type: 'single-choice',
          options: [
            'The switch with the highest IP address',
            'The switch with the lowest Bridge ID (Priority + MAC address)',
            'The switch with the most physical ports connected',
            'The router automatically assigns the root switch',
          ],
          answer: 1,
          explanation:
            'The switch with the LOWEST Bridge ID (BID) is elected Root Bridge. Bridge ID consists of a 2-byte Priority (default 32768) and the 6-byte Switch MAC address. If priorities tie, the lowest MAC address wins.',
          curiousAnalogyRef: 'why-stp',
          highYieldTip: 'Remember: In STP, lowest is ALWAYS best! Lowest Priority -> Lowest MAC -> Lowest Path Cost.',
        },
        {
          id: 'pred-q4',
          text: 'Enabling "spanning-tree portfast" on an inter-switch trunk link is recommended for redundancy. (True or False)',
          type: 'true-false',
          options: ['True', 'False'],
          answer: 1,
          explanation:
            'False! PortFast should ONLY be enabled on edge ports connected to single end-host devices (PCs, printers, servers). Enabling PortFast on a trunk link between switches can cause catastrophic broadcast loops before STP has a chance to detect them.',
          curiousAnalogyRef: 'what-is-portfast',
        },
        {
          id: 'pred-q5',
          text: 'What is the default command to configure the Switch Virtual Interface (SVI) for remote Telnet/SSH management?',
          type: 'single-choice',
          options: [
            'interface vlan 1 -> ip address <ip> <mask> -> no shutdown',
            'interface gigabitEthernet 0/0 -> ip remote-management',
            'line console 0 -> ip address <ip> <mask>',
            'switch remote-ip enable',
          ],
          answer: 0,
          explanation:
            'A Layer 2 switch does not have routed physical ports. Management remote IP is configured on the SVI: "interface vlan 1" (or management VLAN), followed by "ip address <ip> <mask>", "no shutdown", and "ip default-gateway <router-ip>".',
        },
      ],
    },
    {
      title: 'Round 2: Subnetting & Mask Calculation Drill',
      points: 25,
      description: 'The classic calculation question given on every single semester examination.',
      questions: [
        {
          id: 'pred-sub-q1',
          text: 'For the network address 192.168.10.0/26, determine the Subnet Mask, First Usable Host, Last Usable Host, Broadcast Address, and Total Number of Usable Hosts.',
          type: 'subnet-calc',
          answer: 'First: 192.168.10.1, Last: 192.168.10.62, Broadcast: 192.168.10.63, Usable: 62',
          explanation:
            'CIDR /26 borrows 2 bits in the 4th octet (128 + 64 = 192). Subnet mask is 255.255.255.192. Block size = 256 - 192 = 64. Subnet range: 192.168.10.0 to 192.168.10.63. First host = 192.168.10.1, Last host = 192.168.10.62, Broadcast = 192.168.10.63. Total usable hosts = 2^(32-26) - 2 = 64 - 2 = 62.',
        },
      ],
      subnetDrill: {
        id: 'pred-drill',
        networkAddress: '192.168.10.0',
        cidr: 26,
        subnetMask: '255.255.255.192',
        firstHost: '192.168.10.1',
        lastHost: '192.168.10.62',
        broadcast: '192.168.10.63',
        usableHosts: 62,
        explanation: 'Block size 64. First usable is .1, last is .62, broadcast is .63, usable hosts 62.',
      },
    },
    {
      title: 'Round 3: VLSM Department Sizing Challenge',
      points: 25,
      description: 'Allocate appropriate subnets from 172.16.0.0/22 for a university campus network.',
      questions: [
        {
          id: 'pred-vlsm-q1',
          text: 'Given address block 172.16.0.0/22, allocate subnets for: Students (120 hosts), Faculty (55 hosts), IoT Cameras (12 hosts), and a WAN link (2 hosts). What are the prefix lengths (/CIDR) for each?',
          type: 'single-choice',
          options: [
            'Students /25, Faculty /26, IoT /28, WAN /30',
            'Students /24, Faculty /25, IoT /26, WAN /28',
            'Students /26, Faculty /27, IoT /29, WAN /30',
            'All departments use /24',
          ],
          answer: 0,
          explanation:
            'VLSM sizing rule: Find the smallest power of 2 that accommodates N hosts + 2 (Network + Broadcast):\n- Students: 120 hosts -> next power is 128 (2^7), leaves 7 host bits -> prefix /25 (126 usable hosts).\n- Faculty: 55 hosts -> next power is 64 (2^6), leaves 6 host bits -> prefix /26 (62 usable hosts).\n- IoT Cameras: 12 hosts -> next power is 16 (2^4), leaves 4 host bits -> prefix /28 (14 usable hosts).\n- WAN Link: 2 hosts -> next power is 4 (2^2), leaves 2 host bits -> prefix /30 (2 usable hosts).',
          highYieldTip: 'Always sort host requirements from LARGEST to SMALLEST before subnetting!',
        },
      ],
    },
    {
      title: 'Round 4: Live Practical Simulator Exam',
      points: 25,
      description: 'The hands-on Packet Tracer topology design and configuration test.',
      questions: [
        {
          id: 'pred-lab-q1',
          text: 'In the live predicted topology, PCs in VLAN 10 cannot ping PCs in VLAN 20. The switch ports are configured correctly in access mode. What is the most common cause?',
          type: 'single-choice',
          options: [
            'The router physical interface is "shutdown" or subinterfaces lack "encapsulation dot1Q"',
            'The PCs do not have high-speed graphics cards',
            'PortFast is disabled on the router',
            'VTP mode is set to Transparent',
          ],
          answer: 0,
          explanation:
            'Inter-VLAN ping requires the router to route between subinterfaces. If the physical link is administratively down ("shutdown") or encapsulation dot1Q is omitted from subinterfaces, frames cannot be routed.',
        },
      ],
    },
  ],
}
