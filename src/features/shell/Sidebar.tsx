import { Images, Plus, Settings } from "lucide-react"
import { LogoMark } from "@/components/glass/LogoMark"
import { Button } from "@/components/ui/Button"
import { ButtonGroup, GroupButton } from "@/components/ui/ButtonGroup"
import { HistoryList } from "@/features/history/HistoryList"
import { t } from "@/i18n"
import type { Conversation } from "@/lib/types"

export function Sidebar({
  items,
  loading,
  error,
  selectedId,
  onNewChat,
  onSelect,
  onDelete,
  onRetry,
  panel,
  onOpenGallery,
  onOpenSettings,
}: {
  items: Conversation[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onNewChat: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onRetry: () => void
  panel: "chat" | "settings" | "gallery"
  onOpenGallery: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
      <div className="glass flex h-16 shrink-0 items-center justify-center gap-3 rounded-[28px]">
        <LogoMark />
        <span className="shine-text font-display text-2xl tracking-tight">{t("appName")}</span>
      </div>

      <section className="glass flex min-h-0 flex-1 flex-col rounded-[28px]">
          <div className="px-3 pb-2 pt-3">
            <Button className="w-full" tone="primary" onClick={onNewChat}>
              <Plus size={16} aria-hidden="true" />
              {t("newChat")}
            </Button>
          </div>
          <HistoryList
            items={items}
            loading={loading}
            error={error}
            selectedId={selectedId}
            onSelect={onSelect}
            onDelete={onDelete}
            onRetry={onRetry}
          />
      </section>

      <ButtonGroup label={t("sidebarTools")}>
        <GroupButton pressed={panel === "gallery"} aria-label={t("openGallery")} onClick={onOpenGallery}>
          <Images size={16} aria-hidden="true" />
          {t("gallery")}
        </GroupButton>
        <GroupButton
          pressed={panel === "settings"}
          edge="end"
          aria-label={t("openSettings")}
          className="border-l"
          onClick={onOpenSettings}
        >
          <Settings size={16} aria-hidden="true" />
          {t("settings")}
        </GroupButton>
      </ButtonGroup>
    </div>
  )
}
