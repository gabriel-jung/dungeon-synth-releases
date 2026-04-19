"use client"

import { useEffect, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { releaseCount } from "@/lib/types"

export default function YearReleaseCount({
  initialCount,
  year,
}: {
  initialCount: number
  year: number
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const pastMatch = pathname?.match(/^\/past\/(\d{4})$/)
  const pastYear = pastMatch ? Number(pastMatch[1]) : null
  const displayYear = pastYear ?? year

  const filtered = searchParams.has("tag") || searchParams.has("xtag")
  const hidden = pathname === "/genres" || pathname === "/past"
  const spKey = searchParams.toString()

  const [count, setCount] = useState<number | null>(pastYear ? null : initialCount)

  useEffect(() => {
    if (hidden) return
    if (!pastYear && !filtered) {
      setCount(initialCount)
      return
    }
    const params = new URLSearchParams()
    params.set("year", String(displayYear))
    for (const t of searchParams.getAll("tag")) params.append("tag", t)
    for (const t of searchParams.getAll("xtag")) params.append("xtag", t)
    const ctrl = new AbortController()
    fetch(`/api/year-count?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.count === "number") setCount(d.count)
      })
      .catch(() => {})
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spKey, displayYear, initialCount, filtered, pastYear, hidden])

  if (hidden) return null

  return (
    <span className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-text-dim pb-1">
      {count === null ? "…" : releaseCount(count)} in {displayYear}
      {filtered && <span className="text-accent"> · filtered</span>}
    </span>
  )
}
