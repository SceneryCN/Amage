import { zh, type MessageKey } from "./zh"

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let text: string = zh[key]
  if (!vars) return text
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}
