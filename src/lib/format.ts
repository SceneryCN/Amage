import { t } from "@/i18n"

export function formatTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  if (delta < 60_000) return t("relativeJustNow")
  if (delta < 3_600_000) return t("relativeMinutes", { count: Math.floor(delta / 60_000) })
  if (delta < 86_400_000) return t("relativeHours", { count: Math.floor(delta / 3_600_000) })
  if (delta < 172_800_000) return t("relativeYesterday")
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(timestamp)
}
