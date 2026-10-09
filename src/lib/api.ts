import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { mockStore } from "@/lib/mock"
import { isTauri } from "@/lib/platform"
import type { ChatEvent, ConnectionResult, Conversation, GalleryImage, HistoryRetention, McpInput, McpServer, McpStatus, Message, Prompt, SendInput, SendStarted, Settings, SettingsInput, Skill, StorageUsage } from "@/lib/types"

export function onChat(handler: (event: ChatEvent) => void): () => void {
  if (!isTauri) return mockStore.onChat(handler)
  let unlisten: UnlistenFn | undefined
  let active = true
  void listen<ChatEvent>("chat", (event) => handler(event.payload)).then((stop) => {
    if (!active) stop()
    else unlisten = stop
  })
  return () => {
    active = false
    unlisten?.()
  }
}

export const api = {
  getSettings: () => call<Settings>("get_settings"),
  saveSettings: (input: SettingsInput) => call<Settings>("save_settings", { input }),
  testConnection: (baseUrl: string, apiKey: string) => call<ConnectionResult>("test_connection", { input: { baseUrl, apiKey } }),
  listModels: (baseUrl: string, apiKey: string) => call<string[]>("list_models", { input: { baseUrl, apiKey } }),
  listPrompts: () => call<Prompt[]>("list_prompts"),
  createPrompt: (name: string, content: string) => call<Prompt>("create_prompt", { input: { name, content } }),
  updatePrompt: (id: string, name: string, content: string) => call<void>("update_prompt", { input: { id, name, content } }),
  deletePrompt: (id: string) => call<void>("delete_prompt", { id }),
  activatePrompt: (id: string) => call<void>("activate_prompt", { id }),
  listSkills: () => call<Skill[]>("list_skills"),
  createSkill: (name: string, content: string) => call<Skill>("create_skill", { input: { name, content } }),
  setSkillEnabled: (id: string, enabled: boolean) => call<void>("set_skill_enabled", { input: { id, enabled } }),
  deleteSkill: (id: string) => call<void>("delete_skill", { id }),
  listMcp: () => call<McpServer[]>("list_mcp"),
  mcpStatus: () => call<McpStatus[]>("mcp_status"),
  saveMcp: (input: McpInput) => call<McpServer>("save_mcp", { input }),
  connectMcp: (id: string) => call<McpStatus>("connect_mcp", { id }),
  disconnectMcp: (id: string) => call<void>("disconnect_mcp", { id }),
  setMcpEnabled: (id: string, enabled: boolean) => call<void>("set_mcp_enabled", { input: { id, enabled } }),
  deleteMcp: (id: string) => call<void>("delete_mcp", { id }),
  listConversations: () => call<Conversation[]>("list_conversations"),
  deleteConversation: (id: string) => call<void>("delete_conversation", { id }),
  listMessages: (conversationId: string) => call<Message[]>("list_messages", { conversationId }),
  sendMessage: (input: SendInput) => call<SendStarted>("send_message", { input }),
  retryMessage: (conversationId: string) => call<SendStarted>("retry_message", { conversationId }),
  cancelGeneration: (conversationId: string) => call<void>("cancel_generation", { conversationId }),
  listGallery: () => call<GalleryImage[]>("list_gallery"),
  exportImage: (source: string, destination: string) => call<void>("export_image", { input: { source, destination } }),
  storageUsage: () => call<StorageUsage>("storage_usage"),
  saveStorage: (input: { cacheLimitGb: number; historyRetention: HistoryRetention }) => call<Settings>("save_storage", { input }),
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return mockCall<T>(command, args ?? {})
  return invoke<T>(command, args)
}

async function mockCall<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const store = mockStore
  switch (command) {
    case "get_settings": return store.getSettings() as T
    case "save_settings": return store.saveSettings(args.input as SettingsInput) as T
    case "test_connection": {
      const input = args.input as { baseUrl: string; apiKey: string }
      return store.testConnection(input) as Promise<T>
    }
    case "list_models": {
      const input = args.input as { baseUrl: string; apiKey: string }
      return store.listModels(input) as Promise<T>
    }
    case "list_prompts": return store.listPrompts() as T
    case "create_prompt": {
      const input = args.input as { name: string; content: string }
      return store.createPrompt(input.name, input.content) as T
    }
    case "update_prompt": {
      const input = args.input as { id: string; name: string; content: string }
      store.updatePrompt(input.id, input.name, input.content)
      return undefined as T
    }
    case "delete_prompt":
      store.deletePrompt(String(args.id))
      return undefined as T
    case "activate_prompt":
      store.activatePrompt(String(args.id))
      return undefined as T
    case "list_skills": return store.listSkills() as T
    case "create_skill": {
      const input = args.input as { name: string; content: string }
      return store.createSkill(input.name, input.content) as T
    }
    case "set_skill_enabled": {
      const input = args.input as { id: string; enabled: boolean }
      store.setSkillEnabled(input.id, input.enabled)
      return undefined as T
    }
    case "delete_skill":
      store.deleteSkill(String(args.id))
      return undefined as T
    case "list_mcp": return store.listMcp() as T
    case "mcp_status": return store.mcpStatus() as T
    case "save_mcp": return store.saveMcp(args.input as McpInput) as T
    case "connect_mcp": return store.connectMcp(String(args.id)) as Promise<T>
    case "disconnect_mcp":
      store.disconnectMcp(String(args.id))
      return undefined as T
    case "set_mcp_enabled": {
      const input = args.input as { id: string; enabled: boolean }
      store.setMcpEnabled(input.id, input.enabled)
      return undefined as T
    }
    case "delete_mcp":
      store.deleteMcp(String(args.id))
      return undefined as T
    case "list_conversations": return store.listConversations() as T
    case "delete_conversation":
      store.deleteConversation(String(args.id))
      return undefined as T
    case "list_messages": return store.listMessages(String(args.conversationId)) as T
    case "send_message": return store.sendMessage(args.input as SendInput) as T
    case "retry_message": return store.retryMessage(String(args.conversationId)) as T
    case "cancel_generation":
      store.cancelGeneration(String(args.conversationId))
      return undefined as T
    case "list_gallery": return store.listGallery() as T
    case "storage_usage": return store.storageUsage() as T
    case "save_storage": return store.saveStorage(args.input as { cacheLimitGb: number; historyRetention: HistoryRetention }) as T
    default: throw new Error(command)
  }
}
