'use client'

import React from 'react'
import { DeviceType, IotThingState } from '@/types/network'
import { iotThingSpec } from '@/simulator/iot'

interface Cisco3DIconProps {
  type: DeviceType
  model?: string
  size?: number
  className?: string
  isPowerOn?: boolean
  iotState?: IotThingState
}

export function Cisco3DIcon({
  type,
  model = '',
  size = 56,
  className = '',
  isPowerOn = true,
  iotState,
}: Cisco3DIconProps) {
  const powerFilter = isPowerOn ? '' : 'grayscale opacity-50'

  return (
    <div
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center transition-all ${powerFilter} ${className}`}
    >
      {type === 'router' && <Router3DIcon size={size} model={model} />}
      {type === 'switch' && <Switch3DIcon size={size} model={model} />}
      {type === 'pc' && <Pc3DIcon size={size} />}
      {type === 'laptop' && <Laptop3DIcon size={size} />}
      {type === 'wireless' && <AccessPoint3DIcon size={size} model={model} />}
      {type === 'smartphone' && <Smartphone3DIcon size={size} />}
      {type === 'tablet' && <Tablet3DIcon size={size} />}
      {type === 'server' && <Server3DIcon size={size} />}
      {type === 'cloud' && <Cloud3DIcon size={size} />}
      {type === 'hub' && <Hub3DIcon size={size} />}
      {type === 'security' && <Security3DIcon size={size} />}
      {type === 'printer' && <Printer3DIcon size={size} />}
      {type === 'phone' && <Phone3DIcon size={size} />}
      {type === 'tv' && <Tv3DIcon size={size} />}
      {type === 'modem' && <Modem3DIcon size={size} />}
      {type === 'wlc' && <Wlc3DIcon />}
      {type === 'iot' && <Iot3DIcon model={model} iotState={iotState} />}
    </div>
  )
}

/**
 * 1. 3D Router
 * Matches 3D cylindrical puck with directional lighting,
 * extruded curved cylinder wall, top elliptical face with gradient, and 4 white perspective arrows.
 */
function Router3DIcon({ size, model }: { size: number; model?: string }) {
  const isISR = model?.includes('43') || model?.includes('29')
  const topColor1 = isISR ? '#bae6fd' : '#e0f2fe'
  const topColor2 = isISR ? '#38bdf8' : '#7dd3fc'
  const sideColor1 = '#0284c7'
  const sideColor2 = '#0369a1'
  const sideColor3 = '#0c4a6e'

  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        {/* Drop shadow */}
        <radialGradient id="router-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#0f172a" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>

        {/* Side cylinder gradient with lighting from top-left */}
        <linearGradient id="router-side-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={sideColor2} />
          <stop offset="25%" stopColor={sideColor1} />
          <stop offset="70%" stopColor={sideColor2} />
          <stop offset="100%" stopColor={sideColor3} />
        </linearGradient>

        {/* Top face ellipse gradient */}
        <radialGradient id="router-top-grad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="40%" stopColor={topColor1} />
          <stop offset="90%" stopColor={topColor2} />
          <stop offset="100%" stopColor="#0284c7" />
        </radialGradient>

        {/* Rim bevel */}
        <linearGradient id="router-rim-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {/* Ambient cast shadow */}
      <ellipse cx="50" cy="62" rx="42" ry="15" fill="url(#router-shadow)" />

      {/* Extruded cylinder body */}
      <path
        d="M 8 36 C 8 36 8 52 8 52 C 8 64 92 64 92 52 L 92 36 Z"
        fill="url(#router-side-grad)"
        stroke="#0369a1"
        strokeWidth="1"
      />

      {/* Front bottom highlight curve */}
      <path
        d="M 12 53 C 24 62 76 62 88 53"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Top face ellipse */}
      <ellipse
        cx="50"
        cy="36"
        rx="42"
        ry="18"
        fill="url(#router-top-grad)"
        stroke="url(#router-rim-grad)"
        strokeWidth="1.5"
      />

      {/* 4 White 3D Arrows in Isometric Perspective (2 pointing in, 2 pointing out) */}
      <g transform="translate(50, 36)" filter="drop-shadow(0 1px 1px rgba(0,0,0,0.3))">
        {/* Left Arrow pointing in */}
        <path
          d="M -30 0 L -12 0 M -16 -4 L -12 0 L -16 4"
          stroke="#ffffff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Right Arrow pointing in */}
        <path
          d="M 30 0 L 12 0 M 16 -4 L 12 0 L 16 4"
          stroke="#ffffff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Top-back Arrow pointing out */}
        <path
          d="M 0 -2 L 0 -11 M -4 -7 L 0 -11 L 4 -7"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Bottom-front Arrow pointing out */}
        <path
          d="M 0 2 L 0 11 M -4 7 L 0 11 L 4 7"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  )
}

/**
 * 2. 3D Switch
 * Matches 3D extruded teal box with top face,
 * front face, dark right face, and 4 white opposing arrows.
 */
function Switch3DIcon({ size, model }: { size: number; model?: string }) {
  const isL3 = model?.includes('3560') || model?.includes('3650')
  const topGrad = isL3 ? 'url(#switch-l3-top)' : 'url(#switch-top)'
  const frontGrad = isL3 ? 'url(#switch-l3-front)' : 'url(#switch-front)'
  const sideGrad = isL3 ? 'url(#switch-l3-side)' : 'url(#switch-side)'

  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        {/* Ambient shadow */}
        <radialGradient id="switch-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="70%" stopColor="#0f172a" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>

        {/* L2 Switch Gradients */}
        <linearGradient id="switch-top" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
        <linearGradient id="switch-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#115e59" />
        </linearGradient>
        <linearGradient id="switch-side" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#134e4a" />
          <stop offset="100%" stopColor="#042f2e" />
        </linearGradient>

        {/* L3 Switch Gradients (Deeper metallic teal-indigo) */}
        <linearGradient id="switch-l3-top" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="switch-l3-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#075985" />
        </linearGradient>
        <linearGradient id="switch-l3-side" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0c4a6e" />
          <stop offset="100%" stopColor="#082f49" />
        </linearGradient>
      </defs>

      {/* Cast shadow */}
      <ellipse cx="50" cy="62" rx="44" ry="14" fill="url(#switch-shadow)" />

      {/* Isometric 3D Box: Top Face, Front Face, Right Face */}
      {/* Front Face */}
      <polygon
        points="8,34 70,34 70,54 8,54"
        fill={frontGrad}
        stroke="#042f2e"
        strokeWidth="1"
      />

      {/* Port indicators on front face */}
      <g transform="translate(14, 40)">
        {[0, 8, 16, 24, 32, 40].map((x) => (
          <rect
            key={x}
            x={x}
            y={0}
            width={5}
            height={4}
            rx={0.8}
            fill="#042f2e"
            stroke="#14b8a6"
            strokeWidth="0.5"
          />
        ))}
        {/* Status LEDs */}
        <circle cx={49} cy={2} r={1} fill="#4ade80" />
        <circle cx={49} cy={7} r={1} fill="#4ade80" />
      </g>

      {/* Right Shaded Face */}
      <polygon
        points="70,34 92,20 92,40 70,54"
        fill={sideGrad}
        stroke="#042f2e"
        strokeWidth="1"
      />

      {/* Top Face */}
      <polygon
        points="8,34 30,20 92,20 70,34"
        fill={topGrad}
        stroke="#ffffff"
        strokeWidth="0.8"
        strokeOpacity="0.6"
      />

      {/* White Opposing Arrows on Top Face */}
      <g filter="drop-shadow(0 1px 1px rgba(0,0,0,0.3))">
        {/* Top pair: pointing right */}
        <path
          d="M 28 26 L 68 26 M 62 23 L 68 26 L 62 29"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Bottom pair: pointing left */}
        <path
          d="M 72 29 L 32 29 M 38 26 L 32 29 L 38 32"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
    </svg>
  )
}

/**
 * 3. 3D PC (Workstation)
 * Matches 3D retro CRT workstation with
 * tilted screen face, stand base, desktop chassis, and mouse with wire.
 */
function Pc3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 85" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="pc-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pc-body" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="50%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id="pc-screen-glass" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="60%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>

      {/* Cast Shadow */}
      <ellipse cx="50" cy="74" rx="38" ry="8" fill="url(#pc-shadow)" />

      {/* Desktop Tower Base Stand */}
      <polygon
        points="22,58 78,58 84,66 16,66"
        fill="url(#pc-body)"
        stroke="#475569"
        strokeWidth="1"
      />
      <polygon
        points="16,66 84,66 84,70 16,70"
        fill="#475569"
      />

      {/* Monitor Neck */}
      <polygon points="44,52 56,52 58,58 42,58" fill="#64748b" />

      {/* Monitor Casing (3D beveled box) */}
      {/* Back extrusion */}
      <polygon points="20,12 76,12 84,20 12,20" fill="#94a3b8" />
      <polygon points="76,12 86,22 86,52 76,52" fill="#475569" />

      {/* Front Bezel */}
      <rect
        x="14"
        y="16"
        width="66"
        height="38"
        rx="3"
        fill="url(#pc-body)"
        stroke="#475569"
        strokeWidth="1.5"
      />

      {/* Glowing CRT Screen Glass */}
      <rect
        x="19"
        y="20"
        width="56"
        height="28"
        rx="2"
        fill="url(#pc-screen-glass)"
        stroke="#0c4a6e"
        strokeWidth="1"
      />

      {/* Screen Gloss Highlight Line */}
      <path
        d="M 22 23 L 42 23 L 26 44 L 22 44 Z"
        fill="#ffffff"
        opacity="0.25"
      />

      {/* Power LED */}
      <circle cx="73" cy="50" r="1.5" fill="#22c55e" />

      {/* Mouse and Curved Cord */}
      <path
        d="M 80 68 Q 86 68 85 73"
        fill="none"
        stroke="#64748b"
        strokeWidth="1"
      />
      <ellipse cx="86" cy="74" rx="4" ry="2.5" fill="#94a3b8" stroke="#475569" strokeWidth="0.8" />
    </svg>
  )
}

/**
 * 4. 3D Laptop
 * Matches Image 1 (Laptop1 / Laptop2) and Image 2!
 * 3D isometric open clamshell laptop with blue screen angled back,
 * keyboard base with touchpad, and drop shadow.
 */
function Laptop3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="laptop-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="laptop-lid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="laptop-screen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="laptop-base" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Cast shadow */}
      <ellipse cx="50" cy="68" rx="42" ry="8" fill="url(#laptop-shadow)" />

      {/* Angled Screen Lid */}
      <polygon
        points="22,10 78,10 72,42 28,42"
        fill="url(#laptop-lid)"
        stroke="#334155"
        strokeWidth="1.2"
      />

      {/* Screen Display Glass */}
      <polygon
        points="26,14 74,14 69,38 31,38"
        fill="url(#laptop-screen)"
        stroke="#0c4a6e"
        strokeWidth="1"
      />

      {/* Screen Glare */}
      <polygon
        points="30,16 46,16 35,36 31,36"
        fill="#ffffff"
        opacity="0.3"
      />

      {/* Laptop Base Keyboard Deck */}
      <polygon
        points="26,42 74,42 88,64 12,64"
        fill="url(#laptop-base)"
        stroke="#64748b"
        strokeWidth="1.2"
      />

      {/* Front Base Lip */}
      <polygon
        points="12,64 88,64 88,67 12,67"
        fill="#475569"
      />

      {/* Keyboard Grid Texture */}
      <polygon
        points="29,45 71,45 77,54 23,54"
        fill="#334155"
        opacity="0.85"
      />

      {/* Trackpad */}
      <polygon
        points="43,56 57,56 59,62 41,62"
        fill="#64748b"
        stroke="#475569"
        strokeWidth="0.6"
      />
    </svg>
  )
}

/**
 * 5. 3D Access Point
 * Matches Image 1 (AccessPoint1)!
 * 3D beveled networking chassis with dual antennas and status LEDs.
 */
function AccessPoint3DIcon({ size, model }: { size: number; model?: string }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="ap-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ap-body-top" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="ap-body-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0369a1" />
          <stop offset="100%" stopColor="#0c4a6e" />
        </linearGradient>
        <linearGradient id="ap-antenna" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="50" cy="64" rx="38" ry="10" fill="url(#ap-shadow)" />

      {/* Dual Antennas */}
      {/* Left Antenna */}
      <line x1="26" y1="36" x2="18" y2="10" stroke="url(#ap-antenna)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="18" cy="10" r="2.5" fill="#0f172a" />
      {/* Right Antenna */}
      <line x1="74" y1="36" x2="82" y2="10" stroke="url(#ap-antenna)" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="82" cy="10" r="2.5" fill="#0f172a" />

      {/* AP Chassis (Isometric Box) */}
      {/* Front Face */}
      <polygon points="18,44 82,44 82,58 18,58" fill="url(#ap-body-front)" stroke="#082f49" strokeWidth="1" />

      {/* Top Face */}
      <polygon points="18,44 32,32 96,32 82,44" fill="url(#ap-body-top)" stroke="#7dd3fc" strokeWidth="0.8" />

      {/* Right Shaded Face */}
      <polygon points="82,44 96,32 96,46 82,58" fill="#082f49" />

      {/* Front LED indicators */}
      <circle cx="28" cy="51" r="2" fill="#4ade80" />
      <circle cx="36" cy="51" r="2" fill="#4ade80" />
      <circle cx="44" cy="51" r="2" fill="#38bdf8" />
      <circle cx="52" cy="51" r="2" fill="#38bdf8" />
      <circle cx="60" cy="51" r="2" fill="#38bdf8" />

      {/* Radio Wave Logo on Top Face */}
      <g transform="translate(56, 38) scale(0.6)" opacity="0.8">
        <path d="M 0 0 A 10 10 0 0 1 14 0" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <path d="M 3 4 A 6 6 0 0 1 11 4" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/**
 * 6. 3D Smartphone
 * Matches Image 1 (Smartphone1)!
 * 3D tilted cyan/black smartphone angled at 45 degrees with glass reflection.
 */
function Smartphone3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 80 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="phone-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="phone-screen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="60%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="42" cy="66" rx="24" ry="8" fill="url(#phone-shadow)" />

      {/* Rotated 3D Phone Body */}
      <g transform="rotate(-28 40 40)">
        {/* Thickness / Bottom edge */}
        <rect x="23" y="13" width="34" height="54" rx="6" fill="#0f172a" />
        <rect x="24" y="14" width="34" height="54" rx="6" fill="#334155" />

        {/* Front Bezel */}
        <rect x="22" y="11" width="34" height="54" rx="6" fill="#0f172a" stroke="#64748b" strokeWidth="1" />

        {/* Color Screen */}
        <rect x="25" y="16" width="28" height="42" rx="3" fill="url(#phone-screen)" />

        {/* Glass reflection */}
        <path d="M 26 18 L 44 18 L 29 48 L 26 48 Z" fill="#ffffff" opacity="0.3" />

        {/* Speaker & Home button */}
        <line x1="34" y1="13.5" x2="44" y2="13.5" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <circle cx="39" cy="61.5" r="2" fill="none" stroke="#64748b" strokeWidth="1" />
      </g>
    </svg>
  )
}

/**
 * 7. 3D Tablet
 */
function Tablet3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 90 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="tablet-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="45" cy="68" rx="34" ry="8" fill="url(#tablet-shadow)" />

      <g transform="rotate(-15 45 40)">
        <rect x="18" y="10" width="54" height="58" rx="6" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
        <rect x="22" y="15" width="46" height="48" rx="3" fill="#0284c7" />
        <path d="M 23 17 L 50 17 L 30 55 L 23 55 Z" fill="#ffffff" opacity="0.25" />
        <circle cx="45" cy="64" r="1.5" fill="#94a3b8" />
      </g>
    </svg>
  )
}

/**
 * 8. 3D Server
 * Rack-mount chassis with stacked front drives and status indicators.
 */
function Server3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 85" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="server-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="server-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>

      <ellipse cx="50" cy="74" rx="40" ry="8" fill="url(#server-shadow)" />

      {/* Main Server Tower */}
      <polygon points="20,24 68,24 68,70 20,70" fill="url(#server-front)" stroke="#0f172a" strokeWidth="1.5" />
      <polygon points="68,24 84,12 84,58 68,70" fill="#0f172a" />
      <polygon points="20,24 36,12 84,12 68,24" fill="#64748b" stroke="#94a3b8" strokeWidth="0.8" />

      {/* Drive Bays */}
      {[30, 42, 54].map((y) => (
        <g key={y}>
          <rect x="25" y={y} width="38" height="8" rx="1" fill="#334155" stroke="#475569" strokeWidth="0.8" />
          <circle cx="29" cy={y + 4} r="1.2" fill="#22c55e" />
          <line x1="34" y1={y + 4} x2="58" y2={y + 4} stroke="#64748b" strokeWidth="1" strokeDasharray="2 2" />
        </g>
      ))}

      {/* Power Button & LED */}
      <circle cx="28" cy="65" r="1.5" fill="#38bdf8" />
    </svg>
  )
}

/**
 * 9. 3D Cloud
 * Matches Image 3 (Internet)!
 * Volumetric soft cloud with gradient and drop shadow.
 */
function Cloud3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 75" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="cloud-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.35" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cloud-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#bae6fd" />
          <stop offset="40%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
      </defs>

      <ellipse cx="50" cy="60" rx="42" ry="10" fill="url(#cloud-shadow)" />

      <path
        d="M 28 50 C 18 50 10 42 10 32 C 10 24 16 18 24 17 C 28 8 38 4 48 4 C 60 4 70 10 74 20 C 82 20 90 26 90 34 C 90 44 82 50 72 50 Z"
        fill="url(#cloud-grad)"
        stroke="#0369a1"
        strokeWidth="1.5"
      />

      {/* Highlight sheen */}
      <path
        d="M 28 19 C 32 10 42 7 50 7 C 60 7 68 12 71 20"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

/**
 * 10. 3D Hub
 */
function Hub3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="hub-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.35" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="50" cy="62" rx="42" ry="12" fill="url(#hub-shadow)" />

      {/* Extruded Amber Box */}
      <polygon points="12,34 72,34 72,54 12,54" fill="#d97706" stroke="#92400e" strokeWidth="1" />
      <polygon points="72,34 90,22 90,42 72,54" fill="#78350f" stroke="#92400e" strokeWidth="1" />
      <polygon points="12,34 30,22 90,22 72,34" fill="#fde047" stroke="#ffffff" strokeWidth="0.8" />

      {/* Hub cross icon */}
      <g transform="translate(51, 28) scale(0.7)" filter="drop-shadow(0 1px 1px rgba(0,0,0,0.3))">
        <line x1="-16" y1="0" x2="16" y2="0" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
        <line x1="0" y1="-8" x2="0" y2="8" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/**
 * 11. 3D Security / ASA Firewall
 */
function Security3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <radialGradient id="sec-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0f172a" stopOpacity="0.4" />
          <stop offset="80%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="50" cy="62" rx="40" ry="12" fill="url(#sec-shadow)" />

      <polygon points="14,32 72,32 72,54 14,54" fill="#dc2626" stroke="#991b1b" strokeWidth="1.2" />
      <polygon points="72,32 90,20 90,42 72,54" fill="#7f1d1d" stroke="#991b1b" strokeWidth="1.2" />
      <polygon points="14,32 32,20 90,20 72,32" fill="#ef4444" stroke="#fca5a5" strokeWidth="0.8" />

      {/* Brick texture lines */}
      <line x1="14" y1="43" x2="72" y2="43" stroke="#fca5a5" strokeWidth="1" />
      <line x1="33" y1="32" x2="33" y2="43" stroke="#fca5a5" strokeWidth="1" />
      <line x1="53" y1="32" x2="53" y2="43" stroke="#fca5a5" strokeWidth="1" />
      <line x1="23" y1="43" x2="23" y2="54" stroke="#fca5a5" strokeWidth="1" />
      <line x1="43" y1="43" x2="43" y2="54" stroke="#fca5a5" strokeWidth="1" />
      <line x1="63" y1="43" x2="63" y2="54" stroke="#fca5a5" strokeWidth="1" />
    </svg>
  )
}

/**
 * 12. 3D Printer
 */
function Printer3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <ellipse cx="50" cy="64" rx="36" ry="8" fill="rgba(15,23,42,0.35)" />
      <polygon points="26,14 74,14 74,32 26,32" fill="#ffffff" stroke="#94a3b8" strokeWidth="1" />
      <polygon points="16,30 84,30 84,56 16,56" fill="#cbd5e1" stroke="#64748b" strokeWidth="1.2" />
      <rect x="28" y="44" width="44" height="18" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1" />
      <circle cx="76" cy="38" r="2" fill="#22c55e" />
    </svg>
  )
}

/**
 * 13. 3D IP Phone
 */
function Phone3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 85 80" className="w-full h-full drop-shadow-md overflow-visible">
      <ellipse cx="44" cy="66" rx="30" ry="8" fill="rgba(15,23,42,0.35)" />
      {/* Phone Base */}
      <polygon points="18,30 70,30 76,62 14,62" fill="#1e293b" stroke="#0f172a" strokeWidth="1.2" />
      {/* LCD screen */}
      <rect x="36" y="34" width="28" height="14" rx="1.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="0.8" />
      {/* Keypad */}
      {[50, 55].map((y) => (
        <g key={y}>
          <circle cx="42" cy={y} r="1.5" fill="#94a3b8" />
          <circle cx="50" cy={y} r="1.5" fill="#94a3b8" />
          <circle cx="58" cy={y} r="1.5" fill="#94a3b8" />
        </g>
      ))}
      {/* Handset */}
      <rect x="18" y="24" width="14" height="42" rx="4" fill="#334155" stroke="#0f172a" strokeWidth="1" />
    </svg>
  )
}

/**
 * 14. 3D TV
 */
function Tv3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <ellipse cx="50" cy="68" rx="36" ry="6" fill="rgba(15,23,42,0.3)" />
      <polygon points="44,52 56,52 60,64 40,64" fill="#475569" />
      <rect x="10" y="14" width="80" height="42" rx="3" fill="#0f172a" stroke="#334155" strokeWidth="2" />
      <rect x="14" y="18" width="72" height="34" rx="1.5" fill="#0284c7" />
      <path d="M 16 20 L 40 20 L 22 50 L 16 50 Z" fill="#ffffff" opacity="0.25" />
    </svg>
  )
}

/**
 * 16. 3D Wireless LAN Controller
 * Rack-mount appliance with front-panel status LEDs and diversity antennas.
 */
function Wlc3DIcon() {
  return (
    <svg viewBox="0 0 100 85" className="w-full h-full drop-shadow-md overflow-visible">
      <defs>
        <linearGradient id="wlc-front" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="76" rx="40" ry="7" fill="rgba(15,23,42,0.35)" />
      {/* Diversity antennas */}
      <line x1="30" y1="30" x2="24" y2="9" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
      <circle cx="24" cy="9" r="2.4" fill="#0ea5e9" />
      <line x1="70" y1="30" x2="76" y2="9" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
      <circle cx="76" cy="9" r="2.4" fill="#0ea5e9" />
      {/* Chassis */}
      <polygon points="14,30 74,30 74,72 14,72" fill="url(#wlc-front)" stroke="#0f172a" strokeWidth="1.5" />
      <polygon points="74,30 88,20 88,62 74,72" fill="#0f172a" />
      <polygon points="14,30 28,20 88,20 74,30" fill="#94a3b8" stroke="#cbd5e1" strokeWidth="0.8" />
      {/* Front-panel slots */}
      {[38, 50, 62].map((y) => (
        <g key={y}>
          <rect x="20" y={y} width="48" height="7" rx="1" fill="#1e293b" stroke="#475569" strokeWidth="0.6" />
          <circle cx="24" cy={y + 3.5} r="1.3" fill={y === 38 ? '#22c55e' : y === 50 ? '#38bdf8' : '#f59e0b'} />
        </g>
      ))}
    </svg>
  )
}

/**
 * 15. 3D Modem
 */
function Modem3DIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 80" className="w-full h-full drop-shadow-md overflow-visible">
      <ellipse cx="50" cy="62" rx="38" ry="10" fill="rgba(15,23,42,0.35)" />
      {/* Antenna */}
      <line x1="74" y1="36" x2="80" y2="12" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
      {/* Chassis */}
      <polygon points="16,36 74,36 74,54 16,54" fill="#475569" stroke="#1e293b" strokeWidth="1" />
      <polygon points="74,36 88,24 88,42 74,54" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
      <polygon points="16,36 30,24 88,24 74,36" fill="#94a3b8" stroke="#cbd5e1" strokeWidth="0.8" />
      {/* Activity LEDs */}
      {[24, 34, 44, 54].map((x) => (
        <circle key={x} cx={x} cy={45} r="2" fill="#22c55e" />
      ))}
    </svg>
  )
}

/**
 * 17. 3D IoT Smart Thing
 * One compact smart-home appliance per model. The silhouette follows the
 * configured kind and the accent glow reflects the live simulated state.
 */
function Iot3DIcon({ model, iotState }: { model?: string; iotState?: IotThingState }) {
  const kind = iotThingSpec(model ?? '').kind
  const state = iotState ?? {}
  const powered = state.power === true
  const open = state.open === true
  const level = Math.max(0, Math.min(100, state.level ?? 0))
  const temperature = state.temperature ?? 22
  const smoke = state.smoke === true
  const recentlyPressed = state.pressedAtTick !== undefined
  const plate = '#94a3b8'
  const plateDark = '#475569'
  const outline = '#0f172a'
  return (
    <svg viewBox="0 0 100 85" className="w-full h-full drop-shadow-md overflow-visible">
      <ellipse cx="50" cy="77" rx="30" ry="6" fill="rgba(15,23,42,0.32)" />
      {kind === 'lamp' && (
        <g>
          <rect x="46" y="50" width="8" height="22" rx="2" fill={plateDark} />
          <rect x="34" y="70" width="32" height="7" rx="3.5" fill="#334155" />
          {powered && <circle cx="50" cy="52" r="18" fill="rgba(253,224,71,0.30)" />}
          <polygon points="32,16 68,16 60,50 40,50" fill={powered ? '#fde68a' : '#cbd5e1'} stroke={outline} strokeWidth="1.5" />
          <circle cx="50" cy="52" r="6.5" fill={powered ? '#facc15' : '#e2e8f0'} stroke={outline} strokeWidth="1.2" />
          <rect x="44" y="24" width="12" height="3" rx="1.5" fill={powered ? '#f59e0b' : '#94a3b8'} />
        </g>
      )}
      {kind === 'fan' && (
        <g>
          <ellipse cx="50" cy="72" rx="14" ry="5" fill="#334155" />
          <rect x="47" y="46" width="6" height="24" rx="2" fill={plateDark} />
          <circle cx="50" cy="34" r="24" fill="#e2e8f0" stroke={outline} strokeWidth="1.5" />
          <g transform={powered ? 'rotate(18 50 34)' : undefined}>
            {[0, 120, 240].map((angle) => (
              <path key={angle} d="M50 34 L50 12 A11 11 0 0 1 60 26 Z" transform={`rotate(${angle} 50 34)`} fill={powered ? '#7dd3fc' : '#94a3b8'} stroke={outline} strokeWidth="0.8" />
            ))}
          </g>
          <circle cx="50" cy="34" r="5" fill={plateDark} stroke={outline} strokeWidth="1" />
          {powered && <circle cx="50" cy="34" r="27" fill="none" stroke="rgba(125,211,252,0.5)" strokeWidth="2" strokeDasharray="5 6" />}
        </g>
      )}
      {kind === 'siren' && (
        <g>
          <rect x="28" y="58" width="44" height="14" rx="4" fill={plateDark} stroke={outline} strokeWidth="1.2" />
          <path d="M32 58 A18 20 0 0 1 68 58 Z" fill={powered ? '#ef4444' : '#cbd5e1'} stroke={outline} strokeWidth="1.5" />
          <rect x="36" y="52" width="28" height="6" rx="3" fill={powered ? '#b91c1c' : plate} />
          {powered && (
            <g stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
              <path d="M22 30 L14 22" /><path d="M50 24 L50 12" /><path d="M78 30 L86 22" />
            </g>
          )}
          <circle cx="50" cy="66" r="2.4" fill={powered ? '#fde047' : '#64748b'} />
        </g>
      )}
      {kind === 'sprinkler' && (
        <g>
          <rect x="30" y="62" width="40" height="11" rx="3" fill={plateDark} stroke={outline} strokeWidth="1.2" />
          <rect x="46" y="44" width="8" height="20" rx="2" fill="#334155" />
          <rect x="38" y="37" width="24" height="9" rx="4" fill={plate} stroke={outline} strokeWidth="1.2" />
          {powered && (
            <g stroke="#38bdf8" strokeWidth="2.4" fill="none" strokeLinecap="round">
              <path d="M40 34 Q30 24 26 14" /><path d="M50 32 Q50 20 50 10" /><path d="M60 34 Q70 24 74 14" />
            </g>
          )}
        </g>
      )}
      {kind === 'door' && (
        <g>
          <rect x="28" y="12" width="44" height="60" rx="2" fill="#1e293b" stroke={outline} strokeWidth="1.5" />
          {open ? (
            <g>
              <polygon points="30,13 56,22 56,62 30,72" fill="#a16207" stroke={outline} strokeWidth="1.2" />
              <circle cx="51" cy="43" r="2" fill="#fde047" />
              <rect x="58" y="16" width="12" height="52" fill="#0f172a" opacity="0.55" />
            </g>
          ) : (
            <g>
              <rect x="32" y="16" width="36" height="52" rx="2" fill="#b45309" stroke={outline} strokeWidth="1.2" />
              <rect x="37" y="22" width="26" height="18" rx="2" fill="#92400e" />
              <circle cx="62" cy="44" r="2.2" fill="#fde047" />
            </g>
          )}
        </g>
      )}
      {kind === 'window' && (
        <g>
          <rect x="22" y="16" width="56" height="52" rx="2" fill={open ? '#0f172a' : '#7dd3fc'} stroke={outline} strokeWidth="1.5" />
          {open ? (
            <g>
              <polygon points="24,18 44,26 44,60 24,66" fill="#bae6fd" stroke={outline} strokeWidth="1" />
              <polygon points="76,18 56,26 56,60 76,66" fill="#bae6fd" stroke={outline} strokeWidth="1" />
              <polygon points="44,26 56,26 56,60 44,60" fill="#0f172a" opacity="0.5" />
            </g>
          ) : (
            <g stroke={outline} strokeWidth="1.2">
              <line x1="50" y1="16" x2="50" y2="68" /><line x1="22" y1="42" x2="78" y2="42" />
            </g>
          )}
          <rect x="20" y="68" width="60" height="5" rx="2" fill={plate} stroke={outline} strokeWidth="1" />
        </g>
      )}
      {kind === 'blinds' && (
        <g>
          <rect x="22" y="16" width="56" height="52" rx="2" fill="#7dd3fc" opacity="0.75" stroke={outline} strokeWidth="1.5" />
          <rect x="18" y="12" width="64" height="6" rx="3" fill={plateDark} stroke={outline} strokeWidth="1" />
          {Array.from({ length: 7 }, (_, index) => {
            const coverage = (1 - level / 100) * 46
            const slat = (coverage / 7) * (index + 1)
            return slat > 0 ? <rect key={index} x="24" y={18 + slat} width="52" height="3.4" rx="1.7" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.6" /> : null
          })}
          <circle cx="64" cy="64" r="2" fill={plateDark} />
        </g>
      )}
      {kind === 'thermostat' && (
        <g>
          <circle cx="50" cy="42" r="30" fill="#f8fafc" stroke={outline} strokeWidth="1.5" />
          <circle cx="50" cy="42" r="25" fill="none" stroke={plate} strokeWidth="3" strokeDasharray="6 4" />
          <circle cx="50" cy="42" r="20" fill="#0f172a" />
          <text x="50" y="48" textAnchor="middle" fontSize="16" fontWeight="700" fill="#38bdf8">{temperature.toFixed(1)}°</text>
          <circle cx="50" cy="70" r="3" fill={powered ? '#22c55e' : plateDark} />
        </g>
      )}
      {kind === 'smoke-detector' && (
        <g>
          <rect x="24" y="18" width="52" height="16" rx="8" fill="#f1f5f9" stroke={outline} strokeWidth="1.5" />
          {[32, 40, 48, 56, 64].map((x) => <line key={x} x1={x} y1="24" x2={x} y2="30" stroke={plate} strokeWidth="2" strokeLinecap="round" />)}
          <circle cx="50" cy="27" r="3.4" fill={smoke ? '#ef4444' : '#22c55e'} stroke={outline} strokeWidth="0.8" />
          {smoke && (
            <g fill="rgba(148,163,184,0.75)">
              <circle cx="38" cy="48" r="6" /><circle cx="50" cy="42" r="7.5" /><circle cx="62" cy="48" r="6" /><circle cx="50" cy="56" r="5" />
            </g>
          )}
        </g>
      )}
      {kind === 'water-detector' && (
        <g>
          <rect x="20" y="26" width="44" height="34" rx="6" fill="#f1f5f9" stroke={outline} strokeWidth="1.5" />
          <path d="M30 52 Q30 40 42 32 Q54 40 54 52 A12 12 0 0 1 30 52 Z" fill="#38bdf8" stroke={outline} strokeWidth="1" />
          <rect x="68" y="26" width="12" height="34" rx="3" fill="#e2e8f0" stroke={outline} strokeWidth="1" />
          <rect x="70" y={54 - (30 * level) / 100} width="8" height={(30 * level) / 100} rx="2" fill="#0ea5e9" />
        </g>
      )}
      {kind === 'light-sensor' && (
        <g>
          <circle cx="40" cy="40" r="22" fill="#f8fafc" stroke={outline} strokeWidth="1.5" />
          <circle cx="40" cy="40" r="9" fill="#facc15" stroke="#eab308" strokeWidth="1" />
          {Array.from({ length: 8 }, (_, index) => {
            const angle = (index * Math.PI) / 4
            return <line key={index} x1={40 + Math.cos(angle) * 13} y1={40 + Math.sin(angle) * 13} x2={40 + Math.cos(angle) * 18} y2={40 + Math.sin(angle) * 18} stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" />
          })}
          <rect x="66" y="24" width="12" height="36" rx="3" fill="#e2e8f0" stroke={outline} strokeWidth="1" />
          <rect x="68" y={56 - (32 * level) / 100} width="8" height={(32 * level) / 100} rx="2" fill="#fbbf24" />
        </g>
      )}
      {kind === 'push-button' && (
        <g>
          <rect x="28" y="14" width="44" height="58" rx="6" fill="#f1f5f9" stroke={outline} strokeWidth="1.5" />
          {recentlyPressed && <circle cx="50" cy="40" r="22" fill="rgba(251,191,36,0.35)" />}
          <circle cx="50" cy="40" r={recentlyPressed ? 15 : 16.5} fill={recentlyPressed ? '#f59e0b' : plate} stroke={outline} strokeWidth="1.5" />
          <circle cx="50" cy="40" r="7" fill={recentlyPressed ? '#fde68a' : '#e2e8f0'} stroke={outline} strokeWidth="1" />
          <circle cx="50" cy="64" r="2.2" fill="#22c55e" />
        </g>
      )}
    </svg>
  )
}
