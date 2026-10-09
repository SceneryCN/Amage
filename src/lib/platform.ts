export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

export function errorText(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error
  if (error instanceof Error && error.message.trim()) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message
    if (typeof message === "string" && message.trim()) return message
  }
  return fallback
}
