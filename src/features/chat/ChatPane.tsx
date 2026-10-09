import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { Composer } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { useChat } from "@/features/chat/useChat"
import { ImagePreview } from "@/features/preview/ImagePreview"
import { t } from "@/i18n"
import { errorText } from "@/lib/platform"
import { toast } from "@/lib/toast"

const SUGGESTIONS = ["suggestionsDraw", "suggestionsPoster", "suggestionsVision"] as const

export function ChatPane({
  conversationId,
  title,
  configured,
  onCreated,
}: {
  conversationId: string | null
  title?: string
  configured: boolean
  onCreated: (id: string) => void
}) {
  const chat = useChat(conversationId, onCreated)
  const [preview, setPreview] = useState<{ images: string[]; index: number } | null>(null)
  const empty = !chat.loading && !chat.error && chat.messages.length === 0

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center px-6 pb-2 pt-4">
        <h1 className="truncate font-display text-2xl">{title || t("newChat")}</h1>
      </header>
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
          <p className="max-w-md text-sm leading-6 text-foam/65">{configured ? t("configuredReady") : t("notConfigured")}</p>
          <div className="flex max-w-xl flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((key) => (
              <Button
                key={key}
                disabled={!configured || chat.pending}
                onClick={() => {
                  void chat.send(t(key), []).catch((reason) => toast(errorText(reason, t("actionFailed")), "error"))
                }}
              >
                {t(key)}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <MessageList
          conversationId={conversationId}
          messages={chat.messages}
          loading={chat.loading}
          error={chat.error}
          onRetryLoad={chat.reload}
          onPreview={(images, index) => setPreview({ images, index })}
          onRetryMessage={() => {
            void chat.retry().catch((reason) => toast(errorText(reason, t("actionFailed")), "error"))
          }}
        />
      )}
      <Composer
        pending={chat.pending}
        configured={configured}
        onSend={chat.send}
        onStop={chat.stop}
      />
      {preview ? <ImagePreview images={preview.images} index={preview.index} onClose={() => setPreview(null)} /> : null}
    </section>
  )
}
