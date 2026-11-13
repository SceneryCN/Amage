export type ChatWelcomeProps = {
  configured: boolean
  /** 有回复正在进行时禁用建议，避免重复发送。 */
  pending: boolean
  onPick: (prompt: string) => void
}
