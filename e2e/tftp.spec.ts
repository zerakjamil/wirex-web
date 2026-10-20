import { test, expect } from '@playwright/test'

function createTftpAcceptanceLab() {
  const clientPort = {
    id: 'client-eth0', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet',
    ipAddress: '192.0.2.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:10',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'server', connectedPortId: 'server-eth0', connectedLinkId: 'client-server',
  }
  const serverPort = {
    id: 'server-eth0', name: 'GigabitEthernet0', shortName: 'Gi0', type: 'gigabitethernet',
    ipAddress: '192.0.2.20', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:00:20',
    status: 'up', adminStatus: 'up', connectedDeviceId: 'client', connectedPortId: 'client-eth0', connectedLinkId: 'client-server',
  }
  const client = {
    id: 'client', name: 'TFTP Client PC', type: 'pc', model: 'PC-PT', x: 160, y: 160, power: true, modules: [],
    ports: [clientPort], config: { hostname: 'TFTPClient', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const server = {
    id: 'server', name: 'TFTP Server', type: 'server', model: 'Server-PT', x: 480, y: 160, power: true, modules: [],
    ports: [serverPort], config: { hostname: 'TFTPServer', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  return {
    version: 1,
    fileName: 'TFTP browser acceptance',
    devices: [client, server],
    links: [{ id: 'client-server', type: 'straight', status: 'up', fromDeviceId: 'client', fromPortId: 'client-eth0', toDeviceId: 'server', toPortId: 'server-eth0' }],
    annotations: [],
  }
}

test('TFTP server setup and PC download work through device windows and survive reload', async ({ page, baseURL }) => {
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`)
  })
  page.on('pageerror', error => browserErrors.push(error.message))
  const lab = Buffer.from(JSON.stringify(createTftpAcceptanceLab()), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('button', { name: /TFTP Server Server-PT/i })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /TFTP Client PC PC-PT/i })).toBeVisible()

  await page.getByRole('button', { name: /TFTP Server Server-PT/i }).click()
  let deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'TFTP Server' })
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.getByRole('tab', { name: 'Services', exact: true }).click()
  await deviceWindow.locator('[data-service="tftp"]').click()
  await deviceWindow.getByLabel('Enable TFTP Service').check()
  await deviceWindow.getByLabel('Filename').fill('startup.cfg')
  await deviceWindow.getByLabel('File contents').fill('hostname ClassroomSwitch\ninterface vlan 10\n ip address 192.0.2.30 255.255.255.0\n')
  await deviceWindow.getByRole('button', { name: 'Add file', exact: true }).click()
  await expect(deviceWindow.getByText('startup.cfg', { exact: true })).toBeVisible()
  await deviceWindow.getByRole('button', { name: 'Close TFTP Server' }).click()

  await page.getByRole('button', { name: /TFTP Client PC PC-PT/i }).click()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'TFTP Client PC' })
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'TFTP Client', exact: true }).click()
  await deviceWindow.getByLabel('TFTP Server IPv4').fill('192.0.2.20')
  await deviceWindow.getByLabel('Filename').fill('startup.cfg')
  await deviceWindow.getByRole('button', { name: 'Read File', exact: true }).click()
  await expect(deviceWindow.getByRole('status')).toContainText('TFTP file received', { timeout: 15000 })
  await expect(deviceWindow.getByRole('status')).toContainText('hostname ClassroomSwitch')

  await page.waitForTimeout(600)
  await page.goto('/')
  await page.getByRole('button', { name: /TFTP Client PC PC-PT/i }).click()
  deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'TFTP Client PC' })
  await deviceWindow.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'TFTP Client', exact: true }).click()
  await expect(deviceWindow.getByText('startup.cfg', { exact: true })).toBeVisible()
  await deviceWindow.locator('details').filter({ hasText: 'startup.cfg' }).locator('summary').click()
  await expect(deviceWindow.getByText(/hostname ClassroomSwitch/)).toBeVisible()
  expect(browserErrors).toEqual([])
})
