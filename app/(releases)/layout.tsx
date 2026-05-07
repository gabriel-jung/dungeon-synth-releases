import { connection } from "next/server"
import YearReleaseCount from "@/components/YearReleaseCount"
import ReleasesScopeNav from "@/components/ReleasesScopeNav"
import HeatmapPopoverButton from "@/components/HeatmapPopoverButton"
import FilterChipsSlot from "@/components/FilterChipsSlot"
import { fetchPastYears, fetchYearCount } from "@/lib/supabase"
import { localDateStr } from "@/lib/types"
import { Suspense } from "react"

// Nested layout for browse-list pages (/ and /releases/[year]). Owns the
// scope nav + year count + filter chips. Tag filter button lives in the
// root header (shared with /statistics and /graphs).
export default async function ReleasesLayout({ children }: { children: React.ReactNode }) {
  // Opt into dynamic rendering: layout reads the current time to compute the
  // current year / today, which Cache Components disallows during static
  // prerender unless we first access a request-scoped source.
  await connection()
  const year = new Date().getUTCFullYear()
  const today = localDateStr(new Date())
  const [yearCount, pastYears] = await Promise.all([
    fetchYearCount(year, today),
    fetchPastYears(),
  ])

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 relative px-4 sm:px-6 flex items-start justify-between gap-4 pt-1 pb-2">
        <div className="flex flex-col items-start min-w-0">
          <Suspense>
            <ReleasesScopeNav pastYears={pastYears} />
          </Suspense>
          {yearCount !== null && (
            <div className="flex items-center gap-2 mt-1">
              <Suspense>
                <YearReleaseCount initialCount={yearCount} year={year} />
              </Suspense>
              <Suspense>
                <HeatmapPopoverButton today={today} defaultYear={year} />
              </Suspense>
            </div>
          )}
        </div>
        <FilterChipsSlot />
      </div>
      <div aria-hidden className="shrink-0 h-px mx-4 sm:mx-6 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="flex-1 min-h-0 pt-6 sm:pt-8">{children}</div>
    </div>
  )
}
