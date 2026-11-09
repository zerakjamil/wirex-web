'use client'
import { useEffect, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Cisco3DIcon } from '@/components/canvas/Cisco3DIcons'
import { CiscoIcon, type IconName } from './CiscoIcon'
import {
  deviceCatalogHierarchy,
  type PaletteCategory,
  type PaletteSubcategory,
} from '@/simulator/deviceCatalog'
import { PACKET_PROTOCOLS, type DeviceType } from '@/types/network'
import { SIMULATION_TICK_MS } from '@/simulator/ospf'
import { useShallow } from 'zustand/react/shallow'
import { useI18n } from '@/i18n/useI18n'

const cables = [
  { tool: 'cable-auto', label: 'Automatically Choose Connection Type', color: '#df931a' },
  { tool: 'cable-console', label: 'Console', color: '#57c9e5' },
  { tool: 'cable-straight', label: 'Copper Straight-Through', color: '#222' },
  { tool: 'cable-crossover', label: 'Copper Cross-Over', color: '#222', dash: '6 4' },
  { tool: 'cable-fiber', label: 'Single Mode Fiber', color: '#eb8c22' },
  { tool: 'cable-fiber', label: 'Multi Mode Fiber', color: '#e87b10', dash: '3 3' },
  { tool: 'cable-phone', label: 'Phone', color: '#738aa7' },
  { tool: 'cable-coaxial', label: 'Coaxial', color: '#186ab5' },
  { tool: 'cable-serial-dce', label: 'Serial DCE', color: '#c33434' },
  { tool: 'cable-serial', label: 'Serial DTE', color: '#c33434' },
  { tool: 'cable-octal', label: 'Octal', color: '#5d7c4e' },
  { tool: 'cable-auto', label: 'IoT Custom Cable', color: '#2e7d32' },
  { tool: 'cable-usb', label: 'USB', color: '#396792' },
] as const

function getSubcategoryIcon(subId: string): { type?: DeviceType; icon?: IconName } {
  switch (subId) {
    case 'routers': return { type: 'router' }
    case 'switches': return { type: 'switch' }
    case 'hubs': return { type: 'hub' }
    case 'wireless': return { type: 'wireless' }
    case 'security': return { type: 'security' }
    case 'wan': return { type: 'cloud' }
    case 'endDevices': return { type: 'pc' }
    case 'smartHome': return { type: 'iot' }
    case 'smartCity': return { type: 'iot' }
    case 'industrialOt': return { type: 'pc' }
    case 'powerGrid': return { type: 'iot' }
    case 'boards': return { icon: 'components' }
    case 'actuators': return { type: 'iot' }
    case 'sensors': return { type: 'iot' }
    case 'connections': return { icon: 'connections' }
    case 'structuredCabling': return { type: 'hub' }
    case 'miscellaneous': return { icon: 'misc' }
    case 'multiuserConnection': return { icon: 'multiuser' }
    case 'legacy': return { icon: 'folder' }
    default: return { icon: 'folder' }
  }
}

function getCategoryIcon(catId: string): IconName {
  switch (catId) {
    case 'network_devices': return 'network'
    case 'end_devices': return 'end'
    case 'components': return 'components'
    case 'connections': return 'connections'
    case 'misc': return 'misc'
    case 'multiuser': return 'multiuser'
    case 'legacy': return 'folder'
    default: return 'folder'
  }
}

