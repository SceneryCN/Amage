import { save } from "@tauri-apps/plugin-dialog"
import { t } from "@/i18n"
import { api } from "@/lib/api"
import { imageSrc } from "@/lib/files"
import { isTauri } from "@/lib/platform"

export async function downloadImage(path: string): Promise<"saved" | "cancelled"> {
  const name = fileName(path)
  if (!isTauri) {
    await downloadInBrowser(path, name)
    return "saved"
  }
  const extension = name.split(".").pop()?.toLowerCase() || "png"
  const destination = await save({
    defaultPath: name,
    filters: [{ name: t("imageFile"), extensions: [extension === "jpeg" ? "jpg" : extension] }],
  })
  if (destination === null) return "cancelled"
  await api.exportImage(path, destination)
  return "saved"
}

function fileName(path: string): string {
  if (!path.startsWith("data:")) {
    const name = path.split(/[/\\]/).pop()
    if (name && name.includes(".")) return name
  }
  const mime = path.startsWith("data:") ? path.slice(5, path.indexOf(";")) : ""
  if (mime === "image/jpeg") return "amage.jpg"
  if (mime === "image/webp") return "amage.webp"
  if (mime === "image/gif") return "amage.gif"
  if (mime === "image/svg+xml") return "amage.svg"
  return "amage.png"
}

async function downloadInBrowser(path: string, name: string) {
  const response = await fetch(imageSrc(path))
  if (!response.ok) throw new Error("download failed")
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
