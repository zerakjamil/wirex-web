import { test, expect } from '@playwright/test'
import { createDevice } from '../src/simulator/deviceFactory'
import { parseWorkspace } from '../src/simulator/workspaceSchema'
import type { NetworkDevice, NetworkLink } from '../src/types/network'

function connect(a: NetworkDevice, aPortIndex: number, b: NetworkDevice, bPortIndex: number, id: string): NetworkLink {
  const aPort = a.ports[aPortIndex]
  const bPort = b.ports[bPortIndex]
  Object.assign(aPort, { connectedDeviceId: b.id, connectedPortId: bPort.id, connectedLinkId: id, adminStatus: 'up', status: 'up' })
  Object.assign(bPort, { connectedDeviceId: a.id, connectedPortId: aPort.id, connectedLinkId: id, adminStatus: 'up', status: 'up' })
  return { id, type: 'straight', fromDeviceId: a.id, fromPortId: aPort.id, toDeviceId: b.id, toPortId: bPort.id, status: 'up' }
}

function createDnsMxLab() {
  const pc = createDevice('pc', 100, 120)
  pc.id = 'mx-client'
  pc.name = 'MX Client'
  pc.config.hostname = 'MXClient'
  pc.config.dnsServer = '192.0.2.53'
  Object.assign(pc.ports[0], { ipAddress: '192.0.2.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:02:10', adminStatus: 'up', status: 'up' })

  const sw = createDevice('switch', 300, 240)
  sw.id = 'mx-switch'
  sw.name = 'MX Lab Switch'
  sw.config.hostname = 'MXLabSwitch'

  const server = createDevice('server', 500, 120)
  server.id = 'mx-server'
  server.name = 'DNS Lab Server'
  server.config.hostname = 'DNSLabServer'
  server.config.dnsServiceEnabled = false
  server.config.dnsRecords = []
  server.config.dnsMxRecords = []
  Object.assign(server.ports[0], { ipAddress: '192.0.2.53', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:02:53', adminStatus: 'up', status: 'up' })

  return parseWorkspace({
    version: 1,
    fileName: 'DNS MX lab',
    devices: [pc, sw, server],
    links: [connect(pc, 0, sw, 0, 'mx-client-link'), connect(sw, 1, server, 0, 'mx-server-link')],
    annotations: [],
  })
}

test('students configure an MX record on Server-PT and query it through PC Command Prompt', async ({ page, baseURL }) => {
  test.setTimeout(60_000)
  const lab = Buffer.from(JSON.stringify(createDnsMxLab()), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('button', { name: /DNS Lab Server Server-PT/i })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: /DNS Lab Server Server-PT/i }).click()
  let window = page.locator('.pt-device-window').filter({ hasText: 'DNS Lab Server' })
  await window.getByRole('tab', { name: 'Services', exact: true }).click()
  await window.locator('[data-service="dns"]').click()
  await window.getByLabel('Enable DNS Service').check()
  await window.getByLabel('Mail domain', { exact: true }).fill('classroom.test')
  await window.getByLabel('Exchange host', { exact: true }).fill('mail.classroom.test')
  await window.getByLabel('Preference', { exact: true }).fill('10')
  await window.getByRole('button', { name: 'Add MX record', exact: true }).click()
  await expect(window.getByLabel('Mail domain 1')).toHaveValue('classroom.test')
  await expect(window.getByLabel('Exchange host 1')).toHaveValue('mail.classroom.test')
  await window.getByLabel('Domain name').fill('mail.classroom.test')
  await window.getByLabel('IPv4 address').fill('192.0.2.53')
  await window.getByRole('button', { name: 'Add record', exact: true }).click()
  await window.getByRole('button', { name: 'Close DNS Lab Server' }).click()

  await page.getByRole('button', { name: /MX Client PC-PT/i }).click()
  window = page.locator('.pt-device-window').filter({ hasText: 'MX Client' })
  await window.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await window.getByRole('button', { name: /Command Prompt/ }).click()
  await window.locator('input').fill('nslookup -type=MX classroom.test')
  await window.locator('input').press('Enter')
  await expect(window.getByText(/preference = 10, mail exchanger = mail\.classroom\.test/)).toBeVisible({ timeout: 15_000 })
  await window.locator('input').fill('nslookup -type=A mail.classroom.test')
  await window.locator('input').press('Enter')
  await expect(window.getByText(/Address: 192\.0\.2\.53/)).toBeVisible({ timeout: 15_000 })
  await window.locator('input').fill('nslookup -type=AAAA classroom.test')
  await window.locator('input').press('Enter')
  await expect(window.getByText(/Query type AAAA is not supported\. Supported types: A, MX\./)).toBeVisible()
})
