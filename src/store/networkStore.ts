import { create } from 'zustand'
import {
  NetworkDevice,
  NetworkLink,
  DeviceType,
  CableType,
  InFlightPacket,
  PacketPdu,
  NetworkPort,
  DeviceConfig,
  NetworkAnnotation,
  DeviceWindow,
  LinkStatus,
  HttpTransaction,
  EmailTransaction,
  DnsTransaction,
  UdpTransaction,
  DhcpTransactionResult,
  TcpReassemblyBuffer,
  TcpOutstandingSegment,
} from '@/types/network'
import { createDevice } from '@/simulator/deviceFactory'
import {getHardwareProfile,getModulePortIds,modulePorts,canCableConnect} from '@/simulator/physicalHardware'
import {
  stepSimulationTick,
  createPingPackets,
  createHttpGetPackets,
  createEmailPackets,
  createDnsQueryPackets,
  createUdpEchoPackets,
  createNtpQueryPackets,
  createSnmpQueryPackets,
  createTftpReadPackets,
  createDhcpDiscoverPackets,
  createDhcpRenewalPackets,
  createRouterSolicitationPackets,
  createDhcpv6SolicitPackets,
  MAX_IN_FLIGHT_PACKETS,
} from '@/simulator/engine'
import type { SnmpOperation } from '@/simulator/snmp'
import { parseIosCommand } from '@/simulator/ios/ciscoParser'
import { executeWlcCommand } from '@/simulator/ios/wlcCli'
import { hasCapwapActivity } from '@/simulator/capwap'
import { getCcnaEnterpriseLab } from '@/simulator/starterLabs'
import { synchronizeLinkState } from '@/simulator/linkState'
import { cancelPendingPings, completePingResults,retainResults, type PingResult } from './pingResults'
import { getPhoneRegistrations } from '@/simulator/voice'
import { observeCommand,type CommandEvent } from '@/simulator/commandObservation'
import { formatMstConfiguration,formatStpInstanceView,formatStpSummary,formatStpVlanView,getOperationalChannels,hasStpActivity } from '@/simulator/spanningTree'
import { hasHsrpActivity } from '@/simulator/hsrp'
import { allocateDhcpLease } from '@/simulator/dhcp'
import { hasOspf } from '@/simulator/ospf'
import { hasIpv6Ospf } from '@/simulator/ospfv3'
import { hasRip } from '@/simulator/rip'
import { hasEigrp } from '@/simulator/eigrp'
import { hasMacAgingActivity, stripMacAgingRuntime } from '@/simulator/macLearning'

export interface ActiveModalState {
  type: 'device' | 'pdu' | 'port-select' | 'labs'
  deviceId?: string
  pdu?: PacketPdu
  sourceDeviceId?: string
  targetDeviceId?: string
}

interface NetworkStore {
  commandEvents:CommandEvent[]
  devices: NetworkDevice[]
  links: NetworkLink[]
  annotations: NetworkAnnotation[]
  showPortLabels: boolean
  selectedDeviceId: string | null
  selectedLinkId: string | null
  activeTool:
    | 'select'
    | 'cable-auto'
    | 'cable-straight'
    | 'cable-crossover'
    | 'cable-fiber'
    | 'cable-serial'
    | 'cable-serial-dce'
    | 'cable-console'
    | 'cable-phone'
    | 'cable-coaxial'
    | 'cable-octal'
    | 'cable-usb'
    | 'cable-wireless'
    | 'delete'
    | 'note'
    | 'rect'
  inFlightPackets: InFlightPacket[]
  pingResults: PingResult[]
  httpTransactions: HttpTransaction[]
  emailTransactions: EmailTransaction[]
  dnsTransactions: DnsTransaction[]
  udpTransactions: UdpTransaction[]
  dhcpTransactions: DhcpTransactionResult[]
  tcpReceiveBuffers: TcpReassemblyBuffer[]
  tcpOutstandingSegments: TcpOutstandingSegment[]
  simulationMode: 'realtime' | 'simulation'
  simulationPlaying: boolean
  simulationTick: number
  simulationWarning: string | null
  activeModal: ActiveModalState | null
  deviceWindows: DeviceWindow[]
  updateDeviceWindow: (deviceId: string, updates: Partial<Omit<DeviceWindow,'deviceId'>>) => void
  closeDeviceWindow: (deviceId: string) => void
  minimizeDeviceWindow: (deviceId: string) => void
  focusDeviceWindow: (deviceId: string) => void
  activeTab: 'cli' | 'config' | 'services' | 'desktop' | 'physical' | 'imported' | 'gui' | 'webadmin' | 'asdm'
  connectingSource: { deviceId: string; portId?: string } | null

  // Actions
  setActiveTool: (tool: NetworkStore['activeTool']) => void
  setSelectedDevice: (id: string | null) => void
  setSelectedLink: (id: string | null) => void
  setActiveModal: (modal: ActiveModalState | null) => void
  setActiveTab: (tab: NetworkStore['activeTab']) => void
  setConnectingSource: (source: { deviceId: string; portId?: string } | null) => void
  togglePortLabels: () => void

  addDevice: (type: DeviceType, x: number, y: number, model?: string) => void
  updateDevicePosition: (id: string, x: number, y: number) => void
  deleteDevice: (id: string) => void
  toggleDevicePower: (id: string) => void
  installDeviceModule: (deviceId: string, slotIndex: number, moduleName: string) => { success: boolean; message?: string }
  removeDeviceModule: (deviceId: string, slotIndex: number) => { success: boolean; message?: string }

  connectPorts: (
    fromDeviceId: string,
    fromPortId: string,
    toDeviceId: string,
    toPortId: string,
    cableType: CableType
  ) => boolean
  autoConnectDevices: (fromDeviceId: string, toDeviceId: string) => boolean
  deleteLink: (id: string) => void

  addAnnotation: (annotation: NetworkAnnotation) => void
  updateAnnotation: (id: string, updates: Partial<NetworkAnnotation>) => void
  deleteAnnotation: (id: string) => void

  updatePortConfig: (deviceId: string, portId: string, updates: Partial<NetworkPort>) => void
  updateDeviceConfig: (deviceId: string, updates: Partial<DeviceConfig>) => void

  executeIosCommand: (deviceId: string, cmd: string) => string
  sendPing: (sourceDeviceId: string, targetIp: string) => string | null
  requestHttp: (sourceDeviceId: string, targetIp: string, path: string, requestId?: string) => string | null
  sendEmail: (sourceDeviceId: string, to: string, subject: string, body: string) => string | null
  checkEmail: (sourceDeviceId: string) => string | null
  deleteEmail: (sourceDeviceId: string, messageId: string) => string | null
  requestDns: (sourceDeviceId: string, domain: string) => string | null
  requestUdpEcho: (sourceDeviceId: string, targetIp: string, port: number, data: string) => string | null
  requestNtp: (sourceDeviceId: string, targetIp: string) => string | null
  requestSnmpQuery: (sourceDeviceId: string, targetIp: string, operation: SnmpOperation, oid: string, community: string) => string | null
  requestTftpRead: (sourceDeviceId: string, targetIp: string, fileName: string) => string | null
  requestDhcp: (deviceId:string)=>string
  setIpv6HostMode: (deviceId: string, portId: string, mode: 'static' | 'auto' | 'dhcpv6') => void

  toggleSimulationMode: () => void
  setSimulationPlaying: (playing: boolean) => void
  tickSimulation: () => void
  stepSimulation: () => void
  clearSimulation: () => void

  loadLab: (devices: NetworkDevice[], links: NetworkLink[], annotations?: NetworkAnnotation[]) => void
  resetTopology: () => void
}

const initialLab = getCcnaEnterpriseLab()

function mergeHttpTransactions(current: HttpTransaction[], updates: Array<Omit<HttpTransaction, 'status'> & { status: 'successful' | 'failed' }>) {
  if (!updates.length) return current
  const byId = new Map(updates.map(update => [update.requestId, update]))
  return current.map(transaction => {
    const update = byId.get(transaction.requestId)
    return update ? { ...transaction, ...update } : transaction
  })
}

function mergeEmailTransactions(current: EmailTransaction[], updates: ReturnType<typeof stepSimulationTick>['emailResults']): EmailTransaction[] {
  if (!updates.length) return current
  const byId = new Map(updates.map(update => [update.requestId, update]))
  return current.map(transaction => {
    const update = byId.get(transaction.requestId)
    return update ? { ...transaction, ...update } : transaction
  })
}

function mergeDnsTransactions(current: DnsTransaction[], updates: Array<Omit<DnsTransaction, 'status'> & { status: 'successful' | 'failed' }>) {
  if (!updates.length) return current
  const byId = new Map(updates.map(update => [update.requestId, update]))
  return current.map(transaction => {
    const update = byId.get(transaction.requestId)
    return update ? { ...transaction, ...update } : transaction
  })
}

function mergeUdpTransactions(current: UdpTransaction[], updates: Array<Omit<UdpTransaction, 'status'> & { status: 'successful' | 'failed' }>) {
  if (!updates.length) return current
  const byId = new Map(updates.map(update => [update.requestId, update]))
  return current.map(transaction => {
    const update = byId.get(transaction.requestId)
    return update ? { ...transaction, ...update } : transaction
  })
}

function mergeDhcpTransactions(current: DhcpTransactionResult[], updates: DhcpTransactionResult[]): DhcpTransactionResult[] {
  if (!updates.length) return current
  const byId = new Map(updates.map(update => [update.requestId, update]))
  return current.map(transaction => {
    const update = byId.get(transaction.requestId)
    if (!update || transaction.status === 'successful') return transaction
    if (transaction.status === 'failed' && update.status !== 'successful') return transaction
    return { ...transaction, ...update }
  })
}

function dhcpRequestIdInPacket(packet: InFlightPacket): string | undefined {
  const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is PacketPdu => Boolean(pdu))
  return candidates.find(pdu => pdu.payload.dhcpRequestId&&(pdu.protocol==='DHCP'||pdu.payload.dhcpProbeIp))?.payload.dhcpRequestId
}

