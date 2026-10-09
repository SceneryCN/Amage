import { Mesh, Program, Renderer, Triangle } from "ogl"
import { useEffect, useRef } from "react"

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
void main() {
  vec2 uv = vUv;
  float t = uTime * 0.16;
  float wave = sin(uv.x * 3.2 + t) * 0.12 + cos(uv.y * 2.2 - t * 1.2) * 0.1;
  vec3 ink = vec3(0.045, 0.048, 0.06);
  vec3 copper = vec3(0.86, 0.52, 0.27);
  vec3 sea = vec3(0.36, 0.68, 0.64);
  float band = smoothstep(0.15, 0.85, uv.y + wave);
  vec3 color = mix(ink, sea, band * 0.45);
  float glow = exp(-pow(uv.x - 0.28 - sin(t) * 0.08, 2.0) * 6.0 - pow(uv.y - 0.72, 2.0) * 5.0);
  color += copper * glow * 0.9;
  float sheen = pow(max(0.0, 1.0 - abs(uv.y - 0.16 - wave * 0.4)), 10.0);
  color += vec3(1.0, 0.96, 0.9) * sheen * 0.16;
  gl_FragColor = vec4(color, 1.0);
}
`

export function Aurora() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const parent = ref.current
    if (!parent) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let renderer: Renderer
    try {
      renderer = new Renderer({ alpha: true, dpr: Math.min(window.devicePixelRatio || 1, 1.5) })
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
      uniforms: { uTime: { value: 0 } },
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
