import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'
import { useActivityStore } from './activityStore'
import { useTrainingStore } from './trainingStore'
import { useAcademyStore } from './academyStore'
import {
  getPredictedMidterm2026Lab,
  getMidterm2024Lab,
  getFinal2025GroupALab,
  getVoiceTelephonyLab,
  type ExamLabBundle,
} from '@/simulator/pastExamLabs'
import { getPhoneRegistrations } from '@/simulator/voice'
import { diagnoseStageInvariants } from '@/simulator/midtermDiagnostics'
import type { NetworkDevice, NetworkLink, NetworkAnnotation, DeviceWindow } from '@/types/network'

export type QuestLabId = 'predicted-2026' | 'midterm-2024' | 'final-2025' | 'voice-telephony'

export interface QuestTask {
  id: string
  label: string
  deviceHint: string
  hintText: string
  isDone: (devices: NetworkDevice[], links: NetworkLink[]) => boolean
}

export interface QuestStage {
  id: string
  stageNumber: number
  title: string
  subtitle: string
  primaryDeviceId: string
  mentorIntro: string
  sideRequirements: string
  curiousKidAnalogy: {
    hook: string
    analogy: string
    simpleTruth: string
  }
  tasks: QuestTask[]
  closeFeedback: string
  successFeedback: string
  solutionCli: string
}

export type MentorMood = 'thinking' | 'encouraging' | 'close' | 'celebrating' | 'tip'

export interface MidtermQuestBackup {
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
  deviceWindows: DeviceWindow[]
  fileName: string
}

interface MidtermQuestState {
  active: boolean
  questId: QuestLabId
  currentStageIndex: number
  activeDeviceId: string
  mentorMessage: string
  mentorMood: MentorMood
  hintLevel: number // 0: none, 1: mentor tip, 2: side requirements, 3: exact CLI
  showCuriousKid: boolean
  showSideReqs: boolean
  backup: MidtermQuestBackup | null
  lastTrafficTestStatus: 'idle' | 'pending' | 'success' | 'failed'
  completedStages: Record<string, boolean>

  // Actions
  startQuest: (questId?: QuestLabId) => void
  exitQuest: () => void
  setQuestId: (questId: QuestLabId) => void
  goToStage: (index: number) => void
  nextStage: () => void
  prevStage: () => void
  setActiveDeviceId: (deviceId: string) => void
  checkStageWork: () => void
  testTraffic: () => void
  requestHint: () => void
  toggleCuriousKid: () => void
  toggleSideReqs: () => void
  setMentorSpeech: (message: string, mood?: MentorMood) => void
}

/* ==========================================================================
   STAGE DEFINITIONS FOR PREDICTED MIDTERM 2026
   ========================================================================== */

