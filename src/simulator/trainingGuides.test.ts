import test from 'node:test'
import assert from 'node:assert/strict'
import { createTrainingLab, lessonCommands, lessonIds } from './trainingLabs'
import { guideCommandsForDevice, trainingGuides } from './trainingGuides'
import { useNetworkStore } from '../store/networkStore'

test('every training lesson has a complete, device-accurate guide', () => {
  for (const lesson of lessonIds) {
    const guide = trainingGuides[lesson]
    assert.ok(guide.summary.length > 80, lesson)
    assert.ok(guide.topology.length > 0, lesson)
    assert.ok(guide.before.length > 0, lesson)
    assert.ok(guide.steps.length > 0, lesson)
    assert.ok(guide.verify.length > 0, lesson)
    assert.ok(guide.mistakes.length > 0, lesson)
    const lab = createTrainingLab(lesson, 'guided')
    const devices = new Set(lab.devices.map(device => device.id))
    for (const step of guide.steps) {
      assert.ok(step.title.trim(), lesson)
      assert.ok(step.body.trim(), lesson)
      assert.ok(step.commands.length > 0, `${lesson}: ${step.title}`)
      assert.ok(devices.has(step.deviceId), `${lesson}: ${step.deviceId}`)
    }
    useNetworkStore.setState({ devices: structuredClone(lab.devices), links: structuredClone(lab.links) })
    for (const step of guide.steps) {
      for (const command of step.commands) {
        const output = useNetworkStore.getState().executeIosCommand(step.deviceId, command)
        assert.ok(
          !/% (?:Unrecognized|Invalid|Incomplete|Ambiguous|Specify|Unknown|Not enough)/i.test(output),
          `${lesson}/${step.deviceId}: ${command} -> ${output}`,
        )
        if (command === 'show interfaces status') {
          assert.match(output, /Port\s+Name\s+Status/, `${lesson}/${step.deviceId}: ${output}`)
        }
      }
    }
    assert.ok(lessonCommands[lesson].trim(), lesson)
  }
})

test('the LACP guide and full command sheet configure both switch ends', () => {
  const guide = trainingGuides.channel
  const a = guide.steps.find(step => step.deviceId === 'campus-sw-a')
  const b = guide.steps.find(step => step.deviceId === 'campus-sw-b')
  assert.ok(a && b)
  assert.ok(a.commands.includes('channel-group 1 mode active'))
  assert.ok(b.commands.includes('channel-group 1 mode active'))
  assert.ok(a.commands.includes('switchport mode trunk'))
  assert.ok(b.commands.includes('switchport mode trunk'))
  assert.match(guide.summary, /active/)
  assert.ok(guide.mistakes.some(line => /passive on both/i.test(line)))
  assert.ok(guide.verify.some(line => /show etherchannel summary/i.test(line)))

  assert.match(guideCommandsForDevice('channel', 'campus-sw-a'), /channel-group 1 mode active/)
  assert.match(guideCommandsForDevice('channel', 'campus-sw-b'), /channel-group 1 mode active/)
  assert.ok(!guideCommandsForDevice('channel', 'campus-sw-a').includes('! Distribution-B'))

  const channelCommands = lessonCommands.channel
  assert.match(channelCommands, /! Distribution-A/)
  assert.match(channelCommands, /! Distribution-B/)
  assert.equal(channelCommands.match(/channel-group 1 mode active/g)?.length, 2)

  const examCommands = lessonCommands.exam
  assert.match(examCommands, /! Core-SW1/)
  assert.match(examCommands, /! Core-SW2/)
  assert.match(examCommands, /! Edge-R1/)
  assert.match(examCommands, /spanning-tree vlan 30 root primary/)
  assert.equal(examCommands.match(/channel-group 1 mode active/g)?.length, 2)
})
