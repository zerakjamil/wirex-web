import { test, expect } from '@playwright/test'
import { loadEnterpriseLab } from './start'

test.describe('Packet Tracer config tab parity', () => {
  async function openRouterConfig(page: import('@playwright/test').Page) {
    await loadEnterpriseLab(page)
    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10_000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await modal.locator('button', { hasText: /^Config$/i }).first().click()
    await expect(modal.locator('[data-config-group="GLOBAL"]')).toBeVisible()
    return modal
  }

  async function openDeviceConfig(page: import('@playwright/test').Page, name: RegExp) {
    await loadEnterpriseLab(page)
    const button = page.getByRole('button', { name }).first()
    await expect(button).toBeVisible({ timeout: 10_000 })
    await button.click()
    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10_000 })
    await modal.getByRole('tab', { name: 'Config', exact: true }).click()
    return modal
  }

  test('shows the GLOBAL/ROUTING/INTERFACE tree, settings page and IOS command pane', async ({ page }) => {
    const modal = await openRouterConfig(page)

    await expect(modal.locator('[data-config-group="ROUTING"]')).toBeVisible()
    await expect(modal.locator('[data-config-group="INTERFACE"]')).toBeVisible()
    await expect(modal.locator('[data-config-page="settings"]')).toHaveAttribute('aria-current', 'true')

    const pane = modal.getByRole('region', { name: 'Equivalent IOS Commands' })
    await expect(pane).toBeVisible()
    await expect(pane).toContainText('hostname')

    const hostname = modal.getByLabel('Hostname')
    await expect(hostname).toBeVisible()
    await hostname.fill('Parity-R1')
    await expect(pane).toContainText('hostname Parity-R1')
  })

  test('adds and removes a static route from the ROUTING page', async ({ page }) => {
    const modal = await openRouterConfig(page)
    const pane = modal.getByRole('region', { name: 'Equivalent IOS Commands' })

    await modal.locator('[data-config-page="static-routes"]').click()
    await modal.getByLabel('Network').fill('10.99.0.0')
    await modal.getByLabel('Mask').fill('255.255.255.0')
    await modal.getByLabel('Next Hop').fill('203.0.113.9')
    await modal.getByRole('button', { name: 'Add', exact: true }).click()

    await expect(modal.locator('table')).toContainText('10.99.0.0')
    await expect(pane).toContainText('ip route 10.99.0.0 255.255.255.0 203.0.113.9')

    const newRow = modal.locator('tr', { hasText: '10.99.0.0' })
    await expect(newRow).toHaveCount(1)
    await newRow.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(modal.locator('table')).toHaveCount(0)
    await expect(pane).not.toContainText('ip route 10.99.0.0')
  })

  test('algorithm settings page has no IOS equivalent and edits defaults', async ({ page }) => {
    const modal = await openRouterConfig(page)
    const pane = modal.getByRole('region', { name: 'Equivalent IOS Commands' })

    await modal.locator('[data-config-page="algorithm-settings"]').click()
    await expect(pane).toContainText('No Cisco IOS equivalent')
    const multiplier = modal.getByLabel('Half-Open Session Multiplier')
    await expect(multiplier).toHaveValue('1')
    await modal.getByLabel('Global Settings').uncheck()
    await multiplier.fill('2')
    await expect(multiplier).toHaveValue('2')
  })

  test('attributes tab shows the Packet Tracer hardware properties', async ({ page }) => {
    const modal = await openRouterConfig(page)
    await modal.getByRole('tab', { name: 'Attributes', exact: true }).click()

    const table = modal.locator('table')
    await expect(table).toContainText('MTBF')
    await expect(table).toContainText('400000')
    await expect(table).toContainText('2200')
    await expect(table).toContainText('PT_MODEL')
    await expect(table).toContainText('2911')
    await expect(table).toContainText('PT_VERSION')
    await expect(table).toContainText('15.1(4)M4')
    await expect(modal.getByLabel('Top')).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible()
  })

  test('display name is independent from the IOS hostname', async ({ page }) => {
    const modal = await openRouterConfig(page)
    const title = page.locator('.pt-device-window-title').first()
    const displayName = modal.getByLabel('Display Name')

    await displayName.fill('Core-Router')
    await expect(displayName).toHaveValue('Core-Router')
    await expect(title).toContainText('Core-Router')

    await modal.getByLabel('Hostname').fill('Edge-R1')
    await expect(displayName).toHaveValue('Core-Router')
    await expect(title).toContainText('Core-Router')
    await expect(title).not.toContainText('Edge-R1')

    await displayName.fill('')
    await expect(displayName).toHaveValue('')
    await displayName.blur()
    await expect(displayName).toHaveValue('Edge-R1')
    await expect(title).toContainText('Edge-R1')
  })

  test('PC config has Algorithm Settings but no IOS pane, NVRAM or clock', async ({ page }) => {
    const modal = await openDeviceConfig(page, /PC1/i)

    await expect(modal.getByLabel('Display Name')).toBeVisible()
    await expect(modal.getByLabel('Hostname')).toHaveCount(0)
    await expect(modal.getByText('NVRAM', { exact: true })).toHaveCount(0)
    await expect(modal.getByLabel('Device Clock')).toHaveCount(0)
    await expect(modal.locator('[data-config-page="algorithm-settings"]')).toBeVisible()
    await expect(modal.locator('[data-config-page="settings"]')).toHaveAttribute('aria-current', 'true')
    await expect(modal.getByRole('region', { name: 'Equivalent IOS Commands' })).toHaveCount(0)
    await expect(modal.getByRole('tab', { name: 'Desktop', exact: true })).toBeVisible()
    await expect(modal.getByRole('tab', { name: 'CLI', exact: true })).toHaveCount(0)
    await expect(modal.getByRole('tab', { name: 'Attributes', exact: true })).toBeVisible()
  })

  test('server keeps Services and shows its own hardware attributes', async ({ page }) => {
    const modal = await openDeviceConfig(page, /Web Server/i)
    await expect(modal.getByRole('tab', { name: 'Services', exact: true })).toBeVisible()
    await expect(modal.getByRole('tab', { name: 'Desktop', exact: true })).toBeVisible()
    await modal.getByRole('tab', { name: 'Attributes', exact: true }).click()
    await expect(modal.locator('table')).toContainText('61320')
    await expect(modal.locator('table')).toContainText('Server-PT')
  })

  test('algorithm settings global checkbox disables the local override fields', async ({ page }) => {
    const modal = await openRouterConfig(page)
    await modal.locator('[data-config-page="algorithm-settings"]').click()

    const global = modal.getByLabel('Global Settings')
    const multiplier = modal.getByLabel('Half-Open Session Multiplier')
    await expect(global).toBeChecked()
    await expect(multiplier).toBeDisabled()
    await expect(multiplier).toHaveValue('1')

    await global.uncheck()
    await expect(multiplier).toBeEnabled()
    await multiplier.fill('2')
    await expect(multiplier).toHaveValue('2')

    await global.check()
    await expect(multiplier).toBeDisabled()
    await expect(multiplier).toHaveValue('1')
  })

  test('PC global settings expose Static/DHCP and IPv6 Auto Config', async ({ page }) => {
    const modal = await openDeviceConfig(page, /PC1/i)

    const staticRadio = modal.getByRole('radio', { name: 'Static', exact: true }).first()
    const dhcpRadio = modal.getByRole('radio', { name: 'DHCP', exact: true })
    await expect(staticRadio).toBeChecked()
    await expect(modal.getByLabel('Default Gateway', { exact: true })).toBeEnabled()

    await dhcpRadio.check()
    await expect(dhcpRadio).toBeChecked()
    await expect(modal.getByLabel('Default Gateway', { exact: true })).toBeDisabled()
    await expect(modal.getByLabel('DNS Server', { exact: true })).toBeDisabled()

    await expect(modal.getByRole('radio', { name: 'Auto Config', exact: true })).toBeVisible()
    await staticRadio.check()
    await expect(modal.getByLabel('Default Gateway', { exact: true })).toBeEnabled()
  })

  test('server Services uses the PT service list and edits HTTP plus DHCP', async ({ page }) => {
    const modal = await openDeviceConfig(page, /Web Server/i)
    await modal.getByRole('tab', { name: 'Services', exact: true }).click()

    const services = modal.getByRole('tablist', { name: 'Server services' })
    await expect(services.getByRole('tab', { name: 'HTTP', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(services.getByRole('tab', { name: 'DHCP', exact: true })).toBeVisible()

    const html = modal.getByLabel('HTML Content')
    await expect(html).toBeVisible()
    await html.fill('<h1>Parity</h1>')
    await expect(html).toHaveValue('<h1>Parity</h1>')

    await services.getByRole('tab', { name: 'DHCP', exact: true }).click()
    await modal.getByLabel('Pool Name').fill('PARITY')
    await modal.getByLabel('Starting IP').fill('192.168.77.100')
    await modal.getByLabel('Subnet Mask').fill('255.255.255.0')
    await modal.getByRole('button', { name: 'Add pool', exact: true }).click()

    const poolRow = modal.locator('div', { hasText: 'PARITY' }).filter({ hasText: '192.168.77.100' }).last()
    await expect(poolRow).toBeVisible()
    await expect(poolRow).toContainText('255.255.255.0')
  })

  test('server NTP service enables the master and sets its stratum', async ({ page }) => {
    const modal = await openDeviceConfig(page, /Web Server/i)
    await modal.getByRole('tab', { name: 'Services', exact: true }).click()
    const services = modal.getByRole('tablist', { name: 'Server services' })
    await services.getByRole('tab', { name: 'NTP', exact: true }).click()

    const enable = modal.getByLabel('Enable NTP Master')
    const stratum = modal.getByLabel('Stratum')
    await expect(enable).not.toBeChecked()
    await expect(stratum).toBeDisabled()

    await enable.check()
    await expect(stratum).toBeEnabled()
    await stratum.fill('5')
    await expect(stratum).toHaveValue('5')
  })

  test('server Desktop service tile opens the matching service pane', async ({ page }) => {
    const modal = await openDeviceConfig(page, /Web Server/i)
    await modal.getByRole('tab', { name: 'Desktop', exact: true }).click()
    await modal.locator('[data-desktop-service="dhcp"]').click()

    await expect(modal.getByLabel('Pool Name')).toBeVisible()
    await modal.getByRole('button', { name: 'Back to Desktop', exact: true }).click()
    await expect(modal.locator('[data-desktop-service="http"]')).toBeVisible()
  })

  test('interface page keeps the port status switch working', async ({ page }) => {
    const modal = await openRouterConfig(page)

    const interfacePages = modal.locator('[data-config-group="INTERFACE"] [data-config-page]')
    await expect(interfacePages.first()).toBeVisible()
    await interfacePages.first().click()

    const toggle = modal.getByRole('switch', { name: 'Port Status' })
    const before = await toggle.getAttribute('aria-checked')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true')
  })
})
