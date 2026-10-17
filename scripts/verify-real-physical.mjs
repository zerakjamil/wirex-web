import { chromium } from '@playwright/test'
import * as fs from 'fs'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 } })
  const page = await context.newPage()

  console.log('Navigating to http://localhost:38889...')
  await page.goto('http://localhost:38889', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Load Ephones and dn's.pkt via file input
  const pktPath = '/Users/zerakjamil/Downloads/Ephones and dn\'s.pkt'
  if (fs.existsSync(pktPath)) {
    console.log('Uploading PKT file:', pktPath)
    const fileInput = page.locator('input[type="file"]').first()
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(pktPath)
      await page.waitForTimeout(2500)
    }
  }

  // 1. Open Switch
  console.log('Opening Switch Physical View...')
  const switchDevice = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    const sw = net?.devices.find(d => d.type === 'switch')
    if (sw) {
      net.setActiveModal({ type: 'device', deviceId: sw.id })
      net.setActiveTab('physical')
      return { id: sw.id, name: sw.name, model: sw.model }
    }
    return null
  })
  console.log('Switch found:', switchDevice)

  if (switchDevice) {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'verified_switch_physical.png' })
    console.log('Saved verified_switch_physical.png')

    // Click MODE button
    const modeBtn = page.locator('.pt-device-window button:has-text("MODE")').first()
    if (await modeBtn.isVisible()) {
      await modeBtn.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: 'verified_switch_mode_clicked.png' })
      console.log('Saved verified_switch_mode_clicked.png')
    }

    // Close switch window
    await page.evaluate((id) => {
      window.__NET_STORE__?.getState().closeDeviceWindow(id)
    }, switchDevice.id)
    await page.waitForTimeout(600)
  }

  // 2. Open Router
  console.log('Opening Router Physical View...')
  const routerDevice = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    const r = net?.devices.find(d => d.type === 'router')
    if (r) {
      net.setActiveModal({ type: 'device', deviceId: r.id })
      net.setActiveTab('physical')
      return { id: r.id, name: r.name, model: r.model }
    }
    return null
  })
  console.log('Router found:', routerDevice)

  if (routerDevice) {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'verified_router_physical.png' })
    console.log('Saved verified_router_physical.png')

    // Close router window
    await page.evaluate((id) => {
      window.__NET_STORE__?.getState().closeDeviceWindow(id)
    }, routerDevice.id)
    await page.waitForTimeout(600)
  }

  // 3. Open PC
  console.log('Opening PC Physical View...')
  const pcDevice = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    let pc = net?.devices.find(d => d.type === 'pc' || d.type === 'server' || d.type === 'laptop')
    if (pc) {
      net.setActiveModal({ type: 'device', deviceId: pc.id })
      net.setActiveTab('physical')
      return { id: pc.id, name: pc.name, model: pc.model }
    }
    return null
  })
  console.log('PC/Laptop/Server found:', pcDevice)

  if (pcDevice) {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'verified_pc_physical.png' })
    console.log('Saved verified_pc_physical.png')
  }

  await browser.close()
  console.log('All screenshots captured successfully!')
}

main().catch(console.error)