function failDrainedDhcpTransactions(transactions: DhcpTransactionResult[], previous: InFlightPacket[], remaining: InFlightPacket[], devices: NetworkDevice[], links: NetworkLink[]): DhcpTransactionResult[] {
  return transactions.map(transaction => {
    if (transaction.status !== 'pending') return transaction
    const wasInFlight = previous.some(packet => dhcpRequestIdInPacket(packet) === transaction.requestId)
    const remainsInFlight = remaining.some(packet => dhcpRequestIdInPacket(packet) === transaction.requestId)
    if (!wasInFlight || remainsInFlight) return transaction
    const pool = allocateDhcpLease(devices, links, transaction.sourceDeviceId)
    const reason = pool.lease
      ? `DHCP ${transaction.phase.toUpperCase()} exchange ended before the client received an ACK. A pool is reachable on ${pool.lease.serverId}; check the server return route and relay path.`
      : `DHCP ${transaction.phase.toUpperCase()} exchange ended before the client received an ACK. ${pool.reason}`
    return {
      ...transaction, phase: 'failed', status: 'failed',
      reason,
    }
  })
}

function applyDhcpAcknowledgements(devices: NetworkDevice[], results: DhcpTransactionResult[]): NetworkDevice[] {
  const acknowledgements = results.filter(result => result.status === 'successful' && result.phase === 'ack' && result.assignedIp && result.subnetMask)
  if (!acknowledgements.length) return devices
  let updated = devices
  const replaceDevice=(deviceId:string,transform:(device:NetworkDevice)=>NetworkDevice)=>{
    const index=updated.findIndex(device=>device.id===deviceId)
    if(index<0)return
    if(updated===devices)updated=[...devices]
    updated[index]=transform(updated[index])
  }
  for (const result of acknowledgements) {
    const client=updated.find(device=>device.id===result.sourceDeviceId)
    if(!client)continue
    const portId = result.clientPortId ?? client.ports.find(port => port.connectedLinkId)?.id
    const clientPort=client.ports.find(port=>port.id===portId)
    const ports = client.ports.map(port => port.id === portId ? { ...port, ipAddress: result.assignedIp, subnetMask: result.subnetMask } : port)
    const hardwareAddress=clientPort?.macAddress??''
    const clientIdentifier=`01${hardwareAddress.replace(/[^0-9a-f]/gi,'').toLowerCase()}`
    const serverId=result.serverDeviceId
    const acquiredAtMs=Date.now()
    const leaseDurationSeconds=result.leaseDurationSeconds??86400
    if(client.config.dhcpLease?.serverId&&client.config.dhcpLease.serverId!==serverId){
      replaceDevice(client.config.dhcpLease.serverId,server=>({...server,config:{...server.config,dhcpBindings:(server.config.dhcpBindings??[]).filter(binding=>binding.clientDeviceId!==client.id)}}))
    }
    replaceDevice(client.id,current=>({
      ...current,
      config: {
        ...current.config, dhcpEnabled: true,
        dhcpLease: {
          serverId: serverId ?? '', ipAddress: result.assignedIp!, acquiredAtMs,
          leaseDurationSeconds, state: 'bound',
        },
        defaultGateway: result.gateway, dnsServer: result.dnsServer,
      },
      ports,
    }))
    const server=serverId?updated.find(device=>device.id===serverId):undefined
    if(server){
      const type=server.config.dhcpPools?.some(pool=>pool.hostIp===result.assignedIp)?'manual' as const:'automatic' as const
      const binding={ipAddress:result.assignedIp!,clientDeviceId:client.id,clientIdentifier,hardwareAddress,acquiredAtMs,leaseDurationSeconds,type}
      replaceDevice(server.id,current=>({...current,config:{...current.config,dhcpBindings:[...(current.config.dhcpBindings??[]).filter(item=>item.clientDeviceId!==client.id&&item.ipAddress!==binding.ipAddress),binding]}}))
    }
  }
  return updated
}

const DHCP_RETRY_INTERVAL_MS=2_000
function advanceDhcpLeaseTimers(devices:NetworkDevice[],links:NetworkLink[],inFlightPackets:InFlightPacket[],transactions:DhcpTransactionResult[],now=Date.now()){
  let updatedDevices=devices
  let packets=inFlightPackets
  let updatedTransactions=transactions
  let warning:string|undefined
  const updateDevice=(deviceId:string,update:(device:NetworkDevice)=>NetworkDevice)=>{
    if(updatedDevices===devices)updatedDevices=[...devices]
    const index=updatedDevices.findIndex(device=>device.id===deviceId)
    if(index>=0)updatedDevices[index]=update(updatedDevices[index])
  }
  for(const original of devices){
    const bindings=original.config.dhcpBindings
    if(!bindings?.length)continue
    const active=bindings.filter(binding=>binding.acquiredAtMs+binding.leaseDurationSeconds*1000>now)
    if(active.length!==bindings.length)updateDevice(original.id,device=>({...device,config:{...device.config,dhcpBindings:active}}))
  }
  const scheduleConflictRetry=(client:NetworkDevice):boolean=>{
    const conflict=transactions.find(transaction=>transaction.sourceDeviceId===client.id&&transaction.status==='failed'&&transaction.reason?.startsWith('DHCP address conflict')&&(transaction.attemptCount??0)<2&&!transactions.some(next=>next.autoRetryOf===transaction.requestId))
    if(!conflict)return false
    const requestId=crypto.randomUUID()
    const current=updatedDevices.find(device=>device.id===client.id)??client
    const discover=createDhcpDiscoverPackets(current,updatedDevices,links,requestId)
    if(!discover.length||packets.length+discover.length>MAX_IN_FLIGHT_PACKETS){warning=`${client.name} detected a DHCP address conflict, but a replacement Discover could not enter the packet queue.`;return true}
    packets=[...packets,...discover]
    addTransaction({requestId,sourceDeviceId:client.id,clientPortId:discover[0].pdu.payload.dhcpClientPortId,phase:'discover',status:'pending',attemptCount:(conflict.attemptCount??0)+1,autoRetryOf:conflict.requestId})
    return true
  }
  const addTransaction=(transaction:DhcpTransactionResult)=>{
    if(updatedTransactions===transactions)updatedTransactions=[...transactions]
    updatedTransactions.push(transaction)
    if(updatedTransactions.length>100)updatedTransactions=updatedTransactions.slice(-100)
  }
  for(const original of devices){
    if(!original.config.dhcpEnabled)continue
    if(!original.config.dhcpLease){scheduleConflictRetry(original);continue}
    const lease=updatedDevices.find(device=>device.id===original.id)?.config.dhcpLease
    if(!lease)continue
    const duration=lease.leaseDurationSeconds??86400
    const acquiredAt=lease.acquiredAtMs??now
    if(lease.acquiredAtMs===undefined||lease.leaseDurationSeconds===undefined){
      updateDevice(original.id,device=>({...device,config:{...device.config,dhcpLease:{...lease,acquiredAtMs:acquiredAt,leaseDurationSeconds:duration,state:lease.state??'bound'}}}))
      continue
    }
    const elapsed=now-acquiredAt
    const expiry=duration*1000
    if(elapsed>=expiry){
      const client=updatedDevices.find(device=>device.id===original.id)!
      const renewalIds=transactions.filter(transaction=>transaction.sourceDeviceId===client.id&&transaction.renewalPhase&&transaction.status==='pending').map(transaction=>transaction.requestId)
      if(renewalIds.length){
        packets=packets.filter(packet=>!renewalIds.includes(dhcpRequestIdInPacket(packet)??''))
        if(updatedTransactions===transactions)updatedTransactions=[...transactions]
        updatedTransactions=updatedTransactions.map(transaction=>renewalIds.includes(transaction.requestId)?{...transaction,phase:'failed',status:'failed',reason:'DHCP lease expired before a renewal ACK arrived.'}:transaction)
      }
      updateDevice(client.id,device=>({...device,config:{...device.config,dhcpLease:undefined,defaultGateway:undefined,dnsServer:undefined},ports:device.ports.map(port=>port.ipAddress===lease.ipAddress?{...port,ipAddress:undefined,subnetMask:undefined}:port)}))
      const expiredClient=updatedDevices.find(device=>device.id===client.id)!
      const requestId=crypto.randomUUID()
      const discover=createDhcpDiscoverPackets(expiredClient,updatedDevices,links,requestId)
      if(discover.length&&packets.length+discover.length<=MAX_IN_FLIGHT_PACKETS){
        packets=[...packets,...discover]
        addTransaction({requestId,sourceDeviceId:client.id,clientPortId:discover[0].pdu.payload.dhcpClientPortId,phase:'discover',status:'pending'})
      }else warning=`${client.name}'s DHCP lease expired. Addressing was cleared, but a new Discover could not be sent; check its link and packet queue.`
      continue
    }
    const phase=elapsed>=expiry*0.875?'rebind':elapsed>=expiry*0.5?'renew':undefined
    if(!phase)continue
    const pending=transactions.some(transaction=>transaction.sourceDeviceId===original.id&&transaction.renewalPhase&&transaction.status==='pending')
    if(pending)continue
    const nextLeaseState=phase==='renew'?'renewing':'rebinding'
    const phaseChanged=lease.state!==nextLeaseState
    if(!phaseChanged&&lease.lastRequestAtMs!==undefined&&now-lease.lastRequestAtMs<DHCP_RETRY_INTERVAL_MS)continue
    const requestId=crypto.randomUUID()
    const client=updatedDevices.find(device=>device.id===original.id)!
    const renewal=createDhcpRenewalPackets(client,updatedDevices,links,requestId,phase)
    if(!renewal.length||packets.length+renewal.length>MAX_IN_FLIGHT_PACKETS){
      warning=`${client.name} is ${phase==='renew'?'renewing':'rebinding'} its DHCP lease, but the request could not enter the packet queue.`
      continue
    }
    packets=[...packets,...renewal]
    updateDevice(client.id,device=>({...device,config:{...device.config,dhcpLease:{...lease,state:nextLeaseState,lastRequestAtMs:now}}}))
    addTransaction({requestId,sourceDeviceId:client.id,clientPortId:renewal[0].pdu.payload.dhcpClientPortId,phase:'request',status:'pending',serverDeviceId:phase==='renew'?lease.serverId:undefined,assignedIp:lease.ipAddress,leaseDurationSeconds:duration,renewalPhase:phase})
  }
  return {devices:updatedDevices,packets,transactions:updatedTransactions,warning}
}

