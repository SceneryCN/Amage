import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, RotateCcw, RotateCw, Shrink, X, ZoomIn, ZoomOut } from "lucide-react"
import { t } from "@/i18n"
import { imageSrc } from "@/lib/files"

const MIN_SCALE = 0.25
const MAX_SCALE = 5

type View = { scale: number; rotate: number; x: number; y: number }

export function ImagePreview({
  images,
  index,
  onClose,
}: {
  images: string[]
  index: number
  onClose: () => void
}) {
  const [current, setCurrent] = useState(index)
  const view = useRef<View>({ scale: 1, rotate: 0, x: 0, y: 0 })
  const imageRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const safeIndex = Math.min(current, Math.max(images.length - 1, 0))
  const src = images[safeIndex]

  function paint() {
    const image = imageRef.current
    if (!image) return
    const { scale, rotate, x, y } = view.current
    image.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`
  }

  function reset() {
    view.current = { scale: 1, rotate: 0, x: 0, y: 0 }
    paint()
  }

  function zoom(factor: number) {
    view.current.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.current.scale * factor))
    paint()
  }

  function rotate(delta: number) {
    view.current.rotate += delta
    paint()
  }

  useEffect(() => {
    reset()
  }, [safeIndex])

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    closeRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopImmediatePropagation()
        onClose()
      } else if (event.key === "ArrowRight") {
        setCurrent((value) => Math.min(value + 1, images.length - 1))
      } else if (event.key === "ArrowLeft") {
        setCurrent((value) => Math.max(value - 1, 0))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKey)
      returnFocus.current?.focus()
    }
  }, [images.length, onClose])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    function onWheel(event: WheelEvent) {
      event.preventDefault()
      zoom(event.deltaY < 0 ? 1.12 : 0.88)
    }
    stage.addEventListener("wheel", onWheel, { passive: false })
    return () => stage.removeEventListener("wheel", onWheel)
  }, [src])

  function onPointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { px: event.clientX, py: event.clientY, x: view.current.x, y: view.current.y }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const start = drag.current
    if (!start) return
    view.current.x = start.x + event.clientX - start.px
    view.current.y = start.y + event.clientY - start.py
    paint()
  }

  if (!src) return null

  return createPortal(
    <div data-preview-open className="fixed inset-0 z-50 bg-black/80" onClick={onClose}>
      <ToolButton ref={closeRef} label={t("previewClose")} className="absolute right-4 top-4 z-10" onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </ToolButton>
      {images.length > 1 ? (
        <>
          <ToolButton label={t("previousImage")} className="absolute left-4 top-1/2 z-10 -translate-y-1/2" disabled={safeIndex === 0} onClick={() => setCurrent((value) => Math.max(value - 1, 0))}>
            <ChevronLeft size={22} aria-hidden="true" />
          </ToolButton>
          <ToolButton label={t("nextImage")} className="absolute right-4 top-1/2 z-10 -translate-y-1/2" disabled={safeIndex === images.length - 1} onClick={() => setCurrent((value) => Math.min(value + 1, images.length - 1))}>
            <ChevronRight size={22} aria-hidden="true" />
          </ToolButton>
        </>
      ) : null}
      <div ref={stageRef} className="flex h-full w-full items-center justify-center">
        <img
          ref={imageRef}
          src={imageSrc(src)}
          alt={t("generatedImage")}
          draggable={false}
          className="max-h-[86vh] max-w-[86vw] cursor-grab select-none object-contain active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation()
            reset()
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            drag.current = null
          }}
        />
      </div>
      <div
        className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink/80 px-2 py-1.5 text-foam"
        onClick={(event) => event.stopPropagation()}
      >
        {images.length > 1 ? <span className="px-2 text-sm tabular-nums">{safeIndex + 1} / {images.length}</span> : null}
        <ToolButton quiet label={t("zoomOut")} onClick={() => zoom(0.8)}><ZoomOut size={18} aria-hidden="true" /></ToolButton>
        <ToolButton quiet label={t("zoomIn")} onClick={() => zoom(1.25)}><ZoomIn size={18} aria-hidden="true" /></ToolButton>
        <ToolButton quiet label={t("rotateLeft")} onClick={() => rotate(-90)}><RotateCcw size={18} aria-hidden="true" /></ToolButton>
        <ToolButton quiet label={t("rotateRight")} onClick={() => rotate(90)}><RotateCw size={18} aria-hidden="true" /></ToolButton>
        <ToolButton quiet label={t("resetView")} onClick={reset}><Shrink size={18} aria-hidden="true" /></ToolButton>
      </div>
    </div>,
    document.body,
  )
}

function ToolButton({
  label,
  className,
  disabled,
  quiet,
  onClick,
  children,
  ref,
}: {
  label: string
  className?: string
  disabled?: boolean
  quiet?: boolean
  onClick: () => void
  children: ReactNode
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={disabled}
      className={`inline-flex size-10 items-center justify-center rounded-full text-foam hover:bg-white/15 disabled:opacity-40 ${quiet ? "" : "bg-ink/70"} ${className ?? ""}`}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}
