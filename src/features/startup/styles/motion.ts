/**
 * 启动页的 Motion 时间轴（单位：秒，从挂载开始计）。
 *
 *   0.0  粒子从四周旋入汇聚（Particles 内部，1.6s）
 *   0.2  外环描边 → 0.35 六片叶片边画边旋入 → 0.9 中心镜片
 *   1.15 冲击波扩散
 *   1.0  标题浮现并开始解码
 *   1.6  标语逐字浮现
 *   2.1  署名与两侧细线展开
 *   3.4  登场完成，停在初始化画面等待用户点击或按键
 *   点击后退场（由 useStartupService 切换 phase）；登场途中点击则直接跳到退场
 *
 * 想整体加快或放慢，只改这里的 delay 和 useStartupService 里的 STARTUP_INTRO_MS。
 */
import type { TargetAndTransition, Transition } from "motion/react"

export const EASE_OUT = [0.22, 1, 0.36, 1] as const
const EASE_IN = [0.7, 0, 0.84, 0] as const

export const TITLE_DELAY_MS = 1050
export const TAGLINE_DELAY_S = 1.6

/** 文字块的统一登场：从下方、模糊中浮起。 */
export function rise(delay: number) {
  return {
    initial: { opacity: 0, y: 14, filter: "blur(12px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { delay, duration: 0.8, ease: EASE_OUT } satisfies Transition,
  }
}

export const stageIdle: TargetAndTransition = { scale: 1, opacity: 1, filter: "blur(0px)" }
export const stageLeave: TargetAndTransition = {
  scale: 1.35,
  opacity: 0,
  filter: "blur(14px)",
  transition: { duration: 0.75, ease: EASE_IN },
}

export const markEnter = {
  initial: { opacity: 0, scale: 0.6, filter: "blur(18px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  transition: { duration: 1, ease: EASE_OUT } satisfies Transition,
}

export const ringDraw = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { delay: 0.2, duration: 1, ease: EASE_OUT } satisfies Transition,
}

export function bladeDraw(index: number) {
  return {
    initial: { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: { delay: 0.35 + index * 0.06, duration: 0.7, ease: EASE_OUT } satisfies Transition,
  }
}

/** 叶片组：登场时从 -120° 旋入；退场时继续旋开并放大，像光圈开到最大。 */
export const bladesIdle: TargetAndTransition = { rotate: 0, scale: 1, transition: { delay: 0.35, duration: 1.1, ease: EASE_OUT } }
export const bladesLeave: TargetAndTransition = { rotate: 90, scale: 1.5, opacity: 0, transition: { duration: 0.7, ease: EASE_IN } }
export const bladesInitial = { rotate: -120, scale: 0.8 }

export const coreDraw = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: 1, opacity: 1 },
  transition: { delay: 0.9, duration: 0.6, ease: EASE_OUT } satisfies Transition,
}

export const shockwave = {
  initial: { scale: 0.4, opacity: 0 },
  animate: { scale: [0.4, 3.2], opacity: [0, 0.75, 0] },
  transition: { delay: 1.15, duration: 1.4, ease: EASE_OUT, times: [0, 0.18, 1] } satisfies Transition,
}

export function hairline(origin: "left" | "right") {
  return {
    initial: { scaleX: 0, opacity: 0 },
    animate: { scaleX: 1, opacity: 1 },
    style: { originX: origin === "left" ? 0 : 1 },
    transition: { delay: 2.2, duration: 0.9, ease: EASE_OUT } satisfies Transition,
  }
}

export const creditEnter = {
  initial: { opacity: 0, letterSpacing: "0.6em", filter: "blur(10px)" },
  animate: { opacity: 1, letterSpacing: "0.22em", filter: "blur(0px)" },
  transition: { delay: 2.1, duration: 1.1, ease: EASE_OUT } satisfies Transition,
}
