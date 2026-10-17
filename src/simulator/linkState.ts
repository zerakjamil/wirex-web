import type { NetworkDevice, NetworkLink, LinkStatus } from '@/types/network'

export function synchronizeLinkState(devices: NetworkDevice[], links: NetworkLink[], simulationTick=0) {
  const byId = new Map(devices.map(device => [device.id, device]))
  const states = new Map<string, LinkStatus[]>()
  const updatedLinks = links.map(link => {
    const from = byId.get(link.fromDeviceId)
    const to = byId.get(link.toDeviceId)
    const a = from?.ports.find(port => port.id === link.fromPortId)
    const b = to?.ports.find(port => port.id === link.toPortId)
    const physicallyUp = from && to && a && b && from.power !== false && to.power !== false && a.adminStatus === 'up' && b.adminStatus === 'up'
    const status: LinkStatus = physicallyUp ? 'up' : 'down'
    for (const [deviceId, portId] of [[link.fromDeviceId, link.fromPortId], [link.toDeviceId, link.toPortId]]) {
      const key = `${deviceId}|${portId}`
      states.set(key, [...(states.get(key) || []), status])
    }
    return link.status === status ? link : { ...link, status }
  })
  const updatedDevices = devices.map(device => {
    let changed = false
    const ports = device.ports.map(port => {
      let stpState = port.stpState ?? (port.status === 'learning' ? 'listening' : undefined)
      let stpSinceTick=port.stpSinceTick
      let stpVlanStates=port.stpVlanStates
      const connections = states.get(`${device.id}|${port.id}`) || []
      if(device.type==='switch'){
        if(!connections.includes('up')){stpState=undefined;stpSinceTick=undefined;stpVlanStates=undefined}
        else if(port.portfast||device.config.portfastDefault){stpState='forwarding';stpSinceTick=simulationTick;stpVlanStates=undefined}
        else if(port.status!=='up'){stpState='listening';stpSinceTick=simulationTick;stpVlanStates=undefined}
      }
      if(device.type!=='switch'){stpState=undefined;stpSinceTick=undefined;stpVlanStates=undefined}
      const vlan=port.virtualVlan
      const parentUp = port.parentPortId && device.ports.some(parent => parent.id === port.parentPortId && parent.adminStatus === 'up' && states.get(`${device.id}|${parent.id}`)?.includes('up'))
      const sviUp=vlan!==undefined&&device.config.vlans?.some(v=>v.id===vlan)&&device.ports.some(member=>member.virtualVlan===undefined&&member.adminStatus==='up'&&states.get(`${device.id}|${member.id}`)?.includes('up')&&(member.portMode==='trunk'?(!member.allowedVlans||member.allowedVlans.includes(vlan)):(member.vlan??1)===vlan))
      const status: LinkStatus = device.power === false || port.adminStatus === 'down' ? 'down'
        : port.parentPortId ? (parentUp && port.dot1qVlan !== undefined ? 'up' : 'down') : vlan!==undefined?(sviUp?'up':'down'):connections.includes('up') ? 'up' : connections.includes('learning') ? 'learning' : 'down'
      if (status === port.status && stpState === port.stpState && stpSinceTick===port.stpSinceTick && stpVlanStates===port.stpVlanStates) return port
      changed = true
      return { ...port, status, stpState, stpSinceTick,stpVlanStates }
    })
    return changed ? { ...device, ports } : device
  })
  return { devices: updatedDevices, links: updatedLinks }
}
