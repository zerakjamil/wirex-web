import { test, expect, type Locator } from '@playwright/test'

function createSyslogLab() {
  const routerG0 = {
    id: 'router-g0', name: 'GigabitEthernet0/0', shortName: 'Gi0/0', type: 'gigabitethernet',
    ipAddress: '192.0.2.1', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:01',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'server', connectedPortId: 'server-g0', connectedLinkId: 'router-server',
  }
  const routerG1 = {
    id: 'router-g1', name: 'GigabitEthernet0/1', shortName: 'Gi0/1', type: 'gigabitethernet',
    ipAddress: '198.51.100.1', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:02',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'pc', connectedPortId: 'pc-eth0', connectedLinkId: 'router-pc',
  }
  const serverPort = {
    id: 'server-g0', name: 'GigabitEthernet0', shortName: 'Gi0', type: 'gigabitethernet',
    ipAddress: '192.0.2.20', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:20',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'router', connectedPortId: 'router-g0', connectedLinkId: 'router-server',
  }
  const pcPort = {
    id: 'pc-eth0', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet',
    ipAddress: '198.51.100.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:10',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'router', connectedPortId: 'router-g1', connectedLinkId: 'router-pc',
  }
  const router = {
    id: 'router', name: 'R1', type: 'router', model: '2911', x: 160, y: 160, power: true, modules: [],
    ports: [routerG0, routerG1], config: { hostname: 'R1', ipRouting: true, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [
      { network: '192.0.2.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'GigabitEthernet0/0', metric: 0, type: 'C' },
      { network: '198.51.100.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'GigabitEthernet0/1', metric: 0, type: 'C' },
    ],
    arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const server = {
    id: 'server', name: 'Syslog Server', type: 'server', model: 'Server-PT', x: 480, y: 160, power: true, modules: [],
    ports: [serverPort], config: { hostname: 'SYSLOG', defaultGateway: '192.0.2.1', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const pc = {
    id: 'pc', name: 'Trigger PC', type: 'pc', model: 'PC-PT', x: 480, y: 360, power: true, modules: [],
    ports: [pcPort], config: { hostname: 'PC1', defaultGateway: '198.51.100.1', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  return {
    version: 1,
    fileName: 'Syslog acceptance',
    devices: [router, server, pc],
    links: [
      { id: 'router-server', type: 'straight', status: 'up', fromDeviceId: 'router', fromPortId: 'router-g0', toDeviceId: 'server', toPortId: 'server-g0' },
      { id: 'router-pc', type: 'straight', status: 'up', fromDeviceId: 'router', fromPortId: 'router-g1', toDeviceId: 'pc', toPortId: 'pc-eth0' },
    ],
    annotations: [],
  }
}

async function runCli(deviceWindow: Locator, commands: string[]) {
  await deviceWindow.getByRole('tab', { name: 'CLI', exact: true }).click()
  const input = deviceWindow.getByLabel('Cisco Terminal Command Input')
  await expect(input).toBeVisible()
  for (const command of commands) {
    await input.fill(command)
    await input.press('Enter')
  }
}

test('IOS logging sends a link-state syslog message to the server and survives reload', async ({ page, baseURL }) => {
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`)
  })
  page.on('pageerror', error => browserErrors.push(error.message))

  const lab = Buffer.from(JSON.stringify(createSyslogLab()), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('button', { name: /Open Syslog Server/i })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Open R1/i })).toBeVisible()

  await page.getByRole('button', { name: /Open Syslog Server/i }).dblclick()
  let deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'Syslog Server' })
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.getByRole('tab', { name: 'Services', exact: true }).click()
  await deviceWindow.locator('[data-service="syslog"]').click()
  await deviceWindow.getByLabel('Enable Syslog Service').check()
  await expect(deviceWindow.locator('[data-syslog-service]')).toContainText('No syslog messages received.')
  await deviceWindow.getByRole('button', { name: 'Close Syslog Server' }).click()

  await page.getByRole('button', { name: /Open R1/i }).dblclick()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'R1' })
  await expect(deviceWindow).toBeVisible()
  await runCli(deviceWindow, [
    'configure terminal',
    'logging 192.0.2.20',
    'logging trap 6',
    'end',
    'configure terminal',
    'interface GigabitEthernet0/1',
    'shutdown',
    'end',
  ])
  await deviceWindow.getByRole('button', { name: 'Close R1' }).click()

  await page.getByRole('button', { name: /Open Syslog Server/i }).dblclick()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'Syslog Server' })
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.getByRole('tab', { name: 'Services', exact: true }).click()
  await deviceWindow.locator('[data-service="syslog"]').click()
  await expect(deviceWindow.locator('[data-syslog-service]')).toContainText('%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down', { timeout: 15000 })
  await expect(deviceWindow.locator('[data-syslog-service]')).toContainText('192.0.2.1')
  await expect(deviceWindow.locator('[data-syslog-service]')).toContainText('sev 3')

  await page.waitForTimeout(1200)
  await page.goto('/')
  await page.getByRole('button', { name: /Open Syslog Server/i }).dblclick()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'Syslog Server' })
  await deviceWindow.getByRole('tab', { name: 'Services', exact: true }).click()
  await deviceWindow.locator('[data-service="syslog"]').click()
  await expect(deviceWindow.locator('[data-syslog-service]')).toContainText('%LINK-3-UPDOWN: Interface GigabitEthernet0/1, changed state to down')

  expect(browserErrors).toEqual([])
})
