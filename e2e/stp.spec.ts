import { test, expect } from '@playwright/test'

interface BrowserStpVlan { rootDeviceId: string; neighbors: Array<{ senderDeviceId: string }> }
interface BrowserHsrpGroup { group:number; virtualIp?:string; priority?:number; preempt?:boolean }
interface BrowserHsrpRuntime { state:string; activeDeviceName?:string }
interface BrowserStpDevice {
  id: string
  name?: string
  type?: string
  config?: { ipRouting?: boolean; defaultGateway?: string; dnsServer?: string; dhcpLease?: { serverId: string }; dhcpPools?: Array<{ name: string }>; vlans?: Array<{ id: number }>; stpPriorities?: Record<string, number> }
  ports?: Array<{ id: string; vlan?: number; virtualVlan?: number; ipAddress?: string; subnetMask?: string; helperAddress?: string; portMode?: string; allowedVlans?: number[]; hsrpGroups?:BrowserHsrpGroup[]; hsrpRuntime?:Record<string,BrowserHsrpRuntime> }>
  stpRuntime?: { vlans: Record<string, BrowserStpVlan> }
}
interface BrowserCampusLink { id: string; fromDeviceId: string; fromPortId: string; toDeviceId: string; toPortId: string; isEtherChannel?: boolean }
interface BrowserNetworkState {
  devices: BrowserStpDevice[]
  links: BrowserCampusLink[]
  pingResults: Array<{ id: string; status: string }>
  dhcpTransactions: Array<{ requestId: string; sourceDeviceId: string; clientPortId?: string; status: string; assignedIp?: string; subnetMask?: string; gateway?: string; dnsServer?: string; serverDeviceId?: string }>
  simulationMode?: 'realtime'|'simulation'
  simulationPlaying?: boolean
  sendPing: (sourceDeviceId: string, targetIp: string) => string | null
  requestDhcp: (deviceId: string) => string
  toggleDevicePower: (deviceId:string)=>void
  stepSimulation: () => void
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState; setState: (state: Partial<BrowserNetworkState>) => void }

test('idle production canvas learns its spanning-tree root from switch BPDUs', async ({ page, baseURL }) => {
  const switchDevice = (id: string, name: string, mac: string, priority: number, x: number) => ({
    id, name, type: 'switch', model: '2960-24TT', x, y: 280, power: true, modules: [], macAddress: mac,
    ports: [{
      id: `${id}-gi0/1`, name: 'GigabitEthernet0/1', shortName: 'Gi0/1', type: 'gigabitethernet', status: 'up', adminStatus: 'up',
      macAddress: id === 'sw-a' ? '02:00:00:00:00:11' : '02:00:00:00:00:22', portMode: 'trunk', allowedVlans: [1], nativeVlan: 1,
      connectedLinkId: 'switch-link', connectedDeviceId: id === 'sw-a' ? 'sw-b' : 'sw-a',
      connectedPortId: id === 'sw-a' ? 'sw-b-gi0/1' : 'sw-a-gi0/1',
    }],
    config: { hostname: name, stpPriorities: { '1': priority }, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const lab = Buffer.from(JSON.stringify({
    version: 1,
    fileName: 'STP BPDU browser acceptance',
    devices: [
      switchDevice('sw-a', 'Switch-A', '0000.0000.0011', 40960, 280),
      switchDevice('sw-b', 'Switch-B', '0000.0000.0022', 24576, 650),
    ],
    links: [{ id: 'switch-link', type: 'straight', status: 'up', fromDeviceId: 'sw-a', fromPortId: 'sw-a-gi0/1', toDeviceId: 'sw-b', toPortId: 'sw-b-gi0/1' }],
    annotations: [],
  }), 'utf8').toString('base64')

  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('heading', { name: /Devices 2/i })).toBeVisible()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const switchA = store?.getState().devices.find(device => device.id === 'sw-a')
    const vlan = switchA?.stpRuntime?.vlans['1']
    return vlan?.rootDeviceId === 'sw-b' && vlan.neighbors.some(neighbor => neighbor.senderDeviceId === 'sw-b')
  }, undefined, { timeout: 8_000 })
  const switchButton=page.getByRole('button', { name: 'Open Switch-A' })
  await expect(switchButton).toBeVisible()
  await switchButton.dblclick()
  const deviceWindow=page.locator('.pt-device-window[aria-label="Switch-A window"]')
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.locator('button', { hasText: /^CLI$/i }).click()
  const cliInput=deviceWindow.locator('input[type="text"]').last()
  for(const command of ['enable','show spanning-tree vlan 1']){
    await cliInput.fill(command)
    await cliInput.press('Enter')
  }
  await expect(deviceWindow).toContainText(/Root ID Priority 24577/)
})

