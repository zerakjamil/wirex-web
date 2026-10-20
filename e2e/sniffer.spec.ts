import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

interface BrowserDevice {
  id: string
  snifferCaptures?: Array<{ id: string; tick: number; portId: string; portName: string; pdu: { protocol: string } }>
}
interface BrowserNetworkState {
  devices: BrowserDevice[]
  pingResults: Array<{ status: string }>
  sendPing: (sourceDeviceId: string, targetIp: string) => string | null
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState }
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

const pcPort = (id: string, linkId: string, peerPortId: string, ipAddress: string, macAddress: string) => ({
  id, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up',
  macAddress, ipAddress, subnetMask: '255.255.255.0',
  connectedLinkId: linkId, connectedDeviceId: 'sniffer1', connectedPortId: peerPortId,
})

const pc = (id: string, name: string, ipAddress: string, macAddress: string, portId: string, linkId: string, peerPortId: string) => ({
  id, name, type: 'pc', model: 'PC-PT', x: id === 'pc1' ? 220 : 780, y: 300, power: true, modules: [], macAddress,
  ports: [pcPort(portId, linkId, peerPortId, ipAddress, macAddress)],
  config: { hostname: name },
  routingTable: [{ network: '192.168.0.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0', metric: 0, type: 'C' }],
  arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
})

const snifferPort = (id: string, name: string, shortName: string, slot: number, linkId: string, peerId: string, peerPortId: string, macAddress: string) => ({
  id, name, shortName, type: 'fastethernet', status: 'up', adminStatus: 'up', moduleSlot: slot, media: 'copper',
  macAddress, connectedLinkId: linkId, connectedDeviceId: peerId, connectedPortId: peerPortId,
})

const lab = Buffer.from(JSON.stringify({
  version: 1,
  fileName: 'Sniffer browser acceptance',
  devices: [
    pc('pc1', 'PC1', '192.168.0.1', '0000.0000.1a02', 'pc1-fa0', 'wire-pc1', 'sniffer-p0'),
    {
      id: 'sniffer1', name: 'Sniffer0', type: 'hub', model: 'Sniffer', x: 500, y: 300, power: true,
      modules: ['PT-REPEATER-NM-1CFE', 'PT-REPEATER-NM-1CFE'],
      ports: [
        snifferPort('sniffer-p0', 'FastEthernet1/0', 'Fa1/0', 0, 'wire-pc1', 'pc1', 'pc1-fa0', '0000.0000.5a01'),
        snifferPort('sniffer-p1', 'FastEthernet2/0', 'Fa2/0', 1, 'wire-pc2', 'pc2', 'pc2-fa0', '0000.0000.5a02'),
      ],
      config: { hostname: 'Sniffer0', snifferServiceEnabled: true, snifferPorts: {}, snifferBufferSize: 100 },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    pc('pc2', 'PC2', '192.168.0.2', '0000.0000.3a02', 'pc2-fa0', 'wire-pc2', 'sniffer-p1'),
  ],
  links: [
    { id: 'wire-pc1', type: 'straight', status: 'up', fromDeviceId: 'pc1', fromPortId: 'pc1-fa0', toDeviceId: 'sniffer1', toPortId: 'sniffer-p0' },
    { id: 'wire-pc2', type: 'straight', status: 'up', fromDeviceId: 'sniffer1', fromPortId: 'sniffer-p1', toDeviceId: 'pc2', toPortId: 'pc2-fa0' },
  ],
  annotations: [],
}), 'utf8').toString('base64')

async function openLab(page: import('@playwright/test').Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().devices.length === 3
  })
}

async function openSniffer(page: import('@playwright/test').Page) {
  const open = page.getByRole('button', { name: /Open Sniffer0/i })
  await expect(open).toBeVisible()
  await open.dblclick()
  const deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'Sniffer0' })
  await expect(deviceWindow).toBeVisible()
  return deviceWindow
}

