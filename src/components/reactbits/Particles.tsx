/**
 * 粒子场（改编自 React Bits「Particles」的 ogl 版本，MIT）。
 *
 * 原版只做“漂浮的星点”。这里为启动动画加了两个阶段，都在着色器里完成，
 * React 只负责挂载画布并在每帧更新两个 uniform：
 * - uFocus 0 → 1：粒子从旋转、散开的状态收拢到正常分布，像光线聚进镜头；
 * - uWarp  0 → 1：粒子沿 z 轴冲向相机并放大淡出，制造“跃迁”的退场感。
 *
 * 所有逐帧变化都留在 WebGL 内，不触发 React 重渲染。
 */
import { Camera, Geometry, Mesh, Program, Renderer } from "ogl"
import { useEffect, useRef } from "react"
import type { ParticlesProps } from "@/components/reactbits/types"

const DEFAULT_COLORS = ["#f6f1e8", "#e39a55", "#8ec7bf"]
const WARP_SECONDS = 1.1

const VERTEX = `
attribute vec3 position;
attribute vec4 random;
attribute vec3 color;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform float uTime;
uniform float uSpread;
uniform float uBaseSize;
uniform float uSizeRandomness;
uniform float uRatio;
uniform float uFocus;
uniform float uWarp;
varying vec4 vRandom;
varying vec3 vColor;
varying float vFade;

void main() {
  vRandom = random;
  vColor = color;
  vec3 pos = position * uSpread;
  pos.z *= 10.0;

  float loose = 1.0 - uFocus;
  float angle = loose * (2.4 + random.x * 2.0);
  mat2 swirl = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  pos.xy = swirl * pos.xy * mix(1.0, 3.2 + random.y * 2.0, loose);

  vec4 world = modelMatrix * vec4(pos, 1.0);
  float t = uTime;
  world.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
  world.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
  world.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);
  world.z += uWarp * uWarp * (26.0 + random.z * 34.0);

  vec4 view = viewMatrix * world;
  float size = uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5));
  gl_PointSize = size / length(view.xyz) * uRatio * (1.0 + uWarp * 2.4);
  gl_Position = projectionMatrix * view;

  float appear = smoothstep(0.0, 0.45, uFocus + random.w * 0.25);
  float vanish = 1.0 - smoothstep(0.55, 1.0, uWarp * (0.7 + random.x * 0.5));
  vFade = appear * vanish;
}
`

const FRAGMENT = `
precision highp float;
uniform float uTime;
varying vec4 vRandom;
varying vec3 vColor;
varying float vFade;

void main() {
  vec2 uv = gl_PointCoord.xy;
  float d = length(uv - vec2(0.5));
  float glow = pow(smoothstep(0.5, 0.0, d), 1.6);
  vec3 color = vColor + 0.18 * sin(uv.yxx + uTime + vRandom.y * 6.28);
  gl_FragColor = vec4(color, glow * vFade);
}
`

export function Particles({
  count = 320,
  spread = 10,
  speed = 0.12,
  colors = DEFAULT_COLORS,
  baseSize = 110,
  sizeRandomness = 1,
  introSeconds = 1.8,
  warp = false,
  className = "",
}: ParticlesProps) {
  const ref = useRef<HTMLDivElement>(null)
  // warp 由父组件随时切换；放在 ref 里让动画循环读取，不必重建 WebGL 场景。
  const warpRef = useRef(warp)
  warpRef.current = warp

  useEffect(() => {
    const parent = ref.current
    if (!parent) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let renderer: Renderer
    try {
      renderer = new Renderer({ alpha: true, depth: false, dpr })
    } catch {
      // WebGL 不可用时静默降级，启动页仍有文字与图形动画。
      return
    }
    const gl = renderer.gl
    gl.canvas.style.display = "block"
    gl.canvas.style.width = "100%"
    gl.canvas.style.height = "100%"
    parent.appendChild(gl.canvas)

    const camera = new Camera(gl, { fov: 15 })
    camera.position.set(0, 0, 20)

    const geometry = new Geometry(gl, buildAttributes(count, colors))
    const program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      transparent: true,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: spread },
        uBaseSize: { value: baseSize },
        uSizeRandomness: { value: sizeRandomness },
        uRatio: { value: dpr },
        uFocus: { value: 0 },
        uWarp: { value: 0 },
      },
    })
    // 叠加混合：粒子重叠处会更亮，比普通透明混合更像光点。
    program.setBlendFunc(gl.SRC_ALPHA, gl.ONE)
    const mesh = new Mesh(gl, { mode: gl.POINTS, geometry, program })

    const resize = () => {
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (width < 1 || height < 1) return
      renderer.setSize(width, height)
      gl.canvas.style.width = "100%"
      gl.canvas.style.height = "100%"
      camera.perspective({ aspect: width / height })
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)

    const start = performance.now()
    let warpStart = 0
    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const elapsed = (now - start) / 1000
      const focus = easeOutCubic(Math.min(elapsed / introSeconds, 1))
      if (warpRef.current && !warpStart) warpStart = now
      const warpProgress = warpStart ? easeInCubic(Math.min((now - warpStart) / 1000 / WARP_SECONDS, 1)) : 0

      setUniform(program, "uTime", elapsed * speed * 8)
      setUniform(program, "uFocus", focus)
      setUniform(program, "uWarp", warpProgress)
      mesh.rotation.x = Math.sin(elapsed * 0.2) * 0.1
      mesh.rotation.y = Math.cos(elapsed * 0.5) * 0.15
      mesh.rotation.z = elapsed * speed * 0.6 + (1 - focus) * 1.2
      renderer.render({ scene: mesh, camera })
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      gl.canvas.remove()
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
    // colors 作为数组每次渲染都是新引用，不放进依赖；颜色只在搭建场景时读取一次。
  }, [count, spread, speed, baseSize, sizeRandomness, introSeconds])

  return <div ref={ref} className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true" />
}

/** 在单位球内均匀撒点，并为每颗粒子准备随机数（漂浮相位）与颜色。 */
function buildAttributes(count: number, colors: string[]) {
  const positions = new Float32Array(count * 3)
  const randoms = new Float32Array(count * 4)
  const tints = new Float32Array(count * 3)
  const palette = (colors.length > 0 ? colors : DEFAULT_COLORS).map(hexToRgb)
  for (let index = 0; index < count; index += 1) {
    let x = 0
    let y = 0
    let z = 0
    let length = 0
    do {
      x = Math.random() * 2 - 1
      y = Math.random() * 2 - 1
      z = Math.random() * 2 - 1
      length = x * x + y * y + z * z
    } while (length > 1 || length === 0)
    const radius = Math.cbrt(Math.random())
    positions.set([x * radius, y * radius, z * radius], index * 3)
    randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], index * 4)
    tints.set(palette[Math.floor(Math.random() * palette.length)] ?? [1, 1, 1], index * 3)
  }
  return {
    position: { size: 3, data: positions },
    random: { size: 4, data: randoms },
    color: { size: 3, data: tints },
  }
}

function setUniform(program: Program, name: string, value: number) {
  const uniform = program.uniforms[name]
  if (uniform) uniform.value = value
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  const full = clean.length === 3 ? [...clean].map((char) => char + char).join("") : clean
  const value = Number.parseInt(full, 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3
}

function easeInCubic(value: number) {
  return value ** 3
}