test('production enterprise lab tags both campus VLANs and carries real packets',async({page,baseURL})=>{
  await page.goto(baseURL!)
  await expect(page.getByRole('heading',{name:/Devices 14/i})).toBeVisible()
  await page.waitForFunction(()=>{
    const store=(window as unknown as {__wireforgeNetworkStore?:BrowserNetworkStore}).__wireforgeNetworkStore
    return store?.getState().devices.some(device=>device.name==='Switch1')
  })
  const configuration=await page.evaluate(()=>{
    const state=(window as unknown as {__wireforgeNetworkStore:BrowserNetworkStore}).__wireforgeNetworkStore.getState()
    const byName=(name:string)=>state.devices.find(device=>device.name===name)!
    const portTo=(deviceName:string,peerName:string)=>{
      const device=byName(deviceName),peer=byName(peerName)
      const link=state.links.find(candidate=>candidate.fromDeviceId===device.id&&candidate.toDeviceId===peer.id||candidate.toDeviceId===device.id&&candidate.fromDeviceId===peer.id)!
      const portId=link.fromDeviceId===device.id?link.fromPortId:link.toPortId
      return device.ports!.find(port=>port.id===portId)!
    }
    const invalidTrunkMembers=state.links.filter(link=>link.isEtherChannel).flatMap(link=>[[link.fromDeviceId,link.fromPortId],[link.toDeviceId,link.toPortId]]).filter(([deviceId,portId])=>{
      const device=state.devices.find(candidate=>candidate.id===deviceId)!
      const port=device.ports!.find(candidate=>candidate.id===portId)!
      return device.type==='switch'&&(port.portMode!=='trunk'||![1,10,20].every(vlan=>port.allowedVlans?.includes(vlan)))
    })
    return {
      pc1:[portTo('Switch3','PC1').portMode,portTo('Switch3','PC1').vlan],
      workServer:[portTo('Switch3','Work Office Server').portMode,portTo('Switch3','Work Office Server').vlan],
      pc2:[portTo('Switch4','PC2').portMode,portTo('Switch4','PC2').vlan],
      syslog:[portTo('Switch4','SysLog Server').portMode,portTo('Switch4','SysLog Server').vlan],
      channelMemberCount:state.links.filter(link=>link.isEtherChannel).length,
      invalidTrunkMembers,
      switch1Priority:byName('Switch1').config?.stpPriorities?.['10'],
      switch2Priority:byName('Switch2').config?.stpPriorities?.['20'],
      switch1Routing:byName('Switch1').config?.ipRouting,
      switch2Routing:byName('Switch2').config?.ipRouting,
      switch1Svis:byName('Switch1').ports?.filter(port=>port.virtualVlan!==undefined).map(port=>[port.virtualVlan,port.ipAddress]).sort(),
      switch2Svis:byName('Switch2').ports?.filter(port=>port.virtualVlan!==undefined).map(port=>[port.virtualVlan,port.ipAddress]).sort(),
      switch1Hsrp:byName('Switch1').ports?.filter(port=>port.virtualVlan!==undefined).map(port=>[port.virtualVlan,port.hsrpGroups?.map(group=>({group:group.group,virtualIp:group.virtualIp,priority:group.priority,preempt:Boolean(group.preempt)}))]),
      switch2Hsrp:byName('Switch2').ports?.filter(port=>port.virtualVlan!==undefined).map(port=>[port.virtualVlan,port.hsrpGroups?.map(group=>({group:group.group,virtualIp:group.virtualIp,priority:group.priority,preempt:Boolean(group.preempt)}))]),
    }
  })
  expect(configuration).toEqual({
    pc1:['access',10],workServer:['access',10],pc2:['access',20],syslog:['access',20],
    channelMemberCount:10,invalidTrunkMembers:[],switch1Priority:24576,switch2Priority:24576,
    switch1Routing:true,switch2Routing:true,
    switch1Svis:[[10,'192.168.10.2'],[20,'192.168.20.3']],
    switch2Svis:[[10,'192.168.10.3'],[20,'192.168.20.2']],
    switch1Hsrp:[[10,[{group:10,virtualIp:'192.168.10.1',priority:110,preempt:true}]],[20,[{group:20,virtualIp:'192.168.20.1',priority:100,preempt:false}]]],
    switch2Hsrp:[[10,[{group:10,virtualIp:'192.168.10.1',priority:100,preempt:false}]],[20,[{group:20,virtualIp:'192.168.20.1',priority:110,preempt:true}]]],
  })
  const traffic=await page.evaluate(()=>{
    const store=(window as unknown as {__wireforgeNetworkStore:BrowserNetworkStore}).__wireforgeNetworkStore
    for(let tick=0;tick<510;tick++)store.getState().stepSimulation()
    const state=store.getState(),byName=(name:string)=>state.devices.find(device=>device.name===name)!
    const switches=state.devices.filter(device=>device.type==='switch')
    const vlan10Root=byName('Switch1').id,vlan20Root=byName('Switch2').id
    const ping=(sourceName:string,targetIp:string)=>{
      const requestId=store.getState().sendPing(byName(sourceName).id,targetIp)
      if(!requestId)return 'not-sent'
      for(let tick=0;tick<500&&store.getState().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)store.getState().stepSimulation()
      return store.getState().pingResults.find(result=>result.id===requestId)?.status??'missing-result'
    }
    return {
      vlan10Roots: switches.map(device=>device.stpRuntime?.vlans['10']?.rootDeviceId),
      vlan20Roots: switches.map(device=>device.stpRuntime?.vlans['20']?.rootDeviceId),
      vlan10Root:vlan10Root,
      vlan20Root:vlan20Root,
      vlan10Ping:ping('PC1','192.168.10.11'),
      vlan20Ping:ping('PC2','192.168.20.25'),
      interVlan10to20:ping('PC1','192.168.20.50'),
      interVlan20to10:ping('PC2','192.168.10.50'),
      hsrp10:byName('Switch1').ports?.find(port=>port.virtualVlan===10)?.hsrpRuntime?.['10'],
      hsrp20:byName('Switch2').ports?.find(port=>port.virtualVlan===20)?.hsrpRuntime?.['20'],
    }
  })
  expect(traffic.vlan10Roots).toEqual(Array(4).fill(traffic.vlan10Root))
  expect(traffic.vlan20Roots).toEqual(Array(4).fill(traffic.vlan20Root))
  expect(traffic.vlan10Ping).toBe('successful')
  expect(traffic.vlan20Ping).toBe('successful')
  expect(traffic.interVlan10to20).toBe('successful')
  expect(traffic.interVlan20to10).toBe('successful')
  expect(traffic.hsrp10).toMatchObject({state:'active',activeDeviceName:'Switch1'})
  expect(traffic.hsrp20).toMatchObject({state:'active',activeDeviceName:'Switch2'})

  const failover=await page.evaluate(()=>{
    const store=(window as unknown as {__wireforgeNetworkStore:BrowserNetworkStore}).__wireforgeNetworkStore
    store.setState({simulationMode:'simulation',simulationPlaying:false})
    const byName=(name:string)=>store.getState().devices.find(device=>device.name===name)!
    const primary=byName('Switch1'),backup=byName('Switch2')
    store.getState().toggleDevicePower(primary.id)
    for(let tick=0;tick<520;tick++)store.getState().stepSimulation()
    const active=store.getState().devices.find(device=>device.id===backup.id)!.ports?.find(port=>port.virtualVlan===10)?.hsrpRuntime?.['10']
    const source=byName('PC1'),requestId=store.getState().sendPing(source.id,'192.168.20.50')
    if(!requestId)throw new Error('PC1 could not send a packet through the failed-over gateway')
    for(let tick=0;tick<1000&&store.getState().pingResults.find(result=>result.id===requestId)?.status==='pending';tick++)store.getState().stepSimulation()
    const ping=store.getState().pingResults.find(result=>result.id===requestId)?.status
    store.getState().toggleDevicePower(primary.id)
    for(let tick=0;tick<520;tick++)store.getState().stepSimulation()
    const restored=store.getState().devices.find(device=>device.id===primary.id)!.ports?.find(port=>port.virtualVlan===10)?.hsrpRuntime?.['10']
    return {failover:active,ping,restored}
  })
  expect(failover.failover).toMatchObject({state:'active',activeDeviceName:'Switch2'})
  expect(failover.ping).toBe('successful')
  expect(failover.restored).toMatchObject({state:'active',activeDeviceName:'Switch1'})

  await page.getByRole('button',{name:'Open Switch1'}).dblclick()
  const coreWindow=page.locator('.pt-device-window[aria-label="Switch1 window"]')
  await expect(coreWindow).toBeVisible()
  await coreWindow.locator('button',{hasText:/^CLI$/i}).click()
  const cli=coreWindow.locator('input[type="text"]').last()
  for(const command of ['enable','show standby 10']){await cli.fill(command);await cli.press('Enter')}
  await expect(coreWindow).toContainText(/State is active/)
  await expect(coreWindow).toContainText(/Virtual IP address is 192\.168\.10\.1/)
})

