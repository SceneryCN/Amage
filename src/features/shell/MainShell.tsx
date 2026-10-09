import { useEffect, useState } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { RotateCcw } from "lucide-react"
import { motion } from "motion/react"
import { Aurora } from "@/components/glass/Aurora"
import { Button } from "@/components/ui/Button"
import { ChatPane } from "@/features/chat/ChatPane"
import { GalleryView } from "@/features/gallery/GalleryView"
import { useConversations } from "@/features/history/useConversations"
import { SettingsView } from "@/features/settings/SettingsView"
import { Sidebar } from "@/features/shell/Sidebar"
import { StartupOverlay } from "@/features/startup/StartupOverlay"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { errorText, isTauri } from "@/lib/platform"
import { toast } from "@/lib/toast"
import type { Settings } from "@/lib/types"

type Panel = "chat" | "settings" | "gallery"

const EASE = [0.22, 1, 0.36, 1] as const

export function MainShell() {
  const history = useConversations()
  const [panel, setPanel] = useState<Panel>("chat")
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoadingSettings(true)
    api.getSettings()
      .then((next) => {
        if (!active) return
        setSettings(next)
        setSettingsError(null)
      })
      .catch((reason) => {
        if (active) setSettingsError(errorText(reason, t("loadFailed")))
      })
      .finally(() => {
        if (active) setLoadingSettings(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === "n") {
        event.preventDefault()
        setSelectedId(null)
        setPanel("chat")
      } else if (meta && event.key === ",") {
        event.preventDefault()
        setPanel("settings")
      } else if (event.key === "Escape" && panel !== "chat" && !document.querySelector("[data-preview-open]")) {
        setPanel("chat")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [panel])

  const configured = Boolean(settings?.baseUrl && settings.apiKey && settings.chatModel)
  const title = history.items.find((item) => item.id === selectedId)?.title
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const panelMotion = {
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, y: -8 },
    transition: { duration: reduce ? 0.01 : 0.32, ease: EASE },
  }

  return (
    <div className="relative h-full overflow-hidden bg-ink">
      <Aurora />
      <div
        data-tauri-drag-region
        className="window-drag absolute inset-x-0 top-0 z-30 h-10"
        onMouseDown={(event) => {
          if (event.button !== 0 || !isTauri) return
          void getCurrentWindow().startDragging()
        }}
      />
      <div
        className="relative z-10 grid h-full w-full min-h-0 min-w-0 gap-3 px-3 pb-3 pt-10"
        style={{ gridTemplateColumns: "minmax(200px, 18%) minmax(0, 1fr)" }}
      >
        <Sidebar
          items={history.items}
          loading={history.loading}
          error={history.error}
          selectedId={selectedId}
          runningIds={history.runningIds}
          onNewChat={() => { setSelectedId(null); setPanel("chat") }}
          onSelect={(id) => { setSelectedId(id); setPanel("chat") }}
          onDelete={(id) => {
            void history.remove(id).then(() => {
              if (selectedId === id) setSelectedId(null)
            }).catch((reason) => toast(errorText(reason, t("actionFailed")), "error"))
          }}
          onRetry={history.retry}
          panel={panel}
          onOpenGallery={() => setPanel("gallery")}
          onOpenSettings={() => setPanel("settings")}
        />
        <main className="glass-surface flex min-h-0 min-w-0 flex-col rounded-[28px]">
          {loadingSettings ? <div className="m-6 skeleton h-40 rounded-[28px]" /> : null}
          {settingsError ? (
            <div className="m-8 grid max-w-sm gap-3">
              <p role="alert">{settingsError}</p>
              <Button onClick={() => setReloadKey((value) => value + 1)}>
                <RotateCcw size={16} aria-hidden="true" />
                {t("retry")}
              </Button>
            </div>
          ) : null}
          {!loadingSettings && !settingsError && settings && panel === "settings" ? (
            <motion.div key="settings" className="flex min-h-0 min-w-0 flex-1 flex-col" initial={panelMotion.initial} animate={panelMotion.animate} transition={panelMotion.transition}>
              <SettingsView settings={settings} onChange={setSettings} onClose={() => setPanel("chat")} />
            </motion.div>
          ) : null}
          {!loadingSettings && !settingsError && panel === "gallery" ? (
            <motion.div key="gallery" className="flex min-h-0 min-w-0 flex-1 flex-col" initial={panelMotion.initial} animate={panelMotion.animate} transition={panelMotion.transition}>
              <GalleryView onClose={() => setPanel("chat")} />
            </motion.div>
          ) : null}
          {!loadingSettings && !settingsError && settings ? (
            <div className={panel === "chat" ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"} aria-hidden={panel !== "chat"}>
              <ChatPane conversationId={selectedId} title={title} configured={configured} onCreated={setSelectedId} />
            </div>
          ) : null}
        </main>
      </div>
      <StartupOverlay />
    </div>
  )
}
