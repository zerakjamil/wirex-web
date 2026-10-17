import { expect, test } from '@playwright/test'

test('eight cold-cache campus pings complete through realtime browser simulation', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page.locator('.pt-canvas-area')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    typeof (window as unknown as { __NET_STORE__?: unknown }).__NET_STORE__
  )).toBe('function')

  const requestIds = await page.evaluate(async () => {
    type Port = { id: string; status: string; adminStatus: string; connectedLinkId?: string; connectedDeviceId?: string; connectedPortId?: string; ipAddress?: string; subnetMask?: string; [key: string]: unknown }
    type Device = {
      id: string; name: string; type: string; model: string; x: number; y: number; macAddress: string
      ports: Port[]; config: Record<string, unknown>; [key: string]: unknown
    }
    type Link = { id: string; type: string; status: string; fromDeviceId: string; fromPortId: string; toDeviceId: string; toPortId: string }
    type PingResult = { id: string; sourceDeviceId: string; targetIp: string; status: 'pending' | 'successful' | 'failed'; reason?: string }
    type State = {
      devices: Device[]; links: Link[]; inFlightPackets: unknown[]; pingResults: PingResult[]; simulationTick: number
      simulationWarning: string | null; stepSimulation: () => void; sendPing: (sourceDeviceId: string, targetIp: string) => string | null; tickSimulation: () => void
    }
    type Store = { getState: () => State; setState: (state: Partial<State> & Record<string, unknown>) => void; subscribe: (listener: (state: State, previous: State) => void) => () => void }
    const store = (window as unknown as { __NET_STORE__?: Store }).__NET_STORE__
    if (!store) throw new Error('Loopback network store is unavailable')
    const initial = store.getState()
    const pcTemplate = initial.devices.find(device => device.type === 'pc')
    const switchTemplate = initial.devices.find(device => device.type === 'switch')
    if (!pcTemplate || !switchTemplate || switchTemplate.ports.length < 26) throw new Error('Starter devices lack the campus port inventory')

    const clone = (template: Device, id: string, index: number): Device => {
      const name = `Load-${id}`
      const deviceMac = `02:00:00:${(index >>> 16 & 255).toString(16).padStart(2, '0')}:${(index >>> 8 & 255).toString(16).padStart(2, '0')}:${(index & 255).toString(16).padStart(2, '0')}`
      return {
        ...template,
        id,
        name,
        macAddress: deviceMac,
        x: 180 + (index % 24) * 54,
        y: 180 + Math.floor(index / 24) * 52,
        ports: template.ports.map((port, portIndex) => ({
          ...port,
          id: `${id}-port-${portIndex}`,
          macAddress: portIndex === 0 ? deviceMac : `02:00:01:${((index * 32 + portIndex) >>> 16 & 255).toString(16).padStart(2, '0')}:${((index * 32 + portIndex) >>> 8 & 255).toString(16).padStart(2, '0')}:${((index * 32 + portIndex) & 255).toString(16).padStart(2, '0')}`,
          status: 'up',
          adminStatus: 'up',
          connectedLinkId: undefined,
          connectedDeviceId: undefined,
          connectedPortId: undefined,
          ipAddress: undefined,
          subnetMask: undefined,
        })),
        config: { ...template.config, hostname: name, defaultGateway: '' },
        routingTable: [],
        arpTable: [],
        macTable: [],
        cliHistory: [],
      }
    }

    const core = clone(switchTemplate, 'load-core', 1000)
    const accessSwitches = Array.from({ length: 12 }, (_, index) => clone(switchTemplate, `load-access-${index}`, 1100 + index))
    const hosts = Array.from({ length: 288 }, (_, index) => {
      const address = index + 1
      const ipAddress = `10.0.${Math.floor((address - 1) / 254)}.${((address - 1) % 254) + 1}`
      const host = clone(pcTemplate, `load-host-${address}`, 2000 + address)
      host.ports[0].ipAddress = ipAddress
      host.ports[0].subnetMask = '255.255.0.0'
      return host
    })
    const devices = [core, ...accessSwitches, ...hosts]
    const links: Link[] = []
    const connect = (left: Device, leftIndex: number, right: Device, rightIndex: number) => {
      const leftPort = left.ports[leftIndex]
      const rightPort = right.ports[rightIndex]
      if (!leftPort || !rightPort) throw new Error(`Missing physical port for ${left.name} or ${right.name}`)
      const id = `${left.id}:${leftIndex}-${right.id}:${rightIndex}`
      Object.assign(leftPort, { connectedLinkId: id, connectedDeviceId: right.id, connectedPortId: rightPort.id })
      Object.assign(rightPort, { connectedLinkId: id, connectedDeviceId: left.id, connectedPortId: leftPort.id })
      links.push({ id, type: 'straight', status: 'up', fromDeviceId: left.id, fromPortId: leftPort.id, toDeviceId: right.id, toPortId: rightPort.id })
    }
    for (let accessIndex = 0; accessIndex < accessSwitches.length; accessIndex++) {
      const access = accessSwitches[accessIndex]
      connect(core, accessIndex, access, 24)
      for (let hostIndex = 0; hostIndex < 24; hostIndex++) {
        connect(access, hostIndex, hosts[accessIndex * 24 + hostIndex], 0)
      }
    }

    store.setState({ devices, links, annotations: [], inFlightPackets: [], pingResults: [], simulationTick: 0, simulationWarning: null, simulationMode: 'simulation', simulationPlaying: false })
    for (let tick = 0; tick < 60; tick++) store.getState().stepSimulation()
    if (store.getState().inFlightPackets.length !== 0) throw new Error('Campus did not drain control traffic before the cold-cache pings')

    const targetIp = hosts[287].ports[0].ipAddress
    if (!targetIp) throw new Error('Distant destination is missing its IPv4 address')
    const ids = hosts.slice(0, 8).map(host => store.getState().sendPing(host.id, targetIp))
    if (ids.some(id => !id)) throw new Error(`Could not start all eight campus pings: ${store.getState().simulationWarning ?? 'unknown reason'}`)
    const pingIds = ids as string[]
    const metrics = {
      startedAt: performance.now(),
      peakQueue: store.getState().inFlightPackets.length,
      warnings: [] as string[],
      tickTimes: [] as number[],
      engineTickDurations: [] as number[],
      completedAt: 0,
      observer: undefined as unknown as PerformanceObserver,
      longTasks: [] as number[],
      pingIds,
    }
    metrics.observer = new PerformanceObserver(entries => {
      for (const entry of entries.getEntries()) metrics.longTasks.push(entry.duration)
    })
    metrics.observer.observe({ entryTypes: ['longtask'] })
    ;(window as unknown as { __wirexEngineStress?: typeof metrics }).__wirexEngineStress = metrics
    store.subscribe((state, previous) => {
      metrics.peakQueue = Math.max(metrics.peakQueue, state.inFlightPackets.length)
      if (state.simulationWarning && state.simulationWarning !== previous.simulationWarning) metrics.warnings.push(state.simulationWarning)
      if (state.simulationTick !== previous.simulationTick) metrics.tickTimes.push(performance.now())
      const results = state.pingResults.filter(result => pingIds.includes(result.id))
      if (results.length === pingIds.length && results.every(result => result.status !== 'pending') && state.inFlightPackets.length === 0 && !metrics.completedAt) {
        metrics.completedAt = performance.now()
        metrics.observer.takeRecords().forEach(entry => metrics.longTasks.push(entry.duration))
        metrics.observer.disconnect()
        store.setState({ simulationPlaying: false })
      }
    })
    const tickSimulation = store.getState().tickSimulation
    store.setState({ tickSimulation: () => {
      const started = performance.now()
      tickSimulation()
      metrics.engineTickDurations.push(performance.now() - started)
    } })
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    store.setState({ simulationMode: 'realtime', simulationPlaying: true })
    return pingIds
  })

  expect(requestIds).toHaveLength(8)
  await page.waitForFunction(() => {
    const metrics = (window as unknown as { __wirexEngineStress?: { completedAt: number } }).__wirexEngineStress
    return Boolean(metrics?.completedAt)
  }, undefined, { timeout: 60_000 })

  const result = await page.evaluate(() => {
    const store = (window as unknown as { __NET_STORE__?: { getState: () => { pingResults: Array<{ id: string; sourceDeviceId: string; status: string; reason?: string }>; inFlightPackets: unknown[]; simulationWarning: string | null } } }).__NET_STORE__
    const metrics = (window as unknown as { __wirexEngineStress?: { startedAt: number; completedAt: number; peakQueue: number; warnings: string[]; tickTimes: number[]; engineTickDurations: number[]; longTasks: number[]; pingIds: string[] } }).__wirexEngineStress
    if (!store || !metrics) throw new Error('Real simulation stress results are unavailable')
    const pings = store.getState().pingResults.filter(result => metrics.pingIds.includes(result.id))
    const tickIntervals = metrics.tickTimes.slice(1).map((time, index) => time - metrics.tickTimes[index]).sort((left, right) => left - right)
    const engineTickDurations = [...metrics.engineTickDurations].sort((left, right) => left - right)
    return {
      statuses: pings.map(ping => ping.status),
      failedReasons: pings.filter(ping => ping.status !== 'successful').map(ping => ping.reason ?? 'No failure reason reported'),
      pendingPackets: store.getState().inFlightPackets.length,
      warning: store.getState().simulationWarning,
      warnings: metrics.warnings,
      peakQueue: metrics.peakQueue,
      elapsedMs: metrics.completedAt - metrics.startedAt,
      tickCount: metrics.tickTimes.length,
      p95TickIntervalMs: tickIntervals.length ? tickIntervals[Math.min(tickIntervals.length - 1, Math.floor(tickIntervals.length * 0.95))] : 0,
      engineTickCount: engineTickDurations.length,
      p95EngineTickMs: engineTickDurations.length ? engineTickDurations[Math.min(engineTickDurations.length - 1, Math.floor(engineTickDurations.length * 0.95))] : 0,
      longestEngineTickMs: Math.max(0, ...engineTickDurations),
      longestTaskMs: Math.max(0, ...metrics.longTasks),
    }
  })

  console.log(`Realtime campus simulation stress: ${JSON.stringify(result)}`)
  expect(result.statuses).toHaveLength(8)
  expect(result.statuses.every(status => status === 'successful'), result.failedReasons.join('; ')).toBe(true)
  expect(result.pendingPackets).toBe(0)
  expect(result.warning).toBeNull()
  expect(result.warnings).toEqual([])
  expect(result.peakQueue).toBeGreaterThan(256)
  expect(result.peakQueue).toBeLessThanOrEqual(4096)
  expect(result.elapsedMs).toBeLessThan(60_000)
  expect(result.p95TickIntervalMs).toBeLessThan(200)
  expect(result.longestTaskMs).toBeLessThan(500)
})
