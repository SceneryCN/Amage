/**
 * 光圈标志的几何数据，静态 LogoMark 与启动页的动画版共用，保证两处图形完全一致。
 *
 * 坐标系是 120×120 的 viewBox，圆心 (60, 60)。
 * 画法沿用相机光圈的经典图示：中心有一个正六边形开口，六条边各自朝同一旋转方向
 * 延长到外圈，得到六片呈风车状排列的“叶片”。
 */
export const APERTURE_CENTER = 60
export const APERTURE_RING_RADIUS = 52
/** 叶片延伸到的外圈半径，略小于外环，留出一点呼吸感。 */
const BLADE_REACH = 49
/** 中心六边形开口的外接圆半径。 */
const OPENING_RADIUS = 20

type Point = { x: number; y: number }

function hexVertex(index: number): Point {
  const angle = (index * Math.PI) / 3 - Math.PI / 2
  return { x: OPENING_RADIUS * Math.cos(angle), y: OPENING_RADIUS * Math.sin(angle) }
}

/** 从 from 出发、沿 from→through 方向延长，求与半径 BLADE_REACH 的圆的交点。 */
function extendToReach(from: Point, through: Point): Point {
  const dx = through.x - from.x
  const dy = through.y - from.y
  const length = Math.hypot(dx, dy)
  const ux = dx / length
  const uy = dy / length
  const along = from.x * ux + from.y * uy
  const distance = -along + Math.sqrt(along * along - (from.x * from.x + from.y * from.y) + BLADE_REACH * BLADE_REACH)
  return { x: from.x + ux * distance, y: from.y + uy * distance }
}

const format = (point: Point) => `${(APERTURE_CENTER + point.x).toFixed(2)} ${(APERTURE_CENTER + point.y).toFixed(2)}`

export const APERTURE_BLADES: string[] = Array.from({ length: 6 }, (_, index) => {
  const start = hexVertex(index)
  const end = extendToReach(start, hexVertex(index + 1))
  return `M${format(start)} L${format(end)}`
})

/** 中心的“镜片高光”弧线，沿用旧标志里那道竖向弧。 */
export const APERTURE_GLINT = "M60 50c4.5 4 4.5 16 0 20"
export const APERTURE_CORE_RADIUS = 10
