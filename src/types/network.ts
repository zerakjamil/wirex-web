export type DeviceType =
  | 'router'
  | 'switch'
  | 'pc'
  | 'laptop'
  | 'server'
  | 'printer'
  | 'phone'
  | 'tv'
  | 'tablet'
  | 'smartphone'
  | 'wireless'
  | 'wlc'
  | 'iot'
  | 'security'
  | 'hub'
  | 'cloud'
  | 'modem'

export type PortType = 'fastethernet' | 'gigabitethernet' | 'serial' | 'wireless' | 'coaxial' | 'phone'

export type LinkStatus = 'up' | 'down' | 'learning'

export interface HsrpGroupConfig {
  group: number
  virtualIp?: string
  priority?: number
  preempt?: boolean
}

export interface HsrpGroupRuntime {
  state: 'initial' | 'active' | 'standby'
  activeDeviceId?: string
  activeDeviceName?: string
  activeIp?: string
  lastChangeTick: number
}

export interface NetworkPort {
  hsrpGroups?: HsrpGroupConfig[]
  hsrpRuntime?: Record<string,HsrpGroupRuntime>
  ospfCost?: number
  ospfHelloInterval?: number
  ospfDeadInterval?: number
  ospfNetworkType?: 'broadcast' | 'point-to-point'
  ospfPriority?: number
  ipv6OspfProcess?: number
  ipv6OspfArea?: number
  ipv6OspfCost?: number
  ipv6OspfPriority?: number
  isGreTunnel?: boolean
  greSourceInterface?: string
  greDestinationIp?: string
  greMode?: 'gre ip'
  greKeepalivePeriodSeconds?: number
  greKeepaliveRetries?: number
  greKeepaliveElapsedMs?: number
  greKeepaliveMissed?: number
  greKeepaliveSequence?: number
  greKeepaliveOperational?: boolean
  parentPortId?: string
  dot1qVlan?: number
  dot1qNative?: boolean
  moduleSlot?: number
  media?: 'copper' | 'fiber'
  id: string
  name: string
  shortName: string
  type: PortType
  ipAddress?: string
  subnetMask?: string
  ipv6Addresses?: Ipv6AddressConfig[]
  ipv6Autoconfig?: boolean
  ipv6Dhcp?: boolean
  ipv6DhcpServerPool?: string
  ipv6NdManagedConfig?: boolean
  ipv6NdOtherConfig?: boolean
  macAddress: string
  status: LinkStatus
  stpState?: 'blocking' | 'listening' | 'learning' | 'forwarding'
  stpSinceTick?: number
  stpVlanStates?: Record<string, { state: 'blocking' | 'listening' | 'learning' | 'forwarding'; sinceTick?: number }>
  adminStatus: 'up' | 'down'
  vlan?: number
  voiceVlan?: number
  portMode?: 'access' | 'trunk'
  allowedVlans?: number[]
  nativeVlan?: number
  channelGroup?: number
  channelMode?: 'active' | 'passive' | 'desirable' | 'auto' | 'on'
  portfast?: boolean
  stpCost?: number
  stpLinkType?: 'point-to-point' | 'shared'
  virtualVlan?: number
  description?: string
  connectedLinkId?: string
  connectedDeviceId?: string
  connectedPortId?: string
  inboundAcl?: string
  outboundAcl?: string
  helperAddress?: string
  nameif?: string
  securityLevel?: number
}

export interface RouteEntry {
  network: string
  netmask: string
  nextHop: string
  interfaceName: string
  metric: number
  type: 'C' | 'S' | 'O' | 'R' | 'D' | 'B'
  area?: number
}

export interface ArpEntry {
  ipAddress: string
  macAddress: string
  interfaceName: string
  age: number
}

export interface Ipv6AddressConfig {
  address: string
  prefixLength: number
  source?: 'static' | 'eui-64' | 'slaac' | 'dhcpv6'
}

export interface Ipv6NeighborEntry {
  address: string
  macAddress: string
  interfaceName: string
  age: number
}

export interface Ipv6RouteEntry {
  network: string
  prefixLength: number
  nextHop: string
  interfaceName: string
  metric: number
  type: 'C' | 'S' | 'O'
}

