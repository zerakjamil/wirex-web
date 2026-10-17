import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'

function router() {
  const device = createDevice('router', 0, 0)
  useNetworkStore.getState().loadLab([device], [])
  const cli = (line: string) => useNetworkStore.getState().executeIosCommand(device.id, line)
  cli('enable'); cli('configure terminal')
  const current = () => useNetworkStore.getState().devices.find(d => d.id === device.id)!
  return { cli, current }
}

test('unsupported or malformed routing processes do not enter router configuration', () => {
  for (const command of ['router', 'router banana', 'router ospf', 'router ospf 0', 'router ospf 65536']) {
    const { cli, current } = router()
    assert.match(cli(command), /%/)
    assert.equal(current().currentCliMode, 'config')
  }
})

test('RIP rejects OSPF statements without modifying either protocol configuration', () => {
  const { cli, current } = router()
  assert.equal(cli('router rip'), '')
  assert.match(cli('network 10.0.0.0 0.255.255.255 area 0'), /%/)
  assert.equal(current().config.ospfNetworks?.length ?? 0, 0)
  assert.equal(cli('network 10.0.0.0'), '')
  assert.deepEqual(current().config.ripNetworks, ['10.0.0.0'])
  assert.doesNotMatch(cli('do show running-config'), /version 2|no auto-summary/)
})

test('OSPF requires valid network wildcard and area and deduplicates valid configuration', () => {
  const { cli, current } = router()
  cli('router ospf 1')
  for (const command of ['network', 'network 10.0.0.0', 'network banana 0.0.0.255 area 0', 'network 10.0.0.0 banana area 0', 'network 10.0.0.0 0.0.0.255 area banana', 'network 10.0.0.0 0.0.0.255 area -1']) {
    assert.match(cli(command), /%/)
    assert.equal(current().config.ospfNetworks?.length ?? 0, 0)
    assert.equal(current().config.ripNetworks?.length ?? 0, 0)
  }
  cli('network 10.0.0.0 0.0.0.255 area 0')
  cli('network 10.0.0.0 0.0.0.255 area 0')
  assert.deepEqual(current().config.ospfNetworks, [{ network: '10.0.0.0', wildcard: '0.0.0.255', area: 0 }])
})

test('routing controls cannot silently succeed when their behavior is absent', () => {
  const { cli } = router()
  cli('router ospf 1')
  for (const command of ['version 2', 'no auto-summary']) {
    assert.match(cli(command), /not implemented|not simulated|not supported/i)
  }
})
