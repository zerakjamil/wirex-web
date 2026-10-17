import { test, expect } from '@playwright/test'

interface BrowserNetworkState {
  devices: Array<{ id: string; name: string }>
  simulationTick: number
  simulationHistory: unknown[]
  simulationEvents: Array<{ id: string; protocol: string }>
  pingResults: Array<{ id: string; status: string }>
  sendPing: (sourceDeviceId: string, targetIp: string) => string | null
  stepSimulation: () => void
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState }
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

const hostPort = (id: string, linkId: string, peerPortId: string, ipAddress: string, macAddress: string) => ({
  id, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up',
  macAddress, ipAddress, subnetMask: '255.255.255.0', portfast: true,
  connectedLinkId: linkId, connectedDeviceId: 'sw1', connectedPortId: peerPortId,
})

const switchPort = (id: string, name: string, linkId: string, peerPortId: string, macAddress: string) => ({
  id, name, shortName: name.replace('FastEthernet', 'Fa'), type: 'fastethernet', status: 'up', adminStatus: 'up',
  macAddress, portfast: true,
  connectedLinkId: linkId, connectedDeviceId: linkId === 'wire-pc1' ? 'pc1' : 'pc2', connectedPortId: peerPortId,
})

const host = (id: string, name: string, ipAddress: string, macAddress: string, portId: string, linkId: string, peerPortId: string) => ({
  id, name, type: 'pc', model: 'PC-PT', x: id === 'pc1' ? 220 : 780, y: 300, power: true, modules: [], macAddress,
  ports: [hostPort(portId, linkId, peerPortId, ipAddress, macAddress)],
  config: { hostname: name },
  routingTable: [{ network: '192.168.0.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0', metric: 0, type: 'C' }],
  arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
})

const lab = Buffer.from(JSON.stringify({
  version: 1,
  fileName: 'Back stepping browser acceptance',
  devices: [
    host('pc1', 'PC1', '192.168.0.1', '0000.0000.1a02', 'pc1-fa0', 'wire-pc1', 'sw1-fa0/1'),
    {
      id: 'sw1', name: 'SW1', type: 'switch', model: '2960-24TT', x: 500, y: 180, power: true, modules: [], macAddress: '0000.0000.2a01',
      ports: [
        switchPort('sw1-fa0/1', 'FastEthernet0/1', 'wire-pc1', 'pc1-fa0', '0000.0000.2a11'),
        switchPort('sw1-fa0/2', 'FastEthernet0/2', 'wire-pc2', 'pc2-fa0', '0000.0000.2a12'),
      ],
      config: { hostname: 'SW1' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    host('pc2', 'PC2', '192.168.0.2', '0000.0000.3a02', 'pc2-fa0', 'wire-pc2', 'sw1-fa0/2'),
  ],
  links: [
    { id: 'wire-pc1', type: 'straight', status: 'up', fromDeviceId: 'pc1', fromPortId: 'pc1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/1' },
    { id: 'wire-pc2', type: 'straight', status: 'up', fromDeviceId: 'pc2', fromPortId: 'pc2-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/2' },
  ],
  annotations: [],
}), 'utf8').toString('base64')

test('back stepping rewinds the timeline and event filters hide protocols', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().devices.length === 3
  })

  await page.getByRole('button', { name: 'Simulation', exact: true }).click()
  const controls = page.locator('.pt-simulation-controls')
  const back = controls.getByRole('button', { name: 'Back', exact: true })
  const captureForward = controls.getByRole('button', { name: 'Capture / Forward', exact: true })
  await expect(back).toBeVisible()
  await expect(back).toBeDisabled()

  const tick = () => page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().simulationTick)
  const pingId = await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().sendPing('pc1', '192.168.0.2'))
  expect(pingId).toBeTruthy()

  const before = await tick()
  await captureForward.click()
  const after = await tick()
  expect(after).toBeGreaterThan(before)
  await expect(back).toBeEnabled()

  await back.click()
  await expect.poll(tick).toBe(after - 1)
  await page.keyboard.press('Alt+b')
  await expect.poll(tick).toBe(after - 2)

  await captureForward.click()
  await page.evaluate(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore!
    for (let i = 0; i < 40 && store.getState().pingResults[0]?.status === 'pending'; i++) store.getState().stepSimulation()
  })
  await expect.poll(() => page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().pingResults[0]?.status)).toBe('successful')

  const tabs = page.locator('.pt-pdu-tabs')
  await tabs.getByRole('button', { name: 'Events', exact: true }).click()
  const eventTable = page.locator('.pt-event-table')
  await expect(eventTable).toBeVisible()
  expect(await eventTable.locator('[data-protocol]').count()).toBeGreaterThanOrEqual(4)
  expect(await eventTable.locator('[data-protocol="ICMP"]').count()).toBeGreaterThanOrEqual(1)
  expect(await eventTable.locator('[data-protocol="ARP"]').count()).toBeGreaterThanOrEqual(1)

  const eventControls = page.locator('.pt-event-controls')
  await eventControls.getByRole('button', { name: 'Edit Filters', exact: true }).click()
  const filters = page.locator('.pt-event-filters')
  await expect(filters).toBeVisible()
  await filters.getByRole('checkbox', { name: 'ICMP', exact: true }).uncheck()
  await expect(eventTable.locator('[data-protocol="ICMP"]')).toHaveCount(0)
  expect(await eventTable.locator('[data-protocol="ARP"]').count()).toBeGreaterThanOrEqual(1)
  await filters.getByRole('button', { name: 'Show None', exact: true }).click()
  await expect(eventTable.locator('[data-protocol]')).toHaveCount(0)
  await expect(eventTable.locator('tbody tr')).toHaveCount(1)
  await expect(eventTable).toContainText('No events match the current filters.')
  await filters.getByRole('button', { name: 'Show All', exact: true }).click()
  expect(await eventTable.locator('[data-protocol]').count()).toBeGreaterThanOrEqual(4)
  await filters.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(filters).toHaveCount(0)

  const toggleAll = eventControls.getByRole('button', { name: 'Show All / None', exact: true })
  await toggleAll.click()
  await expect(eventTable.locator('[data-protocol]')).toHaveCount(0)
  await toggleAll.click()
  expect(await eventTable.locator('[data-protocol]').count()).toBeGreaterThanOrEqual(4)

  await tabs.getByRole('button', { name: 'PDUs', exact: true }).click()
  await expect(page.locator('.pt-pdu-table')).toBeVisible()
  await expect(eventTable).toHaveCount(0)
})
