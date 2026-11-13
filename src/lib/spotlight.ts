import type { PointerEvent } from "react"

/**
 * 把指针在元素内的位置写进 --spot-x / --spot-y，供 CSS 径向渐变画出跟随光斑。
 * 直接改 CSS 变量而不是 setState，移动指针时不会触发 React 重渲染。
 */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
}
