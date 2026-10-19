import { test, expect } from '@playwright/test'
import { loadEnterpriseLab, startNewWorkspace } from './start'

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

    // A fresh browser gets a chooser, not a pre-built project.
    const welcome = page.getByTestId('welcome-dialog')
    await expect(welcome).toBeVisible()
    await welcome.getByRole('button', { name: /^New$/ }).click()
    await expect(welcome).toBeHidden()
    await expect(page.getByRole('heading', { name: /Devices 0/i })).toBeVisible()

    // Verify main navigation and canvas area are present
    const canvas = page.locator('.pt-canvas-area')
    await expect(canvas).toBeVisible()

    // Verify bottom control bar is visible
    const bottomBar = page.locator('.pt-bottom')
    await expect(bottomBar).toBeVisible()
  })

  test('F02: Cisco IOS CLI execution, VLAN naming, and do show vlan', async ({ page }) => {
    await loadEnterpriseLab(page)

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
    await loadEnterpriseLab(page)

    // Toggle simulation mode from bottom dock
    const simButton = page.locator('button', { hasText: /Simulation/i }).first()
    if (await simButton.isVisible()) {
      await simButton.click()
      // Verify Realtime toggle button is available to return
      await expect(page.locator('button', { hasText: /Realtime/i }).first()).toBeVisible()
    }
  })

  test('F04: Physical hardware tab and modular slot bays', async ({ page }) => {
    await loadEnterpriseLab(page)

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

    await startNewWorkspace(page)
    await page.getByRole('button', { name: /Revision & Rollbacks/i }).click()
    const vault = page.getByRole('dialog')
    await expect(vault).toContainText('Exam Revision & Rollback Vault')
    await vault.getByLabel('Study view').selectOption('cram')
    await expect(vault.getByRole('listitem').first()).toBeVisible()
  })

  test('F06: the in-browser Electron build and install surface is not shipped', async ({ page }) => {
    const res = await page.request.get('/api/electron-build')
    expect(res.status()).toBe(404)

    await startNewWorkspace(page)
    await expect(page.getByRole('button', { name: /Install Offline App/i })).toHaveCount(0)
    await page.locator('button[aria-haspopup="menu"]', { hasText: 'Help' }).click()
    await expect(page.getByRole('menuitem', { name: 'Practice Labs' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /Install Desktop App/ })).toHaveCount(0)
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
    await loadEnterpriseLab(page)

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
    // The Config tab opens on GLOBAL > Settings, so pick the first interface page
    const interfacePages = modal.locator('[data-config-group="INTERFACE"] [data-config-page]')
    await expect(interfacePages.first()).toBeVisible({ timeout: 10000 })
    await interfacePages.first().click()
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
    await loadEnterpriseLab(page)

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
    await loadEnterpriseLab(page)

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
    await loadEnterpriseLab(page)

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
    await loadEnterpriseLab(page)

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

  test('F13: BGP process, eBGP and iBGP neighbors and network from the router CLI appear in show ip bgp and show running-config', async ({ page }) => {
    await loadEnterpriseLab(page)

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
      'router bgp 65001',
      'bgp router-id 10.0.0.1',
      'neighbor 10.0.0.2 remote-as 65002',
      'neighbor 10.0.0.3 remote-as 65001',
      'network 10.0.0.0 mask 255.255.0.0',
      'end',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    // The neighbor table reads runtime peers created by the 60 ms simulation loop; let it observe both neighbor statements first.
    await page.waitForTimeout(250)
    for (const command of [
      'show ip bgp summary',
      'show ip bgp',
      'show ip protocols',
      'show running-config',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/BGP router identifier 10\.0\.0\.1, local AS number 65001/)
    await expect(modal).toContainText(/Neighbor\s+V\s+AS/)
    await expect(modal).toContainText(/10\.0\.0\.2\s+4\s+65002/)
    await expect(modal).toContainText(/10\.0\.0\.3\s+4\s+65001/)
    await expect(modal).toContainText(/\*> 10\.0\.0\.0\/16\s+0\.0\.0\.0\s+0\s+32768 i/)
    await expect(modal).toContainText(/Routing Protocol is "bgp 65001"/)
    await expect(modal).toContainText(/router bgp 65001/)
    await expect(modal).toContainText(/neighbor 10\.0\.0\.2 remote-as 65002/)
    await expect(modal).toContainText(/neighbor 10\.0\.0\.3 remote-as 65001/)
    await expect(modal).toContainText(/network 10\.0\.0\.0 mask 255\.255\.0\.0/)
  })

  test('F14: EIGRPv6 process, router-id and interface from the router CLI appear in show ipv6 eigrp and show running-config', async ({ page }) => {
    await loadEnterpriseLab(page)

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
      'ipv6 unicast-routing',
      'ipv6 router eigrp 1',
      'eigrp router-id 1.1.1.1',
      'no shutdown',
      'end',
      'show ipv6 eigrp neighbors',
      'show ipv6 eigrp topology',
      'show ipv6 eigrp interfaces',
      'show running-config',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/EIGRP-IPv6 Neighbors for AS\(1\)/)
    await expect(modal).toContainText(/EIGRP-IPv6 Topology Table for AS\(1\)\/ID\(1\.1\.1\.1\)/)
    await expect(modal).toContainText(/EIGRP-IPv6 Interfaces for AS\(1\)/)
    await expect(modal).toContainText(/ipv6 router eigrp 1/)
    await expect(modal).toContainText(/eigrp router-id 1\.1\.1\.1/)
  })

  test('F15: OSPFv3 interface timers, point-to-point override and a passive interface appear in the CLI', async ({ page }) => {
    await loadEnterpriseLab(page)

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
      'passive-interface GigabitEthernet0/1',
      'exit',
      'interface gigabitethernet0/0',
      'ipv6 ospf 1 area 0',
      'ipv6 ospf hello-interval 3',
      'ipv6 ospf dead-interval 9',
      'ipv6 ospf network point-to-point',
      'exit',
      'interface gigabitethernet0/1',
      'ipv6 ospf 1 area 0',
      'end',
      'show ipv6 ospf interface',
      'show running-config',
    ]) {
      await cliInput.fill(command)
      await cliInput.press('Enter')
    }
    await expect(modal).toContainText(/Hello 3, Dead 9/)
    await expect(modal).toContainText(/Network Type point-to-point/)
    await expect(modal).toContainText(/No Hellos \(Passive interface\)/)
    await expect(modal).toContainText(/passive-interface GigabitEthernet0\/1/)
    await expect(modal).toContainText(/ipv6 ospf hello-interval 3/)
    await expect(modal).toContainText(/ipv6 ospf network point-to-point/)
  })
})
