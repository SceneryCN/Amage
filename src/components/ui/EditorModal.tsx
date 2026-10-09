import { useEffect, useRef, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { Check, X } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { t } from "@/i18n"
import { errorText } from "@/lib/platform"

export function EditorModal({
  title,
  nameLabel,
  contentLabel,
  name,
  content,
  onClose,
  onSubmit,
}: {
  title: string
  nameLabel: string
  contentLabel: string
  name: string
  content: string
  onClose: () => void
  onSubmit: (name: string, content: string) => Promise<void>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.querySelector<HTMLElement>("input")?.focus()

    function focusable() {
      if (!dialog) return []
      return [...dialog.querySelectorAll<HTMLElement>("button, input, textarea, select")].filter((node) => !node.hidden && !node.hasAttribute("disabled"))
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return
      const nodes = focusable()
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      previous?.focus()
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    const nextName = String(data.get("name") ?? "").trim()
    const nextContent = String(data.get("content") ?? "").trim()
    if (!nextName || !nextContent) {
      setError(t("writeSomething"))
      return
    }
    setPending(true)
    setError(null)
    try {
      await onSubmit(nextName, nextContent)
    } catch (reason) {
      setError(errorText(reason, t("actionFailed")))
      setPending(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-40 grid place-items-center p-4">
      <button type="button" className="absolute inset-0 bg-ink/70" aria-label={t("dismiss")} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-modal-title"
        className="glass relative z-10 grid max-h-[min(40rem,calc(100vh-2rem))] w-full max-w-2xl gap-4 overflow-y-auto rounded-[28px] p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="editor-modal-title" className="font-display text-xl">{title}</h2>
          <button
            type="button"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-foam hover:bg-white/16"
            aria-label={t("dismiss")}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <Field label={nameLabel} error={error ?? undefined}>
            <input name="name" className="glass-input" defaultValue={name} />
          </Field>
          <Field label={contentLabel}>
            <textarea name="content" className="glass-input max-h-[50vh] min-h-48" defaultValue={content} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>{t("cancel")}</Button>
            <Button tone="primary" type="submit" disabled={pending}>
              <Check size={16} aria-hidden="true" />
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
