import { cacheLife, cacheTag } from "next/cache"
import { connection } from "next/server"
import { supabase } from "@/lib/supabase"
import { parseTagParams, type TagCount } from "@/lib/types"
import HostRow from "@/components/HostRow"
import TagBarScroll from "@/components/TagBarScroll"
import Histogram, { HistBin } from "@/components/Histogram"

export const metadata = {
  title: "Statistics",
  description: "Release activity across years, top labels, and distributions for dungeon synth on Bandcamp.",
  alternates: { canonical: "/statistics" },
}

const YEAR_BAR_START = 1990

type HostCount = { host_id: string; name: string; image_id: string | null; url: string | null; n: number }
type YearRow = { year: number | string; n: number | string }
type HistRow = { bucket: string; bucket_order: number; bucket_width: number; n: number | string }

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
}> {
  "use cache"
  cacheLife("days")
  cacheTag("stats")

  const filterArgs = { p_include_tags: includeTags, p_exclude_tags: excludeTags }
  // All-time. `p_year: null` tells the RPCs to skip the year filter. If/when
  // a UI year picker is added, swap to `p_year: selectedYear`.
  const allTimeArgs = { p_year: null, ...filterArgs }

  const [hostRes, yearRes, tracksHistRes, durationHistRes, genreRes, themeRes] = await Promise.all([
    supabase.rpc("host_counts", allTimeArgs),
    supabase.rpc("year_counts", filterArgs),
    supabase.rpc("tracks_per_album_hist", allTimeArgs),
    supabase.rpc("album_duration_hist", allTimeArgs),
    supabase.rpc("tag_counts_by_category", { p_category: "genre", p_year: null, ...filterArgs }),
    supabase.rpc("tag_counts_by_category", { p_category: "theme", p_year: null, ...filterArgs }),
  ])
  if (hostRes.error) throw new Error(`host_counts RPC failed: ${hostRes.error.message}`)
  if (yearRes.error) throw new Error(`year_counts RPC failed: ${yearRes.error.message}`)
  if (tracksHistRes.error) throw new Error(`tracks_per_album_hist RPC failed: ${tracksHistRes.error.message}`)
  if (durationHistRes.error) throw new Error(`album_duration_hist RPC failed: ${durationHistRes.error.message}`)
  if (genreRes.error) throw new Error(`tag_counts_by_category(genre) RPC failed: ${genreRes.error.message}`)
  if (themeRes.error) throw new Error(`tag_counts_by_category(theme) RPC failed: ${themeRes.error.message}`)

  const rows: HostCount[] = (hostRes.data ?? []).slice(0, 50).map(
    (r: { host_id: string; name: string; image_id: string | null; url: string | null; n: number | string }) => ({
      host_id: r.host_id,
      name: r.name,
      image_id: r.image_id,
      url: r.url,
      n: Number(r.n),
    }),
  )

  const toTagCounts = (data: { name: string; n: number | string }[] | null): TagCount[] =>
    (data ?? []).map((r) => ({ name: r.name, n: Number(r.n) }))
  const genres = toTagCounts(genreRes.data)
  const themes = toTagCounts(themeRes.data)

  const yearCounts = new Map<number, number>(
    (yearRes.data ?? []).map((r: YearRow) => [Number(r.year), Number(r.n)]),
  )

  const toBins = (data: HistRow[] | null): HistBin[] =>
    (data ?? [])
      .sort((a, b) => a.bucket_order - b.bucket_order)
      .map((r) => ({ label: r.bucket, count: Number(r.n), width: Number(r.bucket_width) }))

  return {
    rows,
    genres,
    themes,
    yearCounts,
    trackBins: toBins(tracksHistRes.data),
    durationBins: toBins(durationHistRes.data),
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
  const { rows, genres, themes, yearCounts, trackBins, durationBins } = await fetchStatsData(includeTags, excludeTags)
  const yearBins: HistBin[] = []
  for (let y = YEAR_BAR_START; y <= currentYear; y++) {
    yearBins.push({ label: String(y), count: yearCounts.get(y) ?? 0, width: 1 })
  }
  const hostMax = rows[0]?.n ?? 1

  return (
    <div className="h-full pt-6 sm:pt-8">
      <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10">
          <section>
            <Histogram title="Releases per Year" bins={yearBins} />
          </section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <section>
              <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright mb-4">
                Most Active Pages
              </h2>
              <div
                className="relative"
                style={{
                  maskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
                }}
              >
                <ol
                  className="flex flex-col gap-0.5 overflow-y-auto pr-1"
                  style={{ maxHeight: "calc(12 * 1.75rem + 11 * 0.125rem + 1rem)", scrollbarWidth: "none"}}
                >
                  {rows.map((row) => (
                    <HostRow
                      key={row.host_id}
                      hostId={row.host_id}
                      name={row.name}
                      count={row.n}
                      widthPct={(row.n / hostMax) * 100}
                    />
                  ))}
                </ol>
              </div>
            </section>
            <div className="flex flex-col gap-8">
              <Histogram title="Tracks per Release" bins={trackBins} />
              <Histogram title="Release Duration" bins={durationBins} />
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
            <TagBarScroll title="Popular Genres" items={genres} rows={12} headingStyle="section" emptyLabel="No tags." />
            <TagBarScroll title="Popular Themes" items={themes} rows={12} headingStyle="section" emptyLabel="No tags." />
          </div>
        </div>
      </div>
    </div>
  )
}
