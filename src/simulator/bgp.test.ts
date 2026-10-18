import test from 'node:test'
import assert from 'node:assert/strict'
import { createDevice } from './deviceFactory'
import { useNetworkStore } from '../store/networkStore'
import { stepSimulationTick, createPingPackets } from './engine'
import { parseIosCommand } from './ios/ciscoParser'
import type { NetworkDevice } from '../types/network'

function lab() {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `bgp-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const clients = [0, 1].map(i => {
    const device = createDevice('pc', i * 300, 200)
    device.id = `bgp-pc${i + 1}`; device.name = device.id
    return device
  })
  useNetworkStore.getState().loadLab([...routers, ...clients], [])
  for (const router of routers) router.ports.slice(0, 2).forEach(port => { port.adminStatus = 'up' })
  useNetworkStore.setState({ devices: [...routers, ...clients] })
  const connect = (left: NetworkDevice, leftPort: number, right: NetworkDevice, rightPort: number) => {
    assert.equal(useNetworkStore.getState().connectPorts(left.id, left.ports[leftPort].id, right.id, right.ports[rightPort].id, 'crossover'), true)
  }
  connect(routers[0], 0, routers[1], 0)
  connect(routers[0], 1, clients[0], 0)
  connect(routers[1], 1, clients[1], 0)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  const wan = ['10.0.12.1', '10.0.12.2']
  const lan = ['192.168.1.1', '192.168.2.1']
  const as = [65001, 65002]
  routers.forEach((router, i) => {
    cli(router.id, 'enable', 'configure terminal',
      `interface ${router.ports[0].shortName}`, `ip address ${wan[i]} 255.255.255.0`, 'no shutdown', 'exit',
      `interface ${router.ports[1].shortName}`, `ip address ${lan[i]} 255.255.255.0`, 'no shutdown', 'exit',
      `router bgp ${as[i]}`, `neighbor ${wan[1 - i]} remote-as ${as[1 - i]}`, `network ${i === 0 ? '192.168.1.0' : '192.168.2.0'} mask 255.255.255.0`, 'end')
  })
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => clients.some(client => client.id === device.id) ? {
      ...device,
      config: { ...device.config, defaultGateway: device.id === clients[0].id ? lan[0] : lan[1] },
      ports: device.ports.map((port, index) => index === 0 ? { ...port, ipAddress: device.id === clients[0].id ? '192.168.1.10' : '192.168.2.10', subnetMask: '255.255.255.0' } : port),
    } : device),
  }))
  return { r1: routers[0], r2: routers[1], pc1: clients[0], pc2: clients[1], cli }
}

function run(ticks = 400) {
  const { links } = useNetworkStore.getState()
  let { devices, inFlightPackets: packets } = useNetworkStore.getState()
  const protocols = new Set<string>()
  const tcpFlags = new Set<string>()
  const reasons: string[] = []
  for (let i = 0; i < ticks; i++) {
    const step = stepSimulationTick(devices, links, packets)
    devices = step.updatedDevices; packets = step.newInFlightPackets
    packets.forEach(p => { protocols.add(p.pdu.protocol); if (p.pdu.payload.bgpTcp) tcpFlags.add(p.pdu.payload.bgpTcp.flags) })
    step.packetDeliveries.forEach(delivery => { if (delivery.reason) reasons.push(delivery.reason) })
    assert.ok(packets.length <= 256)
  }
  useNetworkStore.setState({ devices, inFlightPackets: packets })
  return { devices, links, protocols, reasons, tcpFlags }
}

test('eBGP peers establish, exchange updates and the CLI shows the learned routes', () => {
  const { r1 } = lab()
  assert.equal(useNetworkStore.getState().devices[0].bgp, undefined)
  const { devices, protocols } = run(400)
  assert.ok(protocols.has('BGP'))
  const router = devices.find(d => d.id === r1.id)!
  const route = router.routingTable.find(r => String(r.type) === 'B' && r.network === '192.168.2.0')
  assert.equal(route?.nextHop, '10.0.12.2')
  assert.equal(route?.netmask, '255.255.255.0')
  assert.equal(route?.interfaceName, router.ports[0].name)
  const peer = router.bgp?.peers.find(candidate => candidate.address === '10.0.12.2')
  assert.equal(peer?.state, 'established')
  assert.equal(peer?.remoteAs, 65002)
  assert.equal(peer?.learned.length, 1)
  assert.deepEqual(peer?.learned[0].asPath, [65002])
  assert.match(parseIosCommand(router, 'show ip route').output, /B\s+192\.168\.2\.0.*\[20\/0\].*10\.0\.12\.2/)
  assert.match(parseIosCommand(router, 'show ip bgp summary').output, /BGP router identifier \d+\.\d+\.\d+\.\d+, local AS number 65001/)
  assert.match(parseIosCommand(router, 'show ip bgp summary').output, /10\.0\.12\.2\s+4\s+65002/)
  assert.match(parseIosCommand(router, 'show ip bgp summary').output, /estab|1\s*$/m)
  assert.match(parseIosCommand(router, 'show ip bgp').output, /\*> 192\.168\.2\.0\/24\s+10\.0\.12\.2\s+0\s+0\s+65002 i/)
  assert.match(parseIosCommand(router, 'show ip bgp').output, /\*> 192\.168\.1\.0\/24\s+0\.0\.0\.0\s+0\s+32768 i/)
  assert.match(parseIosCommand(router, 'show ip protocols').output, /Routing Protocol is "bgp 65001"/)
  assert.match(parseIosCommand(router, 'show running-config').output, /router bgp 65001/)
  assert.match(parseIosCommand(router, 'show running-config').output, /neighbor 10\.0\.12\.2 remote-as 65002/)
  assert.match(parseIosCommand(router, 'show running-config').output, /network 192\.168\.1\.0 mask 255\.255\.255\.0/)
})

test('BGP-learned paths carry a real echo reply between the two sites', () => {
  const { pc1 } = lab()
  run(400)
  const { links } = useNetworkStore.getState()
  const { devices } = useNetworkStore.getState()
  let packets = createPingPackets(devices.find(d => d.id === pc1.id)!, devices, links, '192.168.2.10')
  let replied = false
  for (let i = 0; i < 500; i++) {
    const incoming = packets, step = stepSimulationTick(devices, links, packets)
    replied ||= step.packetDeliveries.some(delivery => delivery.status === 'delivered' && delivery.receiverDeviceId === pc1.id && incoming.some(packet => packet.id === delivery.packetId && packet.pdu.payload.icmpType === 'echo-reply'))
    packets = step.newInFlightPackets
  }
  assert.equal(replied, true)
})

test('a remote-AS mismatch resets the session with a notification and blocks the routes', () => {
  const { r1, r2, cli } = lab()
  cli(r2.id, 'enable', 'configure terminal', 'router bgp 65002', 'no neighbor 10.0.12.1', 'neighbor 10.0.12.1 remote-as 65099', 'end')
  const { devices, reasons } = run(400)
  const router = devices.find(d => d.id === r1.id)!
  const middle = devices.find(d => d.id === r2.id)!
  assert.equal(router.routingTable.some(r => String(r.type) === 'B'), false)
  assert.equal(middle.routingTable.some(r => String(r.type) === 'B'), false)
  assert.match(parseIosCommand(middle, 'show ip bgp summary').output, /Last rejected message: BGP AS mismatch/)
  assert.ok(reasons.some(reason => /BGP AS mismatch/.test(reason)))
  assert.ok(reasons.some(reason => /processed BGP notification/.test(reason)))
  assert.equal(router.bgp?.peers.find(candidate => candidate.address === '10.0.12.2')?.state === 'established', false)
})

test('clear ip bgp * resets the session and the peers reconverge', () => {
  const { r1 } = lab()
  run(400)
  let router = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.ok(router.routingTable.some(r => String(r.type) === 'B' && r.network === '192.168.2.0'))
  useNetworkStore.getState().executeIosCommand(r1.id, 'enable')
  assert.match(useNetworkStore.getState().executeIosCommand(r1.id, 'clear ip bgp *'), /BGP sessions cleared/)
  const cleared = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.equal(cleared.routingTable.some(r => String(r.type) === 'B'), false)
  assert.equal(cleared.bgp?.peers.every(peer => peer.state === 'idle' && peer.learned.length === 0), true)
  run(400)
  router = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.ok(router.routingTable.some(r => String(r.type) === 'B' && r.network === '192.168.2.0'))
  assert.equal(router.bgp?.peers.find(candidate => candidate.address === '10.0.12.2')?.state, 'established')
})

test('losing the link withdraws eBGP routes when the hold timer expires', () => {
  const { r1, r2, cli } = lab()
  run(400)
  let router = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.ok(router.routingTable.some(r => String(r.type) === 'B' && r.network === '192.168.2.0'))
  cli(r2.id, 'configure terminal', `interface ${r2.ports[0].shortName}`, 'shutdown', 'end')
  run(3400)
  router = useNetworkStore.getState().devices.find(d => d.id === r1.id)!
  assert.equal(router.routingTable.some(r => String(r.type) === 'B' && r.network === '192.168.2.0'), false)
  assert.equal(router.bgp?.peers.find(candidate => candidate.address === '10.0.12.2')?.state === 'established', false)
})

test('an eBGP chain relays routes with AS-path prepending and loop prevention', () => {
  const routers = [0, 1, 2].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `bgp-chain-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const host = createDevice('pc', 600, 200)
  host.id = 'bgp-chain-pc'; host.name = host.id
  useNetworkStore.getState().loadLab([...routers, host], [])
  for (const router of routers) router.ports.slice(0, 2).forEach(port => { port.adminStatus = 'up' })
  useNetworkStore.setState({ devices: [...routers, host] })
  const connect = (left: NetworkDevice, leftPort: number, right: NetworkDevice, rightPort: number) => {
    assert.equal(useNetworkStore.getState().connectPorts(left.id, left.ports[leftPort].id, right.id, right.ports[rightPort].id, 'crossover'), true)
  }
  connect(routers[0], 0, routers[1], 0)
  connect(routers[1], 1, routers[2], 0)
  connect(routers[2], 1, host, 0)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  cli(routers[0].id, 'enable', 'configure terminal', `interface ${routers[0].ports[0].shortName}`, 'ip address 10.0.1.1 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65101', 'neighbor 10.0.1.2 remote-as 65102', 'network 172.16.1.0 mask 255.255.255.0', 'end')
  cli(routers[1].id, 'enable', 'configure terminal', `interface ${routers[1].ports[0].shortName}`, 'ip address 10.0.1.2 255.255.255.0', 'no shutdown', 'exit',
    `interface ${routers[1].ports[1].shortName}`, 'ip address 10.0.2.2 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65102', 'neighbor 10.0.1.1 remote-as 65101', 'neighbor 10.0.2.3 remote-as 65103', 'end')
  cli(routers[2].id, 'enable', 'configure terminal', `interface ${routers[2].ports[0].shortName}`, 'ip address 10.0.2.3 255.255.255.0', 'no shutdown', 'exit',
    `interface ${routers[2].ports[1].shortName}`, 'ip address 172.16.1.1 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65103', 'neighbor 10.0.2.2 remote-as 65102', 'network 172.16.1.0 mask 255.255.255.0', 'end')
  useNetworkStore.setState(state => ({
    devices: state.devices.map(device => device.id === host.id ? {
      ...device,
      config: { ...device.config, defaultGateway: '172.16.1.1' },
      ports: device.ports.map((port, index) => index === 0 ? { ...port, ipAddress: '172.16.1.10', subnetMask: '255.255.255.0' } : port),
    } : device),
  }))
  const { devices } = run(600)
  const first = devices.find(d => d.id === routers[0].id)!
  const relay = devices.find(d => d.id === routers[1].id)!
  const route = first.routingTable.find(r => String(r.type) === 'B' && r.network === '172.16.1.0')
  assert.equal(route?.nextHop, '10.0.1.2')
  const relayed = first.bgp?.peers.find(candidate => candidate.address === '10.0.1.2')?.learned.find(path => path.network === '172.16.1.0')
  assert.deepEqual(relayed?.asPath, [65102, 65103])
  assert.equal(relay.routingTable.find(r => String(r.type) === 'B' && r.network === '172.16.1.0')?.nextHop, '10.0.2.3')
  const refusals = first.bgp?.peers.find(candidate => candidate.address === '10.0.1.2')?.learned.filter(path => path.asPath.includes(65101)) ?? []
  assert.equal(refusals.length, 0)
})

