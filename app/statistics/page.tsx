import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { supabase } from "@/lib/supabase"
import { parseTagParams, type TagCount } from "@/lib/types"
import {
  YEAR_LOWER_BOUND,
  toBins,
  toHostCounts,
  toTagCounts,
  unwrap,
  type HostCount,
  type YearRow,
} from "@/lib/stats"
import Histogram, { HistBin } from "@/components/Histogram"
import StatsPageContent from "@/components/StatsPageContent"

export const metadata = {
  title: "Statistics",
  description: "Release activity across years, top labels, and distributions for dungeon synth on Bandcamp.",
  alternates: { canonical: "/statistics" },
}

async function fetchStatsData(
  includeTags: string[],
  excludeTags: string[],
): Promise<{
  rows: HostCount[]
  genres: TagCount[]
  themes: TagCount[]
  yearCounts: Map<number, number>
  trackBins: HistBin[]
  durationBins: HistBin[]
  dowBins: HistBin[]
  monthBins: HistBin[]
}> {
  "use cache"
  cacheLife("days")
  cacheTag("stats")

  const filterArgs = { p_include_tags: includeTags, p_exclude_tags: excludeTags }
  const allTimeArgs = { p_year: null, ...filterArgs }

  const [hostRes, yearRes, tracksHistRes, durationHistRes, genreRes, themeRes, dowRes, monthRes] = await Promise.all([
    supabase.rpc("host_counts", allTimeArgs),
    supabase.rpc("year_counts", filterArgs),
    supabase.rpc("tracks_per_album_hist", allTimeArgs),
    supabase.rpc("album_duration_hist", allTimeArgs),
    supabase.rpc("tag_counts_by_category", { p_category: "genre", p_year: null, ...filterArgs }),
    supabase.rpc("tag_counts_by_category", { p_category: "theme", p_year: null, ...filterArgs }),
    supabase.rpc("dow_counts", allTimeArgs),
    supabase.rpc("month_counts", allTimeArgs),
  ])

  const yearCounts = new Map<number, number>(
    unwrap<YearRow[]>("year_counts", yearRes).map((r) => [Number(r.year), Number(r.n)]),
  )

  return {
    rows: toHostCounts(unwrap("host_counts", hostRes)),
    genres: toTagCounts(unwrap("tag_counts_by_category(genre)", genreRes)),
    themes: toTagCounts(unwrap("tag_counts_by_category(theme)", themeRes)),
    yearCounts,
    trackBins: toBins(unwrap("tracks_per_album_hist", tracksHistRes)),
    durationBins: toBins(unwrap("album_duration_hist", durationHistRes)),
    dowBins: toBins(unwrap("dow_counts", dowRes)),
    monthBins: toBins(unwrap("month_counts", monthRes)),
  }
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)
  const currentYear = new Date().getUTCFullYear()
  const { rows, genres, themes, yearCounts, trackBins, durationBins, dowBins, monthBins } = await fetchStatsData(
    includeTags,
    excludeTags,
  )
  const yearBins: HistBin[] = []
  for (let y = YEAR_LOWER_BOUND; y <= currentYear; y++) {
    yearBins.push({ label: String(y), count: yearCounts.get(y) ?? 0, width: 1 })
  }

  return (
    <StatsPageContent
      head={<Histogram title="Releases per Year" bins={yearBins} />}
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
