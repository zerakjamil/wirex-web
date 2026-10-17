import { chromium } from '@playwright/test'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await context.newPage()

  const consoleLogs = []
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    console.log(`[BROWSER CONSOLE ${msg.type()}]:`, msg.text())
  })
  page.on('pageerror', err => {
    console.error('[BROWSER PAGE ERROR]:', err)
  })

  console.log('Navigating to http://localhost:3000...')
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  await page.screenshot({ path: 'diagnose_port3000.png' })
  console.log('Saved diagnose_port3000.png')

  const state = await page.evaluate(() => {
    const net = window.__NET_STORE__?.getState()
    const ws = window.__WORKSPACE_STORE__?.getState()
    const nodes = document.querySelectorAll('.react-flow__node')
    const edges = document.querySelectorAll('.react-flow__edge')
    const viewport = document.querySelector('.react-flow__viewport')
    return {
      devicesCount: net?.devices?.length,
      linksCount: net?.links?.length,
      nodeElementsCount: nodes.length,
      edgeElementsCount: edges.length,
      viewportTransform: viewport?.style?.transform,
      wsView: ws?.view,
      wsTool: ws?.tool,
      simulationMode: net?.simulationMode,
      inFlightPackets: net?.inFlightPackets?.length,
    }
  })
  console.log('Page state evaluation:', JSON.stringify(state, null, 2))

  await browser.close()
}

main().catch(console.error)
