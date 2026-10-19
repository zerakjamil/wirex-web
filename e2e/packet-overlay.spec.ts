import { expect, test } from '@playwright/test'

test('renders a 4,096-frame campus packet overlay within a bounded browser update', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.locator('.pt-canvas-area')).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    typeof (window as unknown as { __NET_STORE__?: unknown }).__NET_STORE__
  )).toBe('function')

  const fixture = await page.evaluate(() => {
    type Port = { id: string; name: string; shortName: string; [key: string]: unknown }
    type Device = {
      id: string; name: string; type: string; model: string; x: number; y: number; ports: Port[]
      config: Record<string, unknown>; [key: string]: unknown
    }
    type Link = {
      id: string; type: string; status: string; fromDeviceId: string; fromPortId: string; toDeviceId: string; toPortId: string
    }
    type State = { devices: Device[]; links: Link[] }
    type Store = { getState: () => State; setState: (state: Record<string, unknown>) => void }
    const store = (window as unknown as { __NET_STORE__?: Store }).__NET_STORE__
    if (!store) throw new Error('Loopback network store is unavailable')
    const original = store.getState()
    const pcTemplate = original.devices.find(device => device.type === 'pc')
    const switchTemplate = original.devices.find(device => device.type === 'switch')
    if (!pcTemplate || !switchTemplate) throw new Error('Starter devices are unavailable')

    const cloneDevice = (template: Device, id: string, name: string, x: number, y: number): Device => ({
      ...template,
      id,
      name,
      x,
      y,
      macAddress: `02:00:00:${id.slice(-6, -4)}:${id.slice(-4, -2)}:${id.slice(-2)}`,
      ports: template.ports.map((port, index) => ({
        ...port,
        id: `${id}-port-${index}`,
        status: 'up',
        adminStatus: 'up',
        connectedLinkId: undefined,
        connectedDeviceId: undefined,
        connectedPortId: undefined,
      })),
      config: { ...template.config, hostname: name },
      routingTable: [],
      arpTable: [],
      macTable: [],
      cliHistory: [],
    })

    const core = cloneDevice(switchTemplate, 'stress-core', 'Stress-Core', 1450, 1050)
    const corePorts = core.ports.filter(port => port.name.startsWith('FastEthernet0/'))
    const accessSwitches = Array.from({ length: 12 }, (_, index) => {
      const x = 180 + (index % 4) * 700
      const y = 180 + Math.floor(index / 4) * 650
      return cloneDevice(switchTemplate, `stress-access-${index}`, `Stress-Access${index}`, x + 250, y + 220)
    })
    const devices: Device[] = [core, ...accessSwitches]
    const links: Link[] = []

    for (let accessIndex = 0; accessIndex < accessSwitches.length; accessIndex++) {
      const access = accessSwitches[accessIndex]
      const accessPorts = access.ports.filter(port => port.name.startsWith('FastEthernet0/'))
      for (let hostIndex = 0; hostIndex < 24; hostIndex++) {
        const globalIndex = accessIndex * 24 + hostIndex
        const x = 180 + (accessIndex % 4) * 700 + (hostIndex % 6) * 80
        const y = 180 + Math.floor(accessIndex / 4) * 650 + 330 + Math.floor(hostIndex / 6) * 80
        const host = cloneDevice(pcTemplate, `stress-pc-${globalIndex}`, `Stress-PC${globalIndex}`, x, y)
        devices.push(host)
        links.push({
          id: `stress-host-link-${globalIndex}`,
          type: 'straight',
          status: 'up',
          fromDeviceId: host.id,
          fromPortId: host.ports[0].id,
          toDeviceId: access.id,
          toPortId: accessPorts[hostIndex].id,
        })
      }

      const uplink = access.ports.find(port => port.name === 'GigabitEthernet0/1')
      if (!uplink || !corePorts[accessIndex]) throw new Error('Stress switch is missing an uplink port')
      links.push({
        id: `stress-uplink-${accessIndex}`,
        type: 'straight',
        status: 'up',
        fromDeviceId: access.id,
        fromPortId: uplink.id,
        toDeviceId: core.id,
        toPortId: corePorts[accessIndex].id,
      })
    }

    store.setState({ devices, links, annotations: [], inFlightPackets: [], simulationMode: 'simulation', simulationPlaying: false })

    return { deviceCount: devices.length, linkCount: links.length }
  })

  expect(fixture).toEqual({ deviceCount: 301, linkCount: 300 })
  await expect(page.locator('.react-flow__node')).toHaveCount(301, { timeout: 30_000 })
  await expect(page.locator('.react-flow__edge')).toHaveCount(300, { timeout: 30_000 })

  const packetCount = await page.evaluate(() => {
    type Link = { id: string; fromDeviceId: string; toDeviceId: string }
    type Store = { getState: () => { links: Link[] }; setState: (state: Record<string, unknown>) => void }
    const store = (window as unknown as { __NET_STORE__?: Store }).__NET_STORE__
    if (!store) throw new Error('Loopback network store is unavailable')
    const links = store.getState().links
    const packets = Array.from({ length: 4096 }, (_, index) => {
      const link = links[index % links.length]
      return {
        id: `stress-frame-${index}`,
        linkId: link.id,
        fromDeviceId: link.fromDeviceId,
        toDeviceId: link.toDeviceId,
        progress: (index % 4) / 4,
        direction: index % 2 === 0 ? 'forward' : 'reverse',
        pdu: {
          id: `stress-pdu-${index}`,
          protocol: 'ICMP',
          summary: 'Dense packet overlay rendering sample',
          sourceMac: '02:00:00:00:00:01',
          destMac: '02:00:00:00:00:02',
          etherType: '0x0800',
          sourceIp: '192.0.2.1',
          destIp: '192.0.2.2',
          ttl: 64,
          payload: {},
        },
      }
    })
    const stressWindow = window as unknown as {
      __wirexPacketStress?: { startedAt: number; longTasks: number[]; observer: PerformanceObserver }
    }
    const stress = { startedAt: performance.now(), longTasks: [] as number[], observer: undefined as unknown as PerformanceObserver }
    stress.observer = new PerformanceObserver(entries => {
      for (const entry of entries.getEntries()) stress.longTasks.push(entry.duration)
    })
    stress.observer.observe({ entryTypes: ['longtask'] })
    stressWindow.__wirexPacketStress = stress
    store.setState({ inFlightPackets: packets })
    return packets.length
  })
  expect(packetCount).toBe(4096)
  await expect(page.getByText('4096 packet(s) waiting on wire', { exact: true })).toBeVisible()

  await expect(page.getByRole('button', { name: /more packets on this cable/i })).toHaveCount(300, { timeout: 30_000 })
  await expect(page.locator('[data-testid="in-flight-packet"]')).toHaveCount(300)

  const result = await page.evaluate(() => {
    const stress = (window as unknown as {
      __wirexPacketStress?: { startedAt: number; longTasks: number[]; observer: PerformanceObserver }
    }).__wirexPacketStress
    if (!stress) throw new Error('Packet stress measurements were not initialized')
    stress.longTasks.push(...stress.observer.takeRecords().map(entry => entry.duration))
    const detailedMarkers = document.querySelectorAll('[data-testid="in-flight-packet"]').length
    const hiddenCounts = Array.from(document.querySelectorAll('[data-testid="packet-overflow"]'))
      .map(element => Number(element.textContent?.match(/\+(\d+)/)?.[1] ?? 0))
      .filter(count => count > 0)
    const initialRender = {
      detailedMarkers,
      hiddenFrames: hiddenCounts.reduce((total, count) => total + count, 0),
      renderMs: performance.now() - stress.startedAt,
      longestTaskMs: Math.max(0, ...stress.longTasks),
    }
    stress.longTasks.length = 0
    stress.observer.takeRecords()
    stress.startedAt = performance.now()
    return initialRender
  })

  const sustained = await page.evaluate(async () => {
    type Packet = { progress: number; [key: string]: unknown }
    type Store = { getState: () => { inFlightPackets: Packet[] }; setState: (state: Record<string, unknown>) => void }
    const store = (window as unknown as { __NET_STORE__?: Store }).__NET_STORE__
    const stress = (window as unknown as {
      __wirexPacketStress?: { startedAt: number; longTasks: number[]; observer: PerformanceObserver }
    }).__wirexPacketStress
    if (!store || !stress) throw new Error('Packet stress update state is unavailable')

    const updateTimes: number[] = []
    for (let iteration = 0; iteration < 8; iteration++) {
      const started = performance.now()
      const packets = store.getState().inFlightPackets.map(packet => ({
        ...packet,
        progress: (packet.progress + 0.25) % 1,
      }))
      store.setState({ inFlightPackets: packets })
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      updateTimes.push(performance.now() - started)
    }

    stress.longTasks.push(...stress.observer.takeRecords().map(entry => entry.duration))
    stress.observer.disconnect()
    updateTimes.sort((left, right) => left - right)
    return {
      updates: updateTimes.length,
      medianUpdateMs: updateTimes[Math.floor(updateTimes.length / 2)],
      p95UpdateMs: updateTimes[updateTimes.length - 1],
      longestTaskMs: Math.max(0, ...stress.longTasks),
      totalMs: performance.now() - stress.startedAt,
    }
  })

  console.log(`Dense canvas stress: ${JSON.stringify({ initial: result, sustained, ...fixture, packetCount })}`)
  expect(result.detailedMarkers).toBe(300)
  expect(result.detailedMarkers + result.hiddenFrames).toBe(4096)
  expect(result.renderMs).toBeLessThan(5000)
  expect(result.longestTaskMs).toBeLessThan(1000)
  expect(sustained.updates).toBe(8)
  expect(sustained.p95UpdateMs).toBeLessThan(250)
  expect(sustained.longestTaskMs).toBeLessThan(1000)

  await page.evaluate(() => {
    const store = (window as unknown as { __NET_STORE__?: { getState: () => { inFlightPackets: unknown[] }; setState: (state: Record<string, unknown>) => void } }).__NET_STORE__
    if (!store) throw new Error('Loopback network store is unavailable')
    store.setState({ inFlightPackets: store.getState().inFlightPackets.slice(0, 2048) })
  })
  await expect(page.getByText('2048 packet(s) waiting on wire', { exact: true })).toBeVisible()
})
