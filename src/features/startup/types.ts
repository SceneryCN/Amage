/**
 * 启动页的三个阶段：
 * - intro：标志、标题和署名依次登场；
 * - leave：光圈张开、粒子冲出镜头，露出下面已经渲染好的主界面；
 * - gone：卸载整个覆盖层，释放 WebGL 上下文。
 */
export type StartupPhase = "intro" | "leave" | "gone"

export type ApertureMarkProps = {
  /** 退场时叶片继续旋开，配合覆盖层的光圈张开。 */
  leaving: boolean
}