function getPredicted2026Stages(): QuestStage[] {
  return [
    {
      id: 'p26-stage-1',
      stageNumber: 1,
      title: 'Building Soundproof Rooms',
      subtitle: 'Create & Name VLANs 10, 20, and 30',
      primaryDeviceId: 'pred-sw1',
      mentorIntro:
        'You know, Dr. Reben Kurda used this exact same question for students to solve in the 2024-2025 Midterm. I will give you a moment to look at the canvas and figure it out. First step: create the 3 VLANs on SW1-Distribution and SW2-Academic!',
      sideRequirements:
        'Dr. Reben strictly tests exact VLAN naming in his grading script:\n• VLAN 10 name "Students"\n• VLAN 20 name "Teachers"\n• VLAN 30 name "Admin"\nCapitalization matters!',
      curiousKidAnalogy: {
        hook: 'Why do we need VLANs?',
        analogy:
          'Leo was in a giant classroom with 50 shouting kids. Every time someone lost a pencil, all 50 kids stopped. So the teacher built three soundproof rooms: Students, Teachers, and Admin. Now everyone can work in peace without hearing each other shout!',
        simpleTruth:
          'A VLAN splits one physical switch into isolated virtual rooms so broadcast noise does not congest the network.',
      },
      tasks: [
        {
          id: 'vlan-10-created',
          label: 'Create VLAN 10 named "Students" on SW1 & SW2',
          deviceHint: 'SW1-Distribution',
          hintText: 'On SW1 & SW2: vlan 10 -> name Students -> exit',
          isDone: (devices) => {
            const sw1 = devices.find((d) => d.id === 'pred-sw1')
            const sw2 = devices.find((d) => d.id === 'pred-sw2')
            const v10a = sw1?.config.vlans?.find((v) => v.id === 10)
            const v10b = sw2?.config.vlans?.find((v) => v.id === 10)
            return (
              !!v10a &&
              v10a.name.toLowerCase() === 'students' &&
              !!v10b &&
              v10b.name.toLowerCase() === 'students'
            )
          },
        },
        {
          id: 'vlan-20-created',
          label: 'Create VLAN 20 named "Teachers" on SW1 & SW2',
          deviceHint: 'SW1-Distribution',
          hintText: 'On SW1 & SW2: vlan 20 -> name Teachers -> exit',
          isDone: (devices) => {
            const sw1 = devices.find((d) => d.id === 'pred-sw1')
            const sw2 = devices.find((d) => d.id === 'pred-sw2')
            const v20a = sw1?.config.vlans?.find((v) => v.id === 20)
            const v20b = sw2?.config.vlans?.find((v) => v.id === 20)
            return (
              !!v20a &&
              v20a.name.toLowerCase() === 'teachers' &&
              !!v20b &&
              v20b.name.toLowerCase() === 'teachers'
            )
          },
        },
        {
          id: 'vlan-30-created',
          label: 'Create VLAN 30 named "Admin" across SW1, SW2 & SW3',
          deviceHint: 'SW2-Academic',
          hintText: 'On SW1, SW2, SW3: vlan 30 -> name Admin -> exit',
          isDone: (devices) => {
            const switches = devices.filter((d) =>
              ['pred-sw1', 'pred-sw2', 'pred-sw3'].includes(d.id)
            )
            return (
              switches.length === 3 &&
              switches.every((sw) =>
                sw.config.vlans?.some((v) => v.id === 30 && v.name.toLowerCase() === 'admin')
              )
            )
          },
        },
      ],
      closeFeedback:
        'Hmm, quite close! But seems like you have missed that part: check your VLAN names. Dr. Reben deducts marks if VLAN 10 is not named "Students" or VLAN 20 is not "Teachers". Run "show vlan brief" to check!',
      successFeedback:
        'Spot on! All 3 soundproof rooms are created with exact names. That was 15 points on the real exam. Ready for Stage 2?',
      solutionCli:
        '! SW1 & SW2 Configuration\nenable\nconfigure terminal\nvlan 10\n name Students\nvlan 20\n name Teachers\nvlan 30\n name Admin\nexit\n\n! SW3 Configuration\nenable\nconfigure terminal\nvlan 30\n name Admin\nexit',
    },
    {
      id: 'p26-stage-2',
      stageNumber: 2,
      title: 'Assigning Desks & VIP Doorways',
      subtitle: 'Access Ports & Spanning-Tree PortFast',
      primaryDeviceId: 'pred-sw1',
      mentorIntro:
        'Great work on the rooms! Now, Dr. Reben asks: how do student and teacher computers plug into their rooms? And remember his favorite tip: he hates waiting 30 seconds for switch ports to turn green!',
      sideRequirements:
        'Try reading the side requirements to solve this question:\n• SW1 Fa0/1 and Fa0/2 connect to Student PCs (VLAN 10)\n• SW2 Fa0/1 and Fa0/2 connect to Teacher PCs (VLAN 20)\n• SW3 Fa0/1 and Fa0/2 connect to Admin PCs (VLAN 30)\n• All access ports MUST have "spanning-tree portfast" enabled to bypass the 30-second STP delay!',
      curiousKidAnalogy: {
        hook: 'Why PortFast?',
        analogy:
          'Normally, when a new kid arrives at school, the hall guard stops them for 30 seconds to make sure they are not walking in circles (STP loop prevention). PortFast is a VIP badge for PC desks that lets them walk in immediately!',
        simpleTruth:
          'PortFast immediately transitions an edge access port to the STP Forwarding state, bypassing Listening and Learning.',
      },
      tasks: [
        {
          id: 'sw1-access-ports',
          label: 'SW1: Assign Fa0/1 & Fa0/2 to VLAN 10 (Access)',
          deviceHint: 'SW1-Distribution',
          hintText:
            'interface range fa0/1-2 -> switchport mode access -> switchport access vlan 10',
          isDone: (devices) => {
            const sw1 = devices.find((d) => d.id === 'pred-sw1')
            if (!sw1) return false
            const p1 = sw1.ports.find((p) => p.shortName.toLowerCase() === 'fa0/1')
            const p2 = sw1.ports.find((p) => p.shortName.toLowerCase() === 'fa0/2')
            return (
              p1?.portMode === 'access' &&
              p1.vlan === 10 &&
              p2?.portMode === 'access' &&
              p2.vlan === 10
            )
          },
        },
        {
          id: 'sw2-access-ports',
          label: 'SW2: Assign Fa0/1 & Fa0/2 to VLAN 20 (Access)',
          deviceHint: 'SW2-Academic',
          hintText:
            'interface range fa0/1-2 -> switchport mode access -> switchport access vlan 20',
          isDone: (devices) => {
            const sw2 = devices.find((d) => d.id === 'pred-sw2')
            if (!sw2) return false
            const p1 = sw2.ports.find((p) => p.shortName.toLowerCase() === 'fa0/1')
            const p2 = sw2.ports.find((p) => p.shortName.toLowerCase() === 'fa0/2')
            return (
              p1?.portMode === 'access' &&
              p1.vlan === 20 &&
              p2?.portMode === 'access' &&
              p2.vlan === 20
            )
          },
        },
        {
          id: 'access-portfast',
          label: 'Enable Spanning-Tree PortFast on access ports',
          deviceHint: 'SW1-Distribution',
          hintText: 'On SW1 & SW2: interface range fa0/1-2 -> spanning-tree portfast',
          isDone: (devices) => {
            const sw1 = devices.find((d) => d.id === 'pred-sw1')
            const sw2 = devices.find((d) => d.id === 'pred-sw2')
            const check = (sw?: NetworkDevice) =>
              ['fa0/1', 'fa0/2'].every((name) => {
                const port = sw?.ports.find((p) => p.shortName.toLowerCase() === name)
                return port?.portfast === true
              })
            return check(sw1) && check(sw2)
          },
        },
      ],
      closeFeedback:
        'Hmm, quite close! But seems like you have missed that part: did you enable PortFast on the access ports? Check "spanning-tree portfast" on the switch interfaces!',
      successFeedback:
        'Excellent work! All access desks are assigned to their respective VLANs, and PortFast ensures instantaneous link-up without 30s STP blocking.',
      solutionCli:
        '! SW1-Distribution\nenable\nconfigure terminal\ninterface range fa0/1-2\n switchport mode access\n switchport access vlan 10\n spanning-tree portfast\nexit\n\n! SW2-Academic\nenable\nconfigure terminal\ninterface range fa0/1-2\n switchport mode access\n switchport access vlan 20\n spanning-tree portfast\nexit',
    },
    {
      id: 'p26-stage-3',
      stageNumber: 3,
      title: 'The Trunk Highway',
      subtitle: '802.1Q Inter-Switch Trunking',
      primaryDeviceId: 'pred-sw1',
      mentorIntro:
        'Now notice something interesting: Student-A1 is on SW1, but the central router is connected to SW2. You know Dr. Reben Kurda loves asking: "Why cannot VLAN 10 traffic cross to SW2 right now?" I will give you a moment to inspect the trunk links and figure it out.',
      sideRequirements:
        'Try reading the side requirements to solve this question:\n• SW1 Gi0/1 <-> SW2 Gi0/2 is an inter-switch backbone\n• SW2 Fa0/24 <-> SW3 Gi0/1 connects the admin building\n• SW2 Gi0/1 connects directly to the Router\nAll backbone links must be in Trunk mode carrying 802.1Q tags!',
      curiousKidAnalogy: {
        hook: 'Why Trunking?',
        analogy:
          'Instead of digging three separate tunnels between castles for Green, Blue, and Yellow knights, we build one big tunnel. As a knight enters, the guard sticks a colored badge (802.1Q tag) on their helmet so the other castle knows which room to send them to!',
        simpleTruth:
          'A trunk link carries frames from multiple VLANs over a single physical cable by inserting a 4-byte 802.1Q tag into each Ethernet frame.',
      },
      tasks: [
        {
          id: 'sw1-trunk',
          label: 'SW1: Configure Gi0/1 as 802.1Q Trunk',
          deviceHint: 'SW1-Distribution',
          hintText: 'interface gi0/1 -> switchport mode trunk',
          isDone: (devices) => {
            const sw1 = devices.find((d) => d.id === 'pred-sw1')
            const p = sw1?.ports.find((x) => x.shortName.toLowerCase() === 'gi0/1')
            return p?.portMode === 'trunk' && p.adminStatus === 'up'
          },
        },
        {
          id: 'sw2-trunks',
          label: 'SW2: Configure Gi0/1, Gi0/2 & Fa0/24 as Trunks',
          deviceHint: 'SW2-Academic',
          hintText:
            'interface range gi0/1-2 -> switchport mode trunk\ninterface fa0/24 -> switchport mode trunk',
          isDone: (devices) => {
            const sw2 = devices.find((d) => d.id === 'pred-sw2')
            if (!sw2) return false
            const g1 = sw2.ports.find((p) => p.shortName.toLowerCase() === 'gi0/1')
            const g2 = sw2.ports.find((p) => p.shortName.toLowerCase() === 'gi0/2')
            const f24 = sw2.ports.find((p) => p.shortName.toLowerCase() === 'fa0/24')
            return (
              g1?.portMode === 'trunk' &&
              g2?.portMode === 'trunk' &&
              f24?.portMode === 'trunk' &&
              g1.adminStatus === 'up' &&
              g2.adminStatus === 'up'
            )
          },
        },
      ],
      closeFeedback:
        'Hmm, quite close! But seems like you have missed that part: on SW2, check Gi0/1 (to the router) and Gi0/2 (to SW1). Both must be set to "switchport mode trunk". Run "show interfaces trunk" on SW2 to verify!',
      successFeedback:
        'Boom! The 802.1Q highway is open. Tagged frames can now travel between all switches and up to the router!',
      solutionCli:
        '! SW1-Distribution\nenable\nconfigure terminal\ninterface gi0/1\n switchport mode trunk\nexit\n\n! SW2-Academic\nenable\nconfigure terminal\ninterface range gi0/1-2\n switchport mode trunk\nexit\ninterface fa0/24\n switchport mode trunk\nexit',
    },
    {
      id: 'p26-stage-4',
      stageNumber: 4,
      title: 'The Inter-VLAN Master Key',
      subtitle: 'Router-on-a-Stick Subinterfaces',
      primaryDeviceId: 'pred-r1',
      mentorIntro:
        'Here comes the core of tomorrow\'s exam — worth 30% of the entire score! Dr. Reben Kurda always tests if students remember the golden rule of subinterfaces. Let us see if you can nail it without falling into the syntax trap!',
      sideRequirements:
        'Watch out for Dr. Reben\'s classic trap:\n• Cisco IOS rejects the "ip address" command if you forget to run "encapsulation dot1q" first!\n• Subinterfaces needed:\n  - Gi0/0.10 -> dot1Q 10 -> IP 10.10.10.1 255.255.255.128\n  - Gi0/0.20 -> dot1Q 20 -> IP 10.10.10.129 255.255.255.192\n  - Gi0/0.30 -> dot1Q 30 -> IP 10.10.11.1 255.255.255.224\n• Parent interface Gi0/0 MUST be "no shutdown"!',
      curiousKidAnalogy: {
        hook: 'Why Router-on-a-Stick?',
        analogy:
          'The router is like a headmaster holding the master keys to all three rooms. Instead of building three separate doors, the headmaster stands in one doorway with three keys: Key .10 unlocks the Students room, Key .20 unlocks Teachers, and Key .30 unlocks Admin!',
        simpleTruth:
          'Router-on-a-stick uses virtual subinterfaces on a single physical link to route traffic between different VLANs without needing multiple physical cables.',
      },
      tasks: [
        {
          id: 'r1-parent-up',
          label: 'Edge-Router: Bring up parent interface Gi0/0',
          deviceHint: 'Edge-Router',
          hintText: 'interface gi0/0 -> no shutdown',
          isDone: (devices) => {
            const r1 = devices.find((d) => d.id === 'pred-r1')
            const p = r1?.ports.find((x) => x.shortName.toLowerCase() === 'gi0/0')
            return p?.adminStatus === 'up'
          },
        },
        {
          id: 'r1-sub-10',
          label: 'Subinterface Gi0/0.10: dot1Q 10 & 10.10.10.1/25',
          deviceHint: 'Edge-Router',
          hintText:
            'interface gi0/0.10 -> encapsulation dot1q 10 -> ip address 10.10.10.1 255.255.255.128',
          isDone: (devices) => {
            const r1 = devices.find((d) => d.id === 'pred-r1')
            const p = r1?.ports.find((x) => x.dot1qVlan === 10)
            return (
              !!p &&
              p.ipAddress === '10.10.10.1' &&
              p.subnetMask === '255.255.255.128' &&
              p.adminStatus === 'up'
            )
          },
        },
        {
          id: 'r1-sub-20',
          label: 'Subinterface Gi0/0.20: dot1Q 20 & 10.10.10.129/26',
          deviceHint: 'Edge-Router',
          hintText:
            'interface gi0/0.20 -> encapsulation dot1q 20 -> ip address 10.10.10.129 255.255.255.192',
          isDone: (devices) => {
            const r1 = devices.find((d) => d.id === 'pred-r1')
            const p = r1?.ports.find((x) => x.dot1qVlan === 20)
            return (
              !!p &&
              p.ipAddress === '10.10.10.129' &&
              p.subnetMask === '255.255.255.192' &&
              p.adminStatus === 'up'
            )
          },
        },
        {
          id: 'r1-sub-30',
          label: 'Subinterface Gi0/0.30: dot1Q 30 & 10.10.11.1/27',
          deviceHint: 'Edge-Router',
          hintText:
            'interface gi0/0.30 -> encapsulation dot1q 30 -> ip address 10.10.11.1 255.255.255.224',
          isDone: (devices) => {
            const r1 = devices.find((d) => d.id === 'pred-r1')
            const p = r1?.ports.find((x) => x.dot1qVlan === 30)
            return (
              !!p &&
              p.ipAddress === '10.10.11.1' &&
              p.subnetMask === '255.255.255.224' &&
              p.adminStatus === 'up'
            )
          },
        },
      ],
      closeFeedback:
        'Hmm, quite close! But seems like you have missed that part: check the subnet mask on Gi0/0.10 or Gi0/0.20! Remember VLAN 10 is /25 (255.255.255.128) and VLAN 20 is /26 (255.255.255.192). Also ensure parent Gi0/0 is "no shutdown"!',
      successFeedback:
        'Outstanding! All three subinterfaces are up with proper dot1Q encapsulation and IP addressing. The router is ready to route packets between departments!',
      solutionCli:
        '! Edge-Router\nenable\nconfigure terminal\ninterface gi0/0\n no shutdown\nexit\ninterface gi0/0.10\n encapsulation dot1q 10\n ip address 10.10.10.1 255.255.255.128\nexit\ninterface gi0/0.20\n encapsulation dot1q 20\n ip address 10.10.10.129 255.255.255.192\nexit\ninterface gi0/0.30\n encapsulation dot1q 30\n ip address 10.10.11.1 255.255.255.224\nexit',
    },
    {
      id: 'p26-stage-5',
      stageNumber: 5,
      title: 'The Golden Ping',
      subtitle: 'End-to-End Inter-VLAN Verification',
      primaryDeviceId: 'pred-pc-stu1',
      mentorIntro:
        'The moment of truth! Everything is wired and configured. Dr. Reben Kurda will now walk over to your desk and say: "Ping Teacher-B1 from Student-A1." Let us click "Test Traffic" or type the ping command and watch the packets cross the network!',
      sideRequirements:
        'Try reading the side requirements to solve this question:\n• Ping from Student-A1 (10.10.10.11) to Teacher-B1 (10.10.10.131)\n• First packet may drop for ARP resolution (normal in Cisco Packet Tracer!)\n• Second attempt will be 100% successful.',
      curiousKidAnalogy: {
        hook: 'Watch the packet fly!',
        analogy:
          'Student-A1 writes a letter. SW1 sees it is destined for another room, puts a blue tag on it, and sends it down the trunk tunnel. The router unlocks the Teachers door and SW2 delivers it right to Teacher-B1\'s desk!',
        simpleTruth:
          'When routing between VLANs, the source host sends packets to its default gateway (the router subinterface), which re-encapsulates the frame into the destination VLAN.',
      },
      tasks: [
        {
          id: 'ping-gateway',
          label: 'Student-A1 pings default gateway (10.10.10.1)',
          deviceHint: 'Student-A1',
          hintText: 'Ping from Student-A1 to 10.10.10.1 succeeds',
          isDone: () => {
            const net = useNetworkStore.getState()
            return net.pingResults.some(
              (r) =>
                r.sourceDeviceId === 'pred-pc-stu1' &&
                r.targetIp === '10.10.10.1' &&
                r.status === 'successful'
            )
          },
        },
        {
          id: 'ping-cross-vlan',
          label: 'Student-A1 pings Teacher-B1 (10.10.10.131)',
          deviceHint: 'Student-A1',
          hintText: 'Click "Test Traffic" button or ping 10.10.10.131 from Student-A1',
          isDone: () => {
            const net = useNetworkStore.getState()
            return net.pingResults.some(
              (r) =>
                r.sourceDeviceId === 'pred-pc-stu1' &&
                r.targetIp === '10.10.10.131' &&
                r.status === 'successful'
            )
          },
        },
      ],
      closeFeedback:
        'Hmm, quite close! But the ping has not succeeded yet. Click the "Test Ping Traffic" button below or open Student-A1 command prompt to test! Make sure your default gateways and trunks are up.',
      successFeedback:
        'CONGRATULATIONS! 100% FULL MARKS! You have solved the complete predicted midterm exam scenario. You understand VLANs, trunks, PortFast, and Router-on-a-stick from first principles. You are going to ace tomorrow\'s exam!',
      solutionCli:
        '! In Student-A1 Command Prompt / Terminal\nping 10.10.10.1\nping 10.10.10.131',
    },
  ]
}

