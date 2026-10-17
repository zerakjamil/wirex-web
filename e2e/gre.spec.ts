import { test, expect } from '@playwright/test'

test('router GUI keeps the GRE static route configured but inactive while its underlay is down', async ({ page, baseURL }) => {
  const router = {
    id: 'router-a', name: 'Router-A', type: 'router', model: '2811', x: 240, y: 180, power: true, modules: [],
    ports: [
      { id: 'wan', name: 'FastEthernet0/0', shortName: 'Fa0/0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: '198.51.100.1', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:01' },
      { id: 'lan', name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: '10.0.1.1', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:02' },
    ],
    config: { hostname: 'Router-A', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [
      { network: '198.51.100.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/0', metric: 0, type: 'C' },
      { network: '10.0.1.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/1', metric: 0, type: 'C' },
    ],
    arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  }
  const lab = Buffer.from(JSON.stringify({ version: 1, fileName: 'GRE GUI acceptance', devices: [router], links: [], annotations: [] }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.getByRole('button', { name: /Router-A/i }).first().click()

  const window = page.locator('.pt-device-window').first()
  await expect(window).toBeVisible()
  await window.locator('button', { hasText: /^CLI$/i }).click()
  const input = window.locator('input[type="text"]').last()
  for (const command of [
    'enable', 'configure terminal', 'interface Tunnel0', 'ip address 172.16.0.1 255.255.255.252',
    'tunnel source FastEthernet0/0', 'tunnel destination 203.0.113.2', 'tunnel mode gre ip', 'no shutdown',
    'exit', 'ip route 10.0.2.0 255.255.255.0 Tunnel0', 'do show running-config', 'do show ip route', 'do show ip interface brief',
  ]) {
    await input.fill(command)
    await input.press('Enter')
  }
  await expect(window).toContainText(/ip route 10\.0\.2\.0 255\.255\.255\.0 Tunnel0/)
  await expect(window).not.toContainText(/S\s+10\.0\.2\.0\/255\.255\.255\.0 \[1\/0\] via Tunnel0/)
  await expect(window).toContainText(/Tu0\s+172\.16\.0\.1.*down\s+down/)
  await expect(window).toContainText(/Interface Tunnel0, changed state to down/)
  await expect(window).not.toContainText(/Interface Tunnel0, changed state to up/)
})

test('GRE keepalives detect a remote tunnel failure and recover in realtime', async ({ page, baseURL }) => {
  const router = (id: string, name: string, wanIp: string, lanIp: string) => ({
    id, name, type: 'router', model: '2811', x: id === 'router-a' ? 300 : 700, y: 300, power: true, modules: [],
    ports: [{
      id: `${id}-wan`, name: 'FastEthernet0/0', shortName: 'Fa0/0', type: 'fastethernet', status: 'up', adminStatus: 'up',
      ipAddress: wanIp, subnetMask: '255.255.255.0', macAddress: id === 'router-a' ? '02:00:00:00:00:01' : '02:00:00:00:00:02',
      connectedLinkId: 'wan-link', connectedDeviceId: id === 'router-a' ? 'router-b' : 'router-a',
      connectedPortId: id === 'router-a' ? 'router-b-wan' : 'router-a-wan',
    }, {
      id: `${id}-lan`, name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', status: 'up', adminStatus: 'up',
      ipAddress: lanIp, subnetMask: '255.255.255.0', macAddress: id === 'router-a' ? '02:00:00:00:00:03' : '02:00:00:00:00:04',
    }],
    config: { hostname: name, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [
      { network: '198.51.100.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/0', metric: 0, type: 'C' },
      { network: lanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/1', metric: 0, type: 'C' },
    ],
    arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const lab = Buffer.from(JSON.stringify({
    version: 1,
    fileName: 'GRE Keepalive acceptance',
    devices: [router('router-a', 'Router-A', '198.51.100.1', '10.0.1.1'), router('router-b', 'Router-B', '198.51.100.2', '10.0.2.1')],
    links: [{ id: 'wan-link', type: 'straight', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-wan', toDeviceId: 'router-b', toPortId: 'router-b-wan' }],
    annotations: [],
  }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('heading', { name: /Devices 2/i })).toBeVisible()

  const openRouter = async (name: string) => {
    await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click()
    const window = page.locator(`.pt-device-window[aria-label="${name} window"]`)
    await expect(window).toBeVisible()
    await window.locator('button', { hasText: /^CLI$/i }).click()
    return window
  }
  const runCommands = async (window: ReturnType<typeof page.locator>, commands: string[]) => {
    const input = window.locator('input[type="text"]').last()
    for (const command of commands) {
      await input.fill(command)
      await input.press('Enter')
    }
  }
  const closeRouter = async (name: string) => page.getByRole('button', { name: `Close ${name}` }).click()

  let peer = await openRouter('Router-B')
  await runCommands(peer, [
    'enable', 'configure terminal', 'interface Tunnel0', 'ip address 172.16.0.2 255.255.255.252',
    'tunnel source FastEthernet0/0', 'tunnel destination 198.51.100.1', 'tunnel mode gre ip', 'no shutdown',
  ])
  await closeRouter('Router-B')

  const local = await openRouter('Router-A')
  await runCommands(local, [
    'enable', 'configure terminal', 'interface Tunnel0', 'ip address 172.16.0.1 255.255.255.252',
    'tunnel source FastEthernet0/0', 'tunnel destination 198.51.100.2', 'tunnel mode gre ip', 'no shutdown',
    'keepalive 1 2', 'exit', 'ip route 10.0.2.0 255.255.255.0 Tunnel0', 'do show ip interface brief',
  ])
  await expect(local).toContainText(/Tu0\s+172\.16\.0\.1.*up\s+up/)

  peer = await openRouter('Router-B')
  await runCommands(peer, ['tunnel destination 198.51.100.99'])
  await closeRouter('Router-B')
  await page.waitForTimeout(2700)
  await runCommands(local, ['do show ip interface brief', 'do show ip route'])
  await expect(local).toContainText(/Tu0\s+172\.16\.0\.1.*down\s+down/)
  await expect(local).not.toContainText(/S\s+10\.0\.2\.0\/255\.255\.255\.0 \[1\/0\] via Tunnel0/)

  peer = await openRouter('Router-B')
  await runCommands(peer, ['tunnel destination 198.51.100.1'])
  await closeRouter('Router-B')
  await page.waitForTimeout(2200)
  await runCommands(local, ['do show ip interface brief', 'do show ip route'])
  await expect(local).toContainText(/Tu0\s+172\.16\.0\.1.*up\s+up/)
  await expect(local).toContainText(/S\s+10\.0\.2\.0\/255\.255\.255\.0 \[1\/0\] via Tunnel0/)
})

test('OSPF carries Simple PDU traffic across GRE and survives primary underlay failure', async ({ page, baseURL }) => {
  test.setTimeout(60_000)
  const router = (id: string, name: string, wanIp: string, backupIp: string, lanIp: string, wanMac: string, backupMac: string, lanMac: string) => ({
    id, name, type: 'router', model: '2811', x: id === 'router-a' ? 300 : 700, y: 300, power: true, modules: [],
    ports: [{
      id: `${id}-wan`, name: 'FastEthernet0/0', shortName: 'Fa0/0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: wanIp,
      subnetMask: '255.255.255.252', macAddress: wanMac, connectedLinkId: 'wan-link', connectedDeviceId: id === 'router-a' ? 'router-b' : 'router-a', connectedPortId: id === 'router-a' ? 'router-b-wan' : 'router-a-wan',
    }, {
      id: `${id}-lan`, name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: lanIp,
      subnetMask: '255.255.255.0', macAddress: lanMac, connectedLinkId: id === 'router-a' ? 'lan-a' : 'lan-b', connectedDeviceId: id === 'router-a' ? 'pc-a' : 'pc-b', connectedPortId: id === 'router-a' ? 'pc-a-eth' : 'pc-b-eth',
    }, {
      id: `${id}-backup`, name: 'FastEthernet0/2', shortName: 'Fa0/2', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: backupIp,
      subnetMask: '255.255.255.252', macAddress: backupMac, connectedLinkId: 'backup-link', connectedDeviceId: id === 'router-a' ? 'router-b' : 'router-a', connectedPortId: id === 'router-a' ? 'router-b-backup' : 'router-a-backup',
    }],
    config: { hostname: name, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [
      { network: wanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.252', nextHop: 'connected', interfaceName: 'FastEthernet0/0', metric: 0, type: 'C' },
      { network: backupIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.252', nextHop: 'connected', interfaceName: 'FastEthernet0/2', metric: 0, type: 'C' },
      { network: lanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/1', metric: 0, type: 'C' },
    ], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const pc = (id: string, name: string, ipAddress: string, gateway: string, x: number) => ({
    id, name, type: 'pc', model: 'PC-PT', x, y: 500, power: true, modules: [],
    ports: [{ id: `${id}-eth`, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress, subnetMask: '255.255.255.0', macAddress: id === 'pc-a' ? '02:00:00:00:10:01' : '02:00:00:00:20:01', connectedLinkId: id === 'pc-a' ? 'lan-a' : 'lan-b', connectedDeviceId: id === 'pc-a' ? 'router-a' : 'router-b', connectedPortId: id === 'pc-a' ? 'router-a-lan' : 'router-b-lan' }],
    config: { hostname: name, defaultGateway: gateway }, routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const devices = [
    router('router-a', 'Router-A', '198.51.100.1', '203.0.113.1', '10.1.0.1', '02:00:00:00:00:01', '02:00:00:00:01:01', '02:00:00:00:10:ff'),
    router('router-b', 'Router-B', '198.51.100.2', '203.0.113.2', '10.2.0.1', '02:00:00:00:00:02', '02:00:00:00:02:02', '02:00:00:00:20:ff'),
    pc('pc-a', 'PC-A', '10.1.0.10', '10.1.0.1', 300), pc('pc-b', 'PC-B', '10.2.0.10', '10.2.0.1', 700),
  ]
  const links = [
    { id: 'wan-link', type: 'crossover', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-wan', toDeviceId: 'router-b', toPortId: 'router-b-wan' },
    { id: 'backup-link', type: 'crossover', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-backup', toDeviceId: 'router-b', toPortId: 'router-b-backup' },
    { id: 'lan-a', type: 'straight', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-lan', toDeviceId: 'pc-a', toPortId: 'pc-a-eth' },
    { id: 'lan-b', type: 'straight', status: 'up', fromDeviceId: 'router-b', fromPortId: 'router-b-lan', toDeviceId: 'pc-b', toPortId: 'pc-b-eth' },
  ]
  const lab = Buffer.from(JSON.stringify({ version: 1, fileName: 'OSPF over GRE acceptance', devices, links, annotations: [] }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)

  const openRouter = async (name: string) => {
    await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click()
    const window = page.locator(`.pt-device-window[aria-label="${name} window"]`)
    await expect(window).toBeVisible()
    await window.locator('button', { hasText: /^CLI$/i }).click()
    return window
  }
  const runCommands = async (window: ReturnType<typeof page.locator>, commands: string[]) => {
    const input = window.locator('input[type="text"]').last()
    for (const command of commands) { await input.fill(command); await input.press('Enter') }
  }
  const configure = async (name: string, routerId: string, wanIp: string, backupIp: string, tunnelIp: string, lanNetwork: string, peerLanIp: string, peerWanIp: string, peerBackupIp: string) => {
    const window = await openRouter(name)
    await runCommands(window, [
      'enable', 'configure terminal', 'interface FastEthernet0/0', `ip address ${wanIp} 255.255.255.252`, 'no shutdown', 'exit',
      'interface FastEthernet0/2', `ip address ${backupIp} 255.255.255.252`, 'no shutdown', 'exit',
      'interface Tunnel0', `ip address ${tunnelIp} 255.255.255.252`, 'tunnel source FastEthernet0/1', `tunnel destination ${peerLanIp}`,
      'tunnel mode gre ip', 'no shutdown', 'exit', `router ospf ${routerId === '1.1.1.1' ? '1' : '2'}`, `router-id ${routerId}`,
      'network 172.16.0.0 0.0.0.3 area 0', `network ${lanNetwork} 0.0.0.255 area 0`, 'passive-interface FastEthernet0/1', 'end',
      'configure terminal', 'interface Tunnel0', 'ip ospf cost 1', 'end',
      'configure terminal', `ip route ${peerLanIp} 255.255.255.255 ${peerWanIp}`, `ip route ${peerLanIp} 255.255.255.255 ${peerBackupIp} 200`, 'end',
    ])
    await page.getByRole('button', { name: `Close ${name}` }).click()
  }

  await configure('Router-B', '2.2.2.2', '198.51.100.2', '203.0.113.2', '172.16.0.2', '10.2.0.0', '10.1.0.1', '198.51.100.1', '203.0.113.1')
  await configure('Router-A', '1.1.1.1', '198.51.100.1', '203.0.113.1', '172.16.0.1', '10.1.0.0', '10.2.0.1', '198.51.100.2', '203.0.113.2')
  const local = await openRouter('Router-A')
  let neighborUp = false
  const deadline = Date.now() + 30_000
  while (!neighborUp && Date.now() < deadline) {
    await runCommands(local, ['show ip ospf neighbor'])
    neighborUp = /2\.2\.2\.2.*FULL/.test(await local.innerText())
    if (!neighborUp) await page.waitForTimeout(500)
  }
  await expect(local).toContainText(/2\.2\.2\.2.*FULL/)
  let routeLearned = false
  const routeDeadline = Date.now() + 15_000
  while (!routeLearned && Date.now() < routeDeadline) {
    await runCommands(local, ['show ip route'])
    routeLearned = /O\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/.test(await local.innerText())
    if (!routeLearned) await page.waitForTimeout(500)
  }
  await expect(local).toContainText(/O\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/)
  await page.getByRole('button', { name: 'Close Router-A' }).click()
  await page.getByRole('button', { name: 'Add Simple PDU' }).click()
  await page.getByRole('button', { name: 'Open PC-A' }).click()
  await expect(page.getByText(/PDU Source: PC-A/)).toBeVisible()
  await page.getByRole('button', { name: 'Open PC-B' }).click()
  await expect(page.locator('.pt-pdu-table')).toContainText('Successful', { timeout: 30_000 })

  for (const name of ['Router-A', 'Router-B']) {
    const deviceWindow = await openRouter(name)
    await runCommands(deviceWindow, ['enable', 'configure terminal', 'interface FastEthernet0/0', 'shutdown', 'end'])
    await page.getByRole('button', { name: `Close ${name}` }).click()
  }
  const failedOver = await openRouter('Router-A')
  let backupNeighborUp = false
  const backupDeadline = Date.now() + 20_000
  while (!backupNeighborUp && Date.now() < backupDeadline) {
    await runCommands(failedOver, ['show ip ospf neighbor'])
    backupNeighborUp = /2\.2\.2\.2.*FULL.*Tunnel0/.test(await failedOver.innerText())
    if (!backupNeighborUp) await page.waitForTimeout(500)
  }
  await expect(failedOver).toContainText(/2\.2\.2\.2.*FULL.*Tunnel0/)
  await runCommands(failedOver, ['show ip route'])
  await expect(failedOver).toContainText(/S\s+10\.2\.0\.1\/255\.255\.255\.255.*203\.0\.113\.2/)
  await page.getByRole('button', { name: 'Close Router-A' }).click()

  await page.getByRole('button', { name: 'Add Simple PDU' }).click()
  await page.getByRole('button', { name: 'Open PC-A' }).click()
  await expect(page.getByText(/PDU Source: PC-A/)).toBeVisible()
  await page.getByRole('button', { name: 'Open PC-B' }).click()
  await expect(page.locator('.pt-pdu-table tr').last()).toContainText('Successful', { timeout: 30_000 })
})

test('OSPF dynamically reroutes GRE traffic over backup and restores the primary underlay', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const router = (id: string, name: string, wanIp: string, backupIp: string, lanIp: string, wanMac: string, backupMac: string, lanMac: string) => ({
    id, name, type: 'router', model: '2811', x: id === 'router-a' ? 300 : 700, y: 300, power: true, modules: [],
    ports: [{
      id: `${id}-wan`, name: 'FastEthernet0/0', shortName: 'Fa0/0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: wanIp,
      subnetMask: '255.255.255.252', macAddress: wanMac, connectedLinkId: 'wan-link', connectedDeviceId: id === 'router-a' ? 'router-b' : 'router-a', connectedPortId: id === 'router-a' ? 'router-b-wan' : 'router-a-wan',
    }, {
      id: `${id}-lan`, name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: lanIp,
      subnetMask: '255.255.255.0', macAddress: lanMac, connectedLinkId: id === 'router-a' ? 'lan-a' : 'lan-b', connectedDeviceId: id === 'router-a' ? 'pc-a' : 'pc-b', connectedPortId: id === 'router-a' ? 'pc-a-eth' : 'pc-b-eth',
    }, {
      id: `${id}-backup`, name: 'FastEthernet0/2', shortName: 'Fa0/2', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: backupIp,
      subnetMask: '255.255.255.252', macAddress: backupMac, connectedLinkId: 'backup-link', connectedDeviceId: id === 'router-a' ? 'router-b' : 'router-a', connectedPortId: id === 'router-a' ? 'router-b-backup' : 'router-a-backup',
    }],
    config: { hostname: name, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [
      { network: wanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.252', nextHop: 'connected', interfaceName: 'FastEthernet0/0', metric: 0, type: 'C' },
      { network: backupIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.252', nextHop: 'connected', interfaceName: 'FastEthernet0/2', metric: 0, type: 'C' },
      { network: lanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/1', metric: 0, type: 'C' },
    ], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const pc = (id: string, name: string, ipAddress: string, gateway: string, macAddress: string, x: number) => ({
    id, name, type: 'pc', model: 'PC-PT', x, y: 500, power: true, modules: [],
    ports: [{
      id: `${id}-eth`, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress,
      subnetMask: '255.255.255.0', macAddress, connectedLinkId: id === 'pc-a' ? 'lan-a' : 'lan-b', connectedDeviceId: id === 'pc-a' ? 'router-a' : 'router-b', connectedPortId: id === 'pc-a' ? 'router-a-lan' : 'router-b-lan',
    }],
    config: { hostname: name, defaultGateway: gateway }, routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const devices = [
    router('router-a', 'Router-A', '198.51.100.1', '203.0.113.1', '10.1.0.1', '02:00:00:00:00:01', '02:00:00:00:01:01', '02:00:00:00:10:ff'),
    router('router-b', 'Router-B', '198.51.100.2', '203.0.113.2', '10.2.0.1', '02:00:00:00:00:02', '02:00:00:00:02:02', '02:00:00:00:20:ff'),
    pc('pc-a', 'PC-A', '10.1.0.10', '10.1.0.1', '02:00:00:00:10:01', 300),
    pc('pc-b', 'PC-B', '10.2.0.10', '10.2.0.1', '02:00:00:00:20:01', 700),
  ]
  const links = [
    { id: 'wan-link', type: 'crossover', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-wan', toDeviceId: 'router-b', toPortId: 'router-b-wan' },
    { id: 'backup-link', type: 'crossover', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-backup', toDeviceId: 'router-b', toPortId: 'router-b-backup' },
    { id: 'lan-a', type: 'straight', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-lan', toDeviceId: 'pc-a', toPortId: 'pc-a-eth' },
    { id: 'lan-b', type: 'straight', status: 'up', fromDeviceId: 'router-b', fromPortId: 'router-b-lan', toDeviceId: 'pc-b', toPortId: 'pc-b-eth' },
  ]
  const lab = Buffer.from(JSON.stringify({ version: 1, fileName: 'Dynamic OSPF GRE underlay', devices, links, annotations: [] }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)

  const openRouter = async (name: string) => {
    await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click()
    const window = page.locator(`.pt-device-window[aria-label="${name} window"]`)
    await expect(window).toBeVisible()
    await window.locator('button', { hasText: /^CLI$/i }).click()
    return window
  }
  const runCommands = async (window: ReturnType<typeof page.locator>, commands: string[]) => {
    const input = window.locator('input[type="text"]').last()
    for (const command of commands) { await input.fill(command); await input.press('Enter') }
  }
  const closeRouter = (name: string) => page.getByRole('button', { name: `Close ${name}` }).click()
  const configure = async (name: string, routerId: string, tunnelIp: string, peerLanIp: string, remoteLan: string, localLan: string) => {
    const window = await openRouter(name)
    await runCommands(window, [
      'enable', 'configure terminal', 'interface FastEthernet0/0', 'ip ospf network point-to-point', 'ip ospf cost 1', 'exit',
      'interface FastEthernet0/2', 'ip ospf network point-to-point', 'ip ospf cost 20', 'exit',
      'interface Tunnel0', `ip address ${tunnelIp} 255.255.255.252`, 'tunnel source FastEthernet0/1', `tunnel destination ${peerLanIp}`,
      'tunnel mode gre ip', 'no shutdown', 'ip ospf cost 100', 'exit', `ip route ${remoteLan} 255.255.255.0 Tunnel0`,
      'router ospf 1', `router-id ${routerId}`, 'network 172.16.0.0 0.0.0.3 area 0', `network ${localLan} 0.0.0.255 area 0`,
      'network 198.51.100.0 0.0.0.3 area 0', 'network 203.0.113.0 0.0.0.3 area 0',
      'passive-interface FastEthernet0/1', 'end',
    ])
    await closeRouter(name)
  }
  await configure('Router-B', '2.2.2.2', '172.16.0.2', '10.1.0.1', '10.1.0.0', '10.2.0.0')
  await configure('Router-A', '1.1.1.1', '172.16.0.1', '10.2.0.1', '10.2.0.0', '10.1.0.0')

  const local = await openRouter('Router-A')
  const input = local.locator('input[type="text"]').last()
  const waitFor = async (command: string, expression: RegExp, timeoutMs = 25_000) => {
    const deadline = Date.now() + timeoutMs
    let output = ''
    while (Date.now() < deadline) {
      await local.getByRole('button', { name: 'Clear Screen' }).click()
      await input.fill(command)
      await input.press('Enter')
      output = await local.innerText()
      if (expression.test(output)) return output
      await page.waitForTimeout(500)
    }
    throw new Error(`Timed out waiting for ${expression}; last CLI output:\n${output}`)
  }
  const primaryRoute = /O\s+10\.2\.0\.0\/255\.255\.255\.0 \[110\/\d+\] via 198\.51\.100\.2, FastEthernet0\/0/
  const backupRoute = /O\s+10\.2\.0\.0\/255\.255\.255\.0 \[110\/\d+\] via 203\.0\.113\.2, FastEthernet0\/2/
  await waitFor('show ip ospf neighbor', /2\.2\.2\.2\s+\d+\s+FULL\/-.*Tunnel0/)
  await waitFor('show ip route', primaryRoute)
  await expect(local).toContainText(primaryRoute)
  await closeRouter('Router-A')

  const sendPdu = async () => {
    await page.getByRole('button', { name: 'Add Simple PDU' }).click()
    await page.getByRole('button', { name: 'Open PC-A' }).click()
    await expect(page.getByText(/PDU Source: PC-A/)).toBeVisible()
    await page.getByRole('button', { name: 'Open PC-B' }).click()
    await expect(page.locator('.pt-pdu-table tr').last()).toContainText('Successful', { timeout: 30_000 })
  }
  await sendPdu()

  for (const name of ['Router-A', 'Router-B']) {
    const window = await openRouter(name)
    await runCommands(window, ['enable', 'configure terminal', 'interface FastEthernet0/0', 'shutdown', 'end'])
    await closeRouter(name)
  }
  const failedOver = await openRouter('Router-A')
  await waitFor('show ip route', backupRoute)
  await failedOver.getByRole('button', { name: 'Clear Screen' }).click()
  await runCommands(failedOver, ['show ip ospf neighbor'])
  await expect(failedOver).toContainText(/2\.2\.2\.2\s+\d+\s+FULL\/-.*FastEthernet0\/2/)
  await expect(failedOver).toContainText(/2\.2\.2\.2\s+\d+\s+FULL\/-.*Tunnel0/)
  await closeRouter('Router-A')
  await sendPdu()

  for (const name of ['Router-A', 'Router-B']) {
    const window = await openRouter(name)
    await runCommands(window, ['enable', 'configure terminal', 'interface FastEthernet0/0', 'no shutdown', 'end'])
    await closeRouter(name)
  }
  const restored = await openRouter('Router-A')
  await waitFor('show ip route', primaryRoute)
  await restored.getByRole('button', { name: 'Clear Screen' }).click()
  await runCommands(restored, ['show ip ospf neighbor'])
  await expect(restored).toContainText(/2\.2\.2\.2\s+\d+\s+FULL\/-.*Tunnel0/)
  await closeRouter('Router-A')
  await sendPdu()
})

test('RIPv2 over GRE withdraws and relearns the remote LAN after a keepalive failure', async ({ page, baseURL }) => {
  test.setTimeout(90_000)
  const router = (id: string, name: string, wanIp: string, lanIp: string, wanMac: string, lanMac: string) => ({
    id, name, type: 'router', model: '2811', x: id === 'router-a' ? 300 : 700, y: 300, power: true, modules: [],
    ports: [{
      id: `${id}-wan`, name: 'FastEthernet0/0', shortName: 'Fa0/0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: wanIp,
      subnetMask: '255.255.255.0', macAddress: wanMac, connectedLinkId: 'wan-link', connectedDeviceId: id === 'router-a' ? 'router-b' : 'router-a', connectedPortId: id === 'router-a' ? 'router-b-wan' : 'router-a-wan',
    }, {
      id: `${id}-lan`, name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: lanIp,
      subnetMask: '255.255.255.0', macAddress: lanMac, connectedLinkId: id === 'router-a' ? 'lan-a' : 'lan-b', connectedDeviceId: id === 'router-a' ? 'pc-a' : 'pc-b', connectedPortId: id === 'router-a' ? 'pc-a-eth' : 'pc-b-eth',
    }],
    config: { hostname: name, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [
      { network: wanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/0', metric: 0, type: 'C' },
      { network: lanIp.replace(/\.\d+$/, '.0'), netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0/1', metric: 0, type: 'C' },
    ], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  })
  const devices = [
    router('router-a', 'Router-A', '198.51.100.1', '10.1.0.1', '02:00:00:00:00:01', '02:00:00:00:10:ff'),
    router('router-b', 'Router-B', '198.51.100.2', '10.2.0.1', '02:00:00:00:00:02', '02:00:00:00:20:ff'),
    { id: 'pc-a', name: 'PC-A', type: 'pc', model: 'PC-PT', x: 300, y: 500, power: true, modules: [], ports: [{ id: 'pc-a-eth', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: '10.1.0.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:10:01', connectedLinkId: 'lan-a', connectedDeviceId: 'router-a', connectedPortId: 'router-a-lan' }], config: { hostname: 'PC-A', defaultGateway: '10.1.0.1' }, routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user' },
    { id: 'pc-b', name: 'PC-B', type: 'pc', model: 'PC-PT', x: 700, y: 500, power: true, modules: [], ports: [{ id: 'pc-b-eth', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up', ipAddress: '10.2.0.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:20:01', connectedLinkId: 'lan-b', connectedDeviceId: 'router-b', connectedPortId: 'router-b-lan' }], config: { hostname: 'PC-B', defaultGateway: '10.2.0.1' }, routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user' },
  ]
  const link = { id: 'wan-link', type: 'crossover', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-wan', toDeviceId: 'router-b', toPortId: 'router-b-wan' }
  const lanLinks = [
    { id: 'lan-a', type: 'straight', status: 'up', fromDeviceId: 'router-a', fromPortId: 'router-a-lan', toDeviceId: 'pc-a', toPortId: 'pc-a-eth' },
    { id: 'lan-b', type: 'straight', status: 'up', fromDeviceId: 'router-b', fromPortId: 'router-b-lan', toDeviceId: 'pc-b', toPortId: 'pc-b-eth' },
  ]
  const lab = Buffer.from(JSON.stringify({ version: 1, fileName: 'RIP over GRE acceptance', devices, links: [link, ...lanLinks], annotations: [] }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  const openRouter = async (name: string) => {
    await page.getByRole('button', { name: new RegExp(name, 'i') }).first().click()
    const window = page.locator(`.pt-device-window[aria-label="${name} window"]`)
    await expect(window).toBeVisible()
    await window.locator('button', { hasText: /^CLI$/i }).click()
    return window
  }
  const runCommands = async (window: ReturnType<typeof page.locator>, commands: string[]) => {
    const commandInput = window.locator('input[type="text"]').last()
    for (const command of commands) { await commandInput.fill(command); await commandInput.press('Enter') }
  }
  const configure = async (name: string, wanIp: string, tunnelIp: string, lanIp: string, peerWanIp: string) => {
    const window = await openRouter(name)
    const input = window.locator('input[type="text"]').last()
    const commands = [
      'enable', 'configure terminal', 'interface FastEthernet0/0', `ip address ${wanIp} 255.255.255.0`, 'no shutdown', 'exit',
      'interface FastEthernet0/1', `ip address ${lanIp} 255.255.255.0`, 'no shutdown', 'exit',
      'interface Tunnel0', `ip address ${tunnelIp} 255.255.255.252`, 'tunnel source FastEthernet0/0', `tunnel destination ${peerWanIp}`,
      'tunnel mode gre ip', 'no shutdown', 'exit', 'router rip', 'version 2', 'no auto-summary', 'network 172.16.0.0', 'network 10.0.0.0', 'end',
    ]
    for (const command of commands) { await input.fill(command); await input.press('Enter') }
    await page.getByRole('button', { name: `Close ${name}` }).click()
  }
  await configure('Router-B', '198.51.100.2', '172.16.0.2', '10.2.0.1', '198.51.100.1')
  await configure('Router-A', '198.51.100.1', '172.16.0.1', '10.1.0.1', '198.51.100.2')
  const local = await openRouter('Router-A')
  const input = local.locator('input[type="text"]').last()
  let routeLearned = false
  const deadline = Date.now() + 20_000
  while (!routeLearned && Date.now() < deadline) {
    await input.fill('show ip route'); await input.press('Enter')
    routeLearned = /R\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/.test(await local.innerText())
    if (!routeLearned) await page.waitForTimeout(500)
  }
  await expect(local).toContainText(/R\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/)

  await page.getByRole('button', { name: 'Close Router-A' }).click()
  await openRouter('Router-A')
  await runCommands(local, ['enable', 'configure terminal', 'interface Tunnel0', 'keepalive 1 2', 'end'])
  await page.getByRole('button', { name: 'Close Router-A' }).click()

  let peer = await openRouter('Router-B')
  await runCommands(peer, ['enable', 'configure terminal', 'interface Tunnel0', 'tunnel destination 198.51.100.99', 'end'])
  await page.getByRole('button', { name: 'Close Router-B' }).click()
  await page.waitForTimeout(2700)

  await openRouter('Router-A')
  await runCommands(local, ['show ip route'])
  await expect(local).not.toContainText(/R\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/)
  await page.getByRole('button', { name: 'Close Router-A' }).click()

  peer = await openRouter('Router-B')
  await runCommands(peer, ['enable', 'configure terminal', 'interface Tunnel0', 'tunnel destination 198.51.100.1', 'end'])
  await page.getByRole('button', { name: 'Close Router-B' }).click()
  await openRouter('Router-A')

  let routeRecovered = false
  const recoveryDeadline = Date.now() + 55_000
  while (!routeRecovered && Date.now() < recoveryDeadline) {
    await input.fill('show ip route'); await input.press('Enter')
    routeRecovered = /R\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/.test(await local.innerText())
    if (!routeRecovered) await page.waitForTimeout(750)
  }
  await expect(local).toContainText(/R\s+10\.2\.0\.0\/255\.255\.255\.0.*Tunnel0/)
})