export interface MacTableEntry {
  linkId?: string
  lastSeenTick?: number
  macAddress: string
  portId: string
  vlan: number
  age: number
}

export interface StpNeighborBpdu {
  portId: string
  linkId: string
  senderDeviceId: string
  rootBridgeId: string
  rootDeviceId: string
  rootPathCost: number
  bridgeId: string
  lastReceivedTick: number
}

export interface StpVlanRuntime {
  rootBridgeId: string
  rootDeviceId: string
  rootPathCost: number
  rootPortId?: string
  neighbors: StpNeighborBpdu[]
  lastSent: Record<string, { signature: string; tick: number }>
}

export interface StpRuntime {
  vlans: Record<string, StpVlanRuntime>
}

export type AclAction = 'permit' | 'deny'

export interface StandardAclRule {
  type: 'standard'
  action: AclAction
  sourceIp: string
  wildcard?: string
  remark?: string
}

export interface ExtendedAclRule {
  type: 'extended'
  action: AclAction
  protocol: 'ip' | 'tcp' | 'udp' | 'icmp' | 'gre'
  sourceIp: string
  sourceWildcard?: string
  destIp?: string
  destWildcard?: string
  destPort?: number | string
  remark?: string
}

export type AclRule = StandardAclRule | ExtendedAclRule

export interface AccessList {
  id: string
  number?: number
  type: 'standard' | 'extended'
  rules: AclRule[]
}

export interface DeviceConfig {
  ipRouting?: boolean
  ipv6Routing?: boolean
  accessLists?: AccessList[]
  stpPriorities?: Record<string,number>
  stpMode?: 'pvst' | 'rapid-pvst' | 'mst'
  mstName?: string
  mstRevision?: number
  mstInstances?: Array<{ instance: number; vlans: number[] }>
  mstPriorities?: Record<string,number>
  portfastDefault?: boolean
  hostname: string
  banner?: string
  dhcpEnabled?: boolean
  dhcpLease?: {
    serverId: string
    ipAddress: string
    acquiredAtMs?: number
    leaseDurationSeconds?: number
    state?: 'bound' | 'renewing' | 'rebinding'
    lastRequestAtMs?: number
  }
  dhcpBindings?: Array<{
    ipAddress: string
    clientDeviceId: string
    clientIdentifier: string
    hardwareAddress: string
    acquiredAtMs: number
    leaseDurationSeconds: number
    type: 'automatic' | 'manual'
  }>
  defaultGateway?: string
  ipv6DefaultGateway?: string
  dnsServer?: string
  dnsServiceEnabled?: boolean
  httpServiceEnabled?: boolean
  emailService?: EmailServiceConfig
  emailAccount?: EmailAccountConfig
  udpEchoServiceEnabled?: boolean
  udpEchoPorts?: number[]
  ntpMaster?: boolean
  ntpMasterStratum?: number
  ntpServer?: string
  ntpSynchronizedAtMs?: number
  ntpOffsetMs?: number
  ntpSynchronizedStratum?: number
  snmpCommunities?: string[]
  snmpSystemContact?: string
  snmpSystemLocation?: string
  tftpServiceEnabled?: boolean
  tftpFiles?: Array<{ name: string; contents: string }>
  tftpClientFiles?: Array<{ serverIp: string; name: string; contents: string; receivedAtMs: number }>
  htmlContent?: string
  vlans?: Array<{ id: number; name: string }>
  apMode?: 'autonomous' | 'lightweight'
  wlans?: WlanProfile[]
  iotKind?: IotThingKind
  iotState?: IotThingState
  iotServerAddress?: string
  iotServiceEnabled?: boolean
  iotCredentials?: { username: string; password: string }
  ripNetworks?: string[]
  ripVersion?: 1 | 2
  ripAutoSummary?: boolean
  ripPassiveDefault?: boolean
  ripPassiveInterfaces?: string[]
  ripActiveInterfaces?: string[]
  eigrpAs?: number
  eigrpRouterId?: string
  eigrpNetworks?: Array<{ network: string; wildcard: string }>
  eigrpAutoSummary?: boolean
  eigrpPassiveDefault?: boolean
  eigrpPassiveInterfaces?: string[]
  eigrpActiveInterfaces?: string[]
  bgpAs?: number
  bgpRouterId?: string
  bgpNeighbors?: Array<{ ip: string; remoteAs: number }>
  bgpNetworks?: Array<{ network: string; mask: string }>
  ospfNetworks?: Array<{ network: string; wildcard: string; area: number }>
  ospfProcessId?: number
  ospfRouterId?: string
  ospfPassiveDefault?: boolean
  ospfPassiveInterfaces?: string[]
  ospfActiveInterfaces?: string[]
  ipv6OspfProcessId?: number
  ipv6OspfRouterId?: string
  dhcpPools?: Array<{ name: string; network: string; mask: string; defaultRouter?: string; dnsServer?: string; tftpServer?: string; leaseDurationSeconds?: number; hostIp?: string; hostMask?: string; hardwareAddress?: string; clientIdentifier?: string }>
  dhcpv6Pools?: Array<{ name: string; prefix: string; prefixLength: number; startAddress?: string }>
  dhcpv6Bindings?: Array<{ address: string; clientDeviceId: string; clientMac: string; acquiredAtMs?: number }>
  dhcpv6Lease?: { serverId: string; address: string; prefixLength: number }
  telephony?: {
    sourceIp?: string
    port?: number
    maxEphones?: number
    maxDn?: number
    autoAssign?: { start: number; end: number }
    directoryNumbers: Array<{ id: number; number: string }>
    ephones: Array<{ id: number; macAddress?: string; buttons: Array<{ line: number; dn: number }> }>
  }
  excludedDhcpIps?: string[]
  linePasswords?: { console?: string; vty?: string }
  secretPassword?: string
  dhcpPool?: {
    network: string
    subnetMask: string
    startIp: string
    endIp: string
    gateway: string
    dns: string
    leaseDurationSeconds?: number
  }
  dnsRecords?: Array<{ domain: string; ip: string }>
  asaInspection?: {
    icmp: boolean
    http: boolean
    tcp: boolean
    dns: boolean
    udp?: boolean
    tftp?: boolean
  }
  asaNatRules?: Array<{
    id: string
    sourceInterface: string
    destInterface: string
    type: 'dynamic-pat' | 'static'
    sourceNet: string
  }>
}

