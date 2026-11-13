import { useState } from "react"
import { ChatWelcome } from "@/features/chat/components/ChatWelcome"
import { Composer } from "@/features/chat/Composer"
import { MessageList } from "@/features/chat/MessageList"
import { useChat } from "@/features/chat/useChat"
import { ImagePreview } from "@/features/preview/ImagePreview"
import { t } from "@/i18n"
import { errorText } from "@/lib/platform"
import { toast } from "@/lib/toast"
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
      <header className="flex shrink-0 items-center justify-between gap-4 px-6 pb-2 pt-4">
        <h1 className="min-w-0 truncate font-display text-2xl">{title || t("newChat")}</h1>
        <span className={`status-pill ${configured ? "text-sea" : "text-rose"}`}>
          <span className="status-dot" aria-hidden="true" />
          {configured ? t("statusReady") : t("statusMissing")}
        </span>
      </header>
      {empty ? (
        <ChatWelcome
          configured={configured}
          pending={chat.pending}
          onPick={(prompt) => {
            void chat.send(prompt, []).catch((reason) => toast(errorText(reason, t("actionFailed")), "error"))
          }}
        />
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
