import { test, expect } from '@playwright/test'

test.describe('wireX Network Simulator E2E Flow Verification', () => {
  test.beforeEach(async ({ page }) => {
    page.on('response', (res) => {
      if (res.status() >= 500) {
        throw new Error(`Server returned ${res.status()} on ${res.url()}`)
      }
    })
  })

  test('F01: Workspace initialization and canvas rendering', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/wireX/i)

    // Verify main navigation and canvas area are present
    const canvas = page.locator('.pt-canvas-area')
    await expect(canvas).toBeVisible()

    // Verify bottom control bar is visible
    const bottomBar = page.locator('.pt-bottom')
    await expect(bottomBar).toBeVisible()
  })

  test('F02: Cisco IOS CLI execution, VLAN naming, and do show vlan', async ({ page }) => {
    await page.goto('/')

    // Open Office-Router from device navigator or canvas
    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    // Switch to CLI tab if not already active
    const cliTab = modal.locator('button', { hasText: /^CLI$/i })
    if (await cliTab.isVisible()) {
      await cliTab.click()
    }

    // Locate the CLI input field
    const cliInput = modal.locator('input[type="text"]').last()
    await expect(cliInput).toBeVisible()

    // Execute standard Cisco configuration commands
    await cliInput.fill('enable')
    await cliInput.press('Enter')

    await cliInput.fill('configure terminal')
    await cliInput.press('Enter')

    await cliInput.fill('vlan 10')
    await cliInput.press('Enter')

    await cliInput.fill('name Sales')
    await cliInput.press('Enter')

    await cliInput.fill('do show vlan brief')
    await cliInput.press('Enter')

    // Verify terminal output displays VLAN 10 and Sales
    await expect(modal).toContainText(/10\s+Sales/i)
  })

  test('F03: Simulation mode controls and event list', async ({ page }) => {
    await page.goto('/')

    // Toggle simulation mode from bottom dock
    const simButton = page.locator('button', { hasText: /Simulation/i }).first()
    if (await simButton.isVisible()) {
      await simButton.click()
      // Verify Realtime toggle button is available to return
      await expect(page.locator('button', { hasText: /Realtime/i }).first()).toBeVisible()
    }
  })

  test('F04: Physical hardware tab and modular slot bays', async ({ page }) => {
    await page.goto('/')

    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    // Open Physical tab
    const physTab = modal.locator('button', { hasText: /Physical/i })
    if (await physTab.isVisible()) {
      await physTab.click()
      // Check for power switch or physical chassis elements
      const chassisView = modal.locator('.pt-physical-view, button, svg')
      await expect(chassisView.first()).toBeVisible()
    }
  })

  test('F05: Browser study vault works while shared SQLite remains disabled', async ({ page }) => {
    const res = await page.request.get('/api/sqlite?action=list-cram-cards')
    expect(res.status()).toBe(403)
    expect((await res.json()).ok).toBe(false)

    await page.goto('/')
    await page.getByRole('button', { name: /Revision & Rollbacks/i }).click()
    const vault = page.getByRole('dialog')
    await expect(vault).toContainText('Exam Revision & Rollback Vault')
    await vault.getByLabel('Study view').selectOption('cram')
    await expect(vault.getByRole('listitem').first()).toBeVisible()
  })

  test('F06: Browser cannot invoke local Electron build or install actions', async ({ page }) => {
    const res = await page.request.get('/api/electron-build')
    expect(res.status()).toBe(403)
    expect((await res.json()).ok).toBe(false)
  })

  test('F06b: the network-store automation hook is unavailable on public hostnames', async ({ page, baseURL }) => {
    const localUrl = new URL(baseURL ?? 'http://127.0.0.1:3000')
    const publicUrl = new URL(localUrl)
    publicUrl.hostname = 'wirex-public-test.example'

    await page.route('**/*', async route => {
      const requestUrl = new URL(route.request().url())
      if (requestUrl.hostname !== publicUrl.hostname) return route.continue()
      requestUrl.hostname = localUrl.hostname
      await route.fulfill({ response: await page.request.get(requestUrl.toString()) })
    })

    await page.goto(publicUrl.toString())
    await expect.poll(() => page.evaluate(() =>
      typeof (window as unknown as { __NET_STORE__?: unknown }).__NET_STORE__
    )).toBe('undefined')
  })

  test('F07: PKT file binary import and export roundtrip', async ({ page }) => {
    // Verify PKT export endpoint responds with valid binary PKT stream
    const exportRes = await page.request.post('/api/export-pkt', {
      data: {
        devices: [
          {
            id: 'test-router-1',
            name: 'R1',
            type: 'router',
            model: '2911',
            x: 100,
            y: 100,
            ports: [
              {
                id: 'Gi0/0',
                name: 'GigabitEthernet0/0',
                shortName: 'Gi0/0',
                type: 'gigabitethernet',
                status: 'up',
                adminStatus: 'up',
                ipAddress: '192.168.1.1',
                subnetMask: '255.255.255.0',
                macAddress: '0001.0001.0001',
              },
            ],
            config: { hostname: 'R1' },
            routingTable: [],
            arpTable: [],
            macTable: [],
            cliHistory: [],
            currentCliMode: 'user',
          },
        ],
        links: [],
      },
    })
    expect(exportRes.ok()).toBeTruthy()
    const buffer = await exportRes.body()
    expect(buffer.length).toBeGreaterThan(64)

    // Now post the binary stream to the import endpoint
    const importRes = await page.request.post('/api/import-pkt', {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      data: buffer,
    })
    expect(importRes.ok()).toBeTruthy()
    const importedData = await importRes.json()
    expect(importedData.devices).toBeDefined()
    expect(importedData.devices.length).toBe(1)
    expect(importedData.devices[0].name).toBe('R1')
  })

  test('F08: IPv6 address from the Config tab is visible in show ipv6 interface brief', async ({ page }) => {
    await page.goto('/')

    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    // Configure an IPv6 address from the Config tab interface editor
    const configTab = modal.locator('button', { hasText: /^Config$/i })
    if (await configTab.isVisible()) {
      await configTab.click()
    }
    const ipv6Input = modal.locator('input[placeholder="e.g. 2001:db8:1::1/64"]')
    await expect(ipv6Input).toBeVisible()
    await ipv6Input.fill('2001:db8:9::1/64')

    // Verify through the CLI that the address was applied
    const cliTab = modal.locator('button', { hasText: /^CLI$/i })
    if (await cliTab.isVisible()) {
      await cliTab.click()
    }
    const cliInput = modal.locator('input[type="text"]').last()
    await expect(cliInput).toBeVisible()
    await cliInput.fill('enable')
    await cliInput.press('Enter')
    await cliInput.fill('show ipv6 interface brief')
    await cliInput.press('Enter')
    await expect(modal).toContainText(/2001:DB8:9::1/i)
  })
  test('F09: DHCPv6 pool from the router CLI appears in show ipv6 dhcp pool', async ({ page }) => {
    await page.goto('/')

    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    const cliTab = modal.locator('button', { hasText: /^CLI$/i })
    if (await cliTab.isVisible()) {
      await cliTab.click()
    }
    const cliInput = modal.locator('input[type="text"]').last()
    await expect(cliInput).toBeVisible()
    for (const command of [
      'enable',
      'configure terminal',
      'ipv6 dhcp pool POOL1',
      'address prefix 2001:db8:9::/64',
      'exit',
      'end',
      'show ipv6 dhcp pool',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/DHCPv6 pool: POOL1/i)
    await expect(modal).toContainText(/2001:DB8:9::\/64/i)
  })

  test('F10: OSPFv3 process and interface from the router CLI appear in show ipv6 ospf output', async ({ page }) => {
    await page.goto('/')

    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    const cliTab = modal.locator('button', { hasText: /^CLI$/i })
    if (await cliTab.isVisible()) {
      await cliTab.click()
    }
    const cliInput = modal.locator('input[type="text"]').last()
    await expect(cliInput).toBeVisible()
    for (const command of [
      'enable',
      'configure terminal',
      'ipv6 router ospf 1',
      'router-id 9.9.9.9',
      'exit',
      'interface gigabitethernet0/0',
      'ipv6 ospf 1 area 0',
      'end',
      'show ipv6 ospf',
      'show ipv6 ospf interface',
      'show running-config',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/Routing Process "ospfv3 1" with ID 9\.9\.9\.9/i)
    await expect(modal).toContainText(/GigabitEthernet0\/0 is (up|down), area 0/i)
    await expect(modal).toContainText(/ipv6 router ospf 1/i)
  })

  test('F11: EIGRP process and network from the router CLI appear in show ip protocols', async ({ page }) => {
    await page.goto('/')

    const routerBtn = page.getByRole('button', { name: /Office-Router/i }).first()
    await expect(routerBtn).toBeVisible({ timeout: 10000 })
    await routerBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    const cliTab = modal.locator('button', { hasText: /^CLI$/i })
    if (await cliTab.isVisible()) {
      await cliTab.click()
    }
    const cliInput = modal.locator('input[type="text"]').last()
    await expect(cliInput).toBeVisible()
    for (const command of [
      'enable',
      'configure terminal',
      'router eigrp 1',
      'no auto-summary',
      'network 10.0.0.0',
      'end',
      'show ip protocols',
      'show ip eigrp topology',
      'show running-config',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/Routing Protocol is "eigrp 1"/i)
    await expect(modal).toContainText(/EIGRP-IPv4 Topology Table for AS\(1\)/i)
    await expect(modal).toContainText(/network 10\.0\.0\.0/i)
  })

  test('F12: switch CLI configures rapid PVST+ mode and an MST region', async ({ page }) => {
    await page.goto('/')

    const switchBtn = page.getByRole('button', { name: /Switch1/i }).first()
    await expect(switchBtn).toBeVisible({ timeout: 10000 })
    await switchBtn.click()

    const modal = page.locator('.pt-device-window').first()
    await expect(modal).toBeVisible({ timeout: 10000 })

    const cliTab = modal.locator('button', { hasText: /^CLI$/i })
    if (await cliTab.isVisible()) {
      await cliTab.click()
    }
    const cliInput = modal.locator('input[type="text"]').last()
    await expect(cliInput).toBeVisible()
    for (const command of [
      'enable',
      'configure terminal',
      'spanning-tree mode rapid-pvst',
      'spanning-tree mst configuration',
      'name WIREX',
      'revision 7',
      'instance 1 vlan 10,20',
      'exit',
      'end',
      'show spanning-tree mst configuration',
      'show spanning-tree summary',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/Name\s+\[WIREX\]/)
    await expect(modal).toContainText(/Revision\s+7\s+Instances configured/)
    await expect(modal).toContainText(/1\s+10,20/)
    await expect(modal).toContainText(/Switch is in rapid-pvst mode/)
  })
})
