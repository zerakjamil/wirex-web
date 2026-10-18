import { create } from 'zustand'
import { useNetworkStore } from './networkStore'
import { isValidIpv4 } from '@/simulator/protocols/ip'
import { allowedChildKinds, ancestorPath, canHoldDevices, containerLabelPath, containersByParent, nextContainerName } from '@/simulator/physical'
import { PACKET_PROTOCOLS } from '@/types/network'
import type { NetworkDevice, NetworkLink, NetworkAnnotation, DeviceType, PacketPdu, PhysicalWorkspaceState, PhysicalContainerKind } from '@/types/network'

type Snapshot = { devices: NetworkDevice[]; links: NetworkLink[]; annotations: NetworkAnnotation[]; physical: PhysicalWorkspaceState }
type Deletion = {deviceIds?:string[];linkIds?:string[];annotationIds?:string[]}
type NoteDraft = {x:number;y:number;text:string;annotationId?:string}
export type CanvasAction = 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'fit' | 'fit-topology' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down'
export type WorkspaceTool = 'select' | 'marquee' | 'pan' | 'inspect' | 'note' | 'delete' | 'line' | 'rect' | 'ellipse' | 'freeform' | 'pdu' | 'complex-pdu'
export interface UserPdu { id: string; pingId?: string; udpRequestId?: string; protocol: 'ICMP' | 'UDP'; udpPort?: number; udpData?: string; scenario: number; sourceId: string; destinationId: string; targetIp: string; status: string; time: number; pdu?: PacketPdu;reason?:string }
export interface HoveredConnectionInfo {
  clientX: number
  clientY: number
  deviceId: string
  portId?: string
  peerDeviceId?: string
  peerPortId?: string
  linkId?: string
  mode: 'port' | 'device'
}
interface WorkspaceStore {
  view: 'logical' | 'physical'
  tool: WorkspaceTool
  inspectedDeviceId: string|null
  hoveredConnection: HoveredConnectionInfo | null
  setHoveredConnection: (info: HoveredConnectionInfo | null) => void
  placement: {type:DeviceType;model:string;repeat:boolean} | null
  selectDeviceForPlacement: (type:DeviceType,model:string,repeat:boolean)=>void
  cancelPlacement: ()=>void
  placeDevice: (x:number,y:number)=>void
  canvasAction: { kind: CanvasAction; sequence: number } | null
  past: Snapshot[]
  future: Snapshot[]
  clipboard: NetworkDevice | null
  copyDevice: () => void
  pasteDevice: () => void
  dialog: 'help' | 'about' | 'preferences' | 'activity' | 'extensions' | 'complex-pdu' | 'pdu-error' | 'delete-device' | 'note' | 'doctor' | 'share' | 'revision' | 'associations' | null
  pduError: {deviceId:string;message:string} | null
  selectPduSource: (deviceId:string)=>void
  pendingDeletion:Deletion|null
  requestDeletion:(items:Deletion)=>void
  confirmDeletion:()=>void
  noteDraft:NoteDraft|null
  openNoteEditor:(draft:NoteDraft)=>void
  saveNote:(text:string)=>void
  status: string
  fileName: string
  showGrid: boolean
  showPduList: boolean
  pduView: 'pdus' | 'events'
  hiddenEventProtocols: string[]
  pduSource: string | null
  pduDestination: string | null
  pdus: UserPdu[]
  scenario: number
  scenarios: number[]
  addScenario: () => void
  deleteScenario: () => void
  firePdu: (sourceId: string, destinationId: string, targetIp?: string, options?: { protocol?: 'ICMP' | 'UDP'; port?: number; data?: string }) => void
  setPduView: (view: WorkspaceStore['pduView']) => void
  setEventProtocolVisible: (protocol: string, visible: boolean) => void
  showAllEventFilters: () => void
  showNoneEventFilters: () => void
  toggleEventFilters: () => void
  physicalPath: string[]
  activeClusterId: string | null
  canvasSelectionIds: string[]
  setCanvasSelection: (ids: string[]) => void
  enterPhysicalContainer: (id: string) => void
  setPhysicalPath: (ids: string[]) => void
  pathBack: () => void
  enterCluster: (id: string) => void
  exitCluster: () => void
  createPhysicalContainer: (kind: PhysicalContainerKind) => void
  createPhysicalContainerFromShortcut: (kind: PhysicalContainerKind) => void
  deleteActivePhysicalContainer: () => void
  createClusterFromSelection: () => void
  renameActiveCluster: (name: string) => void
  disbandActiveCluster: () => void
  applyClusterAssociation: (clusterId: string, containerId: string, options: { createContainer: boolean; moveDevices: boolean }) => string | null
  clearClusterAssociation: (clusterId: string, containerId: string) => string | null
  setView: (view: WorkspaceStore['view']) => void
  setTool: (tool: WorkspaceTool) => void
  command: (kind: CanvasAction) => void
  setDialog: (dialog: WorkspaceStore['dialog']) => void
  setStatus: (status: string) => void
  toggleGrid: () => void
  togglePduList: () => void
  checkpoint: () => void
  undo: () => void
  redo: () => void
}
const snapshot = (): Snapshot => {
  const { devices, links, annotations, physicalContainers, physicalAssignment, clusters } = useNetworkStore.getState()
  return structuredClone({ devices, links, annotations, physical: { containers: physicalContainers, assignment: physicalAssignment, clusters } })
}
const usableIp = (ip?:string) => !!ip && ip !== '0.0.0.0' && isValidIpv4(ip)
const addressError = (device:NetworkDevice) => {
  const addressed=device.ports.filter(port=>usableIp(port.ipAddress))
  if(!addressed.length)return 'This device has no usable IPv4 address.'
  if(!addressed.some(port=>usableIp(port.subnetMask)))return 'This device has no usable subnet mask.'
  return null
}
const pduErrorState = (device:NetworkDevice,message:string) => ({
  dialog:'pdu-error' as const,pduError:{deviceId:device.id,message},
  tool:'select' as const,pduSource:null,pduDestination:null,status:`${device.name}: ${message}`,
})
export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  view: 'logical', tool: 'select', inspectedDeviceId:null, hoveredConnection: null,
  physicalPath: [], activeClusterId: null, canvasSelectionIds: [],
  setHoveredConnection: (info) => set({ hoveredConnection: info }),
  placement: null, canvasAction: null, past: [], future: [], clipboard: null, dialog: null,
  status: '', fileName: '', showGrid: false, showPduList: true, pduView: 'pdus', hiddenEventProtocols: [], pduSource: null, pduDestination: null,
  pdus: [], scenario: 0, scenarios: [0],pduError:null,
  selectPduSource:(deviceId)=>{
    const device=useNetworkStore.getState().devices.find(d=>d.id===deviceId)
    if(!device)return
    const error=addressError(device)
    if(error){set(pduErrorState(device,error));return}
    set({pduSource:deviceId,status:`Source: ${device.name}. Select the destination device.`})
  },
  pendingDeletion:null,noteDraft:null,
  requestDeletion:(items)=>{
    const net=useNetworkStore.getState()
    const deletion={deviceIds:items.deviceIds?.filter(id=>net.devices.some(d=>d.id===id)),linkIds:items.linkIds?.filter(id=>net.links.some(l=>l.id===id)),annotationIds:items.annotationIds?.filter(id=>net.annotations.some(a=>a.id===id))}
    if(![deletion.deviceIds,deletion.linkIds,deletion.annotationIds].some(ids=>ids?.length))return
    set({pendingDeletion:deletion})
    if(deletion.deviceIds?.length)set({dialog:'delete-device'})
    else get().confirmDeletion()
  },
  confirmDeletion:()=>{
    const items=get().pendingDeletion;if(!items)return
    get().checkpoint()
    const net=useNetworkStore.getState()
    items.deviceIds?.forEach(net.deleteDevice)
    items.linkIds?.forEach(net.deleteLink)
    items.annotationIds?.forEach(net.deleteAnnotation)
    useNetworkStore.setState(state=>({deviceWindows:state.deviceWindows.filter(frame=>!items.deviceIds?.includes(frame.deviceId))}))
    set({pendingDeletion:null,dialog:null})
  },
  openNoteEditor:(draft)=>set({noteDraft:draft,dialog:'note'}),
  saveNote:(text)=>{
    const draft=get().noteDraft;if(!draft || !text.trim())return
    get().checkpoint()
    if(draft.annotationId)useNetworkStore.getState().updateAnnotation(draft.annotationId,{text:text.trim()})
    else useNetworkStore.getState().addAnnotation({id:`ann-${crypto.randomUUID()}`,type:'note',x:draft.x,y:draft.y,text:text.trim(),color:'transparent',borderColor:'transparent'})
    set({noteDraft:null,dialog:null})
    get().setTool('select')
  },
  addScenario: () => { const id=Math.max(...get().scenarios)+1;set({scenarios:[...get().scenarios,id],scenario:id}) },
  deleteScenario: () => {
    const {scenario,scenarios,pdus}=get(); const remaining=scenarios.filter(id => id!==scenario)
    set({scenarios:remaining.length?remaining:[0],scenario:remaining[0]??0,pdus:pdus.filter(p => p.scenario!==scenario)})
  },
  firePdu: (sourceId, destinationId, targetIp, options) => {
    const net=useNetworkStore.getState()
    const source=net.devices.find(d => d.id===sourceId)
    const destination=net.devices.find(d => d.id===destinationId)
    if(!source || !destination)return
    const sourceError=addressError(source)
    if(sourceError){set(pduErrorState(source,sourceError));return}
    const ip=targetIp?.trim() || destination.ports.find(p => usableIp(p.ipAddress))?.ipAddress
    if(!usableIp(ip)){set(pduErrorState(destination,targetIp?'Enter a valid destination IPv4 address.':'This device has no usable IPv4 address.'));return}
    const protocol=options?.protocol ?? 'ICMP'
    const pingId=protocol==='ICMP' ? net.sendPing(sourceId,ip!) : null
    const udpRequestId=protocol==='UDP' ? useNetworkStore.getState().requestUdpEcho(sourceId,ip!,options?.port ?? 7,options?.data ?? '') : null
    const requestId=protocol==='UDP' ? udpRequestId : pingId
    const sent=Boolean(requestId)
    const state=useNetworkStore.getState()
    const failure=state.simulationWarning || 'Could not send: configure an IP address and an active link on the source.'
    const matchingPacket = requestId ? state.inFlightPackets.find(packet => packet.pdu.pingId === requestId || packet.pdu.payload.udpRequestId === requestId || packet.pdu.pendingPacket?.payload.udpRequestId === requestId) : undefined
    const pdu=protocol==='ICMP' ? state.pingResults.find(result=>result.id===pingId)?.pdu??matchingPacket?.pdu : matchingPacket?.pdu.pendingPacket??matchingPacket?.pdu
    const result=protocol==='ICMP' ? state.pingResults.find(item=>item.id===pingId) : state.udpTransactions.find(item=>item.requestId===udpRequestId)
    const status=result?.status==='successful'?'Successful':result?.status==='failed'?'Failed':sent?'In Progress':'Failed to send'
    const reason=result?.reason??(!sent?failure:undefined)
    set({pdus:[...get().pdus.slice(-199),{id:crypto.randomUUID(),pingId:pingId ?? undefined,udpRequestId:udpRequestId ?? undefined,protocol,udpPort:protocol==='UDP'?options?.port ?? 7:undefined,udpData:protocol==='UDP'?options?.data ?? '':undefined,scenario:get().scenario,sourceId,destinationId,targetIp:ip!,status,time:Date.now(),pdu,reason}],status:reason??(sent?(protocol==='UDP'?'UDP Echo request submitted. Inspect packets in Simulation mode.':'ICMP test submitted. Inspect packets in Simulation mode.'):failure)})
    if(!sent){
      if(protocol==='ICMP')set(pduErrorState(source,failure))
      else set({status:failure})
    }
  },
  setView: (view) => set({ view, placement:null }),
  cancelPlacement: ()=>set({placement:null,status:''}),
  selectDeviceForPlacement: (type,model,repeat)=>{
    const current=get().placement
    if(current?.type===type && current.model===model){get().cancelPlacement();return}
    get().setTool('select')
    useNetworkStore.getState().setConnectingSource(null)
    set({view:'logical',placement:{type,model,repeat},status:repeat?`Place ${model} devices. Click its shelf icon again or press Esc to cancel.`:`Click or drag onto the workspace to place ${model}. Esc cancels.`})
  },
  placeDevice: (x,y)=>{
    const placement=get().placement
    if(!placement || !Number.isFinite(x) || !Number.isFinite(y))return
    get().checkpoint()
    useNetworkStore.getState().addDevice(placement.type,x,y,placement.model)
    if(!placement.repeat)get().cancelPlacement()
  },
  setTool: (tool) => {
    const instructions:Partial<Record<WorkspaceTool,string>>={select:'Drag a device to move it. Drag empty space to pan. Shift-drag to select a group.',pan:'Drag the workspace to pan.',inspect:'Click a device to inspect its interfaces.',note:'Click the workspace to write a note.',delete:'Click a device, cable, or drawing to delete it.',marquee:'Drag a box over devices to select them, then drag a selected device to move the group.',line:'Drag to draw a line.',rect:'Drag to draw a rectangle.',ellipse:'Drag to draw an ellipse.',freeform:'Drag to draw a freeform shape.',pdu:'Select the source device, then the destination device.','complex-pdu':'Select the source device, then the destination device.'}
    set({ tool, placement:null, inspectedDeviceId:null, pduSource: null,pduDestination:null, status:instructions[tool] || '' })
    useNetworkStore.getState().setConnectingSource(null)
    useNetworkStore.getState().setActiveTool(['select', 'note', 'rect', 'delete'].includes(tool) ? tool as 'select' | 'note' | 'rect' | 'delete' : 'select')
  },
  command: (kind) => set({ canvasAction: { kind, sequence: (get().canvasAction?.sequence ?? 0) + 1 } }),
  setDialog: (dialog) => set({ dialog,...(dialog===null?{pendingDeletion:null,noteDraft:null,pduError:null}:{}) }), setStatus: (status) => set({ status }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  togglePduList: () => set({ showPduList: !get().showPduList }),
  setPduView: (view) => set({ pduView: view }),
  setEventProtocolVisible: (protocol, visible) => set(state => ({
    hiddenEventProtocols: visible ? state.hiddenEventProtocols.filter(item => item !== protocol) : [...state.hiddenEventProtocols, protocol],
  })),
  showAllEventFilters: () => set({ hiddenEventProtocols: [] }),
  showNoneEventFilters: () => set({ hiddenEventProtocols: [...PACKET_PROTOCOLS] }),
  toggleEventFilters: () => set(state => ({ hiddenEventProtocols: state.hiddenEventProtocols.length === 0 ? [...PACKET_PROTOCOLS] : [] })),
  setCanvasSelection: (ids) => set({ canvasSelectionIds: ids }),
  enterPhysicalContainer: (id) => set(state => ({ physicalPath: [...state.physicalPath, id] })),
  setPhysicalPath: (ids) => set({ physicalPath: ids }),
  pathBack: () => {
    const { view, physicalPath, activeClusterId } = get()
    if (view === 'physical') {
      if (physicalPath.length) set({ physicalPath: physicalPath.slice(0, -1) })
    } else if (activeClusterId) set({ activeClusterId: null, canvasSelectionIds: [] })
  },
  enterCluster: (id) => set({ activeClusterId: id, canvasSelectionIds: [] }),
  exitCluster: () => set({ activeClusterId: null, canvasSelectionIds: [] }),
  createPhysicalContainer: (kind) => {
    const { view, physicalPath } = get()
    if (view !== 'physical') return
    const net = useNetworkStore.getState()
    const containers = net.physicalContainers
    const path = physicalPath.filter(id => containers.some(container => container.id === id))
    const parent = path.length ? containers.find(container => container.id === path[path.length - 1]) ?? null : null
    if (!allowedChildKinds(parent?.kind ?? null).includes(kind)) { set({ status: 'That container type cannot be created here.' }); return }
    get().checkpoint()
    const name = nextContainerName(containers, kind)
    const id = net.addPhysicalContainer(kind, parent?.id ?? null)
    if (kind === 'city' || kind === 'building' || kind === 'closet') set({ physicalPath: [...path, id], status: `Created ${name}. Rename it or add the next container.` })
    else set({ status: `Created ${name} in ${parent?.name ?? 'the campus'}.` })
  },
  createPhysicalContainerFromShortcut: (kind) => {
    const { view, physicalPath } = get()
    if (view !== 'physical') return
    const net = useNetworkStore.getState()
    const containers = net.physicalContainers
    const path = physicalPath.filter(id => containers.some(container => container.id === id))
    const current = path.length ? containers.find(container => container.id === path[path.length - 1]) ?? null : null
    const allowedAt = (parentKind: PhysicalContainerKind | null) => allowedChildKinds(parentKind).includes(kind)
    let parentId: string | null | undefined
    if (current && allowedAt(current.kind)) parentId = current.id
    if (parentId === undefined && current) {
      // Shortcuts fall back to the nearest ancestor that accepts the container, like PT's move-to-parent rule.
      const chain = ancestorPath(containers, current.id)
      for (let index = chain.length - 1; index >= 0; index--) {
        if (allowedAt(chain[index].kind)) { parentId = chain[index].id; break }
      }
    }
    if (parentId === undefined) parentId = allowedAt(null) ? null : undefined
    if (parentId === undefined) { set({ status: 'That container type cannot be created here.' }); return }
    get().checkpoint()
    const id = net.addPhysicalContainer(kind, parentId)
    const created = useNetworkStore.getState().physicalContainers.find(container => container.id === id)
    set({ status: `Created ${created?.name ?? 'container'}. Rename it or add the next container.` })
  },
  deleteActivePhysicalContainer: () => {
    const { view, physicalPath } = get()
    if (view !== 'physical' || !physicalPath.length) return
    const net = useNetworkStore.getState()
    const id = physicalPath[physicalPath.length - 1]
    const container = net.physicalContainers.find(candidate => candidate.id === id)
    if (!container) { set({ physicalPath: physicalPath.slice(0, -1) }); return }
    get().checkpoint()
    const removedDevices = net.deletePhysicalContainer(id)
    set({
      physicalPath: physicalPath.slice(0, -1),
      status: removedDevices
        ? `${container.name} and ${removedDevices} stored device${removedDevices === 1 ? '' : 's'} were removed. Undo restores.`
        : `${container.name} and its contents were removed. Undo restores.`,
    })
  },
  createClusterFromSelection: () => {
    const net = useNetworkStore.getState()
    const candidates = get().canvasSelectionIds.filter(id => net.devices.some(device => device.id === id) && !net.clusters.some(cluster => cluster.deviceIds.includes(id)))
    if (candidates.length < 2) { set({ status: 'Select at least two unclustered devices, then create the cluster.' }); return }
    get().checkpoint()
    net.createCluster(`Cluster ${net.clusters.length + 1}`, candidates)
    set({ status: `Created a cluster of ${candidates.length} devices. Double-click its label to work inside it.` })
  },
  renameActiveCluster: (name) => {
    const id = get().activeClusterId
    if (id) useNetworkStore.getState().renameClusterGroup(id, name)
  },
  disbandActiveCluster: () => {
    const id = get().activeClusterId
    if (!id) return
    get().checkpoint()
    useNetworkStore.getState().removeClusterGroup(id)
    set({ activeClusterId: null, status: 'Cluster disbanded. Devices stay in place; Undo restores the cluster.' })
  },
  applyClusterAssociation: (clusterId, containerId, options) => {
    const net = useNetworkStore.getState()
    const cluster = net.clusters.find(candidate => candidate.id === clusterId)
    const container = net.physicalContainers.find(candidate => candidate.id === containerId)
    if (!cluster || !container) return 'Select a logical cluster and a physical container first.'
    if (options.createContainer && !allowedChildKinds(container.kind).includes('generic')) return 'A generic container cannot be created inside this container.'
    get().checkpoint()
    let targetId = container.id
    if (options.createContainer) targetId = useNetworkStore.getState().addPhysicalContainer('generic', container.id)
    useNetworkStore.getState().setClusterPhysicalContainer(clusterId, targetId)
    const containers = useNetworkStore.getState().physicalContainers
    const target = containers.find(candidate => candidate.id === targetId)
    const targetPath = containerLabelPath(containers, targetId) || target?.name || container.name
    const parts = [`Associated ${cluster.name} with ${targetPath}.`]
    if (options.moveDevices) {
      const findHolder = (id: string): string | null => {
        const node = containers.find(candidate => candidate.id === id)
        if (node && canHoldDevices(node.kind)) return node.id
        for (const child of containersByParent(containers, id)) {
          const found = findHolder(child.id)
          if (found) return found
        }
        return null
      }
      const holderId = findHolder(targetId)
      if (holderId) {
        let moved = 0
        let blocked = 0
        for (const deviceId of cluster.deviceIds) {
          if (useNetworkStore.getState().moveDeviceToContainer(deviceId, holderId)) moved++
          else blocked++
        }
        if (moved) parts.push(`Moved ${moved} device${moved === 1 ? '' : 's'} to ${containerLabelPath(containers, holderId) || targetPath}.`)
        if (blocked) parts.push(`${blocked} device${blocked === 1 ? '' : 's'} could not move: shelf storage needs a powered-off device with no cables.`)
      } else {
        parts.push('No rack, table, shelf or generic container is available to hold the devices.')
      }
    }
    set({ status: parts.join(' ') })
    return null
  },
  clearClusterAssociation: (clusterId, containerId) => {
    const net = useNetworkStore.getState()
    const cluster = net.clusters.find(candidate => candidate.id === clusterId)
    const container = net.physicalContainers.find(candidate => candidate.id === containerId)
    if (!cluster || !container) return 'Select a logical cluster and a physical container first.'
    if (cluster.physicalContainerId !== containerId) return `${cluster.name} is not associated with ${container.name}.`
    get().checkpoint()
    useNetworkStore.getState().setClusterPhysicalContainer(clusterId, null)
    set({ status: `Removed the association between ${cluster.name} and ${container.name}. Undo restores.` })
    return null
  },
  checkpoint: () => set({ past: [...get().past.slice(-49), snapshot()], future: [] }),
  copyDevice: () => {
    const net=useNetworkStore.getState(); const device=net.devices.find(d=>d.id===net.selectedDeviceId)
    if(device)set({clipboard:structuredClone(device),status:`Copied ${device.name}.`})
  },
  pasteDevice: () => {
    const device=get().clipboard; if(!device)return
    get().checkpoint()
    const net=useNetworkStore.getState()
    net.addDevice(device.type,device.x+100,device.y+50,device.model)
    const id=useNetworkStore.getState().selectedDeviceId
    useNetworkStore.setState(state=>({devices:state.devices.map(d=>d.id===id?{
      ...d,config:{...structuredClone(device.config),hostname:d.name},
      ports:d.ports.map(port=>{
        const original=device.ports.find(p=>p.name===port.name)
        if(!original)return port
        return {...structuredClone(original),id:port.id,macAddress:port.macAddress,status:'down',connectedLinkId:undefined,connectedDeviceId:undefined,connectedPortId:undefined}
      }),routingTable:structuredClone(device.routingTable),
    }:d)}))
    set({status:`Pasted ${device.model}. Connect the new device before sending traffic.`})
    get().command('fit')
  },
  undo: () => {
    const { past, future } = get(); const previous = past.at(-1)
    if (!previous) return
    set({ past: past.slice(0, -1), future: [...future, snapshot()] })
    useNetworkStore.getState().loadLab(previous.devices, previous.links, previous.annotations, previous.physical)
  },
  redo: () => {
    const { past, future } = get(); const next = future.at(-1)
    if (!next) return
    set({ past: [...past, snapshot()], future: future.slice(0, -1) })
    useNetworkStore.getState().loadLab(next.devices, next.links, next.annotations, next.physical)
  },
}))