export interface EmailMessage {
  id: string
  from: string
  to: string
  subject: string
  body: string
  sentAtTick: number
}

export interface EmailServiceUser {
  username: string
  password: string
  mailbox: EmailMessage[]
}

export interface EmailServiceConfig {
  domain: string
  smtpEnabled: boolean
  pop3Enabled: boolean
  users: EmailServiceUser[]
}

export interface EmailAccountConfig {
  displayName: string
  emailAddress: string
  incomingServer: string
  outgoingServer: string
  username: string
  password: string
  inbox: EmailMessage[]
  sent: EmailMessage[]
}

export interface WlanProfile {
  id: number
  name: string
  ssid: string
  enabled: boolean
  vlan: number
  security: 'none' | 'wep' | 'wpa2-psk'
  passphrase?: string
  wepKey?: string
}

export type CapwapMessageKind =
  | 'discovery-request'
  | 'discovery-response'
  | 'join-request'
  | 'join-response'
  | 'config-update-request'
  | 'config-update-response'
  | 'echo-request'
  | 'echo-response'
  | 'data'

export interface CapwapMessage {
  kind: CapwapMessageKind
  seq: number
  apDeviceId?: string
  apName?: string
  controllerDeviceId?: string
  controllerName?: string
  wlans?: WlanProfile[]
  configSeq?: number
  ackSeq?: number
}

export interface ApRuntime {
  mode: 'autonomous' | 'lightweight'
  state: 'idle' | 'discovery' | 'join' | 'run'
  selectedWlcId?: string
  wlcMac?: string
  wlcPortId?: string
  lastDiscoveryTick?: number
  lastJoinTick?: number
  lastEchoTick?: number
  lastEchoResponseTick?: number
  joinedAtTick?: number
  appliedConfigSeq?: number
  wlans?: WlanProfile[]
}

export interface WlcApEntry {
  apId: string
  apMac: string
  portId: string
  linkId: string
  state: 'run'
  joinedAtTick: number
  lastSeenTick: number
}

export interface WlcRuntime {
  aps: WlcApEntry[]
  clientTunnels: Array<{ macAddress: string; apId: string }>
  configSeq: number
  lastConfigFingerprint?: string
  pendingConfig: Array<{ apId: string; seq: number; sentAtTick: number }>
  seq: number
}

