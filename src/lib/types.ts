export type HistoryRetention = "never" | "days7" | "days30" | "unlimited"

export type Settings = {
  baseUrl: string
  apiKey: string
  chatModel: string
  imageModel: string
  cacheLimitGb: number
  historyRetention: HistoryRetention
}

export type GalleryImage = {
  id: string
  path: string
  width: number
  height: number
  bytes: number
  createdAt: number
}

export type StorageUsage = {
  bytes: number
  limitBytes: number
}

export type Conversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export type Message = {
  id: string
  conversationId: string
  role: "user" | "assistant"
  content: string
  images: string[]
  status: "complete" | "streaming" | "error" | "cancelled"
  error: string | null
  createdAt: number
}

export type UiMessage = Message & { activity?: string }

export type Prompt = {
  id: string
  name: string
  content: string
  active: boolean
  createdAt: number
}

export type Skill = {
  id: string
  name: string
  content: string
  enabled: boolean
  createdAt: number
}

export type McpServer = {
  id: string
  name: string
  transport: "stdio" | "http"
  command: string
  args: string[]
  env: string
  url: string
  enabled: boolean
  createdAt: number
}

export type McpStatus = {
  id: string
  connected: boolean
  connecting: boolean
  toolCount: number
  tools: string[]
  error: string | null
}

export type Attachment = {
  bytesBase64: string
  extension: string
}

export type SendInput = {
  conversationId: string | null
  content: string
  attachments: Attachment[]
}

export type SendStarted = {
  conversationId: string
  userMessage: Message
  assistantMessage: Message
}

export type ChatEvent =
  | { type: "ready"; conversationId: string; userMessage: Message; assistantMessage: Message }
  | { type: "delta"; conversationId: string; messageId: string; text: string }
  | { type: "tool"; conversationId: string; messageId: string; label: string }
  | { type: "image"; conversationId: string; messageId: string; path: string }
  | { type: "done"; conversationId: string; messageId: string }
  | { type: "error"; conversationId: string; messageId: string; message: string }
  | { type: "cancelled"; conversationId: string; messageId: string }
  | { type: "conversationsChanged" }

export type ConnectionResult = {
  message: string
  models: string[]
}

export type SettingsInput = {
  baseUrl: string
  apiKey: string
  chatModel: string
  imageModel: string
}

export type McpInput = {
  id?: string
  name: string
  transport: "stdio" | "http"
  command: string
  args: string[]
  env: string
  url: string
  enabled: boolean
}