test('the TCP handshake precedes every session and is visible in the PDU stream', () => {
  const { r1 } = lab()
  const { devices, tcpFlags, reasons } = run(120)
  assert.ok(tcpFlags.has('syn') && tcpFlags.has('synack') && tcpFlags.has('ack'))
  assert.ok(reasons.some(reason => /processed BGP TCP synack/.test(reason)))
  assert.equal(devices.find(d => d.id === r1.id)?.bgp?.peers.find(candidate => candidate.address === '10.0.12.2')?.state, 'established')
})

test('iBGP peers in one AS exchange routes without AS-path prepending and install them at distance 200', () => {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `bgp-ibgp-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const host = createDevice('pc', 600, 200)
  host.id = 'bgp-ibgp-pc'; host.name = host.id
  useNetworkStore.getState().loadLab([...routers, host], [])
  for (const router of routers) router.ports.slice(0, 2).forEach(port => { port.adminStatus = 'up' })
  useNetworkStore.setState({ devices: [...routers, host] })
  assert.equal(useNetworkStore.getState().connectPorts(routers[0].id, routers[0].ports[0].id, routers[1].id, routers[1].ports[0].id, 'crossover'), true)
  assert.equal(useNetworkStore.getState().connectPorts(routers[0].id, routers[0].ports[1].id, host.id, host.ports[0].id, 'straight'), true)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  cli(routers[0].id, 'enable', 'configure terminal', `interface ${routers[0].ports[0].shortName}`, 'ip address 10.0.12.1 255.255.255.0', 'no shutdown', 'exit',
    `interface ${routers[0].ports[1].shortName}`, 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65010', 'neighbor 10.0.12.2 remote-as 65010', 'network 192.168.1.0 mask 255.255.255.0', 'end')
  cli(routers[1].id, 'enable', 'configure terminal', `interface ${routers[1].ports[0].shortName}`, 'ip address 10.0.12.2 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65010', 'neighbor 10.0.12.1 remote-as 65010', 'end')
  const { devices } = run(400)
  const second = devices.find(d => d.id === routers[1].id)!
  const peer = second.bgp?.peers.find(candidate => candidate.address === '10.0.12.1')
  assert.equal(peer?.state, 'established')
  assert.equal(peer?.remoteAs, 65010)
  const learned = peer?.learned.find(path => path.network === '192.168.1.0')
  assert.deepEqual(learned?.asPath, [])
  assert.equal(learned?.nextHop, '10.0.12.1')
  const route = second.routingTable.find(r => String(r.type) === 'B' && r.network === '192.168.1.0')
  assert.equal(route?.distance, 200)
  assert.match(parseIosCommand(second, 'show ip route').output, /B\s+192\.168\.1\.0.*\[200\/0\].*10\.0\.12\.1/)
  assert.match(parseIosCommand(second, 'show ip bgp summary').output, /10\.0\.12\.1\s+4\s+65010/)
  assert.doesNotMatch(parseIosCommand(second, 'show ip bgp summary').output, /not supported/)
})

test('iBGP-learned routes are not relayed to other iBGP peers but reach eBGP peers with prepending', () => {
  const routers = [0, 1, 2, 3].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `bgp-reflect-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  const host = createDevice('pc', 600, 200)
  host.id = 'bgp-reflect-pc'; host.name = host.id
  useNetworkStore.getState().loadLab([...routers, host], [])
  for (const router of routers) router.ports.slice(0, 2).forEach(port => { port.adminStatus = 'up' })
  useNetworkStore.setState({ devices: [...routers, host] })
  assert.equal(useNetworkStore.getState().connectPorts(routers[0].id, routers[0].ports[0].id, routers[1].id, routers[1].ports[0].id, 'crossover'), true)
  assert.equal(useNetworkStore.getState().connectPorts(routers[0].id, routers[0].ports[1].id, host.id, host.ports[0].id, 'straight'), true)
  assert.equal(useNetworkStore.getState().connectPorts(routers[1].id, routers[1].ports[1].id, routers[2].id, routers[2].ports[0].id, 'crossover'), true)
  assert.equal(useNetworkStore.getState().connectPorts(routers[2].id, routers[2].ports[1].id, routers[3].id, routers[3].ports[0].id, 'crossover'), true)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  cli(routers[0].id, 'enable', 'configure terminal', `interface ${routers[0].ports[0].shortName}`, 'ip address 10.0.12.1 255.255.255.0', 'no shutdown', 'exit',
    `interface ${routers[0].ports[1].shortName}`, 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65001', 'neighbor 10.0.12.2 remote-as 65002', 'network 192.168.1.0 mask 255.255.255.0', 'end')
  cli(routers[1].id, 'enable', 'configure terminal', `interface ${routers[1].ports[0].shortName}`, 'ip address 10.0.12.2 255.255.255.0', 'no shutdown', 'exit',
    `interface ${routers[1].ports[1].shortName}`, 'ip address 10.0.23.2 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65002', 'neighbor 10.0.12.1 remote-as 65001', 'neighbor 10.0.23.3 remote-as 65002', 'end')
  cli(routers[2].id, 'enable', 'configure terminal', `interface ${routers[2].ports[0].shortName}`, 'ip address 10.0.23.3 255.255.255.0', 'no shutdown', 'exit',
    `interface ${routers[2].ports[1].shortName}`, 'ip address 10.0.34.3 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65002', 'neighbor 10.0.23.2 remote-as 65002', 'neighbor 10.0.34.4 remote-as 65003', 'end')
  cli(routers[3].id, 'enable', 'configure terminal', `interface ${routers[3].ports[0].shortName}`, 'ip address 10.0.34.4 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65003', 'neighbor 10.0.34.3 remote-as 65002', 'end')
  const { devices } = run(600)
  const second = devices.find(d => d.id === routers[1].id)!
  const third = devices.find(d => d.id === routers[2].id)!
  const fourth = devices.find(d => d.id === routers[3].id)!
  const viaIbgp = third.bgp?.peers.find(peer => peer.address === '10.0.23.2')?.learned.find(path => path.network === '192.168.1.0')
  assert.deepEqual(viaIbgp?.asPath, [65001])
  assert.equal(viaIbgp?.nextHop, '10.0.12.1')
  assert.equal(third.routingTable.find(r => String(r.type) === 'B' && r.network === '192.168.1.0')?.distance, 200)
  assert.match(parseIosCommand(third, 'show ip route').output, /B\s+192\.168\.1\.0.*\[200\/0\].*10\.0\.12\.1/)
  assert.equal(second.bgp?.peers.find(peer => peer.address === '10.0.23.3')?.learned.some(path => path.network === '192.168.1.0'), false)
  const viaEbgp = fourth.bgp?.peers.find(peer => peer.address === '10.0.34.3')?.learned.find(path => path.network === '192.168.1.0')
  assert.deepEqual(viaEbgp?.asPath, [65002, 65001])
  assert.equal(fourth.routingTable.find(r => String(r.type) === 'B' && r.network === '192.168.1.0')?.distance, 20)
})

test('a device that runs BGP without a neighbor statement refuses the connection with a TCP RST', () => {
  const routers = [0, 1].map(i => {
    const device = createDevice('router', i * 300, 0, '2811')
    device.id = `bgp-refuse-r${i + 1}`; device.name = device.id; device.config.hostname = device.id
    return device
  })
  useNetworkStore.getState().loadLab(routers, [])
  for (const router of routers) router.ports.slice(0, 2).forEach(port => { port.adminStatus = 'up' })
  useNetworkStore.setState({ devices: routers })
  assert.equal(useNetworkStore.getState().connectPorts(routers[0].id, routers[0].ports[0].id, routers[1].id, routers[1].ports[0].id, 'crossover'), true)
  const cli = (id: string, ...lines: string[]) => lines.map(line => useNetworkStore.getState().executeIosCommand(id, line))
  cli(routers[0].id, 'enable', 'configure terminal', `interface ${routers[0].ports[0].shortName}`, 'ip address 10.0.12.1 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65001', 'neighbor 10.0.12.2 remote-as 65002', 'end')
  cli(routers[1].id, 'enable', 'configure terminal', `interface ${routers[1].ports[0].shortName}`, 'ip address 10.0.12.2 255.255.255.0', 'no shutdown', 'exit',
    'router bgp 65002', 'end')
  const { devices, tcpFlags, reasons } = run(400)
  const first = devices.find(d => d.id === routers[0].id)!
  assert.ok(tcpFlags.has('syn') && tcpFlags.has('rst'))
  assert.equal(tcpFlags.has('synack'), false)
  assert.ok(reasons.some(reason => /processed BGP TCP rst/.test(reason)))
  assert.notEqual(first.bgp?.peers.find(peer => peer.address === '10.0.12.2')?.state, 'established')
  assert.match(parseIosCommand(first, 'show ip bgp summary').output, /Last rejected message: TCP connection to 10\.0\.12\.2 was refused/)
})
