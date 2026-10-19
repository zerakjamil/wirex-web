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
    const multiplier = modal.getByLabel('Half Open Session Multiplier')
    await expect(multiplier).toHaveValue('1')
    await multiplier.fill('2')
    await expect(multiplier).toHaveValue('2')
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
