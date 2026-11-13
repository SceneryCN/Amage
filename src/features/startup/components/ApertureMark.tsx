import { motion } from "motion/react"
import { useId } from "react"
import { APERTURE_BLADES, APERTURE_CENTER, APERTURE_CORE_RADIUS, APERTURE_GLINT, APERTURE_RING_RADIUS } from "@/components/glass/aperture"
import type { ApertureMarkProps } from "@/features/startup/types"
import { bladeDraw, bladesIdle, bladesInitial, bladesLeave, coreDraw, ringDraw } from "@/features/startup/styles/motion"

/**
 * 动画版光圈标志：外环描边 → 叶片边画边旋入 → 中心镜片点亮。
 * 图形与侧边栏的 LogoMark 共用 aperture.ts，最终定格的样子和应用内标志一致。
 */
export function ApertureMark({ leaving }: ApertureMarkProps) {
  const gradientId = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 120 120" className="relative h-full w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="12" y1="10" x2="108" y2="110" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fbf7f0" />
          <stop offset="0.45" stopColor="#e39a55" />
          <stop offset="1" stopColor="#8ec7bf" />
        </linearGradient>
      </defs>
      <motion.circle
        cx={APERTURE_CENTER}
        cy={APERTURE_CENTER}
        r={APERTURE_RING_RADIUS}
        fill="rgba(255,255,255,0.04)"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        {...ringDraw}
      />
      <motion.g
        stroke="rgba(246,241,232,0.7)"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ originX: "50%", originY: "50%" }}
        initial={bladesInitial}
        animate={leaving ? bladesLeave : bladesIdle}
      >
        {APERTURE_BLADES.map((blade, index) => <motion.path key={blade} d={blade} {...bladeDraw(index)} />)}
      </motion.g>
      <motion.circle cx={APERTURE_CENTER} cy={APERTURE_CENTER} r={APERTURE_CORE_RADIUS} fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.5" {...coreDraw} />
      <motion.path d={APERTURE_GLINT} fill="none" stroke="#fbf7f0" strokeWidth="2" strokeLinecap="round" {...coreDraw} />
    </svg>
  )
}
