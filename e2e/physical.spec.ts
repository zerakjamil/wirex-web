import { test, expect } from '@playwright/test'

interface BrowserNetworkState {
  devices: Array<{ id: string; name: string }>
  physicalContainers: Array<{ id: string; name: string; kind: string; parentId: string | null }>
  physicalAssignment: Record<string, string>
  clusters: Array<{ id: string; name: string; deviceIds: string[] }>
}
interface BrowserNetworkStore { getState: () => BrowserNetworkState }
interface BrowserWorkspaceState {
  canvasSelectionIds: string[]
  activeClusterId: string | null
  undo: () => void
  setCanvasSelection: (ids: string[]) => void
}
interface BrowserWorkspaceStore { getState: () => BrowserWorkspaceState }
interface BrowserWindow {
  __wireforgeNetworkStore?: BrowserNetworkStore
  __wireforgeWorkspaceStore?: BrowserWorkspaceStore
}

const hostPort = (id: string, linkId: string, peerPortId: string, ipAddress: string, macAddress: string) => ({
  id, name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up',
  macAddress, ipAddress, subnetMask: '255.255.255.0', portfast: true,
  connectedLinkId: linkId, connectedDeviceId: 'sw1', connectedPortId: peerPortId,
})

const switchPort = (id: string, name: string, linkId: string, peerPortId: string, macAddress: string) => ({
  id, name, shortName: name.replace('FastEthernet', 'Fa'), type: 'fastethernet', status: 'up', adminStatus: 'up',
  macAddress, portfast: true,
  connectedLinkId: linkId, connectedDeviceId: linkId === 'wire-pc1' ? 'pc1' : 'pc2', connectedPortId: peerPortId,
})

const host = (id: string, name: string, ipAddress: string, macAddress: string, portId: string, linkId: string, peerPortId: string) => ({
  id, name, type: 'pc', model: 'PC-PT', x: id === 'pc1' ? 220 : 780, y: 300, power: true, modules: [], macAddress,
  ports: [hostPort(portId, linkId, peerPortId, ipAddress, macAddress)],
  config: { hostname: name },
  routingTable: [{ network: '192.168.0.0', netmask: '255.255.255.0', nextHop: 'connected', interfaceName: 'FastEthernet0', metric: 0, type: 'C' }],
  arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
})

const lab = Buffer.from(JSON.stringify({
  version: 1,
  fileName: 'Physical workspace browser acceptance',
  devices: [
    host('pc1', 'PC1', '192.168.0.1', '0000.0000.1a02', 'pc1-fa0', 'wire-pc1', 'sw1-fa0/1'),
    {
      id: 'sw1', name: 'SW1', type: 'switch', model: '2960-24TT', x: 500, y: 180, power: true, modules: [], macAddress: '0000.0000.2a01',
      ports: [
        switchPort('sw1-fa0/1', 'FastEthernet0/1', 'wire-pc1', 'pc1-fa0', '0000.0000.2a11'),
        switchPort('sw1-fa0/2', 'FastEthernet0/2', 'wire-pc2', 'pc2-fa0', '0000.0000.2a12'),
      ],
      config: { hostname: 'SW1' },
      routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
    },
    host('pc2', 'PC2', '192.168.0.2', '0000.0000.3a02', 'pc2-fa0', 'wire-pc2', 'sw1-fa0/2'),
  ],
  links: [
    { id: 'wire-pc1', type: 'straight', status: 'up', fromDeviceId: 'pc1', fromPortId: 'pc1-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/1' },
    { id: 'wire-pc2', type: 'straight', status: 'up', fromDeviceId: 'pc2', fromPortId: 'pc2-fa0', toDeviceId: 'sw1', toPortId: 'sw1-fa0/2' },
  ],
  annotations: [],
}), 'utf8').toString('base64')

async function openLab(page: import('@playwright/test').Page, baseURL: string | undefined) {
  await page.goto(`${baseURL}/#lab=${lab}`)
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().devices.length === 3
  })
}

async function enterCloset(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Physical' }).click()
  await page.locator('.pt-container-tile[data-kind="building"]').click()
  await page.locator('.pt-container-tile[data-kind="closet"]').click()
  await expect(page.locator('.pt-physical-rack').first()).toBeVisible()
}

