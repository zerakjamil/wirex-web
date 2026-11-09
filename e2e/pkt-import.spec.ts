import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { startNewWorkspace } from './start'

async function openWorkspaceFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const fileMenu = page.getByRole('navigation', { name: 'Application menus' }).getByRole('button', { name: 'File' })
  await fileMenu.click()
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'true')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Open...' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles(file)
}

async function exportWorkspaceFile(page: Page) {
  const fileMenu = page.getByRole('navigation', { name: 'Application menus' }).getByRole('button', { name: 'File' })
  await fileMenu.click()
  await expect(fileMenu).toHaveAttribute('aria-expanded', 'true')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Export as PKT (Universal)...' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('The browser did not provide the exported PKT file.')
  return { name: download.suggestedFilename(), mimeType: 'application/octet-stream', buffer: await readFile(path) }
}

test('opening a PKT imports its device into the visible canvas', async ({ page }) => {
  const exported = await page.request.post('/api/export-pkt', {
    data: {
      devices: [{
        id: 'test-router-1',
        name: 'R1',
        type: 'router',
        model: '2911',
        x: 100,
        y: 100,
        ports: [{
          id: 'Gi0/0',
          name: 'GigabitEthernet0/0',
          shortName: 'Gi0/0',
          type: 'gigabitethernet',
          status: 'up',
          adminStatus: 'up',
          ipAddress: '192.168.1.1',
          subnetMask: '255.255.255.0',
          macAddress: '0001.0001.0001',
        }],
        config: { hostname: 'R1' },
        routingTable: [],
        arpTable: [],
        macTable: [],
        cliHistory: [],
        currentCliMode: 'user',
      }],
      links: [],
    },
  })
  expect(exported.ok()).toBeTruthy()
  const buffer = await exported.body()

  await startNewWorkspace(page)
  await openWorkspaceFile(page, { name: 'roundtrip.pkt', mimeType: 'application/octet-stream', buffer })

  await expect(page.getByRole('heading', { name: /Devices 1/i })).toBeVisible()
  const node = page.locator('.react-flow__node').filter({ hasText: 'R1' })
  await expect(node).toBeVisible()
  await expect(page.locator('.pt-status')).toContainText('Opened roundtrip.pkt: 1 devices, 0 links.')
})

test('a corrupt PKT reports an error and leaves the workspace unchanged', async ({ page }) => {
  await startNewWorkspace(page)
  await openWorkspaceFile(page, { name: 'broken.pkt', mimeType: 'application/octet-stream', buffer: Buffer.from('not a PKT file') })

  await expect(page.getByRole('heading', { name: /Devices 0/i })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(page.locator('.pt-status')).toBeVisible()
  await expect(page.locator('.pt-status')).toContainText(/PKT|file|format|decode|corrupt/i)
})

test('a real student PKT opens its devices and links in the canvas', async ({ page }) => {
  const fixturePath = process.env.WIREX_PKT_FIXTURE
  test.skip(!fixturePath, 'Set WIREX_PKT_FIXTURE to a Packet Tracer sample file.')
  if (!fixturePath) return

  const name = basename(fixturePath)
  const buffer = await readFile(fixturePath)
  await startNewWorkspace(page)
  await openWorkspaceFile(page, { name, mimeType: 'application/octet-stream', buffer })

  const status = page.locator('.pt-status')
  const devices = page.locator('.react-flow__node')
  const links = page.locator('.react-flow__edge')
  await expect(status).toContainText(`Opened ${name}:`)
  const importedDeviceCount = await devices.count()
  const importedLinkCount = await links.count()
  const importedLabels = (await devices.allTextContents()).map((label) => label.trim()).sort()
  expect(importedDeviceCount).toBeGreaterThan(0)
  expect(importedLinkCount).toBeGreaterThan(0)
  await expect(page.getByRole('heading', { name: `Devices ${importedDeviceCount}` })).toBeVisible()
  await expect(status).toContainText(`Opened ${name}: ${importedDeviceCount} devices, ${importedLinkCount} links.`)

  const isPhoneFixture = name.toLowerCase() === "ephones and dn's.pkt"
  if (isPhoneFixture) {
    expect(importedDeviceCount).toBe(8)
    expect(importedLinkCount).toBe(6)
    await expect(devices.filter({ hasText: 'IP Phone0' })).toBeVisible()
    await expect(status).toContainText('Power Distribution Device0: Power Distribution Device is displayed as a placeholder; its behavior is not simulated.')
  }

  const exported = await exportWorkspaceFile(page)
  await openWorkspaceFile(page, exported)
  await expect(page.getByRole('heading', { name: `Devices ${importedDeviceCount}` })).toBeVisible()
  await expect(devices).toHaveCount(importedDeviceCount)
  await expect(links).toHaveCount(importedLinkCount)
  expect((await devices.allTextContents()).map((label) => label.trim()).sort()).toEqual(importedLabels)
  if (isPhoneFixture) await expect(devices.filter({ hasText: 'IP Phone0' })).toBeVisible()
})
