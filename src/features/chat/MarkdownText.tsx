import type { ComponentProps } from "react"
import ReactMarkdown from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"

export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="markdown leading-7">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ a: MarkdownLink }}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

function MarkdownLink({ href, children }: ComponentProps<"a">) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(event) => {
        event.preventDefault()
        if (!href) return
        window.open(href, "_blank", "noopener,noreferrer")
      }}
    >
      {children}
    </a>
  )
}
