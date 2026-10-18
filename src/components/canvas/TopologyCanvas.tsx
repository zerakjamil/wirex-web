'use client'

import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  type NodeTypes,
  type EdgeTypes,
  Edge,
  OnNodesChange,
  Connection,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  useStore,
  SelectionMode,
} from '@xyflow/react'
import { useNetworkStore } from '@/store/networkStore'
import { DeviceNode } from './DeviceNode'
import { AnnotationNode } from './AnnotationNode'
import { ClusterNode } from './ClusterNode'
import { CableEdge } from './CableEdge'
import { PhysicalWorkspace } from './PhysicalWorkspace'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { newWorkspace, saveWorkspace } from '@/store/workspaceStore'
import { Cisco3DIcon } from './Cisco3DIcons'
import { useShallow } from 'zustand/react/shallow'
import { createCanvasNodes, getTopologyFitNodes, selectCanvasDevices, type NodeMeasurements } from './canvasNodes'
import { makeDrawing } from './drawingGeometry'
import { DeviceInspector } from './DeviceInspector'
import { ConnectionHoverCard } from './ConnectionHoverCard'
import {getStpTopology} from '@/simulator/spanningTree'
import {useTrainingStore} from '@/store/trainingStore'
import {useActivityStore} from '@/store/activityStore'
import { useI18n } from '@/i18n/useI18n'

const nodeTypes = {
  deviceNode: DeviceNode as NodeTypes[string],
  annotationNode: AnnotationNode as NodeTypes[string],
  clusterNode: ClusterNode as NodeTypes[string],
}

const edgeTypes = {
  cableEdge: CableEdge as EdgeTypes[string],
}

