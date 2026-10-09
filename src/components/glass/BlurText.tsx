import { motion } from "motion/react"

export function BlurText({ text, className = "" }: { text: string; className?: string }) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduce) return <span className={className}>{text}</span>
  return (
    <span className={className}>
      {[...text].map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block"
          initial={{ opacity: 0, y: 12, filter: "blur(14px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: 0.07 * index, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {char === " " ? "\u00a0" : char}
        </motion.span>
      ))}
    </span>
  )
}
