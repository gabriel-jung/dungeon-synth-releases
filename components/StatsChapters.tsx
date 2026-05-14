import { cacheLife, cacheTag } from "next/cache"
import { supabase } from "@/lib/supabase"
import {
  YEAR_LOWER_BOUND,
  toBins,
  toHostCounts,
  toTagCounts,
  tryOrNull,
  unwrap,
  type DayRow,
  type HostCount,
  type YearRow,
} from "@/lib/stats"
import type { TagCount } from "@/lib/types"
import CalendarHeatmap from "./CalendarHeatmap"
import ChunkDegraded from "./ChunkDegraded"
import HostRow from "./HostRow"
import Histogram, { type HistBin } from "./Histogram"
import SectionHeader from "./SectionHeader"
import TagBarScroll from "./TagBarScroll"

export type StatsFilter = {
  include: string[]
  exclude: string[]
  year: number | null
}

const HOST_ROWS = 12
const HOST_LIST_MAX_HEIGHT = `calc(${HOST_ROWS} * 1.75rem + ${HOST_ROWS - 1} * 0.125rem + 1rem)`

const filterArgs = (f: StatsFilter) => ({
  p_year: f.year,
  p_include_tags: f.include,
  p_exclude_tags: f.exclude,
})


// Chapter I (all-time stats only): year bar.
async function fetchYearCounts(include: string[], exclude: string[]): Promise<YearRow[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:years")
  const res = await supabase.rpc("year_counts", {
    p_include_tags: include,
    p_exclude_tags: exclude,
  })
  return unwrap<YearRow[]>("year_counts", res)
}

export async function YearBarChapter({
  filter,
  currentYear,
}: {
  filter: StatsFilter
  currentYear: number
}) {
  const rows = await tryOrNull("YearBarChapter", () => fetchYearCounts(filter.include, filter.exclude))
  if (rows === null) {
    return <ChunkDegraded chapter="I" title="Releases per Year" tag="stats:years" height="h-40" />
  }
  const counts = new Map<number, number>(rows.map((r) => [Number(r.year), Number(r.n)]))
  const bins: HistBin[] = []
  for (let y = YEAR_LOWER_BOUND; y <= currentYear; y++) {
    bins.push({ label: String(y), count: counts.get(y) ?? 0, width: 1 })
  }
  return <Histogram chapter="I" title="Releases per Year" bins={bins} barHeight="h-40" framed minBarPx={36} />
}


// Chapter I (by-year stats only): daily heatmap.
async function fetchDailyCounts(
  year: number,
  include: string[],
  exclude: string[],
): Promise<{ date: string; n: number }[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:heatmap")
  const res = await supabase.rpc("daily_counts", {
    p_year: year,
    p_include_tags: include,
    p_exclude_tags: exclude,
  })
  const rows = unwrap<DayRow[]>("daily_counts", res)
  return rows.map((r) => ({ date: r.date, n: Number(r.n) }))
}

export async function HeatmapChapter({
  filter,
  today,
}: {
  filter: StatsFilter
  today: string
}) {
  if (filter.year === null) return null
  const days = await tryOrNull("HeatmapChapter", () =>
    fetchDailyCounts(filter.year as number, filter.include, filter.exclude),
  )
  if (days === null) {
    return <ChunkDegraded chapter="I" title="Daily Release Activity" tag="stats:heatmap" height="h-32" />
  }
  return (
    <>
      <SectionHeader chapter="I" title="Daily Release Activity" />
      <CalendarHeatmap days={days} year={filter.year} today={today} />
    </>
  )
}


// Chapter II: day of week.
async function fetchDow(filter: StatsFilter): Promise<HistBin[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:dow")
  const res = await supabase.rpc("dow_counts", filterArgs(filter))
  return toBins(unwrap("dow_counts", res))
}

export async function DowChapter({ filter }: { filter: StatsFilter }) {
  const bins = await tryOrNull("DowChapter", () => fetchDow(filter))
  if (bins === null) {
    return <ChunkDegraded chapter="II" title="Releases by Day of Week" tag="stats:dow" />
  }
  return <Histogram chapter="II" title="Releases by Day of Week" bins={bins} />
}


// Chapter III: month.
async function fetchMonth(filter: StatsFilter): Promise<HistBin[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:month")
  const res = await supabase.rpc("month_counts", filterArgs(filter))
  return toBins(unwrap("month_counts", res))
}

export async function MonthChapter({ filter }: { filter: StatsFilter }) {
  const bins = await tryOrNull("MonthChapter", () => fetchMonth(filter))
  if (bins === null) {
    return <ChunkDegraded chapter="III" title="Releases by Month" tag="stats:month" />
  }
  return <Histogram chapter="III" title="Releases by Month" bins={bins} />
}


