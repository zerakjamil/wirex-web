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

interface BrowserNetworkController {
  id: string
  name: string
  model: string
  ports: BrowserPort[]
  modules: string[]
  config: {
    networkController?: {
      accounts?: Array<{ username: string; passwordHash: string }>
      discoveries?: Array<{ id: string; status: string; deviceIds: string[] }>
      lastDiscoveryId?: string
    }
  }
}

interface BrowserNetworkState {
  devices: BrowserNetworkController[]
  links: Array<{ status: string; fromDeviceId: string; toDeviceId: string }>
  updatePortConfig: (deviceId: string, portId: string, updates: Partial<BrowserPort>) => void
  connectPorts: (fromDeviceId: string, fromPortId: string, toDeviceId: string, toPortId: string, cableType: string) => boolean
}

interface BrowserNetworkStore { getState: () => BrowserNetworkState }
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

test('Network Controller has two fixed NICs, is managed from a PC browser, and discovers real neighbors', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })

  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'End Devices', exact: true }).click()
  await page.getByRole('button', { name: 'Place NetworkController', exact: true }).click()
  await page.getByLabel(/Place NetworkController on workspace/i).click({ position: { x: 340, y: 270 } })
  await page.getByRole('button', { name: 'Place PC-PT', exact: true }).click()
  await page.getByLabel(/Place PC-PT on workspace/i).click({ position: { x: 760, y: 300 } })

  const lab = await page.evaluate(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    const state = store?.getState()
    if (!state) throw new Error('Network store unavailable')
    const controller = state.devices.find(device => device.model === 'NetworkController')
    const pc = state.devices.find(device => device.model === 'PC-PT' && device.id !== controller?.id)
    if (!controller || !pc) throw new Error('Placed devices unavailable')
    state.updatePortConfig(controller.id, controller.ports[0].id, { ipAddress: '192.168.10.2', subnetMask: '255.255.255.0', adminStatus: 'up' })
    state.updatePortConfig(pc.id, pc.ports[0].id, { ipAddress: '192.168.10.10', subnetMask: '255.255.255.0', adminStatus: 'up' })
    const connected = state.connectPorts(controller.id, controller.ports[0].id, pc.id, pc.ports[0].id, 'straight')
    return {
      connected,
      controllerId: controller.id,
      controllerName: controller.name,
      controllerPorts: controller.ports.map(port => ({ id: port.id, name: port.name, moduleSlot: port.moduleSlot })),
      controllerModules: controller.modules ?? [],
      pcId: pc.id,
      pcName: pc.name,
    }
  })

  expect(lab.connected).toBe(true)
  expect(lab.controllerPorts.map(port => port.name)).toEqual(['GigabitEthernet0', 'GigabitEthernet1'])
  expect(lab.controllerPorts.every(port => port.moduleSlot === undefined)).toBe(true)
  expect(lab.controllerModules).toEqual([])

  const openController = page.getByRole('button', { name: new RegExp(`Open ${lab.controllerName}`, 'i') })
  await expect(openController).toBeVisible()
  await openController.dblclick()
  const controllerWindow = page.locator('.pt-device-window').filter({ hasText: lab.controllerName })
  await expect(controllerWindow).toBeVisible()
  await expect(controllerWindow.getByRole('tab', { name: 'Physical', exact: true })).toBeVisible()
  await expect(controllerWindow.getByRole('tab', { name: 'Config', exact: true })).toBeVisible()
  await expect(controllerWindow.getByRole('tab', { name: 'Attributes', exact: true })).toBeVisible()
  await expect(controllerWindow.getByRole('tab', { name: 'Desktop', exact: true })).toHaveCount(0)
  await expect(controllerWindow.getByRole('tab', { name: 'CLI', exact: true })).toHaveCount(0)
  await controllerWindow.getByRole('tab', { name: 'Physical', exact: true }).click()
  await expect(controllerWindow.locator('.hw-rack-controller')).toBeVisible()
  await expect(controllerWindow.getByRole('button', { name: /GigabitEthernet0:/ })).toBeVisible()
  await expect(controllerWindow.getByRole('button', { name: /GigabitEthernet1:/ })).toBeVisible()
  await expect(controllerWindow.locator('.hw-controller-drives i')).toHaveCount(8)
  await expect(controllerWindow.locator('.hw-bay')).toHaveCount(0)

  await controllerWindow.getByRole('tab', { name: 'Config', exact: true }).click()
  await expect(controllerWindow.getByText('Management URL')).toBeVisible()
  await expect(controllerWindow.getByText('http://192.168.10.2')).toBeVisible()
  await expect(controllerWindow.getByText('Not configured')).toBeVisible()
  await controllerWindow.getByRole('button', { name: `Close ${lab.controllerName}` }).click()

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

  await expect(page.getByTestId('nc-app')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('nc-auth')).toBeVisible()
  await page.getByTestId('nc-username').fill('admin')
  await page.getByTestId('nc-password').fill('classroom')
  await page.getByTestId('nc-confirm-password').fill('classroom')
  await page.getByTestId('nc-auth-submit').click()
  await expect(page.getByTestId('nc-tab-dashboard')).toBeVisible()
  await expect(page.getByText('Administrator account created.')).toBeVisible()

  await page.getByTestId('nc-tab-discovery').click()
  await expect(page.getByTestId('nc-run-discovery')).toBeVisible()
  await page.getByTestId('nc-run-discovery').click()
  await expect(page.getByTestId('nc-tab-inventory')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('nc-inventory-row')).toHaveCount(1)
  await expect(page.getByTestId('nc-inventory-row')).toContainText(lab.pcName)
  await expect(page.getByTestId('nc-inventory-row')).toContainText('192.168.10.10')

  await page.getByTestId('nc-tab-topology').click()
  await expect(page.getByTestId('nc-topology')).toBeVisible()
  await expect(page.getByTestId('nc-topology')).toContainText(lab.pcName)

  await page.getByTestId('nc-sign-out').click()
  await expect(page.getByTestId('nc-auth')).toBeVisible()
  await page.getByTestId('nc-username').fill('admin')
  await page.getByTestId('nc-password').fill('classroom')
  await page.getByTestId('nc-auth-submit').click()
  await expect(page.getByTestId('nc-tab-dashboard')).toBeVisible()
  await expect(page.getByTestId('nc-stat-devices')).toContainText('1')

  const stored = await page.evaluate(({ controllerId }) => {
    const state = (window as unknown as BrowserWindow).__wireforgeNetworkStore?.getState()
    const controller = state?.devices.find(device => device.id === controllerId)
    return {
      accounts: controller?.config.networkController?.accounts ?? [],
      discoveries: controller?.config.networkController?.discoveries ?? [],
      lastDiscoveryId: controller?.config.networkController?.lastDiscoveryId,
      portCount: controller?.ports.length,
      modules: controller?.modules ?? [],
    }
  }, { controllerId: lab.controllerId })
  expect(stored.accounts.map(account => account.username)).toEqual(['admin'])
  expect(stored.accounts[0].passwordHash).not.toContain('classroom')
  expect(stored.portCount).toBe(2)
  expect(stored.modules).toEqual([])
  expect(stored.discoveries).toHaveLength(1)
  expect(stored.discoveries[0].status).toBe('complete')
  expect(stored.discoveries[0].deviceIds).toEqual([lab.pcId])
  expect(stored.lastDiscoveryId).toBe(stored.discoveries[0].id)
  expect(browserErrors).toEqual([])
})
