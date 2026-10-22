import type { LessonId } from './trainingLabs'

export interface TrainingGuideStep {
  deviceId: string
  title: string
  body: string
  commands: string[]
  verify?: string[]
}

export interface TrainingGuideExpected {
  title: string
  output: string[]
}

export interface TrainingGuide {
  summary: string
  topology: string[]
  before: string[]
  steps: TrainingGuideStep[]
  verify: string[]
  expected?: TrainingGuideExpected[]
  mistakes: string[]
}

const enable = 'enable'
const configure = 'configure terminal'

export function guideCommandsForDevice(lesson: LessonId, deviceId: string): string {
  let enabled = false
  return trainingGuides[lesson].steps
    .filter(step => step.deviceId === deviceId)
    .flatMap(step => step.commands)
    .filter(command => {
      if (command !== 'enable') return true
      if (enabled) return false
      enabled = true
      return true
    })
    .join('\n')
}

export const trainingGuides: Record<LessonId, TrainingGuide> = {
  vlans: {
    summary: 'A VLAN is one broadcast domain, and a trunk carries several VLANs between switches with 802.1Q tags. Create the VLAN and access port on both switches, then make the uplink a trunk on both ends.',
    topology: [
      'Distribution-A Fa0/1 ↔ Sales-A',
      'Distribution-B Fa0/1 ↔ Sales-B',
      'Distribution-A Gi0/1 ↔ Distribution-B Gi0/1 is the trunk',
    ],
    before: [
      'Both PCs are already in 192.168.10.0/24, so no default gateway is needed.',
      'Use the same VLAN ID 10 and the same name Sales on both switches.',
      'A trunk must be configured on both ends before traffic can cross.',
    ],
    steps: [
      {
        deviceId: 'campus-sw-a',
        title: 'Create VLAN 10 and the access port on Distribution-A',
        body: 'The VLAN must exist before the access port can use it. The uplink becomes a trunk so the Sales frame can cross to the other switch.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'interface fa0/1',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface gi0/1',
          'switchport mode trunk',
          'end',
        ],
        verify: ['show vlan brief', 'show interfaces trunk'],
      },
      {
        deviceId: 'campus-sw-b',
        title: 'Repeat the VLAN and trunk on Distribution-B',
        body: 'A trunk that is configured on only one side does not carry tagged frames. Apply the matching configuration on the second switch.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'interface fa0/1',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface gi0/1',
          'switchport mode trunk',
          'end',
        ],
        verify: ['show vlan brief', 'show interfaces trunk'],
      },
    ],
    verify: [
      'In show vlan brief, VLAN 10 is active and Fa0/1 appears underneath it.',
      'In show interfaces trunk, Gi0/1 is trunking and VLAN 10 is allowed.',
      'Test traffic from Sales-A to Sales-B succeeds, then Check my work.',
    ],
    mistakes: [
      'Creating VLAN 10 on only one switch.',
      'Assigning the access VLAN without first creating the VLAN.',
      'Trunking only one end of the uplink.',
      'Forgetting that both PCs must stay in the same subnet for this lab.',
    ],
  },
  ethernet: {
    summary: 'Ethernet delivers frames inside one broadcast domain, and the switch learns source MAC addresses as frames arrive. Use the MAC table and an ARP or ping test to prove the path instead of guessing from the topology.',
    topology: [
      'Distribution-A Fa0/1 ↔ Sales-A',
      'Distribution-B Fa0/1 ↔ Sales-B',
      'Distribution-A Gi0/1 ↔ Distribution-B Gi0/1 is already a trunk in VLAN 10',
    ],
    before: [
      'Run Test traffic once so the switches have frames to learn from.',
      'The MAC table starts empty; a successful ping populates it.',
      'The ARP cache shows the IP-to-MAC binding used for the next hop.',
    ],
    steps: [
      {
        deviceId: 'campus-sw-a',
        title: 'Inspect the local forwarding table on Distribution-A',
        body: 'The switch learns the source MAC of each arriving frame and records the port it came from. The destination MAC decides whether the frame is filtered, flooded, or forwarded.',
        commands: [enable, 'show mac address-table', 'show arp', 'show interfaces status'],
      },
      {
        deviceId: 'campus-sw-b',
        title: 'Compare the same evidence on Distribution-B',
        body: 'The remote PC should appear only after traffic crosses the trunk. If the MAC table is empty after a successful ping, the test traffic and the table are out of sync.',
        commands: [enable, 'show mac address-table', 'show arp', 'show interfaces status'],
      },
    ],
    verify: [
      'show mac address-table lists the PC MAC on the expected access port.',
      'show arp shows the peer IP resolved to a MAC address.',
      'In show interfaces status, connected means the link is up; the Vlan column shows the access VLAN or trunk.',
      'Test traffic succeeds and the Ethernet task is marked complete.',
    ],
    mistakes: [
      'Expecting a MAC table entry before any frame has arrived.',
      'Reading a dynamic MAC entry as a static configuration.',
      'Testing only one direction and assuming the return path works.',
    ],
  },
  tcpip: {
    summary: 'A host uses ARP for the next-hop MAC and its default gateway for every destination outside its subnet. Follow the packet from the PC to the router and back, then verify the router interface and connected route.',
    topology: [
      'Sales-A 192.168.10.11/24 → Campus-Router 192.168.10.1',
      'Sales-B 192.168.20.12/24 → Campus-Router 192.168.20.1',
      'Each switch connects to a different router interface',
    ],
    before: [
      'Run Test traffic so the ARP caches and interface counters have evidence.',
      'The PCs are in different subnets, so each one uses its default gateway.',
      'A successful ping requires both the outbound and return routes.',
    ],
    steps: [
      {
        deviceId: 'campus-router',
        title: 'Check the router interfaces and connected routes',
        body: 'The router needs an up/up interface in each subnet and a connected route for each subnet. Without the return route, the echo reply is dropped even if the request arrived.',
        commands: [enable, 'show ip interface brief', 'show ip route', 'show arp'],
      },
      {
        deviceId: 'campus-sw-a',
        title: 'Check the Layer 2 path from the Sales side',
        body: 'The switch does not need an IP address to forward these frames. Its MAC table should point toward Sales-A and toward the router.',
        commands: [enable, 'show mac address-table', 'show vlan brief'],
      },
      {
        deviceId: 'campus-sw-b',
        title: 'Check the Layer 2 path from the Management side',
        body: 'Compare the learned MAC and VLAN with the first switch. A missing return path on this side produces a one-way failure.',
        commands: [enable, 'show mac address-table', 'show vlan brief'],
      },
    ],
    verify: [
      'show ip interface brief shows both router interfaces up/up with the expected addresses.',
      'show ip route lists both connected subnets; C marks a connected route and L marks the local interface address.',
      'Test traffic succeeds and the TCP/IP task is marked complete.',
    ],
    mistakes: [
      'Configuring a default gateway on only one PC.',
      'Putting both PCs in the same subnet when the lab expects two subnets.',
      'Looking only at the outbound ping and ignoring the return route.',
      'Expecting a Layer 2 switch to route between the two subnets.',
    ],
  },
  stp: {
    summary: 'Redundant links create Layer 2 loops, so STP elects one root and keeps the paths that would loop in a standby state. The lower bridge ID wins; root primary lowers a switch’s per-VLAN priority.',
    topology: [
      'Distribution-A Gi0/1 ↔ Distribution-B Gi0/1',
      'Distribution-A Gi0/2 ↔ Access-C Gi0/1',
      'Distribution-B Gi0/2 ↔ Access-C Gi0/2',
      'All switch-to-switch links are trunks in VLAN 10',
    ],
    before: [
      'All three switches start at the default priority 32768.',
      'Distribution-A and Distribution-B also have Sales PCs on Fa0/1.',
      'Only configure root primary on the switch you want to win.',
      'After applying the root commands, let the simulation run for a few seconds so BPDUs converge before reading show spanning-tree.',
    ],
    steps: [
      {
        deviceId: 'campus-sw-a',
        title: 'Make Distribution-A the primary root for VLAN 10',
        body: 'Root primary sets the base priority to 24576 (displayed as 24586 with the VLAN 10 system-ID extension), low enough to beat the default 32768. PortFast is safe on the PC-facing Fa0/1 port, not on an uplink.',
        commands: [
          enable,
          configure,
          'spanning-tree vlan 10 root primary',
          'interface fa0/1',
          'spanning-tree portfast',
          'exit',
          'end',
        ],
        verify: ['show spanning-tree vlan 10', 'show spanning-tree summary'],
      },
      {
        deviceId: 'campus-sw-b',
        title: 'Make Distribution-B the secondary root',
        body: 'Root secondary sets the base priority to 28672 (displayed as 28682 for VLAN 10). It keeps B ready to take over without competing with A while A is healthy.',
        commands: [
          enable,
          configure,
          'spanning-tree vlan 10 root secondary',
          'interface fa0/1',
          'spanning-tree portfast',
          'exit',
          'end',
        ],
        verify: ['show spanning-tree vlan 10'],
      },
      {
        deviceId: 'campus-sw-c',
        title: 'Verify the election from Access-C',
        body: 'Give BPDUs a few seconds to converge, then read Access-C. It should not be root: its root port points toward A and its alternate path toward B is the link STP is holding in reserve.',
        commands: [enable, 'show spanning-tree vlan 10'],
      },
    ],
    verify: [
      'Distribution-A reports that it is the root for VLAN 10.',
      'Distribution-B and Access-C show a root port toward A.',
      'At least one path is alternate/discarding, proving the loop is broken.',
      'Test traffic still succeeds and the STP tasks are marked complete.',
    ],
    expected: [{
      title: 'show spanning-tree vlan 10 on Access-C after BPDUs converge (excerpt)',
      output: [
        'Root ID Priority 24586',
        'Root path cost 4',
        'Gi0/1            Root FWD  4',
        'Gi0/2            Altn BLK  4',
      ],
    }],
    mistakes: [
      'Configuring root primary on both Distribution switches.',
      'Changing the bridge priority without checking which switch currently wins.',
      'Enabling PortFast on an inter-switch link.',
      'Describing the alternate port as a dead or blocked-role port.',
    ],
  },
  channel: {
    summary: 'EtherChannel bundles parallel switch links into one logical Port-channel. LACP negotiates the bundle; at least one side must be active, and both sides must use matching member, VLAN, and trunk settings.',
    topology: [
      'Distribution-A Gi0/1 ↔ Distribution-B Gi0/1',
      'Distribution-A Gi0/2 ↔ Distribution-B Gi0/2',
      'Sales-A and Sales-B are access ports in VLAN 10',
      'Both switches must negotiate the same two-member bundle',
    ],
    before: [
      'LACP modes are active and passive; at least one end must be active.',
      'The two member links must have identical trunk settings on both switches.',
      'The local channel-group number does not have to match the other switch.',
    ],
    steps: [
      {
        deviceId: 'campus-sw-a',
        title: 'Build both LACP members on Distribution-A',
        body: 'Set both physical links to trunk before bundling them. The channel-group command creates Port-channel 1 and starts LACP negotiation.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'interface fa0/1',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface range gi0/1-2',
          'switchport mode trunk',
          'channel-group 1 mode active',
          'exit',
          'end',
        ],
        verify: ['show etherchannel summary', 'show interfaces trunk'],
      },
      {
        deviceId: 'campus-sw-b',
        title: 'Repeat the matching configuration on Distribution-B',
        body: 'Configuring only one switch is the most common EtherChannel failure. B needs the same VLAN, access port, trunk mode, and LACP mode on both members.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'interface fa0/1',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface range gi0/1-2',
          'switchport mode trunk',
          'channel-group 1 mode active',
          'exit',
          'end',
        ],
        verify: ['show etherchannel summary', 'show interfaces trunk'],
      },
      {
        deviceId: 'campus-sw-a',
        title: 'Prove the bundle is operational',
        body: 'Port-channel 1 should be in use, and both Gigabit members should be bundled rather than independent. STP now treats the pair as one logical link.',
        commands: [enable, 'show etherchannel summary', 'show interfaces trunk', 'show spanning-tree vlan 10'],
      },
    ],
    verify: [
      'show etherchannel summary shows Po1(SU) with Gi0/1(P) and Gi0/2(P): the logical bundle is in use and both members are bundled.',
      'The protocol column reads LACP, and neither member appears with a down or standalone flag.',
      'show interfaces trunk confirms 802.1Q trunking on the bundle links, and the summary proves both members belong to Po1.',
      'Test traffic succeeds and both EtherChannel tasks are marked complete.',
    ],
    expected: [{
      title: 'show etherchannel summary on Distribution-A',
      output: [
        'Number of channel-groups in use: 1',
        'Group  Port-channel  Protocol  Ports',
        '1      Po1(SU)       LACP      Gi0/1(P) Gi0/2(P)',
      ],
    }],
    mistakes: [
      'Configuring only Distribution-A and expecting the other side to join.',
      'Using passive on both switches, so neither side initiates.',
      'Mixing active LACP on one end with desirable PAgP on the other.',
      'Leaving one member as an access port or with a different allowed VLAN.',
      'Typing channel-group 1 mode ac, which is not a valid LACP mode.',
    ],
  },
  campus: {
    summary: 'The campus exercise combines VLANs, access ports, a trunk, and management SVIs. A Layer 2 switch can keep each department’s VLAN separate, but it cannot route between VLANs without a Layer 3 device.',
    topology: [
      'Distribution-A: Fa0/1-2 Sales, Fa0/3 Management, Fa0/4 Admin, Gi0/1 trunk',
      'Distribution-B: Fa0/1-2 Sales, Fa0/3 Management, Fa0/4 Admin, Gi0/1 trunk',
      'Management SVIs: VLAN 10 .2 on A and .3 on B',
    ],
    before: [
      'Create VLANs 10, 20, and 30 on both switches before assigning ports.',
      'The trunk must carry all three VLANs.',
      'The management SVI only manages the switch; it does not route between departments.',
    ],
    steps: [
      {
        deviceId: 'campus-sw-a',
        title: 'Build the VLANs, access ports, trunk, and SVI on Distribution-A',
        body: 'The interface range creates the two Sales access ports together. The SVI gives this switch a management address in VLAN 10.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'vlan 20',
          'name Management',
          'exit',
          'vlan 30',
          'name Admin',
          'exit',
          'interface range fa0/1-2',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface fa0/3',
          'switchport mode access',
          'switchport access vlan 20',
          'exit',
          'interface fa0/4',
          'switchport mode access',
          'switchport access vlan 30',
          'exit',
          'interface gi0/1',
          'switchport mode trunk',
          'exit',
          'interface vlan 10',
          'ip address 192.168.10.2 255.255.255.0',
          'no shutdown',
          'end',
        ],
        verify: ['show vlan brief', 'show interfaces trunk', 'show ip interface brief'],
      },
      {
        deviceId: 'campus-sw-b',
        title: 'Repeat the campus configuration on Distribution-B',
        body: 'Use .3 for the B management address. The VLAN IDs, names, access assignments, and trunk settings must match A.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'vlan 20',
          'name Management',
          'exit',
          'vlan 30',
          'name Admin',
          'exit',
          'interface range fa0/1-2',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface fa0/3',
          'switchport mode access',
          'switchport access vlan 20',
          'exit',
          'interface fa0/4',
          'switchport mode access',
          'switchport access vlan 30',
          'exit',
          'interface gi0/1',
          'switchport mode trunk',
          'exit',
          'interface vlan 10',
          'ip address 192.168.10.3 255.255.255.0',
          'no shutdown',
          'end',
        ],
        verify: ['show vlan brief', 'show interfaces trunk', 'show ip interface brief'],
      },
    ],
    verify: [
      'Both switches show VLANs 10, 20, and 30 with the expected names.',
      'Fa0/1-2 are Sales, Fa0/3 is Management, and Fa0/4 is Admin on both switches.',
      'The Gi0/1 trunk carries all three VLANs; show ip interface brief should show Vlan10 up/up with .2 on A and .3 on B.',
      'The management SVIs are up with .2 and .3.',
      'Test traffic succeeds and every campus task is complete.',
    ],
    mistakes: [
      'Creating the SVI before the VLAN exists.',
      'Assigning Fa0/3 or Fa0/4 without first setting access mode.',
      'Using the same management IP .2 on both switches.',
      'Expecting the SVIs to route between VLAN 20 and VLAN 30.',
    ],
  },
  exam: {
    summary: 'The practical exam asks you to build VLANs, access ports, an LACP bundle, a trunk, router-on-a-stick, per-VLAN STP, and an end-to-end traffic test. Work device by device, then verify before you score.',
    topology: [
      'Core-SW1 Gi0/1-2 ↔ Core-SW2 Gi0/1-2 in a two-member LACP bundle',
      'Core-SW1 Fa0/24 ↔ Edge-R1 Gi0/0, a dot1Q trunk',
      'VLAN 10 Sales, VLAN 20 Management, VLAN 30 Admin',
    ],
    before: [
      'The exam hides hints; this walkthrough is for guided practice only.',
      'Build both switches before expecting the bundle or the trunk to work.',
      'The router needs one dot1Q subinterface for each VLAN.',
    ],
    steps: [
      {
        deviceId: 'exam-sw-a',
        title: 'Configure Core-SW1',
        body: 'Create all three VLANs, assign the access ports, build the LACP bundle, trunk Fa0/24 to the router, and make this switch the root for every VLAN.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'vlan 20',
          'name Management',
          'exit',
          'vlan 30',
          'name Admin',
          'exit',
          'interface range fa0/1-2',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface fa0/3',
          'switchport mode access',
          'switchport access vlan 20',
          'exit',
          'interface fa0/4',
          'switchport mode access',
          'switchport access vlan 30',
          'exit',
          'interface range gi0/1-2',
          'switchport mode trunk',
          'channel-group 1 mode active',
          'exit',
          'interface fa0/24',
          'switchport mode trunk',
          'exit',
          'spanning-tree vlan 10 root primary',
          'spanning-tree vlan 20 root primary',
          'spanning-tree vlan 30 root primary',
          'end',
        ],
        verify: ['show vlan brief', 'show interfaces trunk', 'show etherchannel summary'],
      },
      {
        deviceId: 'exam-sw-b',
        title: 'Configure Core-SW2',
        body: 'Create the same VLANs, assign the B-side access ports, and join the same two-member LACP bundle.',
        commands: [
          enable,
          configure,
          'vlan 10',
          'name Sales',
          'exit',
          'vlan 20',
          'name Management',
          'exit',
          'vlan 30',
          'name Admin',
          'exit',
          'interface fa0/1',
          'switchport mode access',
          'switchport access vlan 10',
          'exit',
          'interface fa0/3',
          'switchport mode access',
          'switchport access vlan 20',
          'exit',
          'interface range gi0/1-2',
          'switchport mode trunk',
          'channel-group 1 mode active',
          'exit',
          'end',
        ],
        verify: ['show vlan brief', 'show interfaces trunk', 'show etherchannel summary'],
      },
      {
        deviceId: 'exam-router',
        title: 'Configure router-on-a-stick on Edge-R1',
        body: 'The parent interface must be up, and each subinterface needs the matching dot1Q VLAN and the default gateway address for that subnet.',
        commands: [
          enable,
          configure,
          'interface gi0/0',
          'no shutdown',
          'exit',
          'interface gi0/0.10',
          'encapsulation dot1q 10',
          'ip address 192.168.10.1 255.255.255.0',
          'exit',
          'interface gi0/0.20',
          'encapsulation dot1q 20',
          'ip address 192.168.20.1 255.255.255.0',
          'exit',
          'interface gi0/0.30',
          'encapsulation dot1q 30',
          'ip address 192.168.30.1 255.255.255.0',
          'exit',
          'end',
        ],
        verify: ['show ip interface brief', 'show ip route'],
      },
    ],
    verify: [
      'All three VLANs exist with the expected names on both switches.',
      'The access ports match the PC groups, and Fa0/24 is a trunk.',
      'show etherchannel summary shows one operational two-member bundle, Po1(SU) with Gi0/1(P) and Gi0/2(P).',
      'Each router subinterface is up with the correct gateway address; show ip route lists a C route for each VLAN subnet.',
      'Core-SW1 is root for VLANs 10, 20, and 30.',
      'Cross-VLAN Test traffic succeeds and the practical score reaches 14 / 14.',
    ],
    mistakes: [
      'Configuring only one side of the LACP bundle.',
      'Forgetting to make Fa0/24 a trunk toward the router.',
      'Leaving the router parent interface shut down.',
      'Using the wrong VLAN ID in an encapsulation dot1q command.',
      'Setting STP priority on only one of the three VLANs.',
      'Running the traffic test before all three layers are configured.',
    ],
  },
}
