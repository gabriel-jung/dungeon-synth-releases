"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import ReleaseCountText from "./ReleaseCountText"
import { tagFilterQs, yearFromPath } from "@/lib/types"

// `initialCount` is the unfiltered count for the layout's home scope: current
// year on releases, all-time on statistics. The component refetches whenever
// the user navigates to a non-home scope or toggles a tag filter.
export default function YearReleaseCount({
  initialCount,
  year,
  mode = "releases",
}: {
  initialCount: number | null
  year: number
  mode?: "releases" | "stats"
}) {
  const searchParams = useSearchParams()
  const pathname = usePathname() ?? "/"

  const pathYear = yearFromPath(pathname)
  const onStatsOverall = mode === "stats" && pathname === "/statistics"
  const onStatsByYear = mode === "stats" && pathname.startsWith("/statistics/by-year")
  const allTime = onStatsOverall
  const scopeYear = allTime ? null : pathYear ?? year
  const isHomeScope = !onStatsByYear && (allTime || scopeYear === year)

  const tagQs = useMemo(() => tagFilterQs(searchParams), [searchParams])
  const filtered = tagQs.length > 0

  const useInitial = isHomeScope && !filtered
  const [fetched, setFetched] = useState<number | null>(null)

  useEffect(() => {
    if (useInitial) return
    const endpoint = allTime ? "/api/total-count" : "/api/year-count"
    const yearQs = !allTime && scopeYear != null ? `year=${scopeYear}` : ""
    const qs = [yearQs, tagQs].filter(Boolean).join("&")
    const ctrl = new AbortController()
    fetch(`${endpoint}?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.count === "number") setFetched(d.count)
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [tagQs, scopeYear, allTime, useInitial])

  const display = useInitial ? initialCount : fetched
  return <ReleaseCountText count={display} year={scopeYear} filtered={filtered} />
}
