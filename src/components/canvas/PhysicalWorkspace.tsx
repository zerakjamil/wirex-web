'use client'
import { useMemo, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { CiscoIcon, type IconName } from '../cisco/CiscoIcon'
import { Cisco3DIcon } from './Cisco3DIcons'
import { useI18n } from '@/i18n/useI18n'
import { containerById, containerLabelPath, containerSubtreeIds, containersByParent, deviceContainer, PHYSICAL_KIND_LABELS } from '@/simulator/physical'
import type { NetworkDevice, PhysicalContainer, PhysicalContainerKind } from '@/types/network'

const KIND_ICONS: Record<PhysicalContainerKind, IconName> = { city: 'city', building: 'building', closet: 'physical', rack: 'rack', table: 'table' }
const NAVIGABLE = new Set<PhysicalContainerKind>(['city', 'building', 'closet'])
export const PHYSICAL_DEVICE_MIME = 'application/x-wirex-device'

export function PhysicalWorkspace() {
  const { t } = useI18n()
  const containers = useNetworkStore(state => state.physicalContainers)
  const assignment = useNetworkStore(state => state.physicalAssignment)
  const devices = useNetworkStore(state => state.devices)
  const moveDeviceToContainer = useNetworkStore(state => state.moveDeviceToContainer)
  const setActiveModal = useNetworkStore(state => state.setActiveModal)
  const setActiveTab = useNetworkStore(state => state.setActiveTab)
  const physicalPath = useWorkspaceStore(state => state.physicalPath)
  const enterPhysicalContainer = useWorkspaceStore(state => state.enterPhysicalContainer)
  const [moveMenu, setMoveMenu] = useState<{ deviceId: string; x: number; y: number } | null>(null)

  const placement = useMemo(() => new Map(devices.map(device => [device.id, deviceContainer(containers, assignment, device.id)?.id ?? null])), [containers, assignment, devices])
  const path = physicalPath.filter(id => containerById(containers, id))
  let current: PhysicalContainer | null = path.length ? containerById(containers, path[path.length - 1]) ?? null : null
  while (current && !NAVIGABLE.has(current.kind)) current = containerById(containers, current.parentId) ?? null

  const devicesIn = (containerId: string) => devices.filter(device => placement.get(device.id) === containerId)
  const subtreeCount = (containerId: string) => {
    const ids = containerSubtreeIds(containers, containerId)
    return devices.filter(device => { const target = placement.get(device.id); return !!target && ids.has(target) }).length
  }
  const commitMove = (deviceId: string, container: PhysicalContainer) => {
    const device = devices.find(candidate => candidate.id === deviceId)
    if (!device) return
    useWorkspaceStore.getState().checkpoint()
    moveDeviceToContainer(deviceId, container.id)
    useWorkspaceStore.getState().setStatus(`${device.name} moved to ${containerLabelPath(containers, container.id) || container.name}.`)
    setMoveMenu(null)
  }
  const dropProps = (container: PhysicalContainer) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(PHYSICAL_DEVICE_MIME)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    },
    onDrop: (event: React.DragEvent) => {
      const deviceId = event.dataTransfer.getData(PHYSICAL_DEVICE_MIME)
      if (!deviceId) return
      event.preventDefault()
      commitMove(deviceId, container)
    },
  })
  const openDevice = (deviceId: string) => { setActiveTab('physical'); setActiveModal({ type: 'device', deviceId }) }
  const openMoveMenu = (deviceId: string, event: React.MouseEvent) => {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setMoveMenu({ deviceId, x: Math.min(bounds.left, window.innerWidth - 260), y: Math.min(bounds.bottom + 4, window.innerHeight - 200) })
  }
  const deviceRow = (container: PhysicalContainer) => function DeviceRow(device: NetworkDevice, index: number) {
    return <div key={device.id} draggable data-device-id={device.id} data-container-id={container.id} className="pt-rack-device" role="button" tabIndex={0}
      onDragStart={event => { event.dataTransfer.setData(PHYSICAL_DEVICE_MIME, device.id); event.dataTransfer.effectAllowed = 'move' }}
      onClick={() => openDevice(device.id)}
      onKeyDown={event => { if (event.key === 'Enter') openDevice(device.id) }}
      title={t('Open the device physical view')}>
      <span className="pt-rack-unit" aria-hidden="true">{index + 1}</span>
      <Cisco3DIcon type={device.type} model={device.model} size={36} />
      <span className="pt-rack-device-name">{device.name}</span>
      <span className="pt-rack-device-model">{device.model}</span>
      <button type="button" className="pt-device-move" aria-label={t('Move Device')} title={t('Move Device')}
        onClick={event => { event.stopPropagation(); openMoveMenu(device.id, event) }}>
        <CiscoIcon name="move" size={14} />
      </button>
    </div>
  }
  const containerPanel = (container: PhysicalContainer) => {
    const rows = devicesIn(container.id)
    if (container.kind === 'rack') return <div key={container.id} className="pt-physical-rack" data-container-id={container.id} data-kind={container.kind} {...dropProps(container)}>
      {panelHeader(container)}
      <div className="pt-rack-units">{rows.map(deviceRow(container))}</div>
      {rows.length === 0 && <p className="pt-container-empty">{t('No devices in this container yet. Drag a device here, or use Move on another device.')}</p>}
    </div>
    return <div key={container.id} className="pt-physical-table" data-container-id={container.id} data-kind={container.kind} {...dropProps(container)}>
      {panelHeader(container)}
      <div className="pt-table-devices">{rows.map(deviceRow(container))}</div>
      {rows.length === 0 && <p className="pt-container-empty">{t('No devices in this container yet. Drag a device here, or use Move on another device.')}</p>}
    </div>
  }
  const panelHeader = (container: PhysicalContainer) => <div className="pt-container-panel-header">
    <CiscoIcon name={KIND_ICONS[container.kind]} size={16} />
    <input className="pt-container-name-input" aria-label={t('Container name')} value={container.name}
      onFocus={() => useWorkspaceStore.getState().checkpoint()}
      onChange={event => useNetworkStore.getState().renamePhysicalContainer(container.id, event.target.value)} />
    <span className="pt-container-kind">{t(PHYSICAL_KIND_LABELS[container.kind])}</span>
    <button type="button" title={t('Delete Container')} aria-label={t('Delete Container')} onClick={() => {
      const store = useWorkspaceStore.getState()
      store.checkpoint()
      useNetworkStore.getState().deletePhysicalContainer(container.id)
      store.setStatus(`${container.name} was removed. Undo restores.`)
    }}><CiscoIcon name="delete" size={16} /></button>
  </div>

  if (current && (current.kind === 'rack' || current.kind === 'table')) return null

  if (current && current.kind === 'closet') {
    const children = containersByParent(containers, current.id)
    const racks = children.filter(container => container.kind === 'rack')
    const tables = children.filter(container => container.kind === 'table')
    return <div className="pt-physical-workspace">
      <p className="pt-physical-hint">{t('Drag devices between racks and tables, or use Move to send a device to another container.')}</p>
      {/* Closets show every rack and table side by side so devices can be dragged between them. */}
      <div className="pt-closet-row">
        {racks.map(containerPanel)}
        {tables.map(containerPanel)}
      </div>
      {children.length === 0 && <p className="pt-container-empty">{t('No racks or tables here yet. Create one with the buttons above.')}</p>}
      {moveMenu && moveMenuLayer()}
    </div>
  }

  const children = containersByParent(containers, current?.id ?? null)
  return <div className="pt-physical-workspace">
    {current && <h2>{current.name}</h2>}
    <div className="pt-container-grid">
      {children.map(container => <button key={container.id} type="button" className="pt-container-tile" data-container-id={container.id} data-kind={container.kind}
        onClick={() => enterPhysicalContainer(container.id)} title={t('Open this container')}>
        <CiscoIcon name={KIND_ICONS[container.kind]} size={34} />
        <span className="pt-container-name">{container.name}</span>
        <span className="pt-container-kind">{t(PHYSICAL_KIND_LABELS[container.kind])}</span>
        <span className="pt-container-count">{subtreeCount(container.id)} {t('devices')}</span>
      </button>)}
    </div>
    {children.length === 0 && <p className="pt-container-empty">{t('No containers here yet. Create one with the buttons above.')}</p>}
    {moveMenu && moveMenuLayer()}
  </div>

  function moveMenuLayer() {
    const menu = moveMenu!
    const targets = containers.filter(container => container.kind === 'rack' || container.kind === 'table')
    const device = devices.find(candidate => candidate.id === menu.deviceId)
    return <>
      <div className="pt-move-backdrop" onClick={() => setMoveMenu(null)} />
      <div className="pt-device-move-menu" role="dialog" aria-label={t('Move Device')} style={{ left: menu.x, top: menu.y }}>
        <header>{t('Move Device')}{device ? ` — ${device.name}` : ''}</header>
        {targets.map(container => <button key={container.id} type="button" data-target-id={container.id}
          aria-current={placement.get(menu.deviceId) === container.id} onClick={() => commitMove(menu.deviceId, container)}>
          <CiscoIcon name={KIND_ICONS[container.kind]} size={14} />
          <span>{containerLabelPath(containers, container.id)}</span>
        </button>)}
        <button type="button" className="pt-move-cancel" onClick={() => setMoveMenu(null)}>{t('Cancel')}</button>
      </div>
    </>
  }
}
