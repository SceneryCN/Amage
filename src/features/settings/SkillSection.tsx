import { useEffect, useState } from "react"
import { Plus, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { SettingsBlock, SettingsStack } from "@/features/settings/SettingsBlock"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { errorText } from "@/lib/platform"
import type { Skill } from "@/lib/types"

export function SkillSection() {
  const [items, setItems] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [formError, setFormError] = useState<string | null>(null)

  function load() {
    setLoading(true)
    api.listSkills()
      .then((list) => {
        setItems(list)
        setError(null)
      })
      .catch((reason) => setError(errorText(reason, t("loadFailed"))))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function importFile(file: File) {
    const content = await file.text()
    const name = file.name.replace(/\.md$/i, "")
    await api.createSkill(name, content)
    load()
  }

  return (
    <SettingsStack>
      {loading ? <div className="skeleton h-20 rounded-3xl" /> : null}
      {error ? <div className="grid gap-3"><p role="alert">{error}</p><Button onClick={load}>{t("retry")}</Button></div> : null}
      {!loading && !error && items.length === 0 ? <p className="glass-inset rounded-[22px] px-4 py-8 text-center text-sm text-foam/60">{t("emptySkills")}</p> : null}
      <div className={items.length > 0 ? "adapt-grid" : "hidden"}>
      {items.map((item) => (
        <article key={item.id} className="glass-inset grid gap-3 rounded-[28px] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl">{item.name}</h2>
            <div className="flex gap-2">
              <Button onClick={() => void api.setSkillEnabled(item.id, !item.enabled).then(load)}>
                {item.enabled ? t("active") : t("activate")}
              </Button>
              <button
                type="button"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-rose/20 text-rose transition hover:bg-rose/30"
                aria-label={t("delete")}
                onClick={() => void api.deleteSkill(item.id).then(load)}
              >
                <Trash2 size={16} className="shrink-0" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm text-foam/70">{item.content}</p>
        </article>
      ))}
      </div>
      <SettingsBlock>
      <p className="text-sm leading-6 text-foam/65">{t("skillHint")}</p>
      <div>
        <input
          id="skill-file"
          type="file"
          accept=".md,text/markdown,text/plain"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            void importFile(file).catch((reason) => setFormError(errorText(reason, t("actionFailed"))))
          }}
        />
        <Button onClick={() => document.getElementById("skill-file")?.click()}>
          <Upload size={16} aria-hidden="true" />
          {t("skillFile")}
        </Button>
      </div>
      <form
        key={formKey}
        className="settings-fields"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const name = String(data.get("name") ?? "")
          const content = String(data.get("content") ?? "")
          if (!name.trim() || !content.trim()) {
            setFormError(t("writeSomething"))
            return
          }
          void api.createSkill(name, content).then(() => {
            setFormKey((value) => value + 1)
            setFormError(null)
            load()
          }).catch((reason) => setFormError(errorText(reason, t("actionFailed"))))
        }}
      >
        <Field className="col-span-full" label={t("skillName")} error={formError ?? undefined}>
          <input name="name" className="glass-input" />
        </Field>
        <Field className="col-span-full" label={t("skillContent")}>
          <textarea name="content" className="glass-input min-h-32" />
        </Field>
        <div className="col-span-full"><Button type="submit"><Plus size={16} aria-hidden="true" />{t("addSkill")}</Button></div>
      </form>
      </SettingsBlock>
    </SettingsStack>
  )
}
