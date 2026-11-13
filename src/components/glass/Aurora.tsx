/**
 * 主界面背景：与启动页同一套“暗房夜空”配色。
 *
 * 整个背景在一个全屏三角形的片元着色器里画完，层次从下到上：
 * - 近黑底色（与启动页的 #0b0c0f 一致）；
 * - 两团缓慢漂移的光晕：居中偏上的铜色、右下的海青色，对应启动页的光晕位置；
 * - 两层稀疏星点，各自按随机频率闪烁，并以极慢速度平移，带出一点纵深；
 * - 四周暗角，把视线收向中间的内容区。
 * 星点密度按像素尺寸计算，窗口缩放时不会变密或变稀。
 */
import { Mesh, Program, Renderer, Triangle } from "ogl"
import { useEffect, useRef } from "react"

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float glow(vec2 uv, vec2 center, vec2 radius) {
  vec2 d = (uv - center) / radius;
  return exp(-dot(d, d));
}

float stars(vec2 pixel, float cell, float density, float t) {
  vec2 grid = pixel / cell;
  vec2 id = floor(grid);
  float seed = hash(id);
  if (seed > density) return 0.0;
  vec2 offset = vec2(hash(id + 1.7), hash(id + 9.2)) - 0.5;
  float d = length(fract(grid) - 0.5 - offset * 0.7) * cell;
  float twinkle = 0.55 + 0.45 * sin(t * (0.6 + seed * 9.0) + seed * 50.0);
  return smoothstep(1.6, 0.0, d) * twinkle;
}

void main() {
  vec2 uv = vUv;
  float t = uTime;
  vec3 color = vec3(0.043, 0.047, 0.059);

  vec2 drift = vec2(sin(t * 0.07), cos(t * 0.05)) * 0.04;
  color += vec3(0.89, 0.6, 0.33) * glow(uv, vec2(0.5, 0.6) + drift, vec2(0.42, 0.34)) * 0.3;
  color += vec3(0.56, 0.78, 0.75) * glow(uv, vec2(0.74, 0.24) - drift, vec2(0.32, 0.3)) * 0.16;
  color += vec3(0.91, 0.66, 0.63) * glow(uv, vec2(0.16, 0.18) + drift * 0.5, vec2(0.26, 0.22)) * 0.07;

  vec2 pixel = uv * uResolution;
  float far = stars(pixel + vec2(t * 2.0, t * 0.6), 34.0, 0.07, t);
  float near = stars(pixel + vec2(t * 5.0, t * 1.5) + 300.0, 90.0, 0.12, t) * 1.4;
  color += vec3(0.96, 0.93, 0.88) * (far * 0.45 + near * 0.6);

  vec2 edge = uv - vec2(0.5, 0.54);
  color *= mix(1.0, 0.45, smoothstep(0.35, 0.95, length(edge * vec2(1.1, 1.3))));
  gl_FragColor = vec4(color, 1.0);
}
`

export function Aurora() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parent = ref.current
    if (!parent) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let renderer: Renderer
    try {
      renderer = new Renderer({ alpha: true, dpr })
    } catch {
      return
    }
    const gl = renderer.gl
    gl.canvas.style.width = "100%"
    gl.canvas.style.height = "100%"
    gl.canvas.style.display = "block"
    parent.appendChild(gl.canvas)
    const program = new Program(gl, {
      vertex: "attribute vec2 position; varying vec2 vUv; void main() { vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }",
      fragment: FRAGMENT,
      uniforms: { uTime: { value: 0 }, uResolution: { value: [1, 1] } },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    const start = performance.now()
    const sized = { w: 0, h: 0 }
    const paint = (now: number) => {
      const uniform = program.uniforms.uTime
      if (uniform) uniform.value = (now - start) * 0.001
      renderer.render({ scene: mesh })
    }
    const resize = () => {
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (width < 1 || height < 1 || (width === sized.w && height === sized.h)) return
      sized.w = width
      sized.h = height
      renderer.setSize(width, height)
      gl.canvas.style.width = "100%"
      gl.canvas.style.height = "100%"
      const resolution = program.uniforms.uResolution
      if (resolution) resolution.value = [width * dpr, height * dpr]
      paint(performance.now())
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)
    let frame = 0
    const draw = (now: number) => {
      paint(now)
      if (!reduce) frame = requestAnimationFrame(draw)
    }
    draw(start)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      gl.canvas.remove()
      gl.getExtension("WEBGL_lose_context")?.loseContext()
    }
  }, [])

  return <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" />
}