export function CiscoBottomBar() {
  const { t } = useI18n()
  const net = useNetworkStore(useShallow(state => ({
    devices: state.devices,
    udpTransactions: state.udpTransactions,
    activeTool: state.activeTool,
    addDevice: state.addDevice,
    setActiveTool: state.setActiveTool,
    toggleDevicePower: state.toggleDevicePower,
    stepSimulation: state.stepSimulation,
    toggleSimulationMode: state.toggleSimulationMode,
    simulationMode: state.simulationMode,
    simulationPlaying: state.simulationPlaying,
    setSimulationPlaying: state.setSimulationPlaying,
    setActiveModal: state.setActiveModal,
    packetCount: state.inFlightPackets.length,
    simulationWarning: state.simulationWarning,
    clearSimulation: state.clearSimulation,
    stepSimulationBack: state.stepSimulationBack,
    simulationHistory: state.simulationHistory,
    simulationEvents: state.simulationEvents,
  })))
  const ws = useWorkspaceStore()
  const [selectedCatId, setSelectedCatId] = useState<string>('network_devices')
  const [selectedSubId, setSelectedSubId] = useState<string>('routers')
  const [hovered, setHovered] = useState('4331')
  const [seconds, setSeconds] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const currentCat = deviceCatalogHierarchy.find(c => c.id === selectedCatId) ?? deviceCatalogHierarchy[0]
  const currentSub = currentCat.subcategories.find(s => s.id === selectedSubId) ?? currentCat.subcategories[0]

  const visibleEvents = net.simulationEvents.filter(event => !ws.hiddenEventProtocols.includes(event.protocol))

  useEffect(() => {
    const timer = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(n => String(n).padStart(2, '0'))
    .join(':')

  const powerCycle = () => {
    const state = useNetworkStore.getState()
    useWorkspaceStore.getState().checkpoint()
    state.devices.forEach(d => {
      if (d.power !== false) {
        state.toggleDevicePower(d.id)
        state.toggleDevicePower(d.id)
      }
    })
    useWorkspaceStore.getState().setStatus('Powered devices restarted.')
  }

  const fastForward = () => {
    const state = useNetworkStore.getState()
    for (let i = 0; i < 30; i++) state.stepSimulation()
    setSeconds(s => s + 30)
  }

  const togglePlay = () => {
    const state = useNetworkStore.getState()
    state.setSimulationPlaying(!state.simulationPlaying)
  }

  const captureForward = () => {
    const state = useNetworkStore.getState()
    for (let i = 0; i < 7; i++) {
      state.stepSimulation()
      if (useNetworkStore.getState().inFlightPackets.length === 0) break
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      const state = useNetworkStore.getState()
      if (event.code === 'KeyS') { event.preventDefault(); powerCycle() }
      else if (event.code === 'KeyD') { event.preventDefault(); fastForward() }
      else if (state.simulationMode === 'simulation' && event.code === 'KeyP') { event.preventDefault(); togglePlay() }
      else if (state.simulationMode === 'simulation' && event.code === 'KeyC') { event.preventDefault(); captureForward() }
      else if (state.simulationMode === 'simulation' && event.code === 'KeyI') { event.preventDefault(); useWorkspaceStore.getState().togglePduList() }
      else if (state.simulationMode === 'simulation' && event.code === 'KeyB') { event.preventDefault(); state.stepSimulationBack() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const chooseCategory = (cat: PaletteCategory) => {
    ws.cancelPlacement()
    setSelectedCatId(cat.id)
    const firstSub = cat.subcategories[0]?.id || ''
    setSelectedSubId(firstSub)
    const subName = cat.subcategories[0]?.name || cat.name
    setHovered(subName)
  }

  const chooseSubcategory = (sub: PaletteSubcategory) => {
    ws.cancelPlacement()
    setSelectedSubId(sub.id)
    setHovered(sub.name)
  }

  return (
    <footer className="pt-bottom">
      <div className="pt-mode-bar">
        <div className="pt-time-controls">
          <span>{t('Time:')} {time}</span>
          <button title={`${t('Power Cycle Devices')} (Alt+S)`} aria-label={t('Power Cycle Devices')} onClick={powerCycle}>
            <CiscoIcon name="clock" />
          </button>
          <button title={`${t('Fast Forward Time')} (Alt+D)`} aria-label={t('Fast Forward Time')} onClick={fastForward}>
            <CiscoIcon name="fast" />
          </button>
        </div>
        <div className="pt-mode-tabs">
          <button
            aria-pressed={net.simulationMode === 'realtime'}
            onClick={() => { if (net.simulationMode !== 'realtime') net.toggleSimulationMode() }}
          >
            <CiscoIcon name="clock" size={20} />{t('Realtime')}
          </button>
          <button
            aria-pressed={net.simulationMode === 'simulation'}
            onClick={() => {
              if (net.simulationMode !== 'simulation') {
                net.toggleSimulationMode()
                useWorkspaceStore.setState({ showPduList: true })
              }
            }}
          >
            <CiscoIcon name="list" size={20} />{t('Simulation')}
          </button>
        </div>
      </div>
      {net.simulationMode === 'simulation' && (
        <div className="pt-simulation-controls">
          <span>{t('Simulation Panel')}</span>
          <button className="pt-button" disabled={net.simulationHistory.length === 0} title={`${t('Back')} (Alt+B)`} aria-label={t('Back')} onClick={net.stepSimulationBack}>
            {t('Back')}
          </button>
          <button className="pt-button" title={`${t(net.simulationPlaying ? 'Pause' : 'Auto Capture / Play')} (Alt+P)`} onClick={togglePlay}>
            {t(net.simulationPlaying ? 'Pause' : 'Auto Capture / Play')}
          </button>
          <button className="pt-button" title={`${t('Capture / Forward')} (Alt+C)`} onClick={captureForward}>
            {t('Capture / Forward')}
          </button>
          <button className="pt-button" onClick={net.clearSimulation}>{t('Reset Simulation')}</button>
          <button className="pt-button" title={`${t('Event List')} (Alt+I)`} onClick={ws.togglePduList}>{t('Event List')}</button>
          <span>{net.packetCount} {t('packets in flight')}</span>
          {net.packetCount > 0 && (
            <button
              className="pt-button bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold"
              onClick={() => {
                const first = useNetworkStore.getState().inFlightPackets[0]
                if (first) net.setActiveModal({ type: 'pdu', pdu: first.pdu })
              }}
            >
              ✉ {t('Sniff In-Flight PDU')}
            </button>
          )}
        </div>
      )}
      <div className={`pt-device-dock ${ws.showPduList ? '' : 'pt-pdu-hidden'}`}>
        <div className="pt-categories">
          <div className="pt-category-row">
            {deviceCatalogHierarchy.map(cat => {
              const isSelected = selectedCatId === cat.id
              return (
                <button
                  key={cat.id}
                  className="pt-category-button"
                  title={t(cat.name)}
                  aria-label={t(cat.name)}
                  aria-pressed={isSelected}
                  onClick={() => chooseCategory(cat)}
                  onMouseEnter={() => setHovered(cat.name)}
                >
                  <CiscoIcon name={getCategoryIcon(cat.id)} size={27} />
                </button>
              )
            })}
          </div>
          <div className="pt-category-divider" />
          <div className="pt-category-row">
            {currentCat.subcategories.map(sub => {
              const isSelected = selectedSubId === sub.id
              const iconDef = getSubcategoryIcon(sub.id)
              return (
                <button
                  key={sub.id}
                  className="pt-category-button"
                  title={t(sub.name)}
                  aria-label={t(sub.name)}
                  aria-pressed={isSelected}
                  onClick={() => chooseSubcategory(sub)}
                  onMouseEnter={() => setHovered(sub.name)}
                >
                  {iconDef.type ? (
                    <Cisco3DIcon type={iconDef.type} size={27} />
                  ) : (
                    <CiscoIcon name={iconDef.icon || 'folder'} size={27} />
                  )}
                </button>
              )
            })}
          </div>
          <div className="pt-device-description">{t(hovered || currentSub?.name || currentCat.name)}</div>
        </div>
        <div className="pt-model-box">
          <div className="pt-model-shelf">
            {currentCat.id === 'connections' && currentSub?.id === 'connections' ? (
              cables.map(c => (
                <button
                  className="pt-model pt-cable"
                  key={c.label}
                  title={t(c.label)}
                  aria-label={t(c.label)}
                  aria-pressed={net.activeTool === c.tool}
                  onMouseEnter={() => setHovered(c.label)}
                  onFocus={() => setHovered(c.label)}
                  onClick={() => {
                    ws.setTool('select')
                    net.setActiveTool(c.tool as Parameters<typeof net.setActiveTool>[0])
                  }}
                >
                  {c.tool === 'cable-auto' ? (
                    <CiscoIcon name="connections" size={30} />
                  ) : (
                    <svg width="32" height="30" viewBox="0 0 32 30" aria-hidden="true">
                      <path
                        d={c.tool.includes('serial') ? 'M2 22 10 8 19 22 30 8' : 'M2 15H30'}
                        stroke={c.color}
                        strokeWidth="3"
                        strokeDasharray={'dash' in c ? (c as { dash?: string }).dash : undefined}
                      />
                    </svg>
                  )}
                </button>
              ))
            ) : currentSub && currentSub.models.length > 0 ? (
              currentSub.models.map(model => {
                const selected = ws.placement?.type === model.type && ws.placement.model === model.name
                return (
                  <button
                    className="pt-model"
                    key={model.name}
                    aria-label={selected ? `Cancel placing ${model.name}` : `Place ${model.name}`}
                    aria-pressed={selected}
                    title={selected ? 'Cancel placement' : `${model.name}: click or drag to place. Ctrl-click for multiple.`}
                    draggable
                    onMouseEnter={() => setHovered(model.name)}
                    onFocus={() => setHovered(model.name)}
                    onPointerDown={event => {
                      if (event.ctrlKey) {
                        event.preventDefault()
                        ws.selectDeviceForPlacement(model.type, model.name, true)
                      }
                    }}
                    onContextMenu={event => event.preventDefault()}
                    onClick={event => {
                      if (!event.ctrlKey) ws.selectDeviceForPlacement(model.type, model.name, false)
                    }}
                    onDragStart={event => {
                      ws.cancelPlacement()
                      ws.selectDeviceForPlacement(model.type, model.name, event.ctrlKey)
                      event.dataTransfer.setData('application/x-wireforge-device', model.name)
                      event.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDragEnd={event => {
                      if (event.dataTransfer.dropEffect === 'none') ws.cancelPlacement()
                    }}
                  >
                    {selected && ws.placement?.repeat ? (
                      <svg width="33" height="33" viewBox="0 0 33 33" aria-hidden="true">
                        <circle cx="16.5" cy="16.5" r="13" fill="none" stroke="#404040" strokeWidth="3" />
                        <path d="M7 26L26 7" stroke="#404040" strokeWidth="3" />
                      </svg>
                    ) : (
                      <Cisco3DIcon type={model.type} model={model.name} size={33} />
                    )}
                    <span>{model.name}</span>
                  </button>
                )
              })
            ) : (
              <p className="pt-shelf-message">{t(`${currentSub?.name || currentCat.name} devices are not available.`)}</p>
            )}
          </div>
          <div className="pt-device-description">{t(hovered)}</div>
        </div>
        {ws.showPduList && (
          <div className="pt-pdu-window">
            <div className="pt-scenario-controls">
              {net.simulationMode === 'simulation' && (
                <div className="pt-pdu-tabs">
                  <button className="pt-button" aria-pressed={ws.pduView === 'pdus'} onClick={() => ws.setPduView('pdus')}>
                    {t('PDUs')}
                  </button>
                  <button className="pt-button" aria-pressed={ws.pduView === 'events'} onClick={() => ws.setPduView('events')}>
                    {t('Events')}
                  </button>
                </div>
              )}
              {net.simulationMode === 'simulation' && ws.pduView === 'events' ? (
                <div className="pt-event-controls">
                  <button className="pt-button" onClick={ws.toggleEventFilters}>{t('Show All / None')}</button>
                  <button className="pt-button" aria-pressed={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>
                    {t('Edit Filters')}
                  </button>
                  <span className="pt-event-count">{visibleEvents.length} {t('events')}</span>
                </div>
              ) : (
                <>
                  <div>
                    <CiscoIcon name="info" size={15} />
                    <select
                      aria-label={t('Scenario')}
                      value={ws.scenario}
                      onChange={e => useWorkspaceStore.setState({ scenario: Number(e.target.value) })}
                    >
                      {ws.scenarios.map(id => (
                        <option key={id} value={id}>{t('Scenario')} {id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <button className="pt-button" onClick={ws.addScenario}>{t('New')}</button>
                    <button className="pt-button" onClick={ws.deleteScenario}>{t('Delete')}</button>
                  </div>
                  <button className="pt-button" onClick={ws.togglePduList}>{t('Toggle PDU List Window')}</button>
                </>
              )}
            </div>
            {filtersOpen && ws.pduView === 'events' && net.simulationMode === 'simulation' && (
              <div className="pt-event-filters" role="dialog" aria-label={t('Edit Filters')}>
                <div className="pt-event-filter-actions">
                  <button className="pt-button" onClick={ws.showAllEventFilters}>{t('Show All')}</button>
                  <button className="pt-button" onClick={ws.showNoneEventFilters}>{t('Show None')}</button>
                  <button className="pt-button" aria-label={t('Close')} onClick={() => setFiltersOpen(false)}>×</button>
                </div>
                <div className="pt-event-filter-list">
                  {PACKET_PROTOCOLS.map(protocol => (
                    <label key={protocol}>
                      <input
                        type="checkbox"
                        checked={!ws.hiddenEventProtocols.includes(protocol)}
                        onChange={event => ws.setEventProtocolVisible(protocol, event.target.checked)}
                      />
                      <span>{t(protocol)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {net.simulationMode === 'simulation' && ws.pduView === 'events' ? (
              <div className="pt-pdu-table-scroll">
                <table className="pt-event-table">
                  <thead>
                    <tr>{['Time', 'Last Device', 'At Device', 'Type'].map(h => <th key={h}>{t(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {visibleEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-slate-500 dark:text-slate-400 italic">
                          {net.simulationEvents.length === 0 ? t('No events recorded yet.') : t('No events match the current filters.')}
                        </td>
                      </tr>
                    ) : (
                      visibleEvents.map(event => (
                        <tr
                          key={event.id}
                          className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                          title={event.summary || undefined}
                          onClick={() => net.setActiveModal({ type: 'pdu', pdu: event.pdu })}
                        >
                          <td className="font-mono">{(event.timestamp * SIMULATION_TICK_MS / 1000).toFixed(3)}</td>
                          <td dir="ltr">{net.devices.find(device => device.id === event.sourceDeviceId)?.name ?? t('Removed')}</td>
                          <td dir="ltr">{net.devices.find(device => device.id === event.destDeviceId)?.name ?? t('Removed')}</td>
                          <td>
                            <span
                              data-protocol={event.protocol}
                              className={
                                event.status === 'dropped'
                                  ? 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200 font-semibold font-mono text-[9px] border border-rose-300 dark:border-rose-800'
                                  : 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 font-semibold font-mono text-[9px] border border-sky-300 dark:border-sky-800'
                              }
                            >
                              {t(event.protocol)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="pt-pdu-table-scroll">
                <table className="pt-pdu-table">
                  <thead>
                    <tr>{['Fire', 'Last Status', 'Source', 'Destination', 'Type'].map(h => <th key={h}>{t(h)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {ws.pdus.filter(p => p.scenario === ws.scenario).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-slate-500 dark:text-slate-400 italic">
                          {t('No PDUs in this scenario. Press P or use the envelope tool to send a packet.')}
                        </td>
                      </tr>
                    ) : (
                      ws.pdus.filter(p => p.scenario === ws.scenario).map(p => {
                        const pduObj = p.pdu || useNetworkStore.getState().inFlightPackets.find(
                          packet => packet.pdu.pingId === p.pingId ||
                            packet.pdu.payload.udpRequestId === p.udpRequestId ||
                            packet.pdu.pendingPacket?.payload.udpRequestId === p.udpRequestId
                        )?.pdu
                        const udpResult = net.udpTransactions.find(result => result.requestId === p.udpRequestId)
                        const status = p.protocol === 'UDP'
                          ? (udpResult?.status === 'successful' ? 'Successful' : udpResult?.status === 'failed' ? 'Failed' : p.status)
                          : p.status
                        const reason = udpResult?.reason ?? p.reason
                        return (
                          <tr
                            key={p.id}
                            className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                            title={reason ?? t('Double-click to inspect PDU layers')}
                            onClick={() => { if (pduObj) net.setActiveModal({ type: 'pdu', pdu: pduObj }); else ws.setStatus(reason ?? status) }}
                            onDoubleClick={() => { if (pduObj) net.setActiveModal({ type: 'pdu', pdu: pduObj }); else ws.setStatus(reason ?? status) }}
                          >
                            <td>
                              <button
                                title={t('Fire PDU')}
                                aria-label={t('Fire PDU')}
                                onClick={event => {
                                  event.stopPropagation()
                                  ws.firePdu(p.sourceId, p.destinationId, p.targetIp, { protocol: p.protocol, port: p.udpPort, data: p.udpData })
                                }}
                              >
                                <CiscoIcon name="play" size={12} />
                              </button>
                            </td>
                            <td>
                              {status === 'Successful' ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                  <span>✓</span> {t('Successful')}
                                </span>
                              ) : status === 'In Progress' ? (
                                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" /> {t('In Progress')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                                  <span>✕</span> {t('Failed')}
                                </span>
                              )}
                              {reason && <small className="block max-w-64 whitespace-normal">{t(reason)}</small>}
                            </td>
                            <td dir="ltr">{net.devices.find(device => device.id === p.sourceId)?.name ?? t('Removed')}</td>
                            <td dir="ltr">{net.devices.find(device => device.id === p.destinationId)?.name ?? p.targetIp}</td>
                            <td>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-semibold font-mono text-[9px] border border-amber-300 dark:border-amber-800">
                                <span>✉</span>{p.protocol === 'UDP' ? t('UDP Echo') : t('ICMP')}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
      {ws.status && (
        <div className="pt-status" role="status">
          <span>{t(ws.status)}</span>
          <button aria-label="Dismiss status" onClick={() => ws.setStatus('')}>×</button>
        </div>
      )}
      {net.simulationWarning && (
        <div className="pt-status" role="alert">
          <span>{net.simulationWarning}</span>
          <button className="pt-button" onClick={net.clearSimulation}>{t('Reset Simulation')}</button>
        </div>
      )}
    </footer>
  )
}