// Chapter IV: most active hosts.
async function fetchHosts(filter: StatsFilter): Promise<HostCount[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:hosts")
  const res = await supabase.rpc("host_counts", filterArgs(filter))
  return toHostCounts(unwrap("host_counts", res))
}

export async function HostsChapter({ filter }: { filter: StatsFilter }) {
  const rows = await tryOrNull("HostsChapter", () => fetchHosts(filter))
  if (rows === null) {
    return <ChunkDegraded chapter="IV" title="Most Active Pages" tag="stats:hosts" height="h-[16rem]" />
  }
  if (rows.length === 0) {
    return (
      <section>
        <SectionHeader chapter="IV" title="Most Active Pages" />
        <div
          className="flex items-center justify-center font-display text-xs tracking-[0.2em] uppercase text-text-dim"
          style={{ height: HOST_LIST_MAX_HEIGHT }}
        >
          (no entries) ✧
        </div>
      </section>
    )
  }
  const hostMax = Math.max(1, ...rows.map((r) => r.n))
  return (
    <section>
      <SectionHeader chapter="IV" title="Most Active Pages" />
      <div
        className="relative"
        style={{
          maskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
        }}
      >
        <ol
          className="flex flex-col gap-0.5 overflow-y-auto pr-1"
          style={{ maxHeight: HOST_LIST_MAX_HEIGHT, scrollbarWidth: "none" }}
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
  )
}


// Chapter V: tracks per release.
async function fetchTracks(filter: StatsFilter): Promise<HistBin[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:tracks")
  const res = await supabase.rpc("tracks_per_album_hist", filterArgs(filter))
  return toBins(unwrap("tracks_per_album_hist", res))
}

export async function TracksChapter({ filter }: { filter: StatsFilter }) {
  const bins = await tryOrNull("TracksChapter", () => fetchTracks(filter))
  if (bins === null) {
    return <ChunkDegraded chapter="V" title="Tracks per Release" tag="stats:tracks" />
  }
  return <Histogram chapter="V" title="Tracks per Release" bins={bins} />
}


// Chapter VI: release duration.
async function fetchDuration(filter: StatsFilter): Promise<HistBin[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:duration")
  const res = await supabase.rpc("album_duration_hist", filterArgs(filter))
  return toBins(unwrap("album_duration_hist", res))
}

export async function DurationChapter({ filter }: { filter: StatsFilter }) {
  const bins = await tryOrNull("DurationChapter", () => fetchDuration(filter))
  if (bins === null) {
    return <ChunkDegraded chapter="VI" title="Release Duration" tag="stats:duration" />
  }
  return <Histogram chapter="VI" title="Release Duration" bins={bins} />
}


// Chapter VII: popular genres.
async function fetchGenres(filter: StatsFilter): Promise<TagCount[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:genres")
  const res = await supabase.rpc("tag_counts_by_category", {
    p_category: "genre",
    ...filterArgs(filter),
  })
  return toTagCounts(unwrap("tag_counts_by_category(genre)", res))
}

export async function GenresChapter({ filter }: { filter: StatsFilter }) {
  const items = await tryOrNull("GenresChapter", () => fetchGenres(filter))
  if (items === null) {
    return <ChunkDegraded chapter="VII" title="Popular Genres" tag="stats:genres" height="h-[16rem]" />
  }
  return (
    <TagBarScroll
      chapter="VII"
      title="Popular Genres"
      items={items}
      rows={HOST_ROWS}
      headingStyle="section"
      emptyLabel="(no entries) ✧"
    />
  )
}


// Chapter VIII: popular themes.
async function fetchThemes(filter: StatsFilter): Promise<TagCount[]> {
  "use cache"
  cacheLife("days")
  cacheTag("stats", "stats:themes")
  const res = await supabase.rpc("tag_counts_by_category", {
    p_category: "theme",
    ...filterArgs(filter),
  })
  return toTagCounts(unwrap("tag_counts_by_category(theme)", res))
}

export async function ThemesChapter({ filter }: { filter: StatsFilter }) {
  const items = await tryOrNull("ThemesChapter", () => fetchThemes(filter))
  if (items === null) {
    return <ChunkDegraded chapter="VIII" title="Popular Themes" tag="stats:themes" height="h-[16rem]" />
  }
  return (
    <TagBarScroll
      chapter="VIII"
      title="Popular Themes"
      items={items}
      rows={HOST_ROWS}
      headingStyle="section"
      emptyLabel="(no entries) ✧"
    />
  )
}