export type IotThingKind =
  | 'lamp'
  | 'fan'
  | 'door'
  | 'window'
  | 'blinds'
  | 'sprinkler'
  | 'siren'
  | 'thermostat'
  | 'smoke-detector'
  | 'water-detector'
  | 'light-sensor'
  | 'push-button'

export interface IotThingState {
  power?: boolean
  open?: boolean
  level?: number
  temperature?: number
  smoke?: boolean
  pressedAtTick?: number
}

export interface IotRuntime {
  state: 'searching' | 'registered'
  serverId?: string
  serverName?: string
  serverAddress?: string
  lastDiscoveryTick?: number
  lastReportTick?: number
  lastControlTick?: number
  stateVersion?: number
  reportsSent?: number
  controlsApplied?: number
}

export interface IotServerClient {
  deviceId: string
  address: string
  kind: IotThingKind
  registeredAtTick: number
  lastSeenTick: number
}

export interface IotServerRuntime {
  clients: IotServerClient[]
  lastControlTick?: number
}

export interface NetworkDevice {
  stpRuntime?: StpRuntime
  ospf?: OspfRuntime
  ospfv3?: Ospfv3Runtime
  rip?: RipRuntime
  eigrp?: EigrpRuntime
  bgp?: BgpRuntime
  apRuntime?: ApRuntime
  wlcRuntime?: WlcRuntime
  iotRuntime?: IotRuntime
  iotServerRuntime?: IotServerRuntime
  asaNatTranslations?: AsaNatTranslation[]
  ospfSequence?: number
  ipv6OspfSequence?: number
  id: string
  name: string
  type: DeviceType
  model: string
  macAddress?: string
  x: number
  y: number
  ports: NetworkPort[]
  config: DeviceConfig
  routingTable: RouteEntry[]
  arpTable: ArpEntry[]
  ipv6NeighborTable?: Ipv6NeighborEntry[]
  ipv6RoutingTable?: Ipv6RouteEntry[]
  macTable: MacTableEntry[]
  cliHistory: string[]
  currentCliMode: 'user' | 'priv' | 'config' | 'config-if' | 'config-subif' | 'config-vlan' | 'config-line' | 'config-router' | 'config-ipv6-router' | 'config-dhcp' | 'config-dhcpv6' | 'config-telephony' | 'config-ephone' | 'config-ephone-dn' | 'config-mst'
  activeVoiceId?: number
  activeDhcpPool?: string
  activeRoutingProtocol?: 'rip' | 'ospf' | 'eigrp' | 'bgp'
  activeInterface?: string
  activeSubInterface?: string
  activeRangePorts?: string[]
  activeVlan?: number
  power?: boolean
  modules?: string[]
  importedRunningConfig?: string[]
  importedStartupConfig?: string[]
  originalDeviceType?: string
}

interface AsaNatTranslationBase {
  id: string
  sourceInterface: string
  destInterface: string
  originalSourceIp: string
  translatedSourceIp: string
  remoteDestinationIp: string
  expiresAtMs: number
}

export type AsaNatTranslation = AsaNatTranslationBase & (
  | { protocol: 'ICMP'; originalIdentifier: number; translatedIdentifier: number }
  | { protocol: 'UDP'; originalSourcePort: number; translatedSourcePort: number; remoteDestinationPort: number }
  | { protocol: 'TCP'; originalSourcePort: number; translatedSourcePort: number; remoteDestinationPort: number }
)

export interface DeviceWindow {
  deviceId: string
  x: number
  y: number
  width: number
  height: number
  z: number
  minimized: boolean
}

export type CableType =
  | 'auto'
  | 'straight'
  | 'crossover'
  | 'fiber'
  | 'serial'
  | 'serial-dce'
  | 'console'
  | 'phone'
  | 'coaxial'
  | 'octal'
  | 'usb'
  | 'wireless'

export interface NetworkLink {
  id: string
  type: CableType
  fromDeviceId: string
  fromPortId: string
  toDeviceId: string
  toPortId: string
  status: LinkStatus
  isEtherChannel?: boolean
  channelLabel?: string
}

