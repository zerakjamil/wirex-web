import { test, expect, type Page } from '@playwright/test'
import { startNewWorkspace } from './start'

function createWirelessClientLab() {
  const apEth = {
    id: 'ap-eth0', name: 'Port 0', shortName: 'Port0', type: 'fastethernet',
    macAddress: '02:00:00:00:0a:00', status: 'down', adminStatus: 'up',
  }
  const apWlan = {
    id: 'ap-wlan0', name: 'Port 1', shortName: 'Port1', type: 'wireless',
    macAddress: '02:00:00:00:0a:01', status: 'up', adminStatus: 'up',
  }
  const tabletWlan = {
    id: 'tablet-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless',
    ipAddress: '192.168.1.20', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:0b:20',
    status: 'up', adminStatus: 'up',
  }
  const phoneWlan = {
    id: 'phone-wlan0', name: 'Wireless0', shortName: 'Wlan0', type: 'wireless',
    ipAddress: '192.168.1.21', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:0c:21',
    status: 'up', adminStatus: 'up',
  }
  const phoneCell = {
    id: 'phone-cell0', name: 'Cellular0', shortName: 'Cell0', type: 'wireless',
    macAddress: '02:00:00:00:0c:22', status: 'down', adminStatus: 'up',
  }
  const ap = {
    id: 'ap', name: 'Access Point1', type: 'wireless', model: 'AccessPoint-PT',
    x: 440, y: 160, power: true, modules: [], ports: [apEth, apWlan],
    config: {
      hostname: 'AccessPoint1',
      wirelessSsid: 'SecureLab',
      wirelessChannel: 6,
      wirelessAuthentication: 'wpa2-psk',
      wirelessPassphrase: 'wireXwifi1',
      wirelessEncryption: 'aes',
      vlans: [{ id: 1, name: 'default' }],
    },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const tablet = {
    id: 'tablet', name: 'Tablet1', type: 'tablet', model: 'Tablet-PT',
    x: 160, y: 340, power: true, modules: [], ports: [tabletWlan],
    config: {
      hostname: 'Tablet1',
      defaultGateway: '192.168.1.1',
      vlans: [{ id: 1, name: 'default' }],
    },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  const phone = {
    id: 'phone', name: 'Smartphone1', type: 'smartphone', model: 'Smartphone-PT',
    x: 680, y: 340, power: true, modules: [], ports: [phoneWlan, phoneCell],
    config: {
      hostname: 'Smartphone1',
      defaultGateway: '192.168.1.1',
      vlans: [{ id: 1, name: 'default' }],
    },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'priv',
  }
  return {
    version: 1,
    fileName: 'Wireless client acceptance',
    devices: [ap, tablet, phone],
    links: [],
    annotations: [],
  }
}

async function openDevice(page: Page, name: string) {
  const existing = page.locator('.pt-device-window').filter({ hasText: name })
  if (await existing.count() > 0) {
    await expect(existing).toBeVisible()
    return existing
  }
  const open = page.getByRole('button', { name: new RegExp(`Open ${name}`, 'i') })
  await expect(open).toBeVisible({ timeout: 15000 })
  await open.dblclick()
  const deviceWindow = page.locator('.pt-device-window').filter({ hasText: name })
  await expect(deviceWindow).toBeVisible()
  return deviceWindow
}

test('tablet and smartphone desktops join a secured access point with the network key', async ({ page, baseURL }) => {
  const browserErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('response', response => {
    if (response.status() >= 500) browserErrors.push(`HTTP ${response.status()}: ${response.url()}`)
  })
  page.on('pageerror', error => browserErrors.push(error.message))

  const lab = Buffer.from(JSON.stringify(createWirelessClientLab()), 'utf8').toString('base64')
  await page.goto(`${baseURL}/#lab=${lab}`)
  await expect(page.getByRole('button', { name: /Open Tablet1/i })).toBeVisible({ timeout: 15000 })

  const tablet = await openDevice(page, 'Tablet1')
  await expect(tablet.getByRole('tab')).toHaveCount(4)
  for (const tab of ['Physical', 'Config', 'Desktop', 'Attributes']) {
    await expect(tablet.getByRole('tab', { name: tab, exact: true })).toBeVisible()
  }
  await tablet.getByRole('tab', { name: 'Desktop', exact: true }).click()
  const tabletWireless = tablet.locator('[data-desktop-app="wireless"]')
  await expect(tabletWireless).toContainText('Wireless')
  await expect(tablet.getByRole('button', { name: 'Command Prompt', exact: true })).toHaveCount(0)
  await expect(tablet.getByRole('button', { name: 'Terminal', exact: true })).toHaveCount(0)
  await tabletWireless.click()
  await expect(tablet.getByText('Wireless Network Connection')).toBeVisible()

  await tablet.getByRole('button', { name: 'Connect (Site Survey)' }).click()
  const tabletKey = tablet.getByLabel('Security key')
  const tabletRow = tablet.locator('tr', { hasText: 'SecureLab' })
  await expect(tabletRow).toContainText('WPA2-PSK')
  await tabletKey.fill('wrongpass')
  await tabletRow.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(tablet.getByRole('alert')).toHaveText('Incorrect wireless security key.')
  await expect(tabletRow.getByRole('button', { name: 'Disconnect', exact: true })).toHaveCount(0)

  await tabletKey.fill('wireXwifi1')
  await tabletRow.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(tabletRow.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible()
  await tablet.getByRole('button', { name: 'Link Information' }).click()
  await expect(tablet.getByText('Connected to Access Point1')).toBeVisible()
  await expect(tablet.getByText('SecureLab')).toBeVisible()
  await expect(tablet.getByText('WPA2-PSK', { exact: true })).toBeVisible()

  await tablet.getByRole('button', { name: 'Close Tablet1' }).click()
  await page.waitForTimeout(1400)
  await page.goto('/')
  const restoredTablet = await openDevice(page, 'Tablet1')
  await restoredTablet.getByRole('tab', { name: 'Desktop', exact: true }).click()
  await restoredTablet.locator('[data-desktop-app="wireless"]').click()
  await restoredTablet.getByRole('button', { name: 'Link Information' }).click()
  await expect(restoredTablet.getByText('Connected to Access Point1')).toBeVisible()
  await restoredTablet.getByRole('button', { name: 'Close Tablet1' }).click()

  const phone = await openDevice(page, 'Smartphone1')
  await expect(phone.getByRole('tab')).toHaveCount(4)
  for (const tab of ['Physical', 'Config', 'Desktop', 'Attributes']) {
    await expect(phone.getByRole('tab', { name: tab, exact: true })).toBeVisible()
  }
  await phone.getByRole('tab', { name: 'Desktop', exact: true }).click()
  const phoneWireless = phone.locator('[data-desktop-app="wireless"]')
  await expect(phoneWireless).toContainText('Wireless')
  await expect(phone.getByRole('button', { name: 'Command Prompt', exact: true })).toHaveCount(0)
  await phoneWireless.click()
  await expect(phone.getByText('Wireless Network Connection')).toBeVisible()
  await phone.getByRole('button', { name: 'Connect (Site Survey)' }).click()
  await phone.getByLabel('Security key').fill('wireXwifi1')
  const phoneRow = phone.locator('tr', { hasText: 'SecureLab' })
  await phoneRow.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(phoneRow.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible()
  await phone.getByRole('button', { name: 'Link Information' }).click()
  await expect(phone.getByText('Connected to Access Point1')).toBeVisible()

  expect(browserErrors).toEqual([])
})


test('the palette ships a Wireless PC with a built-in radio and live site survey', async ({ page }) => {
  await startNewWorkspace(page)

  await page.getByRole('button', { name: 'Wireless Devices', exact: true }).click()
  await page.getByRole('button', { name: 'Place AccessPoint-PT', exact: true }).click()
  const apOverlay = page.getByLabel('Place AccessPoint-PT on workspace')
  await expect(apOverlay).toBeVisible()
  await apOverlay.click({ position: { x: 520, y: 220 } })
  await expect(page.getByRole('button', { name: /Open Wireless0/i })).toBeVisible()

  await page.getByRole('button', { name: 'Miscellaneous', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Miscellaneous', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Network Devices', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Place Wireless PC', exact: true }).click()
  const pcOverlay = page.getByLabel('Place Wireless PC on workspace')
  await expect(pcOverlay).toBeVisible()
  await pcOverlay.click({ position: { x: 240, y: 340 } })

  const pcButton = page.getByRole('button', { name: /Open PC0/i })
  await expect(pcButton).toBeVisible({ timeout: 10000 })
  await pcButton.dblclick()
  const pc = page.locator('.pt-device-window').filter({ hasText: 'PC0' })
  await expect(pc).toBeVisible()

  await pc.getByRole('tab', { name: 'Physical', exact: true }).click()
  await expect(pc.getByText('PC0 · Wireless PC')).toBeVisible()
  await expect(pc.getByRole('button', { name: 'WPC300N', pressed: true })).toBeVisible()
  await expect(pc.getByText('Linksys-WPC300N 2.4GHz Wireless-N Adapter')).toBeVisible()

  await pc.getByRole('tab', { name: 'Desktop', exact: true }).click()
  const wireless = pc.locator('[data-desktop-app="wireless"]')
  await expect(wireless).toContainText('PC Wireless')
  await wireless.click()
  await expect(pc.getByText('Linksys - Cisco Wireless Network Adapter Utility (WPC300N)')).toBeVisible()
  await expect(pc.getByText('Connected to Wireless0')).toBeVisible()
  await expect(pc.getByText('Default')).toBeVisible()
})
