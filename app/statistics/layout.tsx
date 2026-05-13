import { connection } from "next/server"
import StatsScopeNav from "@/components/StatsScopeNav"
import FilterChipsSlot from "@/components/FilterChipsSlot"
import YearReleaseCount from "@/components/YearReleaseCount"
import { fetchPastYears, fetchTotalCount } from "@/lib/supabase"
import { Suspense } from "react"

export default async function StatsLayout({ children }: { children: React.ReactNode }) {
  await connection()
  const currentYear = new Date().getUTCFullYear()
  const [pastYears, totalCount] = await Promise.all([fetchPastYears(), fetchTotalCount()])
  const years = [currentYear, ...pastYears]

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 relative px-4 sm:px-6 flex items-start justify-between gap-4 pt-1 pb-2">
        <div className="flex flex-col items-start min-w-0">
          <Suspense>
            <StatsScopeNav years={years} />
          </Suspense>
          <Suspense>
            <div className="mt-1">
              <YearReleaseCount initialCount={totalCount} year={currentYear} mode="stats" />
            </div>
          </Suspense>
        </div>
        <FilterChipsSlot />
      </div>
      <div aria-hidden className="shrink-0 h-px mx-4 sm:mx-6 bg-gradient-to-r from-transparent via-border/60 to-transparent" />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
