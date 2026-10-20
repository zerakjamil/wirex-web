import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

test('the generic wired end device exposes a real GUI and lockable HTML surface', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`)
  })

  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'End Devices', exact: true }).click()
  await page.getByRole('button', { name: 'Place WiredEndDevice-PT', exact: true }).click()
  const placement = page.getByLabel('Place WiredEndDevice-PT on workspace')
  await expect(placement).toBeVisible()
  await placement.click({ position: { x: 340, y: 280 } })

  const open = page.getByRole('button', { name: /Open WiredEndDevice0/i })
  await expect(open).toBeVisible()
  await open.dblclick()
  const deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'WiredEndDevice0' })
  await expect(deviceWindow).toBeVisible()

  await expect(deviceWindow.getByRole('tab', { name: 'Physical', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Config', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'GUI', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'HTML', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Attributes', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Desktop', exact: true })).toHaveCount(0)

  await deviceWindow.getByRole('tab', { name: 'GUI', exact: true }).click()
  await expect(deviceWindow.getByRole('tab', { name: 'IP Configuration', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Traffic Generator', exact: true })).toBeVisible()
  await expect(deviceWindow.getByText('FastEthernet0', { exact: false }).first()).toBeVisible()

  await deviceWindow.getByLabel('IPv4 Address', { exact: true }).fill('192.168.10.20')
  await deviceWindow.getByLabel('Subnet Mask', { exact: true }).fill('255.255.255.0')
  await expect(deviceWindow.getByLabel('IPv4 Address', { exact: true })).toHaveValue('192.168.10.20')

  await deviceWindow.getByRole('tab', { name: 'Traffic Generator', exact: true }).click()
  await expect(deviceWindow.getByText('Traffic Generator', { exact: true }).first()).toBeVisible()
  await deviceWindow.getByRole('button', { name: 'Back to GUI', exact: true }).click()
  await expect(deviceWindow.getByRole('tab', { name: 'IP Configuration', exact: true })).toBeVisible()

  await deviceWindow.getByRole('tab', { name: 'HTML', exact: true }).click()
  await deviceWindow.getByRole('textbox', { name: 'HTML', exact: true }).fill('<!doctype html><html><body><h1>Custom end-device GUI</h1></body></html>')
  await deviceWindow.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(deviceWindow.getByRole('status').filter({ hasText: 'HTML applied.' })).toBeVisible()

  await deviceWindow.getByRole('tab', { name: 'GUI', exact: true }).click()
  await expect(deviceWindow.frameLocator('iframe[title="WiredEndDevice0 custom GUI"]').getByText('Custom end-device GUI')).toBeVisible()
  await deviceWindow.getByRole('button', { name: 'Built-in GUI', exact: true }).click()
  await expect(deviceWindow.getByRole('tab', { name: 'IP Configuration', exact: true })).toBeVisible()
  await deviceWindow.getByRole('button', { name: 'Custom HTML', exact: true }).click()
  await expect(deviceWindow.frameLocator('iframe[title="WiredEndDevice0 custom GUI"]').getByText('Custom end-device GUI')).toBeVisible()

  await deviceWindow.getByRole('tab', { name: 'HTML', exact: true }).click()
  await deviceWindow.getByLabel('Password', { exact: true }).fill('secret')
  await deviceWindow.getByRole('button', { name: 'Lock HTML', exact: true }).click()
  await expect(deviceWindow.getByText('HTML is locked.', { exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('textbox', { name: 'HTML', exact: true })).not.toBeEditable()

  await deviceWindow.getByLabel('Password', { exact: true }).fill('wrong')
  await deviceWindow.getByRole('button', { name: 'Unlock HTML', exact: true }).click()
  await expect(deviceWindow.getByRole('status').filter({ hasText: 'Incorrect password.' })).toBeVisible()

  await deviceWindow.getByLabel('Password', { exact: true }).fill('secret')
  await deviceWindow.getByRole('button', { name: 'Unlock HTML', exact: true }).click()
  await expect(deviceWindow.getByRole('textbox', { name: 'HTML', exact: true })).toBeEditable()
  await deviceWindow.getByRole('button', { name: 'Remove lock', exact: true }).click()
  await expect(deviceWindow.getByRole('status').filter({ hasText: 'HTML lock removed.' })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: 'Lock HTML', exact: true })).toBeVisible()

  expect(browserErrors).toEqual([])
})
