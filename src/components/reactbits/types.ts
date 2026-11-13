export type ParticlesProps = {
  /** 粒子数量。启动页是全屏一次性动画，几百颗足够，不必上千。 */
  count?: number
  /** 粒子分布的球体半径（世界单位），越大越散。 */
  spread?: number
  /** 整体旋转与漂浮速度的倍率。 */
  speed?: number
  /** 十六进制颜色，粒子随机取其一。 */
  colors?: string[]
  /** 基础像素尺寸，会按与相机的距离做透视缩放。 */
  baseSize?: number
  /** 0 表示所有粒子一样大，1 表示尺寸上下浮动 50%。 */
  sizeRandomness?: number
  /** 从散开到汇聚成形所用的秒数。 */
  introSeconds?: number
  /** 置为 true 后粒子朝镜头冲出，用于退场的“跃迁”效果。 */
  warp?: boolean
  className?: string
}

export type DecryptedTextProps = {
  text: string
  /** 每揭示一个字符的间隔（毫秒）。 */
  speed?: number
  /** 开始解码前的等待（毫秒），方便和其他动画编排。 */
  delay?: number
  /** 乱码阶段随机抽取的字符集。 */
  characters?: string
  className?: string
  /** 尚未揭示的乱码字符使用的类名。 */
  encryptedClassName?: string
}
