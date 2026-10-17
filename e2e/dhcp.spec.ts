import { test, expect } from '@playwright/test'

function makeDhcpLab(poolNetwork: string, reservedHostIp?: string) {
  const client = {
    id: 'student-pc', name: 'Student-PC', type: 'pc', model: 'PC-PT', x: 300, y: 300, power: true, modules: [],
    ports: [{
      id: 'student-eth', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up',
      macAddress: '02:00:00:00:50:01', connectedLinkId: 'client-server', connectedDeviceId: 'dhcp-server', connectedPortId: 'server-eth',
    }],
    config: { hostname: 'Student-PC', vlans: [{ id: 1, name: 'default' }] },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  }
  const server = {
    id: 'dhcp-server', name: 'DHCP-Server', type: 'server', model: 'Server-PT', x: 600, y: 300, power: true, modules: [],
    ports: [{
      id: 'server-eth', name: 'FastEthernet0', shortName: 'Fa0', type: 'fastethernet', status: 'up', adminStatus: 'up',
      ipAddress: '192.168.50.10', subnetMask: '255.255.255.0', macAddress: '02:00:00:00:50:10',
      connectedLinkId: 'client-server', connectedDeviceId: 'student-pc', connectedPortId: 'student-eth',
    }],
    config: {
      hostname: 'DHCP-Server',
      vlans: [{ id: 1, name: 'default' }],
      dhcpPools: [
        ...(reservedHostIp ? [{
          name: 'STUDENT-PC', network: poolNetwork, mask: '255.255.255.0', hostIp: reservedHostIp, hostMask: '255.255.255.0',
          hardwareAddress: '02:00:00:00:50:01', defaultRouter: '192.168.50.1', dnsServer: '192.168.50.53', leaseDurationSeconds: 60,
        }] : []),
        { name: 'STUDENTS', network: poolNetwork, mask: '255.255.255.0', defaultRouter: '192.168.50.1', dnsServer: '192.168.50.53', leaseDurationSeconds: 60 },
      ],
    },
    routingTable: [], arpTable: [], macTable: [], cliHistory: [], currentCliMode: 'user',
  }
  const links = [{
    id: 'client-server', type: 'straight', status: 'up', fromDeviceId: 'student-pc', fromPortId: 'student-eth', toDeviceId: 'dhcp-server', toPortId: 'server-eth',
  }]
  return Buffer.from(JSON.stringify({ version: 1, fileName: 'DHCP desktop acceptance', devices: [client, server], links, annotations: [] }), 'utf8').toString('base64')
}

async function openIpConfiguration(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Student-PC\s+PC-PT/ }).click()
  const window = page.locator('.pt-device-window[aria-label="Student-PC window"]')
  await expect(window).toBeVisible()
  await window.getByRole('button', { name: 'Desktop', exact: true }).click()
  await window.getByRole('button', { name: 'IP Configuration', exact: true }).click()
  return window
}

test('Desktop DHCP obtains and displays a lease only after the simulated ACK', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${makeDhcpLab('192.168.50.0')}`)
  const window = await openIpConfiguration(page)

  await window.getByLabel('DHCP (Auto Request)').check()
  await expect(window.getByRole('status')).toContainText('DHCP lease assigned: 192.168.50.2', { timeout: 30_000 })
  await expect(window.getByPlaceholder('e.g. 192.168.1.10', { exact: true })).toHaveValue('192.168.50.2')
  await expect(window.getByPlaceholder('e.g. 255.255.255.0', { exact: true })).toHaveValue('255.255.255.0')
  await expect(window.getByPlaceholder('e.g. 192.168.1.1', { exact: true })).toHaveValue('192.168.50.1')
  await expect(window.getByPlaceholder('e.g. 192.168.10.11', { exact: true })).toHaveValue('192.168.50.53')
  await expect(window).toContainText('DHCP-Server')
  await expect(window).toContainText('Bound')
})

test('Desktop DHCP renews a bound lease at T1 and retains the assigned address', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${makeDhcpLab('192.168.50.0')}`)
  const window = await openIpConfiguration(page)
  await window.getByLabel('DHCP (Auto Request)').check()
  await expect(window.getByRole('status')).toContainText('DHCP lease assigned: 192.168.50.2', { timeout: 30_000 })

  await page.evaluate(() => {
    const store = (window as unknown as {
      __NET_STORE__?: {
        getState: () => { tickSimulation: () => void }
        setState: (updater: (state: { devices: Array<{ id: string; config: Record<string, unknown> }> }) => unknown) => void
      }
    }).__NET_STORE__
    if (!store) throw new Error('Network simulator store is unavailable')
    const agedAt = Date.now() - 31_000
    store.setState(state => ({ devices: state.devices.map(device => {
      if (device.id !== 'student-pc') return device
      const lease = device.config.dhcpLease as Record<string, unknown> | undefined
      if (!lease) throw new Error('Client lease was not applied')
      return { ...device, config: { ...device.config, dhcpLease: { ...lease, acquiredAtMs: agedAt, lastRequestAtMs: agedAt } } }
    }) }))
    store.getState().tickSimulation()
  })

  await expect(window.getByRole('status')).toContainText('DHCP lease renewed', { timeout: 15_000 })
  await expect(window.getByPlaceholder('e.g. 192.168.1.10', { exact: true })).toHaveValue('192.168.50.2')
  await expect(window).toContainText('Bound')
})

