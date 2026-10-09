import { useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { Download, Eye } from "lucide-react"
import { t } from "@/i18n"
import { downloadImage } from "@/lib/download"
import { imageSrc } from "@/lib/files"
import { errorText } from "@/lib/platform"
import { toast } from "@/lib/toast"

export function HoverImage({
  path,
  alt,
  onPreview,
  frameClassName,
  imgClassName,
  style,
  caption,
  loading,
}: {
  path: string
  alt: string
  onPreview: () => void
  frameClassName: string
  imgClassName: string
  style?: CSSProperties
  caption?: string
  loading?: "eager" | "lazy"
}) {
  const saving = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function onDownload(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await downloadImage(path)
    } catch (reason) {
      toast(errorText(reason, t("downloadFailed")), "error")
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <div className={`image-frame ${failed ? "" : "cursor-pointer"} ${frameClassName}`} style={style} onClick={failed ? undefined : onPreview}>
      {failed ? (
        <p className="grid h-full place-items-center px-3 text-xs text-foam/60">{t("imageFailed")}</p>
      ) : (
        <img src={imageSrc(path)} alt={alt} loading={loading} decoding={loading === "lazy" ? "async" : undefined} className={imgClassName} onError={() => setFailed(true)} />
      )}
      {failed ? null : (
        <div className="image-actions">
          <button type="button" className="image-action" aria-label={t("previewImage")} onClick={(event) => {
            event.stopPropagation()
            onPreview()
          }}>
            <Eye size={18} aria-hidden="true" />
          </button>
          <button type="button" className="image-action" aria-label={busy ? t("downloading") : t("downloadImage")} disabled={busy} onClick={(event) => void onDownload(event)}>
            <Download size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      {caption ? (
        <span className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-ink/80 to-transparent px-3 py-2 text-left text-xs text-foam/80 opacity-0 transition group-hover:opacity-100">
          {caption}
        </span>
      ) : null}
    </div>
  )
}