function packetApplicationRequestId(packet: InFlightPacket, protocol: 'HTTP' | 'EMAIL' | 'DNS' | 'UDP') {
  const candidates = [packet.pdu, packet.pdu.pendingPacket].filter((pdu): pdu is NonNullable<typeof pdu> => Boolean(pdu))
  const pdu = candidates.find(candidate => protocol === 'HTTP' || protocol === 'EMAIL' ? Boolean(candidate.payload.tcpRequestId ?? candidate.payload.httpRequestId) : candidate.protocol === protocol)
  return protocol === 'HTTP' || protocol === 'EMAIL' ? pdu?.payload.tcpRequestId ?? pdu?.payload.httpRequestId : protocol === 'DNS' ? pdu?.payload.dnsRequestId : pdu?.payload.udpRequestId
}

function failDrainedTransactions<T extends { requestId: string; status: 'pending' | 'successful' | 'failed'; reason?: string }>(transactions: T[], previous: InFlightPacket[], remaining: InFlightPacket[], protocol: 'HTTP' | 'EMAIL' | 'DNS' | 'UDP', reason: string | ((transaction: T) => string), retainedRequestIds: Set<string> = new Set()): T[] {
  return transactions.map(transaction => {
    if (transaction.status !== 'pending' || retainedRequestIds.has(transaction.requestId)) return transaction
    const wasInFlight = previous.some(packet => packetApplicationRequestId(packet, protocol) === transaction.requestId)
    const remainsInFlight = remaining.some(packet => packetApplicationRequestId(packet, protocol) === transaction.requestId)
    const failureReason = typeof reason === 'function' ? reason(transaction) : reason
    return wasInFlight && !remainsInFlight ? { ...transaction, status: 'failed', reason: failureReason } : transaction
  })
}

function applyNtpSynchronizations(devices: NetworkDevice[], results: ReturnType<typeof stepSimulationTick>['udpResults']) {
  const latestByDevice = new Map(results
    .filter(result => result.service === 'ntp' && result.status === 'successful' && Number.isFinite(result.offsetMs) && Number.isInteger(result.stratum) && result.stratum! >= 1 && result.stratum! <= 15)
    .map(result => [result.sourceDeviceId, result]))
  if (!latestByDevice.size) return devices
  const synchronizedAtMs = Date.now()
  return devices.map(device => {
    const result = latestByDevice.get(device.id)
    return result ? { ...device, config: { ...device.config, ntpSynchronizedAtMs: synchronizedAtMs, ntpOffsetMs: result.offsetMs, ntpSynchronizedStratum: result.stratum } } : device
  })
}

function applyEmailTransactions(devices: NetworkDevice[], results: ReturnType<typeof stepSimulationTick>['emailResults']): NetworkDevice[] {
  const successful = results.filter(result => result.status === 'successful')
  if (!successful.length) return devices
  const byDevice = new Map<string, typeof successful>()
  for (const result of successful) byDevice.set(result.sourceDeviceId, [...(byDevice.get(result.sourceDeviceId) ?? []), result])
  let changed = false
  const updated = devices.map(device => {
    const resultsForDevice = byDevice.get(device.id)
    const account = device.config.emailAccount
    if (!resultsForDevice || !account) return device
    let inbox = account.inbox
    let sent = account.sent
    for (const result of resultsForDevice) {
      if (result.action === 'send' && result.message && !sent.some(message => message.id === result.message!.id)) {
        sent = [...sent, result.message].slice(-250)
      } else if (result.action === 'retrieve' && result.messages) {
        const messagesById = new Map([...inbox, ...result.messages].map(message => [message.id, message]))
        inbox = [...messagesById.values()].sort((a, b) => a.sentAtTick - b.sentAtTick).slice(-250)
      }
    }
    if (inbox === account.inbox && sent === account.sent) return device
    changed = true
    return { ...device, config: { ...device.config, emailAccount: { ...account, inbox, sent } } }
  })
  return changed ? updated : devices
}

function applyTftpDownloads(devices: NetworkDevice[], results: ReturnType<typeof stepSimulationTick>['udpResults']) {
  const downloads = results.filter(result => result.service === 'tftp' && result.status === 'successful' && result.fileName && result.response !== undefined)
  if (!downloads.length) return devices
  const downloadsByDevice = new Map<string, typeof downloads>()
  downloads.forEach(result => downloadsByDevice.set(result.sourceDeviceId, [...(downloadsByDevice.get(result.sourceDeviceId) ?? []), result]))
  const receivedAtMs = Date.now()
  return devices.map(device => {
    const newFiles = downloadsByDevice.get(device.id)
    if (!newFiles) return device
    let files = [...(device.config.tftpClientFiles ?? [])]
    for (const result of newFiles) {
      files = [...files.filter(file => file.serverIp !== result.targetIp || file.name !== result.fileName), { serverIp: result.targetIp, name: result.fileName!, contents: result.response!, receivedAtMs }]
    }
    return { ...device, config: { ...device.config, tftpClientFiles: files } }
  })
}

