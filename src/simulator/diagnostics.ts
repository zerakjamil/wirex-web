import type { NetworkDevice,NetworkLink,NetworkPort } from '@/types/network'
import { isInSameSubnet,isValidIpv4,getNetworkAddress } from './protocols/ip'
import { carriesVlan,getStpTopology,isBridge } from './spanningTree'

export type DiagnosticCode='power'|'disconnected'|'shutdown'|'link-down'|'ip-missing'|'mask-invalid'|'duplicate-ip'|'subnet-mismatch'|'gateway-missing'|'gateway-subnet'|'gateway-unreachable'|'dhcp-lease'|'dhcp-pool'|'dhcp-network'|'dhcp-gateway'|'access-vlan'|'vlan-missing'|'trunk-mode'|'trunk-vlan'|'native-vlan'|'no-path'|'route-missing'
export interface DiagnosticIssue {code:DiagnosticCode;deviceId:string;portId?:string;actual:string;expected?:string;commands:string[];severity:'error'|'warning'}

// Configuration evidence is distinct from packet delivery; a clean audit still needs a ping.
export function diagnoseConnection(devices:NetworkDevice[],links:NetworkLink[],sourceId:string,targetId:string):DiagnosticIssue[]{
 const issues:DiagnosticIssue[]=[],source=devices.find(d=>d.id===sourceId),target=devices.find(d=>d.id===targetId)
 if(!source||!target)return issues
 const add=(code:DiagnosticCode,d:NetworkDevice,p:NetworkPort|undefined,actual:string,expected?:string,commands:string[]=[],severity:'error'|'warning'='error')=>{
  if(!issues.some(i=>i.code===code&&i.deviceId===d.id&&i.portId===p?.id))issues.push({code,deviceId:d.id,portId:p?.id,actual,expected,commands,severity})
 }
 const ipPort=(d:NetworkDevice)=>d.ports.find(p=>p.ipAddress)||d.ports.find(p=>p.connectedLinkId)||d.ports[0]
 const sp=ipPort(source),tp=ipPort(target)
 const physical=links.filter(l=>!['console','usb','octal'].includes(l.type))
 const sourceLink=physical.find(l=>l.fromDeviceId===sourceId||l.toDeviceId===sourceId),peer=devices.find(d=>d.id===(sourceLink?.fromDeviceId===sourceId?sourceLink.toDeviceId:sourceLink?.fromDeviceId)),peerPort=peer?.ports.find(p=>p.id===(sourceLink?.fromDeviceId===sourceId?sourceLink.toPortId:sourceLink?.fromPortId))
 const sourceVlan=peerPort?.vlan??1,forwarding=getStpTopology(devices,links,sourceVlan).forwardingLinks
 const search=(candidates:NetworkLink[],start=sourceId,end=targetId)=>{const parents=new Map<string,{from:string;link:NetworkLink}>(),queue=[start],visited=new Set(queue);for(let i=0;i<queue.length&&!visited.has(end);i++)for(const l of candidates){const peer=l.fromDeviceId===queue[i]?l.toDeviceId:l.toDeviceId===queue[i]?l.fromDeviceId:null;if(peer&&!visited.has(peer)){visited.add(peer);parents.set(peer,{from:queue[i],link:l});queue.push(peer)}}return {parents,visited}}
 const usable=search(physical.filter(l=>forwarding.has(l.id))),{parents,visited}=usable.visited.has(targetId)?usable:search(physical)
 const path:NetworkLink[]=[];let cursor=targetId
 while(parents.has(cursor)){const edge=parents.get(cursor)!;path.unshift(edge.link);cursor=edge.from}
 if(sp?.ipAddress&&tp?.ipAddress&&sp.subnetMask&&!isInSameSubnet(tp.ipAddress,sp.ipAddress,sp.subnetMask)){
  const gateway=devices.find(d=>(d.type==='router'||d.config.ipRouting)&&d.ports.some(p=>p.ipAddress===source.config.defaultGateway))
  if(gateway){
   const ingress=search(physical,sourceId,gateway.id),egress=search(physical,gateway.id,targetId)
   if(ingress.visited.has(gateway.id)&&egress.visited.has(targetId)){
    const trace=(result:ReturnType<typeof search>,end:string)=>{const edges:NetworkLink[]=[];let cursor=end;while(result.parents.has(cursor)){const edge=result.parents.get(cursor)!;edges.unshift(edge.link);cursor=edge.from}return edges}
    path.splice(0,path.length,...trace(ingress,gateway.id),...trace(egress,targetId))
   }
  }
 }
 if(!visited.has(targetId))add('no-path',source,sp,target.name,undefined,[], 'error')
 const pathIds=new Set([sourceId,targetId,...path.flatMap(l=>[l.fromDeviceId,l.toDeviceId])])
 for(const client of [source,target].filter(d=>d.config.dhcpEnabled)){
  const gateway=client.config.defaultGateway
  const server=devices.find(d=>gateway&&d.ports.some(p=>p.ipAddress===gateway))||devices.find(d=>pathIds.has(d.id)&&d.type==='router')
  const clientPath=client.id===sourceId?path:[...path].reverse(),serverLink=clientPath.find(l=>l.fromDeviceId===server?.id||l.toDeviceId===server?.id)
  const gp=server?.ports.find(p=>gateway?p.ipAddress===gateway:p.id===(serverLink?.fromDeviceId===server.id?serverLink.fromPortId:serverLink?.toPortId))
  if(server&&gp?.ipAddress&&gp.subnetMask&&server.config.dhcpPools?.length){
   const pool=server.config.dhcpPools.find(pool=>isValidIpv4(pool.network)&&isValidIpv4(pool.mask)&&isInSameSubnet(gp.ipAddress!,pool.network,pool.mask))
   if(!pool)add('dhcp-network',server,gp,server.config.dhcpPools.map(p=>`${p.name}: ${p.network} ${p.mask}`).join(';'),`${getNetworkAddress(gp.ipAddress,gp.subnetMask)} ${gp.subnetMask}`,['show ip dhcp pool','configure terminal',`ip dhcp pool ${server.config.dhcpPools[0].name}`,`network ${getNetworkAddress(gp.ipAddress,gp.subnetMask)} ${gp.subnetMask}`])
   else if(!pool.defaultRouter||pool.defaultRouter!==gateway)add('dhcp-gateway',server,gp,pool.defaultRouter||'unset',gateway,['configure terminal',`ip dhcp pool ${pool.name}`,`default-router ${gateway}`])
  }
 }
 for(const d of devices.filter(d=>pathIds.has(d.id)))if(d.power===false)add('power',d,undefined,'off','on')
 for(const d of [source,target]){
  const p=ipPort(d);if(!p)continue
  if(!p.ipAddress||p.ipAddress==='0.0.0.0'){
   add(d.config.dhcpEnabled?'dhcp-lease':'ip-missing',d,p,p.ipAddress||'unset','IPv4 address',d.config.dhcpEnabled?['ipconfig /renew']:['Desktop > IP Configuration'])
   if(d.config.dhcpEnabled&&!devices.some(server=>server.config.dhcpPool||server.config.dhcpPools?.length))add('dhcp-pool',d,p,'0 pools','DHCP pool',['show ip dhcp pool'])
  }else if(!isValidIpv4(p.ipAddress))add('ip-missing',d,p,p.ipAddress,'IPv4 address')
  if(!p.subnetMask||!validMask(p.subnetMask))add('mask-invalid',d,p,p.subnetMask||'unset','contiguous IPv4 mask',['Desktop > IP Configuration'])
  if(p.ipAddress&&devices.some(other=>other.id!==d.id&&other.ports.some(op=>op.ipAddress===p.ipAddress)))add('duplicate-ip',d,p,p.ipAddress,'unique IPv4 address',['Desktop > IP Configuration'])
  if(!physical.some(l=>l.fromDeviceId===d.id||l.toDeviceId===d.id))add('disconnected',d,p,'no data cable','connected Ethernet port')
 }
 const routed=path.some(l=>devices.some(d=>d.type==='router'&&(d.id===l.fromDeviceId||d.id===l.toDeviceId)))
 if(routed)for(const router of devices.filter(d=>d.type==='router'&&pathIds.has(d.id)))for(const p of [sp,tp]){
  if(!p?.ipAddress||!isValidIpv4(p.ipAddress))continue
  const connected=router.ports.some(rp=>rp.ipAddress&&rp.subnetMask&&rp.adminStatus==='up'&&isInSameSubnet(p.ipAddress!,rp.ipAddress,rp.subnetMask))
  const route=router.routingTable.some(r=>isValidIpv4(r.network)&&isValidIpv4(r.netmask)&&isInSameSubnet(p.ipAddress!,r.network,r.netmask))
  if(!connected&&!route)add('route-missing',router,undefined,p.ipAddress,'matching connected or static route',['show ip route','show ip interface brief'])
 }
 if(sp?.ipAddress&&tp?.ipAddress&&sp.subnetMask&&tp.subnetMask){
  if(!routed&&(!isInSameSubnet(sp.ipAddress,tp.ipAddress,sp.subnetMask)||!isInSameSubnet(sp.ipAddress,tp.ipAddress,tp.subnetMask)))add('subnet-mismatch',target,tp,`${tp.ipAddress} ${tp.subnetMask}`,`${sp.ipAddress} ${sp.subnetMask}`,['Desktop > IP Configuration'])
  for(const [d,p,remote] of [[source,sp,tp],[target,tp,sp]] as const){
   if(d.type==='router')continue
   if(isInSameSubnet(p.ipAddress!,remote.ipAddress!,p.subnetMask!))continue
   const gateway=d.config.defaultGateway
   if(!gateway)add('gateway-missing',d,p,'unset','router address in local subnet',['Desktop > IP Configuration'])
   else if(!isValidIpv4(gateway)||!isInSameSubnet(p.ipAddress!,gateway,p.subnetMask!))add('gateway-subnet',d,p,gateway,`${p.ipAddress} ${p.subnetMask}`,['Desktop > IP Configuration'])
   else if(!devices.some(router=>pathIds.has(router.id)&&router.ports.some(rp=>rp.ipAddress===gateway&&rp.adminStatus==='up')))add('gateway-unreachable',d,p,gateway,'active router interface',['show ip interface brief'])
  }
 }
 let vlan=sourceVlan
 let traversing=sourceId
 const first=path[0]
 if(first){const peer=devices.find(d=>d.id===(first.fromDeviceId===sourceId?first.toDeviceId:first.fromDeviceId));const p=peer?.ports.find(p=>p.id===(first.fromDeviceId===sourceId?first.toPortId:first.fromPortId));vlan=p?.vlan??1}
 for(const l of path){
  const a=devices.find(d=>d.id===l.fromDeviceId)!,b=devices.find(d=>d.id===l.toDeviceId)!
  const ap=a?.ports.find(p=>p.id===l.fromPortId),bp=b?.ports.find(p=>p.id===l.toPortId);if(!a||!b||!ap||!bp)continue
  const sender=traversing===a.id?a:b,senderPort=traversing===a.id?ap:bp
  if(sender.type==='router'&&tp?.ipAddress){const logical=sender.ports.find(p=>p.parentPortId===senderPort.id&&p.ipAddress&&p.subnetMask&&isInSameSubnet(tp.ipAddress!,p.ipAddress,p.subnetMask));if(logical?.dot1qVlan!==undefined)vlan=logical.dot1qVlan}
  traversing=traversing===a.id?b.id:a.id
  for(const [d,p] of [[a,ap],[b,bp]] as const){
   const context=['enable','configure terminal',`interface ${p.shortName}`]
   if(p.adminStatus==='down')add('shutdown',d,p,'administratively down','up',[...context,'no shutdown'])
   else if(p.status==='down')add('link-down',d,p,'down','up',['show ip interface brief'])
   if(!isBridge(d))continue
   if(p.portMode==='trunk'){
    if(!carriesVlan(p,vlan))add('trunk-vlan',d,p,(p.allowedVlans||[]).join(','),String(vlan),[...context,`switchport trunk allowed vlan add ${vlan}`])
   }else if(!routed&&(p.vlan??1)!==vlan)add('access-vlan',d,p,String(p.vlan??1),String(vlan),[...context,`switchport access vlan ${vlan}`])
   if(d.type==='switch'&&vlan!==1&&!d.config.vlans?.some(v=>v.id===vlan))add('vlan-missing',d,p,String(vlan),'active VLAN',['enable','configure terminal',`vlan ${vlan}`])
  }
  if(isBridge(a)&&isBridge(b)){
   if((ap.portMode==='trunk')!==(bp.portMode==='trunk')){const d=ap.portMode==='trunk'?b:a,p=ap.portMode==='trunk'?bp:ap;add('trunk-mode',d,p,p.portMode||'access','trunk',['enable','configure terminal',`interface ${p.shortName}`,'switchport mode trunk'])}
   if(ap.portMode==='trunk'&&bp.portMode==='trunk'&&(ap.nativeVlan??1)!==(bp.nativeVlan??1))add('native-vlan',b,bp,String(bp.nativeVlan??1),String(ap.nativeVlan??1),['enable','configure terminal',`interface ${bp.shortName}`,`switchport trunk native vlan ${ap.nativeVlan??1}`])
  }
 }
 // An alternate port is expected redundancy. Never diagnose ordinary STP blocking as a fault.
 const tree=getStpTopology(devices,links,vlan)
 if(path.length&&issues.length===0&&!routed){const reachable=new Set([sourceId]),todo=[sourceId];for(let i=0;i<todo.length;i++)for(const l of links.filter(l=>tree.forwardingLinks.has(l.id))){const peer=l.fromDeviceId===todo[i]?l.toDeviceId:l.toDeviceId===todo[i]?l.fromDeviceId:null;if(peer&&!reachable.has(peer)){reachable.add(peer);todo.push(peer)}}if(!reachable.has(targetId))add('no-path',source,sp,`VLAN ${vlan}`,'forwarding path')}
 return issues
}

