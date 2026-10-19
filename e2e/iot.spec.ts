import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

interface BrowserIotThingState { power?: boolean; open?: boolean; level?: number; temperature?: number; smoke?: boolean; pressedAtTick?: number }
interface BrowserIotDevice {
  id: string
  name?: string
  type?: string
  model?: string
  config?: { iotKind?: string; iotState?: BrowserIotThingState; iotServiceEnabled?: boolean; iotServerAddress?: string }
  iotRuntime?: { state?: string; controlsApplied?: number; lastReportTick?: number }
  iotServerRuntime?: { clients?: Array<{ deviceId: string; address?: string; lastSeenTick: number }> }
}
interface BrowserNetworkState {
  devices: BrowserIotDevice[]
  simulationTick?: number
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState }

const iotPort = (id: string, linkId: string, peerId: string, peerPortId: string, ipAddress: string, macAddress: string) => ({
  id, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up', macAddress,
  ipAddress, subnetMask: '255.255.255.0', portfast: true,
  connectedLinkId: linkId, connectedDeviceId: peerId, connectedPortId: peerPortId,
})

const switchPort = (id: string, name: string, linkId: string, peerId: string, peerPortId: string, macAddress: string) => ({
  id, name, shortName: name.replace('FastEthernet', 'Fa'), type: 'fastethernet',
  status: 'up', adminStatus: 'up', macAddress, portfast: true,
  connectedLinkId: linkId, connectedDeviceId: peerId, connectedPortId: peerPortId,
})

const lab = Buffer.from(JSON.stringify({
  version: 1,
  fileName: 'IoT smart home browser acceptance',
  devices: [
    {
      id: 'srv1', name: 'IoTServer', type: 'server', model: 'Server-PT', x: 120, y: 320, power: true, modules: [], macAddress: '0000.0000.1a01',
      ports: [iotPort('srv1-fa0', 'wire-srv', 'sw1', 'sw1-fa0/1', '192.168.10.10', '0000.0000.1a02')],
      config: { hostname: 'IoTServer', iotServiceEnabled: true, iotCredentials: { username: 'admin', password: 'admin' } },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'sw1', name: 'SW1', type: 'switch', model: '2960-24TT', x: 420, y: 180, power: true, modules: [], macAddress: '0000.0000.2a01',
      ports: [
        switchPort('sw1-fa0/1', 'FastEthernet0/1', 'wire-srv', 'srv1', 'srv1-fa0', '0000.0000.2a11'),
        switchPort('sw1-fa0/2', 'FastEthernet0/2', 'wire-lamp', 'lamp1', 'lamp1-fa0', '0000.0000.2a12'),
        switchPort('sw1-fa0/3', 'FastEthernet0/3', 'wire-door', 'door1', 'door1-fa0', '0000.0000.2a13'),
      ],
      config: { hostname: 'SW1' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'lamp1', name: 'Lamp1', type: 'iot', model: 'Lamp-PT', x: 330, y: 420, power: true, modules: [], macAddress: '0000.0000.3a01',
      ports: [
        iotPort('lamp1-fa0', 'wire-lamp', 'sw1', 'sw1-fa0/2', '192.168.10.21', '0000.0000.3a02'),
        { id: 'lamp1-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless', status: 'down', adminStatus: 'up', macAddress: '0000.0000.3a03' },
      ],
      config: { hostname: 'Lamp1', iotKind: 'lamp', iotState: { power: false }, iotServerAddress: 'auto', dhcpEnabled: true },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'door1', name: 'Door1', type: 'iot', model: 'Door-PT', x: 560, y: 420, power: true, modules: [], macAddress: '0000.0000.4a01',
      ports: [
        iotPort('door1-fa0', 'wire-door', 'sw1', 'sw1-fa0/3', '192.168.10.22', '0000.0000.4a02'),
        { id: 'door1-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless', status: 'down', adminStatus: 'up', macAddress: '0000.0000.4a03' },
      ],
      config: { hostname: 'Door1', iotKind: 'door', iotState: { open: false }, iotServerAddress: 'auto', dhcpEnabled: true },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
  ],
  links: [
    { id: 'wire-srv', type: 'straight', status: 'up', fromDeviceId: 'srv1', fromPortId: 'srv1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/1' },
    { id: 'wire-lamp', type: 'straight', status: 'up', fromDeviceId: 'lamp1', fromPortId: 'lamp1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/2' },
    { id: 'wire-door', type: 'straight', status: 'up', fromDeviceId: 'door1', fromPortId: 'door1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/3' },
  ],
  annotations: [],
}), 'utf8').toString('base64')

test('the smart-home lab registers every IoT device and forwards server commands', async ({ page, baseURL }) => {
  await startNewWorkspace(page)
  await page.locator('button[aria-haspopup="menu"]', { hasText: 'Help' }).click()
  await page.getByRole('menuitem', { name: 'Practice Labs' }).click()
  const labsDialog = page.locator('dialog.pt-training-catalog[open]').filter({ hasText: 'CCNA Practice Lab Scenarios' })
  await expect(labsDialog).toBeVisible()
  const card = labsDialog.locator('li').filter({ hasText: 'Smart Home with IoT Server' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Load Lab' }).click()
  await expect(page.getByRole('heading', { name: /Devices 9/i })).toBeVisible()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const state = store?.getState()
    const things = state?.devices.filter(device => device.type === 'iot') ?? []
    const server = state?.devices.find(device => device.name === 'IoTServer')
    return things.length === 6
      && things.every(thing => thing.iotRuntime?.state === 'registered')
      && (server?.iotServerRuntime?.clients?.length ?? 0) === 6
  }, undefined, { timeout: 30_000 })

  const serverButton = page.getByRole('button', { name: 'Open IoTServer' })
  await expect(serverButton).toBeVisible()
  await serverButton.dblclick()
  const deviceWindow = page.locator('.pt-device-window[aria-label="IoTServer window"]')
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.locator('button', { hasText: /^Services$/ }).click()
  const serviceSection = deviceWindow.locator('[data-iot-service]')
  await expect(serviceSection).toBeVisible()
  await expect(serviceSection.locator('[data-iot-client]')).toHaveCount(6)

  const lampRow = serviceSection.locator('[data-iot-client]').filter({ hasText: 'Lamp0' })
  await expect(lampRow).toBeVisible()
  await lampRow.locator('[data-iot-action="on"]').click()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const lamp = store?.getState().devices.find(device => device.name === 'Lamp0')
    return lamp?.config?.iotState?.power === true && (lamp?.iotRuntime?.controlsApplied ?? 0) >= 1
  }, undefined, { timeout: 30_000 })

  const doorRow = serviceSection.locator('[data-iot-client]').filter({ hasText: 'Door2' })
  await expect(doorRow).toBeVisible()
  await doorRow.locator('[data-iot-action="open"]').click()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const door = store?.getState().devices.find(device => device.name === 'Door2')
    return door?.config?.iotState?.open === true && (door?.iotRuntime?.controlsApplied ?? 0) >= 1
  }, undefined, { timeout: 30_000 })
})

