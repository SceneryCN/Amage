import { useEffect, useRef, useState } from "react"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { SettingsBlock, SettingsStack } from "@/features/settings/SettingsBlock"
import { errorText } from "@/lib/platform"
import { toast } from "@/lib/toast"
import type { HistoryRetention, Settings, StorageUsage } from "@/lib/types"

const RETENTION: { value: HistoryRetention; label: "retentionNever" | "retention7" | "retention30" | "retentionUnlimited" }[] = [
  { value: "never", label: "retentionNever" },
  { value: "days7", label: "retention7" },
  { value: "days30", label: "retention30" },
  { value: "unlimited", label: "retentionUnlimited" },
]

function formatBytes(bytes: number) {
  const gigabytes = bytes / (1024 * 1024 * 1024)
  if (gigabytes >= 0.1) return `${gigabytes.toFixed(1)} GB`
  const megabytes = bytes / (1024 * 1024)
  if (megabytes >= 0.1) return `${megabytes.toFixed(1)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

export function StorageSection({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (settings: Settings) => void
}) {
  const [limit, setLimit] = useState(settings.cacheLimitGb)
  const [usage, setUsage] = useState<StorageUsage | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [retention, setRetention] = useState(settings.historyRetention)
  const [usageKey, setUsageKey] = useState(0)
  const limitRef = useRef(settings.cacheLimitGb)
  const savedLimit = useRef(settings.cacheLimitGb)
  const savedRetention = useRef(settings.historyRetention)
  const savingRef = useRef(false)
  const pendingRef = useRef<{ limit: number; retention: HistoryRetention } | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    api.storageUsage()
      .then((next) => {
        if (!active) return
        setUsage(next)
        setUsageError(null)
      })
      .catch((reason) => {
        if (!active) return
        setUsageError(errorText(reason, t("loadFailed")))
      })
    return () => {
      active = false
    }
  }, [usageKey])

  function commit(nextLimit: number, retention: HistoryRetention) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (nextLimit === savedLimit.current && retention === savedRetention.current) return
    if (savingRef.current) {
      pendingRef.current = { limit: nextLimit, retention }
      return
    }
    savingRef.current = true
    api.saveStorage({ cacheLimitGb: nextLimit, historyRetention: retention })
      .then((next) => {
        savedLimit.current = next.cacheLimitGb
        savedRetention.current = next.historyRetention
        if (!pendingRef.current) {
          limitRef.current = next.cacheLimitGb
          setLimit(next.cacheLimitGb)
          setRetention(next.historyRetention)
        }
        onChange(next)
        toast(t("saved"))
        setUsageKey((value) => value + 1)
      })
      .catch((reason) => {
        if (!pendingRef.current) {
          limitRef.current = savedLimit.current
          setLimit(savedLimit.current)
          setRetention(savedRetention.current)
        }
        toast(errorText(reason, t("actionFailed")), "error")
      })
      .finally(() => {
        savingRef.current = false
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending) commit(pending.limit, pending.retention)
      })
  }

  function scheduleLimit(next: number) {
    limitRef.current = next
    setLimit(next)
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      commit(limitRef.current, savedRetention.current)
    }, 200)
  }

  const commitRef = useRef(commit)
  commitRef.current = commit

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) commitRef.current(limitRef.current, savedRetention.current)
    }
  }, [])

  return (
    <SettingsStack className="adapt-grid">
      <SettingsBlock>
      <div className="grid gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="cache-limit" className="text-sm">{t("cacheLimit")}</label>
          <span className="font-display text-2xl">{limit} GB</span>
        </div>
        <input
          id="cache-limit"
          type="range"
          min={1}
          max={10}
          step={1}
          value={limit}
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={limit}
          aria-valuetext={`${limit} GB`}
          className="accent-copper"
          onChange={(event) => scheduleLimit(Number(event.target.value))}
        />
        <p className="text-sm leading-6 text-foam/60">{t("cacheLimitHint")}</p>
        {usage ? <p className="text-sm text-foam/80">{t("storageUsed", { used: formatBytes(usage.bytes), limit: formatBytes(usage.limitBytes) })}</p> : null}
        {usageError ? (
          <p role="alert" className="text-sm text-rose">
            {usageError}{" "}
            <button type="button" className="underline" onClick={() => setUsageKey((value) => value + 1)}>{t("retry")}</button>
          </p>
        ) : null}
      </div>
      </SettingsBlock>

      <SettingsBlock>
      <div className="grid gap-3">
        <p className="text-sm">{t("historyRetention")}</p>
        <div role="radiogroup" aria-label={t("historyRetention")} className="grid grid-cols-2 gap-2">
          {RETENTION.map((option) => {
            const selected = retention === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`rounded-2xl px-3 py-3 text-sm transition ${selected ? "bg-white/15 text-foam" : "bg-white/5 text-foam/70 hover:bg-white/10"}`}
                onClick={() => {
                  if (option.value === retention) return
                  setRetention(option.value)
                  commit(limitRef.current, option.value)
                }}
              >
                {t(option.label)}
              </button>
            )
          })}
        </div>
        <p className="text-sm leading-6 text-foam/60">{t("retentionHint")}</p>
      </div>
      </SettingsBlock>
    </SettingsStack>
  )
}
