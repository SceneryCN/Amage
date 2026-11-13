import { Music, Palette, ScanEye } from "lucide-react"
import { LogoMark } from "@/components/glass/LogoMark"
import type { ChatWelcomeProps } from "@/features/chat/types"
import { t } from "@/i18n"
import { trackSpotlight } from "@/lib/spotlight"

const SUGGESTIONS = [
  { key: "suggestionsDraw", icon: Palette, tone: "text-copper" },
  { key: "suggestionsPoster", icon: Music, tone: "text-rose" },
  { key: "suggestionsVision", icon: ScanEye, tone: "text-sea" },
] as const

/** 新对话的空状态：标志、一句引导，以及三张点一下就发送的建议卡片。 */
export function ChatWelcome({ configured, pending, onPick }: ChatWelcomeProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-7 overflow-y-auto px-8 py-6 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="welcome-mark">
          <LogoMark className="relative h-12 w-12" />
        </span>
        <h2 className="font-display text-3xl tracking-tight text-foam">{t("welcomeTitle")}</h2>
        <p className="max-w-md text-sm leading-6 text-foam/60">{configured ? t("configuredReady") : t("notConfigured")}</p>
      </div>
      <div className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        {SUGGESTIONS.map(({ key, icon: Icon, tone }) => (
          <button
            key={key}
            type="button"
            className="suggestion-card"
            disabled={!configured || pending}
            onPointerMove={trackSpotlight}
            onClick={() => onPick(t(key))}
          >
            <span aria-hidden="true" className="spotlight-layer" />
            <span className={`relative grid size-9 place-items-center rounded-xl bg-white/8 ${tone}`}>
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="relative text-sm leading-6 text-foam/85">{t(key)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
