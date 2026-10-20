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

function CardPortButton({
  ports,
  power,
  selectedPortId,
  onSelect,
  className,
}: {
  ports: NetworkPort[]
  power: boolean
  selectedPortId: string
  onSelect: (id: string) => void
  className: string
}) {
  const { t } = useI18n()
  const port = ports.find(item => item.moduleSlot === 0)
  if (!port) return null
  const spokenState = t(power ? port.status : 'down')
  const selected = selectedPortId === port.id
  return (
    <button
      type="button"
      className={`${className}${selected ? ' is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`${port.name}: ${spokenState}`}
      title={`${port.name} · ${spokenState}${port.vlan ? ` · VLAN ${port.vlan}` : ''}`}
      onClick={() => onSelect(port.id)}
    >
      <span className="hw-led" data-state={portLed(port, power)} />
      <span className={`hw-jack hw-jack-${connector(port)}`} aria-hidden="true" />
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
            <OtherFace kind={kind} model={device.model} power={power} />
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

function RouterHexGrille() {
  const hexes: string[] = []
  for (let col = 0; col < 26; col += 1) {
    for (let row = -1; row < 10; row += 1) {
      const cx = 18 + col * 45
      const cy = 20 + row * 36 + (col % 2 ? 18 : 0)
      hexes.push(`M${cx - 30} ${cy} L${cx - 15} ${cy - 18} L${cx + 15} ${cy - 18} L${cx + 30} ${cy} L${cx + 15} ${cy + 18} L${cx - 15} ${cy + 18} Z`)
    }
  }
  return (
    <svg className="hw-router-hex" viewBox="0 0 1000 360" preserveAspectRatio="none" aria-hidden="true">
      {hexes.map((d, index) => <path key={index} d={d} />)}
    </svg>
  )
}

function OtherFace({ kind, model, power }: { kind: string; model: string; power: boolean }) {
  if (kind === 'router') {
    return (
      <div className="hw-other-face hw-other-router-front">
        <RouterHexGrille />
        <div className="hw-router-psu">
          <span className="hw-router-psu-title">AC OK</span>
          <span className="hw-router-psu-volt" dir="ltr">100-240V~<br />50/60Hz</span>
          <span className="hw-router-psu-led" data-on={power} aria-hidden="true" />
          <span className="hw-router-psu-switch" aria-hidden="true"><i /><i /></span>
          <span className="hw-router-psu-fan" aria-hidden="true"><i /></span>
        </div>
        <div className="hw-router-blank" aria-hidden="true"><i /><i /></div>
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

function PowerGhost({ power, onToggle, className }: { power: boolean; onToggle: () => void; className: string }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className={`hw-tower-power ${className}`}
      aria-pressed={power}
      aria-label={t('Device power')}
      title={t('Device power')}
      onClick={onToggle}
    />
  )
}

function TowerScrews({ points }: { points: Array<[number, number]> }) {
  return (
    <g>
      {points.map(([x, y], index) => (
        <g key={index} transform={`translate(${x} ${y})`}>
          <circle r="6.5" fill="#b9bcb9" stroke="#6f7270" />
          <rect x="-4.6" y="-1.1" width="9.2" height="2.2" rx="1" fill="#6f7270" />
        </g>
      ))}
    </g>
  )
}

function TowerFrontArt() {
  return (
    <svg className="hw-tower-art" viewBox="0 0 389 932" aria-hidden="true">
      <defs>
        <linearGradient id="twF-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9ba19f" />
          <stop offset="0.1" stopColor="#b6bbb8" />
          <stop offset="0.72" stopColor="#c2c7c4" />
          <stop offset="1" stopColor="#d4d8d5" />
        </linearGradient>
        <linearGradient id="twF-panel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#aab0ad" />
          <stop offset="1" stopColor="#bcc1be" />
        </linearGradient>
        <linearGradient id="twF-bay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b2b7b4" />
          <stop offset="1" stopColor="#c9cdca" />
        </linearGradient>
        <linearGradient id="twF-floppy" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c6cac7" />
          <stop offset="1" stopColor="#aeb3b0" />
        </linearGradient>
        <linearGradient id="twF-grille" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d6673" />
          <stop offset="1" stopColor="#454e5b" />
        </linearGradient>
        <radialGradient id="twF-power" cx="0.38" cy="0.32" r="0.9">
          <stop offset="0" stopColor="#a3554a" />
          <stop offset="0.55" stopColor="#8a4338" />
          <stop offset="1" stopColor="#6c2f28" />
        </radialGradient>
        <pattern id="twF-holes" width="31" height="60" patternUnits="userSpaceOnUse" x="8" y="402">
          <circle cx="7.75" cy="13.4" r="10.6" fill="#96a0ac" opacity="0.55" />
          <circle cx="7.75" cy="15" r="9" fill="#12171e" />
          <circle cx="23.25" cy="43.4" r="10.6" fill="#96a0ac" opacity="0.55" />
          <circle cx="23.25" cy="45" r="9" fill="#12171e" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="386" height="929" rx="9" fill="url(#twF-body)" stroke="#7d8380" strokeWidth="1.5" />
      <rect x="3" y="3" width="383" height="15" rx="7" fill="#d5d9d6" opacity="0.6" />
      <rect x="2.5" y="20" width="5" height="894" fill="#8e9491" opacity="0.45" />
      <rect x="379" y="20" width="7" height="894" fill="#daddda" opacity="0.5" />
      <rect x="24" y="30" width="336" height="228" rx="3" fill="url(#twF-panel)" stroke="#878d8a" strokeWidth="1.2" />
      <rect x="24" y="30" width="336" height="5" fill="#7a807d" opacity="0.4" />
      <rect x="42" y="48" width="298" height="84" rx="5" fill="#c4c9c6" stroke="#6f7572" strokeWidth="1.4" />
      <rect x="56" y="60" width="270" height="60" rx="3" fill="url(#twF-bay)" stroke="#7c8280" />
      <rect x="42" y="146" width="298" height="2" fill="#9ba19e" />
      <rect x="286" y="184" width="16" height="8" rx="4" fill="#3c413f" />
      <rect x="310" y="176" width="30" height="22" rx="3" fill="#c7cbc8" stroke="#7b817f" />
      <rect x="85" y="262" width="192" height="96" rx="3" fill="url(#twF-floppy)" stroke="#7e8481" strokeWidth="1.2" />
      <rect x="93" y="270" width="176" height="32" fill="#ccd1ce" />
      <rect x="93" y="302" width="176" height="18" fill="#2a2d30" />
      <rect x="95" y="306" width="172" height="2" fill="#d9dddb" opacity="0.55" />
      <rect x="93" y="320" width="176" height="24" fill="#3b3e41" />
      <rect x="166" y="332" width="30" height="10" rx="2" fill="#b8bdb9" stroke="#838986" />
      <rect x="317" y="281" width="22" height="9" rx="3" fill="#c6d92e" stroke="#7f8c1e" />
      <circle cx="326" cy="312" r="17.5" fill="#d6dad7" />
      <circle cx="326" cy="312" r="15.5" fill="url(#twF-power)" stroke="#472f2b" />
      <path d="M312 322 A18.5 18.5 0 0 0 340 322" fill="none" stroke="#eef1ee" strokeWidth="2.4" opacity="0.75" strokeLinecap="round" />
      <rect x="8" y="402" width="373" height="470" rx="4" fill="url(#twF-grille)" stroke="#333c47" strokeWidth="1.2" />
      <rect x="8" y="402" width="373" height="470" rx="4" fill="url(#twF-holes)" />
      <rect x="8" y="402" width="373" height="6" fill="#2c343e" opacity="0.5" />
      <rect x="70" y="790" width="182" height="66" rx="5" fill="#33363a" stroke="#222528" />
      <rect x="252" y="778" width="110" height="82" rx="4" fill="#b9beb9" stroke="#7b817e" />
      <rect x="258" y="784" width="98" height="70" rx="3" fill="#2c3034" stroke="#171a1d" />
      <circle cx="263" cy="820" r="3" fill="#1c1f22" />
      <circle cx="351" cy="820" r="3" fill="#1c1f22" />
      <circle cx="169" cy="905" r="11" fill="#4f9a52" />
      <circle cx="169" cy="905" r="6.4" fill="#1f2421" />
      <path d="M188 899 a8 8 0 0 1 0 12" fill="none" stroke="#2e3330" strokeWidth="2.4" />
      <rect x="184" y="897" width="4" height="5" rx="1.2" fill="#2e3330" />
      <rect x="184" y="908" width="4" height="5" rx="1.2" fill="#2e3330" />
      <rect x="220" y="897" width="27" height="16" rx="2.5" fill="#2e3330" />
      <rect x="223.5" y="900.5" width="20" height="7" rx="1.5" fill="#c9cdca" />
      <circle cx="268" cy="907" r="2.6" fill="#2e3330" />
      <path d="M268 905 V897 M262 899 l6 -3 6 3 M264.5 905 v-4 M271.5 905 v-4" stroke="#2e3330" strokeWidth="1.8" fill="none" />
      <rect x="292" y="897" width="27" height="16" rx="2.5" fill="#2e3330" />
      <rect x="295.5" y="900.5" width="20" height="7" rx="1.5" fill="#c9cdca" />
      <rect x="331" y="896" width="11" height="13" rx="2" fill="none" stroke="#2e3330" strokeWidth="2" />
      <path d="M333 909 v3 M340 909 v3 M332.5 903 a4.2 4.2 0 0 1 8 0" fill="none" stroke="#2e3330" strokeWidth="1.8" />
      <circle cx="360" cy="905" r="11" fill="#c07a9b" />
      <circle cx="360" cy="905" r="6.4" fill="#1f2421" />
    </svg>
  )
}

function TowerRearArt() {
  return (
    <svg className="hw-tower-art" viewBox="0 0 389 932" aria-hidden="true">
      <defs>
        <linearGradient id="twR-body" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5b5f5c" />
          <stop offset="0.15" stopColor="#6e736f" />
          <stop offset="0.8" stopColor="#787d79" />
          <stop offset="1" stopColor="#5f6461" />
        </linearGradient>
        <linearGradient id="twR-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b908c" />
          <stop offset="1" stopColor="#747974" />
        </linearGradient>
        <pattern id="twR-mesh" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="2.6" fill="#2e332f" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="386" height="929" rx="9" fill="url(#twR-body)" stroke="#42463f" strokeWidth="1.5" />
      <rect x="3" y="3" width="383" height="12" rx="6" fill="#9aa09b" opacity="0.4" />
      <rect x="30" y="28" width="190" height="150" rx="4" fill="url(#twR-metal)" stroke="#565b56" strokeWidth="1.2" />
      <circle cx="94" cy="100" r="50" fill="#666b66" stroke="#4d524d" strokeWidth="2" />
      <circle cx="94" cy="100" r="50" fill="url(#twR-mesh)" />
      <circle cx="94" cy="100" r="14" fill="#5d625d" stroke="#434843" />
      <circle cx="94" cy="100" r="4" fill="#2f332f" />
      <rect x="150" y="48" width="56" height="40" rx="3" fill="#22261f" stroke="#3f443f" />
      <rect x="158" y="56" width="8" height="24" rx="2" fill="#111511" />
      <rect x="172" y="56" width="8" height="24" rx="2" fill="#111511" />
      <rect x="186" y="56" width="12" height="12" rx="2" fill="#111511" />
      <text x="94" y="170" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="11" fill="#c2c7c2">100-240V~ 50/60Hz</text>
      <rect x="228" y="28" width="130" height="128" rx="3" fill="#9aa09b" stroke="#6b706b" />
      <circle cx="252" cy="54" r="11" fill="#7b4f9e" />
      <circle cx="252" cy="54" r="5" fill="#4a2e63" />
      <circle cx="252" cy="86" r="11" fill="#4f9e6b" />
      <circle cx="252" cy="86" r="5" fill="#2e633f" />
      <rect x="272" y="42" width="30" height="22" rx="2" fill="#2a2d2a" />
      <rect x="275" y="45" width="24" height="7" fill="#111511" />
      <rect x="275" y="54" width="24" height="7" fill="#111511" />
      <rect x="310" y="42" width="38" height="22" rx="3" fill="#3f7f8a" />
      <rect x="315" y="46" width="28" height="14" rx="2" fill="#2c5f68" />
      <rect x="310" y="74" width="38" height="22" rx="3" fill="#42618f" />
      <rect x="315" y="78" width="28" height="14" rx="2" fill="#2e4566" />
      <rect x="272" y="76" width="30" height="22" rx="2" fill="#8b908b" />
      <rect x="276" y="80" width="22" height="14" rx="1.5" fill="#20241f" />
      <circle cx="254" cy="120" r="7" fill="#4f9e6b" />
      <circle cx="272" cy="120" r="7" fill="#d08bb4" />
      <circle cx="290" cy="120" r="7" fill="#4f7f9e" />
      <rect x="310" y="106" width="38" height="26" rx="3" fill="#9a5b8f" />
      <rect x="316" y="112" width="26" height="14" rx="2" fill="#6e3f66" />
      <rect x="300" y="186" width="58" height="34" rx="3" fill="#2a2d2b" stroke="#4d524d" />
      <rect x="302" y="188" width="27" height="30" rx="2" fill="#b03a30" />
      {[202, 238, 274, 310].map(y => (
        <g key={y}>
          <rect x="30" y={y} width="190" height="28" rx="2" fill="#7d817d" stroke="#5a5e5a" />
          <circle cx="212" cy={y + 14} r="4" fill="#9aa09b" stroke="#5f645f" />
        </g>
      ))}
      <rect x="48" y="372" width="293" height="272" rx="7" fill="#3f4340" stroke="#2c302d" strokeWidth="1.4" />
      <circle cx="64" cy="388" r="4" fill="#5f645f" />
      <circle cx="325" cy="388" r="4" fill="#5f645f" />
      <circle cx="64" cy="628" r="4" fill="#5f645f" />
      <circle cx="325" cy="628" r="4" fill="#5f645f" />
      <rect x="60" y="392" width="270" height="10" rx="3" fill="#565b56" />
      <rect x="60" y="614" width="270" height="10" rx="3" fill="#565b56" />
      <circle cx="100" cy="742" r="62" fill="#5d625d" stroke="#4a4f4a" strokeWidth="2" />
      <circle cx="100" cy="742" r="62" fill="url(#twR-mesh)" />
      <circle cx="100" cy="742" r="16" fill="#6b706b" stroke="#4a4f4a" />
      <circle cx="100" cy="742" r="5" fill="#33372f" />
      {Array.from({ length: 12 }, (_, index) => (
        <rect key={index} x={226 + index * 12} y="686" width="7" height="150" rx="3" fill="#4d524d" />
      ))}
      <TowerScrews points={[[18, 330], [18, 500], [371, 330], [371, 500]]} />
    </svg>
  )
}

function ServerFrontArt() {
  return (
    <svg className="hw-server-art" viewBox="0 0 1010 443" aria-hidden="true">
      <defs>
        <linearGradient id="svF-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#464844" />
          <stop offset="1" stopColor="#343633" />
        </linearGradient>
        <linearGradient id="svF-door" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8aba8" />
          <stop offset="1" stopColor="#949794" />
        </linearGradient>
        <linearGradient id="svF-rail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c8cbc8" />
          <stop offset="0.5" stopColor="#b0b3b0" />
          <stop offset="1" stopColor="#9a9d9a" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="1007" height="440" rx="7" fill="url(#svF-body)" stroke="#191a19" strokeWidth="2" />
      <rect x="3" y="3" width="1004" height="8" rx="4" fill="#6a6b66" opacity="0.45" />
      <rect x="6" y="118" width="24" height="252" rx="8" fill="url(#svF-rail)" stroke="#8f9290" />
      <rect x="62" y="34" width="298" height="358" rx="6" fill="none" stroke="#b9bcb9" strokeWidth="2.5" />
      {[[62, 34], [342, 34], [62, 374], [342, 374]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="18" height="18" rx="3" fill="#c2c5c2" stroke="#9a9d9a" />
          <circle cx={x + 9} cy={y + 9} r="3.4" fill="#3f423f" />
        </g>
      ))}
      {Array.from({ length: 8 }, (_, index) => {
        const y = 44 + index * 43
        return (
          <g key={index}>
            <rect x="66" y={y} width="36" height="35" rx="3" fill="#b6b9b6" stroke="#8f9290" />
            <ellipse cx="84" cy={y + 17.5} rx="6.5" ry="9.5" fill="#6d706d" />
            <rect x="102" y={y} width="212" height="35" rx="2" fill="#191a1c" stroke="#0d0e0f" />
            <rect x="102" y={y} width="212" height="9" rx="2" fill="#2c2e30" />
            <rect x="238" y={y + 11} width="52" height="15" rx="2" fill="#0f2438" />
            <rect x="243" y={y + 15} width="12" height="3" fill="#4a86c8" />
            <rect x="259" y={y + 15} width="18" height="3" fill="#4a86c8" />
            <rect x="243" y={y + 21} width="32" height="2.5" fill="#3f6ea8" />
            <rect x="318" y={y + 5} width="14" height="25" rx="2" fill="#3a3c3e" stroke="#1d1f21" />
          </g>
        )
      })}
      <rect x="372" y="60" width="336" height="330" rx="9" fill="url(#svF-door)" stroke="#7e817e" strokeWidth="1.5" />
      <rect x="394" y="126" width="64" height="212" rx="4" fill="#9da09d" stroke="#8b8e8b" />
      <rect x="468" y="126" width="16" height="212" rx="3" fill="#9da09d" stroke="#8b8e8b" />
      <line x1="500" y1="78" x2="500" y2="374" stroke="#8b8e8b" strokeWidth="2" />
      <line x1="596" y1="78" x2="596" y2="374" stroke="#8b8e8b" strokeWidth="2" />
      <rect x="612" y="126" width="16" height="196" rx="3" fill="#b0b3b0" stroke="#8b8e8b" />
      <rect x="630" y="150" width="8" height="120" rx="3" fill="#838683" />
      <rect x="554" y="176" width="4" height="12" fill="#7d807d" />
      <rect x="548" y="368" width="18" height="12" rx="3" fill="#8b8e8b" />
      <rect x="724" y="150" width="262" height="188" rx="9" fill="#3a3c3e" stroke="#232527" strokeWidth="1.5" />
      <rect x="738" y="206" width="236" height="52" rx="5" fill="#1c1e20" stroke="#0e1012" />
      <rect x="738" y="272" width="236" height="52" rx="5" fill="#1c1e20" stroke="#0e1012" />
      <circle cx="952" cy="396" r="17" fill="#8b8f8b" stroke="#5a5f5a" />
      <circle cx="952" cy="396" r="13.5" fill="#3d423e" />
      <path d="M948.5 394 a4 4 0 1 1 7 2.6" fill="none" stroke="#cfd3d0" strokeWidth="2" strokeLinecap="round" />
      <path d="M952 388 v6" stroke="#cfd3d0" strokeWidth="2" strokeLinecap="round" />
      <TowerScrews points={[[30, 25], [215, 14], [370, 25], [455, 14], [925, 25], [960, 35], [30, 418], [215, 430], [370, 418], [925, 418], [16, 390], [994, 150], [994, 330]]} />
    </svg>
  )
}

function ServerRearArt() {
  return (
    <svg className="hw-server-art" viewBox="0 0 1010 443" aria-hidden="true">
      <defs>
        <linearGradient id="svR-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#41433f" />
          <stop offset="1" stopColor="#30322f" />
        </linearGradient>
        <linearGradient id="svR-metal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#848984" />
          <stop offset="1" stopColor="#6e736e" />
        </linearGradient>
        <pattern id="svR-mesh" width="9" height="9" patternUnits="userSpaceOnUse">
          <circle cx="4.5" cy="4.5" r="2.6" fill="#2b302b" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="1007" height="440" rx="7" fill="url(#svR-body)" stroke="#191a19" strokeWidth="2" />
      <rect x="3" y="3" width="1004" height="8" rx="4" fill="#6a6b66" opacity="0.45" />
      {[30, 250].map(x => (
        <g key={x}>
          <rect x={x} y="70" width="200" height="160" rx="5" fill="url(#svR-metal)" stroke="#565b56" />
          <circle cx={x + 80} cy="150" r="52" fill="#636863" stroke="#4d524d" strokeWidth="2" />
          <circle cx={x + 80} cy="150" r="52" fill="url(#svR-mesh)" />
          <circle cx={x + 80} cy="150" r="14" fill="#5d625d" stroke="#434843" />
          <circle cx={x + 80} cy="150" r="4" fill="#2f332f" />
          <rect x={x + 142} y="92" width="46" height="34" rx="3" fill="#22261f" stroke="#3f443f" />
          <rect x={x + 148} y="98" width="7" height="20" rx="2" fill="#111511" />
          <rect x={x + 159} y="98" width="7" height="20" rx="2" fill="#111511" />
          <rect x={x + 170} y="98" width="10" height="10" rx="2" fill="#111511" />
          <rect x={x + 142} y="146" width="34" height="24" rx="3" fill="#2a2e2a" stroke="#4d524d" />
          <rect x={x + 144} y="148" width="15" height="20" rx="2" fill="#b03a30" />
        </g>
      ))}
      <rect x="470" y="60" width="280" height="320" rx="8" fill="#3f4340" stroke="#2c302d" strokeWidth="1.4" />
      <circle cx="486" cy="76" r="4" fill="#5f645f" />
      <circle cx="734" cy="76" r="4" fill="#5f645f" />
      <circle cx="486" cy="364" r="4" fill="#5f645f" />
      <circle cx="734" cy="364" r="4" fill="#5f645f" />
      <rect x="780" y="70" width="200" height="140" rx="4" fill="#9aa09b" stroke="#6b706b" />
      <circle cx="802" cy="92" r="11" fill="#7b4f9e" />
      <circle cx="802" cy="92" r="5" fill="#4a2e63" />
      <circle cx="802" cy="122" r="11" fill="#4f9e6b" />
      <circle cx="802" cy="122" r="5" fill="#2e633f" />
      <rect x="820" y="80" width="30" height="36" rx="2" fill="#2a2d2a" />
      <rect x="823" y="84" width="24" height="12" fill="#111511" />
      <rect x="823" y="99" width="24" height="12" fill="#111511" />
      <rect x="858" y="80" width="30" height="24" rx="2" fill="#8b908b" />
      <rect x="862" y="84" width="22" height="16" rx="1.5" fill="#20241f" />
      <circle cx="862" cy="120" r="7" fill="#4f9e6b" />
      <circle cx="878" cy="120" r="7" fill="#d08bb4" />
      <circle cx="894" cy="120" r="7" fill="#4f7f9e" />
      <rect x="904" y="80" width="44" height="22" rx="3" fill="#3f7f8a" />
      <rect x="909" y="84" width="34" height="14" rx="2" fill="#2c5f68" />
      <rect x="904" y="112" width="44" height="22" rx="3" fill="#42618f" />
      <rect x="909" y="116" width="34" height="14" rx="2" fill="#2e4566" />
      <rect x="820" y="128" width="44" height="24" rx="3" fill="#9a5b8f" />
      <rect x="825" y="133" width="34" height="14" rx="2" fill="#6e3f66" />
      {[230, 268, 306, 344].map(y => (
        <g key={y}>
          <rect x="780" y={y} width="200" height="26" rx="2" fill="#6b6f6c" stroke="#53575a" />
          <circle cx="966" cy={y + 13} r="4" fill="#9aa09b" stroke="#5f645f" />
        </g>
      ))}
      <rect x="880" y="384" width="64" height="36" rx="3" fill="#2a2d2b" stroke="#4d524d" />
      <rect x="882" y="386" width="30" height="32" rx="2" fill="#b03a30" />
      <TowerScrews points={[[16, 40], [994, 40], [16, 400], [994, 400]]} />
    </svg>
  )
}

function TowerChassis(props: ChassisProps) {
  const { profile, face, power } = props
  const rear = face === profile.portFace
  return (
    <div className="hw-tower" data-face={face}>
      {rear ? <TowerRearArt /> : <TowerFrontArt />}
      {profile.slots > 0 && (rear ? (
        <div className="hw-tower-slotplate">
          {Array.from({ length: profile.slots }, (_, slot) => (
            <ModuleBay key={slot} {...props} slot={slot} compact />
          ))}
        </div>
      ) : (
        <CardPortButton
          ports={props.ports}
          power={power}
          selectedPortId={props.selectedPortId}
          onSelect={props.onSelectPort}
          className="hw-tower-cardwin"
        />
      ))}
      <PowerGhost power={power} onToggle={props.onTogglePower} className={rear ? 'hw-tower-power-rear' : 'hw-tower-power-front'} />
    </div>
  )
}

function ServerChassis(props: ChassisProps) {
  const { profile, face, power } = props
  const rear = face === profile.portFace
  return (
    <div className="hw-server" data-face={face}>
      {rear ? <ServerRearArt /> : <ServerFrontArt />}
      {profile.slots > 0 && (rear ? (
        <div className="hw-server-slotplate">
          {Array.from({ length: profile.slots }, (_, slot) => (
            <ModuleBay key={slot} {...props} slot={slot} compact />
          ))}
        </div>
      ) : (
        <CardPortButton
          ports={props.ports}
          power={power}
          selectedPortId={props.selectedPortId}
          onSelect={props.onSelectPort}
          className="hw-server-cardwin"
        />
      ))}
      <PowerGhost power={power} onToggle={props.onTogglePower} className={rear ? 'hw-server-power-rear' : 'hw-server-power-front'} />
    </div>
  )
}

function DesktopChassis(props: ChassisProps) {
  if (props.device.type === 'laptop') return <LaptopChassis {...props} />
  if (props.device.type === 'server') return <ServerChassis {...props} />
  return <TowerChassis {...props} />
}

function LaptopChassis(props: ChassisProps) {
  const { device, power, face } = props
  const side = face === 'rear'
  const bay = props.profile.slots > 0 ? (
    <div className="hw-laptop-slotbay"><ModuleBay {...props} slot={0} compact /></div>
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
      <span className="hw-laptop-power-dome" aria-hidden="true" />
      <span className="hw-laptop-power-led" aria-hidden="true" />
    </button>
  )
  return (
    <div className={`hw-laptop ${side ? 'is-side' : 'is-top'}`} data-face={face}>
      {side ? (
        <div className="hw-laptop-side">
          <svg className="hw-laptop-side-art" viewBox="0 0 760 604" aria-hidden="true">
            <defs>
              <linearGradient id="lap-lid" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#aab2b6" />
                <stop offset=".16" stopColor="#8b969b" />
                <stop offset=".58" stopColor="#616c71" />
                <stop offset="1" stopColor="#3d474c" />
              </linearGradient>
              <linearGradient id="lap-base" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#d7dcde" />
                <stop offset=".3" stopColor="#c3cbcd" />
                <stop offset=".72" stopColor="#a7b2b6" />
                <stop offset="1" stopColor="#828e93" />
              </linearGradient>
              <linearGradient id="lap-cap" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#4c565b" />
                <stop offset="1" stopColor="#2c353a" />
              </linearGradient>
              <linearGradient id="lap-hinge" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e4e8e9" />
                <stop offset="1" stopColor="#a2acb0" />
              </linearGradient>
              <radialGradient id="lap-shadow" cx=".5" cy=".5" r=".5">
                <stop offset="0" stopColor="#0b1418" stopOpacity=".34" />
                <stop offset="1" stopColor="#0b1418" stopOpacity="0" />
              </radialGradient>
            </defs>
            <ellipse cx="392" cy="594" rx="336" ry="16" fill="url(#lap-shadow)" />
            <path d="M6 588 L6 34 Q6 6 26 6 Q44 6 44 34 L44 588 Z" fill="url(#lap-lid)" stroke="#2f393e" strokeWidth="1" />
            <path d="M11 42 L11 574" stroke="#dde3e5" strokeWidth="1.6" opacity=".38" />
            <path d="M39 24 L39 582" stroke="#20292d" strokeWidth="2" opacity=".5" />
            <path d="M44 478 L120 476 L300 483 L540 496 L700 502 Q748 505 754 522 L758 550 Q758 568 738 575 L92 592 Q54 593 46 576 L44 478 Z" fill="url(#lap-base)" stroke="#7b878c" strokeWidth="1.2" />
            <path d="M46 574 L738 556 L734 574 L92 591 Q64 591 54 580 Z" fill="#6f7b80" opacity=".5" />
            <path d="M46 480 L120 478 L300 485 L540 498 L700 504" fill="none" stroke="#eef2f3" strokeWidth="1.5" opacity=".72" />
            <path d="M36 480 L52 480 L58 570 Q58 584 44 586 L36 584 Z" fill="url(#lap-cap)" opacity=".9" />
            {Array.from({ length: 6 }, (_, index) => (
              <rect key={`vent-${index}`} x={128 + index * 19} y={506} width={11} height={62} rx={4} fill="#1a2327" stroke="#5f6c72" strokeWidth=".8" />
            ))}
            <path d="M86 532 C86 556 70 566 66 584 C63 594 70 600 82 598" fill="none" stroke="#1b2226" strokeWidth="4" />
            <rect x="68" y="506" width="30" height="26" rx="5" fill="#20282c" stroke="#59666c" strokeWidth="1.4" />
            <rect x="74" y="512" width="18" height="14" rx="4" fill="#0a0e10" stroke="#8d9aa0" strokeWidth="1" />
            <circle cx="106" cy="512" r="3" fill="#8ad34f" stroke="#c8f39a" strokeWidth=".8" />
            <rect x="248" y="506" width="84" height="58" rx="3" fill="#b7c1c4" stroke="#748187" strokeWidth="1.2" />
            <rect x="255" y="513" width="70" height="44" rx="2" fill="#a7b2b6" stroke="#8b979c" strokeWidth=".8" />
            <path d="M332 522 L340 522 L340 548 L332 548" fill="#9aa5a9" stroke="#6f7b80" strokeWidth="1" />
            <path d="M340 528 L346 528 M340 536 L346 536 M340 544 L346 544" stroke="#5e6a6f" strokeWidth="2" />
            <rect x="344" y="500" width="154" height="46" rx="3" fill="#0a0f12" stroke="#6e7a80" strokeWidth="1.4" />
            <rect x="348" y="504" width="146" height="38" rx="2" fill="#05080a" stroke="#2c363b" strokeWidth="1" />
            <path d="M352 542 L492 542" stroke="#8d9a9f" strokeWidth="1" opacity=".55" />
            <circle cx="524" cy="524" r="10" fill="#2a3338" stroke="#5e6b70" strokeWidth="1.2" />
            <circle cx="524" cy="524" r="5" fill="#3f9a4a" stroke="#8fd39a" strokeWidth="1" />
            <circle cx="548" cy="524" r="10" fill="#2a3338" stroke="#5e6b70" strokeWidth="1.2" />
            <circle cx="548" cy="524" r="5" fill="#b45a6a" stroke="#e0a0ac" strokeWidth="1" />
            <rect x="592" y="512" width="34" height="20" rx="2" fill="#2f393e" stroke="#8d9aa0" strokeWidth="1.2" />
            <rect x="596" y="516" width="26" height="12" rx="1" fill="#0a0f12" />
            <rect x="636" y="512" width="34" height="20" rx="2" fill="#2f393e" stroke="#8d9aa0" strokeWidth="1.2" />
            <rect x="640" y="516" width="26" height="12" rx="1" fill="#0a0f12" />
            <path d="M609 500 L609 507 M606 502 L612 502 M609 502 L605 498 M609 503 L613 499" stroke="#6f7d82" strokeWidth="1.1" fill="none" />
            <circle cx="605" cy="498" r="1.4" fill="#6f7d82" />
            <rect x="611.5" y="497" width="3" height="3" fill="#6f7d82" />
            <path d="M653 500 L653 507 M650 502 L656 502 M653 502 L649 498 M653 503 L657 499" stroke="#6f7d82" strokeWidth="1.1" fill="none" />
            <circle cx="649" cy="498" r="1.4" fill="#6f7d82" />
            <rect x="655.5" y="497" width="3" height="3" fill="#6f7d82" />
            <circle cx="732" cy="522" r="15" fill="#222b30" stroke="#5f6c72" strokeWidth="1.4" />
            <circle cx="732" cy="522" r="11" fill="#3a4449" />
            {Array.from({ length: 16 }, (_, index) => {
              const x = 112 + index * 27
              const y = 477 + (x - 120) * 0.06
              return (
                <g key={`key-${index}`}>
                  <rect x={x} y={y - 13} width={23} height={8} rx={3} fill="#ccd4d6" stroke="#7c888d" strokeWidth="1" />
                  <rect x={x + 1} y={y - 6} width={21} height={6} rx={1.5} fill="#8e9a9f" stroke="#6f7b80" strokeWidth=".8" />
                </g>
              )
            })}
            <path d="M38 486 Q38 458 62 458 L88 458 Q106 458 110 478 L112 488 L38 488 Z" fill="url(#lap-hinge)" stroke="#7b878c" strokeWidth="1.2" />
            <path d="M46 462 Q54 461 64 461 L88 461" fill="none" stroke="#eef2f3" strokeWidth="1.4" opacity=".8" />
            <rect x="104" y="590" width="34" height="10" rx="4" fill="#2a3338" />
            <rect x="596" y="584" width="30" height="10" rx="4" fill="#2a3338" />
          </svg>
          {bay}
          {powerButton}
        </div>
      ) : (
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
    <div className={`hw-generic hw-generic-${shape}`} data-face={face} data-power={power ? 'on' : 'off'}>
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

function SnifferChassis(props: ChassisProps) {
  const { device, profile, power } = props
  const { t } = useI18n()
  return (
    <div className="hw-sniffer" data-power={power ? 'on' : 'off'}>
      <div className="hw-sniffer-top">
        <span className="hw-sniffer-brand" dir="ltr">
          <strong>{device.model}</strong>
          <small>{t('Packet Capture')}</small>
        </span>
        <span className="hw-status"><span className="hw-led" data-state={power ? 'up' : 'down'} /><small>PWR</small></span>
        <PowerSwitch power={power} onToggle={props.onTogglePower} />
      </div>
      <div className="hw-sniffer-bays">
        {Array.from({ length: profile.slots }, (_, slot) => (
          <ModuleBay key={slot} {...props} slot={slot} />
        ))}
      </div>
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
    case 'sniffer':
      return <SnifferChassis {...props} />
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
