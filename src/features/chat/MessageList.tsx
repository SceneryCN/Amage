import { memo, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { MarkdownText } from "@/features/chat/MarkdownText"
import { HoverImage } from "@/features/preview/HoverImage"
import { t } from "@/i18n"
import { imageSrc } from "@/lib/files"
import type { UiMessage } from "@/lib/types"

export function MessageList({
  conversationId,
  messages,
  loading,
  error,
  onRetryLoad,
  onPreview,
  onRetryMessage,
}: {
  conversationId: string | null
  messages: UiMessage[]
  loading: boolean
  error: string | null
  onRetryLoad: () => void
  onPreview: (images: string[], index: number) => void
  onRetryMessage: () => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const locking = useRef(false)
  const awayRef = useRef(false)
  const conversationRef = useRef(conversationId)
  const userIdRef = useRef<string | null>(null)
  const streamIdRef = useRef<string | null>(null)
  const [away, setAway] = useState(false)
  const ready = !loading && !error && messages.length > 0

  function scrollToEnd() {
    const parent = parentRef.current
    if (!parent) return
    const gap = parent.scrollHeight - parent.scrollTop - parent.clientHeight
    if (gap <= 1) return
    locking.current = true
    parent.scrollTop = parent.scrollHeight
    requestAnimationFrame(() => {
      locking.current = false
    })
  }

  useLayoutEffect(() => {
    const last = messages[messages.length - 1]
    let pin = false
    if (conversationRef.current !== conversationId) {
      conversationRef.current = conversationId
      pin = true
    }
    if (last?.role === "user" && userIdRef.current !== last.id) {
      userIdRef.current = last.id
      pin = true
    }
    if (last?.status === "streaming" && streamIdRef.current !== last.id) {
      streamIdRef.current = last.id
      pin = true
    }
    if (pin) {
      pinnedRef.current = true
      if (awayRef.current) {
        awayRef.current = false
        setAway(false)
      }
    }
    if (pinnedRef.current && !loading) scrollToEnd()
  }, [conversationId, loading, messages])

  useEffect(() => {
    const content = contentRef.current
    if (!ready || !content) return
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToEnd()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [ready])

  function onScroll() {
    if (locking.current) return
    const parent = parentRef.current
    if (!parent) return
    const gap = parent.scrollHeight - parent.scrollTop - parent.clientHeight
    pinnedRef.current = gap <= 1
    const nextAway = gap > 48
    if (nextAway !== awayRef.current) {
      awayRef.current = nextAway
      setAway(nextAway)
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={parentRef}
        onScroll={onScroll}
        onWheel={(event) => {
          const parent = parentRef.current
          if (!parent || event.deltaY >= 0 || parent.scrollTop <= 0) return
          pinnedRef.current = false
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "PageUp" || event.key === "Home") pinnedRef.current = false
        }}
        className="h-full overflow-y-auto px-6 py-5"
        style={{ overflowAnchor: "none" }}
        role="log"
        aria-label={t("transcript")}
        aria-busy={loading}
      >
        {loading ? (
          <div className="grid gap-3">
            <div className="skeleton h-16 w-2/3 rounded-3xl" />
            <div className="skeleton ml-auto h-16 w-1/2 rounded-3xl" />
          </div>
        ) : null}
        {!loading && error ? (
          <div className="grid justify-items-start gap-3">
            <p role="alert">{error}</p>
            <Button onClick={onRetryLoad}><RotateCcw size={16} aria-hidden="true" />{t("retry")}</Button>
          </div>
        ) : null}
        {!loading && !error ? (
          <div ref={contentRef} className="flex w-full flex-col items-start gap-4">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onPreview={onPreview} onRetryMessage={onRetryMessage} />
            ))}
          </div>
        ) : null}
      </div>
      {away ? (
        <Button tone="ink" className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2" onClick={() => {
          const parent = parentRef.current
          if (!parent) return
          pinnedRef.current = true
          awayRef.current = false
          setAway(false)
          scrollToEnd()
        }}>
          <ArrowDown size={16} aria-hidden="true" />
          {t("jumpLatest")}
        </Button>
      ) : null}
    </div>
  )
}

const MessageBubble = memo(function MessageBubble({
  message,
  onPreview,
  onRetryMessage,
}: {
  message: UiMessage
  onPreview: (images: string[], index: number) => void
  onRetryMessage: () => void
}) {
  const waiting = message.status === "streaming" && message.content.length === 0 && message.activity !== t("drawing")
  return (
    <article
      className={`max-w-[85%] rounded-[24px] px-4 py-3 ${message.role === "user" ? "self-end bg-copper/18" : "glass"}`}
    >
      {waiting ? (
        <p className="flex items-center gap-2 text-sm text-foam/70" role="status">
          <span className="reply-dot" />
          <span className="reply-dot" />
          <span className="reply-dot" />
          {t("replying")}
        </p>
      ) : null}
      {message.content ? <MarkdownText text={message.content} /> : null}
      {message.activity && message.activity !== t("drawing") ? <p className="mt-2 text-sm text-sea" aria-live="polite">{message.activity}</p> : null}
      {message.status === "streaming" && message.activity === t("drawing") && message.images.length === 0 ? (
        <DreamImage spaced={message.content.length > 0} />
      ) : null}
      {message.status === "cancelled" ? <p className="mt-2 text-sm text-foam/55">{t("stopped")}</p> : null}
      {message.status === "error" ? (
        <div className="mt-3 grid justify-items-start gap-2">
          <p role="alert" className="text-sm text-rose">{message.error || t("generationFailed")}</p>
          <Button tone="danger" onClick={onRetryMessage}><RotateCcw size={16} aria-hidden="true" />{t("retry")}</Button>
        </div>
      ) : null}
      {message.images.length > 0 ? (
        <div className={`mt-3 grid w-full gap-2 ${message.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {message.images.map((path, index) => (
            message.role === "user" ? (
              <ChatImage
                key={path}
                path={path}
                alt={t("attachedImage")}
                onClick={() => onPreview(message.images, index)}
              />
            ) : (
              <HoverImage
                key={path}
                path={path}
                alt={t("generatedImage")}
                frameClassName="relative w-full overflow-hidden rounded-2xl"
                imgClassName="image-reveal block h-auto w-full"
                onPreview={() => onPreview(message.images, index)}
              />
            )
          ))}
        </div>
      ) : null}
    </article>
  )
})

function DreamImage({ spaced }: { spaced: boolean }) {
  return (
    <div className={`image-dream ${spaced ? "mt-3" : ""}`} role="status" aria-label={t("drawing")}>
      <div className="image-dream-wash" />
      <div className="image-dream-sheen" />
      <p className="relative text-sm text-foam">{t("drawing")}</p>
    </div>
  )
}

function ChatImage({ path, alt, onClick }: { path: string; alt: string; onClick: () => void }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <p className="text-sm text-foam/60">{t("imageFailed")}</p>
  return (
    <button type="button" onClick={onClick} className="block w-full overflow-hidden rounded-2xl" aria-label={alt}>
      <img src={imageSrc(path)} alt={alt} className="image-reveal block h-auto w-full" onError={() => setFailed(true)} />
    </button>
  )
}
