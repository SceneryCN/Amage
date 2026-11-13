import { useEffect, useState } from "react"
import type { StartupPhase } from "@/features/startup/types"

/** 登场动画的完整时长：标志、标题、署名全部到位所需的时间。 */
export const STARTUP_INTRO_MS = 3400
/** 退场时长，需要和 startup.css 里 iris-open 动画的时长一致。 */
export const STARTUP_LEAVE_MS = 1100

/**
 * 启动页的时间轴。
 *
 * 主界面在启动页下面同时渲染、同时读取设置，启动页只是盖在上面的一层。
 * 启动页不会自动进入主界面：登场动画播完后停留在初始化画面，
 * 直到用户点击或按任意键才开始退场；动画播放途中点击则视为跳过。
 * settled 表示登场动画已经播完，用来把提示文案从“跳过”换成“进入”。
 * 系统开启“减少动态效果”时完全不显示。
 */
export function useStartupService() {
  const [phase, setPhase] = useState<StartupPhase>(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "gone" : "intro",
  )
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (phase !== "intro") return
    const timer = window.setTimeout(() => setSettled(true), STARTUP_INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== "leave") return
    const timer = window.setTimeout(() => setPhase("gone"), STARTUP_LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  function enter() {
    setPhase((current) => (current === "intro" ? "leave" : current))
  }

  useEffect(() => {
    if (phase !== "intro") return
    window.addEventListener("keydown", enter)
    return () => window.removeEventListener("keydown", enter)
  }, [phase])

  return { phase, settled, enter }
}
