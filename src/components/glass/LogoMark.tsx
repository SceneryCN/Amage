import { useId } from "react"

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  const gradientId = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="8" y1="6" x2="58" y2="58">
          <stop stopColor="#f6f1e8" />
          <stop offset="0.45" stopColor="#e39a55" />
          <stop offset="1" stopColor="#8ec7bf" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="18" fill="rgba(255,255,255,0.08)" stroke="rgba(246,241,232,0.3)" />
      <circle cx="32" cy="32" r="14" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" />
      <path d="M32 18c6 6 6 22 0 28" fill="none" stroke="#f6f1e8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
