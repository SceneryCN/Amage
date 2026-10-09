import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { Aurora } from "@/components/glass/Aurora"
import { BlurText } from "@/components/glass/BlurText"
import { LogoMark } from "@/components/glass/LogoMark"
import { t } from "@/i18n"

const EASE = [0.22, 1, 0.36, 1] as const

export function StartupOverlay() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const [phase, setPhase] = useState<"show" | "leave" | "gone">(reduce ? "gone" : "show")

  useEffect(() => {
    if (reduce) return
    const leave = window.setTimeout(() => setPhase("leave"), 2600)
    const done = window.setTimeout(() => setPhase("gone"), 3100)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [reduce])

  if (phase === "gone") return null

  return (
    <motion.div
      className={`fixed inset-0 z-40 flex items-center justify-center bg-ink ${phase === "leave" ? "pointer-events-none" : ""}`}
      role="status"
      aria-label={t("startupLabel")}
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === "leave" ? 0 : 1 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <Aurora />
      <div className="pointer-events-none relative z-10 grid justify-items-center gap-5">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, filter: "blur(16px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.7, ease: EASE }}
        >
          <LogoMark className="h-16 w-16" />
        </motion.div>
        <BlurText text={t("appName")} className="shine-text font-display text-6xl tracking-tight" />
        <motion.p
          className="text-sm tracking-[0.22em] text-foam/70"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.45 }}
        >
          {t("tagline")}
        </motion.p>
        <motion.p
          className="text-xs tracking-[0.16em] text-foam/50"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.45 }}
        >
          {t("createdBy")}
        </motion.p>
      </div>
    </motion.div>
  )
}
