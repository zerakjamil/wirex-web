'use client'

import React, { useRef, useState } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { parseWorkspace } from '@/simulator/workspaceSchema'
import { useWorkspaceStore } from '@/store/workspaceStore'

export function TopBar() {
  const {
    devices,
    links,
    setActiveModal,
    loadLab,
    resetTopology,
  } = useNetworkStore()

  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'logical' | 'physical'>('logical')
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExportLab = () => {
    const labData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      devices,
      links,
    }
    const blob = new Blob([JSON.stringify(labData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wirex-lab-${Date.now()}.wf.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpenDropdown(null)
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { useWorkspaceStore.getState().setStatus('Maximum network file size is 8 MB.'); return }

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = parseWorkspace(JSON.parse(event.target?.result as string))
        loadLab(parsed.devices, parsed.links, parsed.annotations)
      } catch (err) {
        useWorkspaceStore.getState().setStatus(err instanceof Error ? err.message : 'Failed to parse lab JSON file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
    setOpenDropdown(null)
  }

  const handleClear = () => {
    if (confirm('Clear current topology? Unsaved changes will be lost.')) {
      resetTopology()
    }
    setOpenDropdown(null)
  }

  return (
    <div className="bg-[#f0f2f5] border-b border-[#cbd5e1] select-none text-slate-800 text-xs z-30">
      {/* 1. Classic Windows/Qt Application Menu Bar */}
      <div className="h-6 px-2 border-b border-[#e2e8f0] flex items-center justify-between bg-[#f8fafc]">
        <div className="flex items-center space-x-1">
          {/* File Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'file' ? null : 'file')}
              className={`px-2 py-0.5 rounded hover:bg-[#e2e8f0] cursor-pointer ${
                openDropdown === 'file' ? 'bg-[#e2e8f0]' : ''
              }`}
            >
              File
            </button>
            {openDropdown === 'file' && (
              <div className="absolute left-0 top-6 w-44 bg-white border border-[#cbd5e1] shadow-lg rounded py-1 z-50">
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#f1f5f9] cursor-pointer flex justify-between"
                >
                  <span>New</span>
                  <span className="text-slate-400">Ctrl+N</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#f1f5f9] cursor-pointer flex justify-between"
                >
                  <span>Open...</span>
                  <span className="text-slate-400">Ctrl+O</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportLab}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#f1f5f9] cursor-pointer flex justify-between"
                >
                  <span>Save (.pkt.json)</span>
                  <span className="text-slate-400">Ctrl+S</span>
                </button>
                <div className="border-t border-[#e2e8f0] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal({ type: 'labs' })
                    setOpenDropdown(null)
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#f1f5f9] cursor-pointer"
                >
                  Open Sample Labs...
                </button>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'edit' ? null : 'edit')}
              className={`px-2 py-0.5 rounded hover:bg-[#e2e8f0] cursor-pointer ${
                openDropdown === 'edit' ? 'bg-[#e2e8f0]' : ''
              }`}
            >
              Edit
            </button>
            {openDropdown === 'edit' && (
              <div className="absolute left-0 top-6 w-36 bg-white border border-[#cbd5e1] shadow-lg rounded py-1 z-50">
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#f1f5f9] cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>

          <span className="px-2 py-0.5 text-slate-400 cursor-default">Options</span>
          <span className="px-2 py-0.5 text-slate-400 cursor-default">View</span>
          <span className="px-2 py-0.5 text-slate-400 cursor-default">Tools</span>

          {/* Help Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenDropdown(openDropdown === 'help' ? null : 'help')}
              className={`px-2 py-0.5 rounded hover:bg-[#e2e8f0] cursor-pointer ${
                openDropdown === 'help' ? 'bg-[#e2e8f0]' : ''
              }`}
            >
              Help
            </button>
            {openDropdown === 'help' && (
              <div className="absolute left-0 top-6 w-48 bg-white border border-[#cbd5e1] shadow-lg rounded py-1 z-50">
                <div className="px-3 py-1.5 font-semibold text-slate-700">wireX Web</div>
                <div className="px-3 py-1 text-[11px] text-slate-500">
                  Browser-native network simulation with authentic IOS CLI.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pr-1">
          <span className="text-[11px] font-semibold text-slate-500">
            wireX Lab Engine
          </span>
        </div>
      </div>

      {/* 2. Main Tool Palette Bar */}
      <div className="h-10 px-2 flex items-center justify-between bg-[#f0f2f5] border-b border-[#cfd8dc]">
        {/* Left Toolbar Icons */}
        <div className="flex items-center gap-1">
          {/* New */}
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 hover:bg-[#e2e8f0] active:bg-[#cbd5e1] rounded border border-transparent hover:border-[#cbd5e1] transition cursor-pointer"
            title="New (Ctrl+N)"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </button>

          {/* Open */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 hover:bg-[#e2e8f0] active:bg-[#cbd5e1] rounded border border-transparent hover:border-[#cbd5e1] transition cursor-pointer"
            title="Open Network (.pkt.json)"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-600" fill="currentColor">
              <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
            </svg>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".json,.pkt.json"
            className="hidden"
          />

          {/* Save */}
          <button
            type="button"
            onClick={handleExportLab}
            className="p-1.5 hover:bg-[#e2e8f0] active:bg-[#cbd5e1] rounded border border-transparent hover:border-[#cbd5e1] transition cursor-pointer"
            title="Save (Ctrl+S)"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-sky-700" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          </button>

          <div className="h-5 w-[1px] bg-[#cfd8dc] mx-1" />

          {/* Sample Labs / Scenarios */}
          <button
            type="button"
            onClick={() => setActiveModal({ type: 'labs' })}
            className="px-2.5 py-1 bg-white hover:bg-[#f1f5f9] active:bg-[#e2e8f0] border border-[#cbd5e1] rounded text-[11px] font-medium text-slate-700 shadow-xs transition cursor-pointer flex items-center gap-1.5"
            title="Load Pre-configured CCNA Practice Labs"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-sky-600" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            Lab Activities
          </button>

          <div className="h-5 w-[1px] bg-[#cfd8dc] mx-1" />

          {/* Workspace Mode Tabs: Logical vs Physical */}
          <div className="inline-flex rounded-md shadow-xs bg-[#e2e8f0] p-0.5 border border-[#cbd5e1]">
            <button
              type="button"
              onClick={() => setActiveWorkspaceTab('logical')}
              className={`px-3 py-1 text-xs font-semibold rounded transition cursor-pointer ${
                activeWorkspaceTab === 'logical'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Logical
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveWorkspaceTab('physical')
                alert('Physical Workspace: Shows city, building, and wiring closet rack layout.')
              }}
              className={`px-3 py-1 text-xs font-medium rounded transition cursor-pointer ${
                activeWorkspaceTab === 'physical'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Physical
            </button>
          </div>
        </div>

        {/* Right Status */}
        <div className="flex items-center gap-2 pr-2">
          <span className="text-[11px] text-slate-500 font-mono">
            {devices.length} Devices | {links.length} Links
          </span>
        </div>
      </div>
    </div>
  )
}
