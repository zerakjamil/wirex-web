import { test, expect } from '@playwright/test'

test('ASA manager shows configured PAT support and live translation state without invented counts', async ({ page, baseURL }) => {
  const browserErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })
  const asa = {
    id: 'asa', name: 'ASA0', type: 'security', model: 'ASA 5505', x: 400, y: 240, power: true, modules: [],
    ports: [
      { id: 'outside', name: 'Ethernet0/0', shortName: 'Eth0/0', type: 'fastethernet', status: 'up', adminStatus: 'up', nameif: 'outside', securityLevel: 0, vlan: 2, ipAddress: '203.0.113.1', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:10:01' },
      { id: 'inside', name: 'Ethernet0/1', shortName: 'Eth0/1', type: 'fastethernet', status: 'up', adminStatus: 'up', nameif: 'inside', securityLevel: 100, vlan: 1, ipAddress: '192.168.1.1', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:10:02' },
    ],
    config: {
      hostname: 'ciscoasa', vlans: [{ id: 1, name: 'inside' }, { id: 2, name: 'outside' }],
      asaInspection: { icmp: true, http: true, tcp: true, dns: true, udp: true },
      asaNatRules: [{ id: 'nat-inside-pat', sourceInterface: 'inside', destInterface: 'outside', type: 'dynamic-pat', sourceNet: '192.168.1.0/24' }],
    },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const lab = Buffer.from(JSON.stringify({ version: 1, fileName: 'ASA NAT acceptance', devices: [asa], links: [], annotations: [] }), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.getByRole('button', { name: 'ASA0 ASA 5505', exact: true }).click()

  const deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'ASA0' })
  await deviceWindow.getByRole('tab', { name: 'ASDM', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'Inspection Engine', exact: true }).click()
  const udpInspection = deviceWindow.getByRole('checkbox', { name: /Inspect UDP/ })
  await expect(udpInspection).toBeChecked()
  await udpInspection.uncheck()
  await expect(udpInspection).not.toBeChecked()
  const tcpInspection = deviceWindow.getByRole('checkbox', { name: /Inspect TCP/ })
  await expect(tcpInspection).toBeChecked()
  await tcpInspection.uncheck()
  await expect(tcpInspection).not.toBeChecked()
  await tcpInspection.check()
  const tftpInspection = deviceWindow.getByRole('checkbox', { name: /Inspect TFTP/ })
  await expect(tftpInspection).toBeChecked()
  await tftpInspection.uncheck()
  await expect(tftpInspection).not.toBeChecked()
  await tftpInspection.check()
  await deviceWindow.getByRole('button', { name: 'NAT / PAT', exact: true }).click()
  await expect(deviceWindow).toContainText('192.168.1.0/24')
  await expect(deviceWindow).toContainText('ICMP, UDP, TFTP read, and modeled TCP supported')
  await expect(deviceWindow).toContainText('No active translations.')
  await expect(deviceWindow).toContainText('TFTP uploads, option negotiation, retry recovery, other TCP applications, and static NAT are not simulated.')
  await expect(deviceWindow).not.toContainText('1 PAT Pool')
  expect(browserErrors).toEqual([])
})
