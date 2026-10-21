import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

interface BrowserPort {
  id: string
  name: string
  ipAddress?: string
  subnetMask?: string
  status: string
  adminStatus: string
  moduleSlot?: number
}

interface BrowserCyberObserver {
  id: string
  name: string
  model: string
  ports: BrowserPort[]
  modules: string[]
  config: {
    cyberObserver?: {
      accounts?: Array<{ username: string; passwordHash: string }>
      discoveries?: Array<{ id: string; status: string; reason?: string; deviceIds: string[] }>
      lastDiscoveryId?: string
    }
  }
}

interface BrowserNetworkState {
  devices: BrowserCyberObserver[]
  links: Array<{ status: string; fromDeviceId: string; toDeviceId: string }>
  updatePortConfig: (deviceId: string, portId: string, updates: Partial<BrowserPort>) => void
  connectPorts: (fromDeviceId: string, fromPortId: string, toDeviceId: string, toPortId: string, cableType: string) => boolean
}

interface BrowserNetworkStore { getState: () => BrowserNetworkState }
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

test('Cyber Observer is a fixed two-NIC appliance managed from a PC browser with live findings', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })

  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'Security', exact: true }).click()
  await page.getByRole('button', { name: 'Place CyberObserver', exact: true }).click()
  await page.getByLabel(/Place CyberObserver on workspace/i).click({ position: { x: 340, y: 270 } })
  await page.getByRole('button', { name: 'End Devices', exact: true }).click()
  await page.getByRole('button', { name: 'Place PC-PT', exact: true }).click()
  await page.getByLabel(/Place PC-PT on workspace/i).click({ position: { x: 760, y: 300 } })

  const lab = await page.evaluate(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    const state = store?.getState()
    if (!state) throw new Error('Network store unavailable')
    const observer = state.devices.find(device => device.model === 'CyberObserver')
    const pc = state.devices.find(device => device.model === 'PC-PT' && device.id !== observer?.id)
    if (!observer || !pc) throw new Error('Placed devices unavailable')
    state.updatePortConfig(observer.id, observer.ports[0].id, { ipAddress: '192.168.10.2', subnetMask: '255.255.255.0', adminStatus: 'up' })
    state.updatePortConfig(pc.id, pc.ports[0].id, { ipAddress: '192.168.10.10', subnetMask: '255.255.255.0', adminStatus: 'up' })
    const connected = state.connectPorts(observer.id, observer.ports[0].id, pc.id, pc.ports[0].id, 'straight')
    return {
      connected,
      observerId: observer.id,
      observerName: observer.name,
      observerPorts: observer.ports.map(port => ({ id: port.id, name: port.name, moduleSlot: port.moduleSlot })),
      observerModules: observer.modules ?? [],
      pcId: pc.id,
      pcName: pc.name,
    }
  })

  expect(lab.connected).toBe(true)
  expect(lab.observerPorts.map(port => port.name)).toEqual(['GigabitEthernet0', 'GigabitEthernet1'])
  expect(lab.observerPorts.every(port => port.moduleSlot === undefined)).toBe(true)
  expect(lab.observerModules).toEqual([])

  const openObserver = page.getByRole('button', { name: new RegExp(`Open ${lab.observerName}`, 'i') })
  await expect(openObserver).toBeVisible()
  await openObserver.dblclick()
  const observerWindow = page.locator('.pt-device-window').filter({ hasText: lab.observerName })
  await expect(observerWindow).toBeVisible()
  await expect(observerWindow.getByRole('tab', { name: 'Physical', exact: true })).toBeVisible()
  await expect(observerWindow.getByRole('tab', { name: 'Config', exact: true })).toBeVisible()
  await expect(observerWindow.getByRole('tab', { name: 'Attributes', exact: true })).toBeVisible()
  await expect(observerWindow.getByRole('tab', { name: 'Desktop', exact: true })).toHaveCount(0)
  await expect(observerWindow.getByRole('tab', { name: 'CLI', exact: true })).toHaveCount(0)
  await expect(observerWindow.getByRole('tab', { name: 'ASDM', exact: true })).toHaveCount(0)
  await observerWindow.getByRole('tab', { name: 'Physical', exact: true }).click()
  await expect(observerWindow.locator('.hw-rack-cyberobserver')).toBeVisible()
  await expect(observerWindow.locator('.hw-cyber-face')).toBeVisible()
  await expect(observerWindow.getByRole('button', { name: /GigabitEthernet0:/ })).toBeVisible()
  await expect(observerWindow.getByRole('button', { name: /GigabitEthernet1:/ })).toBeVisible()
  await expect(observerWindow.locator('.hw-controller-drives i')).toHaveCount(0)
  await expect(observerWindow.locator('.hw-bay')).toHaveCount(0)

  await observerWindow.getByRole('tab', { name: 'Config', exact: true }).click()
  await expect(observerWindow.getByText('Management URL')).toBeVisible()
  await expect(observerWindow.getByText('http://192.168.10.2')).toBeVisible()
  await expect(observerWindow.getByText('Not configured')).toBeVisible()
  await expect(observerWindow.getByText('NVRAM')).toHaveCount(0)
  await expect(observerWindow.getByText('Running Config')).toHaveCount(0)
  await expect(observerWindow.getByText('Equivalent IOS Commands')).toHaveCount(0)
  await observerWindow.getByRole('button', { name: `Close ${lab.observerName}` }).click()

  const openPc = page.getByRole('button', { name: new RegExp(`Open ${lab.pcName}`, 'i') })
  await expect(openPc).toBeVisible()
  await openPc.dblclick()
  const pcWindow = page.locator('.pt-device-window').filter({ hasText: lab.pcName })
  await expect(pcWindow).toBeVisible()
  await pcWindow.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await pcWindow.getByRole('button', { name: 'Web Browser', exact: true }).click()
  const url = pcWindow.getByPlaceholder('http://wirex.test or http://192.168.1.100')
  await url.fill('http://192.168.10.2')
  await pcWindow.getByRole('button', { name: 'Go', exact: true }).click()

  await expect(page.getByTestId('co-auth')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('co-username').fill('admin')
  await page.getByTestId('co-password').fill('cisco')
  await page.getByTestId('co-confirm-password').fill('cisco')
  await page.getByTestId('co-auth-submit').click()
  await expect(page.getByTestId('co-tab-dashboard')).toBeVisible()
  await expect(page.getByText('Account created. You are signed in.')).toBeVisible()

  await page.getByTestId('co-tab-discovery').click()
  await expect(page.getByTestId('co-run-discovery')).toBeVisible()
  await page.getByTestId('co-run-discovery').click()
  await expect(page.getByTestId('co-notice')).toContainText('Discovery completed.')
  await expect(page.getByTestId('co-discovery-row')).toHaveCount(1)

  await page.getByTestId('co-tab-inventory').click()
  await expect(page.getByTestId('co-inventory-row')).toHaveCount(2)
  await expect(page.getByTestId('co-inventory-row').filter({ hasText: lab.pcName })).toContainText('192.168.10.10')
  await expect(page.getByTestId('co-inventory-row').filter({ hasText: lab.observerName })).toContainText('192.168.10.2')
  await expect(page.getByTestId('co-device-details')).toBeVisible()

  await page.getByTestId('co-tab-findings').click()
  await expect(page.getByTestId('co-finding-row')).toHaveCount(2)
  await expect(page.getByTestId('co-finding-row').filter({ hasText: 'Default administrator password' })).toBeVisible()
  await expect(page.getByTestId('co-finding-row').filter({ hasText: 'Management console uses HTTP' })).toBeVisible()

  await page.getByTestId('co-tab-topology').click()
  await expect(page.getByTestId('co-topology')).toBeVisible()
  await expect(page.getByTestId('co-topology')).toContainText(lab.observerName)
  await expect(page.getByTestId('co-topology')).toContainText(lab.pcName)
  await expect(page.getByTestId('co-topology-legend')).toContainText('No findings')

  await page.getByTestId('co-tab-discovery').click()
  await page.getByTestId('co-discovery-mode').selectOption('range')
  await page.getByTestId('co-range-start').fill('192.168.10.20')
  await page.getByTestId('co-range-end').fill('192.168.10.1')
  await page.getByTestId('co-run-discovery').click()
  await expect(page.getByTestId('co-notice')).toContainText('Enter a valid IPv4 range.')
  await expect(page.getByTestId('co-discovery-row')).toHaveCount(2)
  const failedDiscovery = page.getByTestId('co-discovery-row').filter({ hasText: 'Failed' })
  await expect(failedDiscovery).toContainText('Enter a valid IPv4 range.')
  await page.getByTestId('co-discovery-row').filter({ hasText: 'Completed' }).getByRole('button', { name: 'View' }).click()
  await page.getByTestId('co-tab-dashboard').click()
  await expect(page.getByTestId('co-stat-devices')).toContainText('2')

  await page.getByTestId('co-sign-out').click()
  await expect(page.getByTestId('co-auth')).toBeVisible()
  await page.getByTestId('co-username').fill('admin')
  await page.getByTestId('co-password').fill('cisco')
  await page.getByTestId('co-auth-submit').click()
  await expect(page.getByTestId('co-tab-dashboard')).toBeVisible()
  await expect(page.getByTestId('co-stat-devices')).toContainText('2')
  await expect(page.getByTestId('co-stat-findings')).toContainText('2')

  const stored = await page.evaluate(({ observerId }) => {
    const state = (window as unknown as BrowserWindow).__wireforgeNetworkStore?.getState()
    const observer = state?.devices.find(device => device.id === observerId)
    return {
      accounts: observer?.config.cyberObserver?.accounts ?? [],
      discoveries: observer?.config.cyberObserver?.discoveries ?? [],
      lastDiscoveryId: observer?.config.cyberObserver?.lastDiscoveryId,
      portCount: observer?.ports.length,
      modules: observer?.modules ?? [],
    }
  }, { observerId: lab.observerId })
  expect(stored.accounts.map(account => account.username)).toEqual(['admin'])
  expect(stored.accounts[0].passwordHash).not.toContain('cisco')
  expect(stored.portCount).toBe(2)
  expect(stored.modules).toEqual([])
  expect(stored.discoveries).toHaveLength(2)
  const completed = stored.discoveries.find(discovery => discovery.status === 'complete')
  const failed = stored.discoveries.find(discovery => discovery.status === 'failed')
  expect(completed?.deviceIds).toEqual([lab.observerId, lab.pcId])
  expect(failed?.reason).toBe('invalid-range')
  expect(stored.lastDiscoveryId).toBe(completed?.id)
  expect(browserErrors).toEqual([])
})
