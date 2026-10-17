import type { NetworkDevice } from '../types/network'
import { stripMacAgingRuntime } from './macLearning'

export function stripRoutingRuntime(devices: NetworkDevice[]) {
  return devices.map(d => {
    const ports=d.ports.map(port=>port.stpState||port.stpSinceTick!==undefined||port.stpVlanStates||port.hsrpRuntime?{...port,stpState:undefined,stpSinceTick:undefined,stpVlanStates:undefined,hsrpRuntime:undefined}:port)
    const macTable=stripMacAgingRuntime(d.macTable)
    const routingRuntime=d.stpRuntime||d.ospf||d.rip||d.routingTable.some(r=>r.type==='O'||r.type==='R')
    return routingRuntime||ports.some((port,index)=>port!==d.ports[index])||macTable.some((entry,index)=>entry!==d.macTable[index])
      ? {...d,ports,macTable,stpRuntime:undefined,ospf:undefined,rip:undefined,routingTable:d.routingTable.filter(r=>r.type!=='O'&&r.type!=='R')}
      :d
  })
}