test('Desktop DHCP applies the MAC-matched manual reservation from the server pool', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${makeDhcpLab('192.168.50.0', '192.168.50.42')}`)
  const window = await openIpConfiguration(page)

  await window.getByLabel('DHCP (Auto Request)').check()
  await expect(window.getByRole('status')).toContainText('DHCP lease assigned: 192.168.50.42', { timeout: 30_000 })
  await expect(window.getByPlaceholder('e.g. 192.168.1.10', { exact: true })).toHaveValue('192.168.50.42')
  await expect(window.getByPlaceholder('e.g. 255.255.255.0', { exact: true })).toHaveValue('255.255.255.0')
  await expect(window.getByPlaceholder('e.g. 192.168.1.1', { exact: true })).toHaveValue('192.168.50.1')
  await expect(window.getByPlaceholder('e.g. 192.168.10.11', { exact: true })).toHaveValue('192.168.50.53')
  await expect(window).toContainText('DHCP-Server')
  await expect(window).toContainText('Bound')
})

test('Desktop DHCP shows T2 rebinding, expires the old address, and discovers a fresh lease', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${makeDhcpLab('192.168.50.0')}`)
  const window = await openIpConfiguration(page)
  await window.getByLabel('DHCP (Auto Request)').check()
  await expect(window.getByRole('status')).toContainText('DHCP lease assigned: 192.168.50.2', { timeout: 30_000 })

  await page.evaluate(() => {
    const store = (window as unknown as {
      __NET_STORE__?: {
        getState: () => { tickSimulation: () => void }
        setState: (updater: (state: { devices: Array<{ id: string; power?: boolean; config: Record<string, unknown> }> }) => unknown) => void
      }
    }).__NET_STORE__
    if (!store) throw new Error('Network simulator store is unavailable')
    const agedAt = Date.now() - 53_000
    store.setState(state => ({ devices: state.devices.map(device => {
      if (device.id === 'student-pc') {
        const lease = device.config.dhcpLease as Record<string, unknown> | undefined
        if (!lease) throw new Error('Client lease was not applied')
        return { ...device, config: { ...device.config, dhcpLease: { ...lease, acquiredAtMs: agedAt, lastRequestAtMs: agedAt - 3_000, state: 'renewing' } } }
      }
      if (device.id === 'dhcp-server') return { ...device, config: { ...device.config, dhcpPools: [] } }
      return device
    }) }))
    store.getState().tickSimulation()
  })

  await expect(window.getByRole('status')).toContainText('DHCP lease rebinding', { timeout: 15_000 })
  await expect(window).toContainText('Rebinding')

  await page.evaluate(() => {
    const store = (window as unknown as {
      __NET_STORE__?: {
        getState: () => { tickSimulation: () => void }
        setState: (updater: (state: { devices: Array<{ id: string; power?: boolean; config: Record<string, unknown> }> }) => unknown) => void
      }
    }).__NET_STORE__
    if (!store) throw new Error('Network simulator store is unavailable')
    const expiredAt = Date.now() - 61_000
    store.setState(state => ({ devices: state.devices.map(device => {
      if (device.id === 'student-pc') {
        const lease = device.config.dhcpLease as Record<string, unknown> | undefined
        if (!lease) throw new Error('Client lease disappeared before expiry')
        return { ...device, config: { ...device.config, dhcpLease: { ...lease, acquiredAtMs: expiredAt } } }
      }
      if (device.id === 'dhcp-server') {
        const bindings = device.config.dhcpBindings as Array<Record<string, unknown>> | undefined
        return { ...device, config: { ...device.config, dhcpBindings: bindings?.map(binding => ({ ...binding, acquiredAtMs: expiredAt })) } }
      }
      return device
    }) }))
    store.getState().tickSimulation()
  })

  await expect(window.getByPlaceholder('e.g. 192.168.1.10', { exact: true })).toHaveValue('')
  await expect(window.getByPlaceholder('e.g. 255.255.255.0', { exact: true })).toHaveValue('')
  await expect(window.getByPlaceholder('e.g. 192.168.1.1', { exact: true })).toHaveValue('')
  await expect(window).not.toContainText('Bound')

  await page.evaluate(() => {
    const store = (window as unknown as {
      __NET_STORE__?: {
        getState: () => { tickSimulation: () => void }
        setState: (updater: (state: { devices: Array<{ id: string; power?: boolean; config: Record<string, unknown> }> }) => unknown) => void
      }
    }).__NET_STORE__
    if (!store) throw new Error('Network simulator store is unavailable')
    store.setState(state => ({ devices: state.devices.map(device => device.id === 'dhcp-server'
      ? { ...device, config: { ...device.config, dhcpPools: [{ name: 'STUDENTS', network: '192.168.50.0', mask: '255.255.255.0', defaultRouter: '192.168.50.1', dnsServer: '192.168.50.53', leaseDurationSeconds: 60 }] } }
      : device) }))
  })

  await window.getByLabel('Static').check()
  await window.getByLabel('DHCP (Auto Request)').check()
  await expect(window.getByRole('status')).toContainText('DHCP lease assigned: 192.168.50.2', { timeout: 30_000 })
  await expect(window).toContainText('Bound')
})

