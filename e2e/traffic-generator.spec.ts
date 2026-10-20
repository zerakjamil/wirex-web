import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { parseWorkspace } from '../src/simulator/workspaceSchema'

interface BrowserPdu {
  id?: string
  protocol?: string
  sourceIp?: string
  sourceMac?: string
  generatorColor?: string
  payload: {
    dscp?: number
    udpService?: string
    udpSourcePort?: number
    udpDestinationPort?: number
    udpData?: string
    tcpApplication?: string
    tcpFlags?: string
  }
  pendingPacket?: BrowserPdu
}
interface BrowserNetworkState {
  devices: Array<{ id: string }>
  inFlightPackets: Array<{ pdu: BrowserPdu }>
  trafficGenerators: Array<{ id: string; deviceId: string; sentCount: number; settings: { application: string; sourcePort: number; payloadSize: number; sourceIp: string; sourceMac: string } }>
}
interface BrowserNetworkStore {
  getState: () => BrowserNetworkState
  setState: (state: { simulationMode?: 'realtime' | 'simulation'; simulationPlaying?: boolean }) => void
}
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

function createTrafficLab() {
  const pc = (id: string, name: string, ip: string, switchPortId: string, linkId: string) => ({
    id, name, type: 'pc', model: 'PC-PT', x: id === 'pc1' ? 200 : 760, y: 220, power: true, modules: [],
    ports: [{ id: `${id}-eth0`, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', ipAddress: ip, subnetMask: '255.255.255.0', macAddress: id === 'pc1' ? '02:00:00:00:30:10' : '02:00:00:00:30:11', status: 'up', adminStatus: 'up', connectedLinkId: linkId, connectedDeviceId: 'tg-switch', connectedPortId: switchPortId }],
    config: { hostname: name, vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  })
  const tgSwitch = {
    id: 'tg-switch', name: 'Traffic Switch', type: 'switch', model: '2960-24TT', x: 480, y: 380, power: true, modules: [],
    ports: [
      { id: 'switch-pc1', name: 'FastEthernet0/1', shortName: 'Fa0/1', type: 'fastethernet', macAddress: '02:00:00:00:30:31', status: 'up', adminStatus: 'up', connectedLinkId: 'tg-link-1', connectedDeviceId: 'pc1', connectedPortId: 'pc1-eth0' },
      { id: 'switch-pc2', name: 'FastEthernet0/2', shortName: 'Fa0/2', type: 'fastethernet', macAddress: '02:00:00:00:30:32', status: 'up', adminStatus: 'up', connectedLinkId: 'tg-link-2', connectedDeviceId: 'pc2', connectedPortId: 'pc2-eth0' },
    ],
    config: { hostname: 'TrafficSwitch', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const devices = [pc('pc1', 'PC1', '192.168.30.1', 'switch-pc1', 'tg-link-1'), pc('pc2', 'PC2', '192.168.30.2', 'switch-pc2', 'tg-link-2'), tgSwitch]
  const links = [
    { id: 'tg-link-1', type: 'straight', status: 'up', fromDeviceId: 'pc1', fromPortId: 'pc1-eth0', toDeviceId: 'tg-switch', toPortId: 'switch-pc1' },
    { id: 'tg-link-2', type: 'straight', status: 'up', fromDeviceId: 'pc2', fromPortId: 'pc2-eth0', toDeviceId: 'tg-switch', toPortId: 'switch-pc2' },
  ]
  return { version: 1, fileName: 'Traffic generator acceptance', devices, links, annotations: [] }
}

async function openTrafficGenerator(page: Page, baseURL: string | undefined) {
  const lab = Buffer.from(JSON.stringify(parseWorkspace(createTrafficLab())), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.waitForFunction(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore?.getState().devices.length === 3)
  await page.getByRole('button', { name: /PC1\s+PC-PT/i }).click()
  const deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'PC1' })
  await deviceWindow.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'Traffic Generator', exact: true }).click()
  const app = deviceWindow.locator('[data-testid="pt-traffic-generator"]')
  await expect(app).toBeVisible()
  return app
}

test('Traffic Generator tests one PDU and rejects out-of-range intervals', async ({ page, baseURL }) => {
  const app = await openTrafficGenerator(page, baseURL)
  await app.locator('#tg-target-pc1').fill('192.168.30.2')

  const status = app.locator('[data-testid="pt-tg-status"]')
  const count = app.locator('[data-testid="pt-tg-count"]')
  await expect(status).toHaveAttribute('data-running', 'false')

  await app.getByRole('button', { name: 'Test', exact: true }).click()
  await expect(count).toHaveText('1')

  await app.getByRole('radio', { name: 'Periodic', exact: true }).check()
  await app.locator('#tg-interval-pc1').fill('0.0009')
  await app.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(app.locator('[data-testid="pt-tg-error"]')).toContainText('The interval must be between 0.001 and 1,000,000 seconds.')
  await expect(status).toHaveAttribute('data-running', 'false')

  await app.locator('#tg-interval-pc1').fill('abc')
  await app.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(app.locator('[data-testid="pt-tg-error"]')).toContainText('Enter the interval as a number of seconds.')
  await expect(status).toHaveAttribute('data-running', 'false')
  await expect(count).toHaveText('1')

  const generators = await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().trafficGenerators.length)
  expect(generators).toBe(0)
})

test('a periodic run labels canvas packets, counts sends, and freezes on stop', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const app = await openTrafficGenerator(page, baseURL)
  await app.locator('#tg-target-pc1').fill('192.168.30.2')
  await app.getByRole('button', { name: 'Packet Color #dc2626' }).click()
  await app.locator('#tg-dscp-pc1').fill('46')
  await app.getByRole('radio', { name: 'Periodic', exact: true }).check()
  await app.locator('#tg-interval-pc1').fill('0.2')

  const status = app.locator('[data-testid="pt-tg-status"]')
  const count = app.locator('[data-testid="pt-tg-count"]')
  await app.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(status).toHaveAttribute('data-running', 'true')
  await expect(count).toHaveText('1')

  await expect(page.locator('[data-testid="in-flight-packet"] rect[fill="#dc2626"]').first()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().inFlightPackets
    .some(packet => packet.pdu.generatorColor === '#dc2626' && (packet.pdu.payload.dscp === 46 || packet.pdu.pendingPacket?.payload.dscp === 46))), { timeout: 15_000 }).toBe(true)
  await expect.poll(async () => Number(await count.innerText()), { timeout: 20_000 }).toBeGreaterThanOrEqual(3)

  await app.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(status).toHaveAttribute('data-running', 'false')
  const frozen = Number(await count.innerText())
  expect(frozen).toBeGreaterThanOrEqual(3)
  await page.waitForTimeout(1200)
  expect(Number(await count.innerText())).toBe(frozen)
  const generators = await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().trafficGenerators.length)
  expect(generators).toBe(0)
})

