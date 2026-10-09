import { useEffect, useState } from "react"
import { api, onChat } from "@/lib/api"
import { errorText } from "@/lib/platform"
import type { Conversation } from "@/lib/types"
import { t } from "@/i18n"

export function useConversations() {
  const [items, setItems] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let active = true
    setLoading(true)
    api.listConversations()
      .then((list) => {
        if (!active) return
        setItems(list)
        setError(null)
      })
      .catch((reason) => {
        if (active) setError(errorText(reason, t("loadFailed")))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [reloadKey])

  useEffect(() => {
    return onChat((event) => {
      if (event.type === "conversationsChanged" || event.type === "ready") {
        api.listConversations().then(setItems).catch((reason) => setError(errorText(reason, t("loadFailed"))))
      }
      if (event.type === "ready") {
        setRunningIds((current) => addId(current, event.conversationId))
      } else if (event.type === "done" || event.type === "error" || event.type === "cancelled") {
        setRunningIds((current) => removeId(current, event.conversationId))
      }
    })
  }, [])

  async function remove(id: string) {
    await api.deleteConversation(id)
    setItems((current) => current.filter((item) => item.id !== id))
    setRunningIds((current) => removeId(current, id))
  }

  return {
    items,
    loading,
    error,
    runningIds,
    retry: () => setReloadKey((value) => value + 1),
    remove,
  }
}

function addId(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (current.has(id)) return current
  const next = new Set(current)
  next.add(id)
  return next
}

function removeId(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!current.has(id)) return current
  const next = new Set(current)
  next.delete(id)
  return next
}
