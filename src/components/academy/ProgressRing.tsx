export function ProgressRing({ value, size = 34, stroke = 3, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (normalized / 100) * circumference
  return <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={label ?? `${Math.round(normalized)}%`}>
    <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--ac-line)" strokeWidth={stroke} />
    <circle cx="20" cy="20" r={radius} fill="none" stroke="var(--ac-teal)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 20 20)" style={{ transition: 'stroke-dashoffset .45s ease' }} />
  </svg>
}
