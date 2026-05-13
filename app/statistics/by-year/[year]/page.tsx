import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { parseTagParams } from "@/lib/types"
import {
  YEAR_LOWER_BOUND,
  toBins,
  toHostCounts,
  toTagCounts,
  unwrap,
  type DayRow,
} from "@/lib/stats"
import CalendarHeatmap from "@/components/CalendarHeatmap"
import StatsPageContent from "@/components/StatsPageContent"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year } = await params
  return {
    title: `Statistics, ${year}`,
    description: `Dungeon synth release activity in ${year}.`,
    alternates: { canonical: `/statistics/by-year/${year}` },
  }
}

async function fetchYearStats(year: number, includeTags: string[], excludeTags: string[]) {
  "use cache"
  cacheLife("days")
  cacheTag("stats")

  const yearArgs = { p_year: year, p_include_tags: includeTags, p_exclude_tags: excludeTags }

  const [hostRes, tracksHistRes, durationHistRes, genreRes, themeRes, dailyRes, dowRes, monthRes] = await Promise.all([
    supabase.rpc("host_counts", yearArgs),
    supabase.rpc("tracks_per_album_hist", yearArgs),
    supabase.rpc("album_duration_hist", yearArgs),
    supabase.rpc("tag_counts_by_category", { p_category: "genre", ...yearArgs }),
    supabase.rpc("tag_counts_by_category", { p_category: "theme", ...yearArgs }),
    supabase.rpc("daily_counts", yearArgs),
    supabase.rpc("dow_counts", yearArgs),
    supabase.rpc("month_counts", yearArgs),
  ])

  const days: { date: string; n: number }[] = unwrap<DayRow[]>("daily_counts", dailyRes).map((r) => ({
    date: r.date,
    n: Number(r.n),
  }))

  return {
    rows: toHostCounts(unwrap("host_counts", hostRes)),
    genres: toTagCounts(unwrap("tag_counts_by_category(genre)", genreRes)),
    themes: toTagCounts(unwrap("tag_counts_by_category(theme)", themeRes)),
    trackBins: toBins(unwrap("tracks_per_album_hist", tracksHistRes)),
    durationBins: toBins(unwrap("album_duration_hist", durationHistRes)),
    dowBins: toBins(unwrap("dow_counts", dowRes)),
    monthBins: toBins(unwrap("month_counts", monthRes)),
    days,
  }
}

export default async function StatsByYearPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const { year: yearParam } = await params
  const year = Number(yearParam)
  const currentYear = new Date().getUTCFullYear()
  if (!Number.isInteger(year) || year < YEAR_LOWER_BOUND || year > currentYear) notFound()

  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)
  const { rows, genres, themes, trackBins, durationBins, dowBins, monthBins, days } = await fetchYearStats(
    year,
    includeTags,
    excludeTags,
  )

  const today = new Date().toISOString().slice(0, 10)

  return (
    <StatsPageContent
      head={
        <>
          <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright mb-4">
            Daily Release Activity
          </h2>
          <CalendarHeatmap days={days} year={year} today={today} />
        </>
      }
      rows={rows}
      genres={genres}
      themes={themes}
      trackBins={trackBins}
      durationBins={durationBins}
      dowBins={dowBins}
      monthBins={monthBins}
    />
  )
}