export interface NetworkAnnotation {
  id: string
  type: 'note' | 'rect' | 'line' | 'ellipse' | 'freeform'
  points?: Array<{ x: number; y: number }>
  x: number
  y: number
  width?: number
  height?: number
  title?: string
  text?: string
  color?: string
  borderColor?: string
}

export const PHYSICAL_CONTAINER_KINDS = ['city', 'building', 'closet', 'rack', 'table'] as const
export type PhysicalContainerKind = (typeof PHYSICAL_CONTAINER_KINDS)[number]
export interface PhysicalContainer {
  id: string
  kind: PhysicalContainerKind
  name: string
  parentId: string | null
}
export interface NetworkCluster {
  id: string
  name: string
  deviceIds: string[]
}
export interface PhysicalWorkspaceState {
  containers: PhysicalContainer[]
  assignment: Record<string, string>
  clusters: NetworkCluster[]
}

export const PACKET_PROTOCOLS = ['ARP', 'ICMP', 'ICMPv6', 'DHCP', 'DHCPv6', 'DNS', 'UDP', 'HTTP', 'TCP', 'OSPF', 'RIP', 'EIGRP', 'BGP', 'GRE', 'STP', 'CAPWAP'] as const
export type PacketProtocol = (typeof PACKET_PROTOCOLS)[number]

export interface RipEntry { network: string; netmask: string; metric: number }
export interface RipPacket { command: 'request' | 'response'; version: 1 | 2; entries: RipEntry[] }
export interface RipCandidate extends RipEntry { portId: string; nextHop: string; updatedAt: number; invalidAt?: number }
export interface RipRuntime {
  clock: number
  lastUpdate: number
  triggerAt?: number
  signature: string
  candidates: RipCandidate[]
  connected?: RipEntry[]
  neighbors: Array<{ address: string; portId: string; lastUpdate: number; version: 1 | 2 }>
  lastError?: string
}

export interface EigrpEntry { network: string; netmask: string; bandwidthKbps: number; delayMicroseconds: number; hopCount: number; metric: number }
export interface EigrpPacket {
  type: 'hello' | 'update'
  asNumber: number
  holdTimeSeconds: number
  entries?: EigrpEntry[]
  complete?: boolean
}
export interface EigrpNeighbor { address: string; portId: string; macAddress: string; lastHello: number; holdTimeMs: number; since: number }
export interface EigrpCandidate { network: string; netmask: string; portId: string; nextHop: string; bandwidthKbps: number; delayMicroseconds: number; hopCount: number; reportedMetric: number; metric: number; updatedAt: number }
export interface EigrpRuntime {
  clock: number
  neighbors: EigrpNeighbor[]
  candidates: EigrpCandidate[]
  lastHelloAt: Record<string, number>
  signature: string
  lastError?: string
}

export interface BgpEntry { network: string; netmask: string; nextHop: string; asPath: number[] }
export interface BgpPacket {
  type: 'open' | 'keepalive' | 'update' | 'notification'
  asNumber: number
  routerId?: string
  holdTimeSeconds?: number
  entries?: BgpEntry[]
  withdrawn?: Array<{ network: string; netmask: string }>
  complete?: boolean
  notification?: string
}
export type BgpPeerState = 'idle' | 'opensent' | 'openconfirm' | 'established'
export interface BgpPath extends BgpEntry { updatedAt: number }
export interface BgpPeer {
  address: string
  portId: string
  macAddress: string
  remoteAs: number
  state: BgpPeerState
  remoteRouterId?: string
  remoteHoldTimeSeconds?: number
  lastKeepalive: number
  since: number
  learned: BgpPath[]
  messagesSent: number
  messagesReceived: number
}
export interface BgpRuntime {
  clock: number
  routerId: string
  peers: BgpPeer[]
  lastOpenAt: Record<string, number>
  lastKeepaliveAt: Record<string, number>
  advertised: string[]
  localAdvertised: string[]
  signature: string
  lastError?: string
}

