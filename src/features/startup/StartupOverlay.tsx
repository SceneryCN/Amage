import { motion } from "motion/react"
import type { CSSProperties } from "react"
import { BlurText } from "@/components/glass/BlurText"
import { DecryptedText } from "@/components/reactbits/DecryptedText"
import { Particles } from "@/components/reactbits/Particles"
import { ApertureMark } from "@/features/startup/components/ApertureMark"
import { STARTUP_INTRO_MS, useStartupService } from "@/features/startup/useStartupService"
import { creditEnter, hairline, markEnter, rise, shockwave, stageIdle, stageLeave, TAGLINE_DELAY_S, TITLE_DELAY_MS } from "@/features/startup/styles/motion"
import { t } from "@/i18n"
import "@/features/startup/styles/startup.css"

/**
 * 启动动画：盖在主界面之上的一层，按 useStartupService 的阶段推进。
 *
 * 分层从下到上：暗场背景 → 粒子（WebGL）→ 噪点 → 舞台（标志、标题、标语、署名）
 * → 底部进度线与跳过提示。退场时整个覆盖层被 CSS 光圈遮罩“挖空”，主界面从中心露出。
 */
export function StartupOverlay() {
  const { phase, settled, enter } = useStartupService()
  if (phase === "gone") return null
  const leaving = phase === "leave"

  return (
    <div
      className="startup-overlay"
      data-phase={phase}
      role="status"
      aria-label={t("startupLabel")}
      onPointerDown={enter}
      style={{ "--startup-intro": `${STARTUP_INTRO_MS}ms` } as CSSProperties}
    >
      <div className="startup-backdrop" />
      <Particles warp={leaving} count={560} baseSize={150} introSeconds={1.6} />
      <div className="startup-grain" />
      {leaving ? <div className="startup-rim" /> : null}

      <motion.div className="startup-stage" initial={false} animate={leaving ? stageLeave : stageIdle}>
        <motion.div className="startup-mark" {...markEnter}>
          <span className="startup-orb" />
          <motion.span className="startup-shockwave" {...shockwave} />
          <ApertureMark leaving={leaving} />
        </motion.div>

        <motion.h1 className="startup-title" {...rise(TITLE_DELAY_MS / 1000 - 0.1)}>
          <DecryptedText text={t("appName")} delay={TITLE_DELAY_MS} speed={110} encryptedClassName="startup-cipher" />
        </motion.h1>

        <BlurText text={t("tagline")} className="startup-tagline" delay={TAGLINE_DELAY_S} />

        <div className="startup-credit-row">
          <motion.span className="startup-hairline" data-side="left" {...hairline("right")} />
          <motion.span className="startup-credit shine-text" {...creditEnter}>
            {t("createdBy")}
          </motion.span>
          <motion.span className="startup-hairline" data-side="right" {...hairline("left")} />
        </div>
      </motion.div>

      {leaving ? null : (
        <>
          <div className="startup-progress" aria-hidden="true" />
          <p className="startup-hint" data-settled={settled || undefined}>
            {settled ? t("startupEnter") : t("startupSkip")}
          </p>
        </>
      )}
    </div>
  )
}
