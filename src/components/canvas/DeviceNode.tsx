'use client'

import React from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { NetworkDevice } from '@/types/network'
import { useNetworkStore } from '@/store/networkStore'
import { Cisco3DIcon } from './Cisco3DIcons'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useShallow } from 'zustand/react/shallow'
import { useVoiceStore } from '@/store/voiceStore'
import { useI18n } from '@/i18n/useI18n'

export type DeviceNodeType = Node<{ device: NetworkDevice }, 'deviceNode'>

export function DeviceNode({ data, selected }: NodeProps<DeviceNodeType>) {
  const { t } = useI18n()
  const device = (data as { device: NetworkDevice }).device
  const { setActiveModal, setSelectedDevice, activeTool, connectingSource, setConnectingSource, autoConnectDevices } = useNetworkStore(useShallow(state => ({
    setActiveModal: state.setActiveModal, setSelectedDevice: state.setSelectedDevice,
    activeTool: state.activeTool, connectingSource: state.connectingSource,
    setConnectingSource: state.setConnectingSource, autoConnectDevices: state.autoConnectDevices,
  })))
  const workspace = useWorkspaceStore()

  const handleDeviceClick = (e: React.MouseEvent) => {
    if(!['select','marquee'].includes(workspace.tool))e.stopPropagation()
    setSelectedDevice(device.id)

    if (workspace.tool === 'delete') { workspace.requestDeletion({deviceIds:[device.id]}); return }
    if (workspace.tool === 'inspect') {
      useWorkspaceStore.setState({inspectedDeviceId:device.id});return
    }
    if (workspace.tool === 'pdu' || workspace.tool === 'complex-pdu') {
      if (workspace.pduSource === device.id) {
        useWorkspaceStore.setState({ pduSource: null, status: 'Select source device for PDU, or click canvas / press Esc to cancel' })
        return
      }
      if (!workspace.pduSource) {
        workspace.selectPduSource(device.id)
        return
      }
      if (workspace.tool === 'complex-pdu') {
        useWorkspaceStore.setState({ pduDestination: device.id, dialog: 'complex-pdu' })
      } else {
        const source=workspace.pduSource
        workspace.setTool('select')
        workspace.firePdu(source, device.id)
      }
      return
    }

    if (activeTool === 'cable-auto') {
      if (!connectingSource) {
        setConnectingSource({ deviceId: device.id })
      } else if (connectingSource.deviceId !== device.id) {
        workspace.checkpoint()
        autoConnectDevices(connectingSource.deviceId, device.id)
      }
      return
    }

    if (activeTool.startsWith('cable-')) {
      if (!connectingSource) {
        setConnectingSource({ deviceId: device.id })
      } else if (connectingSource.deviceId !== device.id) {
        setActiveModal({
          type: 'port-select',
          sourceDeviceId: connectingSource.deviceId,
          targetDeviceId: device.id,
        })
      }
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if(workspace.tool!=='select')return
    if (device.type === 'phone') { useNetworkStore.getState().setActiveTab('gui');useVoiceStore.getState().openPhone(device.id) }
    setActiveModal({ type: 'device', deviceId: device.id })
  }

  const primaryPort = device.ports.find((p) => p.ipAddress)

  return (
    <div
      onClick={handleDeviceClick}
      onDoubleClick={handleDoubleClick}
      role="button"
      tabIndex={0}
      aria-label={`Open ${device.name}`}
      onKeyDown={event => {
        if(event.key==='Enter' || event.key===' ') {
          event.preventDefault()
          if(workspace.tool === 'select') { if(device.type==='phone')useVoiceStore.getState().openPhone(device.id);setActiveModal({type:'device',deviceId:device.id}) }
          else handleDeviceClick(event as unknown as React.MouseEvent)
        }
      }}
      onPointerEnter={(e) => {
        if (!workspace.placement && !connectingSource && (workspace.tool === 'select' || workspace.tool === 'inspect')) {
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }
      }}
      onPointerMove={(e) => {
        if (!workspace.placement && !connectingSource && (workspace.tool === 'select' || workspace.tool === 'inspect')) {
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }
      }}
      onPointerLeave={() => {
        workspace.setHoveredConnection(null)
      }}
      className={`relative flex flex-col items-center p-1.5 rounded transition-all cursor-pointer select-none min-w-[70px] ${
        selected
          ? 'outline-2 outline-dashed outline-sky-600 bg-sky-500/10'
          : 'hover:bg-slate-500/10'
      } ${
        workspace.pduSource === device.id
          ? 'ring-2 ring-amber-500 bg-amber-500/15 shadow-md shadow-amber-500/20'
          : ['pdu', 'complex-pdu'].includes(workspace.tool)
          ? workspace.pduSource
            ? 'hover:ring-2 hover:ring-sky-500 hover:bg-sky-500/10'
            : 'hover:ring-2 hover:ring-amber-500 hover:bg-amber-500/10'
          : ''
      }`}
    >
      {/* PDU Source Floating Badge */}
      {workspace.pduSource === device.id && (
        <div className="absolute -top-3 z-30 flex items-center gap-1 bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border border-amber-300 animate-bounce pointer-events-none select-none">
          <span>✉</span>
          <span>{t('PDU Source')}</span>
        </div>
      )}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-sky-600 hover:!bg-emerald-500 !w-3 !h-3 !border-2 !border-white transition-all hover:scale-175 shadow-xs cursor-crosshair"
        onPointerEnter={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerLeave={() => workspace.setHoveredConnection(null)}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-sky-600 hover:!bg-emerald-500 !w-3 !h-3 !border-2 !border-white transition-all hover:scale-175 shadow-xs cursor-crosshair"
        onPointerEnter={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerLeave={() => workspace.setHoveredConnection(null)}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-sky-600 hover:!bg-emerald-500 !w-3 !h-3 !border-2 !border-white transition-all hover:scale-175 shadow-xs cursor-crosshair"
        onPointerEnter={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerLeave={() => workspace.setHoveredConnection(null)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-sky-600 hover:!bg-emerald-500 !w-3 !h-3 !border-2 !border-white transition-all hover:scale-175 shadow-xs cursor-crosshair"
        onPointerEnter={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerMove={(e) => {
          e.stopPropagation()
          workspace.setHoveredConnection({
            clientX: e.clientX,
            clientY: e.clientY,
            deviceId: device.id,
            mode: 'device',
          })
        }}
        onPointerLeave={() => workspace.setHoveredConnection(null)}
      />

      {/* 3D Isometric Cisco Hardware Graphic */}
      <div className="w-16 h-14 flex items-center justify-center">
        <Cisco3DIcon
          type={device.type}
          model={device.model}
          size={56}
          isPowerOn={device.power !== false}
        />
      </div>

      {/* Device label styling - clean, transparent, no opaque background blocking cables */}
      <div className="flex flex-col items-center leading-tight mt-1 text-center pointer-events-none select-none">
        <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 font-sans tracking-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {device.config.hostname || device.name}
        </span>
        {device.model && device.model !== (device.config.hostname || device.name) && (
          <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-sans tracking-tight">
            {device.model}
          </span>
        )}
        {device.power === false && (
          <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
            {t('[POWER OFF]')}
          </span>
        )}
        {primaryPort?.ipAddress && (
          <span className="text-[9px] font-mono text-sky-700 dark:text-sky-300 font-medium mt-0.5">
            {primaryPort.ipAddress}
          </span>
        )}
      </div>

      {/* Touch-Friendly Action Button (Fosters mobile phone study) */}
      {selected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setActiveModal({ type: 'device', deviceId: device.id })
          }}
          className="mt-1 px-2.5 py-1 bg-[#0284c7] hover:bg-[#0369a1] active:bg-[#075985] text-white text-[10px] font-bold rounded shadow-md cursor-pointer flex items-center gap-1 z-30 transition animate-in fade-in"
          title={t('Open CLI / Config')}
        >
          <span>⌨</span>
          <span>{device.type === 'pc' || device.type === 'server' ? t('Open Desktop') : t('Open CLI')}</span>
        </button>
      )}
    </div>
  )
}
