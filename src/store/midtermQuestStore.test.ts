import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useMidtermQuestStore, getPredicted2026Stages, getQuestStages } from './midtermQuestStore'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'

import { createDevice } from '../simulator/deviceFactory'

test('midterm quest stages have 5 bite-sized levels with mentor quotes and analogies', () => {
  const stages = getPredicted2026Stages()
  assert.equal(stages.length, 5)

  // Verify Stage 1 has the Dr. Kurda mentor intro quote
  const s1 = stages[0]
  assert.ok(s1.mentorIntro.includes('Dr. Reben Kurda used this exact same question'))
  assert.ok(s1.mentorIntro.includes('I will give you a moment to look at the canvas and figure it out'))
  assert.ok(s1.closeFeedback.includes('Hmm, quite close! But seems like you have missed that part'))
  assert.ok(s1.sideRequirements.includes('Dr. Reben strictly tests exact VLAN naming'))
  assert.ok(s1.curiousKidAnalogy.hook.includes('Why do we need VLANs?'))

  // Verify Stage 2 has PortFast and 30-second STP bypass
  const s2 = stages[1]
  assert.ok(s2.sideRequirements.includes('spanning-tree portfast'))
  assert.ok(s2.curiousKidAnalogy.analogy.includes('VIP badge'))

  // Verify Stage 3 has Trunking
  const s3 = stages[2]
  assert.ok(s3.title.includes('Trunk Highway'))
  assert.ok(s3.mentorIntro.includes('Why cannot VLAN 10 traffic cross to SW2 right now?'))

  // Verify Stage 4 has Router-on-a-Stick subinterface rules
  const s4 = stages[3]
  assert.ok(s4.sideRequirements.includes('encapsulation dot1q'))
  assert.ok(s4.tasks.some((t) => t.id === 'r1-sub-10'))

  // Verify Stage 5 has ping verification
  const s5 = stages[4]
  assert.ok(s5.mentorIntro.includes('Ping Teacher-B1 from Student-A1'))
})

test('useMidtermQuestStore startQuest loads lab, sets active, and populates mentor speech', () => {
  useMidtermQuestStore.getState().exitQuest()
  const questStore = useMidtermQuestStore.getState()
  questStore.startQuest('predicted-2026')

  const state = useMidtermQuestStore.getState()
  assert.equal(state.active, true)
  assert.equal(state.questId, 'predicted-2026')
  assert.equal(state.currentStageIndex, 0)
  assert.equal(state.activeDeviceId, 'pred-sw1')
  assert.ok(state.mentorMessage.includes('Dr. Reben Kurda used this exact same question'))

  // Check network store received devices
  const netDevices = useNetworkStore.getState().devices
  assert.ok(netDevices.some((d) => d.id === 'pred-r1'))
  assert.ok(netDevices.some((d) => d.id === 'pred-sw1'))
  assert.ok(netDevices.some((d) => d.id === 'pred-pc-stu1'))
})

test('useMidtermQuestStore provides feedback when tasks are incomplete or close', () => {
  const questStore = useMidtermQuestStore.getState()
  questStore.startQuest('predicted-2026')

  // When initial and no tasks done
  questStore.checkStageWork()
  let state = useMidtermQuestStore.getState()
  assert.ok(
    state.mentorMessage.includes('VLAN 10 is missing') ||
    state.mentorMessage.includes('Try reading the side requirements')
  )

  // Requesting hint level 1 & 2
  questStore.requestHint() // Level 1
  state = useMidtermQuestStore.getState()
  assert.equal(state.hintLevel, 1)
  assert.ok(state.mentorMessage.includes("Dr. Kurda's Exam Tip"))

  questStore.requestHint() // Level 2
  state = useMidtermQuestStore.getState()
  assert.equal(state.hintLevel, 2)
  assert.ok(state.mentorMessage.includes('Try reading the side requirements to solve this question'))
})

test('useMidtermQuestStore navigation switches stages and primary device', () => {
  const questStore = useMidtermQuestStore.getState()
  questStore.startQuest('predicted-2026')

  questStore.nextStage()
  let state = useMidtermQuestStore.getState()
  assert.equal(state.currentStageIndex, 1)
  assert.equal(state.activeDeviceId, 'pred-sw1')

  questStore.goToStage(3) // Stage 4: Router-on-a-stick
  state = useMidtermQuestStore.getState()
  assert.equal(state.currentStageIndex, 3)
  assert.equal(state.activeDeviceId, 'pred-r1')
  assert.ok(state.mentorMessage.includes('Router-on-a-Stick Subinterfaces') || state.mentorMessage.includes('subinterfaces'))

  questStore.prevStage()
  state = useMidtermQuestStore.getState()
  assert.equal(state.currentStageIndex, 2)
})

