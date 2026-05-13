import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { parseTagParams, type TagCount } from "@/lib/types"
import {
  YEAR_LOWER_BOUND,
  emptyMsg,
  toBins,
  toHostCounts,
  toTagCounts,
  unwrap,
  type DayRow,
  type HostCount,
} from "@/lib/stats"
import type { HistBin } from "@/components/Histogram"
import CalendarHeatmap from "@/components/CalendarHeatmap"
import SectionHeader from "@/components/SectionHeader"
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

type YearStatsData = {
  rows: HostCount[]
  genres: TagCount[]
  themes: TagCount[]
  trackBins: HistBin[]
  durationBins: HistBin[]
  dowBins: HistBin[]
  monthBins: HistBin[]
  days: { date: string; n: number }[]
}

const EMPTY: YearStatsData = {
  rows: [],
  genres: [],
  themes: [],
  trackBins: [],
  durationBins: [],
  dowBins: [],
  monthBins: [],
  days: [],
}

// Strict: throws on any RPC error so the failure isn't cached. Page-level
// try/catch falls back to EMPTY for that request; next request retries clean.
async function fetchYearStats(
  year: number,
  includeTags: string[],
  excludeTags: string[],
): Promise<YearStatsData> {
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

  const days = unwrap<DayRow[]>("daily_counts", dailyRes).map((r) => ({
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

  let stats: YearStatsData = EMPTY
  let degraded = false
  try {
    stats = await fetchYearStats(year, includeTags, excludeTags)
  } catch (e) {
    console.error(`/statistics/by-year/${year}: fetchYearStats failed, rendering empty:`, e)
    degraded = true
  }
  const { rows, genres, themes, trackBins, durationBins, dowBins, monthBins, days } = stats

  const today = new Date().toISOString().slice(0, 10)
  const empty = emptyMsg(degraded)

  return (
    <StatsPageContent
      head={
        <>
          <SectionHeader chapter="I" title="Daily Release Activity" />
          <CalendarHeatmap days={days} year={year} today={today} emptyLabel={empty} />
        </>
      }
      rows={rows}
      genres={genres}
      themes={themes}
      trackBins={trackBins}
      durationBins={durationBins}
      dowBins={dowBins}
      monthBins={monthBins}
      emptyLabel={empty}
    />
  )
}
