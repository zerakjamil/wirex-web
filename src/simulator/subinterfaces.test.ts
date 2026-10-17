import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { createPingPackets, stepSimulationTick } from './engine'
import { diagnoseConnection } from './diagnostics'
import { allocateDhcpLease } from './dhcp'
import { getPhysicalPorts } from './physicalHardware'

function lab() {
  const router = createDevice('router', 0, 0, '2811'), sw = createDevice('switch', 200, 0), a = createDevice('pc', 200, 200), b = createDevice('pc', 400, 200)
  sw.config.portfastDefault = true
  useNetworkStore.getState().loadLab([router, sw, a, b], [])
  const state = useNetworkStore.getState()
  state.connectPorts(router.id, router.ports[0].id, sw.id, sw.ports[0].id, 'straight')
  state.connectPorts(a.id, a.ports[0].id, sw.id, sw.ports[1].id, 'straight')
  state.connectPorts(b.id, b.ports[0].id, sw.id, sw.ports[2].id, 'straight')
  const cli = (id: string, commands: string[]) => commands.forEach(command => useNetworkStore.getState().executeIosCommand(id, command))
  cli(router.id, ['enable','configure terminal','interface fa0/0','no shutdown','exit','interface fa0/0.10','encapsulation dot1q 10','ip address 10.0.10.1 255.255.255.0','exit','interface fa0/0.20','encapsulation dot1q 20','ip address 10.0.20.1 255.255.255.0','end'])
  cli(sw.id, ['enable','configure terminal','vlan 10','exit','vlan 20','exit','interface fa0/1','switchport mode trunk','switchport trunk allowed vlan 10,20','exit','interface fa0/2','switchport access vlan 10','exit','interface fa0/3','switchport access vlan 20','end'])
  useNetworkStore.setState(state => ({ devices: state.devices.map(d => d.id === a.id || d.id === b.id ? { ...d, config: { ...d.config, defaultGateway: d.id === a.id ? '10.0.10.1' : '10.0.20.1' }, ports: d.ports.map((p,i)=> i===0 ? {...p,ipAddress:d.id===a.id?'10.0.10.2':'10.0.20.2',subnetMask:'255.255.255.0'}:p) }:d) }))
  return { router, sw, a, b }
}
test('IOS subinterface commands create distinct VLAN interfaces sharing a physical parent', () => {
  const { router } = lab()
  const saved = useNetworkStore.getState().devices.find(d => d.id === router.id)!
  assert.equal(saved.ports.find(p => p.name === 'FastEthernet0/0.10')?.ipAddress, '10.0.10.1')
  assert.equal(saved.ports.find(p => p.name === 'FastEthernet0/0.20')?.status, 'up', JSON.stringify(saved.ports))
  assert.equal(saved.ports[0].ipAddress, undefined)
  assert.ok(getPhysicalPorts(saved).every(port => !port.name.includes('.')))
})
test('router on a stick forwards real echo requests and replies across tagged VLANs', () => {
  const { a, b, router } = lab()
  let { devices } = useNetworkStore.getState()
  const { links } = useNetworkStore.getState()
  let packets = createPingPackets(devices.find(d=>d.id===a.id)!, devices, links, '10.0.20.2')
  let replied = false, tagged = false
  for (let tick=0;tick<250&&packets.length;tick++) {
    tagged ||= packets.some(p => p.fromDeviceId===router.id && p.vlanId===20)
    const result=stepSimulationTick(devices,links,packets); devices=result.updatedDevices
    replied ||= packets.some(p=>p.toDeviceId===a.id&&p.progress>=0.75&&p.pdu.payload.icmpType==='echo-reply')
    packets=result.newInFlightPackets
  }
  assert.equal(tagged,true)
  assert.equal(replied,true)
  assert.equal(packets.length,0)
  assert.ok(devices.find(d=>d.id===b.id)!.arpTable.length)
})
test('a valid router on a stick lab is not diagnosed as a same-VLAN or subnet error', () => {
  const { a, b } = lab()
  const { devices, links } = useNetworkStore.getState()
  assert.deepEqual(diagnoseConnection(devices, links, a.id, b.id), [])
})
test('DHCP uses the receiving VLAN subinterface to choose its pool', () => {
  const { a, router } = lab()
  useNetworkStore.getState().updateDeviceConfig(router.id, { dhcpPools: [{ name: 'Students', network: '10.0.10.0', mask: '255.255.255.0', defaultRouter: '10.0.10.1' }, { name: 'Staff', network: '10.0.20.0', mask: '255.255.255.0', defaultRouter: '10.0.20.1' }] })
  const { devices, links } = useNetworkStore.getState()
  assert.equal(allocateDhcpLease(devices, links, a.id).lease?.gateway, '10.0.10.1')
})
test('subinterface mode applies ACLs and permits switching directly to another interface', () => {
  const { router } = lab()
  const cli = (command: string) => useNetworkStore.getState().executeIosCommand(router.id, command)
  cli('configure terminal'); cli('interface fa0/0.10')
  assert.equal(cli('ip access-group 101 in'), '')
  assert.equal(cli('interface fa0/0.20'), '')
  const saved = useNetworkStore.getState().devices.find(d => d.id === router.id)!
  assert.equal(saved.ports.find(p => p.dot1qVlan === 10)?.inboundAcl, '101')
  assert.equal(saved.activeInterface, saved.ports.find(p => p.dot1qVlan === 20)?.id)
})
