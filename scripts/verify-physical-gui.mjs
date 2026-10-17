import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  console.log('Navigating to http://localhost:38889...')
  await page.goto('http://localhost:38889', { waitUntil: 'networkidle' })
  await page.waitForSelector('.pt-app')
  await page.waitForFunction(() => typeof window.__NET_STORE__ !== 'undefined', { timeout: 10000 })

  // 1. Add devices and open Switch Physical View
  const devIds = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    if (!net) return null
    net.resetTopology()
    net.addDevice('switch', 200, 200, '2960-24TT')
    net.addDevice('router', 500, 200, '1941')
    net.addDevice('pc', 800, 200, 'PC-PT')
    const devs = window.__NET_STORE__.getState().devices
    return {
      switchId: devs.find(d => d.type === 'switch')?.id,
      routerId: devs.find(d => d.type === 'router')?.id,
      pcId: devs.find(d => d.type === 'pc')?.id,
    }
  })

  console.log('Device IDs created:', devIds)

  if (devIds?.switchId) {
    // Open Switch Physical View
    await page.evaluate((id) => {
      window.__NET_STORE__.getState().openDeviceWindow(id)
      window.__NET_STORE__.getState().setActiveTab('physical')
    }, devIds.switchId)
    await page.waitForTimeout(1200)

    await page.screenshot({ path: 'verified_switch_physical.png' })
    console.log('Captured verified_switch_physical.png')

    // Click MODE button
    const modeBtn = page.locator('button:has-text("MODE")').first()
    if (await modeBtn.isVisible()) {
      await modeBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'verified_switch_mode_clicked.png' })
      console.log('Captured verified_switch_mode_clicked.png')
    }

    // Close switch window
    await page.locator('button:has-text("✕")').first().click()
    await page.waitForTimeout(600)
  }

  if (devIds?.routerId) {
    // Open Router Physical View
    await page.evaluate((id) => {
      window.__NET_STORE__.getState().openDeviceWindow(id)
      window.__NET_STORE__.getState().setActiveTab('physical')
    }, devIds.routerId)
    await page.waitForTimeout(1200)

    await page.screenshot({ path: 'verified_router_physical.png' })
    console.log('Captured verified_router_physical.png')

    // Close router window
    await page.locator('button:has-text("✕")').first().click()
    await page.waitForTimeout(600)
  }

  if (devIds?.pcId) {
    // Open PC Physical View
    await page.evaluate((id) => {
      window.__NET_STORE__.getState().openDeviceWindow(id)
      window.__NET_STORE__.getState().setActiveTab('physical')
    }, devIds.pcId)
    await page.waitForTimeout(1200)

    await page.screenshot({ path: 'verified_pc_physical.png' })
    console.log('Captured verified_pc_physical.png')

    // Close PC window
    await page.locator('button:has-text("✕")').first().click()
    await page.waitForTimeout(600)
  }

  await browser.close()
  console.log('Verification finished successfully!')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