test('raw injectors honor pinned ports, source overrides, and periodic runs survive a reload', async ({ page, baseURL }) => {
  test.setTimeout(180_000)
  const app = await openTrafficGenerator(page, baseURL)
  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.setState({ simulationMode: 'simulation', simulationPlaying: false }))

  await app.locator('#tg-target-pc1').fill('192.168.30.2')
  await app.locator('#tg-application-pc1').selectOption('raw-udp')
  await app.locator('#tg-port-pc1').fill('5001')
  await app.locator('#tg-source-port-pc1').fill('4000')
  await app.locator('#tg-payload-pc1').fill('64')
  await app.locator('[data-testid="pt-tg-auto-port"]').uncheck()
  await expect(app.locator('[data-testid="pt-tg-outgoing-port"]')).toBeVisible()
  await app.locator('[data-testid="pt-tg-source-mac"]').fill('02:00:00:00:aa:bb')
  await app.locator('[data-testid="pt-tg-source-ip"]').fill('192.168.30.99')

  const count = app.locator('[data-testid="pt-tg-count"]')
  await app.getByRole('button', { name: 'Test', exact: true }).click()
  await expect(count).toHaveText('1')

  const rawPdu = await page.evaluate(() => {
    const state = (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState()
    for (const frame of state.inFlightPackets) {
      const candidates = [frame.pdu, frame.pdu.pendingPacket].filter((pdu): pdu is NonNullable<typeof pdu> => Boolean(pdu))
      const found = candidates.find(pdu => pdu.payload.udpService === 'raw')
      if (found) return { sourceIp: found.sourceIp, sourceMac: found.sourceMac, sourcePort: found.payload.udpSourcePort, destinationPort: found.payload.udpDestinationPort, dataLength: found.payload.udpData?.length ?? 0 }
    }
    return null
  })
  expect(rawPdu).toMatchObject({ sourceIp: '192.168.30.99', sourceMac: '02:00:00:00:aa:bb', sourcePort: 4000, destinationPort: 5001, dataLength: 64 })

  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.setState({ simulationMode: 'realtime', simulationPlaying: true }))
  await app.getByRole('radio', { name: 'Periodic', exact: true }).check()
  await app.locator('#tg-interval-pc1').fill('0.2')
  const status = app.locator('[data-testid="pt-tg-status"]')
  await app.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(status).toHaveAttribute('data-running', 'true')
  await expect.poll(async () => Number(await count.innerText()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2)
  const before = await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().trafficGenerators[0].sentCount)

  await page.goto(`${baseURL}/`)
  await page.waitForFunction(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore?.getState().devices.length === 3)
  const restored = await page.evaluate(() => {
    const runs = (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().trafficGenerators
    return runs.map(run => ({ deviceId: run.deviceId, application: run.settings.application, sourcePort: run.settings.sourcePort, payloadSize: run.settings.payloadSize, sourceIp: run.settings.sourceIp, sourceMac: run.settings.sourceMac, sentCount: run.sentCount }))
  })
  expect(restored).toHaveLength(1)
  expect(restored[0]).toMatchObject({ deviceId: 'pc1', application: 'raw-udp', sourcePort: 4000, payloadSize: 64, sourceIp: '192.168.30.99', sourceMac: '02:00:00:00:aa:bb' })
  expect(restored[0].sentCount).toBeGreaterThanOrEqual(before)
  await expect.poll(() => page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().trafficGenerators[0]?.sentCount ?? 0), { timeout: 20_000 }).toBeGreaterThan(restored[0].sentCount)
})
