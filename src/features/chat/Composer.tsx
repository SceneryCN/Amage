import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react"
import { ImagePlus, SendHorizontal, Square } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { t } from "@/i18n"
import { errorText } from "@/lib/platform"
import { toast } from "@/lib/toast"

const MAX_IMAGES = 8

type Attachment = { id: string; file: File; url: string }

export function Composer({
  pending,
  configured,
  onSend,
  onStop,
}: {
  pending: boolean
  configured: boolean
  onSend: (text: string, files: File[]) => Promise<void>
  onStop: () => void
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Attachment[]>([])
  const dragDepth = useRef(0)
  const [files, setFiles] = useState<Attachment[]>([])
  const [hasText, setHasText] = useState(false)
  const [dragging, setDragging] = useState(false)
  filesRef.current = files

  useEffect(() => {
    return () => {
      for (const item of filesRef.current) URL.revokeObjectURL(item.url)
    }
  }, [])

  function grow(element: HTMLTextAreaElement) {
    element.style.height = "0px"
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }

  function addImages(list: File[]) {
    const images = list.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name))
    if (images.length === 0) return
    const room = MAX_IMAGES - files.length
    if (images.length > room) toast(t("tooManyImages"))
    const accepted = images.slice(0, Math.max(room, 0))
    if (accepted.length === 0) return
    setFiles((current) => [
      ...current,
      ...accepted.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) })),
    ].slice(0, MAX_IMAGES))
  }

  function acceptsFiles(event: DragEvent) {
    const types = [...event.dataTransfer.types]
    if (types.length === 0) return true
    return types.some((type) => type === "Files" || type === "public.file-url" || type === "text/uri-list" || type.startsWith("image/"))
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    const text = fieldRef.current?.value.trim() ?? ""
    if (!text && files.length === 0) return
    if (!configured || pending) return
    const sending = files.map((item) => item.file)
    try {
      await onSend(text, sending)
      if (fieldRef.current) {
        fieldRef.current.value = ""
        grow(fieldRef.current)
      }
      setHasText(false)
      for (const item of files) URL.revokeObjectURL(item.url)
      setFiles([])
    } catch (reason) {
      toast(errorText(reason, t("actionFailed")), "error")
    }
  }

  const canSend = configured && (hasText || files.length > 0)

  return (
    <div className="px-4 pb-4">
      <form
        onSubmit={(event) => void submit(event)}
        className={`composer glass relative overflow-hidden rounded-[28px] p-3 ${dragging ? "ring-1 ring-copper" : ""}`}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
          event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
        }}
        onDragEnter={(event) => {
          if (!acceptsFiles(event)) return
          event.preventDefault()
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={(event) => {
          if (!acceptsFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
        }}
        onDragLeave={(event) => {
          if (!acceptsFiles(event)) return
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={(event) => {
          if (!acceptsFiles(event)) return
          event.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          addImages([...(event.dataTransfer.files ?? [])])
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(180px circle at var(--spot-x, 50%) var(--spot-y, 40%), rgba(227, 154, 85, 0.18), transparent 70%)" }}
        />
        <div className="relative">
        {dragging ? <p className="px-2 pb-2 text-xs text-copper">{t("dropImages")}</p> : null}
        {files.length > 0 ? (
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {files.map((item) => (
              <div key={item.id} className="relative h-16 w-16 shrink-0">
                <img src={item.url} alt={t("attachedImage")} className="h-full w-full rounded-2xl object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-ink/70 px-1.5 text-xs"
                  aria-label={t("removeAttachment")}
                  onClick={() => {
                    URL.revokeObjectURL(item.url)
                    setFiles((current) => current.filter((file) => file.id !== item.id))
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <label className="grid gap-2">
          <span className="sr-only">{t("composerLabel")}</span>
          <textarea
            ref={fieldRef}
            rows={1}
            placeholder={t("composerPlaceholder")}
            className="max-h-40 resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none"
            onInput={(event) => {
              setHasText(event.currentTarget.value.trim().length > 0)
              grow(event.currentTarget)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
              event.preventDefault()
              if (!event.currentTarget.value.trim() && files.length === 0) return
              event.currentTarget.form?.requestSubmit()
            }}
          />
        </label>
        {!configured ? <p id="composer-hint" className="px-2 pb-2 text-xs text-foam/60">{t("notConfigured")}</p> : null}
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                addImages([...(event.target.files ?? [])])
                event.target.value = ""
              }}
            />
            <Button className="h-11 w-11 px-0" aria-label={t("attach")} onClick={() => fileRef.current?.click()}>
              <ImagePlus size={18} aria-hidden="true" />
            </Button>
          </div>
          {pending ? (
            <Button tone="danger" onClick={onStop}><Square size={14} aria-hidden="true" />{t("stop")}</Button>
          ) : (
            <Button tone="primary" type="submit" disabled={!canSend} aria-describedby={!configured ? "composer-hint" : undefined}>
              <SendHorizontal size={16} aria-hidden="true" />
              {t("send")}
            </Button>
          )}
        </div>
        </div>
      </form>
    </div>
  )
}
