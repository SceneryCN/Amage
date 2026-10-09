import wiglockSkill from "@/content/wiglock-pro.md?raw"
import type { ChatEvent, ConnectionResult, Conversation, GalleryImage, HistoryRetention, McpServer, McpStatus, Message, Prompt, SendInput, SendStarted, Settings, SettingsInput, Skill, StorageUsage } from "@/lib/types"

const SETTINGS_KEY = "amage-mock-settings"
const MOCK_MODELS = ["dall-e-3", "gpt-4o", "gpt-4o-mini", "gpt-image-1"] as const
const GB = 1024 * 1024 * 1024

type Handler = (event: ChatEvent) => void

function now() {
  return Date.now()
}

function id() {
  return crypto.randomUUID()
}

function cloneMessage(message: Message): Message {
  return { ...message, images: [...message.images] }
}

const defaultPrompt: Prompt = {
  id: "default",
  name: "默认",
  content: "你是 Amage，驻留在这台电脑上的对话与图像助手。",
  active: true,
  createdAt: now(),
}

function isRetention(value: unknown): value is HistoryRetention {
  return value === "never" || value === "days7" || value === "days30" || value === "unlimited"
}

function readSettings(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY)
  const parsed = raw ? JSON.parse(raw) as Partial<Settings> : {}
  const gigabytes = Number(parsed.cacheLimitGb)
  return {
    baseUrl: parsed.baseUrl ?? "",
    apiKey: parsed.apiKey ?? "",
    chatModel: parsed.chatModel ?? "",
    imageModel: parsed.imageModel ?? "",
    cacheLimitGb: Number.isFinite(gigabytes) ? Math.min(10, Math.max(1, Math.round(gigabytes))) : 5,
    historyRetention: isRetention(parsed.historyRetention) ? parsed.historyRetention : "never",
  }
}

export class MockStore {
  private settings = readSettings()
  private prompts: Prompt[] = [defaultPrompt]
  private skills: Skill[] = [{
    id: "wiglock-pro",
    name: "WigLock Pro",
    content: wiglockSkill.trim(),
    enabled: true,
    createdAt: 1,
  }]
  private servers: McpServer[] = []
  private statuses = new Map<string, McpStatus>()
  private conversations: Conversation[] = []
  private messages = new Map<string, Message[]>()
  private gallery: GalleryImage[] = []
  private timers = new Map<string, number>()
  private chatHandlers = new Set<Handler>()

  onChat(handler: Handler) {
    this.chatHandlers.add(handler)
    return () => this.chatHandlers.delete(handler)
  }

  private emit(event: ChatEvent) {
    for (const handler of this.chatHandlers) handler(event)
  }

  getSettings() {
    return this.settings
  }

  saveSettings(input: SettingsInput) {
    this.settings = { ...this.settings, ...input }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    return this.settings
  }