export type OspfNeighborState = 'Init' | '2-Way' | 'ExStart' | 'Exchange' | 'Loading' | 'Full'
export interface OspfLsa {
  routerId: string
  area: number
  sequence: number
  links: Array<{ routerId: string; cost: number }>
  networks: Array<{ network: string; netmask: string; cost: number }>
}
export interface OspfLsaHeader { routerId: string; area: number; sequence: number }
export interface OspfNeighbor {
  routerId: string
  portId: string
  address: string
  macAddress: string
  area: number
  state: OspfNeighborState
  lastHello: number
  priority: number
  designatedRouter: string
  backupRouter: string
  lastExchange: number
  requests: OspfLsaHeader[]
  retransmissions: Array<{ lsa: OspfLsa; sentAt: number }>
}
export interface OspfInterfaceState {
  lastError?: string
  portId: string
  area: number
  signature: string
  lastHello: number
  waitUntil: number
  designatedRouter: string
  backupRouter: string
}
export interface OspfRuntime {
  lastError?: string
  clock: number
  routerId: string
  neighbors: OspfNeighbor[]
  interfaces: OspfInterfaceState[]
  database: Array<{ lsa: OspfLsa; receivedAt: number }>
  lastOrigination: number
}
export interface OspfPacket {
  type: 'hello' | 'database-description' | 'link-state-request' | 'link-state-update' | 'link-state-ack'
  routerId: string
  area: number
  netmask: string
  helloInterval: number
  deadInterval: number
  networkType: 'broadcast' | 'point-to-point'
  neighbors?: string[]
  priority?: number
  designatedRouter?: string
  backupRouter?: string
  headers?: OspfLsaHeader[]
  lsas?: OspfLsa[]
}

export interface Ospfv3Lsa {
  routerId: string
  area: number
  sequence: number
  links: Array<{ routerId: string; cost: number }>
  networks: Array<{ prefix: string; prefixLength: number; cost: number }>
}
export interface Ospfv3LsaHeader { routerId: string; area: number; sequence: number }
export interface Ospfv3Neighbor {
  routerId: string
  portId: string
  address: string
  macAddress: string
  area: number
  state: OspfNeighborState
  lastHello: number
  priority: number
  designatedRouter: string
  backupRouter: string
  lastExchange: number
  requests: Ospfv3LsaHeader[]
  retransmissions: Array<{ lsa: Ospfv3Lsa; sentAt: number }>
}
export interface Ospfv3InterfaceState {
  lastError?: string
  portId: string
  area: number
  signature: string
  lastHello: number
  waitUntil: number
  designatedRouter: string
  backupRouter: string
}
export interface Ospfv3Runtime {
  lastError?: string
  clock: number
  routerId: string
  neighbors: Ospfv3Neighbor[]
  interfaces: Ospfv3InterfaceState[]
  database: Array<{ lsa: Ospfv3Lsa; receivedAt: number }>
  lastOrigination: number
}
export interface Ospfv3Packet {
  type: 'hello' | 'database-description' | 'link-state-request' | 'link-state-update' | 'link-state-ack'
  routerId: string
  area: number
  helloInterval: number
  deadInterval: number
  networkType: 'broadcast' | 'point-to-point'
  neighbors?: string[]
  priority?: number
  designatedRouter?: string
  backupRouter?: string
  headers?: Ospfv3LsaHeader[]
  lsas?: Ospfv3Lsa[]
}

