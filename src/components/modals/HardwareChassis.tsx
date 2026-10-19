'use client'

import type { DragEvent } from 'react'
import type { NetworkDevice, NetworkPort } from '@/types/network'
import type { getHardwareProfile } from '@/simulator/physicalHardware'
import { useI18n } from '@/i18n/useI18n'

export type HardwareProfile = ReturnType<typeof getHardwareProfile>
export type ChassisFace = 'front' | 'rear'

interface ChassisProps {
  device: NetworkDevice
  ports: NetworkPort[]
  profile: HardwareProfile
  face: ChassisFace
  power: boolean
  selectedPortId: string
  moduleId: string
  onSelectPort: (id: string) => void
  onTogglePower: () => void
  onInstallModule: (slot: number, id: string) => void
  onEjectModule: (slot: number) => void
}

type Connector = 'rj45' | 'rj11' | 'serial' | 'fiber' | 'coax' | 'radio'

function connector(port: NetworkPort): Connector {
  if (port.type === 'wireless') return 'radio'
  if (port.type === 'serial') return 'serial'
  if (port.type === 'coaxial') return 'coax'
  if (port.type === 'phone') return 'rj11'
  if (port.media === 'fiber') return 'fiber'
  return 'rj45'
}

function portLed(port: NetworkPort, power: boolean): 'up' | 'learning' | 'down' {
  if (!power || port.adminStatus === 'down') return 'down'
  if (port.status === 'up') {
    if (port.stpState === 'blocking' || port.stpState === 'listening' || port.stpState === 'learning') return 'learning'
    return 'up'
  }
  return port.status === 'learning' ? 'learning' : 'down'
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

function BridgeMark() {
  return (
    <svg className="hw-mark" viewBox="0 0 46 22" aria-hidden="true">
      <g fill="currentColor">
        {[7, 11, 15, 19, 22, 22, 19, 15, 11, 7].map((height, index) => (
          <rect key={index} x={2 + index * 4.4} y={22 - height} width="3.1" height={height} rx=".7" />
        ))}
      </g>
    </svg>
  )
}

function StatusLed({ label, on, tone = 'up' }: { label: string; on: boolean; tone?: 'up' | 'learning' }) {
  return (
    <span className="hw-status">
      <span className="hw-led" data-state={on ? tone : 'down'} />
      <small>{label}</small>
    </span>
  )
}

function PowerSwitch({ power, onToggle }: { power: boolean; onToggle: () => void }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className="hw-power"
      aria-pressed={power}
      aria-label={t('Device power')}
      title={t(power ? 'On' : 'Off')}
      onClick={onToggle}
    >
      <span className="hw-power-rocker" data-on={power}>{power ? 'I' : 'O'}</span>
      <span className="hw-power-caption">POWER</span>
    </button>
  )
}

function PortJack({
  port,
  power,
  selected,
  compact = false,
  label,
  onSelect,
}: {
  port: NetworkPort
  power: boolean
  selected: boolean
  compact?: boolean
  label?: string
  onSelect: (id: string) => void
}) {
  const { t } = useI18n()
  const kind = connector(port)
  const state = portLed(port, power)
  const spokenState = t(power ? port.status : 'down')
  return (
    <button
      type="button"
      className={`hw-port${compact ? ' hw-port-compact' : ''}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${port.name}: ${spokenState}`}
      title={`${port.name} · ${spokenState}${port.vlan ? ` · VLAN ${port.vlan}` : ''}`}
      onClick={() => onSelect(port.id)}
    >
      <span className="hw-led" data-state={state} />
      <span className={`hw-jack hw-jack-${kind}`} aria-hidden="true" />
      <span className="hw-port-name">{label ?? port.shortName}</span>
    </button>
  )
}

