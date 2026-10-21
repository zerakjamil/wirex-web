import test from 'node:test'
import assert from 'node:assert/strict'
import { useNetworkStore } from './networkStore'
import { useTrainingStore, evaluateLesson, hasValidTrainingReply } from './trainingStore'
import { examTaskIds } from '@/simulator/trainingLabs'

const common = ['enable', 'configure terminal', 'vlan 10', 'name Sales', 'exit', 'vlan 20', 'name Management', 'exit', 'vlan 30', 'name Admin', 'exit']

function configureExam() {
  const run = (id: string, commands: string[]) => {
    for (const command of commands) useNetworkStore.getState().executeIosCommand(id, command)
  }
  run('exam-sw-a', [
    ...common,
    'interface range fa0/1-2', 'switchport mode access', 'switchport access vlan 10', 'exit',
    'interface fa0/3', 'switchport mode access', 'switchport access vlan 20', 'exit',
    'interface fa0/4', 'switchport mode access', 'switchport access vlan 30', 'exit',
    'interface range gi0/1-2', 'switchport mode trunk', 'channel-group 1 mode active', 'exit',
    'interface fa0/24', 'switchport mode trunk', 'exit',
  ])
  run('exam-sw-b', [
    ...common,
    'interface fa0/1', 'switchport mode access', 'switchport access vlan 10', 'exit',
    'interface fa0/3', 'switchport mode access', 'switchport access vlan 20', 'exit',
    'interface range gi0/1-2', 'switchport mode trunk', 'channel-group 1 mode active', 'exit',
  ])
  run('exam-router', [
    'enable', 'configure terminal', 'interface gi0/0', 'no shutdown', 'exit',
    'interface gi0/0.10', 'encapsulation dot1q 10', 'ip address 192.168.10.1 255.255.255.0', 'exit',
    'interface gi0/0.20', 'encapsulation dot1q 20', 'ip address 192.168.20.1 255.255.255.0', 'exit',
    'interface gi0/0.30', 'encapsulation dot1q 30', 'ip address 192.168.30.1 255.255.255.0', 'exit',
  ])
  run('exam-sw-a', ['spanning-tree vlan 10 root primary', 'spanning-tree vlan 20 root primary', 'spanning-tree vlan 30 root primary'])
}

test('practical exam grades 14 live checkpoints and a cross-VLAN ping', () => {
  useTrainingStore.getState().start('exam', 'exam')

  const initial = evaluateLesson('exam', useNetworkStore.getState().devices, useNetworkStore.getState().links)
  assert.equal(initial.length, examTaskIds.length)
  assert.ok(initial.every(check => !check.complete), 'a fresh exam must start at zero')

  configureExam()

  const configured = evaluateLesson('exam', useNetworkStore.getState().devices, useNetworkStore.getState().links)
  assert.equal(configured.filter(check => check.id !== 'exam-traffic' && check.complete).length, examTaskIds.length - 1)
  assert.equal(configured.find(check => check.id === 'exam-traffic')?.complete, false)

  useTrainingStore.getState().testTraffic()
  for (let tick = 0; tick < 400 && useNetworkStore.getState().inFlightPackets.length; tick += 1) useNetworkStore.getState().stepSimulation()
  assert.equal(hasValidTrainingReply(), true)

  useTrainingStore.getState().check()
  assert.equal(useTrainingStore.getState().progress.exam?.score, examTaskIds.length)
  assert.equal(useTrainingStore.getState().progress.exam?.maxScore, examTaskIds.length)
  assert.equal(useTrainingStore.getState().progress.exam?.completed, true)

  useTrainingStore.getState().start('exam', 'exam', true)
  assert.equal(useTrainingStore.getState().progress.exam?.score, undefined)
  assert.equal(useTrainingStore.getState().progress.exam?.completed, false)
  assert.equal(useTrainingStore.getState().checked, false)

  useTrainingStore.getState().exit()
})
