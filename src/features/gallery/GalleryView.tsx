import { useEffect, useRef, useState, type UIEvent } from "react"
import { ArrowLeft, Images, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { ImagePreview } from "@/features/preview/ImagePreview"
import { t } from "@/i18n"
import { api, onChat } from "@/lib/api"
import { imageSrc } from "@/lib/files"
import { formatTime } from "@/lib/format"
import { errorText } from "@/lib/platform"
import type { GalleryImage } from "@/lib/types"

const GAP = 12
const OVERSCAN = 520

type Placed = {
  item: GalleryImage
  column: number
  top: number
  width: number
  height: number
}

function columnsFor(width: number) {
  if (width >= 980) return 4
  if (width >= 680) return 3
  return 2
}

function layout(items: GalleryImage[], width: number): { placed: Placed[]; height: number } {
  if (width <= 0) return { placed: [], height: 0 }
  const columns = columnsFor(width)
  const cardWidth = (width - GAP * (columns - 1)) / columns
  const tops = Array.from({ length: columns }, () => 0)
  const placed = items.map((item) => {
    let column = 0
    for (let index = 1; index < tops.length; index += 1) {
      const candidate = tops[index]
      const best = tops[column]
      if (candidate !== undefined && best !== undefined && candidate < best) column = index
    }
    const ratio = item.width > 0 && item.height > 0 ? item.height / item.width : 1
    const height = cardWidth * ratio
    const top = tops[column] ?? 0
    tops[column] = top + height + GAP
    return { item, column, top, width: cardWidth, height }
  })
  const content = tops.reduce((max, value) => Math.max(max, value), 0)
  return { placed, height: Math.max(0, content - (placed.length > 0 ? GAP : 0)) }
}

function visibleKey(placed: Placed[], scrollTop: number, viewport: number) {
  let first = ""
  let last = ""
  let count = 0
  for (const card of placed) {
    if (card.top + card.height < scrollTop - OVERSCAN) continue
    if (card.top > scrollTop + viewport + OVERSCAN) continue
    if (!first) first = card.item.id
    last = card.item.id
    count += 1
  }
  return `${first}:${last}:${count}`
}

export function GalleryView({ onClose }: { onClose: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const seen = useRef("")
  const request = useRef(0)
  const [items, setItems] = useState<GalleryImage[]>([])
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("")
  const [width, setWidth] = useState(0)
  const [viewport, setViewport] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [preview, setPreview] = useState<number | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const current = ++request.current
    setPhase("loading")
    api.listGallery()
      .then((next) => {
        if (current !== request.current) return
        setItems(next)
        setPhase("ready")
      })
      .catch((reason) => {
        if (current !== request.current) return
        setMessage(errorText(reason, t("loadFailed")))
        setPhase("error")
      })
  }, [reloadKey])

  useEffect(() => onChat((event) => {
    if (event.type === "image") setReloadKey((value) => value + 1)
  }), [])

  useEffect(() => {
    const node = scroller.current
    if (!node || phase !== "ready") return
    const measure = () => {
      const style = getComputedStyle(node)
      const pad = (value: string) => {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? parsed : 0
      }
      const nextWidth = node.clientWidth - pad(style.paddingLeft) - pad(style.paddingRight)
      setWidth((current) => (nextWidth === current ? current : nextWidth))
      setViewport((current) => (node.clientHeight === current ? current : node.clientHeight))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [phase, items.length])

  const packed = layout(items, width)
  const visible = packed.placed.filter((card) => card.top + card.height >= scrollTop - OVERSCAN && card.top <= scrollTop + viewport + OVERSCAN)

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget
    const next = visibleKey(packed.placed, node.scrollTop, node.clientHeight)
    if (next === seen.current) return
    seen.current = next
    setScrollTop(node.scrollTop)
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 px-6 pb-2 pt-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="font-display text-2xl">{t("gallery")}</h1>
          {phase === "ready" && items.length > 0 ? (
            <p className="truncate text-sm text-foam/60">{t("galleryCount", { count: items.length })}</p>
          ) : null}
        </div>
        <Button className="shrink-0" onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToChat")}
        </Button>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {phase === "loading" ? <div className="m-6 skeleton h-64 rounded-[28px]" /> : null}
      {phase === "error" ? (
        <div className="m-8 grid max-w-sm gap-3">
          <p role="alert">{message}</p>
          <Button onClick={() => setReloadKey((value) => value + 1)}>
            <RotateCcw size={16} aria-hidden="true" />
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {phase === "ready" && items.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 py-8">
          <div className="grid w-full max-w-sm justify-items-center gap-4 text-center">
            <span className="grid size-16 place-items-center rounded-3xl border border-white/15 bg-white/5 text-foam/70">
              <Images size={26} aria-hidden="true" />
            </span>
            <div className="grid gap-2">
              <p className="font-display text-2xl">{t("galleryEmptyTitle")}</p>
              <p className="text-sm leading-6 text-foam/65">{t("galleryEmptyBody")}</p>
            </div>
          </div>
        </div>
      ) : null}
      {phase === "ready" && items.length > 0 ? (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-5" onScroll={onScroll}>
          <div className="relative" style={{ height: packed.height }}>
            {visible.map((card) => (
              <button
                key={card.item.id}
                type="button"
                className="group absolute overflow-hidden rounded-[22px] bg-white/5 shadow-[0_16px_40px_rgba(0,0,0,0.22)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110"
                style={{ top: card.top, left: card.column * (card.width + GAP), width: card.width, height: card.height }}
                onClick={() => setPreview(items.findIndex((item) => item.id === card.item.id))}
              >
                {failed.has(card.item.id) ? (
                  <span className="grid h-full place-items-center px-3 text-xs text-foam/60">{t("imageFailed")}</span>
                ) : (
                  <img
                    src={imageSrc(card.item.path)}
                    alt={t("generatedImage")}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={() => setFailed((current) => new Set(current).add(card.item.id))}
                  />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent px-3 py-2 text-left text-xs text-foam/80 opacity-0 transition group-hover:opacity-100">
                  {formatTime(card.item.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      </div>
      {preview !== null && preview >= 0 ? (
        <ImagePreview images={items.map((item) => item.path)} index={preview} onClose={() => setPreview(null)} />
      ) : null}
    </section>
  )
}
