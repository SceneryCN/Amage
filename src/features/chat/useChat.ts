import { useEffect, useRef, useState } from "react"
import { api, onChat } from "@/lib/api"
import { extensionOf, fileToBase64 } from "@/lib/files"
import { errorText } from "@/lib/platform"
import type { Message, SendStarted, UiMessage } from "@/lib/types"
import { t } from "@/i18n"

export function useChat(conversationId: string | null, onCreated: (id: string) => void) {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const conversationRef = useRef(conversationId)
  conversationRef.current = conversationId
  const sendingRef = useRef<string | null>(null)
  sendingRef.current = sendingId
  const onCreatedRef = useRef(onCreated)
  onCreatedRef.current = onCreated
  const requestRef = useRef(0)
  const deltaQueue = useRef(new Map<string, string>())
  const deltaFrame = useRef(0)

  function applyDeltas() {
    deltaFrame.current = 0
    const batch = deltaQueue.current
    if (batch.size === 0) return
    deltaQueue.current = new Map()
    setMessages((current) => current.map((item) => {
      const extra = batch.get(item.id)
      return extra ? { ...item, content: item.content + extra, status: "streaming" } : item
    }))
  }

  function queueDelta(messageId: string, text: string) {
    const queue = deltaQueue.current
    queue.set(messageId, (queue.get(messageId) ?? "") + text)
    if (deltaFrame.current) return
    deltaFrame.current = requestAnimationFrame(applyDeltas)
  }

  function flushDeltas() {
    if (deltaFrame.current) cancelAnimationFrame(deltaFrame.current)
    applyDeltas()
  }

  useEffect(() => {
    const stop = onChat((event) => {
      if (event.type === "conversationsChanged") return
      if (event.type === "ready") {
        const viewing = conversationRef.current
        if (viewing && event.conversationId !== viewing && sendingRef.current !== "draft") return
        conversationRef.current = event.conversationId
        onCreatedRef.current(event.conversationId)
        setSendingId(null)
        setMessages((current) => mergeReady(current, event))
        return
      }
      if (event.conversationId !== conversationRef.current) return
      if (event.type === "delta") {
        queueDelta(event.messageId, event.text)
      } else if (event.type === "tool") {
        flushDeltas()
        setMessages((current) => current.map((item) => item.id === event.messageId ? { ...item, activity: event.label } : item))
      } else if (event.type === "image") {
        setMessages((current) => current.map((item) => item.id === event.messageId && !item.images.includes(event.path) ? { ...item, images: [...item.images, event.path] } : item))
      } else if (event.type === "done") {
        flushDeltas()
        setMessages((current) => current.map((item) => item.id === event.messageId ? { ...item, status: "complete", activity: undefined } : item))
        setSendingId(null)
      } else if (event.type === "error") {
        flushDeltas()
        setMessages((current) => current.map((item) => item.id === event.messageId ? { ...item, status: "error", error: event.message, activity: undefined } : item))
        setSendingId(null)
      } else if (event.type === "cancelled") {
        flushDeltas()
        setMessages((current) => current.map((item) => item.id === event.messageId ? { ...item, status: "cancelled", activity: undefined } : item))
        setSendingId(null)
      }
    })
    return () => {
      stop()
      if (deltaFrame.current) cancelAnimationFrame(deltaFrame.current)
    }
  }, [])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setLoading(false)
      setError(null)
      return
    }
    const request = ++requestRef.current
    setLoading(true)
    api.listMessages(conversationId)
      .then((list) => {
        if (request !== requestRef.current) return
        setMessages((current) => {
          const local = current.filter((item) => item.conversationId === conversationId)
          // A live reply already owns this transcript. Replacing it with the stored
          // snapshot races the next delta and repeats the first character.
          if (local.some((item) => item.status === "streaming")) return local
          return list.map(copyMessage)
        })
        setError(null)
      })
      .catch((reason) => {
        if (request === requestRef.current) setError(errorText(reason, t("loadFailed")))
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false)
      })
  }, [conversationId, version])

  const pending = sendingId === (conversationId ?? "draft") || messages.some((item) => item.status === "streaming")

  async function send(content: string, files: File[]) {
    if (pending) return
    setSendingId(conversationId ?? "draft")
    try {
      const attachments = []
      for (const file of files) {
        attachments.push({ bytesBase64: await fileToBase64(file), extension: extensionOf(file) })
      }
      const started = await api.sendMessage({ conversationId, content, attachments })
      conversationRef.current = started.conversationId
      onCreated(started.conversationId)
      setMessages((current) => mergeReady(current, { type: "ready", ...started }))
      setSendingId(null)
    } catch (reason) {
      setSendingId(null)
      throw reason
    }
  }

  async function retry() {
    if (!conversationId || pending) return
    setSendingId(conversationId)
    try {
      const started = await api.retryMessage(conversationId)
      setMessages((current) => replaceAssistant(current, started))
      setSendingId(null)
    } catch (reason) {
      setSendingId(null)
      throw reason
    }
  }

  function stop() {
    const id = conversationRef.current
    if (!id) return
    void api.cancelGeneration(id)
  }

  return { messages, loading, error, pending, send, retry, stop, reload: () => setVersion((value) => value + 1) }
}

function mergeReady(current: UiMessage[], event: SendStarted | { type: "ready" } & SendStarted): UiMessage[] {
  const next = current.filter((item) => item.id !== event.userMessage.id && item.id !== event.assistantMessage.id)
  const sameConversation = next.filter((item) => item.conversationId === event.conversationId)
  const other = current.length > 0 && current[0]?.conversationId !== event.conversationId ? [] : sameConversation
  return [...other, copyMessage(event.userMessage), copyMessage(event.assistantMessage)]
}

function copyMessage(message: Message): UiMessage {
  return { ...message, images: [...message.images] }
}

function replaceAssistant(current: UiMessage[], started: SendStarted): UiMessage[] {
  const trimmed = [...current]
  const last = trimmed[trimmed.length - 1]
  if (last?.role === "assistant") trimmed.pop()
  return [...trimmed, copyMessage(started.assistantMessage)]
}
