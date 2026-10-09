export const TOAST_LIFE_MS = 4800

export type ToastTone = "info" | "error"

export type ToastItem = {
  id: number
  message: string
  tone: ToastTone
}

type Listener = () => void

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export function toast(message: string, tone: ToastTone = "info") {
  const id = nextId
  nextId += 1
  items = [...items, { id, message, tone }].slice(-4)
  emit()
  window.setTimeout(() => dismiss(id), TOAST_LIFE_MS)
}

export function dismiss(id: number) {
  items = items.filter((item) => item.id !== id)
  emit()
}

export function getToasts(): ToastItem[] {
  return items
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
