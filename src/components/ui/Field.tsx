import type { ReactNode } from "react"

export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: string
  hint?: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`grid min-w-0 content-start gap-2 text-sm ${className}`}>
      <span className="text-foam/80">{label}</span>
      {children}
      {error ? <span role="alert" className="text-xs text-rose">{error}</span> : null}
      {!error && hint ? <span className="text-xs leading-5 text-foam/55">{hint}</span> : null}
    </label>
  )
}
