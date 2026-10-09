import { useState } from "react"
import { ArrowLeft, Cable, HardDrive, ScrollText, Sparkles, Waypoints } from "lucide-react"
import { motion } from "motion/react"
import { Button } from "@/components/ui/Button"
import { ConnectionSection } from "@/features/settings/ConnectionSection"
import { McpSection } from "@/features/settings/McpSection"
import { PromptSection } from "@/features/settings/PromptSection"
import { SkillSection } from "@/features/settings/SkillSection"
import { StorageSection } from "@/features/settings/StorageSection"
import { t } from "@/i18n"
import type { Settings } from "@/lib/types"

const TABS = [
  { id: "connection", icon: Cable },
  { id: "prompts", icon: ScrollText },
  { id: "skills", icon: Sparkles },
  { id: "mcp", icon: Waypoints },
  { id: "storage", icon: HardDrive },
] as const

type Tab = (typeof TABS)[number]["id"]

const EASE = [0.22, 1, 0.36, 1] as const

export function SettingsView({
  settings,
  onChange,
  onClose,
}: {
  settings: Settings
  onChange: (settings: Settings) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("connection")
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const index = TABS.findIndex((item) => item.id === tab)

  function move(step: number) {
    const next = TABS[(index + step + TABS.length) % TABS.length]
    if (next) setTab(next.id)
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between px-6 pb-2 pt-4">
        <h1 className="font-display text-2xl">{t("settings")}</h1>
        <Button onClick={onClose}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t("backToChat")}
        </Button>
      </header>
      <div className="px-6 pb-4">
        <div
          className="flex gap-1 overflow-x-auto"
          role="tablist"
          aria-label={t("settings")}
          aria-orientation="horizontal"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault()
              move(1)
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault()
              move(-1)
            }
          }}
        >
          {TABS.map((item) => {
            const Icon = item.icon
            const selected = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`settings-tab-${item.id}`}
                aria-selected={selected}
                aria-controls="settings-panel"
                tabIndex={selected ? 0 : -1}
                className={`relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm ${selected ? "text-foam" : "text-foam/60 hover:bg-white/10 hover:text-foam"}`}
                onClick={() => setTab(item.id)}
              >
                {selected ? <motion.span layoutId="settings-tab" className="absolute inset-0 rounded-2xl bg-white/12" transition={{ duration: reduce ? 0.01 : 0.28, ease: EASE }} /> : null}
                <Icon size={16} aria-hidden="true" className="relative" />
                <span className="relative">{t(item.id)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8" role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${tab}`}>
        <motion.div
          className="w-full min-w-0"
          key={tab}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.01 : 0.28, ease: EASE }}
        >
          {tab === "connection" ? <ConnectionSection key={`${settings.baseUrl}:${settings.chatModel}:${settings.imageModel}`} settings={settings} onSaved={onChange} /> : null}
          {tab === "prompts" ? <PromptSection /> : null}
          {tab === "skills" ? <SkillSection /> : null}
          {tab === "mcp" ? <McpSection /> : null}
          {tab === "storage" ? <StorageSection settings={settings} onChange={onChange} /> : null}
        </motion.div>
      </div>
    </section>
  )
}
