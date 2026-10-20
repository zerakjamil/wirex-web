import { test, expect } from '@playwright/test'
import { startNewWorkspace } from './start'

interface BrowserAclRule {
  action: 'permit' | 'deny'
  protocol: string
  sourceIp?: string
  sourceWildcard?: string
  destIp?: string
  destWildcard?: string
  destPort?: number
}
interface BrowserIsa {
  id: string
  name: string
  model: string
  ports: Array<{ name: string; nameif?: string; securityLevel?: number; inboundAcl?: string }>
  config: { accessLists?: Array<{ id: string; type: string; rules: BrowserAclRule[] }> }
}
interface BrowserNetworkState {
  devices: BrowserIsa[]
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState }
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

async function openIsa(page: import('@playwright/test').Page) {
  const open = page.getByRole('button', { name: /Open ISA0/i })
  await expect(open).toBeVisible()
  await open.dblclick()
  const deviceWindow = page.locator('.pt-device-window').filter({ hasText: 'ISA0' })
  await expect(deviceWindow).toBeVisible()
  return deviceWindow
}

test('ISA-3000 exposes real industrial ports and saves an inbound firewall policy as an ACL', async ({ page }) => {
  const browserErrors: string[] = []
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()) })
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`) })

  await startNewWorkspace(page)
  await page.getByRole('button', { name: 'Security', exact: true }).click()
  await page.getByRole('button', { name: 'Place ISA-3000', exact: true }).click()
  const placement = page.getByLabel('Place ISA-3000 on workspace')
  await expect(placement).toBeVisible()
  await placement.click({ position: { x: 360, y: 280 } })

  const deviceWindow = await openIsa(page)
  await expect(deviceWindow.getByRole('tab', { name: 'Physical', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Config', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'CLI', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'Firewall', exact: true })).toBeVisible()
  await expect(deviceWindow.getByRole('tab', { name: 'ASDM', exact: true })).toHaveCount(0)
  await expect(deviceWindow.getByRole('tab', { name: 'Attributes', exact: true })).toBeVisible()

  await deviceWindow.getByRole('tab', { name: 'Physical', exact: true }).click()
  await expect(deviceWindow.locator('.hw-rack-isa')).toBeVisible()
  for (const port of ['GigabitEthernet1/1', 'GigabitEthernet1/2', 'GigabitEthernet1/3', 'GigabitEthernet1/4', 'Management1/1']) {
    await expect(deviceWindow.getByRole('button', { name: new RegExp(`${port}:`) })).toBeVisible()
  }

  await deviceWindow.getByRole('tab', { name: 'Firewall', exact: true }).click()
  await expect(deviceWindow.getByRole('heading', { name: 'ISA Firewall' })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: /Outside1/ })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: /Inside1/ })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: /Outside2/ })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: /Inside2/ })).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: /Management/ })).toHaveCount(0)
  await expect(deviceWindow.getByText('outside1_access_in').first()).toBeVisible()
  await expect(deviceWindow.getByText('Permit all other traffic')).toBeVisible()
  await expect(deviceWindow.getByRole('button', { name: 'Save Config', exact: true })).toBeDisabled()

  await deviceWindow.getByLabel('Host IPv4').fill('10.0.0.5')
  await deviceWindow.getByRole('button', { name: 'Add Rule', exact: true }).click()
  await expect(deviceWindow.getByRole('status')).toContainText('Rule added.')
  await expect(deviceWindow.locator('code').filter({ hasText: 'host 10.0.0.5' })).toBeVisible()
  await expect(deviceWindow.locator('pre')).toContainText('access-list outside1_access_in extended deny ip host 10.0.0.5 any')
  await expect(deviceWindow.locator('pre')).toContainText('access-list outside1_access_in extended permit ip any any')
  await expect(deviceWindow.getByRole('button', { name: 'Save Config', exact: true })).toBeEnabled()

  await deviceWindow.getByRole('button', { name: 'Save Config', exact: true }).click()
  await expect(deviceWindow.getByRole('status')).toContainText('Firewall configuration saved.')
  await expect(deviceWindow.getByRole('button', { name: 'Save Config', exact: true })).toBeDisabled()

  const stored = await page.evaluate(() => {
    const state = (window as unknown as BrowserWindow).__wireforgeNetworkStore?.getState()
    const isa = state?.devices.find(device => device.model === 'ISA-3000')
    const acl = isa?.config.accessLists?.find(candidate => candidate.id === 'outside1_access_in')
    return {
      name: isa?.name,
      ports: isa?.ports.map(port => ({ name: port.name, nameif: port.nameif, securityLevel: port.securityLevel, inboundAcl: port.inboundAcl })),
      acl: acl ? { id: acl.id, type: acl.type, rules: acl.rules } : null,
    }
  })
  expect(stored.name).toBe('ISA0')
  expect(stored.ports).toEqual([
    { name: 'GigabitEthernet1/1', nameif: 'outside1', securityLevel: 0, inboundAcl: 'outside1_access_in' },
    { name: 'GigabitEthernet1/2', nameif: 'inside1', securityLevel: 50, inboundAcl: 'inside1_access_in' },
    { name: 'GigabitEthernet1/3', nameif: 'outside2', securityLevel: 0, inboundAcl: 'outside2_access_in' },
    { name: 'GigabitEthernet1/4', nameif: 'inside2', securityLevel: 100, inboundAcl: 'inside2_access_in' },
    { name: 'Management1/1', nameif: 'management', securityLevel: 100, inboundAcl: undefined },
  ])
  expect(stored.acl?.type).toBe('extended')
  expect(stored.acl?.rules[0]).toMatchObject({
    action: 'deny',
    protocol: 'ip',
    sourceIp: '10.0.0.5',
    sourceWildcard: '0.0.0.0',
    destIp: 'any',
  })
  expect(stored.acl?.rules[1]).toMatchObject({ action: 'permit', protocol: 'ip', sourceIp: 'any', destIp: 'any' })
  expect(browserErrors).toEqual([])
})