useNetworkStore.subscribe((state, previous) => {
  if (state.pingResults === previous.pingResults) return
  const results = new Map(state.pingResults.map(result => [result.id, result]))
  const pdus = useWorkspaceStore.getState().pdus
  let changed = false
  const updated = pdus.map(pdu => {
    if (pdu.protocol !== 'ICMP') return pdu
    const result = pdu.pingId ? results.get(pdu.pingId) : undefined
    if(!result){
      if(pdu.status!=='In Progress')return pdu
      changed=true
      return {...pdu,status:'Failed',reason:'Cancelled because the topology was replaced or reset.'}
    }
    if(result.status==='pending'){
      if(pdu.status==='In Progress')return pdu
      changed=true
      return {...pdu,status:'In Progress',reason:undefined}
    }
    const status = result.status === 'successful' ? 'Successful' : 'Failed'
    if (pdu.status === status) return pdu
    changed = true
    return { ...pdu, status,reason:result.reason,pdu:result.pdu??pdu.pdu }
  })
  if (changed) useWorkspaceStore.setState({ pdus: updated })
})

useNetworkStore.subscribe((state, previous) => {
  if (state.udpTransactions === previous.udpTransactions) return
  const results = new Map(state.udpTransactions.map(result => [result.requestId, result]))
  let changed = false
  const pdus = useWorkspaceStore.getState().pdus.map(pdu => {
    if (pdu.protocol !== 'UDP' || !pdu.udpRequestId) return pdu
    const result = results.get(pdu.udpRequestId)
    if (!result) {
      if (pdu.status !== 'In Progress') return pdu
      changed = true
      return { ...pdu, status: 'Failed', reason: 'Cancelled because the topology was replaced or reset.' }
    }
    if (result.status === 'pending') {
      if (pdu.status === 'In Progress') return pdu
      changed = true
      return { ...pdu, status: 'In Progress', reason: undefined }
    }
    const status = result.status === 'successful' ? 'Successful' : 'Failed'
    if (pdu.status === status) return pdu
    changed = true
    return { ...pdu, status, reason: result.reason }
  })
  if (changed) useWorkspaceStore.setState({ pdus })
})

export function saveWorkspace() {
  const data = snapshot()
  const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'wireforge-web', version: 1, ...data }, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'network.wf.json'; anchor.click()
  URL.revokeObjectURL(url)
  useWorkspaceStore.getState().setStatus('Network saved as network.wf.json.')
}
export function newWorkspace() {
  useWorkspaceStore.getState().checkpoint()
  useNetworkStore.getState().resetTopology()
  useWorkspaceStore.setState({fileName:'',placement:null})
  useWorkspaceStore.getState().setStatus('Select a device from the device box to begin.')
}

if (typeof window !== 'undefined') {
  (window as unknown as { __wireforgeWorkspaceStore: typeof useWorkspaceStore }).__wireforgeWorkspaceStore = useWorkspaceStore
}
