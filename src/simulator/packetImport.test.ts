import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePktXml } from './packetImport'
import { parseWorkspace } from './workspaceSchema'

function port(name: string, mac: string, ip = '') {
  return `<PORT><NAME>${name}</NAME><TYPE>eCopperFastEthernet</TYPE><POWER>true</POWER><MACADDRESS>${mac}</MACADDRESS>${ip ? `<IP>${ip}</IP><SUBNET>255.255.255.0</SUBNET>` : ''}</PORT>`
}

function device(ref: string, name: string, type: string, model: string, ports: string, config = '') {
  return `<DEVICE><ENGINE><TYPE model="${model}">${type}</TYPE><NAME>${name}</NAME><POWER>true</POWER><SAVE_REF_ID>${ref}</SAVE_REF_ID><MODULE>${ports}</MODULE>${config}</ENGINE><WORKSPACE><LOGICAL><X>125.5</X><Y>240.25</Y></LOGICAL></WORKSPACE></DEVICE>`
}

const rootPktTag = 'PACKET' + 'TRACER5'

function project(devices: string, links = '') {
  return `<?xml version="1.0" encoding="UTF-8"?><${rootPktTag}><VERSION>8.2.2</VERSION><NETWORK><DEVICES>${devices}</DEVICES><LINKS>${links}</LINKS></NETWORK></${rootPktTag}>`
}

const sourceXml = device('10', 'PC &amp; Student', 'PC', 'PC-PT', port('FastEthernet0', '00:11:22:33:44:01', '192.168.10.10'))
const switchXml = device('20', 'Switch0', 'Switch', '2960-24TT',
  port('FastEthernet0/1', '00:11:22:33:44:02') + port('FastEthernet0/2', '00:11:22:33:44:03'))
const cableXml = '<LINK><CABLE><FROM>10</FROM><PORT>FastEthernet0</PORT><TO>20</TO><PORT>FastEthernet0/2</PORT><TYPE>eStraightThrough</TYPE></CABLE></LINK>'

test('PKT topology XML imports device names, models, positions, power and IPv4 interfaces', () => {
  const imported = parsePktXml(project(sourceXml + switchXml, cableXml))
  assert.equal(parseWorkspace({ ...imported, version: 1 }).devices.length, 2)
  assert.equal(imported.version, '8.2.2')
  assert.equal(imported.devices.length, 2)
  const pc = imported.devices.find(device => device.name === 'PC & Student')!
  assert.ok(pc)
  assert.equal(pc.type, 'pc')
  assert.equal(pc.model, 'PC-PT')
  assert.equal(pc.power, true)
  assert.equal(pc.x, 125.5)
  assert.equal(pc.y, 240.25)
  const iface = pc.ports.find(port => port.name === 'FastEthernet0')!
  assert.ok(iface)
  assert.equal(iface.ipAddress, '192.168.10.10')
  assert.equal(iface.subnetMask, '255.255.255.0')
  assert.equal(iface.macAddress.toLowerCase(), '00:11:22:33:44:01')
  assert.deepEqual(imported.annotations, [])
})

test('repeated CABLE PORT elements bind to their own FROM and TO endpoints', () => {
  const imported = parsePktXml(project(sourceXml + switchXml, cableXml))
  assert.equal(imported.links.length, 1)
  const link = imported.links[0]
  const pc = imported.devices.find(device => device.name === 'PC & Student')!
  const sw = imported.devices.find(device => device.name === 'Switch0')!
  assert.equal(link.type, 'straight')
  assert.equal(link.fromDeviceId, pc.id)
  assert.equal(link.toDeviceId, sw.id)
  assert.equal(pc.ports.find(port => port.id === link.fromPortId)?.name, 'FastEthernet0')
  assert.equal(sw.ports.find(port => port.id === link.toPortId)?.name, 'FastEthernet0/2')
  assert.equal(pc.ports.find(port => port.id === link.fromPortId)?.connectedLinkId, link.id)
  assert.equal(sw.ports.find(port => port.id === link.toPortId)?.connectedDeviceId, pc.id)
})

test('running configuration retains unsupported telephony commands without dropping lines', () => {
  const lines = ['hostname VoiceRouter', 'telephony-service', 'max-ephones 5', 'max-dn 5', 'ip source-address 10.0.0.1 port 2000', 'ephone-dn 1', 'number 1001', 'end']
  const running = `<RUNNINGCONFIG>${lines.map(line => `<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const xml = project(device('30', 'VoiceRouter', 'Router', '2811', port('FastEthernet0/0', '00:11:22:33:44:04', '10.0.0.1'), running))
  const imported = parsePktXml(xml)
  assert.equal(imported.devices.length, 1)
  assert.deepEqual(imported.devices[0].importedRunningConfig, lines)
})

test('PKT import applies IOS NTP master and server commands to the live model', () => {
  const lines = ['hostname TimeRouter', 'ntp master 4', 'ntp server 192.0.2.9', 'end']
  const running = `<RUNNINGCONFIG>${lines.map(line => `<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const imported = parsePktXml(project(device('31', 'TimeRouter', 'Router', '2811', port('FastEthernet0/0', '00:11:22:33:44:05', '192.0.2.1'), running)))
  const router = imported.devices[0]
  assert.equal(router.config.ntpMaster, true)
  assert.equal(router.config.ntpMasterStratum, 4)
  assert.equal(router.config.ntpServer, '192.0.2.9')
  assert.deepEqual(router.importedRunningConfig, lines)
})

