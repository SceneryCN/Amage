import { useEffect, useRef, useState } from "react"
import { Check, Eye, EyeOff, Plug } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { ModelField } from "@/features/settings/ModelField"
import { SettingsBlock, SettingsStack } from "@/features/settings/SettingsBlock"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { errorText } from "@/lib/platform"
import { toast } from "@/lib/toast"
import type { Settings } from "@/lib/types"

type Catalog = {
  phase: "idle" | "loading" | "ready" | "manual"
  models: string[] | null
  chat: string
  image: string
  /** Remounts the uncontrolled model fields so a new list picks up the current choice. */
  version: number
}

export function ConnectionSection({ settings, onSaved }: { settings: Settings; onSaved: (settings: Settings) => void }) {
  const formRef = useRef<HTMLFormElement>(null)
  const request = useRef(0)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<"save" | "test" | null>(null)
  const [catalog, setCatalog] = useState<Catalog>(() => ({
    phase: settings.baseUrl && settings.apiKey ? "loading" : "idle",
    models: null,
    chat: settings.chatModel,
    image: settings.imageModel,
    version: 0,
  }))

  function read() {
    const data = new FormData(formRef.current ?? undefined)
    return {
      baseUrl: String(data.get("baseUrl") ?? ""),
      apiKey: String(data.get("apiKey") ?? ""),
      chatModel: String(data.get("chatModel") ?? ""),
      imageModel: String(data.get("imageModel") ?? ""),
    }
  }

  function applyModels(models: string[], chat: string, image: string) {
    setCatalog((current) => ({
      phase: models.length > 0 ? "ready" : "manual",
      models,
      chat,
      image,
      version: current.version + 1,
    }))
  }

  useEffect(() => {
    if (!settings.baseUrl || !settings.apiKey) return
    const current = ++request.current
    api.listModels(settings.baseUrl, settings.apiKey)
      .then((models) => {
        if (current === request.current) applyModels(models, settings.chatModel, settings.imageModel)
      })
      .catch(() => {
        if (current === request.current) setCatalog((value) => ({ ...value, phase: "manual" }))
      })
  }, [settings.baseUrl, settings.apiKey, settings.chatModel, settings.imageModel])

  const modelHint = (fallback: string) =>
    catalog.phase === "loading" ? t("modelsLoading") : catalog.phase === "manual" ? t("modelsManual") : fallback

  return (
    <SettingsStack>
    <SettingsBlock>
    <form
      ref={formRef}
      className="settings-fields"
      onSubmit={(event) => {
        event.preventDefault()
        setPending("save")
        setError(null)
        api.saveSettings(read())
          .then((next) => {
            onSaved(next)
            toast(t("saved"))
          })
          .catch((reason) => setError(errorText(reason, t("actionFailed"))))
          .finally(() => setPending(null))
      }}
    >
      <Field label={t("baseUrl")} hint={t("baseUrlHint")} error={error ?? undefined}>
        <input name="baseUrl" className="glass-input" defaultValue={settings.baseUrl} autoComplete="off" spellCheck={false} />
      </Field>
      <Field label={t("apiKey")}>
        <div className="flex items-stretch gap-2">
          <input name="apiKey" type={showKey ? "text" : "password"} className="glass-input" defaultValue={settings.apiKey} autoComplete="off" />
          <button
            type="button"
            className="glass-inset inline-flex w-12 shrink-0 items-center justify-center rounded-2xl text-foam"
            aria-label={showKey ? t("hideKey") : t("showKey")}
            aria-pressed={showKey}
            onClick={() => setShowKey((value) => !value)}
          >
            {showKey ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </Field>
      <ModelField
        key={`chat-${catalog.version}`}
        name="chatModel"
        label={t("chatModel")}
        hint={modelHint(t("chatModelHint"))}
        models={catalog.models}
        defaultValue={catalog.chat}
      />
      <ModelField
        key={`image-${catalog.version}`}
        name="imageModel"
        label={t("imageModel")}
        hint={modelHint(t("imageModelHint"))}
        models={catalog.models}
        defaultValue={catalog.image}
        optional
      />
      <div className="col-span-full flex gap-2">
        <Button tone="primary" type="submit" disabled={pending !== null}>
          <Check size={16} aria-hidden="true" />
          {pending === "save" ? t("saving") : t("save")}
        </Button>
        <Button
          disabled={pending !== null}
          onClick={() => {
            const input = read()
            const current = ++request.current
            setPending("test")
            setError(null)
            api.testConnection(input.baseUrl, input.apiKey)
              .then((result) => {
                toast(result.message)
                if (current === request.current) applyModels(result.models, input.chatModel, input.imageModel)
              })
              .catch((reason) => setError(errorText(reason, t("actionFailed"))))
              .finally(() => setPending(null))
          }}
        >
          <Plug size={16} aria-hidden="true" />
          {pending === "test" ? t("testing") : t("testConnection")}
        </Button>
      </div>
    </form>
    </SettingsBlock>
    </SettingsStack>
  )
}
