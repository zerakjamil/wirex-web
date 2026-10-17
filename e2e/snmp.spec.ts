import { test, expect } from '@playwright/test'

function createSnmpAcceptanceLab() {
  const pcPort = {
    id: 'pc-eth0', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet',
    ipAddress: '192.0.2.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:10',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'router', connectedPortId: 'router-eth0', connectedLinkId: 'pc-router',
  }
  const routerPort = {
    id: 'router-eth0', name: 'GigabitEthernet0/0', shortName: 'Gi0/0', type: 'gigabitethernet',
    ipAddress: '192.0.2.20', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:20',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'client', connectedPortId: 'pc-eth0', connectedLinkId: 'pc-router',
  }
  const client = {
    id: 'client', name: 'SNMP Manager PC', type: 'pc', model: 'PC-PT', x: 160, y: 160, power: true, modules: [],
    ports: [pcPort], config: { hostname: 'ManagerPC', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const router = {
    id: 'router', name: 'SNMP Agent Router', type: 'router', model: '2911', x: 480, y: 160, power: true, modules: [],
    ports: [routerPort], config: { hostname: 'AgentRouter', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  return {
    version: 1,
    fileName: 'SNMP browser acceptance',
    devices: [client, router],
    links: [{ id: 'pc-router', type: 'straight', status: 'up', fromDeviceId: 'client', fromPortId: 'pc-eth0', toDeviceId: 'router', toPortId: 'router-eth0' }],
    annotations: [],
  }
}

test('SNMP manager reads IOS system objects and reports a rejected community in its device window', async ({ page, baseURL }) => {
  const browserErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('response', response => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })
  page.on('pageerror', error => browserErrors.push(error.message))
  const lab = Buffer.from(JSON.stringify(createSnmpAcceptanceLab()), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('button', { name: /SNMP Agent Router 2911/i })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: /SNMP Agent Router 2911/i }).click()
  let deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'SNMP Agent Router' })
  await deviceWindow.getByRole('button', { name: 'CLI', exact: true }).click()
  const cliInput = deviceWindow.locator('input[type="text"]').last()
  for (const command of ['enable', 'configure terminal', 'snmp-server community classroom ro']) {
    await cliInput.fill(command)
    await cliInput.press('Enter')
  }
  await expect(deviceWindow).toContainText('SNMP community classroom configured as read-only')
  await deviceWindow.getByRole('button', { name: 'Close SNMP Agent Router' }).click()

  await page.getByRole('button', { name: /SNMP Manager PC PC-PT/i }).click()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'SNMP Manager PC' })
  await deviceWindow.getByRole('button', { name: 'Desktop', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'SNMP Manager', exact: true }).click()
  await deviceWindow.getByLabel('SNMP Agent IPv4').fill('192.0.2.20')
  await deviceWindow.getByLabel('Numeric OID').fill('1.3.6.1.2.1.1.5.0')
  await deviceWindow.getByRole('button', { name: 'Query SNMP', exact: true }).click()
  await expect(deviceWindow.getByRole('status')).toContainText('SNMP response received', { timeout: 15000 })
  await expect(deviceWindow.getByRole('status')).toContainText('AgentRouter')

  await deviceWindow.getByLabel('Community').fill('wrong')
  await deviceWindow.getByRole('button', { name: 'Query SNMP', exact: true }).click()
  await expect(deviceWindow.getByRole('alert')).toContainText('community is invalid', { timeout: 15000 })
  await expect(deviceWindow.getByText(/SNMPv2c GET and GETNEXT are modeled/)).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('Server-PT SNMP service exposes its read-only community and system location to the manager', async ({ page, baseURL }) => {
  const pcPort = { id: 'pc-eth0', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', ipAddress: '198.51.100.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:01:10', status: 'up', adminStatus: 'up', connectedDeviceId: 'server', connectedPortId: 'server-eth0', connectedLinkId: 'pc-server' }
  const serverPort = { id: 'server-eth0', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', ipAddress: '198.51.100.20', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:01:20', status: 'up', adminStatus: 'up', connectedDeviceId: 'client', connectedPortId: 'pc-eth0', connectedLinkId: 'pc-server' }
  const lab = Buffer.from(JSON.stringify({
    version: 1, fileName: 'Server SNMP acceptance',
    devices: [
      { id: 'client', name: 'SNMP Manager PC', type: 'pc', model: 'PC-PT', x: 160, y: 160, power: true, modules: [], ports: [pcPort], config: { hostname: 'ManagerPC', vlans: [{ id: 1, name: 'default' }] }, routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv' },
      { id: 'server', name: 'SNMP Agent Server', type: 'server', model: 'Server-PT', x: 480, y: 160, power: true, modules: [], ports: [serverPort], config: { hostname: 'MibServer', vlans: [{ id: 1, name: 'default' }] }, routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv' },
    ],
    links: [{ id: 'pc-server', type: 'straight', status: 'up', fromDeviceId: 'client', fromPortId: 'pc-eth0', toDeviceId: 'server', toPortId: 'server-eth0' }],
    annotations: [],
  }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.getByRole('button', { name: /SNMP Agent Server Server-PT/i }).click()
  let deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'SNMP Agent Server' })
  await deviceWindow.getByRole('button', { name: 'Services', exact: true }).click()
  await deviceWindow.getByLabel('Enable SNMP Service').check()
  await deviceWindow.getByLabel('Read-only community').fill('campus')
  await deviceWindow.getByRole('button', { name: 'Add community', exact: true }).click()
  await deviceWindow.getByLabel('System location').fill('Campus West')
  await deviceWindow.getByRole('button', { name: 'Close SNMP Agent Server' }).click()

  await page.getByRole('button', { name: /SNMP Manager PC PC-PT/i }).click()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'SNMP Manager PC' })
  await deviceWindow.getByRole('button', { name: 'Desktop', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'SNMP Manager', exact: true }).click()
  await deviceWindow.getByLabel('SNMP Agent IPv4').fill('198.51.100.20')
  await deviceWindow.getByLabel('Community').fill('campus')
  await deviceWindow.getByLabel('Numeric OID').fill('1.3.6.1.2.1.1.6.0')
  await deviceWindow.getByRole('button', { name: 'Query SNMP', exact: true }).click()
  await expect(deviceWindow.getByRole('status')).toContainText('SNMP response received', { timeout: 15000 })
  await expect(deviceWindow.getByRole('status')).toContainText('Campus West')
})
