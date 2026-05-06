import { createClient } from "@supabase/supabase-js"
import { cacheLife, cacheTag } from "next/cache"
import { type AlbumListItem, toAlbumListItem } from "./types"

const url = process.env.SUPABASE_URL!
// Publishable (anon) key is preferred so RLS gates every query; fallback for
// un-migrated environments. See docs/rls-migration.sql.
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_SECRET_KEY!

export const supabase = createClient(url, key)

export const ALBUM_LIST_SELECT = "id, date, artist, title, url, art_id, hosts!inner(id, name, image_id, url)"

// Shared Cache-Control header for JSON API routes. 1h CDN cache + 1d SWR.
export const HTTP_CACHE_1H = "public, s-maxage=3600, stale-while-revalidate=86400"

export function yearCountQuery(year: number, upTo: string) {
  return supabase
    .from("albums")
    .select("*", { count: "exact", head: true })
    .gte("date", `${year}-01-01`)
    .lte("date", upTo)
}

// Page through a Supabase select, 1000 rows at a time, until exhausted.
// `fetchPage` returns the rows for a given [from, to] window.
export async function paginateAll<T>(
  fetchPage: (from: number, to: number) => Promise<T[] | null>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  let from = 0
  while (true) {
    const data = await fetchPage(from, from + pageSize - 1)
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

export async function fetchGenreTags(): Promise<string[]> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  // Hard cap on the global tag-filter list. The TagFilter panel surfaces
  // these for autocomplete; long-tail tags below the top ~500 are vanishingly
  // useful and the egress cost grows linearly with the corpus.
  const { data } = await supabase
    .rpc("tag_counts", { p_top_k: 500 })
    .order("n", { ascending: false })
  return (data ?? []).map((r: { name: string }) => r.name)
}

export async function fetchPastYears(): Promise<number[]> {
  "use cache"
  cacheLife("days")
  // Co-tagged with `genres` so the daily cron (which only busts `genres`
  // and `stats`) also rolls this list whenever a new year ingests its
  // first release.
  cacheTag("genres")
  cacheTag("past-years")
  const { data } = await supabase.rpc("distinct_years")
  const currentYear = new Date().getUTCFullYear()
  return ((data ?? []) as { year: number | string }[])
    .map((r) => Number(r.year))
    .filter((y) => y < currentYear)
    .sort((a, b) => b - a)
}

// Cached count of releases <= today for a given year. Used by the layout
// header. Underlying data only changes when the daily cron busts `genres`,
// so a `days` lifetime is enough — no need to re-COUNT hourly.
export async function fetchYearCount(year: number, upTo: string): Promise<number | null> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  const { count } = await yearCountQuery(year, upTo)
  return count
}

// Recent unfiltered release list for the `/` server component. Cached so
// every visitor in the same day shares one Supabase fetch; the daily cron
// busts `genres` and rolls the window. `today` is the only request-time
// arg; the 7-day cutoff is derived inside so the cache key stays narrow.
export async function fetchRecentAlbums(today: string): Promise<AlbumListItem[]> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  const cutoff = new Date(today + "T00:00:00Z")
  cutoff.setUTCDate(cutoff.getUTCDate() - 6)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  // 7-day window — typical row count is well under the 1000-row PostgREST
  // ceiling, so a single range fetch covers the whole window without
  // pagination overhead.
  const { data, error } = await supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .lte("date", today)
    .gte("date", cutoffStr)
    .order("date", { ascending: false })
    .range(0, 999)
  if (error) throw new Error(`albums query failed: ${error.message}`)
  return (data ?? []).map(toAlbumListItem)
}

export { toAlbumListItem, rpcRowToAlbumListItem } from "./types"
