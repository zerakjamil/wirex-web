import type { NetworkDevice } from '../types/network'
import { stripMacAgingRuntime } from './macLearning'

export function stripRoutingRuntime(devices: NetworkDevice[]) {
  return devices.map(d => {
    const ports=d.ports.map(port=>port.stpState||port.stpSinceTick!==undefined||port.stpVlanStates||port.hsrpRuntime?{...port,stpState:undefined,stpSinceTick:undefined,stpVlanStates:undefined,hsrpRuntime:undefined}:port)
    const macTable=stripMacAgingRuntime(d.macTable)
    const routingRuntime=d.stpRuntime||d.ospf||d.rip||d.eigrp||d.bgp||d.routingTable.some(r=>r.type!=='C'&&r.type!=='S')
    return routingRuntime||ports.some((port,index)=>port!==d.ports[index])||macTable.some((entry,index)=>entry!==d.macTable[index])
      ? {...d,ports,macTable,stpRuntime:undefined,ospf:undefined,rip:undefined,eigrp:undefined,bgp:undefined,routingTable:d.routingTable.filter(r=>r.type==='C'||r.type==='S')}
      :d
  })
}
