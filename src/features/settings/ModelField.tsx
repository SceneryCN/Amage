import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown } from "lucide-react"
import { Field } from "@/components/ui/Field"
import { t } from "@/i18n"

const LIST_HEIGHT = 224

export function ModelField({
  name,
  label,
  hint,
  models,
  defaultValue,
  optional = false,
}: {
  name: string
  label: string
  hint: string
  /** `null` while the list is unknown; the field then falls back to free text. */
  models: string[] | null
  defaultValue: string
  optional?: boolean
}) {
  if (!models || models.length === 0) {
    return (
      <Field label={label} hint={hint}>
        <input name={name} className="glass-input" defaultValue={defaultValue} autoComplete="off" spellCheck={false} />
      </Field>
    )
  }

  return (
    <ModelMenu
      name={name}
      label={label}
      hint={hint}
      models={defaultValue && !models.includes(defaultValue) ? [defaultValue, ...models] : models}
      defaultValue={defaultValue}
      optional={optional}
    />
  )
}

function ModelMenu({
  name,
  label,
  hint,
  models,
  defaultValue,
  optional,
}: {
  name: string
  label: string
  hint: string
  models: string[]
  defaultValue: string
  optional: boolean
}) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const needle = query.trim().toLowerCase()
  const options = models.filter((model) => model.toLowerCase().includes(needle))
  const showNone = optional && (needle.length === 0 || t("noImageModel").includes(query.trim()))

  useEffect(() => {
    if (!open) return
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      const space = window.innerHeight - rect.bottom - 16
      setBox({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(120, Math.min(LIST_HEIGHT, space)),
      })
    }
    function onPointer(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest("[data-model-menu]")) return
      setOpen(false)
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    document.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      document.removeEventListener("pointerdown", onPointer)
    }
  }, [open])

  function choose(next: string) {
    setValue(next)
    setOpen(false)
    setQuery("")
  }

  return (
    <Field label={label} hint={hint}>
      <div ref={rootRef} className="relative">
        <input type="hidden" name={name} value={value} readOnly />
        <button
          ref={buttonRef}
          type="button"
          className="glass-input flex w-full items-center justify-between gap-3 text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="truncate">{value || t("pickModel")}</span>
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-foam/60" />
        </button>
      </div>
      {open && box ? createPortal(
        <div
          data-model-menu
          className="model-menu fixed z-50 grid gap-2 rounded-2xl p-2"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          <input
            className="glass-input"
            value={query}
            placeholder={t("searchModels")}
            aria-label={t("searchModels")}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false)
            }}
          />
          <ul id={listId} role="listbox" aria-label={label} className="overflow-y-auto" style={{ maxHeight: box.maxHeight }}>
            {showNone ? (
              <li>
                <Option selected={value === ""} onChoose={() => choose("")}>{t("noImageModel")}</Option>
              </li>
            ) : null}
            {options.map((model) => (
              <li key={model}>
                <Option selected={value === model} onChoose={() => choose(model)}>{model}</Option>
              </li>
            ))}
            {!showNone && options.length === 0 ? <li className="px-3 py-2 text-sm text-foam/55">{t("noModelMatch")}</li> : null}
          </ul>
        </div>,
        document.body,
      ) : null}
    </Field>
  )
}

function Option({ selected, onChoose, children }: { selected: boolean; onChoose: () => void; children: string }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selected ? "bg-white/15 text-foam" : "text-foam/80 hover:bg-white/10"}`}
      onClick={onChoose}
    >
      {children}
    </button>
  )
}
