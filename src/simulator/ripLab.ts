import { getOspfPracticeLab } from './ospfLab'

export function getRipPracticeLab() {
  const lab = getOspfPracticeLab()
  for (const d of lab.devices.filter(d => d.type === 'router')) {
    d.config.ospfNetworks = []; d.config.ospfProcessId = undefined; d.config.ospfRouterId = undefined
    d.config.ospfPassiveInterfaces = []
    d.config.ripVersion = 2; d.config.ripAutoSummary = false
    d.config.ripNetworks = ['10.0.0.0', '192.168.1.0', '192.168.3.0']
    d.config.ripPassiveInterfaces = d.ports.filter(p => p.ipAddress?.startsWith('192.168.')).map(p => p.name)
    for (const p of d.ports) { delete p.ospfCost; delete p.ospfNetworkType }
  }
  lab.annotations[0].title = 'RIPv2 hop-count routing'
  lab.annotations[0].text = 'show ip protocols\nshow ip route\n\nStudent-A: ping 192.168.3.10\n\nR1: shut Gi0/2. The remote LAN changes from 1 hop to 2 via R2.\nRestore with no shutdown.'
  return lab
}