test('Sniffer ships with two empty repeater bays and accepts repeater modules', async ({ page }) => {
  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'End Devices', exact: true }).click()
  await page.getByRole('button', { name: 'Place Sniffer', exact: true }).click()
  const placement = page.getByLabel('Place Sniffer on workspace')
  await expect(placement).toBeVisible()
  await placement.click({ position: { x: 360, y: 280 } })

  const deviceWindow = await openSniffer(page)
  await expect(deviceWindow.getByRole('tab', { name: 'Physical', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Config', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'GUI', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Attributes', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Desktop', exact: true })).toHaveCount(0)
  await expect(deviceWindow.getByRole('tab', { name: 'CLI', exact: true })).toHaveCount(0)
  await deviceWindow.getByRole('tab', { name: 'Physical', exact: true }).click()
  await expect(deviceWindow.locator('.hw-sniffer')).toBeVisible()
  await expect(deviceWindow.locator('.hw-sniffer .hw-bay')).toHaveCount(2)

  await deviceWindow.getByRole('button', { name: 'Device power' }).click()
  await deviceWindow.getByRole('button', { name: 'PT-REPEATER-NM-1CFE', exact: true }).click()
  await deviceWindow.getByRole('button', { name: 'Install', exact: true }).first().click()
  await expect(deviceWindow.locator('.hw-sniffer .hw-bay.is-installed')).toHaveCount(1)
  await deviceWindow.getByRole('button', { name: 'Install', exact: true }).first().click()
  await expect(deviceWindow.locator('.hw-sniffer .hw-bay.is-installed')).toHaveCount(2)
  await expect(deviceWindow.getByRole('button', { name: /FastEthernet1\/0:/ })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: /FastEthernet2\/0:/ })).toBeVisible()
})

test('Sniffer GUI captures real inbound frames, shows PDU details and honors service and port toggles', async ({ page, baseURL }) => {
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`)
  })

  await openLab(page, baseURL)
  const deviceWindow = await openSniffer(page)
  await deviceWindow.getByRole('tab', { name: 'GUI', exact: true }).click()

  const service = deviceWindow.getByRole('group', { name: 'Sniffer Service' })
  await expect(service).toBeVisible()
  await expect(deviceWindow.getByText('No packets captured yet.')).toBeVisible()
  await expect(deviceWindow.getByRole('checkbox', { name: 'FastEthernet1/0' })).toBeChecked()
  await expect(deviceWindow.getByRole('checkbox', { name: 'FastEthernet2/0' })).toBeChecked()

  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().sendPing('pc1', '192.168.0.2'))
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return (store?.getState().devices.find(device => device.id === 'sniffer1')?.snifferCaptures?.length ?? 0) > 0
  })
  await expect(deviceWindow.getByTestId('sniffer-capture-row').first()).toBeVisible()

  await deviceWindow.getByTestId('sniffer-capture-row').first().click()
  await expect(deviceWindow.getByRole('button', { name: 'PDU Details', exact: true })).toBeVisible()
  await deviceWindow.getByRole('button', { name: 'PDU Details', exact: true }).click()
  const pduDialog = page.locator('.fixed.inset-0').filter({ hasText: 'PDU Information:' })
  await expect(pduDialog).toBeVisible()
  await pduDialog.getByRole('button').first().click()
  await expect(pduDialog).toHaveCount(0)

  await service.getByRole('button', { name: 'Off', exact: true }).click()
  await expect(service.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await deviceWindow.getByRole('button', { name: 'Clear Captures', exact: true }).click()
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return (store?.getState().devices.find(device => device.id === 'sniffer1')?.snifferCaptures?.length ?? 0) === 0
  })
  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().sendPing('pc1', '192.168.0.2'))
  await page.waitForTimeout(900)
  expect(await page.evaluate(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().devices.find(device => device.id === 'sniffer1')?.snifferCaptures?.length ?? 0
  })).toBe(0)

  await service.getByRole('button', { name: 'On', exact: true }).click()
  await deviceWindow.getByRole('checkbox', { name: 'FastEthernet1/0' }).uncheck()
  await deviceWindow.getByRole('checkbox', { name: 'FastEthernet2/0' }).uncheck()
  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().sendPing('pc1', '192.168.0.2'))
  await page.waitForTimeout(900)
  expect(await page.evaluate(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().devices.find(device => device.id === 'sniffer1')?.snifferCaptures?.length ?? 0
  })).toBe(0)

  expect(browserErrors).toEqual([])
})