function InnerTopologyCanvas() {
  const { t } = useI18n()
  const {
    devices,
    links,
    annotations,
    updateDevicePosition,
    deleteDevice,
    updateAnnotation,
    deleteAnnotation,
    addAnnotation,
    activeTool,
    setActiveModal,
    connectingSource,
    setConnectingSource,
    tickSimulation,
    simulationMode,
    simulationPlaying,
    setSimulationPlaying,
    inFlightPackets,
    stepSimulation,
    clusters,
  } = useNetworkStore(useShallow(state => ({
    devices: selectCanvasDevices(state.devices), links: state.links, annotations: state.annotations,
    clusters: state.clusters,
    updateDevicePosition: state.updateDevicePosition, deleteDevice: state.deleteDevice,
    updateAnnotation: state.updateAnnotation, deleteAnnotation: state.deleteAnnotation,
    addAnnotation: state.addAnnotation, activeTool: state.activeTool,
    setActiveModal: state.setActiveModal,
    connectingSource: state.connectingSource, setConnectingSource: state.setConnectingSource,
    tickSimulation: state.tickSimulation,
    simulationMode: state.simulationMode,
    simulationPlaying: state.simulationPlaying,
    setSimulationPlaying: state.setSimulationPlaying,
    inFlightPackets: state.inFlightPackets,
    stepSimulation: state.stepSimulation,
  })))

  const { screenToFlowPosition, zoomIn, zoomOut, setViewport, getViewport, fitView } = useReactFlow()
  const workspace = useWorkspaceStore()
  const [measurements, setMeasurements] = useState<NodeMeasurements>({})
  const nodesInitialized = useNodesInitialized()
  const canvasWidth=useStore(s=>s.width),canvasHeight=useStore(s=>s.height)
  const trainingActive=useTrainingStore(s=>s.active)
  const fitted = useRef({ initialized: false, sequence: -1,width:0,height:0,ids:'' })
  const [placementPointer,setPlacementPointer]=useState<{x:number;y:number}|null>(null)
  const drawing = useRef<{ tool: 'rect' | 'ellipse' | 'line' | 'freeform'; points: {x:number;y:number}[] } | null>(null)
  const [drawingPreview, setDrawingPreview] = useState<{x:number;y:number}[]>([])
  const selectedIds = useMemo(() => new Set(workspace.canvasSelectionIds), [workspace.canvasSelectionIds])

  useEffect(()=>useWorkspaceStore.subscribe((state,previous)=>{
    if(state.tool===previous.tool)return
    drawing.current=null
    setDrawingPreview([])
  }),[])

  // Logical clusters filter the canvas: inside a cluster only its devices and internal links show.
  const activeCluster = workspace.activeClusterId ? clusters.find(cluster => cluster.id === workspace.activeClusterId) ?? null : null
  const memberIds = useMemo(() => activeCluster ? new Set(activeCluster.deviceIds) : null, [activeCluster])
  const visibleDevices = useMemo(() => memberIds ? devices.filter(device => memberIds.has(device.id)) : devices, [devices, memberIds])
  const visibleLinks = useMemo(() => memberIds ? links.filter(link => memberIds.has(link.fromDeviceId) && memberIds.has(link.toDeviceId)) : links, [links, memberIds])
  const visibleAnnotations = useMemo(() => memberIds ? [] : annotations, [annotations, memberIds])
  const zoneClusters = useMemo(() => activeCluster ? [] : clusters, [activeCluster, clusters])

  useEffect(() => {
    const action = workspace.canvasAction?.kind
    const viewport = getViewport()
    if (action === 'zoom-in') void zoomIn()
    if (action === 'zoom-out') void zoomOut()
    if (action === 'zoom-reset') void setViewport({ ...viewport, zoom: 1 })
    if (action?.startsWith('pan-')) void setViewport({ ...viewport, x: viewport.x + (action === 'pan-left' ? 100 : action === 'pan-right' ? -100 : 0), y: viewport.y + (action === 'pan-up' ? 100 : action === 'pan-down' ? -100 : 0) })
  }, [workspace.canvasAction, getViewport, zoomIn, zoomOut, setViewport, fitView])

  const fitNodes = useMemo(() => getTopologyFitNodes(visibleDevices, visibleLinks), [visibleDevices, visibleLinks])
  const topologyIds = visibleDevices.map(device => device.id).join('|') + '|' + (activeCluster?.id ?? '')

  const doFitView = useCallback((duration = 200) => {
    if (visibleDevices.length === 0) return
    const targetNodes = fitNodes.length ? fitNodes : undefined
    void fitView({
      nodes: targetNodes,
      padding: 0.18,
      minZoom: 0.35,
      maxZoom: 1.15,
      duration,
    })
  }, [visibleDevices.length, fitNodes, fitView])

  useEffect(() => {
    if (workspace.view !== 'logical' || devices.length === 0) return
    if (!canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) return

    const action = workspace.canvasAction
    const fitRequested = action?.kind === 'fit' || action?.kind === 'fit-topology'
    const alreadyFitted =
      fitted.current.initialized &&
      fitted.current.ids === topologyIds &&
      fitted.current.width === canvasWidth &&
      fitted.current.height === canvasHeight &&
      (!fitRequested || fitted.current.sequence === action?.sequence)

    if (alreadyFitted) return

    fitted.current = {
      initialized: true,
      sequence: action?.sequence ?? -1,
      width: canvasWidth,
      height: canvasHeight,
      ids: topologyIds,
    }

    doFitView(200)

    const timer = setTimeout(() => {
      doFitView(150)
    }, 250)
    return () => clearTimeout(timer)
  }, [topologyIds, workspace.view, workspace.canvasAction, canvasWidth, canvasHeight, doFitView, devices.length])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const workspace=useWorkspaceStore.getState()
      if (event.key === 'Escape') {
        drawing.current=null
        setDrawingPreview([])
        setActiveModal(null)
        workspace.setDialog(null)
        useWorkspaceStore.setState({ pduSource: null })
        workspace.setTool('select')
        setConnectingSource(null)
      }
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.altKey) return
      if (!(event.metaKey || event.ctrlKey)) {
        if (event.shiftKey && event.key.toLowerCase() === 'u') {
          event.preventDefault()
          workspace.createClusterFromSelection()
          return
        }
        if (event.shiftKey && event.key.toLowerCase() === 'b') {
          event.preventDefault()
          workspace.createPhysicalContainer('building')
          return
        }
        if (event.key.toLowerCase() === 'p') {
          event.preventDefault()
          workspace.setTool(workspace.tool === 'pdu' ? 'select' : 'pdu')
        }
        return
      }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); saveWorkspace() }
      if (event.key.toLowerCase() === 'o') { event.preventDefault(); document.getElementById('pt-open-file')?.click() }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); useActivityStore.getState().exit(); newWorkspace() }
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); workspace.copyDevice() }
      if (event.key.toLowerCase() === 'v') { event.preventDefault(); workspace.pasteDevice() }
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) workspace.redo(); else workspace.undo() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setActiveModal, setConnectingSource])

  useEffect(() => {
    const interval = setInterval(() => {
      tickSimulation()
    }, 60)
    return () => clearInterval(interval)
  }, [tickSimulation])

  const nodes = useMemo(() => createCanvasNodes(visibleDevices, visibleAnnotations, measurements, selectedIds, zoneClusters), [visibleAnnotations, visibleDevices, measurements, selectedIds, zoneClusters])

  const edges: Edge[] = useMemo(() => {
    const stp=getStpTopology(visibleDevices,visibleLinks,trainingActive?10:1)
    return visibleLinks.map((l) => ({
      id: l.id,
      source: l.fromDeviceId,
      target: l.toDeviceId,
      type: 'cableEdge',
      data: { link: l,sourceBlocked:stp.ports.get(`${l.fromDeviceId}|${l.fromPortId}`)?.state==='BLK',targetBlocked:stp.ports.get(`${l.toDeviceId}|${l.toPortId}`)?.state==='BLK' },
    }))
  }, [visibleLinks,visibleDevices,trainingActive])

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const selections=changes.filter(change=>change.type==='select')
      if(selections.length){
        const next=new Set(useWorkspaceStore.getState().canvasSelectionIds)
        for(const change of selections)if(change.type==='select'){if(change.selected)next.add(change.id);else next.delete(change.id)}
        useWorkspaceStore.getState().setCanvasSelection([...next])
      }
      const dimensions = changes.filter(change => change.type === 'dimensions' && change.dimensions)
      if (dimensions.length) setMeasurements(previous => {
        const next = { ...previous }
        let changed = false
        for (const change of dimensions) {
          if (change.type !== 'dimensions' || !change.dimensions) continue
          const before = next[change.id]
          if (before?.width === change.dimensions.width && before?.height === change.dimensions.height) continue
          next[change.id] = change.dimensions
          changed = true
        }
        return changed ? next : previous
      })
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          if (useNetworkStore.getState().annotations.some(a=>a.id===change.id)) {
            updateAnnotation(change.id, { x: change.position.x, y: change.position.y })
          } else {
            updateDevicePosition(change.id, change.position.x, change.position.y)
          }
        }
        if (change.type === 'remove') {
          if (useNetworkStore.getState().annotations.some(a=>a.id===change.id)) {
            deleteAnnotation(change.id)
          } else {
            deleteDevice(change.id)
          }
        }
      }
    },
    [updateDevicePosition, deleteDevice, updateAnnotation, deleteAnnotation]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        setActiveModal({
          type: 'port-select',
          sourceDeviceId: connection.source,
          targetDeviceId: connection.target,
        })
      }
    },
    [setActiveModal]
  )

  const handlePaneClick = (e: React.MouseEvent) => {
    if (connectingSource) {
      setConnectingSource(null)
    }
    if (workspace.tool === 'pdu' || workspace.tool === 'complex-pdu') {
      if (workspace.pduSource) {
        useWorkspaceStore.setState({ pduSource: null, status: 'Select source device for PDU, or click canvas / press Esc to cancel' })
      } else {
        workspace.setTool('select')
      }
    }
    if (activeTool === 'note') {
      const flowPos=screenToFlowPosition({x:e.clientX,y:e.clientY})
      workspace.openNoteEditor({x:flowPos.x,y:flowPos.y,text:''})
    }
  }

  const placeAtPointer=(clientX:number,clientY:number)=>{
    const position=screenToFlowPosition({x:clientX,y:clientY})
    workspace.placeDevice(position.x-40,position.y-36)
  }

  return (
    <div className={`w-full h-full relative bg-white pt-canvas-tool-${workspace.tool}`} onContextMenu={event=>event.preventDefault()} onDragOver={event=>{
      if(!workspace.placement || !event.dataTransfer.types.includes('application/x-wireforge-device'))return
      event.preventDefault()
      event.dataTransfer.dropEffect='copy'
    }} onDrop={event=>{
      if(!workspace.placement || !event.dataTransfer.types.includes('application/x-wireforge-device'))return
      event.preventDefault()
      placeAtPointer(event.clientX,event.clientY)
    }} onPointerDownCapture={event => {
      const tool=workspace.tool
      if(event.button!==0 || workspace.view !== 'logical' || !['rect','ellipse','line','freeform'].includes(tool)) return
      event.preventDefault(); event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      drawing.current={tool:tool as 'rect'|'ellipse'|'line'|'freeform',points:[{x:event.clientX,y:event.clientY}]}
    }} onPointerMove={event => {
      if(!drawing.current) return
      const point={x:event.clientX,y:event.clientY}
      const points=drawing.current.points
      if(drawing.current.tool==='freeform') {if(points.length<2048 && Math.hypot(point.x-points.at(-1)!.x,point.y-points.at(-1)!.y)>=2)points.push(point)}
      else drawing.current.points=[points[0],point]
      const bounds=event.currentTarget.getBoundingClientRect()
      setDrawingPreview(drawing.current.points.map(p=>({x:p.x-bounds.left,y:p.y-bounds.top})))
    }} onPointerCancel={()=>{drawing.current=null;setDrawingPreview([])}} onPointerUp={event => {
      const draft=drawing.current; if(!draft)return
      drawing.current=null;setDrawingPreview([])
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
      if(workspace.tool!==draft.tool)return
      if(draft.tool!=='freeform')draft.points=[draft.points[0],{x:event.clientX,y:event.clientY}]
      const annotation=makeDrawing(draft.tool,draft.points.map(point=>screenToFlowPosition(point)))
      if(!annotation)return
      workspace.checkpoint()
      addAnnotation(annotation)
      workspace.setTool('select')
    }}>
      {workspace.view === 'physical' ? <PhysicalWorkspace/> : <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onPaneClick={handlePaneClick}
        onBeforeDelete={({nodes,edges})=>{
          workspace.requestDeletion({deviceIds:nodes.filter(node=>node.type==='deviceNode').map(node=>node.id),annotationIds:nodes.filter(node=>node.type==='annotationNode').map(node=>node.id),linkIds:edges.map(edge=>edge.id)})
          return Promise.resolve(false)
        }}
        onNodeClick={(_,node)=>{if(node.type==='deviceNode')useNetworkStore.getState().setSelectedDevice(node.id)}}
        onNodeDoubleClick={(_,node)=>{if(node.type==='deviceNode')useNetworkStore.getState().setActiveModal({type:'device',deviceId:node.id})}}
        onEdgeClick={(_,edge)=>useNetworkStore.getState().setSelectedLink(edge.id)}
        onEdgesDelete={edges=>edges.forEach(edge=>useNetworkStore.getState().deleteLink(edge.id))}
        onNodeDragStart={() => workspace.checkpoint()}
        onSelectionDragStart={() => workspace.checkpoint()}
        panOnDrag={!workspace.placement && ['select','pan'].includes(workspace.tool)}
        selectionOnDrag={!workspace.placement && workspace.tool==='marquee'}
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={!workspace.placement && ['select','marquee'].includes(workspace.tool)?'Shift':null}
        multiSelectionKeyCode={['Shift','Meta','Control']}
        nodesDraggable={!workspace.placement && ['select','marquee'].includes(workspace.tool)}
        nodesConnectable={false}
        elementsSelectable={!workspace.placement && ['select','marquee'].includes(workspace.tool)}
        minZoom={0.2}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ nodes: fitNodes.length ? fitNodes : undefined, padding: 0.18, minZoom: 0.35, maxZoom: 1.15 }}
        defaultViewport={{ x: 0, y: 0, zoom: 0.7 }}
        deleteKeyCode="Delete"
        className="bg-white"
      >
        {workspace.showGrid && <Background color="#cbd5e1" gap={20} size={1} />}
      </ReactFlow>
      {workspace.placement && <div className="pt-device-placement" aria-label={`Place ${workspace.placement.model} on workspace`} onPointerMove={event=>{
        const bounds=event.currentTarget.getBoundingClientRect()
        setPlacementPointer({x:event.clientX-bounds.left,y:event.clientY-bounds.top})
      }} onPointerLeave={()=>setPlacementPointer(null)} onClick={event=>placeAtPointer(event.clientX,event.clientY)} onContextMenu={event=>{event.preventDefault();workspace.cancelPlacement()}}>
        {placementPointer && <div className="pt-device-placement-preview" style={{left:placementPointer.x,top:placementPointer.y}}><Cisco3DIcon type={workspace.placement.type} model={workspace.placement.model} size={48}/></div>}
      </div>}
      {drawingPreview.length>1 && <svg className="pt-drawing-preview" aria-hidden="true">{workspace.tool==='rect'?<rect x={Math.min(drawingPreview[0].x,drawingPreview[1].x)} y={Math.min(drawingPreview[0].y,drawingPreview[1].y)} width={Math.abs(drawingPreview[1].x-drawingPreview[0].x)} height={Math.abs(drawingPreview[1].y-drawingPreview[0].y)}/>:workspace.tool==='ellipse'?<ellipse cx={(drawingPreview[0].x+drawingPreview[1].x)/2} cy={(drawingPreview[0].y+drawingPreview[1].y)/2} rx={Math.abs(drawingPreview[1].x-drawingPreview[0].x)/2} ry={Math.abs(drawingPreview[1].y-drawingPreview[0].y)/2}/>:<polyline points={drawingPreview.map(p=>`${p.x},${p.y}`).join(' ')}/>}</svg>}
      <DeviceInspector/>
      <ConnectionHoverCard/>

      {/* Quick Floating Fit Button */}
      {devices.length > 0 && (
        <button
          type="button"
          onClick={() => doFitView(200)}
          className="absolute bottom-4 left-4 z-20 px-2.5 py-1 bg-white/90 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded shadow-md hover:bg-slate-100 dark:hover:bg-slate-700/90 flex items-center gap-1.5 transition cursor-pointer"
          title={t('Fit Topology to Screen')}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
          <span>{t('Fit Screen')}</span>
        </button>
      )}

      {/* Simulation Mode Floating Status Banner */}
      {simulationMode === 'simulation' && inFlightPackets.length > 0 && !simulationPlaying && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-sky-950/95 dark:bg-slate-900/95 text-white px-4 py-1.5 rounded-full shadow-xl border border-sky-400 font-sans text-xs flex items-center gap-3 backdrop-blur-xs select-none">
          <span className="font-semibold text-amber-300">⏸ {t('Simulation Paused')}</span>
          <span className="text-slate-200">{inFlightPackets.length} {t('packet(s) waiting on wire')}</span>
          <button
            type="button"
            onClick={() => {
              for (let i = 0; i < 7; i++) {
                stepSimulation()
                if (useNetworkStore.getState().inFlightPackets.length === 0) break
              }
            }}
            className="px-2.5 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-white font-bold text-[11px] shadow transition cursor-pointer"
            title={t('Step 1 hop (next device)')}
          >
            ⏭ {t('Capture / Forward')}
          </button>
          <button
            type="button"
            onClick={() => setSimulationPlaying(true)}
            className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow transition cursor-pointer"
          >
            ▶ {t('Auto Play')}
          </button>
        </div>
      )}

      {/* PDU Mode Floating Top Banner */}
      {['pdu', 'complex-pdu'].includes(workspace.tool) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-amber-500/95 dark:bg-amber-600/95 text-slate-950 px-4 py-1.5 rounded-full shadow-lg border border-amber-300 font-sans text-xs font-semibold flex items-center gap-2 pointer-events-auto backdrop-blur-xs select-none">
          <span className="text-sm">✉</span>
          <span>
            {workspace.pduSource
              ? `${t('PDU Source:')} ${devices.find(d => d.id === workspace.pduSource)?.name ?? ''}. ${t('Click target device to send packet, or click canvas to cancel')}`
              : t('Select source device for PDU, or click canvas / press Esc to cancel')}
          </span>
          <button
            type="button"
            onClick={() => workspace.setTool('select')}
            className="ml-2 w-4 h-4 rounded-full bg-slate-950/20 hover:bg-slate-950/40 flex items-center justify-center text-xs leading-none cursor-pointer"
            title={t('Cancel')}
            aria-label={t('Cancel')}
          >
            ×
          </button>
        </div>
      )}


      {/* Empty State Blueprint Callout */}
      {devices.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
          <div className="max-w-md bg-white border border-[#cbd5e1] rounded-lg p-6 shadow-xl pointer-events-auto">
            <div className="w-12 h-12 rounded-full bg-sky-50 border border-sky-300 text-sky-700 flex items-center justify-center mx-auto mb-3">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-slate-800 mb-1">{t('wireX Logical Workspace')}</h2>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {t('Select Routers, Switches, PCs, or Connections from the bottom device box to build your topology, or load a pre-configured practice lab.')}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setActiveModal({ type: 'labs' })}
                className="px-3 py-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                {t('Open CCNA Starter Labs')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Connecting Indicator Banner */}
      {connectingSource && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white font-medium text-xs px-4 py-1.5 rounded-full shadow-md flex items-center gap-2 z-20">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          {t('Click target device to wire connection, or click canvas to cancel')}
        </div>
      )}
      </>}
    </div>
  )
}

export function TopologyCanvas() {
  return (
    <ReactFlowProvider>
      <InnerTopologyCanvas />
    </ReactFlowProvider>
  )
}
