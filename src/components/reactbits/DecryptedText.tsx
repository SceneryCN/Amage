/**
 * 解码文字（改编自 React Bits「DecryptedText」，MIT）。
 *
 * 工作方式：每个字符先显示随机乱码，按 speed 的节奏从左到右逐个“锁定”成真实字符。
 * 为了不让乱码字形宽度不同导致整行抖动，每个字符位都先放一个隐形的真实字符撑开宽度，
 * 乱码叠在它上面居中显示。
 *
 * 读屏器只读到一份完整文字（sr-only），视觉层整体 aria-hidden。
 */
import { useEffect, useState } from "react"
import type { DecryptedTextProps } from "@/components/reactbits/types"

const DEFAULT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+<>/\\"
/** 每锁定一个字符前，乱码先刷新几次，让解码过程看得见。 */
const SCRAMBLES_PER_CHAR = 2

export function DecryptedText({
  text,
  speed = 60,
  delay = 0,
  characters = DEFAULT_CHARACTERS,
  className = "",
  encryptedClassName = "",
}: DecryptedTextProps) {
  const letters = [...text]
  const [revealed, setRevealed] = useState(0)
  const [noise, setNoise] = useState(() => scramble(letters, characters))

  useEffect(() => {
    const chars = [...text]
    let tick = 0
    let interval = 0
    setRevealed(0)
    const timer = window.setTimeout(() => {
      interval = window.setInterval(() => {
        tick += 1
        const next = Math.floor(tick / SCRAMBLES_PER_CHAR)
        setNoise(scramble(chars, characters))
        setRevealed(next)
        if (next >= chars.length) window.clearInterval(interval)
      }, speed / SCRAMBLES_PER_CHAR)
    }, delay)
    return () => {
      window.clearTimeout(timer)
      window.clearInterval(interval)
    }
  }, [text, speed, delay, characters])

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {letters.map((char, index) => {
          if (char === " ") return <span key={index}>{"\u00a0"}</span>
          const done = index < revealed
          return (
            <span key={index} className="relative inline-block">
              <span className={done ? "" : "invisible"}>{char}</span>
              {done ? null : <span className={`absolute inset-0 text-center ${encryptedClassName}`}>{noise[index]}</span>}
            </span>
          )
        })}
      </span>
    </span>
  )
}

function scramble(letters: string[], characters: string): string[] {
  return letters.map((char) => (char === " " ? char : characters[Math.floor(Math.random() * characters.length)] ?? char))
}
