import { convertFileSrc } from "@tauri-apps/api/core"
import { isTauri } from "@/lib/platform"

export function imageSrc(path: string): string {
  if (path.startsWith("data:") || path.startsWith("blob:") || path.startsWith("http://") || path.startsWith("https://")) {
    return path
  }
  if (!isTauri) return path
  return convertFileSrc(path)
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : ""
      const comma = value.indexOf(",")
      resolve(comma >= 0 ? value.slice(comma + 1) : value)
    }
    reader.onerror = () => reject(reader.error ?? new Error("read failed"))
    reader.readAsDataURL(file)
  })
}

export function extensionOf(file: File): string {
  const name = file.name.split(".").pop()?.toLowerCase() ?? "png"
  if (name === "jpeg") return "jpg"
  return name
}
