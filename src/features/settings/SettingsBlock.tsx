import type { ReactNode } from "react"

export function SettingsStack({ children, className = "grid" }: { children: ReactNode; className?: string }) {
  return <div className={`@container w-full min-w-0 gap-4 ${className}`}>{children}</div>
}

export function SettingsBlock({ children }: { children: ReactNode }) {
  return <section className="glass-inset grid gap-4 rounded-[28px] p-5">{children}</section>
}
