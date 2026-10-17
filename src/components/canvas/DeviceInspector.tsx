'use client'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useState } from 'react'
import { useI18n } from '@/i18n/useI18n'

export function DeviceInspector() {
  const { t } = useI18n()
  const [table,setTable]=useState<'Interfaces'|'ARP'|'MAC'|'Routes'>('Interfaces')
  const id=useWorkspaceStore(state=>state.inspectedDeviceId)
  const device=useNetworkStore(state=>state.devices.find(d=>d.id===id))
  if(!device)return null
  return <aside className="pt-device-inspector" aria-label={`Inspect ${device.name}`}>
    <header><strong>{device.name} ({device.model})</strong><button aria-label={t('Close inspector')} onClick={()=>useWorkspaceStore.setState({inspectedDeviceId:null})}>×</button></header>
    <p>Hostname: {device.config.hostname || device.name} · Power: {device.power===false?'Off':'On'}</p>
    <div className="pt-inspector-tabs" role="tablist" aria-label={t('Device tables')}>{(['Interfaces','ARP','MAC','Routes'] as const).map(name=><button key={name} role="tab" aria-selected={table===name} className="pt-button" onClick={()=>setTable(name)}>{t(name)}</button>)}</div>
    <div className="pt-inspector-table" role="tabpanel" aria-label={table}>
      {table==='Interfaces' && <table><thead><tr><th>{t('Interface')}</th><th>{t('Link')}</th><th>{t('IP address')}</th><th>{t('MAC address')}</th><th>{t('VLAN')}</th></tr></thead><tbody>{device.ports.map(port=><tr key={port.id}><td>{port.name}</td><td>{port.adminStatus==='down'?t('Admin down'):port.status}</td><td>{port.ipAddress || ''}</td><td>{port.macAddress || ''}</td><td>{port.voiceVlan?`${port.vlan || 1} / Voice ${port.voiceVlan}`:port.vlan || ''}</td></tr>)}</tbody></table>}
      {table==='ARP' && <table><thead><tr><th>{t('IP address')}</th><th>{t('MAC address')}</th><th>{t('Interface')}</th></tr></thead><tbody>{device.arpTable.map((entry,index)=><tr key={index}><td>{entry.ipAddress}</td><td>{entry.macAddress}</td><td>{entry.interfaceName}</td></tr>)}</tbody></table>}
      {table==='MAC' && <table><thead><tr><th>{t('MAC address')}</th><th>{t('Port')}</th><th>{t('VLAN')}</th></tr></thead><tbody>{device.macTable.map((entry,index)=><tr key={index}><td>{entry.macAddress}</td><td>{device.ports.find(p=>p.id===entry.portId)?.name || entry.portId}</td><td>{entry.vlan}</td></tr>)}</tbody></table>}
      {table==='Routes' && <table><thead><tr><th>{t('Type')}</th><th>{t('Network')}</th><th>{t('Netmask')}</th><th>{t('Next hop')}</th><th>{t('Interface')}</th></tr></thead><tbody>{device.routingTable.map((entry,index)=><tr key={index}><td>{entry.type}</td><td>{entry.network}</td><td>{entry.netmask}</td><td>{entry.nextHop}</td><td>{entry.interfaceName}</td></tr>)}</tbody></table>}
      {table!=='Interfaces' && (table==='ARP'?device.arpTable:table==='MAC'?device.macTable:device.routingTable).length===0 && <p>{table==='Routes'?t('No routes configured. Configure an IP interface or a static route in CLI.'):table==='ARP'?t('No ARP entries learned. Send traffic through this device to populate the table.'):t('No MAC entries learned. Send traffic through this device to populate the table.')}</p>}
    </div>
    <button className="pt-button" onClick={()=>useNetworkStore.getState().setActiveModal({type:'device',deviceId:device.id})}>{t('Open device window')}</button>
  </aside>
}
