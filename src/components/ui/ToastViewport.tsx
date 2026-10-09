import { useSyncExternalStore } from "react"
import { CircleAlert, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { t } from "@/i18n"
import { TOAST_LIFE_MS, dismiss, getToasts, subscribeToasts } from "@/lib/toast"

const EASE = [0.22, 1, 0.36, 1] as const

export function ToastViewport() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getToasts)
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  return (
    <div className="pointer-events-none fixed left-1/2 top-16 z-50 flex w-[min(100%-2rem,22rem)] -translate-x-1/2 flex-col gap-2">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            initial={reduce ? false : { opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: reduce ? 0.01 : 0.38, ease: EASE }}
            className="glass pointer-events-auto relative overflow-hidden rounded-[22px]"
          >
            <div
              aria-hidden="true"
              className={`toast-ring ${item.tone === "error" ? "text-rose" : "text-copper"}`}
              style={{ animationDuration: `${TOAST_LIFE_MS}ms` }}
            />
            <div className="flex items-center gap-3 px-4 py-3 text-sm">
              <CircleAlert size={16} aria-hidden="true" className={item.tone === "error" ? "shrink-0 text-rose" : "shrink-0 text-copper"} />
              <p className="min-w-0 flex-1 leading-6">{item.message}</p>
              <button type="button" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foam/70 hover:bg-white/10" onClick={() => dismiss(item.id)} aria-label={t("dismiss")}>
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