test('an IoT device restored from a shared lab registers and edits its local state from the IoT tab', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('heading', { name: /Devices 4/i })).toBeVisible()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const state = store?.getState()
    const lamp = state?.devices.find(device => device.id === 'lamp1')
    const door = state?.devices.find(device => device.id === 'door1')
    const server = state?.devices.find(device => device.id === 'srv1')
    return lamp?.iotRuntime?.state === 'registered'
      && door?.iotRuntime?.state === 'registered'
      && (server?.iotServerRuntime?.clients?.length ?? 0) === 2
  }, undefined, { timeout: 30_000 })

  const lampButton = page.getByRole('button', { name: 'Open Lamp1' })
  await lampButton.dblclick()
  const deviceWindow = page.locator('.pt-device-window[aria-label="Lamp1 window"]')
  await expect(deviceWindow).toBeVisible()
  const iotTab = deviceWindow.locator('[data-iot-tab]')
  await expect(iotTab).toBeVisible()
  await expect(iotTab.locator('[data-iot-registration="registered"]')).toBeVisible()
  await iotTab.locator('[data-iot-action="on"]').click()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const lamp = store?.getState().devices.find(device => device.id === 'lamp1')
    return lamp?.config?.iotState?.power === true
  }, undefined, { timeout: 10_000 })
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const state = store?.getState()
    const server = state?.devices.find(device => device.id === 'srv1')
    const client = server?.iotServerRuntime?.clients?.find(entry => entry.deviceId === 'lamp1')
    const tick = state?.simulationTick ?? 0
    return !!client && tick - client.lastSeenTick <= 150 && client.address === '192.168.10.21'
  }, undefined, { timeout: 30_000 })
})
