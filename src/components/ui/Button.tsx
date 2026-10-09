import type { ButtonHTMLAttributes } from "react"

type Tone = "primary" | "quiet" | "danger" | "ink"

const tones: Record<Tone, string> = {
  primary: "bg-copper text-ink hover:brightness-110 disabled:opacity-50",
  quiet: "bg-white/8 text-foam hover:bg-white/14 disabled:opacity-50",
  danger: "bg-rose/20 text-rose hover:bg-rose/30 disabled:opacity-50",
  ink: "border border-foam/30 bg-ink text-foam shadow-[0_10px_28px_rgba(0,0,0,0.55)] hover:border-foam/50 disabled:opacity-50",
}

export function Button({
  tone = "quiet",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type={type}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition ${tones[tone]} ${className}`}
      {...props}
    />
  )
}
