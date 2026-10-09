import type { ButtonHTMLAttributes, ReactNode } from "react"

export function ButtonGroup({
  label,
  vertical = false,
  children,
}: {
  label: string
  vertical?: boolean
  children: ReactNode
}) {
  return (
    <div role="group" aria-label={label} className={`glass flex w-full shrink-0 overflow-hidden rounded-[28px] ${vertical ? "flex-col" : ""}`}>
      {children}
    </div>
  )
}

export function GroupButton({
  pressed,
  edge,
  vertical = false,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean
  edge?: "end"
  vertical?: boolean
}) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={`inline-flex h-11 min-w-0 shrink-0 items-center justify-center gap-2 px-3 text-sm transition ${
        vertical ? "w-full" : "flex-1"
      } ${
        pressed ? "bg-white/15 text-foam" : "text-foam/75 hover:bg-white/10"
      } ${edge === "end" ? "border-white/15" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