test('production enterprise VLAN 20 client receives a relayed DHCP lease',async({page,baseURL})=>{
  await page.goto(baseURL!)
  await expect(page.getByRole('heading',{name:/Devices 14/i})).toBeVisible()
  await page.waitForFunction(()=>Boolean((window as unknown as {__wireforgeNetworkStore?:BrowserNetworkStore}).__wireforgeNetworkStore))
  const lease=await page.evaluate(()=>{
    const store=(window as unknown as {__wireforgeNetworkStore:BrowserNetworkStore}).__wireforgeNetworkStore
    store.setState({simulationMode:'simulation',simulationPlaying:false})
    for(let tick=0;tick<510;tick++)store.getState().stepSimulation()
    const byName=(name:string)=>store.getState().devices.find(device=>device.name===name)!
    const client=byName('PC2'),core=byName('Switch2'),server=byName('Work Office Server')
    const requestResult=store.getState().requestDhcp(client.id)
    const requestId=store.getState().dhcpTransactions.at(-1)?.requestId
    for(let tick=0;requestId&&tick<1000&&store.getState().dhcpTransactions.find(transaction=>transaction.requestId===requestId)?.status==='pending';tick++)store.getState().stepSimulation()
    const transaction=store.getState().dhcpTransactions.find(item=>item.requestId===requestId)
    const boundClient=store.getState().devices.find(device=>device.id===client.id)!
    return {
      requestResult,
      helper:core.ports?.find(port=>port.virtualVlan===20)?.helperAddress,
      pools:server.config?.dhcpPools?.map(pool=>pool.name),
      transaction,
      clientIp:boundClient.ports?.find(port=>port.id===transaction?.clientPortId)?.ipAddress,
      clientMask:boundClient.ports?.find(port=>port.id===transaction?.clientPortId)?.subnetMask,
      clientGateway:boundClient.config?.defaultGateway,
      clientDns:boundClient.config?.dnsServer,
    }
  })
  expect(lease.helper).toBe('192.168.10.11')
  expect(lease.pools).toEqual(['VLAN10','VLAN20'])
  expect(lease.requestResult).toContain('DHCP Discover sent')
  expect(lease.transaction?.status).toBe('successful')
  expect(lease.transaction?.assignedIp).toBe('192.168.20.4')
  expect(lease.clientIp).toBe('192.168.20.4')
  expect(lease.clientMask).toBe('255.255.255.0')
  expect(lease.clientGateway).toBe('192.168.20.1')
  expect(lease.clientDns).toBe('192.168.10.11')
})