test('Desktop DHCP rejects a claimed address and automatically binds the replacement offer', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${makeDhcpLab('192.168.50.0')}`)
  const window = await openIpConfiguration(page)

  await page.evaluate(() => {
    const store = (window as unknown as {
      __NET_STORE__?: { setState: (state: { simulationMode: 'simulation'; simulationPlaying: false }) => void }
    }).__NET_STORE__
    if (!store) throw new Error('Network simulator store is unavailable')
    store.setState({ simulationMode: 'simulation', simulationPlaying: false })
  })
  await window.getByLabel('DHCP (Auto Request)').check()

  const recovery = await page.evaluate(() => {
    type Device = { id: string; ports: Array<{ id: string; ipAddress?: string }>; config: Record<string, unknown> }
    type Transaction = { sourceDeviceId: string; phase: string; status: string; assignedIp?: string; reason?: string }
    const store = (window as unknown as {
      __NET_STORE__?: {
        getState: () => { stepSimulation: () => void; devices: Device[]; dhcpTransactions: Transaction[] }
        setState: (updater: (state: { devices: Device[] }) => unknown) => void
      }
    }).__NET_STORE__
    if (!store) throw new Error('Network simulator store is unavailable')

    let current = store.getState()
    let probe: Transaction | undefined
    for (let tick = 0; tick < 60; tick++) {
      probe = current.dhcpTransactions.find(transaction => transaction.sourceDeviceId === 'student-pc' && transaction.phase === 'probe' && transaction.status === 'pending')
      if (probe) break
      current.stepSimulation()
      current = store.getState()
    }
    if (!probe || probe.assignedIp !== '192.168.50.2') throw new Error(`Expected an ARP probe for .2 before assignment, got ${JSON.stringify(probe)}`)

    store.setState(state => ({ devices: state.devices.map(device => device.id === 'dhcp-server'
      ? { ...device, ports: device.ports.map(port => port.id === 'server-eth' ? { ...port, ipAddress: '192.168.50.2' } : port) }
      : device) }))

    let conflictReason: string | undefined
    let addressStayedUnassigned = false
    let assignedIp: string | undefined
    for (let tick = 0; tick < 120; tick++) {
      current = store.getState()
      const client = current.devices.find(device => device.id === 'student-pc')
      const conflict = current.dhcpTransactions.find(transaction => transaction.sourceDeviceId === 'student-pc' && transaction.status === 'failed' && transaction.reason?.startsWith('DHCP address conflict'))
      if (!conflictReason && conflict) {
        conflictReason = conflict.reason
        addressStayedUnassigned = client?.ports.find(port => port.id === 'student-eth')?.ipAddress === undefined
      }
      const lease = client?.config.dhcpLease as Record<string, unknown> | undefined
      if (conflictReason && lease?.ipAddress === '192.168.50.3') {
        assignedIp = String(lease.ipAddress)
        break
      }
      current.stepSimulation()
    }
    return { conflictReason, addressStayedUnassigned, assignedIp }
  })

  expect(recovery.conflictReason).toContain('DHCP-Server')
  expect(recovery.addressStayedUnassigned).toBe(true)
  expect(recovery.assignedIp).toBe('192.168.50.3')
  await expect(window.getByRole('status')).toContainText('DHCP lease assigned: 192.168.50.3')
  await expect(window.getByPlaceholder('e.g. 192.168.1.10', { exact: true })).toHaveValue('192.168.50.3')
  await expect(page.locator('.pt-status[role="alert"]')).toContainText('DHCP address conflict')
  await expect(page.locator('.pt-status[role="alert"]')).toContainText('DHCP-Server')
  await expect(window).toContainText('Bound')
})

test('Desktop DHCP explains a pool subnet mismatch and leaves the client unconfigured', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/#lab=${makeDhcpLab('192.168.60.0')}`)
  const window = await openIpConfiguration(page)

  await window.getByLabel('DHCP (Auto Request)').check()
  await expect(window.getByRole('status')).toContainText('DHCP exchange failed', { timeout: 30_000 })
  await expect(window.getByRole('status')).toContainText(/Check VLANs, pool network, and relay reachability/)
  await expect(window.getByPlaceholder('e.g. 192.168.1.10', { exact: true })).toHaveValue('')
  await expect(window.getByPlaceholder('e.g. 255.255.255.0', { exact: true })).toHaveValue('')
  await expect(window.getByPlaceholder('e.g. 192.168.1.1', { exact: true })).toHaveValue('')
})