export const useNetworkStore = create<NetworkStore>((set, get) => ({
  commandEvents:[],
  devices: initialLab.devices,
  links: initialLab.links,
  annotations: initialLab.annotations || [],
  showPortLabels: true,
  selectedDeviceId: null,
  selectedLinkId: null,
  activeTool: 'select',
  connectingSource: null,
  inFlightPackets: [],
  pingResults: [],
  httpTransactions: [],
  emailTransactions: [],
  dnsTransactions: [],
  udpTransactions: [],
  dhcpTransactions: [],
  tcpReceiveBuffers: [],
  tcpOutstandingSegments: [],
  simulationMode: 'realtime',
  simulationPlaying: true,
  simulationTick: 0,
  simulationWarning: null,
  activeModal: null,
  deviceWindows: [],
  activeTab: 'cli',

  setActiveTool: (tool) => set({ activeTool: tool, connectingSource: null }),
  setSelectedDevice: (id) => set({ selectedDeviceId: id }),
  setSelectedLink: (id) => set({ selectedLinkId: id }),
  setActiveModal: (modal) => {
    if(modal?.type !== 'device' || !modal.deviceId) {set({activeModal:modal});return}
    const device=get().devices.find(device=>device.id===modal.deviceId)
    if(!device)return
    const windows=get().deviceWindows
    const z=Math.max(0,...windows.map(window=>window.z))+1
    const existing=windows.find(window=>window.deviceId===device.id)
    const viewportWidth=typeof window==='undefined'?1440:window.innerWidth
    const viewportHeight=typeof window==='undefined'?900:window.innerHeight
    const targetWidth=device.type==='phone'?600:1000
    const width=Math.max(300,Math.min(targetWidth,viewportWidth-80))
    const x=Math.max(0,Math.min(190+(windows.length%2)*(width+12),viewportWidth-width-8))
    const targetHeight=device.type==='phone'?550:680
    const height=Math.max(260,Math.min(targetHeight,viewportHeight-80))
    const next=existing?windows.map(window=>window.deviceId===device.id?{...window,z,minimized:false,width:Math.max(window.width,width),height:Math.max(window.height,height)}:window):[...windows,{deviceId:device.id,x,y:Math.max(0,Math.min(170+Math.floor(windows.length/2)*24,viewportHeight-height-8)),width,height,z,minimized:false}]
    set({activeModal:modal,deviceWindows:next})
  },
  updateDeviceWindow: (deviceId,updates) => set(state=>({deviceWindows:state.deviceWindows.map(window=>window.deviceId===deviceId?{...window,...updates,deviceId}:window)})),
  closeDeviceWindow: deviceId => set(state=>({deviceWindows:state.deviceWindows.filter(window=>window.deviceId!==deviceId),activeModal:state.activeModal?.deviceId===deviceId?null:state.activeModal})),
  minimizeDeviceWindow: deviceId => set(state=>({deviceWindows:state.deviceWindows.map(window=>window.deviceId===deviceId?{...window,minimized:true}:window)})),
  focusDeviceWindow: deviceId => {
    const z=Math.max(0,...get().deviceWindows.map(window=>window.z))+1
    set(state=>({deviceWindows:state.deviceWindows.map(window=>window.deviceId===deviceId?{...window,z,minimized:false}:window),activeModal:{type:'device',deviceId}}))
  },
  setActiveTab: (tab) => set({ activeTab: tab }),
  setConnectingSource: (source) => set({ connectingSource: source }),
  togglePortLabels: () => set((state) => ({ showPortLabels: !state.showPortLabels })),

  addDevice: (type, x, y, model) => {
    const newDevice = createDevice(type, x, y, model)
    set((state) => {
      let finalLinks = state.links
      const updatedNewDev = { ...newDevice }
      let updatedDevices = [...state.devices]

      // Automatic wireless association if AccessPoint is present
      if (type === 'smartphone' || type === 'tablet') {
        const ap = state.devices.find((d) => d.type === 'wireless' && (d.power ?? true))
        const apWlan = ap?.ports.find((p) => p.type === 'wireless')
        const clientWlan = updatedNewDev.ports.find((p) => p.type === 'wireless')
        if (ap && apWlan && clientWlan) {
          const wLink: NetworkLink = {
            id: `wlink-${ap.name}-${newDevice.name}-${Math.floor(Math.random() * 1000)}`,
            type: 'wireless',
            fromDeviceId: ap.id,
            fromPortId: apWlan.id,
            toDeviceId: updatedNewDev.id,
            toPortId: clientWlan.id,
            status: 'up',
          }
          updatedNewDev.ports = updatedNewDev.ports.map((p) =>
            p.id === clientWlan.id
              ? { ...p, connectedLinkId: wLink.id, connectedDeviceId: ap.id, connectedPortId: apWlan.id, status: 'up' as const }
              : p
          )
          finalLinks = [...finalLinks, wLink]
        }
      } else if (type === 'wireless') {
        // When Access Point is added, connect to any unlinked wireless clients (e.g. Smartphone or Tablet)
        const apWlan = updatedNewDev.ports.find((p) => p.type === 'wireless')
        if (apWlan) {
          const newLinks: NetworkLink[] = []
          updatedDevices = updatedDevices.map((d) => {
            const isClient = d.type === 'smartphone' || d.type === 'tablet' || (d.type === 'laptop' && d.modules?.includes('WPC300N'))
            const freeWlan = d.ports.find((p) => p.type === 'wireless' && !p.connectedLinkId)
            if (isClient && freeWlan && (d.power ?? true)) {
              const wLink: NetworkLink = {
                id: `wlink-${updatedNewDev.name}-${d.name}-${Math.floor(Math.random() * 1000)}`,
                type: 'wireless',
                fromDeviceId: updatedNewDev.id,
                fromPortId: apWlan.id,
                toDeviceId: d.id,
                toPortId: freeWlan.id,
                status: 'up',
              }
              newLinks.push(wLink)
              return {
                ...d,
                ports: d.ports.map((p) =>
                  p.id === freeWlan.id
                    ? { ...p, connectedLinkId: wLink.id, connectedDeviceId: updatedNewDev.id, connectedPortId: apWlan.id, status: 'up' as const }
                    : p
                ),
              }
            }
            return d
          })
          finalLinks = [...finalLinks, ...newLinks]
        }
      }

      return {
        devices: [...updatedDevices, updatedNewDev],
        links: finalLinks,
        selectedDeviceId: updatedNewDev.id,
      }
    })
  },

  toggleDevicePower: (id) => {
    set((state) => {
      const dev = state.devices.find((d) => d.id === id)
      if (!dev) return state
      const nextPower = dev.power === false ? true : false

      const updatedDevices = state.devices.map((d) => {
        if (d.id !== id) return d
        return {
          ...d,
          power: nextPower,
          ports:d.ports.map(port=>({...port})),
        }
      })

      const updatedLinks = state.links

      let finalLinks = updatedLinks
      if (nextPower) {
        const thisDev = updatedDevices.find((d) => d.id === id)
        const freeWlan = thisDev?.ports.find((p) => p.type === 'wireless' && !p.connectedLinkId)
        if (freeWlan && thisDev) {
          const ap = updatedDevices.find((d) => d.type === 'wireless' && (d.power ?? true) && d.id !== id)
          const apWlan = ap?.ports.find((p) => p.type === 'wireless')
          if (ap && apWlan) {
            const newLink: NetworkLink = {
              id: `wlink-${ap.name}-${thisDev.name}-${Math.floor(Math.random() * 1000)}`,
              type: 'wireless',
              fromDeviceId: ap.id,
              fromPortId: apWlan.id,
              toDeviceId: thisDev.id,
              toPortId: freeWlan.id,
              status: 'up',
            }
            freeWlan.connectedLinkId = newLink.id
            freeWlan.connectedDeviceId = ap.id
            freeWlan.connectedPortId = apWlan.id
            freeWlan.status = 'up'
            finalLinks = [...finalLinks, newLink]
          }
        }
      }

      return synchronizeLinkState(updatedDevices, finalLinks,state.simulationTick)
    })
  },

  installDeviceModule: (deviceId, slotIndex, moduleName) => {
    const { devices } = get()
    const dev = devices.find((d) => d.id === deviceId)
    if (!dev) return { success: false, message: 'Device not found' }
    if (dev.power !== false) {
      return {
        success: false,
        message: 'Cannot add a module when the power is on. Please turn off the power switch first.',
      }
    }
    const profile=getHardwareProfile(dev)
    if(!Number.isInteger(slotIndex)||slotIndex<0||slotIndex>=profile.slots)return {success:false,message:'Invalid module bay.'}
    if(!profile.moduleIds.includes(moduleName))return {success:false,message:'This module is not compatible with this device.'}
    if(dev.modules?.[slotIndex])return {success:false,message:'Remove the installed module first.'}

    set((state) => {
      const updatedDevices = state.devices.map((d) => {
        if (d.id !== deviceId) return d
        const currentModules = Array.from({length:Math.max(d.modules?.length??0,slotIndex+1)},(_,index)=>d.modules?.[index]??'')
        currentModules[slotIndex] = moduleName

        const currentPorts = [...d.ports,...modulePorts(d,slotIndex,moduleName)]
        return {
          ...d,
          modules: currentModules,
          ports: currentPorts,
        }
      })
      return synchronizeLinkState(updatedDevices,state.links,state.simulationTick)
    })

    return { success: true }
  },

  removeDeviceModule: (deviceId, slotIndex) => {
    const { devices } = get()
    const dev = devices.find((d) => d.id === deviceId)
    if (!dev) return { success: false, message: 'Device not found' }
    if (dev.power !== false) {
      return {
        success: false,
        message: 'Cannot remove a module when the power is on. Please turn off the power switch first.',
      }
    }
    const currentModules = [...(dev.modules || [])]
    const modName = currentModules[slotIndex]
    if (!modName) return { success: false, message: 'Slot is empty' }

    if(!Number.isInteger(slotIndex)||slotIndex<0)return {success:false,message:'Invalid module bay.'}
    currentModules[slotIndex]=''
    const portsToRemove = getModulePortIds(dev,slotIndex)
    const namesToRemove=dev.ports.filter(p=>portsToRemove.includes(p.id)).map(p=>p.name)

    set((state) => {
      const remainingLinks = state.links.filter((l) => {
        const involved =
          (l.fromDeviceId === deviceId && portsToRemove.includes(l.fromPortId)) ||
          (l.toDeviceId === deviceId && portsToRemove.includes(l.toPortId))
        return !involved
      })

      const updatedDevices = state.devices.map((d) => {
        return {
          ...d,
          modules: d.id === deviceId ? currentModules : d.modules,
          routingTable:d.id===deviceId?d.routingTable.filter(route=>!namesToRemove.includes(route.interfaceName)):d.routingTable,
          macTable:d.id===deviceId?d.macTable.filter(entry=>!portsToRemove.includes(entry.portId)):d.macTable,
          arpTable:d.id===deviceId?d.arpTable.filter(entry=>!namesToRemove.includes(entry.interfaceName)):d.arpTable,
          ports: d.ports.filter(p => d.id !== deviceId || !portsToRemove.includes(p.id)).map(port => {
            if (!port.connectedLinkId || remainingLinks.some(link => link.id === port.connectedLinkId)) return port
            return { ...port, status: 'down' as const, connectedLinkId: undefined, connectedDeviceId: undefined, connectedPortId: undefined }
          }),
        }
      })

      return synchronizeLinkState(updatedDevices, remainingLinks,state.simulationTick)
    })

    return { success: true }
  },

  updateDevicePosition: (id, x, y) => {
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, x, y } : d)),
    }))
  },

  deleteDevice: (id) => {
    set((state) => {
      // Free ports connected to this device
      const attachedLinks = state.links.filter(
        (l) => l.fromDeviceId === id || l.toDeviceId === id
      )
      const remainingLinks = state.links.filter(
        (l) => l.fromDeviceId !== id && l.toDeviceId !== id
      )

      const updatedDevices = state.devices
        .filter((d) => d.id !== id)
        .map((d) => ({
          ...d,
          ports: d.ports.map((p) => {
            if (attachedLinks.some((l) => l.id === p.connectedLinkId)) {
              return {
                ...p,
                status: 'down' as const,
                connectedLinkId: undefined,
                connectedDeviceId: undefined,
                connectedPortId: undefined,
              }
            }
            return p
          }),
        }))

      return {
        devices: updatedDevices,
        links: remainingLinks,
        selectedDeviceId: state.selectedDeviceId === id ? null : state.selectedDeviceId,
      }
    })
  },

  connectPorts: (fromDeviceId, fromPortId, toDeviceId, toPortId, cableType) => {
    const { devices, links, simulationTick } = get()
    const fromDev = devices.find((d) => d.id === fromDeviceId)
    const toDev = devices.find((d) => d.id === toDeviceId)
    if (!fromDev || !toDev || fromDeviceId === toDeviceId) return false

    const fromPort = fromDev.ports.find((p) => p.id === fromPortId)
    const toPort = toDev.ports.find((p) => p.id === toPortId)
    if (!fromPort || !toPort) return false
    if(!canCableConnect(fromPort,toPort,cableType))return false
    if(fromPort.virtualVlan!==undefined||toPort.virtualVlan!==undefined||fromPort.parentPortId||toPort.parentPortId)return false
    if (fromPort.connectedLinkId || toPort.connectedLinkId) return false // Already wired

    const isSwitchA = fromDev.type === 'switch'
    const isSwitchB = toDev.type === 'switch'
    const fastA=fromPort.portfast||fromDev.config.portfastDefault
    const fastB=toPort.portfast||toDev.config.portfastDefault
    const powered=fromDev.power!==false&&toDev.power!==false

    const initialStatus: LinkStatus =
      powered&&fromPort.adminStatus === 'up' && toPort.adminStatus === 'up'
        ? 'up'
        : 'down'

    const linkId = `link-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    const newLink: NetworkLink = {
      id: linkId,
      type: cableType,
      fromDeviceId,
      fromPortId,
      toDeviceId,
      toPortId,
      status: initialStatus,
    }

    set((state) => ({
      links: [...state.links, newLink],
      devices: state.devices.map((d) => {
        if (d.id === fromDeviceId) {
          return {
            ...d,
            ports: d.ports.map((p) =>
              p.id === fromPortId
                ? {
                    ...p,
                    status: newLink.status,
                    stpState: newLink.status==='up'&&isSwitchA ? (fastA ? 'forwarding' as const : 'listening' as const) : undefined,
                    stpSinceTick:newLink.status==='up'&&isSwitchA?simulationTick:undefined,
                    connectedLinkId: linkId,
                    connectedDeviceId: toDeviceId,
                    connectedPortId: toPortId,
                  }
                : p
            ),
          }
        }
        if (d.id === toDeviceId) {
          return {
            ...d,
            ports: d.ports.map((p) =>
              p.id === toPortId
                ? {
                    ...p,
                    status: newLink.status,
                    stpState: newLink.status==='up'&&isSwitchB ? (fastB ? 'forwarding' as const : 'listening' as const) : undefined,
                    stpSinceTick:newLink.status==='up'&&isSwitchB?simulationTick:undefined,
                    connectedLinkId: linkId,
                    connectedDeviceId: fromDeviceId,
                    connectedPortId: fromPortId,
                  }
                : p
            ),
          }
        }
        return d
      }),
      connectingSource: null,
      activeTool: 'select',
    }))

    return true
  },

  autoConnectDevices: (fromDeviceId, toDeviceId) => {
    const { devices, connectPorts } = get()
    const fromDev = devices.find((d) => d.id === fromDeviceId)
    const toDev = devices.find((d) => d.id === toDeviceId)
    if (!fromDev || !toDev || fromDeviceId === toDeviceId) return false

    // Check wireless connection
    const fromHasWireless = fromDev.ports.some((p) => p.type === 'wireless')
    const toHasWireless = toDev.ports.some((p) => p.type === 'wireless')
    if ((fromDev.type === 'wireless' && toHasWireless) || (toDev.type === 'wireless' && fromHasWireless)) {
      const p1 = fromDev.ports.find((p) => p.type === 'wireless')
      const p2 = toDev.ports.find((p) => p.type === 'wireless')
      if (p1 && p2) {
        return connectPorts(fromDeviceId, p1.id, toDeviceId, p2.id, 'wireless')
      }
    }

    let cableType: CableType = 'straight'
    const isEnd1 = ['pc', 'laptop', 'server', 'printer', 'phone', 'tv', 'tablet', 'smartphone'].includes(fromDev.type)
    const isEnd2 = ['pc', 'laptop', 'server', 'printer', 'phone', 'tv', 'tablet', 'smartphone'].includes(toDev.type)
    const isSwitch1 = fromDev.type === 'switch' || fromDev.type === 'hub'
    const isSwitch2 = toDev.type === 'switch' || toDev.type === 'hub'
    const isRouter1 = fromDev.type === 'router'
    const isRouter2 = toDev.type === 'router'

    if (isRouter1 && isRouter2) {
      const p1Serial = fromDev.ports.find((p) => p.type === 'serial' && !p.connectedLinkId)
      const p2Serial = toDev.ports.find((p) => p.type === 'serial' && !p.connectedLinkId)
      if (p1Serial && p2Serial) {
        return connectPorts(fromDeviceId, p1Serial.id, toDeviceId, p2Serial.id, 'serial-dce')
      }
      cableType = 'crossover'
    } else if (isSwitch1 && isSwitch2) {
      cableType = 'crossover'
    } else if (isEnd1 && isEnd2) {
      cableType = 'crossover'
    } else if ((isRouter1 && isEnd2) || (isRouter2 && isEnd1)) {
      cableType = 'crossover'
    } else {
      cableType = 'straight'
    }

    const port1 = fromDev.ports.find((p) => !p.connectedLinkId && (p.type === 'fastethernet' || p.type === 'gigabitethernet'))
    const port2 = toDev.ports.find((p) => !p.connectedLinkId && (p.type === 'fastethernet' || p.type === 'gigabitethernet'))

    if (port1 && port2) {
      return connectPorts(fromDeviceId, port1.id, toDeviceId, port2.id, cableType)
    }

    return false
  },

  deleteLink: (id) => {
    set((state) => {
      const link = state.links.find((l) => l.id === id)
      if (!link) return state

      return {
        links: state.links.filter((l) => l.id !== id),
        devices: state.devices.map((d) => {
          if (d.id === link.fromDeviceId || d.id === link.toDeviceId) {
            return {
              ...d,
              ports: d.ports.map((p) =>
                p.connectedLinkId === id
                  ? {
                      ...p,
                      status: 'down' as const,
                      connectedLinkId: undefined,
                      connectedDeviceId: undefined,
                      connectedPortId: undefined,
                    }
                  : p
              ),
            }
          }
          return d
        }),
      }
    })
  },

  addAnnotation: (annotation) => {
    set((state) => ({ annotations: [...state.annotations, annotation] }))
  },

  updateAnnotation: (id, updates) => {
    set((state) => ({
      annotations: state.annotations.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    }))
  },

  deleteAnnotation: (id) => {
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    }))
  },

  updatePortConfig: (deviceId, portId, updates) => {
    set((state) => {
      const dev = state.devices.find((d) => d.id === deviceId)
      if (!dev) return state

      const updatedDevices = state.devices.map((d) => {
        if (d.id !== deviceId) return d
        return {
          ...d,
          ports: d.ports.map((p) => {
            if (p.id !== portId) return p
            return { ...p, ...updates }
          }),
        }
      })

      return synchronizeLinkState(updatedDevices, state.links,state.simulationTick)
    })
  },

  updateDeviceConfig: (deviceId, updates) => {
    set((state) => ({
      devices: state.devices.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              name: updates.hostname || d.name,
              config: { ...d.config, ...updates },
            }
          : d
      ),
    }))
  },

  executeIosCommand: (deviceId, rawCmd) => {
    const { devices } = get()
    const dev = devices.find((d) => d.id === deviceId)
    if (!dev) return 'Device not found'
    const finish=(output:string)=>{const after=get().devices.find(d=>d.id===deviceId)||dev;set(state=>({commandEvents:[...state.commandEvents.slice(-39),observeCommand(dev,after,rawCmd,output)]}));return output}

    if (dev.power === false) {
      return finish('% Device is powered off. Turn power on in Physical tab to access CLI.')
    }

    if (dev.type === 'wlc') {
      const result = executeWlcCommand(dev, rawCmd, devices, get().links)
      if (result.config) get().updateDeviceConfig(deviceId, result.config)
      return finish(result.output)
    }

    if (/^(?:do )?show ephone(?: registered)?$/i.test(rawCmd.trim()) && dev.currentCliMode !== 'user') {
      const regs=getPhoneRegistrations(devices,get().links).filter(reg=>reg.routerId===deviceId)
      return finish(`CME registered ephones: ${regs.filter(reg=>reg.registered).length}\n${regs.map(reg=>`${reg.extension.padEnd(8)} ${reg.macAddress} ${reg.ipAddress || '-'} ${reg.reason}`).join('\n')}`)
    }
    const show=rawCmd.trim().toLowerCase().replace(/^do\s+/,'')
    if(dev.currentCliMode!=='user'&&/^(show|sh) ip dhcp binding$/.test(show)){
      const now=Date.now()
      const persistent=dev.config.dhcpBindings
      const rows=persistent
        ?persistent.filter(binding=>binding.acquiredAtMs+binding.leaseDurationSeconds*1000>now).map(binding=>{
          const remaining=Math.max(0,Math.ceil((binding.acquiredAtMs+binding.leaseDurationSeconds*1000-now)/1000))
          return `${binding.ipAddress.padEnd(18)}${binding.clientIdentifier.padEnd(24)}${`${remaining}s`.padEnd(12)}${binding.type==='manual'?'Manual':'Automatic'} ${binding.hardwareAddress}`
        })
        :devices.filter(d=>d.config.dhcpLease?.serverId===deviceId).filter(d=>{
          const lease=d.config.dhcpLease!
          return lease.acquiredAtMs===undefined||lease.acquiredAtMs+(lease.leaseDurationSeconds??86400)*1000>now
        }).map(client=>{
          const lease=client.config.dhcpLease!
          const remaining=lease.acquiredAtMs===undefined?(lease.leaseDurationSeconds??86400):Math.max(0,Math.ceil((lease.acquiredAtMs+(lease.leaseDurationSeconds??86400)*1000-now)/1000))
          const mac=client.ports.find(port=>port.ipAddress===lease.ipAddress)?.macAddress||client.ports[0]?.macAddress||'-'
          const clientId=`01${mac.replace(/[^0-9a-f]/gi,'').toLowerCase()}`
          return `${lease.ipAddress.padEnd(18)}${clientId.padEnd(24)}${`${remaining}s`.padEnd(12)}Automatic ${mac}`
        })
      return finish(`IP address        Client-ID                Lease remaining Type\n${rows.join('\n')||'No active DHCP bindings.'}`)
    }
    if(dev.currentCliMode!=='user'&&/^(show|sh) (spanning-tree|span)(?: vlan \d+| summary| mst(?: configuration)?(?: \d+)?)?$/.test(show)){
      if(/ summary$/.test(show))return finish(formatStpSummary(dev))
      if(/ mst configuration$/.test(show))return finish(formatMstConfiguration(dev))
      const mst=show.match(/ mst(?: (\d+))?$/)
      if(mst)return finish(formatStpInstanceView(devices,get().links,deviceId,mst[1]?Number(mst[1]):0))
      const vlan=Number(show.match(/vlan (\d+)/)?.[1]||1)
      return finish(formatStpVlanView(devices,get().links,deviceId,vlan))
    }
    if(dev.currentCliMode!=='user'&&/^(show|sh) etherchannel(?: summary)?$/.test(show)){
      const channels=getOperationalChannels(devices,get().links).filter(c=>c.links.some(l=>l.fromDeviceId===deviceId||l.toDeviceId===deviceId))
      return finish(`Number of channel-groups in use: ${channels.length}\nGroup  Port-channel  Protocol  Ports\n${channels.map(c=>{const ps=c.links.map(l=>dev.ports.find(p=>p.id===(l.fromDeviceId===deviceId?l.fromPortId:l.toPortId))!);return `${ps[0].channelGroup||1}      Po${ps[0].channelGroup||1}(SU)       ${ps[0].channelMode==='on'?'-':ps[0].channelMode==='auto'||ps[0].channelMode==='desirable'?'PAgP':'LACP'}      ${ps.map(p=>`${p.shortName}(P)`).join(' ')}`}).join('\n')}`)
    }

    const res = parseIosCommand(dev, rawCmd)

    set((state) => {
      const updatedDevices = state.devices.map((d) => {
        if (d.id !== deviceId) return d
        const nextMode = res.newMode || d.currentCliMode
        const nextHostname = res.newHostname || d.config.hostname
        const nextActiveInt = 'newActiveInterface' in res ? res.newActiveInterface : d.activeInterface
        const nextActiveVlan = 'newActiveVlan' in res ? res.newActiveVlan : d.activeVlan
        const nextDefaultGw = res.newDefaultGateway || d.config.defaultGateway

        let vlans = d.config.vlans || []
        if (res.newVlans) {
          vlans = res.newVlans
        }
        if (res.removedVlanId) {
          vlans = vlans.filter((v) => v.id !== res.removedVlanId)
        }

        let ports = res.newPorts ? [...d.ports,...res.newPorts] : d.ports
        if (res.modifiedPorts) {
          ports = ports.map((p) => {
            const mod = res.modifiedPorts?.find((m) => m.portId === p.id)
            if (mod) {
              const admin = mod.adminStatus !== undefined ? mod.adminStatus : p.adminStatus
              return {
                ...p,
                ...mod,
                adminStatus: admin,
              }
            }
            return p
          })
        }

        const nextActiveSubInt = 'newActiveSubInterface' in res ? res.newActiveSubInterface : d.activeSubInterface
        const nextActiveRange = 'newActiveRangePorts' in res ? res.newActiveRangePorts : d.activeRangePorts

        const ripNetworks = d.config.ripNetworks ? [...d.config.ripNetworks] : []
        if (res.newRipNetwork && !ripNetworks.includes(res.newRipNetwork)) {
          ripNetworks.push(res.newRipNetwork)
        }

        const eigrpNetworks = d.config.eigrpNetworks ? [...d.config.eigrpNetworks] : []
        if (res.newEigrpNetwork && !eigrpNetworks.some(n => n.network === res.newEigrpNetwork!.network && n.wildcard === res.newEigrpNetwork!.wildcard)) {
          eigrpNetworks.push(res.newEigrpNetwork)
        }

        const ospfNetworks = d.config.ospfNetworks ? [...d.config.ospfNetworks] : []
        if (res.newOspfNetwork && !ospfNetworks.some(n => n.network === res.newOspfNetwork!.network && n.wildcard === res.newOspfNetwork!.wildcard && n.area === res.newOspfNetwork!.area)) {
          ospfNetworks.push(res.newOspfNetwork)
        }

        const dhcpPools = d.config.dhcpPools ? [...d.config.dhcpPools] : []
        if (res.newDhcpPool) {
          dhcpPools.push(res.newDhcpPool)
        }

        let dhcpv6Pools = d.config.dhcpv6Pools ? [...d.config.dhcpv6Pools] : []
        if (res.newDhcpv6Pool) {
          dhcpv6Pools = [...dhcpv6Pools.filter(pool => pool.name !== res.newDhcpv6Pool!.name), res.newDhcpv6Pool]
        }
        if (res.removedDhcpv6Pool) {
          dhcpv6Pools = dhcpv6Pools.filter(pool => pool.name !== res.removedDhcpv6Pool)
        }

        const nextSecret = res.newSecretPassword || d.config.secretPassword

        let routingTable = [...d.routingTable]
        const readdressed = new Set(res.modifiedPorts?.filter(mod => 'ipAddress' in mod).map(mod => d.ports.find(port => port.id === mod.portId)?.name))
        routingTable = routingTable.filter(route => route.type !== 'C' || !readdressed.has(route.interfaceName))
        if (res.newRoutes) {
          routingTable.push(...res.newRoutes)
        }
        if (res.removedRoutes) {
          routingTable = routingTable.filter(
            (r) => !res.removedRoutes?.some((rr) => rr.network === r.network && rr.netmask === r.netmask && rr.nextHop === r.nextHop && rr.interfaceName === r.interfaceName)
          )
        }

        let ipv6RoutingTable = [...(d.ipv6RoutingTable ?? [])]
        if (res.newIpv6Routes) {
          for (const route of res.newIpv6Routes) {
            if (!ipv6RoutingTable.some((existing) => existing.network === route.network && existing.prefixLength === route.prefixLength && existing.nextHop === route.nextHop)) {
              ipv6RoutingTable.push(route)
            }
          }
        }
        if (res.removedIpv6Routes) {
          ipv6RoutingTable = ipv6RoutingTable.filter(
            (r) => !res.removedIpv6Routes?.some((rr) => rr.network === r.network && rr.prefixLength === r.prefixLength && rr.nextHop === r.nextHop)
          )
        }
        if (res.resetOspfv3) {
          ipv6RoutingTable = ipv6RoutingTable.filter((r) => r.type !== 'O')
        }

        return {
          ...d,
          currentCliMode: nextMode,
          ospf: res.resetOspf ? undefined : d.ospf,
          ospfv3: res.resetOspfv3 ? undefined : d.ospfv3,
          ipv6OspfSequence: res.resetOspfv3 ? undefined : d.ipv6OspfSequence,
          rip: res.resetRip ? undefined : d.rip,
          eigrp: res.resetEigrp ? undefined : d.eigrp,
          activeInterface: nextActiveInt,
          activeSubInterface: nextActiveSubInt,
          activeRangePorts: nextActiveRange,
          activeVlan: nextActiveVlan,
          activeVoiceId: res.newActiveVoiceId ?? d.activeVoiceId,
          activeDhcpPool: res.newActiveDhcpPool ?? d.activeDhcpPool,
          activeRoutingProtocol: nextMode === 'config-router' ? (res.newActiveRoutingProtocol ?? d.activeRoutingProtocol) : undefined,
          config: {
            ...d.config,
            hostname: nextHostname,
            defaultGateway: nextDefaultGw,
            vlans,
            ripNetworks,
            eigrpNetworks,
            ospfNetworks,
            dhcpPools,
            ...(dhcpv6Pools.length || res.removedDhcpv6Pool ? { dhcpv6Pools: dhcpv6Pools.length ? dhcpv6Pools : undefined } : {}),
            secretPassword: nextSecret,
            ...res.newDeviceConfig,
          },
          ports,
          routingTable: routingTable.filter(r => !(res.resetOspf && r.type === 'O') && !(res.resetRip && r.type === 'R') && !(res.resetEigrp && r.type === 'D')),
          ipv6RoutingTable: ipv6RoutingTable.length ? ipv6RoutingTable : undefined,
          cliHistory: [...d.cliHistory, rawCmd],
        }
      })

      return synchronizeLinkState(updatedDevices, state.links,state.simulationTick)
    })

    // Clients that just entered SLAAC or DHCPv6 mode solicit control traffic
    // immediately: a router solicitation (both modes) and a DHCPv6 solicit
    // (DHCPv6 mode only).
    if (res.modifiedPorts?.length) {
      const applied = get().devices.find(d => d.id === deviceId)
      if (applied) {
        const flagged = res.modifiedPorts
          .map(mod => applied.ports.find(p => p.id === mod.portId))
          .filter((port): port is NonNullable<typeof port> => port !== undefined && (port.ipv6Autoconfig === true || port.ipv6Dhcp === true))
        const flaggedPortIds = flagged.map(port => port.id)
        if (flaggedPortIds.length) {
          const wantsDhcpv6 = flagged.some(port => port.ipv6Dhcp === true)
          const { links, inFlightPackets } = get()
          const controlPackets = [
            ...createRouterSolicitationPackets(applied, links, flaggedPortIds),
            ...(wantsDhcpv6 ? createDhcpv6SolicitPackets(applied, links, crypto.randomUUID(), flaggedPortIds) : []),
          ]
          if (controlPackets.length && inFlightPackets.length + controlPackets.length <= MAX_IN_FLIGHT_PACKETS) {
            set(state => ({ inFlightPackets: [...state.inFlightPackets, ...controlPackets] }))
          }
        }
      }
    }

    if (res.triggerPing) {
      const id = get().sendPing(deviceId, res.triggerPing.targetIp)
      if (!id) return finish(`% ${get().simulationWarning || 'Could not send ping.'}`)
    }
    if (res.triggerNtp) {
      const id = get().requestNtp(deviceId, res.triggerNtp.targetIp)
      if (!id) return finish(`% ${get().simulationWarning || 'Could not send NTP request.'}`)
    }

    return finish(res.output)
  },

  requestDhcp: deviceId => {
    const { devices, links, inFlightPackets } = get()
    const client = devices.find(device => device.id === deviceId)
    if (!client) return 'DHCP failed: client device was not found.'
    if (inFlightPackets.length >= MAX_IN_FLIGHT_PACKETS) {
      const reason = 'DHCP Discover was not sent because the simulation packet queue is full.'
      set({ simulationWarning: reason })
      return reason
    }
    const requestId = crypto.randomUUID()
    const packets = createDhcpDiscoverPackets(client, devices, links, requestId)
    if (!packets.length) {
      const reason = 'DHCP Discover was not sent. Connect an active Ethernet or wireless interface and bring it up first.'
      set({ simulationWarning: reason })
      return reason
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      const reason = 'DHCP Discover was not sent because the simulation packet queue is full.'
      set({ simulationWarning: reason })
      return reason
    }
    set(state => ({
      devices: state.devices.map(device => {
        if (device.id !== deviceId) return device
        const hasLease = Boolean(device.config.dhcpLease)
        const portId = packets[0]?.pdu.payload.dhcpClientPortId
        return {
          ...device,
          config: {
            ...device.config, dhcpEnabled: true,
            dhcpLease: hasLease ? device.config.dhcpLease : undefined,
            defaultGateway: hasLease ? device.config.defaultGateway : undefined,
            dnsServer: hasLease ? device.config.dnsServer : undefined,
          },
          ports: hasLease ? device.ports : device.ports.map(port => port.id === portId ? { ...port, ipAddress: undefined, subnetMask: undefined } : port),
        }
      }),
      inFlightPackets: [...state.inFlightPackets, ...packets],
      dhcpTransactions: [...state.dhcpTransactions, { requestId, sourceDeviceId: deviceId, clientPortId: packets[0].pdu.payload.dhcpClientPortId, phase: 'discover' as const, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return `DHCP Discover sent from ${client.name}. Waiting for an Offer and ACK.`
  },

  setIpv6HostMode: (deviceId, portId, mode) => {
    set(state => ({
      devices: state.devices.map(device => device.id !== deviceId ? device : {
        ...device,
        ports: device.ports.map(port => port.id !== portId ? port : {
          ...port,
          ipv6Autoconfig: mode === 'auto',
          ipv6Dhcp: mode === 'dhcpv6',
          ipv6Addresses: mode === 'static'
            ? (port.ipv6Addresses ?? []).filter(address => address.source !== 'slaac' && address.source !== 'dhcpv6')
            : port.ipv6Addresses,
        }),
      }),
    }))
    if (mode === 'static') return
    const device = get().devices.find(d => d.id === deviceId)
    if (!device) return
    const { links, inFlightPackets } = get()
    const controlPackets = [
      ...createRouterSolicitationPackets(device, links, [portId]),
      ...(mode === 'dhcpv6' ? createDhcpv6SolicitPackets(device, links, crypto.randomUUID(), [portId]) : []),
    ]
    if (controlPackets.length && inFlightPackets.length + controlPackets.length <= MAX_IN_FLIGHT_PACKETS) {
      set(state => ({ inFlightPackets: [...state.inFlightPackets, ...controlPackets] }))
    }
  },

  sendPing: (sourceDeviceId, targetIp) => {
    const { devices, links } = get()
    const source = devices.find((d) => d.id === sourceDeviceId)
    if (!source) return null

    if(source.power!==false&&source.ports.some(p=>(p.ipAddress===targetIp||(p.ipv6Addresses??[]).some(address=>address.address===targetIp))&&p.adminStatus==='up')){
      const id=crypto.randomUUID()
      set(state=>({simulationWarning:null,pingResults:retainResults([...state.pingResults,{id,sourceDeviceId,targetIp,status:'successful',ttl:128,reason:'Local interface reply. No packet was placed on a cable.'}])}))
      return id
    }

    if (get().inFlightPackets.length >= MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more packets.' })
      return null
    }
    const packets = createPingPackets(source, devices, links, targetIp)
    if (!packets.length) {
      set({ simulationWarning: 'Could not send ping. Check the destination IP, source interface, route, gateway, and link status.' })
      return null
    }
    if(get().inFlightPackets.length+packets.length>MAX_IN_FLIGHT_PACKETS){set({simulationWarning:'Packet queue is full. Pause or reset the simulation before sending more packets.'});return null}
    const id = crypto.randomUUID()
    for(const packet of packets){packet.pdu.pingId=id;if(packet.pdu.pendingPacket)packet.pdu.pendingPacket.pingId=id}
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets], simulationWarning: null,
      pingResults: [...state.pingResults, { id, sourceDeviceId, targetIp, status: 'pending' }],
    }))
    return id
  },

  toggleSimulationMode: () => {
    set((state) => ({
      simulationMode: state.simulationMode === 'realtime' ? 'simulation' : 'realtime',
      simulationPlaying: state.simulationMode === 'realtime' ? false : true,
    }))
  },

  setSimulationPlaying: (playing) => set({ simulationPlaying: playing }),

  tickSimulation: () => {
    const { devices, links, inFlightPackets, simulationMode, simulationPlaying, simulationTick, tcpReceiveBuffers, tcpOutstandingSegments } = get()
    if (simulationMode === 'simulation' && !simulationPlaying) return
    const hasRoutingActivity=devices.some(d=>hasOspf(d)||d.ospf||hasIpv6Ospf(d)||d.ospfv3||hasRip(d)||d.rip||hasEigrp(d)||d.eigrp||d.ports.some(port=>port.isGreTunnel&&port.greKeepalivePeriodSeconds))||hasStpActivity(devices,links)||hasHsrpActivity(devices)||hasMacAgingActivity(devices)||hasCapwapActivity(devices)
    if(inFlightPackets.length===0&&tcpOutstandingSegments.length===0&&!hasRoutingActivity){
      const timers=advanceDhcpLeaseTimers(devices,links,inFlightPackets,get().dhcpTransactions)
      if(timers.devices!==devices||timers.packets!==inFlightPackets||timers.transactions!==get().dhcpTransactions||timers.warning)set({devices:timers.devices,inFlightPackets:timers.packets,dhcpTransactions:timers.transactions,simulationWarning:timers.warning??get().simulationWarning})
      return
    }

    const nextSimulationTick=simulationTick+1
    const result = stepSimulationTick(devices, links, inFlightPackets, tcpReceiveBuffers, tcpOutstandingSegments,nextSimulationTick)
    const retainedHttpRequests = new Set(result.tcpOutstandingSegments.map(segment => segment.requestId))
    const httpTransactions = failDrainedTransactions(mergeHttpTransactions(get().httpTransactions, result.applicationResults), inFlightPackets, result.newInFlightPackets, 'HTTP', 'No HTTP response arrived before this request left the simulated network.', retainedHttpRequests)
    const emailTransactions = failDrainedTransactions(mergeEmailTransactions(get().emailTransactions, result.emailResults), inFlightPackets, result.newInFlightPackets, 'EMAIL', 'No SMTP or POP3 response arrived before this request left the simulated network.', retainedHttpRequests)
    const dhcpTransactions = failDrainedDhcpTransactions(mergeDhcpTransactions(get().dhcpTransactions, result.dhcpResults), inFlightPackets, result.newInFlightPackets, result.updatedDevices, links)
    const dhcpFailure = dhcpTransactions.find(transaction => transaction.status === 'failed' && get().dhcpTransactions.some(previous => previous.requestId === transaction.requestId && previous.status === 'pending'))
    const dhcpTimers=advanceDhcpLeaseTimers(applyTftpDownloads(applyNtpSynchronizations(applyEmailTransactions(applyDhcpAcknowledgements(result.updatedDevices,result.dhcpResults), result.emailResults), result.udpResults), result.udpResults),links,result.newInFlightPackets,dhcpTransactions)
    set({
      devices: dhcpTimers.devices,
      simulationTick:nextSimulationTick,
      inFlightPackets: dhcpTimers.packets,
      pingResults: completePingResults(get().pingResults, inFlightPackets, result),
      httpTransactions,
      emailTransactions,
      tcpReceiveBuffers: result.tcpReceiveBuffers.filter(buffer => httpTransactions.some(transaction => transaction.requestId === buffer.requestId && transaction.status === 'pending') || emailTransactions.some(transaction => transaction.requestId === buffer.requestId && transaction.status === 'pending')),
      tcpOutstandingSegments: result.tcpOutstandingSegments.filter(segment => httpTransactions.some(transaction => transaction.requestId === segment.requestId && transaction.status !== 'failed') || emailTransactions.some(transaction => transaction.requestId === segment.requestId && transaction.status !== 'failed')),
      dnsTransactions: failDrainedTransactions(mergeDnsTransactions(get().dnsTransactions, result.dnsResults), inFlightPackets, result.newInFlightPackets, 'DNS', 'No DNS response arrived before this query left the simulated network.'),
      udpTransactions: failDrainedTransactions(mergeUdpTransactions(get().udpTransactions, result.udpResults), inFlightPackets, result.newInFlightPackets, 'UDP', transaction => transaction.service === 'ntp' ? 'No NTP response arrived before this request left the simulated network.' : transaction.service === 'tftp' ? `No TFTP response arrived for ${transaction.fileName ?? 'the requested file'} before the request left the simulated network.` : transaction.service === 'snmp' ? 'No SNMP response arrived before this request left the simulated network.' : 'No UDP Echo response arrived before this request left the simulated network.'),
      dhcpTransactions:dhcpTimers.transactions,
      simulationWarning: dhcpFailure?.reason ?? dhcpTimers.warning ?? (result.queueLimitReached ? 'Packet limit reached. Excess traffic was dropped to keep the simulation responsive.' : get().simulationWarning),
    })
  },

  stepSimulation: () => {
    const { devices, links, inFlightPackets, simulationTick, tcpReceiveBuffers, tcpOutstandingSegments } = get()
    const hasRoutingActivity=devices.some(d=>hasOspf(d)||d.ospf||hasIpv6Ospf(d)||d.ospfv3||hasRip(d)||d.rip||hasEigrp(d)||d.eigrp||d.ports.some(port=>port.isGreTunnel&&port.greKeepalivePeriodSeconds))||hasStpActivity(devices,links)||hasHsrpActivity(devices)||hasMacAgingActivity(devices)||hasCapwapActivity(devices)
    if(inFlightPackets.length===0&&tcpOutstandingSegments.length===0&&!hasRoutingActivity){
      const timers=advanceDhcpLeaseTimers(devices,links,inFlightPackets,get().dhcpTransactions)
      if(timers.devices!==devices||timers.packets!==inFlightPackets||timers.transactions!==get().dhcpTransactions||timers.warning)set({devices:timers.devices,inFlightPackets:timers.packets,dhcpTransactions:timers.transactions,simulationWarning:timers.warning??get().simulationWarning})
      return
    }
    const nextSimulationTick=simulationTick+1
    const result = stepSimulationTick(devices, links, inFlightPackets, tcpReceiveBuffers, tcpOutstandingSegments,nextSimulationTick)
    const retainedHttpRequests = new Set(result.tcpOutstandingSegments.map(segment => segment.requestId))
    const httpTransactions = failDrainedTransactions(mergeHttpTransactions(get().httpTransactions, result.applicationResults), inFlightPackets, result.newInFlightPackets, 'HTTP', 'No HTTP response arrived before this request left the simulated network.', retainedHttpRequests)
    const emailTransactions = failDrainedTransactions(mergeEmailTransactions(get().emailTransactions, result.emailResults), inFlightPackets, result.newInFlightPackets, 'EMAIL', 'No SMTP or POP3 response arrived before this request left the simulated network.', retainedHttpRequests)
    const dhcpTransactions = failDrainedDhcpTransactions(mergeDhcpTransactions(get().dhcpTransactions, result.dhcpResults), inFlightPackets, result.newInFlightPackets, result.updatedDevices, links)
    const dhcpFailure = dhcpTransactions.find(transaction => transaction.status === 'failed' && get().dhcpTransactions.some(previous => previous.requestId === transaction.requestId && previous.status === 'pending'))
    const dhcpTimers=advanceDhcpLeaseTimers(applyTftpDownloads(applyNtpSynchronizations(applyEmailTransactions(applyDhcpAcknowledgements(result.updatedDevices,result.dhcpResults), result.emailResults), result.udpResults), result.udpResults),links,result.newInFlightPackets,dhcpTransactions)
    set({
      devices: dhcpTimers.devices,
      simulationTick:nextSimulationTick,
      inFlightPackets: dhcpTimers.packets,
      pingResults: completePingResults(get().pingResults, inFlightPackets, result),
      httpTransactions,
      emailTransactions,
      tcpReceiveBuffers: result.tcpReceiveBuffers.filter(buffer => httpTransactions.some(transaction => transaction.requestId === buffer.requestId && transaction.status === 'pending') || emailTransactions.some(transaction => transaction.requestId === buffer.requestId && transaction.status === 'pending')),
      tcpOutstandingSegments: result.tcpOutstandingSegments.filter(segment => httpTransactions.some(transaction => transaction.requestId === segment.requestId && transaction.status !== 'failed') || emailTransactions.some(transaction => transaction.requestId === segment.requestId && transaction.status !== 'failed')),
      dnsTransactions: failDrainedTransactions(mergeDnsTransactions(get().dnsTransactions, result.dnsResults), inFlightPackets, result.newInFlightPackets, 'DNS', 'No DNS response arrived before this query left the simulated network.'),
      udpTransactions: failDrainedTransactions(mergeUdpTransactions(get().udpTransactions, result.udpResults), inFlightPackets, result.newInFlightPackets, 'UDP', transaction => transaction.service === 'ntp' ? 'No NTP response arrived before this request left the simulated network.' : transaction.service === 'tftp' ? `No TFTP response arrived for ${transaction.fileName ?? 'the requested file'} before the request left the simulated network.` : transaction.service === 'snmp' ? 'No SNMP response arrived before this request left the simulated network.' : 'No UDP Echo response arrived before this request left the simulated network.'),
      dhcpTransactions:dhcpTimers.transactions,
      simulationWarning: dhcpFailure?.reason ?? dhcpTimers.warning ?? (result.queueLimitReached ? 'Packet limit reached. Excess traffic was dropped to keep the simulation responsive.' : get().simulationWarning),
    })
  },

  clearSimulation: () => set(state => ({
    devices: state.devices.some(device => device.asaNatTranslations?.length || device.ports.some(port => port.isGreTunnel && port.greKeepalivePeriodSeconds !== undefined &&
      (port.greKeepaliveElapsedMs !== 0 || port.greKeepaliveMissed !== 0 || port.greKeepaliveSequence !== 0 || port.greKeepaliveOperational !== true)))
      ? state.devices.map(device => {
        const resetPorts = device.ports.some(port => port.isGreTunnel && port.greKeepalivePeriodSeconds !== undefined &&
          (port.greKeepaliveElapsedMs !== 0 || port.greKeepaliveMissed !== 0 || port.greKeepaliveSequence !== 0 || port.greKeepaliveOperational !== true))
        if (!device.asaNatTranslations?.length && !resetPorts) return device
        return {
          ...device,
          asaNatTranslations: undefined,
          ports: resetPorts ? device.ports.map(port => port.isGreTunnel && port.greKeepalivePeriodSeconds !== undefined
            ? { ...port, greKeepaliveElapsedMs: 0, greKeepaliveMissed: 0, greKeepaliveSequence: 0, greKeepaliveOperational: true }
            : port) : device.ports,
        }
      })
      : state.devices,
    inFlightPackets: [], tcpReceiveBuffers: [], tcpOutstandingSegments: [], simulationWarning: null, connectingSource: null,
    pingResults: cancelPendingPings(state.pingResults),
    httpTransactions: state.httpTransactions.map(transaction => transaction.status === 'pending' ? { ...transaction, status: 'failed', reason: 'Cancelled when the simulation was cleared.' } : transaction),
    emailTransactions: state.emailTransactions.map(transaction => transaction.status === 'pending' ? { ...transaction, status: 'failed', reason: 'Cancelled when the simulation was cleared.' } : transaction),
    dnsTransactions: state.dnsTransactions.map(transaction => transaction.status === 'pending' ? { ...transaction, status: 'failed', reason: 'Cancelled when the simulation was cleared.' } : transaction),
    udpTransactions: state.udpTransactions.map(transaction => transaction.status === 'pending' ? { ...transaction, status: 'failed', reason: 'Cancelled when the simulation was cleared.' } : transaction),
    dhcpTransactions: state.dhcpTransactions.map(transaction => transaction.status === 'pending' ? { ...transaction, phase: 'failed', status: 'failed', reason: 'DHCP exchange cancelled when the simulation was cleared.' } : transaction),
  })),

  requestHttp: (sourceDeviceId, targetIp, path, suppliedRequestId) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source) return null
    const requestId = suppliedRequestId ?? crypto.randomUUID()
    if (get().httpTransactions.some(transaction => transaction.requestId === requestId)) return requestId
    const packets = createHttpGetPackets(source, devices, links, requestId, targetIp, path)
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send HTTP request. Check the IPv4 address, source interface, route, gateway, outbound ACL and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      httpTransactions: [...state.httpTransactions, { requestId, sourceDeviceId, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  sendEmail: (sourceDeviceId, to, subject, body) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source?.config.emailAccount) {
      set({ simulationWarning: 'Cannot send email. Configure an email account on this device first.' })
      return null
    }
    if (!to.trim() || !subject.trim() || !body.trim()) {
      set({ simulationWarning: 'Enter a recipient, subject, and message before sending email.' })
      return null
    }
    if (to.length > 254 || subject.length > 255 || new TextEncoder().encode(body).byteLength > 65_536) {
      set({ simulationWarning: 'Email exceeds a limit: address 254 characters, subject 255 characters, or message 64 KiB.' })
      return null
    }
    const requestId = crypto.randomUUID()
    const packets = createEmailPackets(source, devices, links, requestId, 'send', { to: to.trim(), subject: subject.trim(), body })
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send email. Check the outgoing mail server IPv4 address, source route, gateway, ACL, and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      emailTransactions: [...state.emailTransactions, { requestId, sourceDeviceId, action: 'send' as const, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  checkEmail: (sourceDeviceId) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source?.config.emailAccount) {
      set({ simulationWarning: 'Cannot check email. Configure an email account on this device first.' })
      return null
    }
    const requestId = crypto.randomUUID()
    const packets = createEmailPackets(source, devices, links, requestId, 'retrieve')
    if (!packets.length) {
      set({ simulationWarning: 'Cannot check email. Check the incoming mail server IPv4 address, source route, gateway, ACL, and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      emailTransactions: [...state.emailTransactions, { requestId, sourceDeviceId, action: 'retrieve' as const, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  deleteEmail: (sourceDeviceId, messageId) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source?.config.emailAccount) {
      set({ simulationWarning: 'Cannot delete server email. Configure an email account on this device first.' })
      return null
    }
    if (!messageId || messageId.length > 128) {
      set({ simulationWarning: 'Select a valid inbox message before deleting it from the server.' })
      return null
    }
    const requestId = crypto.randomUUID()
    const packets = createEmailPackets(source, devices, links, requestId, 'delete', { messageId, pop3Phase: 'session' })
    if (!packets.length) {
      set({ simulationWarning: 'Cannot delete server email. Check the incoming mail server IPv4 address, source route, gateway, ACL, and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      emailTransactions: [...state.emailTransactions, { requestId, sourceDeviceId, action: 'delete' as const, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  requestDns: (sourceDeviceId, domain) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source) return null
    const requestId = crypto.randomUUID()
    const packets = createDnsQueryPackets(source, devices, links, requestId, domain)
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send DNS query. Check the hostname, DNS server address, source interface, route, gateway, outbound ACL and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      dnsTransactions: [...state.dnsTransactions, { requestId, sourceDeviceId, domain: domain.trim().toLowerCase().replace(/\.$/, ''), status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  requestUdpEcho: (sourceDeviceId, targetIp, port, data) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source) return null
    const requestId = crypto.randomUUID()
    const packets = createUdpEchoPackets(source, devices, links, requestId, targetIp, port, data)
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send UDP Echo. Check the destination IPv4 address, port, source interface, route, gateway, outbound ACL, payload size and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      udpTransactions: [...state.udpTransactions, { requestId, sourceDeviceId, targetIp, port, service: 'echo' as const, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  requestNtp: (sourceDeviceId, targetIp) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source) return null
    const requestId = crypto.randomUUID()
    const packets = createNtpQueryPackets(source, devices, links, requestId, targetIp)
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send NTP query. Check the destination IPv4 address, source interface, route, gateway, outbound ACL and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      udpTransactions: [...state.udpTransactions, { requestId, sourceDeviceId, targetIp, port: 123, service: 'ntp' as const, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  requestSnmpQuery: (sourceDeviceId, targetIp, operation, oid, community) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source) return null
    const requestId = crypto.randomUUID()
    const packets = createSnmpQueryPackets(source, devices, links, requestId, targetIp, operation, oid, community)
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send SNMP query. Check the OID, community format, destination IPv4 address, source interface, route, gateway, outbound ACL and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      udpTransactions: [...state.udpTransactions, { requestId, sourceDeviceId, targetIp, port: 161, service: 'snmp' as const, oid, operation, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  requestTftpRead: (sourceDeviceId, targetIp, fileName) => {
    const { devices, links, inFlightPackets } = get()
    const source = devices.find(device => device.id === sourceDeviceId)
    if (!source) return null
    const requestId = crypto.randomUUID()
    const packets = createTftpReadPackets(source, devices, links, requestId, targetIp, fileName)
    if (!packets.length) {
      set({ simulationWarning: 'Cannot send TFTP read request. Check the filename, destination IPv4 address, source interface, route, gateway, UDP port 69 ACL and link status.' })
      return null
    }
    if (inFlightPackets.length + packets.length > MAX_IN_FLIGHT_PACKETS) {
      set({ simulationWarning: 'Packet queue is full. Pause or reset the simulation before sending more traffic.' })
      return null
    }
    set(state => ({
      inFlightPackets: [...state.inFlightPackets, ...packets],
      udpTransactions: [...state.udpTransactions, { requestId, sourceDeviceId, targetIp, port: 69, service: 'tftp' as const, fileName, status: 'pending' as const }].slice(-100),
      simulationWarning: null,
    }))
    return requestId
  },

  loadLab: (devices, links, annotations) => {
    const restoredDevices=devices.map(device=>{
      const ports=device.ports.map(port=>port.stpState||port.stpSinceTick!==undefined||port.stpVlanStates?{...port,stpState:undefined,stpSinceTick:undefined,stpVlanStates:undefined}:port)
      const macTable=stripMacAgingRuntime(device.macTable)
      const changed=!!device.stpRuntime||ports.some((port,index)=>port!==device.ports[index])||macTable.some((entry,index)=>entry!==device.macTable[index])
      return changed?{...device,stpRuntime:undefined,ports,macTable}:device
    })
    set({
      devices:restoredDevices,
      simulationTick:0,
      links,
      annotations: annotations || [],
      selectedDeviceId: null,
      selectedLinkId: null,
      inFlightPackets: [],
      tcpReceiveBuffers: [],
      tcpOutstandingSegments: [],
      pingResults: [],
      httpTransactions: [],
      emailTransactions: [],
      dnsTransactions: [],
      udpTransactions: [],
      dhcpTransactions: [],
      simulationWarning: null,
      connectingSource: null,
      deviceWindows: get().deviceWindows.filter(window=>devices.some(device=>device.id===window.deviceId)),
    })
  },

  resetTopology: () => {
    set({
      devices: [],
      simulationTick:0,
      links: [],
      annotations: [],
      selectedDeviceId: null,
      selectedLinkId: null,
      inFlightPackets: [],
      tcpReceiveBuffers: [],
      tcpOutstandingSegments: [],
      pingResults: [],
      httpTransactions: [],
      emailTransactions: [],
      dnsTransactions: [],
      udpTransactions: [],
      dhcpTransactions: [],
      simulationWarning: null,
      connectingSource: null,
      deviceWindows: [],
    })
  },
}))

if (typeof window !== 'undefined') {
  (window as unknown as { __wireforgeNetworkStore: typeof useNetworkStore }).__wireforgeNetworkStore = useNetworkStore
}