/* ==========================================================================
   STAGE DEFINITIONS FOR CCNA2 LAB 4: VOICE VLAN & IP TELEPHONY
   ========================================================================== */

function getVoiceTelephonyStages(): QuestStage[] {
  return [
    {
      id: 'voice-stage-1',
      stageNumber: 1,
      title: 'Router-on-a-Stick Subinterfaces',
      subtitle: 'Create Fa0/0.10 (Data) and Fa0/0.11 (Voice)',
      primaryDeviceId: 'voice-r1',
      mentorIntro:
        'Welcome to Lab 4: Voice VLAN & IP Telephony! The physical cables are connected. First, enable the router\'s physical interface (no shutdown on Fa0/0) and create two 802.1Q subinterfaces: Fa0/0.10 for Data (192.168.10.1/24) and Fa0/0.11 for Voice (192.168.11.1/24).',
      sideRequirements:
        'Cisco IOS Router Configuration:\n• Interface Fa0/0: no shutdown\n• Subinterface Fa0/0.10:\n  - encapsulation dot1Q 10\n  - ip address 192.168.10.1 255.255.255.0\n• Subinterface Fa0/0.11:\n  - encapsulation dot1Q 11\n  - ip address 192.168.11.1 255.255.255.0',
      curiousKidAnalogy: {
        hook: 'One cable, two virtual pipes!',
        analogy:
          'Think of the Ethernet cable as a highway with two colored lanes: the Blue lane for computer data and the Gold priority lane for human voice calls. The router subinterfaces are the toll booths directing traffic into each lane!',
        simpleTruth:
          'Subinterfaces allow a single physical interface to route multiple tagged 802.1Q VLANs simultaneously.',
      },
      tasks: [
        {
          id: 'v-r1-phys-up',
          label: 'R1 FastEthernet0/0 enabled (no shutdown)',
          deviceHint: 'R1',
          hintText: 'interface FastEthernet0/0 -> no shutdown',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            const p = r?.ports.find((port) => port.shortName === 'Fa0/0' || port.name === 'FastEthernet0/0')
            return p?.adminStatus === 'up'
          },
        },
        {
          id: 'v-r1-subint-10',
          label: 'Fa0/0.10 dot1Q 10 & IP 192.168.10.1/24',
          deviceHint: 'R1',
          hintText: 'interface fa0/0.10 -> encapsulation dot1q 10 -> ip address 192.168.10.1 255.255.255.0',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            return !!r?.ports.some(
              (p) =>
                p.name.startsWith('FastEthernet0/0.10') &&
                p.vlan === 10 &&
                p.ipAddress === '192.168.10.1' &&
                p.subnetMask === '255.255.255.0'
            )
          },
        },
        {
          id: 'v-r1-subint-11',
          label: 'Fa0/0.11 dot1Q 11 & IP 192.168.11.1/24',
          deviceHint: 'R1',
          hintText: 'interface fa0/0.11 -> encapsulation dot1q 11 -> ip address 192.168.11.1 255.255.255.0',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            return !!r?.ports.some(
              (p) =>
                p.name.startsWith('FastEthernet0/0.11') &&
                p.vlan === 11 &&
                p.ipAddress === '192.168.11.1' &&
                p.subnetMask === '255.255.255.0'
            )
          },
        },
      ],
      closeFeedback:
        'Almost there! Check that FastEthernet0/0 is "no shutdown" and both .10 and .11 subinterfaces have encapsulation dot1Q set before their IP addresses.',
      successFeedback:
        'Excellent! Router-on-a-stick subinterfaces are fully active. Next, configure the DHCP pools for the PCs and IP Phones!',
      solutionCli:
        '! On R1\nenable\nconfigure terminal\ninterface fa0/0\n no shutdown\nexit\ninterface fa0/0.10\n encapsulation dot1q 10\n ip address 192.168.10.1 255.255.255.0\nexit\ninterface fa0/0.11\n encapsulation dot1q 11\n ip address 192.168.11.1 255.255.255.0\nexit',
    },
    {
      id: 'voice-stage-2',
      stageNumber: 2,
      title: 'Dual DHCP Pools & Option 150',
      subtitle: 'Configure PC Data & IP Phone Voice Pools',
      primaryDeviceId: 'voice-r1',
      mentorIntro:
        'IP phones need an IP address AND a TFTP server address pointing to CallManager Express. Create two DHCP pools on R1: "data" for PCs (192.168.10.0/24) and "voice" for IP phones (192.168.11.0/24) with "option 150 ip 192.168.11.1".',
      sideRequirements:
        'DHCP Pools on R1:\n• Pool "data":\n  - network 192.168.10.0 255.255.255.0\n  - default-router 192.168.10.1\n• Pool "voice":\n  - network 192.168.11.0 255.255.255.0\n  - default-router 192.168.11.1\n  - option 150 ip 192.168.11.1',
      curiousKidAnalogy: {
        hook: 'Option 150 is the phone\'s school map!',
        analogy:
          'When an IP phone turns on, DHCP gives it a room number (IP address) AND Option 150 gives it a map to the Principal\'s office (the CallManager router). Without Option 150, the phone has an address but doesn\'t know who to call for instructions!',
        simpleTruth:
          'DHCP Option 150 provides the TFTP server IPv4 address from which Cisco IP phones download configuration files and firmware.',
      },
      tasks: [
        {
          id: 'v-dhcp-data',
          label: 'DHCP Pool "data" (192.168.10.0/24, gateway 192.168.10.1)',
          deviceHint: 'R1',
          hintText: 'ip dhcp pool data -> network 192.168.10.0 255.255.255.0 -> default-router 192.168.10.1',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            return !!r?.config.dhcpPools?.some(
              (p) =>
                p.name.toLowerCase() === 'data' &&
                p.network === '192.168.10.0' &&
                p.defaultRouter === '192.168.10.1'
            )
          },
        },
        {
          id: 'v-dhcp-voice',
          label: 'DHCP Pool "voice" with Option 150 (192.168.11.1)',
          deviceHint: 'R1',
          hintText: 'ip dhcp pool voice -> network 192.168.11.0 255.255.255.0 -> default-router 192.168.11.1 -> option 150 ip 192.168.11.1',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            return !!r?.config.dhcpPools?.some(
              (p) =>
                p.name.toLowerCase() === 'voice' &&
                p.network === '192.168.11.0' &&
                p.tftpServer === '192.168.11.1'
            )
          },
        },
      ],
      closeFeedback:
        'Check your DHCP pool names and Option 150. In "ip dhcp pool voice", did you enter "option 150 ip 192.168.11.1"?',
      successFeedback:
        'Great job! Both DHCP pools are active and Option 150 is configured. Now activate Cisco CallManager Express!',
      solutionCli:
        '! On R1\nenable\nconfigure terminal\nip dhcp pool data\n network 192.168.10.0 255.255.255.0\n default-router 192.168.10.1\nexit\nip dhcp pool voice\n network 192.168.11.0 255.255.255.0\n default-router 192.168.11.1\n option 150 ip 192.168.11.1\nexit',
    },
    {
      id: 'voice-stage-3',
      stageNumber: 3,
      title: 'Cisco CallManager Express (CME)',
      subtitle: 'Telephony Service, Auto-Assign, and Extensions',
      primaryDeviceId: 'voice-r1',
      mentorIntro:
        'Now activate CallManager Express! Under "telephony-service", set max-ephones and max-dn, bind "ip source-address 192.168.11.1 port 2000", and enable "auto assign 1 to 2". Then create ephone-dn 1 (number 101) and ephone-dn 2 (number 102).',
      sideRequirements:
        'Telephony Service on R1:\n• telephony-service\n  - max-ephones 2 (or higher)\n  - max-dn 2 (or higher)\n  - ip source-address 192.168.11.1 port 2000\n  - auto assign 1 to 2\n• ephone-dn 1:\n  - number 101\n• ephone-dn 2:\n  - number 102',
      curiousKidAnalogy: {
        hook: 'The phone switchboard operator!',
        analogy:
          'CallManager Express is the digital operator living inside the router. It answers when phones pick up, dials the extension, rings the other phone, and connects the audio conversation!',
        simpleTruth:
          'Cisco CallManager Express (CME) provides call processing and PBX features directly on Cisco integrated services routers using SCCP (Skinny) on port 2000.',
      },
      tasks: [
        {
          id: 'v-cme-service',
          label: 'telephony-service source-address 192.168.11.1 port 2000',
          deviceHint: 'R1',
          hintText: 'telephony-service -> max-ephones 2 -> max-dn 2 -> ip source-address 192.168.11.1 port 2000',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            const tel = r?.config.telephony
            return tel?.sourceIp === '192.168.11.1' && (tel?.port === 2000 || !tel?.port) && (tel?.maxEphones ?? 0) >= 2 && (tel?.maxDn ?? 0) >= 2
          },
        },
        {
          id: 'v-cme-auto-assign',
          label: 'auto assign 1 to 2 enabled in telephony-service',
          deviceHint: 'R1',
          hintText: 'telephony-service -> auto assign 1 to 2',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            return !!r?.config.telephony?.autoAssign
          },
        },
        {
          id: 'v-cme-dn',
          label: 'ephone-dn 1 (ext 101) & ephone-dn 2 (ext 102)',
          deviceHint: 'R1',
          hintText: 'ephone-dn 1 -> number 101, ephone-dn 2 -> number 102',
          isDone: (devices) => {
            const r = devices.find((d) => d.id === 'voice-r1')
            const dns = r?.config.telephony?.directoryNumbers || []
            return dns.some((d) => d.number === '101') && dns.some((d) => d.number === '102')
          },
        },
      ],
      closeFeedback:
        'CME is almost ready! Verify "ip source-address 192.168.11.1 port 2000", "auto assign 1 to 2", and that ephone-dn 1 has number 101 and ephone-dn 2 has number 102.',
      successFeedback:
        'CME service is online! Now configure Switch SW1 so voice frames are prioritized and tagged into VLAN 11.',
      solutionCli:
        '! On R1\nenable\nconfigure terminal\ntelephony-service\n max-ephones 2\n max-dn 2\n ip source-address 192.168.11.1 port 2000\n auto assign 1 to 2\nexit\nephone-dn 1\n number 101\nexit\nephone-dn 2\n number 102\nexit',
    },
    {
      id: 'voice-stage-4',
      stageNumber: 4,
      title: 'Switch Voice & Data VLANs',
      subtitle: 'VLAN 10, VLAN 11, Trunk Gi0/1, Access + Voice Fa0/1-2',
      primaryDeviceId: 'voice-sw1',
      mentorIntro:
        'Switch SW1 connects everything together. Create VLAN 10 (data) and VLAN 11 (voice). Configure Gi0/1 as an 802.1Q trunk. Then configure Fa0/1 and Fa0/2 with "switchport mode access", "switchport access vlan 10", "switchport voice vlan 11", and "spanning-tree portfast".',
      sideRequirements:
        'Configuration on SW1:\n• vlan 10 name data\n• vlan 11 name voice\n• interface Gi0/1: switchport mode trunk\n• interface range Fa0/1 - 2:\n  - switchport mode access\n  - switchport access vlan 10\n  - switchport voice vlan 11\n  - spanning-tree portfast',
      curiousKidAnalogy: {
        hook: 'Two devices plugged into one switchport!',
        analogy:
          'A Cisco IP phone has a mini 3-port switch inside! The PC plugs into the phone, and the phone plugs into the wall. The switch port tells the phone: "Talk to me on Voice VLAN 11, and pass your PC\'s traffic to me on Data VLAN 10!"',
        simpleTruth:
          'A switchport with a voice VLAN allows untagged PC data frames on the access VLAN while accepting 802.1Q tagged frames from the IP phone on the voice VLAN with 802.1p CoS priority.',
      },
      tasks: [
        {
          id: 'v-sw-vlans',
          label: 'VLAN 10 and VLAN 11 created on SW1',
          deviceHint: 'SW1',
          hintText: 'vlan 10 -> exit -> vlan 11 -> exit',
          isDone: (devices) => {
            const sw = devices.find((d) => d.id === 'voice-sw1')
            return !!sw?.config.vlans?.some((v) => v.id === 10) && !!sw?.config.vlans?.some((v) => v.id === 11)
          },
        },
        {
          id: 'v-sw-trunk',
          label: 'Interface Gi0/1 configured as 802.1Q Trunk',
          deviceHint: 'SW1',
          hintText: 'interface GigabitEthernet0/1 -> switchport mode trunk',
          isDone: (devices) => {
            const sw = devices.find((d) => d.id === 'voice-sw1')
            const p = sw?.ports.find((port) => port.shortName === 'Gi0/1' || port.name === 'GigabitEthernet0/1')
            return p?.portMode === 'trunk'
          },
        },
        {
          id: 'v-sw-voice-ports',
          label: 'Fa0/1 & Fa0/2: Access VLAN 10 + Voice VLAN 11',
          deviceHint: 'SW1',
          hintText: 'interface range fa0/1 - 2 -> switchport access vlan 10 -> switchport voice vlan 11',
          isDone: (devices) => {
            const sw = devices.find((d) => d.id === 'voice-sw1')
            const p1 = sw?.ports.find((p) => p.shortName === 'Fa0/1')
            const p2 = sw?.ports.find((p) => p.shortName === 'Fa0/2')
            return p1?.vlan === 10 && p1?.voiceVlan === 11 && p2?.vlan === 10 && p2?.voiceVlan === 11
          },
        },
      ],
      closeFeedback:
        'Check SW1 ports: make sure Gi0/1 is in trunk mode ("switchport mode trunk") and both Fa0/1 and Fa0/2 have "switchport access vlan 10" AND "switchport voice vlan 11".',
      successFeedback:
        'Switch configuration complete! The voice trunk and access ports are ready for phone registration!',
      solutionCli:
        '! On SW1\nenable\nconfigure terminal\nvlan 10\n name data\nexit\nvlan 11\n name voice\nexit\ninterface gi0/1\n switchport mode trunk\nexit\ninterface range fa0/1 - 2\n switchport mode access\n switchport access vlan 10\n switchport voice vlan 11\n spanning-tree portfast\nexit',
    },
    {
      id: 'voice-stage-5',
      stageNumber: 5,
      title: 'Live Registration & Verification',
      subtitle: 'Verify IP Phones 101 & 102 Registered with CME',
      primaryDeviceId: 'voice-phone1',
      mentorIntro:
        'The moment of truth! With trunking, voice VLANs, Option 150, and CME in place, both Cisco 7960 IP phones discover CallManager Express, lease voice IP addresses (192.168.11.x), and receive their extensions (101 and 102). Click "Check Work" to verify registration!',
      sideRequirements:
        'Verification Checklist:\n• IP-Phone-1 registered with Extension 101\n• IP-Phone-2 registered with Extension 102\n• Both phones leased addresses in the 192.168.11.0/24 subnet\n• Status shows "Registered" with CME router R1',
      curiousKidAnalogy: {
        hook: 'Dial 102 and hear it ring!',
        analogy:
          'When the display on IP-Phone-1 lights up showing "101" and IP-Phone-2 displays "102", the VoIP system is complete! You can pick up the receiver, dial 102, and hear the clear audio ring.',
        simpleTruth:
          'Telephony registration occurs when an IP phone successfully contacts its TFTP server, parses its XML config, and establishes an active SCCP/SIP session with the CallManager.',
      },
      tasks: [
        {
          id: 'v-reg-phone1',
          label: 'IP-Phone-1 registered with Extension 101',
          deviceHint: 'IP-Phone-1',
          hintText: 'Verify SW1 Fa0/1 has voice vlan 11 and R1 CME auto-assign is active',
          isDone: (devices, links) => {
            const regs = getPhoneRegistrations(devices, links)
            return regs.some((r) => r.deviceId === 'voice-phone1' && r.registered && r.extension === '101')
          },
        },
        {
          id: 'v-reg-phone2',
          label: 'IP-Phone-2 registered with Extension 102',
          deviceHint: 'IP-Phone-2',
          hintText: 'Verify SW1 Fa0/2 has voice vlan 11 and R1 CME auto-assign is active',
          isDone: (devices, links) => {
            const regs = getPhoneRegistrations(devices, links)
            return regs.some((r) => r.deviceId === 'voice-phone2' && r.registered && r.extension === '102')
          },
        },
      ],
      closeFeedback:
        'Phones are not registered yet. Double check that:\n1. R1 Fa0/0 is "no shutdown"\n2. Subinterface Fa0/0.11 has IP 192.168.11.1\n3. DHCP pool "voice" has "option 150 ip 192.168.11.1"\n4. SW1 Gi0/1 is trunk and Fa0/1-2 have "switchport voice vlan 11"',
      successFeedback:
        'CONGRATULATIONS! BOTH IP PHONES ARE REGISTERED! IP-Phone-1 has Extension 101 and IP-Phone-2 has Extension 102. You have successfully designed and configured CCNA2 Lab 4: Voice VLAN & IP Telephony from scratch!',
      solutionCli:
        '! Verification commands on R1\nshow telephony-service ephone-dn\nshow ip dhcp binding\nshow ip interface brief',
    },
  ]
}