test('physical workspace navigates containers and moves devices between racks and tables', async ({ page, baseURL }) => {
  await openLab(page, baseURL)

  await page.getByRole('tab', { name: 'Physical' }).click()
  await expect(page.locator('.pt-workspace-path')).toContainText('[Root]')
  const building = page.locator('.pt-container-tile[data-kind="building"]')
  await expect(building).toContainText('Corporate Office')
  await expect(building).toContainText('3 devices')
  await expect(page.getByRole('button', { name: 'New Building' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Table' })).toHaveCount(0)

  await building.click()
  await expect(page.locator('.pt-workspace-path')).toContainText('Corporate Office')
  await page.locator('.pt-container-tile[data-kind="closet"]').click()
  await expect(page.locator('.pt-physical-rack input.pt-container-name-input')).toHaveValue('Rack 1')
  await expect(page.locator('.pt-physical-rack .pt-rack-device')).toHaveCount(3)
  await expect(page.locator('.pt-physical-hint')).toContainText('Drag devices between racks and tables')

  await page.getByRole('button', { name: 'New Table' }).click()
  await expect(page.locator('.pt-physical-table input.pt-container-name-input')).toHaveValue('Table 1')

  // Move PC1 onto Table 1 through the Move menu, then drag PC2 across panels.
  await page.locator('.pt-physical-rack .pt-rack-device[data-device-id="pc1"]').getByRole('button', { name: 'Move Device' }).click()
  const menu = page.locator('.pt-device-move-menu')
  await expect(menu).toBeVisible()
  await menu.locator('button[data-target-id]', { hasText: 'Table 1' }).click()
  await expect(page.locator('.pt-physical-table .pt-rack-device[data-device-id="pc1"]')).toBeVisible()
  await expect(page.locator('.pt-physical-rack .pt-rack-device')).toHaveCount(2)

  await page.locator('.pt-physical-rack .pt-rack-device[data-device-id="pc2"]').dragTo(page.locator('.pt-physical-table'))
  await expect(page.locator('.pt-physical-table .pt-rack-device')).toHaveCount(2)
  await expect(page.locator('.pt-physical-rack .pt-rack-device')).toHaveCount(1)

  await page.locator('.pt-physical-table input.pt-container-name-input').fill('Bench')
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().physicalContainers.some(container => container.kind === 'table' && container.name === 'Bench')
  })

  // Back steps one container level at a time, from the closet to the building to the root.
  const back = page.locator('.pt-workspace-header').getByRole('button', { name: 'Back', exact: true })
  await back.click()
  await expect(page.locator('.pt-container-tile[data-kind="closet"]')).toBeVisible()
  await back.click()
  await expect(page.locator('.pt-container-tile[data-kind="building"]')).toBeVisible()
  await expect(back).toBeDisabled()

  // Deleting the table drops its devices back onto the default rack, and Undo restores it.
  await page.locator('.pt-container-tile[data-kind="building"]').click()
  await page.locator('.pt-container-tile[data-kind="closet"]').click()
  await page.locator('.pt-physical-table').getByRole('button', { name: 'Delete Container' }).click()
  await expect(page.locator('.pt-physical-table')).toHaveCount(0)
  await expect(page.locator('.pt-physical-rack .pt-rack-device')).toHaveCount(3)
  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeWorkspaceStore!.getState().undo())
  await expect(page.locator('.pt-physical-table input.pt-container-name-input')).toHaveValue('Bench')
  await expect(page.locator('.pt-physical-table .pt-rack-device')).toHaveCount(2)
})

test('logical clusters group devices, focus the canvas and disband with undo', async ({ page, baseURL }) => {
  await openLab(page, baseURL)

  await page.locator('.react-flow__node[data-id="pc1"]').click()
  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeWorkspaceStore!.getState().setCanvasSelection(['pc1', 'pc2']))
  await expect(page.locator('.react-flow__node-deviceNode.selected')).toHaveCount(2)

  await page.getByRole('button', { name: 'Create New Cluster' }).click()
  const label = page.locator('.pt-cluster-label')
  await expect(label).toHaveText('Cluster 1 (2)')
  await expect(page.locator('.pt-cluster-zone')).toHaveCount(1)

  // Double-clicking the label focuses the canvas on the members only.
  await label.dblclick()
  await expect(page.locator('.pt-workspace-path')).toContainText('[Cluster 1]')
  await expect(page.locator('.pt-cluster-zone')).toHaveCount(0)
  await expect(page.locator('.react-flow__node-deviceNode')).toHaveCount(2)
  await expect(page.locator('.react-flow__node-deviceNode[data-id="sw1"]')).toHaveCount(0)

  await page.locator('.pt-workspace-actions input.pt-header-name-input').fill('Zone A')
  await expect(page.locator('.pt-workspace-path')).toContainText('[Zone A]')

  const back = page.locator('.pt-workspace-header').getByRole('button', { name: 'Back', exact: true })
  await back.click()
  await expect(page.locator('.react-flow__node-deviceNode')).toHaveCount(3)
  await expect(page.locator('.pt-cluster-label')).toHaveText('Zone A (2)')
  await expect(back).toBeDisabled()

  await page.locator('.pt-cluster-label').dblclick()
  await page.getByRole('button', { name: 'Disband Cluster' }).click()
  await expect(page.locator('.pt-cluster-zone')).toHaveCount(0)
  await expect(page.locator('.pt-workspace-path')).not.toContainText('[Zone A]')
  await page.evaluate(() => (window as unknown as BrowserWindow).__wireforgeWorkspaceStore!.getState().undo())
  await expect(page.locator('.pt-cluster-label')).toHaveText('Zone A (2)')
})

test('physical layout survives a browser reload through the autosave', async ({ page, baseURL }) => {
  await openLab(page, baseURL)
  await enterCloset(page)
  await page.getByRole('button', { name: 'New Rack' }).click()
  await expect(page.locator('.pt-physical-rack')).toHaveCount(2)
  await page.locator('.pt-physical-rack').nth(1).locator('input.pt-container-name-input').fill('Bench Rack')
  await expect(page.locator('.pt-physical-rack').nth(1).locator('input.pt-container-name-input')).toHaveValue('Bench Rack')
  await page.waitForTimeout(1200)

  await page.goto(`${baseURL}/`)
  await page.waitForFunction(() => {
    const store = (window as unknown as BrowserWindow).__wireforgeNetworkStore
    return store?.getState().devices.length === 3
  })
  await enterCloset(page)
  await expect(page.locator('.pt-physical-rack')).toHaveCount(2)
  await expect(page.locator('.pt-physical-rack').nth(1).locator('input.pt-container-name-input')).toHaveValue('Bench Rack')
})
