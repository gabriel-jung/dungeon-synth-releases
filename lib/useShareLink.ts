"use client"

import { useEffect, useRef, useState } from "react"

// Share a URL via the native share sheet where it exists, clipboard otherwise.
// `copied` flips on for `resetMs` after a clipboard copy so the caller can
// show "Link copied" feedback; the native sheet needs none.
export function useShareLink(resetMs = 1800): {
  copied: boolean
  share: (url: string, title: string) => Promise<void>
} {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const share = async (url: string, title: string) => {
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }) } catch {}
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), resetMs)
    } catch {}
  }

  return { copied, share }
}
