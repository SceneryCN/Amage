import { useEffect, useState } from "react"
import { Check, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { SettingsBlock, SettingsStack } from "@/features/settings/SettingsBlock"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { errorText } from "@/lib/platform"
import type { Prompt } from "@/lib/types"

export function PromptSection() {
  const [items, setItems] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [nameError, setNameError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api.listPrompts()
      .then((list) => {
        setItems(list)
        setError(null)
      })
      .catch((reason) => setError(errorText(reason, t("loadFailed"))))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const selected = items.find((item) => item.id === editing) ?? null

  return (
    <SettingsStack>
      {loading ? <div className="skeleton h-24 rounded-3xl" /> : null}
      {error ? <div className="grid gap-3"><p role="alert">{error}</p><Button onClick={load}>{t("retry")}</Button></div> : null}
      {!loading && !error && items.length === 0 ? <p className="glass-inset rounded-[22px] px-4 py-8 text-center text-sm text-foam/60">{t("emptyPrompts")}</p> : null}
      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.id} className="glass-inset flex items-center gap-3 rounded-[22px] px-4 py-3">
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setEditing(item.id)}>{item.name}</button>
            {item.active ? <span className="shrink-0 text-xs text-copper">{t("active")}</span> : null}
            <Button className="shrink-0" onClick={() => { if (!item.active) void api.activatePrompt(item.id).then(load) }}>
              <Check size={16} aria-hidden="true" />
              {t("activate")}
            </Button>
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-rose/20 text-rose transition hover:bg-rose/30"
              aria-label={t("delete")}
              onClick={() => void api.deletePrompt(item.id).then(() => { if (editing === item.id) setEditing(null); load() })}
            >
              <Trash2 size={16} className="shrink-0" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      {selected ? (
        <SettingsBlock>
        <form
          key={selected.id}
          className="settings-fields"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const name = String(data.get("name") ?? "")
            const content = String(data.get("content") ?? "")
            if (!name.trim() || !content.trim()) {
              setNameError(t("writeSomething"))
              return
            }
            setNameError(null)
            void api.updatePrompt(selected.id, name, content).then(load).catch((reason) => setNameError(errorText(reason, t("actionFailed"))))
          }}
        >
          <Field className="col-span-full" label={t("promptName")} error={nameError ?? undefined}>
            <input name="name" className="glass-input" defaultValue={selected.name} />
          </Field>
          <Field className="col-span-full" label={t("promptContent")}>
            <textarea name="content" className="glass-input min-h-40" defaultValue={selected.content} />
          </Field>
          <div className="col-span-full"><Button tone="primary" type="submit"><Check size={16} aria-hidden="true" />{t("savePrompt")}</Button></div>
        </form>
        </SettingsBlock>
      ) : null}
      <SettingsBlock>
      <form
        key={formKey}
        className="settings-fields"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const name = String(data.get("name") ?? "")
          const content = String(data.get("content") ?? "")
          if (!name.trim() || !content.trim()) {
            setNameError(t("writeSomething"))
            return
          }
          void api.createPrompt(name, content).then(() => {
            setFormKey((value) => value + 1)
            setNameError(null)
            load()
          }).catch((reason) => setNameError(errorText(reason, t("actionFailed"))))
        }}
      >
        <Field className="col-span-full" label={t("promptName")}>
          <input name="name" className="glass-input" />
        </Field>
        <Field className="col-span-full" label={t("promptContent")}>
          <textarea name="content" className="glass-input min-h-28" />
        </Field>
        <div className="col-span-full"><Button type="submit"><Plus size={16} aria-hidden="true" />{t("addPrompt")}</Button></div>
      </form>
      </SettingsBlock>
    </SettingsStack>
  )
}
