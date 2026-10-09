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
      if (event.type !== "conversationsChanged" && event.type !== "ready") return
      api.listConversations().then(setItems).catch((reason) => setError(errorText(reason, t("loadFailed"))))
    })
  }, [])

  async function remove(id: string) {
    await api.deleteConversation(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }

  return {
    items,
    loading,
    error,
    retry: () => setReloadKey((value) => value + 1),
    remove,
  }
}
