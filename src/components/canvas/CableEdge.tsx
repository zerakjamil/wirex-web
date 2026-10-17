'use client'

import React from 'react'
import { type Edge, type EdgeProps, getStraightPath, getBezierPath, Position, useInternalNode } from '@xyflow/react'
import { useNetworkStore } from '@/store/networkStore'
import { NetworkLink } from '@/types/network'
import { useShallow } from 'zustand/react/shallow'
import { getDeviceCableGeometry } from './cableGeometry'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { getDeviceFromList } from '@/store/deviceIndex'
import { getPacketsOnLink, selectPacketMarkers } from '@/store/packetIndex'

const DENSE_PACKET_THRESHOLD = 512

export type CableEdgeType = Edge<{ link: NetworkLink;sourceBlocked?:boolean;targetBlocked?:boolean }, 'cableEdge'>

export function CableEdge({
  source,
  target,
  sourceX: handleSourceX,
  sourceY: handleSourceY,
  targetX: handleTargetX,
  targetY: handleTargetY,
  data,
  selected,
}: EdgeProps<CableEdgeType>) {
  const fromNode=useInternalNode(source)
  const toNode=useInternalNode(target)
  const {sourceX,sourceY,targetX,targetY}=fromNode && toNode ? getDeviceCableGeometry(
    {...fromNode.internals.positionAbsolute,width:fromNode.measured.width},
    {...toNode.internals.positionAbsolute,width:toNode.measured.width},
  ) : {sourceX:handleSourceX,sourceY:handleSourceY,targetX:handleTargetX,targetY:handleTargetY}
  const link = (data as { link: NetworkLink } | undefined)?.link
  const {
    sourceDev,
    targetDev,
    showPortLabels,
    setSelectedLink,
    activeTool,
  } = useNetworkStore(useShallow(state => ({
    sourceDev: getDeviceFromList(state.devices, link?.fromDeviceId ?? ''),
    targetDev: getDeviceFromList(state.devices, link?.toDeviceId ?? ''),
    showPortLabels: state.showPortLabels,
    setSelectedLink: state.setSelectedLink,
    activeTool: state.activeTool,
  })))
  const setHoveredConnection = useWorkspaceStore((state) => state.setHoveredConnection)

  const isConsole = link?.type === 'console'

  const [straightPath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  const [bezierPath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    curvature: 0.45,
  })

  const edgePath = isConsole ? bezierPath : straightPath

  const handleEdgeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeTool === 'delete' && link) {
      useWorkspaceStore.getState().requestDeletion({linkIds:[link.id]})
    } else if (link) {
      setSelectedLink(link.id)
      if(useWorkspaceStore.getState().tool==='inspect')useWorkspaceStore.getState().setStatus(`${sourceDev?.name} ${sourcePort?.name} to ${targetDev?.name} ${targetPort?.name}: ${link.type}, ${link.status}.`)
    }
  }

  const sourcePort = sourceDev?.ports.find((p) => p.id === link?.fromPortId)
  const targetPort = targetDev?.ports.find((p) => p.id === link?.toPortId)

  // Geometric vectors for arrows and wireless waves
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist
  const uy = dy / dist
  const perpX = -uy
  const perpY = ux

  // Link status determinations (per-device port awareness)
  const sStatus = sourceDev?.power === false ? 'down' :data?.sourceBlocked||sourcePort?.stpState==='blocking'||sourcePort?.stpState==='listening'||sourcePort?.stpState==='learning'?'learning':(sourcePort?.status ?? link?.status ?? 'up')
  const tStatus = targetDev?.power === false ? 'down' :data?.targetBlocked||targetPort?.stpState==='blocking'||targetPort?.stpState==='listening'||targetPort?.stpState==='learning'?'learning':(targetPort?.status ?? link?.status ?? 'up')

  let strokeDasharray = undefined
  let strokeColor = selected ? '#0284c7' : 'var(--cisco-cable, #0f172a)'
  if (link?.type === 'crossover') {
    strokeDasharray = '5 4'
  } else if (link?.type === 'fiber') {
    strokeColor = selected ? '#f97316' : '#ea580c'
  } else if (link?.type === 'serial' || link?.type === 'serial-dce') {
    strokeColor = selected ? '#ef4444' : '#dc2626'
  } else if (link?.type === 'console') {
    strokeColor = selected ? '#00b4d8' : '#00e5ff'
  } else if (link?.type === 'coaxial') {
    strokeColor = selected ? '#3b82f6' : '#1d4ed8'
  } else if (link?.type === 'phone') {
    strokeColor = selected ? '#94a3b8' : '#64748b'
  }

  // Generate wireless wave arcs if link is wireless
  const renderWirelessWaves = () => {
    const waveElements: React.ReactNode[] = []
    const startOffset = 30
    const endOffset = dist - 30
    const step = 14
    let waveIndex = 0

    for (let offset = startOffset; offset <= endOffset; offset += step) {
      const cx = sourceX + ux * offset
      const cy = sourceY + uy * offset
      const arcWidth = 12
      const curveDepth = 4.5

      // Start, peak, and end points of the radio arc
      const sx = cx + perpX * arcWidth - ux * curveDepth
      const sy = cy + perpY * arcWidth - uy * curveDepth
      const apexX = cx + ux * curveDepth
      const apexY = cy + uy * curveDepth
      const ex = cx - perpX * arcWidth - ux * curveDepth
      const ey = cy - perpY * arcWidth - uy * curveDepth

      waveElements.push(
        <path
          key={`wave-${waveIndex++}`}
          d={`M ${sx} ${sy} Q ${apexX} ${apexY} ${ex} ${ey}`}
          fill="none"
          stroke={selected ? '#0284c7' : '#475569'}
          strokeWidth={1.5}
          strokeLinecap="round"
          className="pointer-events-none"
        />
      )
    }

    return (
      <g>
        {/* Invisible hit area */}
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={24}
          style={{pointerEvents:'stroke'}}
          className="cursor-pointer"
          onClick={handleEdgeClick}
        />
        {/* Soft background line */}
        <path
          d={edgePath}
          fill="none"
          stroke={selected ? '#38bdf8' : '#cbd5e1'}
          strokeWidth={1}
          strokeDasharray="4 4"
          className="pointer-events-none opacity-40"
        />
        {/* Concentric radiating radio wave arcs */}
        {waveElements}
      </g>
    )
  }

  // Position of link lights (arrows pointing towards the device ports)
  const sLedDist = Math.min(34,dist/3)
  const tLedDist = Math.min(34,dist/3)
  const sX = sourceX + ux * sLedDist
  const sY = sourceY + uy * sLedDist
  const tX = targetX - ux * tLedDist
  const tY = targetY - uy * tLedDist

  // Triangle pointing towards source device
  const sTipX = sourceX + ux * (sLedDist - 6)
  const sTipY = sourceY + uy * (sLedDist - 6)
  const sBase1X = sourceX + ux * (sLedDist + 3) + perpX * 4
  const sBase1Y = sourceY + uy * (sLedDist + 3) + perpY * 4
  const sBase2X = sourceX + ux * (sLedDist + 3) - perpX * 4
  const sBase2Y = sourceY + uy * (sLedDist + 3) - perpY * 4

  // Triangle pointing towards target device
  const tTipX = targetX - ux * (tLedDist - 6)
  const tTipY = targetY - uy * (tLedDist - 6)
  const tBase1X = targetX - ux * (tLedDist + 3) + perpX * 4
  const tBase1Y = targetY - uy * (tLedDist + 3) + perpY * 4
  const tBase2X = targetX - ux * (tLedDist + 3) - perpX * 4
  const tBase2Y = targetY - uy * (tLedDist + 3) - perpY * 4

  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2

  return (
    <>
      {/* If wireless link, render radio wave arcs */}
      {link?.type === 'wireless' ? (
        renderWirelessWaves()
      ) : (
        <>
          {/* Invisible wider hit area */}
          <path
            d={edgePath}
            fill="none"
            stroke="transparent"
            strokeWidth={18}
            style={{pointerEvents:'stroke'}}
            className="cursor-pointer"
            onClick={handleEdgeClick}
          />

          {/* Visible cable */}
          <path
            d={edgePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth={selected ? 3 : isConsole ? 3.5 : 1.75}
            strokeDasharray={strokeDasharray}
            className="transition-colors pointer-events-none"
          />

          {/* Console DB-9 Connector Plug on Laptop/PC */}
          {isConsole && (
            <g
              transform={`translate(${sourceX + ux * 16}, ${sourceY + uy * 16})`}
              className="pointer-events-none"
            >
              <circle cx={0} cy={0} r={5} fill="#0f172a" stroke="#00e5ff" strokeWidth={1.5} />
              <circle cx={0} cy={0} r={2} fill="#38bdf8" />
            </g>
          )}

          {/* Serial DCE Clock Icon */}
          {link?.type === 'serial-dce' && (
            <g
              transform={`translate(${sourceX + ux * 52}, ${sourceY + uy * 52})`}
              className="pointer-events-none"
            >
              <circle cx={0} cy={0} r={6} fill="#fee2e2" stroke="#dc2626" strokeWidth={1.2} />
              <path d="M 0 -3.5 L 0 0 L 2.5 0" stroke="#dc2626" strokeWidth={1} fill="none" />
            </g>
          )}

          {/* Classic Cisco triangle link status LEDs pointing at devices */}
          {!isConsole && (
            <>
              {/* Source Device End LED */}
              <g
                className="cursor-pointer pointer-events-auto"
                onPointerEnter={(e) => {
                  if (sourceDev) {
                    setHoveredConnection({
                      clientX: e.clientX,
                      clientY: e.clientY,
                      deviceId: sourceDev.id,
                      portId: sourcePort?.id,
                      peerDeviceId: targetDev?.id,
                      peerPortId: targetPort?.id,
                      linkId: link?.id,
                      mode: 'port',
                    })
                  }
                }}
                onPointerMove={(e) => {
                  if (sourceDev) {
                    setHoveredConnection({
                      clientX: e.clientX,
                      clientY: e.clientY,
                      deviceId: sourceDev.id,
                      portId: sourcePort?.id,
                      peerDeviceId: targetDev?.id,
                      peerPortId: targetPort?.id,
                      linkId: link?.id,
                      mode: 'port',
                    })
                  }
                }}
                onPointerLeave={() => setHoveredConnection(null)}
              >
                <circle cx={sX} cy={sY} r={12} fill="transparent" />
                {sStatus !== 'learning' ? (
                  <polygon
                    points={`${sTipX},${sTipY} ${sBase1X},${sBase1Y} ${sBase2X},${sBase2Y}`}
                    fill={sStatus === 'up' ? '#16a34a' : '#dc2626'}
                    stroke={sStatus === 'up' ? '#14532d' : '#991b1b'}
                    strokeWidth={0.8}
                    className="drop-shadow-xs transition-transform hover:scale-125"
                  />
                ) : (
                  <circle
                    cx={sX}
                    cy={sY}
                    r={3.5}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1}
                    className="drop-shadow-xs transition-transform hover:scale-125"
                  />
                )}
              </g>

              {/* Target Device End LED */}
              <g
                className="cursor-pointer pointer-events-auto"
                onPointerEnter={(e) => {
                  if (targetDev) {
                    setHoveredConnection({
                      clientX: e.clientX,
                      clientY: e.clientY,
                      deviceId: targetDev.id,
                      portId: targetPort?.id,
                      peerDeviceId: sourceDev?.id,
                      peerPortId: sourcePort?.id,
                      linkId: link?.id,
                      mode: 'port',
                    })
                  }
                }}
                onPointerMove={(e) => {
                  if (targetDev) {
                    setHoveredConnection({
                      clientX: e.clientX,
                      clientY: e.clientY,
                      deviceId: targetDev.id,
                      portId: targetPort?.id,
                      peerDeviceId: sourceDev?.id,
                      peerPortId: sourcePort?.id,
                      linkId: link?.id,
                      mode: 'port',
                    })
                  }
                }}
                onPointerLeave={() => setHoveredConnection(null)}
              >
                <circle cx={tX} cy={tY} r={12} fill="transparent" />
                {tStatus !== 'learning' ? (
                  <polygon
                    points={`${tTipX},${tTipY} ${tBase1X},${tBase1Y} ${tBase2X},${tBase2Y}`}
                    fill={tStatus === 'up' ? '#16a34a' : '#dc2626'}
                    stroke={tStatus === 'up' ? '#14532d' : '#991b1b'}
                    strokeWidth={0.8}
                    className="drop-shadow-xs transition-transform hover:scale-125"
                  />
                ) : (
                  <circle
                    cx={tX}
                    cy={tY}
                    r={3.5}
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth={1}
                    className="drop-shadow-xs transition-transform hover:scale-125"
                  />
                )}
              </g>
            </>
          )}

          {/* EtherChannel Bundle Oval Ring & Label */}
          {link?.isEtherChannel && link.channelLabel && (
            <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none">
              <ellipse
                cx={0}
                cy={0}
                rx={18}
                ry={9}
                fill="none"
                stroke="var(--cisco-cable, #0f172a)"
                strokeWidth={1.5}
                transform={`rotate(${(Math.atan2(dy, dx) * 180) / Math.PI + 90})`}
              />
              <text
                x={perpX * 16}
                y={perpY * 16}
                textAnchor="middle"
                dominantBaseline="middle"
                className="text-[10px] font-sans font-bold fill-slate-800 dark:fill-slate-200 pointer-events-none select-none drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]"
              >
                {link.channelLabel}
              </text>
            </g>
          )}

          {/* Port Labels (Canvas Topology Style) */}
          {showPortLabels && (
            <>
              {sourcePort && (
                <g
                  transform={`translate(${sourceX + ux * 48 + perpX * 10}, ${
                    sourceY + uy * 48 + perpY * 10
                  })`}
                  className="pointer-events-none select-none"
                >
                  <text
                    textAnchor={Math.abs(ux)<0.3?'start':ux>0?'start':'end'}
                    className="text-[10px] font-sans fill-slate-900"
                  >
                    {sourcePort.shortName || sourcePort.name}
                  </text>
                </g>
              )}
              {targetPort && (
                <g
                  transform={`translate(${targetX - ux * 48 + perpX * 10}, ${
                    targetY - uy * 48 + perpY * 10
                  })`}
                  className="pointer-events-none select-none"
                >
                  <text
                    textAnchor={Math.abs(ux)<0.3?'start':ux>0?'end':'start'}
                    className="text-[10px] font-sans fill-slate-900"
                  >
                    {targetPort.shortName || targetPort.name}
                  </text>
                </g>
              )}
            </>
          )}
        </>
      )}

      {link && <PacketEnvelopes linkId={link.id} sourceX={sourceX} sourceY={sourceY} targetX={targetX} targetY={targetY}/>}
    </>
  )
}