function getQuestStages(questId: QuestLabId = 'predicted-2026'): QuestStage[] {
  if (questId === 'voice-telephony') return getVoiceTelephonyStages()
  return getPredicted2026Stages()
}

/* ==========================================================================
   MIDTERM QUEST STORE IMPLEMENTATION
   ========================================================================== */

export const useMidtermQuestStore = create<MidtermQuestState>((set, get) => ({
  active: false,
  questId: 'predicted-2026',
  currentStageIndex: 0,
  activeDeviceId: 'pred-sw1',
  mentorMessage: '',
  mentorMood: 'encouraging',
  hintLevel: 0,
  showCuriousKid: false,
  showSideReqs: false,
  backup: null,
  lastTrafficTestStatus: 'idle',
  completedStages: {},

  startQuest: (labId = 'predicted-2026') => {
    // 1. Close any existing open modals / training / academy dialogs
    if (useActivityStore.getState().session) useActivityStore.getState().exit()
    if (useTrainingStore.getState().active) useTrainingStore.getState().exit()
    useAcademyStore.getState().closeAcademy()
    useWorkspaceStore.setState({ dialog: null })

    // 2. Backup user workspace
    const net = useNetworkStore.getState()
    const ws = useWorkspaceStore.getState()
    const isAlreadyActive = get().active
    const backup: MidtermQuestBackup =
      isAlreadyActive && get().backup
        ? get().backup!
        : structuredClone({
            devices: net.devices,
            links: net.links,
            annotations: net.annotations,
            deviceWindows: net.deviceWindows,
            fileName: ws.fileName,
          })

    // 3. Load the target exam lab
    let labBundle: ExamLabBundle
    if (labId === 'midterm-2024') {
      labBundle = getMidterm2024Lab()
    } else if (labId === 'final-2025') {
      labBundle = getFinal2025GroupALab()
    } else if (labId === 'voice-telephony') {
      labBundle = getVoiceTelephonyLab()
    } else {
      labBundle = getPredictedMidterm2026Lab()
    }

    net.loadLab(labBundle.devices, labBundle.links, labBundle.annotations)
    useNetworkStore.setState({ deviceWindows: [], commandEvents: [] })
    useWorkspaceStore.setState({ past: [], future: [], fileName: labBundle.title })
    ws.setTool('select')
    ws.command('fit-topology')

    const stages = getQuestStages(labId)
    const firstStage = stages[0]

    set({
      active: true,
      questId: labId,
      currentStageIndex: 0,
      activeDeviceId: firstStage.primaryDeviceId,
      mentorMessage: firstStage.mentorIntro,
      mentorMood: 'encouraging',
      hintLevel: 0,
      showCuriousKid: false,
      showSideReqs: false,
      backup,
      lastTrafficTestStatus: 'idle',
      completedStages: {},
    })
  },

  exitQuest: () => {
    const backup = get().backup
    set({ active: false, backup: null })

    if (backup) {
      useNetworkStore.getState().loadLab(backup.devices, backup.links, backup.annotations)
      useNetworkStore.setState({ deviceWindows: backup.deviceWindows, commandEvents: [] })
      useWorkspaceStore.setState({
        fileName: backup.fileName,
        past: [],
        future: [],
      })
      useWorkspaceStore.getState().setTool('select')
      useWorkspaceStore.getState().command('fit-topology')
    }
  },

  setQuestId: (questId) => {
    get().startQuest(questId)
  },

  goToStage: (index) => {
    const stages = getQuestStages(get().questId)
    const target = stages[index]
    if (!target) return

    set({
      currentStageIndex: index,
      activeDeviceId: target.primaryDeviceId,
      mentorMessage: target.mentorIntro,
      mentorMood: 'encouraging',
      hintLevel: 0,
      showCuriousKid: false,
      showSideReqs: false,
    })
  },

  nextStage: () => {
    const { currentStageIndex, questId } = get()
    const stages = getQuestStages(questId)
    if (currentStageIndex < stages.length - 1) {
      get().goToStage(currentStageIndex + 1)
    }
  },

  prevStage: () => {
    const { currentStageIndex } = get()
    if (currentStageIndex > 0) {
      get().goToStage(currentStageIndex - 1)
    }
  },

  setActiveDeviceId: (deviceId) => {
    set({ activeDeviceId: deviceId })
  },

  checkStageWork: () => {
    const { currentStageIndex, questId } = get()
    const stages = getQuestStages(questId)
    const stage = stages[currentStageIndex]
    if (!stage) return

    const net = useNetworkStore.getState()
    const tasks = stage.tasks
    const completedCount = tasks.filter((t) => t.isDone(net.devices, net.links)).length
    const allDone = completedCount === tasks.length

    const findings = questId === 'predicted-2026' ? diagnoseStageInvariants(stage.stageNumber, net.devices, net.links) : []
    const firstFailure = findings.find((f) => !f.passed)

    if (allDone) {
      set((state) => ({
        mentorMessage: stage.successFeedback,
        mentorMood: 'celebrating',
        completedStages: {
          ...state.completedStages,
          [stage.id]: true,
        },
      }))
    } else if (firstFailure) {
      set({
        mentorMessage: firstFailure.diagnosis,
        mentorMood: 'close',
      })
    } else if (completedCount > 0) {
      set({
        mentorMessage: stage.closeFeedback,
        mentorMood: 'close',
      })
    } else {
      set({
        mentorMessage:
          'Try reading the side requirements to solve this question! I will give you a moment to look at the topology and figure it out.',
        mentorMood: 'thinking',
      })
    }
  },

  testTraffic: () => {
    const net = useNetworkStore.getState()
    const stu1 = net.devices.find((d) => d.id === 'pred-pc-stu1')
    const tch1 = net.devices.find((d) => d.id === 'pred-pc-tch1')

    if (!stu1 || !tch1) {
      set({
        mentorMessage: 'Cannot find Student-A1 or Teacher-B1 on the canvas to test traffic.',
        mentorMood: 'tip',
      })
      return
    }

    set({ lastTrafficTestStatus: 'pending' })
    // Ping default gateway and teacher PC
    net.sendPing(stu1.id, '10.10.10.1')
    setTimeout(() => {
      net.sendPing(stu1.id, '10.10.10.131')
      setTimeout(() => {
        const results = useNetworkStore.getState().pingResults
        const hasSuccess = results.some(
          (r) =>
            r.sourceDeviceId === 'pred-pc-stu1' &&
            (r.targetIp === '10.10.10.131' || r.targetIp === '10.10.10.1') &&
            r.status === 'successful'
        )

        if (hasSuccess) {
          set({
            lastTrafficTestStatus: 'success',
            mentorMessage:
              'Spot on! The packet reached across the router and returned successfully. Full marks on Dr. Reben Kurda\'s verification check!',
            mentorMood: 'celebrating',
          })
          get().checkStageWork()
        } else {
          set({
            lastTrafficTestStatus: 'failed',
            mentorMessage:
              'Hmm, quite close! But the ping dropped. Make sure your router subinterfaces have "no shutdown" on Gi0/0 and 802.1Q trunks are active between switches.',
            mentorMood: 'close',
          })
        }
      }, 600)
    }, 400)
  },

  requestHint: () => {
    const { hintLevel, currentStageIndex, questId } = get()
    const stages = getQuestStages(questId)
    const stage = stages[currentStageIndex]
    if (!stage) return

    const nextLevel = Math.min(hintLevel + 1, 3)
    let message = ''
    const mood: MentorMood = 'tip'

    if (nextLevel === 1) {
      message = `Dr. Kurda's Exam Tip: "${stage.tasks[0]?.hintText || 'Inspect your port and VLAN settings.'}"`
    } else if (nextLevel === 2) {
      message = `Try reading the side requirements to solve this question:\n${stage.sideRequirements}`
    } else {
      message = `Here are the exact Cisco CLI commands for this stage. Try typing them into the terminal on the right:\n\n${stage.solutionCli}`
    }

    set({
      hintLevel: nextLevel,
      mentorMessage: message,
      mentorMood: mood,
    })
  },

  toggleCuriousKid: () => {
    set((state) => ({ showCuriousKid: !state.showCuriousKid }))
  },

  toggleSideReqs: () => {
    set((state) => ({ showSideReqs: !state.showSideReqs }))
  },

  setMentorSpeech: (message, mood = 'encouraging') => {
    set({ mentorMessage: message, mentorMood: mood })
  },
}))

export { getPredicted2026Stages, getVoiceTelephonyStages, getQuestStages }
