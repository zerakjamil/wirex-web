'use client'

import React, { useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import type { AclRule, NetworkPort } from '@/types/network'
import { formatAclRunningConfig } from '@/simulator/acl'
import {
  ISA_RULE_LIMIT,
  ISA_TRAFFIC_TYPES,
  buildIsaDenyRule,
  insertIsaRule,
  isIsaPermitAllRule,
  isaDefaultAclRules,
  isaFirewallPorts,
  readIsaAcl,
  type IsaBlockKind,
} from '@/simulator/isa'
import { useI18n } from '@/i18n/useI18n'

const sidebarButton = 'w-full border border-transparent px-2 py-2 text-left transition-colors'
const fieldLabel = 'flex flex-col gap-1 text-[10.5px] font-semibold text-[#3b4a3f]'
const field = 'h-[27px] min-w-0 border border-[#aab6ab] bg-white px-1.5 text-[11px] text-[#1f2b24] outline-none focus:border-[#3f7a52]'
const primaryButton = 'inline-flex h-[28px] items-center justify-center border border-[#2e5b3e] bg-[#3f7a52] px-3 text-[11px] font-semibold text-white transition-colors hover:bg-[#356847] disabled:cursor-not-allowed disabled:opacity-45'
const secondaryButton = 'inline-flex h-[28px] items-center justify-center border border-[#aab6ab] bg-white px-3 text-[11px] text-[#26382b] transition-colors hover:bg-[#eef3ed] disabled:cursor-not-allowed disabled:opacity-45'
const dangerButton = 'inline-flex h-[22px] items-center justify-center border border-[#c9b3b3] bg-[#fffafa] px-1.5 text-[10px] text-[#8a2f2f] transition-colors hover:bg-[#f8eeee]'
const iconButton = 'inline-flex h-[22px] w-[22px] items-center justify-center border border-[#b8c3b8] bg-white text-[12px] text-[#314237] transition-colors hover:bg-[#eef3ed] disabled:cursor-not-allowed disabled:opacity-35'

type Status = { key: string; tone: 'info' | 'error' }

function interfaceLabel(port: NetworkPort): string {
  return port.nameif ? port.nameif.charAt(0).toUpperCase() + port.nameif.slice(1) : port.name
}

function addressLabel(ip: string | undefined, wildcard: string | undefined, anyLabel: string): string {
  if (!ip || ip === 'any') return anyLabel
  if (wildcard === '0.0.0.0') return `host ${ip}`
  return wildcard ? `${ip} ${wildcard}` : ip
}

function ruleSummary(rule: AclRule, anyLabel: string): string {
  if (rule.remark) return rule.remark
  if (rule.type === 'standard') {
    return addressLabel(rule.sourceIp, rule.wildcard, anyLabel)
  }
  const source = addressLabel(rule.sourceIp, rule.sourceWildcard, anyLabel)
  const destination = addressLabel(rule.destIp, rule.destWildcard, anyLabel)
  const port = rule.destPort !== undefined ? ` eq ${rule.destPort}` : ''
  return `${rule.protocol.toUpperCase()} ${source} -> ${destination}${port}`
}

export function IsaFirewallTab({ deviceId }: { deviceId: string }) {
  const { t } = useI18n()
  const device = useNetworkStore(state => state.devices.find(candidate => candidate.id === deviceId))
  const updateDeviceConfig = useNetworkStore(state => state.updateDeviceConfig)
  const updatePortConfig = useNetworkStore(state => state.updatePortConfig)
  const ports = device ? isaFirewallPorts(device) : []
  const [requestedPortId, setRequestedPortId] = useState('')
  const [draftState, setDraftState] = useState<AclRule[] | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [blockKind, setBlockKind] = useState<IsaBlockKind>('source')
  const [host, setHost] = useState('')
  const [trafficType, setTrafficType] = useState('http')

  const selectedPort = ports.find(port => port.id === requestedPortId) ?? ports[0]
  const selectedPortId = selectedPort?.id ?? ''
  const acl = selectedPort && device ? readIsaAcl(device, selectedPort) : undefined
  const aclId = acl?.aclId ?? ''
  const savedAcl = acl?.acl
  const savedRules = savedAcl?.rules ?? []

  if (!device || !selectedPort) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f5f7f4] p-4 text-[11px] text-[#526257]">
        {t('No routed interfaces are available for firewall configuration.')}
      </div>
    )
  }

  const draft = draftState ?? savedRules
  const dirty = draftState !== null && JSON.stringify(draftState) !== JSON.stringify(savedRules)
  const standardAcl = savedAcl?.type === 'standard'
  const needsHost = blockKind !== 'traffic'
  const showTraffic = blockKind === 'traffic' || blockKind === 'traffic-source'
  const allowAdd = !standardAcl && draft.length < ISA_RULE_LIMIT

  const cliText = [
    ...formatAclRunningConfig([{ id: aclId, type: savedAcl?.type ?? 'extended', rules: draft }], { includeAclType: true }),
    `access-group ${aclId} in interface ${selectedPort.nameif ?? selectedPort.name}`,
  ].join('\n')

  const selectPort = (portId: string) => {
    if (portId === selectedPortId) return
    if (dirty) {
      setStatus({ key: 'Save or discard your firewall changes before switching interfaces.', tone: 'error' })
      return
    }
    setRequestedPortId(portId)
    setDraftState(null)
    setStatus(null)
  }

  const addRule = () => {
    if (standardAcl) {
      setStatus({ key: 'This interface uses a standard ACL. Choose another interface or use the CLI.', tone: 'error' })
      return
    }
    if (draft.length >= ISA_RULE_LIMIT) {
      setStatus({ key: 'Firewall rule limit reached. Remove a rule before adding another.', tone: 'error' })
      return
    }
    const rule = buildIsaDenyRule(blockKind, host, trafficType)
    if (!rule) {
      setStatus({ key: 'Enter a valid IPv4 address.', tone: 'error' })
      return
    }
    setDraftState(current => {
      const base = current ?? savedRules
      return insertIsaRule(base.length === 0 ? isaDefaultAclRules() : base, rule)
    })
    setHost('')
    setStatus({ key: 'Rule added.', tone: 'info' })
  }

  const removeRule = (index: number) => {
    setDraftState(current => (current ?? savedRules).filter((_, candidate) => candidate !== index))
    setStatus({ key: 'Rule removed.', tone: 'info' })
  }

  const moveRule = (index: number, offset: number) => {
    setDraftState(current => {
      const rules = current ?? savedRules
      const target = index + offset
      if (target < 0 || target >= rules.length) return rules
      const next = [...rules]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setStatus(null)
  }

  const restorePermit = () => {
    if (standardAcl) {
      setStatus({ key: 'This interface uses a standard ACL. Choose another interface or use the CLI.', tone: 'error' })
      return
    }
    setDraftState(current => (current ?? savedRules).filter(rule => !isIsaPermitAllRule(rule)).concat(isaDefaultAclRules()))
    setStatus({ key: 'Permit-all rule restored.', tone: 'info' })
  }

  const discard = () => {
    setDraftState(null)
    setStatus({ key: 'Firewall configuration discarded.', tone: 'info' })
  }

  const save = () => {
    if (standardAcl) {
      setStatus({ key: 'This interface uses a standard ACL. Choose another interface or use the CLI.', tone: 'error' })
      return
    }
    const nextAcl = { id: aclId, type: 'extended' as const, rules: draft }
    const lists = [...(device.config.accessLists ?? [])]
    const index = lists.findIndex(candidate => candidate.id === aclId)
    if (index >= 0) lists[index] = nextAcl
    else lists.push(nextAcl)
    updateDeviceConfig(device.id, { accessLists: lists })
    if (selectedPort.inboundAcl !== aclId) updatePortConfig(device.id, selectedPort.id, { inboundAcl: aclId })
    setDraftState(null)
    setStatus({ key: 'Firewall configuration saved.', tone: 'info' })
  }

  return (
    <div className="@container flex h-full min-h-0 flex-col bg-[#f5f7f4] text-[#1f2b24]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[#c4cec4] bg-white px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="border border-[#3f7a52] bg-[#edf5ee] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-[#2e5b3e]">ISA</span>
            <h2 className="text-[13px] font-bold leading-5">{t('ISA Firewall')}</h2>
            <span className="text-[10px] text-[#5d6d61]">{t('Industrial Security Appliance')}</span>
          </div>
          <p className="mt-0.5 max-w-[68ch] text-[10.5px] leading-[1.4] text-[#5d6d61]">
            {t('Firewall rules apply to traffic entering the selected interface. They are checked from top to bottom, and the first match decides.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty && (
            <span className="inline-flex h-[24px] items-center border border-[#d6bd7a] bg-[#fff8e6] px-1.5 text-[10px] font-semibold text-[#6d5412]">
              {t('Unsaved changes')}
            </span>
          )}
          <button type="button" className={secondaryButton} disabled={!dirty} onClick={discard}>{t('Discard Changes')}</button>
          <button type="button" className={primaryButton} disabled={!dirty || standardAcl} onClick={save}>{t('Save Config')}</button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 @lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-auto border-b border-[#c4cec4] bg-[#eef2ed] @lg:border-b-0 @lg:border-r">
          <div className="border-b border-[#c4cec4] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#4a5b4e]">
            {t('Interfaces')}
          </div>
          <div className="p-1">
            {ports.map(port => {
              const selected = port.id === selectedPort.id
              return (
                <button
                  key={port.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={dirty && !selected}
                  title={dirty && !selected ? t('Save or discard your firewall changes before switching interfaces.') : undefined}
                  onClick={() => selectPort(port.id)}
                  className={`${sidebarButton} ${selected
                    ? 'border-[#7e9a84] bg-white shadow-[inset_3px_0_0_#3f7a52]'
                    : 'hover:border-[#c4cec4] hover:bg-white/70'} disabled:cursor-not-allowed disabled:opacity-55`}
                >
                  <span className="block truncate text-[11px] font-bold text-[#26382b]">{interfaceLabel(port)}</span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[9px] text-[#5d6d61]">
                    <span dir="ltr" className="truncate">{port.name}</span>
                    <span className="shrink-0">{t('Sec')} {port.securityLevel ?? 0}</span>
                  </span>
                  <span className={`mt-1 inline-flex items-center gap-1 text-[9px] ${port.adminStatus === 'down' ? 'text-[#8a5a2f]' : 'text-[#2e6e45]'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${port.adminStatus === 'down' ? 'bg-[#c08a43]' : 'bg-[#4b9a63]'}`} />
                    {port.adminStatus === 'down' ? t('Down') : t('Up')}
                  </span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="min-h-0 overflow-auto p-2 @sm:p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4dcd4] pb-2">
            <div className="min-w-0">
              <h3 className="truncate text-[12px] font-bold">{selectedPort.name}</h3>
              <p className="font-mono text-[10px] text-[#5d6d61]">
                {t('Inbound ACL')}: <span dir="ltr">{aclId}</span>
              </p>
            </div>
            <span className="border border-[#c4cec4] bg-white px-1.5 py-0.5 font-mono text-[9px] text-[#4a5b4e]">
              {selectedPort.nameif ?? selectedPort.name}
            </span>
          </div>

          {standardAcl && (
            <p role="alert" className="mt-2 border border-[#d6bd7a] bg-[#fff8e6] px-2 py-1.5 text-[10.5px] leading-[1.4] text-[#6d5412]">
              {t('This interface uses a standard ACL. Choose another interface or use the CLI.')}
            </p>
          )}

          <fieldset className="mt-2 border border-[#c4cec4] bg-white p-2">
            <legend className="px-1 text-[10.5px] font-bold text-[#3b4a3f]">{t('Add a deny rule')}</legend>
            <div className="grid items-end gap-2 @md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label className={fieldLabel}>
                {t('Rule type')}
                <select className={field} value={blockKind} onChange={event => setBlockKind(event.target.value as IsaBlockKind)} disabled={standardAcl}>
                  <option value="source">{t('Block a source IPv4 address')}</option>
                  <option value="destination">{t('Block a destination IPv4 address')}</option>
                  <option value="traffic">{t('Block a traffic type')}</option>
                  <option value="traffic-source">{t('Block a traffic type from a host')}</option>
                </select>
              </label>
              {needsHost && (
                <label className={fieldLabel}>
                  {t('Host IPv4')}
                  <input
                    className={field}
                    value={host}
                    placeholder="192.0.2.10"
                    inputMode="numeric"
                    dir="ltr"
                    disabled={standardAcl}
                    onChange={event => setHost(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Enter') addRule() }}
                  />
                </label>
              )}
              {showTraffic && (
                <label className={fieldLabel}>
                  {t('Traffic type')}
                  <select className={field} value={trafficType} onChange={event => setTrafficType(event.target.value)} disabled={standardAcl}>
                    {ISA_TRAFFIC_TYPES.map(type => <option key={type.id} value={type.id}>{t(type.label)}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className={`${primaryButton} @md:mb-0`} disabled={!allowAdd} onClick={addRule}>{t('Add Rule')}</button>
            </div>
            <p className="mt-1.5 text-[10px] leading-[1.35] text-[#627267]">
              {t('New deny rules are inserted above the permit-all rule so blocked traffic is not accidentally permitted.')}
            </p>
          </fieldset>

          {status && (
            <p
              role={status.tone === 'error' ? 'alert' : 'status'}
              className={`mt-2 border px-2 py-1 text-[10.5px] ${status.tone === 'error'
                ? 'border-[#d9b8b8] bg-[#fff3f3] text-[#8a2f2f]'
                : 'border-[#b8d2bf] bg-[#f1f8f2] text-[#2e5b3e]'}`}
            >
              {t(status.key)}
            </p>
          )}

          <div className="mt-2 border border-[#c4cec4] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4dcd4] bg-[#f8faf7] px-2 py-1.5">
              <h3 className="text-[11px] font-bold">{t('Firewall Configuration')}</h3>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-[#5d6d61]">{draft.length} / {ISA_RULE_LIMIT} {t('rules')}</span>
                <button type="button" className={secondaryButton} disabled={standardAcl} onClick={restorePermit}>{t('Restore permit all')}</button>
              </div>
            </div>
            {draft.length === 0 ? (
              <p className="px-2 py-3 text-[10.5px] text-[#5d6d61]">{t('No firewall rules on this interface.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[10.5px]">
                  <thead>
                    <tr className="border-b border-[#d4dcd4] bg-[#fbfcfa] text-left text-[9px] uppercase tracking-[0.08em] text-[#5d6d61]">
                      <th className="w-8 px-1.5 py-1.5">#</th>
                      <th className="w-16 px-1.5 py-1.5">{t('Action')}</th>
                      <th className="px-1.5 py-1.5">{t('Match')}</th>
                      <th className="w-[92px] px-1.5 py-1.5 text-right">{t('Order')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.map((rule, index) => {
                      const permitAll = isIsaPermitAllRule(rule)
                      return (
                        <tr key={`${index}-${rule.type}-${'remark' in rule && rule.remark ? rule.remark : index}`} className="border-b border-[#edf0ec] last:border-b-0">
                          <td className="px-1.5 py-1.5 font-mono text-[9px] text-[#6b7b6f]">{index + 1}</td>
                          <td className="px-1.5 py-1.5">
                            <span className={`inline-flex border px-1 py-0.5 text-[9px] font-bold ${rule.remark
                              ? 'border-[#c4cec4] bg-[#f4f6f3] text-[#5d6d61]'
                              : rule.action === 'permit'
                                ? 'border-[#b8d2bf] bg-[#f1f8f2] text-[#2e6e45]'
                                : 'border-[#d9b8b8] bg-[#fff3f3] text-[#8a2f2f]'}`}>
                              {rule.remark ? t('Remark') : t(rule.action === 'permit' ? 'Permit' : 'Deny')}
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5">
                            <code className="break-all font-mono text-[10px] text-[#26382b]" dir="ltr">{ruleSummary(rule, t('any'))}</code>
                            {permitAll && <span className="ms-1.5 text-[9px] text-[#5d6d61]">({t('Permit all other traffic')})</span>}
                          </td>
                          <td className="px-1.5 py-1.5">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" className={iconButton} aria-label={`${t('Move Up')} ${index + 1}`} title={t('Move Up')} disabled={index === 0 || standardAcl} onClick={() => moveRule(index, -1)}>↑</button>
                              <button type="button" className={iconButton} aria-label={`${t('Move Down')} ${index + 1}`} title={t('Move Down')} disabled={index === draft.length - 1 || standardAcl} onClick={() => moveRule(index, 1)}>↓</button>
                              <button type="button" className={dangerButton} aria-label={`${t('Remove')} ${index + 1}`} disabled={standardAcl} onClick={() => removeRule(index)}>{t('Remove')}</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-[#edf0ec] px-2 py-1.5 text-[10px] leading-[1.35] text-[#627267]">
              {t('Rules are applied in order. The first matching rule decides.')}
            </p>
          </div>

          <section className="mt-2 border border-[#c4cec4] bg-white">
            <div className="border-b border-[#d4dcd4] bg-[#f8faf7] px-2 py-1.5 text-[11px] font-bold">{t('Equivalent CLI')}</div>
            <pre className="m-0 max-h-32 overflow-auto whitespace-pre px-2 py-1.5 font-mono text-[10px] leading-[1.45] text-[#26382b]" dir="ltr">{cliText}</pre>
          </section>
        </section>
      </div>
    </div>
  )
}