export interface NetworkAuditIssue extends DiagnosticIssue {
  category: 'ip' | 'vlan' | 'routing' | 'dhcp' | 'physical'
  title: string
  description: string
}

export interface WholeNetworkAudit {
  score: number
  totalDevices: number
  totalLinks: number
  healthyDevices: number
  issues: NetworkAuditIssue[]
  summary: string
}

export function auditWholeNetwork(devices: NetworkDevice[], links: NetworkLink[]): WholeNetworkAudit {
  const issues: NetworkAuditIssue[] = []
  const add = (
    code: DiagnosticCode,
    category: 'ip' | 'vlan' | 'routing' | 'dhcp' | 'physical',
    title: string,
    description: string,
    deviceId: string,
    portId: string | undefined,
    actual: string,
    expected?: string,
    commands: string[] = [],
    severity: 'error' | 'warning' = 'error'
  ) => {
    if (!issues.some(i => i.code === code && i.deviceId === deviceId && i.portId === portId && i.actual === actual)) {
      issues.push({ code, category, title, description, deviceId, portId, actual, expected, commands, severity })
    }
  }

  // 1. Device Hardware & Power
  for (const d of devices) {
    if (d.power === false) {
      add('power', 'physical', 'Device Powered Off', `${d.name} (${d.model}) is powered off. Link lights and routing engines are down.`, d.id, undefined, 'off', 'on', ['Turn power switch ON in Physical view'], 'warning')
    }
  }

  // 2. IP Addressing & Subnet Integrity across all devices
  const ipMap = new Map<string, { dev: NetworkDevice; port: NetworkPort }[]>()
  for (const d of devices) {
    for (const p of d.ports) {
      if (p.ipAddress && isValidIpv4(p.ipAddress) && p.ipAddress !== '0.0.0.0') {
        const list = ipMap.get(p.ipAddress) || []
        list.push({ dev: d, port: p })
        ipMap.set(p.ipAddress, list)
      }
    }
  }

  for (const [ip, occurrences] of ipMap.entries()) {
    if (occurrences.length > 1) {
      const names = occurrences.map(o => `${o.dev.name} (${o.port.shortName})`).join(', ')
      for (const occ of occurrences) {
        add('duplicate-ip', 'ip', 'Duplicate IP Address Conflict', `IP address ${ip} is configured on multiple devices: ${names}`, occ.dev.id, occ.port.id, ip, 'unique IPv4 address', ['Desktop > IP Configuration or interface config'], 'error')
      }
    }
  }

  // Host Default Gateways
  const hasRouter = devices.some(r =>
    r.power !== false && (r.type === 'router' || (r.type === 'switch' && (r.model?.includes('3560') || r.model?.includes('3650'))))
  )
  const hostTypes = ['pc', 'laptop', 'server', 'printer']
  for (const d of devices) {
    if (!hostTypes.includes(d.type)) continue
    const activePort = d.ports.find(p => p.ipAddress && isValidIpv4(p.ipAddress))
    if (!activePort || !activePort.ipAddress) continue

    const gw = d.config.defaultGateway
    if (!gw) {
      if (hasRouter) {
        add('gateway-missing', 'ip', 'Missing Default Gateway', `${d.name} has IPv4 ${activePort.ipAddress} but no default gateway. Cross-subnet traffic will fail.`, d.id, activePort.id, 'unset', 'gateway in local subnet', ['Desktop > IP Configuration'], 'warning')
      }
    } else if (!isValidIpv4(gw)) {
      add('gateway-subnet', 'ip', 'Invalid Default Gateway', `Default gateway ${gw} is not a valid IPv4 address.`, d.id, activePort.id, gw, 'valid IPv4 address', ['Desktop > IP Configuration'], 'error')
    } else if (activePort.subnetMask && !isInSameSubnet(activePort.ipAddress, gw, activePort.subnetMask)) {
      add('gateway-subnet', 'ip', 'Gateway Subnet Mismatch', `Default gateway ${gw} is not in ${d.name}'s local subnet (${activePort.ipAddress}/${activePort.subnetMask}).`, d.id, activePort.id, gw, `${activePort.ipAddress} subnet`, ['Desktop > IP Configuration'], 'error')
    } else {
      const routerHasGw = devices.some(r =>
        (r.type === 'router' || r.type === 'switch') &&
        r.power !== false &&
        r.ports.some(rp => rp.ipAddress === gw && rp.adminStatus === 'up')
      )
      if (!routerHasGw) {
        add('gateway-unreachable', 'ip', 'Unreachable Default Gateway', `Default gateway ${gw} does not exist on any active router interface in the network.`, d.id, activePort.id, gw, 'active router interface', ['show ip interface brief'], 'warning')
      }
    }
  }

  // 3. Physical Links & Port States
  const physicalLinks = links.filter(l => !['console', 'usb', 'octal'].includes(l.type))
  for (const l of physicalLinks) {
    const a = devices.find(d => d.id === l.fromDeviceId)
    const b = devices.find(d => d.id === l.toDeviceId)
    if (!a || !b) continue
    const ap = a.ports.find(p => p.id === l.fromPortId)
    const bp = b.ports.find(p => p.id === l.toPortId)
    if (!ap || !bp) continue

    for (const [dev, port] of [[a, ap], [b, bp]] as const) {
      if (port.adminStatus === 'down' && dev.power !== false) {
        add('shutdown', 'physical', 'Connected Port Administratively Down', `${dev.name} interface ${port.shortName} has a connected cable but is shut down.`, dev.id, port.id, 'administratively down', 'up', ['enable', 'configure terminal', `interface ${port.shortName}`, 'no shutdown'], 'warning')
      }
    }

    // Direct link between routers / end hosts with mismatched subnets
    if (ap.ipAddress && bp.ipAddress && ap.subnetMask && bp.subnetMask && !isBridge(a) && !isBridge(b)) {
      if (!isInSameSubnet(ap.ipAddress, bp.ipAddress, ap.subnetMask) || !isInSameSubnet(ap.ipAddress, bp.ipAddress, bp.subnetMask)) {
        add('subnet-mismatch', 'ip', 'Direct Link Subnet Mismatch', `Direct link between ${a.name} (${ap.shortName}: ${ap.ipAddress}) and ${b.name} (${bp.shortName}: ${bp.ipAddress}) has mismatched subnets.`, b.id, bp.id, `${bp.ipAddress} ${bp.subnetMask}`, `${ap.ipAddress} ${ap.subnetMask}`, ['Configure matching subnet IPv4 addresses on both endpoints'], 'error')
      }
    }

    // Switch-to-switch trunk link consistency
    if (isBridge(a) && isBridge(b)) {
      if ((ap.portMode === 'trunk') !== (bp.portMode === 'trunk')) {
        const badDev = ap.portMode === 'trunk' ? b : a
        const badPort = ap.portMode === 'trunk' ? bp : ap
        add('trunk-mode', 'vlan', 'Switchport Mode Mismatch', `Inter-switch link between ${a.name} (${ap.shortName}) and ${b.name} (${bp.shortName}) has mismatched trunk/access modes.`, badDev.id, badPort.id, badPort.portMode || 'access', 'trunk', ['enable', 'configure terminal', `interface ${badPort.shortName}`, 'switchport mode trunk'], 'error')
      }
      if (ap.portMode === 'trunk' && bp.portMode === 'trunk') {
        const aNat = ap.nativeVlan ?? 1
        const bNat = bp.nativeVlan ?? 1
        if (aNat !== bNat) {
          add('native-vlan', 'vlan', '802.1Q Native VLAN Mismatch', `Trunk link between ${a.name} (${ap.shortName}) and ${b.name} (${bp.shortName}) has mismatched native VLANs: VLAN ${aNat} vs VLAN ${bNat}.`, b.id, bp.id, `VLAN ${bNat}`, `VLAN ${aNat}`, ['enable', 'configure terminal', `interface ${bp.shortName}`, `switchport trunk native vlan ${aNat}`], 'error')
        }
      }
    }
  }

  // 4. Switch VLAN Database Verification
  for (const d of devices) {
    if (d.type !== 'switch') continue
    const activeVlans = new Set((d.config.vlans || []).map(v => v.id))
    activeVlans.add(1)
    for (const p of d.ports) {
      if (p.portMode !== 'trunk' && p.vlan && p.vlan !== 1) {
        if (!activeVlans.has(p.vlan)) {
          add('vlan-missing', 'vlan', 'VLAN Not in Database', `${d.name} interface ${p.shortName} is assigned to VLAN ${p.vlan}, but VLAN ${p.vlan} does not exist in the VLAN database.`, d.id, p.id, `VLAN ${p.vlan} missing`, `VLAN ${p.vlan} active`, ['enable', 'configure terminal', `vlan ${p.vlan}`, 'exit'], 'warning')
        }
      }
    }
  }

  // 5. DHCP Pool Auditing on Routers
  for (const d of devices) {
    for (const pool of d.config.dhcpPools || []) {
      if (pool.network && pool.mask) {
        const matchingPort = d.ports.find(p => p.ipAddress && p.subnetMask && isInSameSubnet(p.ipAddress, pool.network, pool.mask))
        if (!matchingPort) {
          add('dhcp-network', 'dhcp', 'DHCP Pool Subnet Unmatched', `DHCP pool '${pool.name}' (${pool.network} ${pool.mask}) does not match any local router interface IP.`, d.id, undefined, `${pool.network} ${pool.mask}`, 'matching router interface subnet', ['show ip interface brief', 'configure terminal', `ip dhcp pool ${pool.name}`], 'error')
        }
      }
      if (!pool.defaultRouter) {
        add('dhcp-gateway', 'dhcp', 'DHCP Pool Missing Gateway', `DHCP pool '${pool.name}' does not specify a default router for clients.`, d.id, undefined, 'unset', 'default-router IP', ['configure terminal', `ip dhcp pool ${pool.name}`, 'default-router <ip>'], 'warning')
      }
    }
  }

  // Scoring
  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const score = Math.max(0, 100 - errorCount * 15 - warningCount * 5)
  const problematicDeviceIds = new Set(issues.map(i => i.deviceId))
  const healthyDevices = devices.filter(d => !problematicDeviceIds.has(d.id)).length

  let summary = 'All systems healthy. No configuration defects detected across all devices and links.'
  if (issues.length > 0) {
    summary = `${errorCount} critical error(s) and ${warningCount} warning(s) detected across the network topology.`
  }

  return {
    score,
    totalDevices: devices.length,
    totalLinks: links.length,
    healthyDevices,
    issues,
    summary,
  }
}

function validMask(mask:string){if(!isValidIpv4(mask))return false;const binary=mask.split('.').map(n=>Number(n).toString(2).padStart(8,'0')).join('');return /^1+0*$/.test(binary)}