test('useMidtermQuestStore exitQuest cleanly restores workspace from backup', () => {
  useMidtermQuestStore.getState().exitQuest()
  useMidtermQuestStore.setState({ backup: null, active: false })

  const customDev = createDevice('router', 100, 100)
  customDev.id = 'my-custom-router'
  customDev.name = 'MyRouter'

  useNetworkStore.setState({
    devices: [customDev],
    links: [],
    annotations: [],
    deviceWindows: [],
  })
  useWorkspaceStore.setState({ fileName: 'my-important-lab.pkt' })

  // Launch quest
  useMidtermQuestStore.getState().startQuest('predicted-2026')
  assert.equal(useMidtermQuestStore.getState().active, true)
  assert.ok(useNetworkStore.getState().devices.some((d) => d.id === 'pred-r1'))

  // Exit quest
  useMidtermQuestStore.getState().exitQuest()
  assert.equal(useMidtermQuestStore.getState().active, false)

  // Verify custom lab was restored
  assert.ok(useNetworkStore.getState().devices.some((d) => d.id === 'my-custom-router'))
  assert.equal(useWorkspaceStore.getState().fileName, 'my-important-lab.pkt')
})

test('voice-telephony quest provides unconfigured template and validates live VoIP configuration', () => {
  useMidtermQuestStore.getState().exitQuest()
  const questStore = useMidtermQuestStore.getState()
  questStore.startQuest('voice-telephony')

  const state = useMidtermQuestStore.getState()
  assert.equal(state.active, true)
  assert.equal(state.questId, 'voice-telephony')
  assert.equal(state.currentStageIndex, 0)
  assert.equal(state.activeDeviceId, 'voice-r1')

  const stages = getQuestStages('voice-telephony')
  assert.equal(stages.length, 5)

  // Verify devices are present on canvas and unconfigured
  const devices = useNetworkStore.getState().devices
  const links = useNetworkStore.getState().links
  assert.equal(devices.length, 6)
  assert.equal(links.length, 5)

  const r1 = devices.find((d) => d.id === 'voice-r1')!
  const sw1 = devices.find((d) => d.id === 'voice-sw1')!
  const phone1 = devices.find((d) => d.id === 'voice-phone1')!
  const pc1 = devices.find((d) => d.id === 'voice-pc1')!

  assert.ok(r1 && sw1 && phone1 && pc1)
  assert.equal(r1.ports[0].adminStatus, 'down', 'R1 Fa0/0 must start unconfigured/down')
  assert.equal(sw1.config.vlans?.length, 1, 'SW1 must start with default VLAN 1 only')
  assert.equal(pc1.ports[0].ipAddress, undefined, 'PC-1 must start without static IP')

  // Stage 1 tasks must be uncompleted initially
  assert.equal(stages[0].tasks.every((t) => t.isDone(devices, links)), false)

  // Now execute the student CLI sequence on R1
  const cli = (id: string, ...cmds: string[]) => cmds.forEach((c) => useNetworkStore.getState().executeIosCommand(id, c))
  cli(
    'voice-r1',
    'enable',
    'configure terminal',
    'interface fa0/0',
    'no shutdown',
    'exit',
    'interface fa0/0.10',
    'encapsulation dot1q 10',
    'ip address 192.168.10.1 255.255.255.0',
    'exit',
    'interface fa0/0.11',
    'encapsulation dot1q 11',
    'ip address 192.168.11.1 255.255.255.0',
    'exit'
  )

  const curDevs1 = useNetworkStore.getState().devices
  assert.equal(stages[0].tasks.every((t) => t.isDone(curDevs1, links)), true, 'Stage 1 tasks should be complete')

  // Stage 2: DHCP pools
  cli(
    'voice-r1',
    'ip dhcp pool data',
    'network 192.168.10.0 255.255.255.0',
    'default-router 192.168.10.1',
    'exit',
    'ip dhcp pool voice',
    'network 192.168.11.0 255.255.255.0',
    'default-router 192.168.11.1',
    'option 150 ip 192.168.11.1',
    'exit'
  )
  const curDevs2 = useNetworkStore.getState().devices
  assert.equal(stages[1].tasks.every((t) => t.isDone(curDevs2, links)), true, 'Stage 2 tasks should be complete')

  // Stage 3: CME
  cli(
    'voice-r1',
    'telephony-service',
    'max-ephones 2',
    'max-dn 2',
    'ip source-address 192.168.11.1 port 2000',
    'auto assign 1 to 2',
    'exit',
    'ephone-dn 1',
    'number 101',
    'exit',
    'ephone-dn 2',
    'number 102',
    'exit'
  )
  const curDevs3 = useNetworkStore.getState().devices
  assert.equal(stages[2].tasks.every((t) => t.isDone(curDevs3, links)), true, 'Stage 3 tasks should be complete')

  // Stage 4: SW1
  cli(
    'voice-sw1',
    'enable',
    'configure terminal',
    'vlan 10',
    'name data',
    'exit',
    'vlan 11',
    'name voice',
    'exit',
    'interface gi0/1',
    'switchport mode trunk',
    'exit',
    'interface range fa0/1-2',
    'switchport mode access',
    'switchport access vlan 10',
    'switchport voice vlan 11',
    'spanning-tree portfast',
    'exit'
  )
  const curDevs4 = useNetworkStore.getState().devices
  assert.equal(stages[3].tasks.every((t) => t.isDone(curDevs4, links)), true, 'Stage 4 tasks should be complete')

  // Stage 5: Live registration verification
  assert.equal(stages[4].tasks.every((t) => t.isDone(curDevs4, links)), true, 'Stage 5 verification should be complete')
})
