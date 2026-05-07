"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { ALL_MODAL_KINDS } from "@/lib/modalUrl"

// 2px accent bar that flashes on every soft navigation. Watches pathname +
// non-modal search params and shows a fade-out animation for ~500ms after
// the route resolves, so slow tag-filter pushes / RSC refetches give the
// user something to look at instead of feeling frozen.
const MODAL_PARAMS = new Set<string>(ALL_MODAL_KINDS)

function nonModalSearchKey(sp: URLSearchParams): string {
  const parts: string[] = []
  for (const [k, v] of sp.entries()) {
    if (MODAL_PARAMS.has(k)) continue
    parts.push(`${k}=${v}`)
  }
  parts.sort()
  return parts.join("&")
}

export default function NavigationProgress() {
  const pathname = usePathname()
  const sp = useSearchParams()
  const [active, setActive] = useState(false)
  const firstRenderRef = useRef(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const key = useMemo(() => `${pathname}?${nonModalSearchKey(sp)}`, [pathname, sp])

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    // Triggering a transient flash on route change is the only thing we can
    // do here — there's no external store to subscribe to. setState-in-effect
    // is intentional: cascade is bounded by the timeout below.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setActive(false), 500)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [key])

  if (!active) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[10100] h-[2px] bg-accent opacity-90 animate-fade-slide-in"
    />
  )
}