  saveStorage(input: { cacheLimitGb: number; historyRetention: HistoryRetention }) {
    const cacheLimitGb = Math.min(10, Math.max(1, Math.round(input.cacheLimitGb)))
    const historyRetention = isRetention(input.historyRetention) ? input.historyRetention : "never"
    this.settings = { ...this.settings, cacheLimitGb, historyRetention }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings))
    this.applyRetention()
    this.enforceCache()
    this.emit({ type: "conversationsChanged" })
    return this.settings
  }

  listGallery() {
    return this.gallery.map((item) => ({ ...item }))
  }

  storageUsage(): StorageUsage {
    return {
      bytes: this.gallery.reduce((total, item) => total + item.bytes, 0),
      limitBytes: this.settings.cacheLimitGb * GB,
    }
  }

  async listModels(input: { baseUrl: string; apiKey: string }) {
    await wait(280)
    if (!input.baseUrl.startsWith("http")) throw new Error("服务地址需要以 http:// 或 https:// 开头")
    if (!input.apiKey.trim()) throw new Error("先填写密钥")
    if (input.baseUrl.includes("fail")) throw new Error("连不上这个地址")
    return [...MOCK_MODELS]
  }

  async testConnection(input: { baseUrl: string; apiKey: string }): Promise<ConnectionResult> {
    const models = await this.listModels(input)
    return { message: `已连通，读到 ${models.length} 个模型（浏览器预览的模拟数据）`, models }
  }

  listPrompts() { return this.prompts }
  createPrompt(name: string, content: string) {
    const prompt: Prompt = { id: id(), name, content, active: false, createdAt: now() }
    this.prompts = [...this.prompts, prompt]
    return prompt
  }
  updatePrompt(promptId: string, name: string, content: string) {
    this.prompts = this.prompts.map((item) => item.id === promptId ? { ...item, name, content } : item)
  }
  deletePrompt(promptId: string) {
    const active = this.prompts.find((item) => item.id === promptId)?.active
    this.prompts = this.prompts.filter((item) => item.id !== promptId)
    if (active && this.prompts[0]) this.activatePrompt(this.prompts[0].id)
  }
  activatePrompt(promptId: string) {
    this.prompts = this.prompts.map((item) => ({ ...item, active: item.id === promptId }))
  }

  listSkills() { return this.skills }
  createSkill(name: string, content: string) {
    const skill: Skill = { id: id(), name, content, enabled: true, createdAt: now() }
    this.skills = [...this.skills, skill]
    return skill
  }
  updateSkill(skillId: string, name: string, content: string) {
    this.skills = this.skills.map((item) => item.id === skillId ? { ...item, name, content } : item)
  }
  setSkillEnabled(skillId: string, enabled: boolean) {
    this.skills = this.skills.map((item) => item.id === skillId ? { ...item, enabled } : item)
  }
  deleteSkill(skillId: string) {
    this.skills = this.skills.filter((item) => item.id !== skillId)
  }

  listMcp() { return this.servers }
  mcpStatus() { return [...this.statuses.values()] }
  saveMcp(input: Omit<McpServer, "id" | "createdAt"> & { id?: string }) {
    const server: McpServer = {
      id: input.id ?? id(),
      name: input.name,
      transport: input.transport,
      command: input.command,
      args: input.args,
      env: input.env,
      url: input.url,
      enabled: input.enabled,
      createdAt: this.servers.find((item) => item.id === input.id)?.createdAt ?? now(),
    }
    this.servers = this.servers.some((item) => item.id === server.id)
      ? this.servers.map((item) => item.id === server.id ? server : item)
      : [...this.servers, server]
    return server
  }
  async connectMcp(serverId: string) {
    await wait(240)
    const server = this.servers.find((item) => item.id === serverId)
    if (!server) throw new Error("没有找到这个 MCP")
    if (server.transport === "stdio" && !server.command.trim()) throw new Error("先填写要启动的命令")
    const status: McpStatus = { id: serverId, connected: true, connecting: false, toolCount: 2, tools: ["list_files", "read_note"], error: null }
    this.statuses.set(serverId, status)
    return status
  }
  disconnectMcp(serverId: string) {
    this.statuses.delete(serverId)
  }
  setMcpEnabled(serverId: string, enabled: boolean) {
    this.servers = this.servers.map((item) => item.id === serverId ? { ...item, enabled } : item)
    if (!enabled) this.statuses.delete(serverId)
  }
  deleteMcp(serverId: string) {
    this.servers = this.servers.filter((item) => item.id !== serverId)
    this.statuses.delete(serverId)
  }

  listConversations() {
    this.applyRetention()
    return [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  }
  deleteConversation(conversationId: string) {
    this.conversations = this.conversations.filter((item) => item.id !== conversationId)
    this.messages.delete(conversationId)
    this.emit({ type: "conversationsChanged" })
  }
  listMessages(conversationId: string) {
    return (this.messages.get(conversationId) ?? []).map(cloneMessage)
  }
  sendMessage(input: SendInput): SendStarted {
    if (!this.settings.baseUrl || !this.settings.apiKey || !this.settings.chatModel) {
      throw new Error("先在设置里填写服务地址、密钥和对话模型")
    }
    const content = input.content.trim()
    if (!content && input.attachments.length === 0) throw new Error("写点什么，或附上一张图")
    if (input.attachments.length > 8) throw new Error("一次最多八张图片")
    const conversationId = input.conversationId ?? id()
    if (!input.conversationId) {
      const title = content.slice(0, 28) || "图片对话"
      this.conversations = [{ id: conversationId, title, createdAt: now(), updatedAt: now() }, ...this.conversations]
    } else {
      this.conversations = this.conversations.map((item) => item.id === conversationId ? { ...item, updatedAt: now() } : item)
    }
    const userMessage: Message = {
      id: id(),
      conversationId,
      role: "user",
      content,
      images: input.attachments.map((file) => `data:image/png;base64,${file.bytesBase64}`),
      status: "complete",
      error: null,
      createdAt: now(),
    }
    const assistantMessage: Message = {
      id: id(),
      conversationId,
      role: "assistant",
      content: "",
      images: [],
      status: "streaming",
      error: null,
      createdAt: now() + 1,
    }
    const list = this.messages.get(conversationId) ?? []
    this.messages.set(conversationId, [...list, userMessage, assistantMessage])
    const started = { conversationId, userMessage, assistantMessage }
    this.emit({ type: "ready", conversationId, userMessage: cloneMessage(userMessage), assistantMessage: cloneMessage(assistantMessage) })
    this.emit({ type: "conversationsChanged" })
    this.streamReply(started, content)
    return { conversationId, userMessage: cloneMessage(userMessage), assistantMessage: cloneMessage(assistantMessage) }
  }

  retryMessage(conversationId: string): SendStarted {
    const list = this.messages.get(conversationId) ?? []
    const assistant = list[list.length - 1]
    const user = list[list.length - 2]
    if (!assistant || !user) throw new Error("还没有可以重试的回复")
    const replacement: Message = { ...assistant, id: id(), content: "", images: [], status: "streaming", error: null, createdAt: now() }
    this.messages.set(conversationId, [...list.slice(0, -1), replacement])
    const started = { conversationId, userMessage: user, assistantMessage: replacement }
    this.emit({ type: "ready", conversationId, userMessage: cloneMessage(user), assistantMessage: cloneMessage(replacement) })
    this.streamReply(started, user.content)
    return { conversationId, userMessage: cloneMessage(user), assistantMessage: cloneMessage(replacement) }
  }

  cancelGeneration(conversationId: string) {
    const timer = this.timers.get(conversationId)
    if (timer) window.clearTimeout(timer)
    this.timers.delete(conversationId)
    const list = this.messages.get(conversationId) ?? []
    const last = list[list.length - 1]
    if (!last) return
    last.status = "cancelled"
    this.emit({ type: "cancelled", conversationId, messageId: last.id })
  }

  private streamReply(started: SendStarted, content: string) {
    const wantsImage = /画|图|海报|插画|照片|image|picture|poster/i.test(content)
    const reply = wantsImage ? "我来把这个画面留下来。" : "我在。你想继续聊，还是把这句话变成一张图？"
    const chars = [...reply]
    let index = 0
    let timer = 0
    const tick = () => {
      const message = this.messages.get(started.conversationId)?.find((item) => item.id === started.assistantMessage.id)
      if (!message || message.status !== "streaming") {
        window.clearTimeout(timer)
        this.timers.delete(started.conversationId)
        return
      }
      if (index < chars.length) {
        const text = chars[index] ?? ""
        index += 1
        message.content += text
        this.emit({ type: "delta", conversationId: started.conversationId, messageId: message.id, text })
        timer = window.setTimeout(tick, 180)
        this.timers.set(started.conversationId, timer)
        return
      }
      this.timers.delete(started.conversationId)
      if (wantsImage) {
        this.emit({ type: "tool", conversationId: started.conversationId, messageId: message.id, label: "正在绘制" })
        timer = window.setTimeout(() => {
          const current = this.messages.get(started.conversationId)?.find((item) => item.id === started.assistantMessage.id)
          if (!current || current.status !== "streaming") return
          const image = this.rememberGenerated(content)
          current.images = [image.path]
          this.emit({ type: "image", conversationId: started.conversationId, messageId: message.id, path: image.path })
          current.status = "complete"
          this.emit({ type: "done", conversationId: started.conversationId, messageId: message.id })
        }, 1600)
        this.timers.set(started.conversationId, timer)
        return
      }
      message.status = "complete"
      this.emit({ type: "done", conversationId: started.conversationId, messageId: message.id })
    }
    timer = window.setTimeout(tick, 180)
    this.timers.set(started.conversationId, timer)
  }

  private rememberGenerated(prompt: string) {
    const image = mockImage(prompt)
    this.gallery = [image, ...this.gallery]
    this.enforceCache()
    return this.gallery.find((item) => item.id === image.id) ?? image
  }

  private applyRetention() {
    const mode = this.settings.historyRetention
    if (mode !== "days7" && mode !== "days30") return
    const days = mode === "days7" ? 7 : 30
    const cutoff = now() - days * 24 * 60 * 60 * 1000
    const removed = this.conversations.filter((item) => item.updatedAt < cutoff)
    if (removed.length === 0) return
    const gone = new Set(removed.map((item) => item.id))
    this.conversations = this.conversations.filter((item) => !gone.has(item.id))
    for (const id of gone) this.messages.delete(id)
  }

  private enforceCache() {
    const limit = this.settings.cacheLimitGb * GB
    const oldest = [...this.gallery].sort((a, b) => a.createdAt - b.createdAt)
    let used = oldest.reduce((total, item) => total + item.bytes, 0)
    const drop = new Set<string>()
    for (const item of oldest) {
      if (used <= limit) break
      drop.add(item.id)
      used -= item.bytes
    }
    if (drop.size > 0) this.gallery = this.gallery.filter((item) => !drop.has(item.id))
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function mockImage(prompt: string): GalleryImage {
  const sizes = [[1024, 1280], [1024, 1024], [1280, 860]] as const
  const size = sizes[prompt.length % sizes.length] ?? sizes[1]
  const width = size[0]
  const height = size[1]
  const label = prompt.slice(0, 18) || "Amage"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1b140f"/><stop offset="0.5" stop-color="#e39a55"/><stop offset="1" stop-color="#8ec7bf"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#g)"/><circle cx="${width / 2}" cy="${height * 0.42}" r="180" fill="none" stroke="#f6f1e8" stroke-opacity="0.8" stroke-width="18"/><text x="${width / 2}" y="${height * 0.78}" text-anchor="middle" fill="#f6f1e8" font-size="42" font-family="Georgia">${escapeXml(label)}</text></svg>`
  const path = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  return { id: id(), path, width, height, bytes: path.length, createdAt: now() }
}

function escapeXml(value: string) {
  return value.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char] ?? char)
}

export const mockStore = new MockStore()
