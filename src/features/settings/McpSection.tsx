import { useEffect, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import { SettingsBlock, SettingsStack } from "@/features/settings/SettingsBlock"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { errorText } from "@/lib/platform"
import type { McpServer, McpStatus } from "@/lib/types"

export function McpSection() {
  const [items, setItems] = useState<McpServer[]>([])
  const [statuses, setStatuses] = useState<McpStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [transport, setTransport] = useState<"stdio" | "http">("stdio")
  const [formKey, setFormKey] = useState(0)
  const [pendingId, setPendingId] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Promise.all([api.listMcp(), api.mcpStatus()])
      .then(([servers, nextStatus]) => {
        setItems(servers)
        setStatuses(nextStatus)
        setError(null)
      })
      .catch((reason) => setError(errorText(reason, t("loadFailed"))))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  return (
    <SettingsStack>
      {loading ? <div className="skeleton h-24 rounded-3xl" /> : null}
      {error ? <div className="grid gap-3"><p role="alert">{error}</p><Button onClick={load}>{t("retry")}</Button></div> : null}
      {!loading && !error && items.length === 0 ? <p className="glass-inset rounded-[22px] px-4 py-8 text-center text-sm leading-6 text-foam/60">{t("mcpEmpty")}</p> : null}
      <div className={items.length > 0 ? "adapt-grid" : "hidden"}>
      {items.map((item) => {
        const status = statuses.find((entry) => entry.id === item.id)
        return (
          <article key={item.id} className="glass-inset grid gap-3 rounded-[28px] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl">{item.name}</h2>
                <p className="text-xs text-foam/55">{status?.connected ? t("connected") : status?.connecting ? t("connecting") : t("notConnected")}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => void api.setMcpEnabled(item.id, !item.enabled).then(load)}>{item.enabled ? t("active") : t("activate")}</Button>
                {status?.connected ? (
                  <Button onClick={() => void api.disconnectMcp(item.id).then(load)}>{t("disconnect")}</Button>
                ) : (
                  <Button
                    disabled={pendingId === item.id}
                    onClick={() => {
                      setPendingId(item.id)
                      void api.connectMcp(item.id).then(load).catch((reason) => setError(errorText(reason, t("actionFailed")))).finally(() => setPendingId(null))
                    }}
                  >
                    {pendingId === item.id ? t("connecting") : t("connect")}
                  </Button>
                )}
                <button
                  type="button"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-rose/20 text-rose transition hover:bg-rose/30"
                  aria-label={t("delete")}
                  onClick={() => void api.deleteMcp(item.id).then(load)}
                >
                  <Trash2 size={16} className="shrink-0" aria-hidden="true" />
                </button>
              </div>
            </div>
            {status?.error ? <p role="alert" className="text-sm text-rose">{status.error}</p> : null}
            {status && status.tools.length > 0 ? <p className="text-sm text-foam/70">{status.tools.join("、")}</p> : null}
            {status ? <p className="text-xs text-foam/50">{t("toolCount", { count: status.toolCount })}</p> : null}
          </article>
        )
      })}
      </div>
      <SettingsBlock>
      <form
        key={formKey}
        className="settings-fields"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const name = String(data.get("name") ?? "")
          if (!name.trim()) {
            setFormError(t("writeSomething"))
            return
          }
          void api.saveMcp({
            name,
            transport,
            command: String(data.get("command") ?? ""),
            args: String(data.get("args") ?? "").split("\n").map((line) => line.trim()).filter(Boolean),
            env: String(data.get("env") ?? ""),
            url: String(data.get("url") ?? ""),
            enabled: true,
          }).then(() => {
            setFormKey((value) => value + 1)
            setFormError(null)
            load()
          }).catch((reason) => setFormError(errorText(reason, t("actionFailed"))))
        }}
      >
        <Field label={t("mcpName")} error={formError ?? undefined}>
          <input name="name" className="glass-input" />
        </Field>
        <Field label={t("mcpTransport")}>
          <select className="glass-input" value={transport} onChange={(event) => setTransport(event.target.value === "http" ? "http" : "stdio")}>
            <option value="stdio">{t("stdio")}</option>
            <option value="http">{t("http")}</option>
          </select>
        </Field>
        {transport === "stdio" ? (
          <>
            <Field label={t("mcpCommand")} hint={t("mcpCommandHint")}>
              <input name="command" className="glass-input" spellCheck={false} />
            </Field>
            <Field className="col-span-full" label={t("mcpArgs")} hint={t("mcpArgsHint")}>
              <textarea name="args" className="glass-input min-h-24" />
            </Field>
            <Field className="col-span-full" label={t("mcpEnv")} hint={t("mcpEnvHint")}>
              <textarea name="env" className="glass-input min-h-20" />
            </Field>
          </>
        ) : (
          <Field label={t("mcpUrl")}>
            <input name="url" className="glass-input" spellCheck={false} />
          </Field>
        )}
        <div className="col-span-full"><Button type="submit"><Plus size={16} aria-hidden="true" />{t("addMcp")}</Button></div>
      </form>
      </SettingsBlock>
    </SettingsStack>
  )
}
