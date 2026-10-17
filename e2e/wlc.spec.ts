import { test, expect } from '@playwright/test'

interface BrowserWlcRuntime { aps?: Array<{ apId: string; apMac: string }>; clientTunnels?: Array<{ macAddress: string }> }
interface BrowserWlcDevice {
  id: string
  name?: string
  model?: string
  apRuntime?: { state?: string }
  wlcRuntime?: BrowserWlcRuntime
}
interface BrowserNetworkState {
  devices: BrowserWlcDevice[]
  sendPing: (sourceDeviceId: string, targetIp: string) => string | null
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState }

const wiredPort = (id: string, name: string, shortName: string, mac: string, linkId: string, peerId: string, peerPortId: string) => ({
  id, name, shortName, type: 'fastethernet', status: 'up', adminStatus: 'up', macAddress: mac, portfast: true,
  connectedLinkId: linkId, connectedDeviceId: peerId, connectedPortId: peerPortId,
})

const lab = Buffer.from(JSON.stringify({
  version: 1,
  fileName: 'Wireless LAN controller browser acceptance',
  devices: [
    {
      id: 'wlc1', name: 'WLC1', type: 'wlc', model: 'WLC-PT', x: 430, y: 70, power: true, modules: [], macAddress: '0000.0000.0d01',
      ports: [
        {
          id: 'wlc1-gi0/0', name: 'GigabitEthernet0/0', shortName: 'Gi0/0', type: 'gigabitethernet', status: 'up', adminStatus: 'up',
          macAddress: '0000.0000.0d02', ipAddress: '192.168.1.254', subnetMask: '255.255.255.0',
          connectedLinkId: 'wire-wlc', connectedDeviceId: 'sw1', connectedPortId: 'sw1-fa0/1',
        },
        { id: 'wlc1-gi0/1', name: 'GigabitEthernet0/1', shortName: 'Gi0/1', type: 'gigabitethernet', status: 'down', adminStatus: 'up', macAddress: '0000.0000.0d03' },
      ],
      config: {
        hostname: 'WLC1',
        wlans: [
          { id: 1, name: 'CORP', ssid: 'CORP-NET', enabled: true, vlan: 0, security: 'wpa2-psk', passphrase: 'wireforge1' },
          { id: 2, name: 'GUEST', ssid: 'GUEST-WIFI', enabled: true, vlan: 0, security: 'none' },
        ],
      },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'sw1', name: 'SW1', type: 'switch', model: '2960-24TT', x: 430, y: 250, power: true, modules: [], macAddress: '0000.0000.0a01',
      ports: [
        wiredPort('sw1-fa0/1', 'FastEthernet0/1', 'Fa0/1', '0000.0000.0a11', 'wire-wlc', 'wlc1', 'wlc1-gi0/0'),
        wiredPort('sw1-fa0/2', 'FastEthernet0/2', 'Fa0/2', '0000.0000.0a12', 'wire-lap1', 'lap1', 'lap1-fa0'),
        wiredPort('sw1-fa0/3', 'FastEthernet0/3', 'Fa0/3', '0000.0000.0a13', 'wire-lap2', 'lap2', 'lap2-fa0'),
        wiredPort('sw1-fa0/4', 'FastEthernet0/4', 'Fa0/4', '0000.0000.0a14', 'wire-pc', 'pc1', 'pc1-fa0'),
      ],
      config: { hostname: 'SW1' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'lap1', name: 'LAP1', type: 'wireless', model: 'LAP-PT', x: 150, y: 210, power: true, modules: [], macAddress: '0000.0000.0b01',
      ports: [
        wiredPort('lap1-fa0', 'FastEthernet0', 'Fa0', '0000.0000.0b02', 'wire-lap1', 'sw1', 'sw1-fa0/2'),
        { id: 'lap1-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless', status: 'up', adminStatus: 'up', macAddress: '0000.0000.0b03' },
      ],
      config: { hostname: 'LAP1', apMode: 'lightweight' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'lap2', name: 'LAP2', type: 'wireless', model: 'LAP-PT', x: 700, y: 210, power: true, modules: [], macAddress: '0000.0000.0c01',
      ports: [
        wiredPort('lap2-fa0', 'FastEthernet0', 'Fa0', '0000.0000.0c02', 'wire-lap2', 'sw1', 'sw1-fa0/3'),
        { id: 'lap2-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless', status: 'up', adminStatus: 'up', macAddress: '0000.0000.0c03' },
      ],
      config: { hostname: 'LAP2', apMode: 'lightweight' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'phone1', name: 'Smartphone1', type: 'smartphone', model: 'Smartphone-PT', x: 140, y: 420, power: true, modules: [], macAddress: '0000.0000.0e01',
      ports: [
        {
          id: 'phone1-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless', status: 'up', adminStatus: 'up',
          macAddress: '0000.0000.0e02', ipAddress: '192.168.1.101', subnetMask: '255.255.255.0',
          connectedLinkId: 'wireless-lap1-phone', connectedDeviceId: 'lap1', connectedPortId: 'lap1-wlan0',
        },
        { id: 'phone1-cell0', name: 'Cellular0', shortName: 'Cell0', type: 'wireless', status: 'down', adminStatus: 'up', macAddress: '0000.0000.0e03' },
      ],
      config: { hostname: 'Smartphone1' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'pc1', name: 'PC1', type: 'pc', model: 'PC-PT', x: 430, y: 420, power: true, modules: [], macAddress: '0000.0000.0f01',
      ports: [
        wiredPort('pc1-fa0', 'FastEthernet0', 'Fa0', '0000.0000.0f02', 'wire-pc', 'sw1', 'sw1-fa0/4'),
      ],
      config: { hostname: 'PC1' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
  ],
  links: [
    { id: 'wire-wlc', type: 'straight', status: 'up', fromDeviceId: 'wlc1', fromPortId: 'wlc1-gi0/0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/1' },
    { id: 'wire-lap1', type: 'straight', status: 'up', fromDeviceId: 'lap1', fromPortId: 'lap1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/2' },
    { id: 'wire-lap2', type: 'straight', status: 'up', fromDeviceId: 'lap2', fromPortId: 'lap2-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/3' },
    { id: 'wire-pc', type: 'straight', status: 'up', fromDeviceId: 'pc1', fromPortId: 'pc1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/4' },
    { id: 'wireless-lap1-phone', type: 'wireless', status: 'up', fromDeviceId: 'lap1', fromPortId: 'lap1-wlan0', toDeviceId: 'phone1', toPortId: 'phone1-wlan0' },
  ],
  annotations: [],
}), 'utf8').toString('base64')

test('the controller lab loads from the Lab Activities list, raises both access points, and serves its web interface', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/`)
  await page.locator('button[aria-haspopup="menu"]', { hasText: 'Help' }).click()
  await page.getByRole('menuitem', { name: 'Practice Labs' }).click()
  const labsDialog = page.locator('dialog.pt-training-catalog[open]').filter({ hasText: 'CCNA Practice Lab Scenarios' })
  await expect(labsDialog).toBeVisible()
  const wlcCard = labsDialog.locator('li').filter({ hasText: 'Wireless LAN Controller & Lightweight Access Points' })
  await expect(wlcCard).toBeVisible()
  await wlcCard.getByRole('button', { name: 'Load Lab' }).click()
  await expect(page.getByRole('heading', { name: /Devices 7/i })).toBeVisible()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const state = store?.getState()
    const laps = state?.devices.filter(device => device.model === 'LAP-PT') ?? []
    const wlc = state?.devices.find(device => device.name === 'WLC1')
    return laps.length === 2
      && laps.every(ap => ap.apRuntime?.state === 'run')
      && (wlc?.wlcRuntime?.aps?.length ?? 0) === 2
  }, undefined, { timeout: 20_000 })
  const wlcButton = page.getByRole('button', { name: 'Open WLC1' })
  await expect(wlcButton).toBeVisible()
  await wlcButton.dblclick()
  const deviceWindow = page.locator('.pt-device-window[aria-label="WLC1 window"]')
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.locator('button', { hasText: /^GUI$/ }).click()
  await deviceWindow.getByLabel('Username').fill('admin')
  await deviceWindow.getByLabel('Password').fill('admin')
  await deviceWindow.getByRole('button', { name: 'Sign in' }).click()
  await expect(deviceWindow).toContainText('Access Point Summary')
  await expect(deviceWindow).toContainText('LAP1')
  await expect(deviceWindow).toContainText('LAP2')
  await expect(deviceWindow).toContainText('2 access points registered')
  await expect(deviceWindow).toContainText('2 enabled WLANs')
  await deviceWindow.getByRole('button', { name: 'Management' }).click()
  await expect(deviceWindow).toContainText('192.168.1.254')
  await expect(deviceWindow).toContainText('255.255.255.0')
})

test('the controller console reports wireless LANs, access points, and switched clients', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('heading', { name: /Devices 6/i })).toBeVisible()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const state = store?.getState()
    const laps = state?.devices.filter(device => device.model === 'LAP-PT') ?? []
    const wlc = state?.devices.find(device => device.id === 'wlc1')
    return laps.length === 2 && laps.every(ap => ap.apRuntime?.state === 'run') && (wlc?.wlcRuntime?.aps?.length ?? 0) === 2
  }, undefined, { timeout: 20_000 })
  const wlcButton = page.getByRole('button', { name: 'Open WLC1' })
  await wlcButton.dblclick()
  const deviceWindow = page.locator('.pt-device-window[aria-label="WLC1 window"]')
  await expect(deviceWindow).toBeVisible()
  await deviceWindow.locator('button', { hasText: /^CLI$/ }).click()
  const cliInput = deviceWindow.locator('input[type="text"]').last()
  await cliInput.fill('show wlan summary')
  await cliInput.press('Enter')
  await expect(deviceWindow).toContainText('CORP-NET')
  await expect(deviceWindow).toContainText('GUEST-WIFI')
  await cliInput.fill('show ap summary')
  await cliInput.press('Enter')
  await expect(deviceWindow).toContainText('LAP1')
  await expect(deviceWindow).toContainText('LAP2')
  await expect(deviceWindow).toContainText('Run')
  const pingId = await page.evaluate(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    return store?.getState().sendPing('phone1', '192.168.1.10') ?? null
  })
  expect(pingId).toBeTruthy()
  await page.waitForFunction(() => {
    const store = (window as unknown as { __wireforgeNetworkStore?: BrowserNetworkStore }).__wireforgeNetworkStore
    const wlc = store?.getState().devices.find(device => device.id === 'wlc1')
    return (wlc?.wlcRuntime?.clientTunnels?.length ?? 0) > 0
  }, undefined, { timeout: 20_000 })
  await cliInput.fill('show client summary')
  await cliInput.press('Enter')
  await expect(deviceWindow).toContainText('Smartphone1')
  await expect(deviceWindow).toContainText('LAP1')
})