function ModuleBay({
  device,
  ports,
  slot,
  power,
  moduleId,
  selectedPortId,
  onSelectPort,
  onInstallModule,
  onEjectModule,
  compact = false,
}: ChassisProps & { slot: number; compact?: boolean }) {
  const { t } = useI18n()
  const installed = device.modules?.[slot]
  const cardPorts = ports.filter(port => port.moduleSlot === slot)
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const id = event.dataTransfer.getData('application/x-hardware-module')
    if (id) onInstallModule(slot, id)
  }
  return (
    <div
      className={`hw-bay${installed ? ' is-installed' : ''}${compact ? ' hw-bay-compact' : ''}`}
      onDragOver={event => {
        if (event.dataTransfer.types.includes('application/x-hardware-module')) event.preventDefault()
      }}
      onDrop={drop}
    >
      <div className="hw-bay-head">
        <span>SLOT {slot}</span>
        <strong dir="ltr">{installed ?? t('Empty')}</strong>
      </div>
      {installed ? (
        <div className="hw-bay-ports">
          {cardPorts.length ? cardPorts.map(port => (
            <PortJack
              key={port.id}
              port={port}
              power={power}
              selected={selectedPortId === port.id}
              onSelect={onSelectPort}
            />
          )) : <span className="hw-bay-blank">{t('No interfaces')}</span>}
        </div>
      ) : (
        <div className="hw-bay-slot" aria-hidden="true"><i /><i /></div>
      )}
      <div className="hw-bay-foot">
        <button
          type="button"
          className="hw-bay-action"
          disabled={!installed && !moduleId}
          onClick={() => installed ? onEjectModule(slot) : onInstallModule(slot, moduleId)}
        >
          {t(installed ? 'Eject' : 'Install')}
        </button>
      </div>
    </div>
  )
}

function RackChassis(props: ChassisProps) {
  const { device, ports, profile, face, power, onTogglePower } = props
  const { t } = useI18n()
  const kind = device.type === 'switch' ? 'switch'
    : device.type === 'router' ? 'router'
    : device.type === 'wlc' ? 'wlc'
    : device.type === 'security' ? 'security'
    : 'hub'
  const series = kind === 'switch' ? 'Catalyst Switch'
    : kind === 'router' ? 'Integrated Services Router'
    : kind === 'wlc' ? 'Wireless LAN Controller'
    : kind === 'security' ? 'Adaptive Security Appliance'
    : 'Ethernet Hub'
  const portFace = face === profile.portFace
  const bays = Array.from({ length: profile.slots }, (_, slot) => slot)
  const builtIn = ports.filter(port => port.moduleSlot === undefined)

  return (
    <div className={`hw-rack hw-rack-${kind}`} data-face={face}>
      <div className="hw-rack-ear" aria-hidden="true"><i /><i /></div>
      <div className="hw-rack-body">
        <div className="hw-rack-head">
          <div className="hw-rack-brand">
            <BridgeMark />
            <div className="hw-rack-title">
              <strong dir="ltr">{device.model}</strong>
              <span>{series}</span>
            </div>
          </div>
          <div className="hw-rack-status">
            {kind === 'switch' ? (
              <>
                <StatusLed label="SYST" on={power} />
                <StatusLed label="RPS" on={false} />
                <StatusLed label="STAT" on={power} />
                <StatusLed label="DUPLX" on={false} />
                <StatusLed label="SPEED" on={false} />
              </>
            ) : (
              <>
                <StatusLed label="PWR" on={power} />
                <StatusLed label="SYS" on={power} />
                <StatusLed label="ACT" on={power} tone="learning" />
              </>
            )}
            <PowerSwitch power={power} onToggle={onTogglePower} />
          </div>
        </div>

        <div className="hw-rack-face">
          {portFace ? (
            kind === 'switch' ? (
              <SwitchFace {...props} builtIn={builtIn} bays={bays} />
            ) : (
              <PortFace {...props} builtIn={builtIn} bays={bays} />
            )
          ) : (
            <OtherFace kind={kind} model={device.model} />
          )}
        </div>

        <div className="hw-rack-foot">
          <span dir="ltr">{device.model}</span>
          <span className="hw-rack-foot-note">{t('Physical Device View')}</span>
          <span dir="ltr" className="hw-rack-serial">SN {device.id.slice(-8).toUpperCase()}</span>
        </div>
      </div>
      <div className="hw-rack-ear" aria-hidden="true"><i /><i /></div>
    </div>
  )
}

