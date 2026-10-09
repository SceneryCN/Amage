import { useEffect } from "react"
import { ToastViewport } from "@/components/ui/ToastViewport"
import { MainShell } from "@/features/shell/MainShell"

export function App() {
  useEffect(() => {
    // 没拦住的文件拖放会让 WebView 直接打开那张图，页面就回不来了。
    function allowDrop(event: DragEvent) {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = "none"
    }
    function ignoreDrop(event: DragEvent) {
      event.preventDefault()
    }
    window.addEventListener("dragover", allowDrop, true)
    window.addEventListener("drop", ignoreDrop, true)
    return () => {
      window.removeEventListener("dragover", allowDrop, true)
      window.removeEventListener("drop", ignoreDrop, true)
    }
  }, [])

  useEffect(() => {
    let timer = 0
    function onResize() {
      document.documentElement.dataset.resizing = ""
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        delete document.documentElement.dataset.resizing
      }, 180)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      window.clearTimeout(timer)
      delete document.documentElement.dataset.resizing
    }
  }, [])

  return (
    <>
      <MainShell />
      <ToastViewport />
    </>
  )
}