export interface PacketPdu {
  id: string
  pingId?: string
  protocol: PacketProtocol
  summary: string
  sourceMac: string
  destMac: string
  etherType: string
  sourceIp: string
  destIp: string
  ttl: number
  generatorColor?: string
  pendingPacket?: PacketPdu
  payload: {
    ospf?: OspfPacket
    ospfv3?: Ospfv3Packet
    rip?: RipPacket
    eigrp?: EigrpPacket
    bgp?: BgpPacket
    stpVlan?: number
    stpRootBridgeId?: string
    stpRootDeviceId?: string
    stpRootPathCost?: number
    stpBridgeId?: string
    stpSenderDeviceId?: string
    stpLlcDsap?: string
    stpLlcSsap?: string
    stpLlcControl?: string
    greInnerPacket?: PacketPdu
    greTunnelInterface?: string
    capwap?: CapwapMessage
    capwapInnerPacket?: PacketPdu
    iotMessageType?: 'discovery' | 'discovery-reply' | 'register' | 'report' | 'control' | 'control-ack'
    iotClientDeviceId?: string
    iotServerDeviceId?: string
    iotCommandId?: string
    iotStateSummary?: string
    iotControlPatch?: IotThingState
    greKeepaliveType?: 'request' | 'reply'
    greKeepaliveTunnel?: string
    greKeepaliveSequence?: number
    dscp?: number
    type?: string
    icmpType?: 'echo-request' | 'echo-reply'
    icmpSeq?: number
    icmpIdentifier?: number
    icmpv6Type?: 'echo-request' | 'echo-reply' | 'neighbor-solicitation' | 'neighbor-advertisement' | 'router-solicitation' | 'router-advertisement'
    ndpTargetAddress?: string
    ndpPrefixes?: Array<{ prefix: string; prefixLength: number }>
    ndpManagedFlag?: boolean
    ndpOtherFlag?: boolean
    ndpRouterLifetime?: number
    dhcpv6Type?: 'solicit' | 'advertise' | 'request' | 'reply'
    dhcpv6TransactionId?: string
    dhcpv6ClientDeviceId?: string
    dhcpv6ClientPortId?: string
    dhcpv6ServerDeviceId?: string
    dhcpv6ServerPortId?: string
    dhcpv6OfferedAddress?: string
    dhcpv6AssignedAddress?: string
    dhcpv6PrefixLength?: number
    arpType?: 'request' | 'reply'
    pingTargetIp?: string
    targetIp?: string
    targetMac?: string
    dhcpType?: 'discover' | 'offer' | 'request' | 'ack' | 'nak'
    dhcpRequestId?: string
    dhcpClientDeviceId?: string
    dhcpClientPortId?: string
    dhcpClientIdentifier?: string
    dhcpServerDeviceId?: string
    dhcpRequestedIp?: string
    dhcpRelayAgentIp?: string
    dhcpRelayDeviceId?: string
    dhcpRelayPortId?: string
    assignedIp?: string
    dhcpSubnetMask?: string
    dhcpGateway?: string
    dhcpDnsServer?: string
  dhcpLeaseDurationSeconds?: number
  dhcpRenewalPhase?: 'renew' | 'rebind'
    dhcpProbeIp?: string
    dhcpErrorReason?: string
    dnsQuery?: string
    dnsResolvedIp?: string
    dnsMessageType?: 'query' | 'response'
    dnsRequestId?: string
    dnsSourceDeviceId?: string
    dnsStatus?: 'resolved' | 'not-found' | 'server-failure'
    udpMessageType?: 'request' | 'response'
    udpRequestId?: string
    udpSourceDeviceId?: string
    udpData?: string
    udpService?: 'echo' | 'ntp' | 'tftp' | 'snmp' | 'iot'
    udpSourcePort?: number
    udpDestinationPort?: number
    tftpMessageType?: 'rrq' | 'data' | 'ack'
    tftpFileName?: string
    tftpBlockNumber?: number
    tftpBlockCount?: number
    tftpBlockDataHex?: string
    ntpMessageType?: 'request' | 'response'
    ntpClientTransmitTimeMs?: number
    ntpServerReceiveTimeMs?: number
    ntpServerTransmitTimeMs?: number
    ntpStratum?: number
    snmpVersion?: '2c'
    snmpMessageType?: 'get' | 'get-next' | 'response'
    snmpCommunity?: string
    snmpOperation?: 'get' | 'get-next'
    snmpOid?: string
    snmpValue?: string
    tcpApplication?: 'HTTP' | 'SMTP' | 'POP3'
    tcpRequestId?: string
    tcpFlags?: 'SYN' | 'SYN-ACK' | 'ACK+PSH' | 'FIN-ACK' | 'RST-ACK' | 'ACK'
    tcpSequenceNumber?: number
    tcpAcknowledgmentNumber?: number
    tcpSourcePort?: number
    tcpDestinationPort?: number
    tcpSenderDeviceId?: string
    tcpDataLength?: number
    tcpSegmentIndex?: number
    tcpSegmentCount?: number
    tcpSegmentOffset?: number
    httpRequestChunk?: string
    tcpClientDeviceId?: string
    tcpServerDeviceId?: string
    tcpClientIp?: string
    tcpServerIp?: string
    tcpServerInitialSequence?: number
    tcpErrorReason?: string
    httpMethod?: string
    httpPath?: string
    httpResponse?: string
    httpRequestId?: string
    httpSourceDeviceId?: string
    httpStatus?: number
    tcpDataChunk?: string
    tcpDataKind?: 'request' | 'response'
    emailAction?: 'send' | 'retrieve' | 'delete'
    emailFrom?: string
    emailTo?: string
    emailSubject?: string
    emailBody?: string
    emailMessageId?: string
    emailUsername?: string
    emailPassword?: string
    emailPop3Phase?: 'list' | 'fetch' | 'delete-list' | 'delete-commit' | 'session'
    emailPop3MessageIds?: string[]
    emailPop3TurnIndex?: number
    emailPop3SessionState?:
      | { phase: 'authorization'; username?: string }
      | { phase: 'transaction'; username: string; deletedMessageIds: string[] }
      | { phase: 'closed' }
    emailPop3Messages?: EmailMessage[]
    emailPop3CommittedDeletedMessageIds?: string[]
  }
  explanation: {
    layer1: string
    layer2: string
    layer3: string
    layer4AndAbove: string
    deviceDecision: string
  }
}