function SwitchFace(props: ChassisProps & { builtIn: NetworkPort[]; bays: number[] }) {
  const { ports, power, selectedPortId, onSelectPort, profile } = props
  const fast = ports.filter(port => port.moduleSlot === undefined && port.type === 'fastethernet')
  const gig = ports.filter(port => port.moduleSlot === undefined && port.type === 'gigabitethernet')
  const rows = chunks(fast, 12)
  return (
    <div className="hw-switch-face">
      <div className="hw-switch-mode" aria-hidden="true">
        <span className="is-active"><i /><b>STAT</b></span>
        <span><i /><b>UTIL</b></span>
        <span><i /><b>DUPLX</b></span>
        <span><i /><b>SPEED</b></span>
        <em>MODE</em>
      </div>
      <div className="hw-switch-ports">
        {rows.length ? rows.map((row, rowIndex) => (
          <div className="hw-switch-row" key={rowIndex}>
            {row.map((port, index) => (
              <PortJack
                key={port.id}
                port={port}
                power={power}
                compact
                label={String(rowIndex * 12 + index + 1)}
                selected={selectedPortId === port.id}
                onSelect={onSelectPort}
              />
            ))}
          </div>
        )) : <span className="hw-empty-face">{'No interfaces installed.'}</span>}
      </div>
      <div className="hw-switch-side">
        <div className="hw-uplinks">
          <span className="hw-panel-label">UPLINK</span>
          <div className="hw-port-row">
            {gig.map((port, index) => (
              <PortJack
                key={port.id}
                port={port}
                power={power}
                compact
                label={`G${index + 1}`}
                selected={selectedPortId === port.id}
                onSelect={onSelectPort}
              />
            ))}
          </div>
        </div>
        {profile.slots > 0 && (
          <div className="hw-switch-bays">
            {props.bays.map(slot => (
              <ModuleBay key={slot} {...props} slot={slot} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PortFace(props: ChassisProps & { builtIn: NetworkPort[]; bays: number[] }) {
  const manyBays = props.bays.length > 4
  return (
    <div className={`hw-port-face${manyBays ? ' has-many-bays' : ''}`}>
      {props.bays.length > 0 && (
        <div className={`hw-bay-column${manyBays ? ' is-grid' : ''}`}>
          {props.bays.map(slot => <ModuleBay key={slot} {...props} slot={slot} />)}
        </div>
      )}
      {props.builtIn.length > 0 && (
        <div className="hw-builtin">
          <span className="hw-panel-label">NETWORK INTERFACES</span>
          <div className="hw-port-row">
            {props.builtIn.map(port => (
              <PortJack
                key={port.id}
                port={port}
                power={props.power}
                selected={props.selectedPortId === port.id}
                onSelect={props.onSelectPort}
              />
            ))}
          </div>
          {props.device.type === 'router' && (
            <div className="hw-aux" title="Console and AUX are not cabled in this simulator; use the CLI tab.">
              <span><i className="hw-aux-console" />CONSOLE</span>
              <span><i className="hw-aux-aux" />AUX</span>
              <span><i className="hw-aux-usb" />USB</span>
              <span><i className="hw-aux-cf" />CF</span>
            </div>
          )}
          {(props.device.type === 'wlc' || props.device.type === 'security') && (
            <div className="hw-aux" title="Console is not cabled in this simulator; use the CLI tab.">
              <span><i className="hw-aux-console" />CONSOLE</span>
              <span><i className="hw-aux-usb" />USB</span>
            </div>
          )}
          <div className="hw-vent" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        </div>
      )}
    </div>
  )
}

function OtherFace({ kind, model }: { kind: string; model: string }) {
  if (kind === 'router') {
    return (
      <div className="hw-other-face hw-other-router-front">
        <div className="hw-router-front-vents" aria-hidden="true">
          {Array.from({ length: 14 }, (_, index) => <i key={index} />)}
        </div>
        <div className="hw-other-plate">
          <strong dir="ltr">{model}</strong>
          <span>FRONT PANEL</span>
        </div>
        <div className="hw-router-front-usb">
          <span>USB</span>
          <div aria-hidden="true"><i /><i /></div>
        </div>
      </div>
    )
  }
  return (
    <div className={`hw-other-face hw-other-${kind}`}>
      <div className="hw-fan" aria-hidden="true"><i /><i /><i /></div>
      <div className="hw-other-plate">
        <strong dir="ltr">{model}</strong>
        <span>100-240V~ 50/60Hz</span>
      </div>
      <div className="hw-power-inlet" aria-hidden="true"><i /><i /><i /></div>
    </div>
  )
}

function DesktopChassis(props: ChassisProps) {
  const { device, ports, profile, face, power, onTogglePower } = props
  const portFace = face === profile.portFace
  if (device.type === 'laptop') return <LaptopChassis {...props} />
  return (
    <div className={`hw-desktop${device.type === 'server' ? ' is-server' : ''}`} data-face={face}>
      {portFace ? (
        <div className="hw-desktop-rear">
          <div className="hw-desktop-psu">
            <span className="hw-fan" aria-hidden="true"><i /><i /><i /></span>
            <span>PSU</span>
          </div>
          <div className="hw-desktop-io">
            <span className="hw-panel-label">REAR I/O</span>
            <div className="hw-port-row">
              {ports.filter(port => port.moduleSlot === undefined).map(port => (
                <PortJack
                  key={port.id}
                  port={port}
                  power={power}
                  selected={props.selectedPortId === port.id}
                  onSelect={props.onSelectPort}
                />
              ))}
            </div>
            {profile.slots > 0 && (
              <div className="hw-host-bay">
                {Array.from({ length: profile.slots }, (_, slot) => (
                  <ModuleBay key={slot} {...props} slot={slot} compact />
                ))}
              </div>
            )}
          </div>
          <div className="hw-desktop-slots" aria-hidden="true"><span /><span /><span /><span /></div>
        </div>
      ) : (
        <div className="hw-desktop-front">
          <div className="hw-tower-bezel">
            <div className="hw-tower-top">
              <PowerSwitch power={power} onToggle={onTogglePower} />
              <span className="hw-tower-led" data-state={power ? 'up' : 'down'} />
              <span className="hw-tower-led" data-state={power ? 'learning' : 'down'} />
            </div>
            <div className="hw-drive-bays" aria-hidden="true">
              <span /><span />
              {device.type === 'server' && <><span /><span /></>}
            </div>
            <div className="hw-tower-vents" aria-hidden="true" />
            <span className="hw-tower-model" dir="ltr">{device.model}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function LaptopChassis(props: ChassisProps) {
  const { device, ports, power, face } = props
  const top = face === 'front'
  const builtIn = ports.filter(port => port.moduleSlot === undefined)
  const bay = props.profile.slots > 0 ? (
    <div className="hw-laptop-bay">
      <span className="hw-laptop-bay-rail" aria-hidden="true" />
      <ModuleBay {...props} slot={0} compact />
    </div>
  ) : null
  const powerButton = (
    <button
      type="button"
      className="hw-laptop-power"
      data-on={power}
      onClick={props.onTogglePower}
      aria-label="Power"
      title="Power"
    >
      <span className="hw-laptop-power-dot" aria-hidden="true" />
      <small>PWR</small>
    </button>
  )
  const builtInRow = builtIn.length ? (
    <div className="hw-laptop-io">
      <span className="hw-panel-label">I/O</span>
      <div className="hw-port-row">
        {builtIn.map(port => (
          <PortJack
            key={port.id}
            port={port}
            power={power}
            compact
            selected={props.selectedPortId === port.id}
            onSelect={props.onSelectPort}
          />
        ))}
      </div>
    </div>
  ) : null
  return (
    <div className={`hw-laptop ${top ? 'is-top' : 'is-rear'}`} data-face={face}>
      {top ? (
        <div className="hw-laptop-top">
          <div className="hw-laptop-screen-top">
            <div className="hw-laptop-screen-panel" data-on={power}><span>wireX</span></div>
          </div>
          <div className="hw-laptop-deck">
            <span className="hw-laptop-hinge-strip" aria-hidden="true" />
            <div className="hw-laptop-keys" aria-hidden="true">
              {Array.from({ length: 5 }, (_, row) => (
                <span key={row} className="hw-laptop-keyrow">
                  {Array.from({ length: row === 0 ? 13 : 14 }, (_, col) => <i key={col} />)}
                </span>
              ))}
            </div>
            <div className="hw-laptop-trackpad" aria-hidden="true" />
            <span className="hw-laptop-model" dir="ltr">{device.model}</span>
            {powerButton}
          </div>
          {bay}
          {builtInRow}
        </div>
      ) : (
        <div className="hw-laptop-rear">
          <span className="hw-laptop-shadow" aria-hidden="true" />
          <div className="hw-laptop-lid-back">
            <span className="hw-laptop-logo" dir="ltr">wireX</span>
          </div>
          <div className="hw-laptop-hinge" aria-hidden="true"><i /><i /></div>
          <div className="hw-laptop-base-rear">
            <span className="hw-laptop-base-side" aria-hidden="true" />
            <span className="hw-laptop-base-lip" aria-hidden="true" />
            {builtInRow}
            <div className="hw-laptop-foot">
              {powerButton}
              <span className="hw-laptop-model" dir="ltr">{device.model}</span>
              <span className="hw-laptop-badge" dir="ltr">LAPTOP</span>
            </div>
          </div>
          {bay}
        </div>
      )}
    </div>
  )
}

function PhoneChassis(props: ChassisProps) {
  const { device, ports, face, profile, power } = props
  const portFace = face === profile.portFace
  return (
    <div className="hw-phone" data-face={face}>
      {portFace ? (
        <div className="hw-phone-back">
          <span className="hw-phone-hook" aria-hidden="true" />
          <div className="hw-phone-label" dir="ltr">{device.model}</div>
          <div className="hw-port-row">
            {ports.map(port => (
              <PortJack
                key={port.id}
                port={port}
                power={power}
                selected={props.selectedPortId === port.id}
                onSelect={props.onSelectPort}
              />
            ))}
          </div>
          <span className="hw-phone-jack" aria-hidden="true" />
        </div>
      ) : (
        <div className="hw-phone-front">
          <span className="hw-phone-handset" aria-hidden="true"><i /><i /></span>
          <div className="hw-phone-body">
            <div className="hw-phone-screen" data-on={power}><span>wireX</span></div>
            <div className="hw-phone-keys" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
            </div>
            <div className="hw-phone-brand" dir="ltr">{device.model}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function AccessPointChassis(props: ChassisProps) {
  const { device, ports, power } = props
  return (
    <div className="hw-ap">
      <span className="hw-ap-antenna hw-ap-antenna-l" aria-hidden="true" />
      <span className="hw-ap-antenna hw-ap-antenna-r" aria-hidden="true" />
      <div className="hw-ap-body">
        <span className="hw-ap-led" data-state={power ? 'up' : 'down'} />
        <span className="hw-ap-ring" aria-hidden="true" />
        <span className="hw-ap-model" dir="ltr">{device.model}</span>
      </div>
      <div className="hw-ap-ports">
        {ports.map(port => (
          <PortJack
            key={port.id}
            port={port}
            power={power}
            selected={props.selectedPortId === port.id}
            onSelect={props.onSelectPort}
          />
        ))}
      </div>
    </div>
  )
}

function GenericChassis(props: ChassisProps) {
  const { device, ports, profile, face, power } = props
  const shape = profile.shape
  const portFace = face === profile.portFace
  return (
    <div className={`hw-generic hw-generic-${shape}`} data-face={face}>
      <div className="hw-generic-body">
        {shape === 'printer' && (
          <>
            <span className="hw-printer-tray" aria-hidden="true" />
            <span className="hw-printer-slot" aria-hidden="true" />
            <span className="hw-printer-panel" aria-hidden="true"><i /><i /><b /></span>
          </>
        )}
        {shape === 'cloud' && <span className="hw-cloud-puff" aria-hidden="true" />}
        {shape === 'modem' && <div className="hw-modem-leds" aria-hidden="true">{[0, 1, 2, 3, 4].map(index => <i key={index} />)}</div>}
        {(shape === 'display' || shape === 'tablet' || shape === 'handheld') && (
          <div className="hw-screen" data-on={power}><span>wireX</span></div>
        )}
        <span className="hw-generic-model" dir="ltr">{device.model}</span>
      </div>
      {portFace && (
        <>
          <div className="hw-generic-ports">
            <span className="hw-panel-label">INTERFACES</span>
            <div className="hw-port-row">
              {ports.filter(port => port.moduleSlot === undefined).map(port => (
                <PortJack
                  key={port.id}
                  port={port}
                  power={power}
                  selected={props.selectedPortId === port.id}
                  onSelect={props.onSelectPort}
                />
              ))}
            </div>
          </div>
          {props.profile.slots > 0 && (
            <div className="hw-generic-modules">
              <span className="hw-panel-label">MODULE BAYS</span>
              <div className={`hw-generic-bays${props.profile.slots > 4 ? ' is-grid' : ''}`}>
                {Array.from({ length: props.profile.slots }, (_, slot) => (
                  <ModuleBay key={slot} {...props} slot={slot} compact />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function HubChassis(props: ChassisProps) {
  const { device, ports, power } = props
  return (
    <div className="hw-hub">
      <div className="hw-hub-head">
        <strong dir="ltr">{device.model}</strong>
        <span className="hw-status"><span className="hw-led" data-state={power ? 'up' : 'down'} /><small>PWR</small></span>
        <PowerSwitch power={power} onToggle={props.onTogglePower} />
      </div>
      <div className="hw-hub-ports">
        {ports.map(port => (
          <PortJack
            key={port.id}
            port={port}
            power={power}
            compact
            selected={props.selectedPortId === port.id}
            onSelect={props.onSelectPort}
          />
        ))}
      </div>
    </div>
  )
}

export function HardwareChassis(props: ChassisProps) {
  switch (props.profile.shape) {
    case 'rack':
      return <RackChassis {...props} />
    case 'hub':
      return <HubChassis {...props} />
    case 'tower':
      return <DesktopChassis {...props} />
    case 'laptop':
      return <LaptopChassis {...props} />
    case 'phone':
      return <PhoneChassis {...props} />
    case 'access-point':
      return <AccessPointChassis {...props} />
    default:
      return <GenericChassis {...props} />
  }
}
