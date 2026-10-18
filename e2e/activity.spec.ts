import { test, expect } from '@playwright/test'

interface BrowserNetworkState {
  devices: Array<Record<string, unknown>>
}
interface BrowserNetworkStore {
  getState: () => BrowserNetworkState
  setState: (partial: unknown) => void
}
interface BrowserWindow { __wireforgeNetworkStore?: BrowserNetworkStore }

const port = (id: string, name: string, shortName: string, extra: Record<string, unknown> = {}) => ({
  id, name, shortName, type: 'fastethernet', status: 'up', adminStatus: 'up',
  macAddress: '0000.0000.0001', portfast: true, ...extra,
})

const lab = Buffer.from(JSON.stringify({
  version: 1,
  fileName: 'Activity acceptance',
  devices: [
    {
      id: 'sw1', name: 'SW1', type: 'switch', model: '2960-24TT', x: 320, y: 150, power: true, modules: [], macAddress: '0000.0000.2a01',
      ports: [
        port('sw1-fa0/1', 'FastEthernet0/1', 'Fa0/1', { vlan: 10, portMode: 'access' }),
        port('sw1-fa0/2', 'FastEthernet0/2', 'Fa0/2', { portMode: 'trunk', allowedVlans: [10, 20], nativeVlan: 99 }),
      ],
      config: { hostname: 'SW1', vlans: [{ id: 10, name: 'Sales' }, { id: 20, name: 'Eng' }] },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'r1', name: 'R1', type: 'router', model: '2911', x: 640, y: 150, power: true, modules: [], macAddress: '0000.0000.3a01',
      ports: [
        port('r1-gi0/0', 'GigabitEthernet0/0', 'Gi0/0', { type: 'gigabitethernet', ipAddress: '10.0.0.1', subnetMask: '255.255.255.0' }),
        port('r1-gi0/1', 'GigabitEthernet0/1', 'Gi0/1', { type: 'gigabitethernet', ipAddress: '10.0.1.1', subnetMask: '255.255.255.252' }),
      ],
      config: { hostname: 'R1', ripNetworks: ['10.0.0.0'], ripVersion: 2 },
      routingTable: [
        { network: '10.0.0.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'GigabitEthernet0/0', metric: 0, type: 'C' },
        { network: '192.168.5.0', netmask: '255.255.255.0', nextHop: '10.0.1.2', interfaceName: 'GigabitEthernet0/1', metric: 1, type: 'S' },
      ],
      arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    {
      id: 'pc1', name: 'PC1', type: 'pc', model: 'PC-PT', x: 200, y: 320, power: true, modules: [], macAddress: '0000.0000.1a01',
      ports: [port('pc1-fa0', 'FastEthernet0', 'Fa0', { ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' })],
      config: { hostname: 'PC1', defaultGateway: '192.168.1.1', dnsServer: '8.8.8.8' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
  ],
  links: [],
  annotations: [],
}), 'utf8').toString('base64')

const openWizard = async (page: import('@playwright/test').Page, viaToolbar = false) => {
  if (viaToolbar) {
    await page.getByRole('button', { name: 'Activity Wizard', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Tools', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Activity Wizard...', exact: true }).click()
  }
  const wizard = page.locator('.pt-activity-wizard')
  await expect(wizard).toBeVisible()
  return wizard
}

const loaded = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (window as unknown as BrowserWindow).__wireforgeNetworkStore?.getState().devices.length === 3)

test('the wizard authors a trial, grades live state, resets, and exit restores the answer', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await loaded(page)

  const wizard = await openWizard(page, true)
  const counter = wizard.locator('.pt-activity-items-header span')
  const total = await wizard.locator('input[type="checkbox"]').count()
  expect(total).toBe(13)
  await expect(counter).toHaveText(`${total} / ${total} selected`)

  await wizard.getByLabel('Activity name').fill('VLAN and Routing Acceptance')
  await wizard.getByLabel('Author').fill('Instructor')
  await wizard.getByLabel('Instructions (one step per line)').fill('Create VLAN 10 and VLAN 20\nSet Fa0/2 as a trunk\nAddress the router interfaces')

  await wizard.locator('.pt-activity-items-header button').click()
  await expect(counter).toHaveText(`0 / ${total} selected`)
  const swSection = wizard.locator('section').filter({ hasText: 'SW1' })
  await swSection.getByRole('button', { name: 'All', exact: true }).click()
  await expect(counter).toHaveText(`4 / ${total} selected`)
  const pcSection = wizard.locator('section').filter({ hasText: 'PC1' })
  await pcSection.getByRole('button', { name: 'All', exact: true }).click()
  await expect(counter).toHaveText(`7 / ${total} selected`)

  await wizard.getByRole('button', { name: 'Start Trial', exact: true }).click()
  await expect(wizard).toHaveCount(0)
  const chip = page.locator('.pt-activity-chip')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('VLAN and Routing Acceptance')

  const cleared = await page.evaluate(() => {
    const devices = (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().devices
    const sw = devices.find(device => device.name === 'SW1') as { config: { vlans?: unknown[] }; ports: Array<Record<string, unknown>> }
    const pc = devices.find(device => device.name === 'PC1') as { ports: Array<Record<string, unknown>>; config: Record<string, unknown> }
    return { vlans: sw.config.vlans?.length ?? 0, trunkMode: sw.ports[1].portMode, pcIp: pc.ports[0].ipAddress ?? null, gateway: pc.config.defaultGateway ?? null }
  })
  expect(cleared.vlans).toBe(0)
  expect(cleared.trunkMode).toBe('access')
  expect(cleared.pcIp).toBeNull()
  expect(cleared.gateway).toBeNull()

  await chip.click()
  const panel = page.locator('.pt-activity-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Set Fa0/2 as a trunk')
  await panel.getByRole('button', { name: 'Check Results', exact: true }).click()
  await expect(panel).toContainText('0 / 7 (0%)')
  await expect(panel.locator('li.is-failed')).toHaveCount(7)

  await page.evaluate(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore!
    const devices = store.getState().devices.map(device => {
      const clone = structuredClone(device)
      if (clone.name === 'SW1') {
        (clone.config as Record<string, unknown>).vlans = [{ id: 10, name: 'Sales' }, { id: 20, name: 'Eng' }]
        const ports = clone.ports as Array<Record<string, unknown>>
        ports[0] = { ...ports[0], vlan: 10, portMode: 'access' }
        ports[1] = { ...ports[1], portMode: 'trunk', allowedVlans: [10, 20], nativeVlan: 99 }
      }
      if (clone.name === 'PC1') {
        const config = clone.config as Record<string, unknown>
        config.defaultGateway = '192.168.1.1'
        config.dnsServer = '8.8.8.8'
        const ports = clone.ports as Array<Record<string, unknown>>
        ports[0] = { ...ports[0], ipAddress: '192.168.1.10', subnetMask: '255.255.255.0' }
      }
      return clone
    })
    store.setState({ devices })
  })
  await panel.getByRole('button', { name: 'Check Results', exact: true }).click()
  await expect(panel).toContainText('7 / 7 (100%)')
  await expect(panel.locator('li.is-successful')).toHaveCount(7)

  await panel.getByRole('button', { name: 'Reset Activity', exact: true }).click()
  await panel.getByRole('button', { name: 'Reset Activity?', exact: true }).click()
  await expect(panel).toContainText('Run Check Results to grade your work.')
  const resetVlans = await page.evaluate(() => {
    const devices = (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().devices
    const sw = devices.find(device => device.name === 'SW1') as { config: { vlans?: unknown[] } }
    return sw.config.vlans?.length ?? 0
  })
  expect(resetVlans).toBe(0)

  await panel.getByRole('button', { name: 'Exit Activity', exact: true }).click()
  await expect(chip).toHaveCount(0)
  const restored = await page.evaluate(() => {
    const devices = (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().devices
    const sw = devices.find(device => device.name === 'SW1') as { config: { vlans?: unknown[] }; ports: Array<Record<string, unknown>> }
    return { vlans: sw.config.vlans?.length ?? 0, trunkMode: sw.ports[1].portMode }
  })
  expect(restored.vlans).toBe(2)
  expect(restored.trunkMode).toBe('trunk')
})

test('activity files download, reload through File > Open Activity, and reject invalid files', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await loaded(page)

  const wizard = await openWizard(page)
  await wizard.getByLabel('Activity name').fill('VLAN and Routing Acceptance')
  const downloadPromise = page.waitForEvent('download')
  await wizard.getByRole('button', { name: 'Save Activity File...', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('vlan-and-routing-acceptance.wxact.json')
  await wizard.locator('footer').getByRole('button', { name: 'Close', exact: true }).click()

  await page.getByRole('button', { name: 'File', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New', exact: true }).click()
  await expect(page.locator('.pt-activity-chip')).toHaveCount(0)

  const path = await download.path()
  await page.setInputFiles('#pt-open-activity', path!)
  const chip = page.locator('.pt-activity-chip')
  await expect(chip).toBeVisible()
  await expect(chip).toContainText('VLAN and Routing Acceptance')
  const vlans = await page.evaluate(() => {
    const devices = (window as unknown as BrowserWindow).__wireforgeNetworkStore!.getState().devices
    const sw = devices.find(device => device.name === 'SW1') as { config: { vlans?: unknown[] } }
    return sw.config.vlans?.length ?? 0
  })
  expect(vlans).toBe(0)

  await page.setInputFiles('#pt-open-activity', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":9}') })
  const alert = page.locator('.pt-activity-error')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('This activity file version is not supported.')
  await alert.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(alert).toHaveCount(0)
  await expect(chip).toBeVisible()

  await chip.click()
  const panel = page.locator('.pt-activity-panel')
  await panel.getByRole('button', { name: 'Check Results', exact: true }).click()
  await expect(panel).toContainText('0 / 13 (0%)')
  await panel.getByRole('button', { name: 'Exit Activity', exact: true }).click()
  await expect(chip).toHaveCount(0)
})
