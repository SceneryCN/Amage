import { useEffect, useRef, useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"
import { VList } from "virtua"
import { Button } from "@/components/ui/Button"
import { t } from "@/i18n"
import { formatTime } from "@/lib/format"
import type { Conversation } from "@/lib/types"

export function HistoryList({
  items,
  loading,
  error,
  selectedId,
  runningIds,
  onSelect,
  onDelete,
  onRetry,
}: {
  items: Conversation[]
  loading: boolean
  error: string | null
  selectedId: string | null
  runningIds: ReadonlySet<string>
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRetry: () => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => setHeight(frame.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className="min-h-0 flex-1 overflow-hidden px-2" role="listbox" aria-label={t("historyLabel")}>
      {loading ? <HistorySkeleton /> : null}
      {!loading && error ? (
        <div className="grid gap-3 px-2 py-6 text-sm">
          <p role="alert">{error}</p>
          <Button onClick={onRetry}><RotateCcw size={16} aria-hidden="true" />{t("retry")}</Button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <div className="grid gap-2 px-3 py-8">
          <p className="font-display text-xl">{t("historyEmptyTitle")}</p>
          <p className="text-sm leading-6 text-foam/60">{t("historyEmptyBody")}</p>
        </div>
      ) : null}
      {!loading && !error && items.length > 0 && height > 0 ? (
        <VList style={{ height }} bufferSize={8}>
          {items.map((item) => (
            <div key={item.id} className="px-1 pb-2">
              <HistoryRow item={item} selected={item.id === selectedId} running={runningIds.has(item.id)} onSelect={onSelect} onDelete={onDelete} />
            </div>
          ))}
        </VList>
      ) : null}
    </div>
  )
}

function HistoryRow({
  item,
  selected,
  running,
  onSelect,
  onDelete,
}: {
  item: Conversation
  selected: boolean
  running: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [armed, setArmed] = useState(false)
  const deleteClass = armed
    ? "pointer-events-auto bg-rose/25 text-rose opacity-100"
    : running
      ? "pointer-events-none text-foam/70 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
      : "text-foam/70 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
  return (
    <div className={`group flex h-[60px] items-center gap-1 rounded-2xl px-2 transition-colors ${selected ? "bg-white/10 shadow-[inset_2px_0_0_#e39a55]" : "hover:bg-white/10"}`}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        className="min-w-0 flex-1 rounded-xl px-2 py-2 text-left"
        onClick={() => onSelect(item.id)}
      >
        <span className="block truncate text-sm">{item.title}</span>
        <span className="mt-1 block text-xs text-foam/50">{formatTime(item.updatedAt)}</span>
      </button>
      <div className="relative grid h-9 w-9 shrink-0 place-items-center">
        <button
          type="button"
          className={`peer grid h-9 w-9 place-items-center rounded-full transition ${deleteClass}`}
          aria-label={armed ? t("confirmDelete") : t("delete")}
          onClick={() => {
            if (!armed) {
              setArmed(true)
              window.setTimeout(() => setArmed(false), 2500)
              return
            }
            onDelete(item.id)
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
        {running && !armed ? (
          <span className="history-spin pointer-events-none absolute group-hover:opacity-0 peer-focus-visible:opacity-0" role="status" aria-label={t("replying")} />
        ) : null}
      </div>
    </div>
  )
}

function HistorySkeleton() {
  return (
    <div className="grid gap-2 p-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="skeleton h-12 rounded-2xl" />
      ))}
    </div>
  )
}
