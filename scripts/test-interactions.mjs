import { chromium } from '@playwright/test'

async function testInteractions() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  page.on('console', msg => console.log(`[CONSOLE ${msg.type()}]:`, msg.text()))
  page.on('pageerror', err => console.error('[PAGE ERROR]:', err))

  console.log('Navigating to http://localhost:3000...')
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // 1. Check clicking a device in left navigator list
  console.log('Testing device navigator click...')
  const firstNavDevice = page.locator('.pt-device-list button').first()
  if (await firstNavDevice.count() > 0) {
    const text = await firstNavDevice.innerText()
    console.log('Clicking navigator device:', text)
    await firstNavDevice.click()
    await page.waitForTimeout(500)
  }

  // Check if a modal or window opened
  let openWindows = await page.locator('.pt-device-window').count()
  console.log('Open device windows count:', openWindows)

  // 2. Check clicking the "Simulation" button in bottom bar
  console.log('Testing Simulation mode toggle button...')
  const simBtn = page.locator('button:has-text("Simulation")').first()
  if (await simBtn.count() > 0) {
    console.log('Clicking Simulation button...')
    await simBtn.click()
    await page.waitForTimeout(500)
  }

  const simMode = await page.evaluate(() => window.__NET_STORE__?.getState().simulationMode)
  console.log('Current simulationMode in store:', simMode)

  // Check what changed on screen in simulation mode
  await page.screenshot({ path: 'test_simulation_mode_screen.png' })

  // 3. Check clicking Play/Pause/Step in Simulation mode
  const playBtn = page.locator('.pt-simulation-controls button, button[title*="Play"], button[aria-label*="Play"]')
  console.log('Play button count:', await playBtn.count())

  // 4. Check envelope / PDU tool
  console.log('Testing Envelope PDU tool...')
  const envelopeBtn = page.locator('button[title*="Add Simple PDU"], button[aria-label*="PDU"], button[title*="PDU"]').first()
  if (await envelopeBtn.count() > 0) {
    console.log('Clicking envelope button...')
    await envelopeBtn.click()
    await page.waitForTimeout(500)
  }

  const currentTool = await page.evaluate(() => window.__WORKSPACE_STORE__?.getState().tool)
  console.log('Current workspace tool after envelope click:', currentTool)

  // 5. Check sending a PDU between 2 devices
  const devices = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    return net?.devices.slice(0, 3).map(d => ({ id: d.id, name: d.name, type: d.type }))
  })
  console.log('Available devices:', devices)

  await browser.close()
}

testInteractions().catch(console.error)
