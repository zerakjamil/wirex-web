import type {NetworkDevice,NetworkLink} from '@/types/network'
import {getStpTopology,isBridge} from './spanningTree'
import {ipToNumber,numberToIp,isInSameSubnet,isValidIpv4} from './protocols/ip'
export interface DhcpLease {serverId:string;portId:string;ipAddress:string;mask:string;gateway?:string;dns?:string;leaseDurationSeconds:number}
export function allocateDhcpLease(devices:NetworkDevice[],links:NetworkLink[],clientId:string):{lease?:DhcpLease;reason:string}{
 const client=devices.find(d=>d.id===clientId),cp=client?.ports.find(p=>p.connectedLinkId&&p.adminStatus==='up'&&p.status==='up'),first=links.find(l=>l.id===cp?.connectedLinkId)
 if(!client||client.power===false||!cp||!first)return {reason:'DHCP: no active client link.'}
 const clientMac=cp.macAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()
 const clientIdentifier=`01${clientMac}`
 const hasReservation=(pool:{hostIp?:string;hardwareAddress?:string;clientIdentifier?:string})=>Boolean(pool.hostIp||pool.hardwareAddress||pool.clientIdentifier)
 const poolMatchesClient=(pool:{hostIp?:string;hardwareAddress?:string;clientIdentifier?:string})=>{
  if(!hasReservation(pool)||!pool.hostIp||(!pool.hardwareAddress&&!pool.clientIdentifier))return false
  const hardwareMatches=!pool.hardwareAddress||pool.hardwareAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()===clientMac
  const identifierMatches=!pool.clientIdentifier||pool.clientIdentifier.replace(/[^0-9a-f]/gi,'').toLowerCase()===clientIdentifier
  return hardwareMatches&&identifierMatches
 }
 const reservationMismatch=(pools:NonNullable<NetworkDevice['config']['dhcpPools']>,subnetIp?:string)=>{
  if(!subnetIp)return undefined
  const inSubnet=(pool:typeof pools[number])=>isValidIpv4(pool.network)&&isValidIpv4(pool.mask)&&isInSameSubnet(subnetIp,pool.network,pool.mask)
  const hasUnmatchedHostPool=pools.some(pool=>hasReservation(pool)&&inSubnet(pool)&&!poolMatchesClient(pool))
  const hasDynamicPool=pools.some(pool=>!hasReservation(pool)&&inSubnet(pool))
  return hasUnmatchedHostPool&&!hasDynamicPool
   ?`DHCP: no manual binding matches ${client.name}. Verify client-identifier ${clientIdentifier} or hardware-address ${cp.macAddress}, or configure a dynamic network pool.`
   :undefined
 }
 const peerId=first.fromDeviceId===clientId?first.toDeviceId:first.fromDeviceId,peer=devices.find(d=>d.id===peerId),peerPort=peer?.ports.find(p=>p.id===(first.fromDeviceId===clientId?first.toPortId:first.fromPortId)),vlan=peerPort?.vlan??1
 const tree=getStpTopology(devices,links,vlan),seen=new Set([clientId]),queue=[{id:clientId,portId:cp.id}]
 const now=Date.now()
 const used=new Set(devices.filter(d=>d.id!==clientId).flatMap(d=>{
  const addresses=d.ports.flatMap(p=>p.ipAddress?[ipToNumber(p.ipAddress)]:[])
  const lease=d.config.dhcpLease
  if(lease&&(!lease.acquiredAtMs||!lease.leaseDurationSeconds||lease.acquiredAtMs+lease.leaseDurationSeconds*1000>now)&&isValidIpv4(lease.ipAddress))addresses.push(ipToNumber(lease.ipAddress))
  for(const binding of d.config.dhcpBindings??[]){
   const active=binding.acquiredAtMs+binding.leaseDurationSeconds*1000>now
   const sameClient=binding.clientDeviceId===clientId||binding.hardwareAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()===clientMac||binding.clientIdentifier.replace(/[.:-]/g,'').toLowerCase()===clientIdentifier
   if(active&&!sameClient&&isValidIpv4(binding.ipAddress))addresses.push(ipToNumber(binding.ipAddress))
  }
  return addresses
 }))
 const poolsFor=(dev:NetworkDevice)=>(dev.config.dhcpPools&&dev.config.dhcpPools.length>0)
  ?dev.config.dhcpPools
  :dev.config.dhcpEnabled&&dev.config.dhcpPool
   ?[{name:'server',network:dev.config.dhcpPool.network,mask:dev.config.dhcpPool.subnetMask,defaultRouter:dev.config.dhcpPool.gateway,dnsServer:dev.config.dhcpPool.dns,leaseDurationSeconds:dev.config.dhcpPool.leaseDurationSeconds}]
   :[]
 let relayFailureReason:string|undefined
 for(let i=0;i<queue.length;i++){
  const entry=queue[i],d=devices.find(d=>d.id===entry.id)!,physicalPort=d.ports.find(p=>p.id===entry.portId)
  const incoming=d.ports.find(p=>p.parentPortId===physicalPort?.id&&p.dot1qVlan===vlan&&p.status==='up'&&p.adminStatus==='up')
    ??d.ports.find(p=>p.virtualVlan===vlan&&p.status==='up'&&p.adminStatus==='up')
    ??physicalPort
  const routedSwitch=d.type==='switch'&&d.config.ipRouting===true
  if(d.id!==clientId&&(!isBridge(d)||routedSwitch)){
   const pools=poolsFor(d)
   const selectedPools=[...pools.filter(poolMatchesClient),...pools.filter(pool=>!hasReservation(pool))]
   for(const pool of selectedPools){
    if(!isValidIpv4(pool.network)||!isValidIpv4(pool.mask)||!incoming?.ipAddress||!isInSameSubnet(incoming.ipAddress,pool.network,pool.mask))continue
    if(pool.defaultRouter&&(!isValidIpv4(pool.defaultRouter)||!isInSameSubnet(pool.defaultRouter,pool.network,pool.mask)))return {reason:'DHCP: pool default-router is outside the pool subnet.'}
    const mask=ipToNumber(pool.mask),base=(ipToNumber(pool.network)&mask)>>>0,last=(base|(~mask>>>0))>>>0
    const start=d.config.dhcpPool?ipToNumber(d.config.dhcpPool.startIp):base+1,end=d.config.dhcpPool?ipToNumber(d.config.dhcpPool.endIp):last-1
    const exclusions=(d.config.excludedDhcpIps||[]).map(text=>text.split(/\s+/).map(ipToNumber))
    const reserved = [pool.defaultRouter, pool.dnsServer, pool.tftpServer].filter((ip): ip is string => Boolean(ip && isValidIpv4(ip))).map(ipToNumber)
    const reservedHosts=pools.filter(candidate=>candidate.hostIp&&isValidIpv4(candidate.hostIp)).map(candidate=>ipToNumber(candidate.hostIp!))
    const otherReservedHosts=pools.filter(candidate=>candidate!==pool&&candidate.hostIp&&isValidIpv4(candidate.hostIp)).map(candidate=>ipToNumber(candidate.hostIp!))
    const previous=client.config.dhcpLease?.serverId===d.id?client.config.dhcpLease.ipAddress:undefined
    const available=(n:number)=>n>base&&n<last&&n>=start&&n<=end&&!used.has(n)&&!reserved.includes(n)&&!reservedHosts.includes(n)&&!exclusions.some(([a,b=a])=>n>=a&&n<=b)
    let address:number|undefined
    if(pool.hostIp){
     const hostAddress=isValidIpv4(pool.hostIp)?ipToNumber(pool.hostIp):0
     if(!hostAddress||!isInSameSubnet(pool.hostIp,pool.network,pool.hostMask??pool.mask))return {reason:`DHCP: reserved host address ${pool.hostIp} is invalid or outside pool ${pool.name}.`}
     if(used.has(hostAddress)||reserved.includes(hostAddress)||otherReservedHosts.includes(hostAddress))return {reason:`DHCP: reserved host address ${pool.hostIp} for ${client.name} is already in use or assigned to another reservation.`}
     address=hostAddress
    }else{
     address=previous&&available(ipToNumber(previous))?ipToNumber(previous):undefined
     if(address===undefined)for(let n=Math.max(start,base+1),count=0;n<=Math.min(end,last-1)&&count<65536;n++,count++)if(available(n)){address=n;break}
    }
    if(address===undefined)return {reason:'DHCP: no available address in the reachable pool (allocation scan capped at 65536 addresses).'}
    return {lease:{serverId:d.id,portId:cp.id,ipAddress:numberToIp(address),mask:pool.hostMask??pool.mask,gateway:pool.defaultRouter,dns:pool.dnsServer,leaseDurationSeconds:pool.leaseDurationSeconds??86400},reason:'DHCP lease assigned through simulated DORA.'}
   }
   if (incoming?.helperAddress) {
     const helperIp = incoming.helperAddress
     const server = devices.find((srv) => srv.power!==false&&srv.ports.some((sp) => sp.ipAddress === helperIp&&sp.adminStatus!=='down'))
     if (server) {
       const pools = poolsFor(server)
       const selectedPools=[...pools.filter(poolMatchesClient),...pools.filter(pool=>!hasReservation(pool))]
       for (const pool of selectedPools) {
         if (!isValidIpv4(pool.network) || !isValidIpv4(pool.mask) || !incoming.ipAddress || !isInSameSubnet(incoming.ipAddress, pool.network, pool.mask)) continue
         const mask = ipToNumber(pool.mask), base = (ipToNumber(pool.network) & mask) >>> 0, last = (base | (~mask >>> 0)) >>> 0
         const start = server.config.dhcpPool ? ipToNumber(server.config.dhcpPool.startIp) : base + 1, end = server.config.dhcpPool ? ipToNumber(server.config.dhcpPool.endIp) : last - 1
         const exclusions = (server.config.excludedDhcpIps || []).map((text) => text.split(/\s+/).map(ipToNumber))
         const reserved = [pool.defaultRouter, pool.dnsServer, pool.tftpServer].filter((ip): ip is string => Boolean(ip && isValidIpv4(ip))).map(ipToNumber)
         const reservedHosts=pools.filter(candidate=>candidate.hostIp&&isValidIpv4(candidate.hostIp)).map(candidate=>ipToNumber(candidate.hostIp!))
         const otherReservedHosts=pools.filter(candidate=>candidate!==pool&&candidate.hostIp&&isValidIpv4(candidate.hostIp)).map(candidate=>ipToNumber(candidate.hostIp!))
         const available = (n: number) => n > base && n < last && n >= start && n <= end && !used.has(n) && !reserved.includes(n) && !reservedHosts.includes(n) && !exclusions.some(([a, b = a]) => n >= a && n <= b)
         let address: number | undefined = undefined
         if(pool.hostIp){
           const hostAddress=isValidIpv4(pool.hostIp)?ipToNumber(pool.hostIp):0
           if(!hostAddress||!isInSameSubnet(pool.hostIp,pool.network,pool.hostMask??pool.mask))return {reason:`DHCP: reserved host address ${pool.hostIp} is invalid or outside pool ${pool.name}.`}
           if(used.has(hostAddress)||reserved.includes(hostAddress)||otherReservedHosts.includes(hostAddress))return {reason:`DHCP: reserved host address ${pool.hostIp} for ${client.name} is already in use or assigned to another reservation.`}
           address=hostAddress
         }else for (let n = Math.max(start, base + 1), count = 0; n <= Math.min(end, last - 1) && count < 65536; n++, count++) {
           if (available(n)) { address = n; break }
         }
         if (address !== undefined) {
           return {
             lease: {
               serverId: server.id,
               portId: cp.id,
               ipAddress: numberToIp(address),
               mask: pool.hostMask??pool.mask,
               gateway: pool.defaultRouter || incoming.ipAddress,
               dns: pool.dnsServer,
               leaseDurationSeconds: pool.leaseDurationSeconds ?? 86400,
             },
             reason: `DHCP lease assigned via DHCP Relay (${d.name} ${incoming.name} -> ${helperIp}).`,
           }
         }
       }
       const reservationError=reservationMismatch(pools,incoming.ipAddress)
       if(reservationError)return {reason:reservationError}
     }else{
       relayFailureReason=`DHCP: ip helper-address ${helperIp} configured on ${d.name} ${incoming.name} (VLAN ${incoming.virtualVlan??vlan}) does not identify an active server interface.`
     }
   }
   const reservationError=reservationMismatch(poolsFor(d),incoming?.ipAddress)
   if(reservationError)return {reason:reservationError}
   continue
  }
  for(const link of links){if(!tree.forwardingLinks.has(link.id))continue;const next=link.fromDeviceId===d.id?link.toDeviceId:link.toDeviceId===d.id?link.fromDeviceId:null;if(!next||seen.has(next))continue;seen.add(next);queue.push({id:next,portId:link.fromDeviceId===d.id?link.toPortId:link.fromPortId})}
 }
 if(relayFailureReason)return {reason:relayFailureReason}
 return {reason:'DHCP: no reachable pool matches the client broadcast domain. Check VLANs, pool network, and relay reachability.'}
}
