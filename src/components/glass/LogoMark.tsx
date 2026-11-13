import { useId } from "react"
import { APERTURE_BLADES, APERTURE_CENTER, APERTURE_CORE_RADIUS, APERTURE_GLINT, APERTURE_RING_RADIUS } from "@/components/glass/aperture"

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  const gradientId = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="12" y1="10" x2="108" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f6f1e8" />
          <stop offset="0.45" stopColor="#e39a55" />
          <stop offset="1" stopColor="#8ec7bf" />
        </linearGradient>
      </defs>
      <circle cx={APERTURE_CENTER} cy={APERTURE_CENTER} r={APERTURE_RING_RADIUS} fill="rgba(255,255,255,0.06)" stroke={`url(#${gradientId})`} strokeWidth="4" />
      <g stroke="rgba(246,241,232,0.55)" strokeWidth="3.5" strokeLinecap="round">
        {APERTURE_BLADES.map((blade) => <path key={blade} d={blade} />)}
      </g>
      <circle cx={APERTURE_CENTER} cy={APERTURE_CENTER} r={APERTURE_CORE_RADIUS} fill="none" stroke={`url(#${gradientId})`} strokeWidth="4" />
      <path d={APERTURE_GLINT} fill="none" stroke="#f6f1e8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
