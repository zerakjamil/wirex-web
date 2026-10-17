import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await context.newPage()

  await page.goto('http://localhost:38889', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // 1. Open PC0 (Desktop PC chassis)
  const pc = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    const p = net?.devices.find(d => d.type === 'pc')
    if (p) {
      net.setActiveModal({ type: 'device', deviceId: p.id })
      net.setActiveTab('physical')
      return { id: p.id, name: p.name }
    }
    return null
  })

  if (pc) {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'verified_desktop_pc_physical.png' })
    console.log('Saved verified_desktop_pc_physical.png')
    await page.evaluate((id) => {
      window.__NET_STORE__?.getState().closeDeviceWindow(id)
    }, pc.id)
    await page.waitForTimeout(500)
  }

  // 2. Toggle Dark Mode
  const darkBtn = page.locator('button:has-text("Dark mode")').first()
  if (await darkBtn.isVisible()) {
    await darkBtn.click()
    await page.waitForTimeout(500)
  }

  // 3. Open Switch in Dark Mode
  const sw = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    const s = net?.devices.find(d => d.type === 'switch')
    if (s) {
      net.setActiveModal({ type: 'device', deviceId: s.id })
      net.setActiveTab('physical')
      return { id: s.id, name: s.name }
    }
    return null
  })

  if (sw) {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'verified_switch_dark_mode.png' })
    console.log('Saved verified_switch_dark_mode.png')
  }

  await browser.close()
}

main().catch(console.error)