test('PKT import applies IOS logging host and trap commands to the live model', () => {
  const lines = ['hostname LogRouter', 'logging 192.0.2.20', 'logging trap 4', 'end']
  const running = `<RUNNINGCONFIG>${lines.map(line => `<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const imported = parsePktXml(project(device('32', 'LogRouter', 'Router', '2811', port('FastEthernet0/0', '00:11:22:33:44:06', '192.0.2.1'), running)))
  const router = imported.devices[0]
  assert.equal(router.config.loggingHost, '192.0.2.20')
  assert.equal(router.config.loggingTrap, 4)
  assert.deepEqual(router.importedRunningConfig, lines)
})

test('PKT import applies spanning-tree edge guard configuration to the live switch model',()=>{
  const lines=['hostname GuardSwitch','spanning-tree portfast bpduguard default','spanning-tree portfast bpdufilter default','interface FastEthernet0/1','spanning-tree portfast','spanning-tree bpduguard enable','spanning-tree bpdufilter enable','spanning-tree guard root','!','end']
  const running=`<RUNNINGCONFIG>${lines.map(line=>`<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const sw=parsePktXml(project(device('34','GuardSwitch','Switch','2960-24TT',port('FastEthernet0/1','00:11:22:33:44:08'),running))).devices[0]
  assert.equal(sw.config.bpduGuardDefault,true)
  assert.equal(sw.config.bpduFilterDefault,true)
  const iface=sw.ports.find(candidate=>candidate.name==='FastEthernet0/1')!
  assert.equal(iface.portfast,true)
  assert.equal(iface.bpduGuard,true)
  assert.equal(iface.bpduFilter,true)
  assert.equal(iface.rootGuard,true)
  assert.deepEqual(sw.importedRunningConfig,lines)
})

test('PKT import applies HSRP interface configuration to the live gateway model',()=>{
  const lines=['interface FastEthernet0/0','ip address 192.0.2.2 255.255.255.0','standby 10 ip 192.0.2.1','standby 10 priority 120','standby 10 preempt','!','end']
  const running=`<RUNNINGCONFIG>${lines.map(line=>`<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const router=parsePktXml(project(device('32','GatewayA','Router','2811',port('FastEthernet0/0','00:11:22:33:44:06','192.0.2.2'),running))).devices[0]
  assert.deepEqual(router.ports.find(candidate=>candidate.name==='FastEthernet0/0')?.hsrpGroups,[{group:10,virtualIp:'192.0.2.1',priority:120,preempt:true}])
  assert.deepEqual(router.importedRunningConfig,lines)
})

test('PKT import applies HSRP negated priority, preempt and group commands',()=>{
  const lines=['interface FastEthernet0/0','ip address 192.0.2.2 255.255.255.0','standby 10 ip 192.0.2.1','standby 10 priority 120','standby 10 preempt','no standby 10 priority','no standby 10 preempt','standby 11 ip 192.0.2.3','no standby 11','end']
  const running=`<RUNNINGCONFIG>${lines.map(line=>`<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const router=parsePktXml(project(device('33','GatewayB','Router','2811',port('FastEthernet0/0','00:11:22:33:44:07','192.0.2.2'),running))).devices[0]
  assert.deepEqual(router.ports.find(candidate=>candidate.name==='FastEthernet0/0')?.hsrpGroups,[{group:10,virtualIp:'192.0.2.1'}])
})

test('unknown engine types remain visible as placeholders with a warning', () => {
  const imported = parsePktXml(project(device('90', 'FutureDevice0', 'UnrecognizedFutureEngine', 'Future-9000', '')))
  assert.equal(imported.devices.length, 1)
  assert.equal(imported.devices[0].name, 'FutureDevice0')
  assert.equal(imported.devices[0].model, 'Future-9000')
  assert.ok(imported.warnings.length > 0)
  assert.match(imported.warnings.join('\n'), /unknown|unsupported|placeholder/i)
})

test('malformed XML is rejected instead of importing a partial empty project', () => {
  assert.throws(() => parsePktXml(`<${rootPktTag}><NETWORK><DEVICES></NETWORK>`), /XML|malformed|invalid|parse/i)
})

test('XML without NETWORK is rejected with a clear project error', () => {
  assert.throws(() => parsePktXml(`<${rootPktTag}><VERSION>8.2.2</VERSION></${rootPktTag}>`), /NETWORK|network/i)
})
test('imported routing, SVI and trunk VLAN configuration controls the live model',()=>{
  const lines=['ip routing','vlan 10','name Students','!','interface Vlan10','ip address 10.0.10.254 255.255.255.0','no shutdown','!','interface FastEthernet0/1','switchport mode trunk','switchport trunk native vlan 10','switchport trunk allowed vlan 10,20-22','!']
  const config=`<RUNNINGCONFIG>${lines.map(line=>`<LINE>${line}</LINE>`).join('')}</RUNNINGCONFIG>`
  const sw=parsePktXml(project(device('1','Core','MultilayerSwitch','3560-24PS',port('FastEthernet0/1','00:11:22:33:44:01'),config))).devices[0]
  assert.equal(sw.config.ipRouting,true)
  assert.deepEqual(sw.config.vlans?.find(v=>v.id===10),{id:10,name:'Students'})
  assert.equal(sw.ports.find(p=>p.name==='Vlan10')?.virtualVlan,10)
  assert.equal(sw.ports[0].nativeVlan,10)
  assert.deepEqual(sw.ports[0].allowedVlans,[10,20,21,22])
})
