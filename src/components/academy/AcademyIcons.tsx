import React from 'react'

export type AcademyIconName =
  | 'book'
  | 'search'
  | 'close'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'check'
  | 'circle'
  | 'play'
  | 'flask'
  | 'clock'
  | 'target'
  | 'spark'
  | 'list'
  | 'arrow-right'
  | 'arrow-left'
  | 'reset'
  | 'grid'
  | 'flame'
  | 'shield'
  | 'copy'
  | 'menu'
  | 'layers'
  | 'compass'
  | 'info'
  | 'award'

const paths: Record<AcademyIconName, React.ReactNode> = {
  book: <><path d="M12 6.5C10.4 5 8.4 4.5 6 4.5H4v14h2c2.4 0 4.4.5 6 2 1.6-1.5 3.6-2 6-2h2v-14h-2c-2.4 0-4.4.5-6 2Z" /><path d="M12 6.5V20.5" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 4.2 4.2" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  'chevron-left': <path d="m14.5 6-6 6 6 6" />,
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  circle: <circle cx="12" cy="12" r="7.5" />,
  play: <path d="M8.5 5.5v13l10-6.5-10-6.5Z" />,
  flask: <><path d="M9 3h6" /><path d="M10 3v6l-5.2 9.3A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.7L14 9V3" /><path d="M7.6 15h8.8" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5l3.2 1.9" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  spark: <><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" /><path d="m18.5 16 .7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" /></>,
  list: <><path d="M9 6h10M9 12h10M9 18h10" /><path d="M4.6 6h.01M4.6 12h.01M4.6 18h.01" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  'arrow-left': <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  reset: <><path d="M4.5 4.5v5h5" /><path d="M4.9 9.5a8 8 0 1 1-.5 5.5" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" /></>,
  flame: <path d="M13.2 2.5c.4 3.7-2 5.4-3.5 7.3-1.3 1.7-2.2 3.2-2.2 5.2a4.5 4.5 0 0 0 9 0c0-2.3-1.3-4.2-2.7-5.6-1.5-1.5-1.9-3.4-.6-6.9Z" />,
  shield: <><path d="M12 3 5 6v5c0 4.4 3 7.4 7 10 4-2.6 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 16 9 5 9-5" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  award: <><circle cx="12" cy="9" r="5" /><path d="m8.5 13-1.5 8 5-3 5 3-1.5-8" /></>,
}

export function AcademyIcon({ name, size = 18, className }: { name: AcademyIconName; size?: number; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">{paths[name]}</svg>
}