export interface HttpTransactionResult {
  requestId: string
  sourceDeviceId: string
  status: 'successful' | 'failed'
  response?: string
  httpStatus?: number
  reason?: string
}

export type HttpTransaction = Omit<HttpTransactionResult, 'status'> & { status: 'pending' | 'successful' | 'failed' }

export interface EmailTransactionResult {
  requestId: string
  sourceDeviceId: string
  action: 'send' | 'retrieve' | 'delete'
  status: 'successful' | 'failed'
  message?: EmailMessage
  messages?: EmailMessage[]
  reason?: string
}

export type EmailTransaction = Omit<EmailTransactionResult, 'status'> & { status: 'pending' | 'successful' | 'failed' }

export interface DnsTransactionResult {
  requestId: string
  sourceDeviceId: string
  domain: string
  status: 'successful' | 'failed'
  resolvedIp?: string
  reason?: string
}

export type DnsTransaction = Omit<DnsTransactionResult, 'status'> & { status: 'pending' | 'successful' | 'failed' }

export interface UdpTransactionResult {
  requestId: string
  sourceDeviceId: string
  targetIp: string
  port: number
  service?: 'echo' | 'ntp' | 'tftp' | 'snmp' | 'iot'
  status: 'successful' | 'failed'
  response?: string
  fileName?: string
  oid?: string
  value?: string
  operation?: 'get' | 'get-next'
  stratum?: number
  offsetMs?: number
  reason?: string
}

export type UdpTransaction = Omit<UdpTransactionResult, 'status'> & { status: 'pending' | 'successful' | 'failed' }

export interface DhcpTransactionResult {
  requestId: string
  sourceDeviceId: string
  clientPortId?: string
  phase: 'discover' | 'offer' | 'request' | 'probe' | 'ack' | 'failed'
  status: 'pending' | 'successful' | 'failed'
  serverDeviceId?: string
  assignedIp?: string
  subnetMask?: string
  gateway?: string
  dnsServer?: string
  leaseDurationSeconds?: number
  renewalPhase?: 'renew' | 'rebind'
  attemptCount?: number
  autoRetryOf?: string
  reason?: string
}

export interface TcpReassemblyBuffer {
  requestId: string
  kind: 'http-request' | 'http-response' | 'application-request' | 'application-response'
  expectedSegments: number
  sequenceStart: number
  segments: Record<number, string>
  segmentLengths: Record<number, number>
  httpStatus?: number
  ageTicks: number
}

export interface TcpOutstandingSegment {
  key: string
  requestId: string
  ownerDeviceId: string
  pdu: PacketPdu
  ageTicks: number
  retries: number
  failApplicationOnTimeout: boolean
  lastError?: string
}

export interface InFlightPacket {
  id: string
  linkId: string
  fromDeviceId: string
  toDeviceId: string
  progress: number
  pdu: PacketPdu
  direction: 'forward' | 'reverse'
  vlanId?: number
  hops?: number
}

export interface SimulationEvent {
  id: string
  timestamp: number
  sourceDeviceId: string
  destDeviceId: string
  protocol: PacketProtocol
  summary: string
  pdu: PacketPdu
  status: 'pending' | 'in-flight' | 'received' | 'dropped'
}