function PacketEnvelopes({ linkId, sourceX, sourceY, targetX, targetY }: {linkId:string;sourceX:number;sourceY:number;targetX:number;targetY:number}) {
  const { t } = useI18n()
  const { packetsOnLink, denseTraffic } = useNetworkStore(useShallow(state => ({
    packetsOnLink: getPacketsOnLink(state.inFlightPackets, linkId),
    denseTraffic: state.inFlightPackets.length >= DENSE_PACKET_THRESHOLD,
  })))
  const setActiveModal = useNetworkStore(state => state.setActiveModal)
  if (!packetsOnLink.length) return null
  const { visiblePackets, hiddenCount, firstHiddenPacket } = selectPacketMarkers(packetsOnLink, denseTraffic)
  const midpointX = (sourceX + targetX) / 2
  const midpointY = (sourceY + targetY) / 2

  return (
    <>
      {visiblePackets.map((packet) => {
        const tProgress = packet.direction === 'forward' ? packet.progress : 1 - packet.progress
        const px = sourceX + (targetX - sourceX) * tProgress
        const py = sourceY + (targetY - sourceY) * tProgress

        const protocol = (packet.pdu.protocol || 'ICMP').toUpperCase()
        let bodyFill = '#f59e0b'
        let flapFill = '#d97706'
        let strokeColor = '#78350f'
        let badgeBg = '#fef3c7'
        let badgeText = '#92400e'

        if (protocol.includes('ARP')) {
          bodyFill = '#10b981'
          flapFill = '#059669'
          strokeColor = '#064e3b'
          badgeBg = '#d1fae5'
          badgeText = '#065f46'
        } else if (protocol.includes('TCP') || protocol.includes('HTTP')) {
          bodyFill = '#0ea5e9'
          flapFill = '#0284c7'
          strokeColor = '#0c4a6e'
          badgeBg = '#e0f2fe'
          badgeText = '#0369a1'
        } else if (protocol.includes('DNS') || protocol.includes('UDP')) {
          bodyFill = '#8b5cf6'
          flapFill = '#7c3aed'
          strokeColor = '#4c1d95'
          badgeBg = '#ede9fe'
          badgeText = '#5b21b6'
        } else if (protocol.includes('STP') || protocol.includes('BPDU')) {
          bodyFill = '#f97316'
          flapFill = '#ea580c'
          strokeColor = '#7c2d12'
          badgeBg = '#ffedd5'
          badgeText = '#9a3412'
        } else if (protocol.includes('BGP')) {
          bodyFill = '#f43f5e'
          flapFill = '#e11d48'
          strokeColor = '#881337'
          badgeBg = '#ffe4e6'
          badgeText = '#9f1239'
        }

        const generatorColor = packet.pdu.generatorColor
        if (generatorColor) {
          bodyFill = generatorColor
          flapFill = generatorColor
          strokeColor = '#1e293b'
          badgeBg = generatorColor
          badgeText = '#ffffff'
        }

        if (denseTraffic) {
          const inspectLabel = `${t('Click to inspect PDU layers')}: ${protocol} (${packet.pdu.sourceIp} -> ${packet.pdu.destIp})`
          return (
            <g
              key={packet.id}
              data-testid="in-flight-packet"
              transform={`translate(${px}, ${py})`}
              role="button"
              tabIndex={0}
              aria-label={inspectLabel}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
              onClick={event => {
                event.stopPropagation()
                setActiveModal({ type: 'pdu', pdu: packet.pdu })
              }}
              onKeyDown={event => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                setActiveModal({ type: 'pdu', pdu: packet.pdu })
              }}
            >
              <title>{inspectLabel}</title>
              <circle cx={0} cy={0} r={7} fill={bodyFill} stroke={strokeColor} strokeWidth={2} />
            </g>
          )
        }

        return (
          <g
            key={packet.id}
            data-testid="in-flight-packet"
            transform={`translate(${px}, ${py})`}
            className="cursor-pointer transition-transform hover:scale-135 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              setActiveModal({ type: 'pdu', pdu: packet.pdu })
            }}
          >
            <title>{`${t('Click to inspect PDU layers')}: ${protocol} (${packet.pdu.sourceIp} -> ${packet.pdu.destIp})`}</title>

            {/* Glowing aura filter */}
            <circle cx={0} cy={0} r={13} fill={bodyFill} opacity={0.25} className={denseTraffic ? undefined : 'animate-ping'} />

            {/* Main Envelope Body */}
            <rect
              x={-11}
              y={-7}
              width={22}
              height={14}
              rx={2}
              fill={bodyFill}
              stroke={strokeColor}
              strokeWidth={1.2}
              className="drop-shadow-md"
            />

            {/* Envelope Back Crease Lines */}
            <line x1={-11} y1={7} x2={-3} y2={-0.5} stroke={strokeColor} strokeWidth={0.8} opacity={0.6} />
            <line x1={11} y1={7} x2={3} y2={-0.5} stroke={strokeColor} strokeWidth={0.8} opacity={0.6} />

            {/* Envelope Flap */}
            <polygon
              points="-11,-7 0,2 11,-7"
              fill={flapFill}
              stroke={strokeColor}
              strokeWidth={1}
            />

            {/* Floating Protocol Badge Pill */}
            <g transform="translate(0, -15)">
              <rect
                x={-14}
                y={-6}
                width={28}
                height={12}
                rx={3}
                fill={badgeBg}
                stroke={strokeColor}
                strokeWidth={0.8}
                className="drop-shadow-xs"
              />
              <text
                x={0}
                y={2.5}
                textAnchor="middle"
                fill={badgeText}
                className="text-[8px] font-sans font-bold pointer-events-none select-none tracking-tight"
              >
                {protocol}
              </text>
            </g>
          </g>
        )
      })}
      {hiddenCount > 0 && firstHiddenPacket && (
        <g
          key={`collapsed-${linkId}`}
          data-testid="packet-overflow"
          transform={`translate(${midpointX}, ${midpointY})`}
          role="button"
          tabIndex={0}
          aria-label={`${hiddenCount} ${t('more packets on this cable')}`}
          className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
          onClick={(event) => {
            event.stopPropagation()
            setActiveModal({ type: 'pdu', pdu: firstHiddenPacket.pdu })
          }}
          onKeyDown={(event: React.KeyboardEvent<SVGGElement>) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            setActiveModal({ type: 'pdu', pdu: firstHiddenPacket.pdu })
          }}
        >
          <title>{`${hiddenCount} ${t('more packets on this cable')}`}</title>
          <rect x={-17} y={-8} width={34} height={16} rx={3} fill="#0f172a" stroke="#38bdf8" strokeWidth={1.2} />
          <text x={0} y={3} textAnchor="middle" fill="#f8fafc" className="text-[9px] font-sans font-bold pointer-events-none select-none">
            +{hiddenCount}
          </text>
        </g>
      )}
    </>
  )
}
