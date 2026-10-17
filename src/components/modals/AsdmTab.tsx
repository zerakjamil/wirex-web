'use client'

import React, { useEffect, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import type { NetworkPort, AccessList, ExtendedAclRule } from '@/types/network'

export function AsdmTab({ deviceId }: { deviceId: string }) {
  const device = useNetworkStore((state) => state.devices.find((d) => d.id === deviceId))
  const updatePortConfig = useNetworkStore((state) => state.updatePortConfig)
  const updateDeviceConfig = useNetworkStore((state) => state.updateDeviceConfig)

  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'interfaces' | 'firewall' | 'inspection' | 'nat'>('dashboard')
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null)
  const [editNameif, setEditNameif] = useState('')
  const [editSecLevel, setEditSecLevel] = useState('0')
  const [editIp, setEditIp] = useState('')
  const [editMask, setEditMask] = useState('255.255.255.0')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [now, setNow] = useState<number | null>(null)

  // Firewall rule form state
  const [newRulePort, setNewRulePort] = useState('')
  const [newRuleAction, setNewRuleAction] = useState<'permit' | 'deny'>('permit')
  const [newRuleProtocol, setNewRuleProtocol] = useState<'ip' | 'icmp' | 'tcp' | 'udp'>('ip')
  const [newRuleSource, setNewRuleSource] = useState('any')
  const [newRuleDest, setNewRuleDest] = useState('any')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  if (!device || device.type !== 'security') {
    return <div className="p-4 text-xs text-slate-500">ASDM is only available on Cisco ASA Security Appliances.</div>
  }

  const ports = device.ports
  const insidePort = ports.find((p) => p.nameif?.toLowerCase() === 'inside' || p.securityLevel === 100)
  const outsidePort = ports.find((p) => p.nameif?.toLowerCase() === 'outside' || (p.securityLevel !== undefined && p.securityLevel < 100))
  const inspection = device.config.asaInspection || { icmp: true, http: true, tcp: true, dns: true, udp: true, tftp: true }
  const activeInterfaces = ports.filter((port) => port.adminStatus === 'up' && port.status === 'up').length
  const natRules = device.config.asaNatRules ?? []
  const activeTranslations = now === null ? [] : (device.asaNatTranslations ?? []).filter((translation) => translation.expiresAtMs > now)

  const handleStartEdit = (p: NetworkPort) => {
    setSelectedPortId(p.id)
    setEditNameif(p.nameif || '')
    setEditSecLevel(p.securityLevel !== undefined ? String(p.securityLevel) : '0')
    setEditIp(p.ipAddress || '')
    setEditMask(p.subnetMask || '255.255.255.0')
  }

  const handleSavePort = () => {
    if (!selectedPortId) return
    const lvl = parseInt(editSecLevel, 10)
    updatePortConfig(device.id, selectedPortId, {
      nameif: editNameif.trim() || undefined,
      securityLevel: isNaN(lvl) ? 0 : Math.max(0, Math.min(100, lvl)),
      ipAddress: editIp.trim() || undefined,
      subnetMask: editMask.trim() || undefined,
    })
    setSelectedPortId(null)
    setStatusMessage(`Saved configuration for port ${selectedPortId}`)
    setTimeout(() => setStatusMessage(null), 3000)
  }

  const handleToggleInspection = (key: keyof NonNullable<typeof device.config.asaInspection>) => {
    const enabled = key === 'udp' || key === 'tftp' ? inspection[key] !== false : inspection[key]
    const updated = { ...inspection, [key]: !enabled }
    updateDeviceConfig(device.id, { asaInspection: updated })
  }

  const handleAddFirewallRule = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRulePort) return
    const port = device.ports.find((p) => p.id === newRulePort)
    if (!port) return

    const existingLists: AccessList[] = device.config.accessLists ? [...device.config.accessLists] : []
    const aclId = port.inboundAcl || `ASA_ACL_${port.nameif || port.shortName}`

    let acl = existingLists.find((a) => a.id === aclId)
    if (!acl) {
      acl = { id: aclId, number: 101, type: 'extended', rules: [] }
      existingLists.push(acl)
    }

    const rule: ExtendedAclRule = {
      type: 'extended',
      action: newRuleAction,
      protocol: newRuleProtocol,
      sourceIp: newRuleSource.trim() || 'any',
      destIp: newRuleDest.trim() || 'any',
    }

    acl.rules.push(rule)
    updateDeviceConfig(device.id, { accessLists: existingLists })
    if (!port.inboundAcl) {
      updatePortConfig(device.id, port.id, { inboundAcl: aclId })
    }

    setStatusMessage(`Added firewall rule (${newRuleAction} ${newRuleProtocol}) to ${port.nameif || port.name}`)
    setTimeout(() => setStatusMessage(null), 3000)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#e6ebf2] text-slate-800 text-xs font-sans">
      {/* ASDM Header Bar */}
      <div className="bg-[#1f3a52] text-white px-3 py-2 flex items-center justify-between border-b border-[#142838] shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-emerald-600 flex items-center justify-center font-bold text-white text-[9px] shadow-xs">
            ASA
          </div>
          <div>
            <div className="font-bold text-xs tracking-wide">Cisco ASDM 7.14 (Adaptive Security Device Manager)</div>
            <div className="text-[10px] text-slate-300">
              Device: <span className="text-emerald-300 font-semibold">{device.config.hostname || 'ciscoasa'}</span> | Model: {device.model} | Mode: Single / Routed Firewall
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Normal / Connected
          </span>
        </div>
      </div>

      {/* ASDM Navigation Tabs */}
      <div className="bg-[#cbd6e2] px-3 pt-1 border-b border-[#a0b0c0] flex gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab('dashboard')}
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition cursor-pointer ${
            activeSubTab === 'dashboard'
              ? 'bg-[#e6ebf2] text-slate-900 border-t-2 border-x-2 border-[#a0b0c0] -mb-[1px] shadow-xs'
              : 'text-slate-700 hover:bg-[#b8c7d6]'
          }`}
        >
          Dashboard
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('interfaces')}
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition cursor-pointer ${
            activeSubTab === 'interfaces'
              ? 'bg-[#e6ebf2] text-slate-900 border-t-2 border-x-2 border-[#a0b0c0] -mb-[1px] shadow-xs'
              : 'text-slate-700 hover:bg-[#b8c7d6]'
          }`}
        >
          Interfaces & Zones
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('firewall')}
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition cursor-pointer ${
            activeSubTab === 'firewall'
              ? 'bg-[#e6ebf2] text-slate-900 border-t-2 border-x-2 border-[#a0b0c0] -mb-[1px] shadow-xs'
              : 'text-slate-700 hover:bg-[#b8c7d6]'
          }`}
        >
          Access Rules
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('inspection')}
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition cursor-pointer ${
            activeSubTab === 'inspection'
              ? 'bg-[#e6ebf2] text-slate-900 border-t-2 border-x-2 border-[#a0b0c0] -mb-[1px] shadow-xs'
              : 'text-slate-700 hover:bg-[#b8c7d6]'
          }`}
        >
          Inspection Engine
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('nat')}
          className={`px-3 py-1.5 font-bold rounded-t text-xs transition cursor-pointer ${
            activeSubTab === 'nat'
              ? 'bg-[#e6ebf2] text-slate-900 border-t-2 border-x-2 border-[#a0b0c0] -mb-[1px] shadow-xs'
              : 'text-slate-700 hover:bg-[#b8c7d6]'
          }`}
        >
          NAT / PAT
        </button>
      </div>

      {statusMessage && (
        <div className="bg-emerald-100 text-emerald-800 px-3 py-1.5 border-b border-emerald-300 font-semibold text-[11px] flex items-center justify-between">
          <span>✓ {statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-emerald-700 hover:text-emerald-900">✕</button>
        </div>
      )}

      {/* ASDM Tab Content */}
      <div className="flex-1 overflow-auto p-3">
        {activeSubTab === 'dashboard' && (
          <div className="space-y-3">
            {/* Visual Security Zone Diagram */}
            <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
              <h3 className="font-bold text-xs text-[#1f3a52] mb-2 flex items-center gap-1.5">
                <span>Security Zone Topology Overview</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Inside Zone Card */}
                <div className="border border-emerald-300 bg-emerald-50 rounded p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-emerald-800 text-xs">Inside Zone (Trusted LAN)</span>
                    <span className="bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">Sec Level: 100</span>
                  </div>
                  <div className="text-[11px] text-slate-700 space-y-0.5">
                    <div>Interface: <span className="font-mono font-semibold">{insidePort?.name || 'Ethernet0/1'}</span> ({insidePort?.shortName})</div>
                    <div>IP Address: <span className="font-mono font-semibold">{insidePort?.ipAddress || '192.168.1.1'}</span></div>
                    <div>Status: <span className={`font-semibold ${insidePort?.status === 'up' ? 'text-emerald-600' : 'text-slate-500'}`}>{insidePort?.status?.toUpperCase() || 'DOWN'}</span></div>
                    <div>Default Policy: <span className="font-semibold text-emerald-700">Permit out to lower security zones</span></div>
                  </div>
                </div>

                {/* Outside Zone Card */}
                <div className="border border-sky-300 bg-sky-50 rounded p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sky-800 text-xs">Outside Zone (Untrusted WAN)</span>
                    <span className="bg-sky-600 text-white font-bold px-1.5 py-0.5 rounded text-[10px]">Sec Level: 0</span>
                  </div>
                  <div className="text-[11px] text-slate-700 space-y-0.5">
                    <div>Interface: <span className="font-mono font-semibold">{outsidePort?.name || 'Ethernet0/0'}</span> ({outsidePort?.shortName})</div>
                    <div>IP Address: <span className="font-mono font-semibold">{outsidePort?.ipAddress || 'DHCP / Unassigned'}</span></div>
                    <div>Status: <span className={`font-semibold ${outsidePort?.status === 'up' ? 'text-emerald-600' : 'text-slate-500'}`}>{outsidePort?.status?.toUpperCase() || 'DOWN'}</span></div>
                    <div>Default Policy: <span className="font-semibold text-rose-700">Deny all unsolicited incoming traffic</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-white border border-[#bcc8d5] rounded p-2 text-center shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Active Interfaces</div>
                <div className="text-base font-extrabold text-slate-800">{activeInterfaces} / {ports.length}</div>
                <div className="text-[10px] text-slate-500">Link and admin state</div>
              </div>
              <div className="bg-white border border-[#bcc8d5] rounded p-2 text-center shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Configured NAT Rules</div>
                <div className="text-base font-extrabold text-slate-800">{natRules.length}</div>
                <div className="text-[10px] text-slate-500">From the device configuration</div>
              </div>
              <div className="bg-white border border-[#bcc8d5] rounded p-2 text-center shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Live PAT Translations</div>
                <div className="text-base font-extrabold text-slate-800">{activeTranslations.length}</div>
                <div className="text-[10px] text-slate-500">ICMP, UDP, and TCP sessions</div>
              </div>
              <div className="bg-white border border-[#bcc8d5] rounded p-2 text-center shadow-xs">
                <div className="text-[10px] text-slate-500 uppercase font-bold">ICMP Inspection</div>
                <div className={`text-base font-extrabold ${inspection.icmp ? 'text-emerald-600' : 'text-rose-600'}`}>{inspection.icmp ? 'Enabled' : 'Disabled'}</div>
                <div className="text-[10px] text-slate-500">Stateful Echo Reply checks</div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'interfaces' && (
          <div className="space-y-3">
            <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
              <h3 className="font-bold text-xs text-[#1f3a52] mb-2">Interfaces, Nameif & Security Levels</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border border-slate-300 border-collapse">
                  <thead>
                    <tr className="bg-[#e2e8f0] text-slate-700 border-b border-slate-300">
                      <th className="p-1.5 text-left">Interface</th>
                      <th className="p-1.5 text-left">Nameif</th>
                      <th className="p-1.5 text-center">Security Level</th>
                      <th className="p-1.5 text-left">IP Address</th>
                      <th className="p-1.5 text-left">Subnet Mask</th>
                      <th className="p-1.5 text-center">Status</th>
                      <th className="p-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ports.map((p) => (
                      <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="p-1.5 font-mono font-bold text-slate-800">{p.name}</td>
                        <td className="p-1.5">
                          {p.nameif ? (
                            <span className="px-1.5 py-0.5 rounded font-bold text-[10px] bg-slate-200 text-slate-800">
                              {p.nameif}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">None</span>
                          )}
                        </td>
                        <td className="p-1.5 text-center font-bold">
                          {p.securityLevel !== undefined ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] text-white ${p.securityLevel >= 100 ? 'bg-emerald-600' : p.securityLevel > 0 ? 'bg-amber-600' : 'bg-sky-600'}`}>
                              {p.securityLevel}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="p-1.5 font-mono">{p.ipAddress || 'unassigned'}</td>
                        <td className="p-1.5 font-mono">{p.subnetMask || 'None'}</td>
                        <td className="p-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${p.status === 'up' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-1.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(p)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded font-semibold text-[10px] text-slate-700 cursor-pointer"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedPortId && (
              <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
                <h4 className="font-bold text-xs text-[#1f3a52] mb-2">Edit Interface: {ports.find((p) => p.id === selectedPortId)?.name}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Nameif Zone</label>
                    <input
                      type="text"
                      value={editNameif}
                      onChange={(e) => setEditNameif(e.target.value)}
                      placeholder="inside, outside, dmz"
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Security Level (0-100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editSecLevel}
                      onChange={(e) => setEditSecLevel(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">IP Address</label>
                    <input
                      type="text"
                      value={editIp}
                      onChange={(e) => setEditIp(e.target.value)}
                      placeholder="192.168.1.1"
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Subnet Mask</label>
                    <input
                      type="text"
                      value={editMask}
                      onChange={(e) => setEditMask(e.target.value)}
                      placeholder="255.255.255.0"
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPortId(null)}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePort}
                    className="px-3 py-1 bg-[#1f3a52] hover:bg-[#284a68] text-white rounded text-xs font-bold cursor-pointer"
                  >
                    Apply Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'firewall' && (
          <div className="space-y-3">
            {/* Standard Firewall Policies */}
            <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
              <h3 className="font-bold text-xs text-[#1f3a52] mb-1">ASDM Access Rules (Firewall Policy)</h3>
              <p className="text-[10px] text-slate-500 mb-2">
                In Cisco ASA, traffic flowing from higher security level to lower security level is permitted by default.
                Traffic from lower to higher security level is denied unless explicitly permitted below or inspected.
              </p>

              <div className="space-y-1.5 mb-3">
                <div className="p-2 rounded border border-emerald-200 bg-emerald-50 text-[11px] flex items-center justify-between">
                  <div>
                    <span className="font-bold text-emerald-800">Rule 1 (Default):</span> Inside (100) to Outside (0)
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px]">PERMIT ALL</span>
                </div>
                <div className="p-2 rounded border border-rose-200 bg-rose-50 text-[11px] flex items-center justify-between">
                  <div>
                    <span className="font-bold text-rose-800">Rule 2 (Implicit Deny):</span> Outside (0) to Inside (100)
                  </div>
                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">DENY ALL UNSOLICITED</span>
                </div>
              </div>

              {/* User Configured Access Lists */}
              {device.config.accessLists && device.config.accessLists.length > 0 && (
                <div className="mb-3">
                  <h4 className="font-bold text-xs text-slate-700 mb-1">Configured Access Rules</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-100 text-slate-700">
                        <tr>
                          <th className="p-1 text-left">ACL ID</th>
                          <th className="p-1 text-left">Action</th>
                          <th className="p-1 text-left">Protocol</th>
                          <th className="p-1 text-left">Source</th>
                          <th className="p-1 text-left">Destination</th>
                        </tr>
                      </thead>
                      <tbody>
                        {device.config.accessLists.flatMap((acl) =>
                          acl.rules.map((r, i) => (
                            <tr key={`${acl.id}-${i}`} className="border-t border-slate-200">
                              <td className="p-1 font-mono">{acl.id}</td>
                              <td className="p-1 font-bold">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] text-white ${r.action === 'permit' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                                  {r.action.toUpperCase()}
                                </span>
                              </td>
                              <td className="p-1 font-mono uppercase">{r.type === 'extended' ? r.protocol : 'ip'}</td>
                              <td className="p-1 font-mono">{r.sourceIp}</td>
                              <td className="p-1 font-mono">{r.type === 'extended' ? r.destIp || 'any' : 'any'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Add Access Rule Form */}
              <form onSubmit={handleAddFirewallRule} className="border-t border-slate-200 pt-3">
                <h4 className="font-bold text-xs text-[#1f3a52] mb-2">Add Access Rule to Interface</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Interface</label>
                    <select
                      value={newRulePort}
                      onChange={(e) => setNewRulePort(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                      required
                    >
                      <option value="">Select Interface...</option>
                      {ports.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.nameif || 'No nameif'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Action</label>
                    <select
                      value={newRuleAction}
                      onChange={(e) => setNewRuleAction(e.target.value as 'permit' | 'deny')}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="permit">Permit</option>
                      <option value="deny">Deny</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Protocol</label>
                    <select
                      value={newRuleProtocol}
                      onChange={(e) => setNewRuleProtocol(e.target.value as typeof newRuleProtocol)}
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="ip">IP (All)</option>
                      <option value="icmp">ICMP (Ping)</option>
                      <option value="tcp">TCP</option>
                      <option value="udp">UDP</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Source IP / CIDR</label>
                    <input
                      type="text"
                      value={newRuleSource}
                      onChange={(e) => setNewRuleSource(e.target.value)}
                      placeholder="any or 10.0.0.0/24"
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Destination IP / CIDR</label>
                    <input
                      type="text"
                      value={newRuleDest}
                      onChange={(e) => setNewRuleDest(e.target.value)}
                      placeholder="any or 192.168.1.0/24"
                      className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                </div>
                <div className="mt-2.5 flex justify-end">
                  <button
                    type="submit"
                    className="px-3 py-1 bg-[#1f3a52] hover:bg-[#284a68] text-white rounded text-xs font-bold cursor-pointer"
                  >
                    + Add Access Rule
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeSubTab === 'inspection' && (
          <div className="space-y-3">
            <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
              <h3 className="font-bold text-xs text-[#1f3a52] mb-1">Stateful Packet Inspection (Modular Policy Framework)</h3>
              <p className="text-[10px] text-slate-500 mb-3">
                Cisco ASA performs stateful deep inspection. When inspection is active for a protocol, outbound sessions dynamically
                create pinholes permitting legitimate returning reply traffic from outside.
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspection.icmp}
                    onChange={() => handleToggleInspection('icmp')}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-800">Inspect ICMP (Ping & Traceroute)</div>
                    <div className="text-[10px] text-slate-500">Allows echo reply packets from outside to return to inside hosts.</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspection.http}
                    onChange={() => handleToggleInspection('http')}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-800">Inspect HTTP (Web Traffic)</div>
                    <div className="text-[10px] text-slate-500">Validates HTTP protocol compliance and stateful connection tracking.</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspection.tcp}
                    onChange={() => handleToggleInspection('tcp')}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-800">Inspect TCP (State Normalization)</div>
                    <div className="text-[10px] text-slate-500">Monitors 3-way handshakes, sequence numbers, and teardowns.</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspection.dns}
                    onChange={() => handleToggleInspection('dns')}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-800">Inspect DNS (Domain Name Service)</div>
                    <div className="text-[10px] text-slate-500">Inspects UDP 53 DNS queries and responses.</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspection.udp !== false}
                    onChange={() => handleToggleInspection('udp')}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-800">Inspect UDP (Stateful Return Traffic)</div>
                    <div className="text-[10px] text-slate-500">Allows matching UDP replies for live PAT sessions.</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 p-2 rounded border border-slate-200 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inspection.tftp !== false}
                    onChange={() => handleToggleInspection('tftp')}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="font-bold text-xs text-slate-800">Inspect TFTP (Dynamic Transfer Ports)</div>
                    <div className="text-[10px] text-slate-500">Learns the server-selected UDP port for a TFTP read session.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'nat' && (
          <div className="space-y-3">
            <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
              <h3 className="font-bold text-xs text-[#1f3a52] mb-1">Network Address Translation (NAT & PAT)</h3>
              <p className="text-[10px] text-slate-500 mb-3">
                Dynamic PAT supports ICMP Echo, basic UDP, TFTP reads with a learned server transfer port, and the modeled TCP/HTTP flow. TFTP uploads, option negotiation, retry recovery, other TCP applications, and static NAT are not simulated.
              </p>

              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="p-1.5 text-left">NAT Type</th>
                      <th className="p-1.5 text-left">Source Interface</th>
                      <th className="p-1.5 text-left">Destination Interface</th>
                      <th className="p-1.5 text-left">Original Source</th>
                      <th className="p-1.5 text-left">Translated Source</th>
                      <th className="p-1.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {natRules.length ? natRules.map((rule) => (
                      <tr key={rule.id} className="border-t border-slate-200">
                        <td className="p-1.5 font-bold text-slate-800">{rule.type === 'dynamic-pat' ? 'Dynamic PAT' : 'Static NAT'}</td>
                        <td className="p-1.5 font-mono text-emerald-700">{rule.sourceInterface}</td>
                        <td className="p-1.5 font-mono text-sky-700">{rule.destInterface}</td>
                        <td className="p-1.5 font-mono">{rule.sourceNet}</td>
                        <td className="p-1.5 font-mono">{outsidePort?.nameif === rule.destInterface && outsidePort.ipAddress ? outsidePort.ipAddress : `interface (${rule.destInterface})`}</td>
                        <td className="p-1.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${rule.type === 'dynamic-pat' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {rule.type === 'dynamic-pat' ? 'ICMP, UDP, TFTP read, and modeled TCP supported' : 'Not implemented'}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr><td className="p-2 text-slate-500" colSpan={6}>No NAT rules configured.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white rounded border border-[#bcc8d5] p-3 shadow-xs">
              <h3 className="font-bold text-xs text-[#1f3a52] mb-2">Active Translations</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr><th className="p-1.5 text-left">Protocol</th><th className="p-1.5 text-left">Inside local</th><th className="p-1.5 text-left">Outside global</th><th className="p-1.5 text-left">Remote</th><th className="p-1.5 text-left">Expires</th></tr>
                  </thead>
                  <tbody>
                    {activeTranslations.length ? activeTranslations.map((translation) => (
                      <tr key={translation.id} className="border-t border-slate-200">
                        <td className="p-1.5">{translation.protocol === 'ICMP' ? 'ICMP Echo' : translation.protocol}</td>
                        <td className="p-1.5 font-mono">{translation.protocol === 'ICMP' ? `${translation.originalSourceIp}:${translation.originalIdentifier}` : `${translation.originalSourceIp}:${translation.originalSourcePort}`}</td>
                        <td className="p-1.5 font-mono">{translation.protocol === 'ICMP' ? `${translation.translatedSourceIp}:${translation.translatedIdentifier}` : `${translation.translatedSourceIp}:${translation.translatedSourcePort}`}</td>
                        <td className="p-1.5 font-mono">{translation.protocol === 'ICMP' ? translation.remoteDestinationIp : `${translation.remoteDestinationIp}:${translation.remoteDestinationPort}`}</td>
                        <td className="p-1.5">{now === null ? '-' : `${Math.max(0, Math.ceil((translation.expiresAtMs - now) / 1000))}s`}</td>
                      </tr>
                    )) : (
                      <tr><td className="p-2 text-slate-500" colSpan={5}>No active translations.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
