// Server-only: importing this from a Client Component is a build-time error.
// SUPABASE_SECRET_KEY (the service-role fallback below) must never reach the
// browser bundle; this guard fails loudly instead of silently leaking it.
import "server-only"
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

function yearCountQuery(year: number, upTo: string) {
  return supabase
    .from("albums")
    .select("*", { count: "exact", head: true })
    .gte("date", `${year}-01-01`)
    .lte("date", upTo)
}

export async function fetchTagsByCategory(category: string): Promise<string[]> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  // Hard cap on the global tag-filter list. The TagFilter panel surfaces
  // these for autocomplete; long-tail tags below the top ~500 are vanishingly
  // useful and the egress cost grows linearly with the corpus.
  // Throw on RPC failure so the empty result is NOT cached. Callers catch +
  // degrade for this request only; the next request retries cleanly.
  const { data, error } = await supabase.rpc("tag_counts", { p_category: category, p_top_k: 500 })
  if (error) throw new Error(`tag_counts RPC failed: ${error.message}`)
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name)
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

// Derived by summing `year_counts` (one row per year, ~30) so no schema
// migration is needed. Shared between `fetchTotalCount` (server, cached) and
// `/api/total-count` (client refetch on filter change).
export async function sumYearCounts(includeTags: string[], excludeTags: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("year_counts", {
    p_include_tags: includeTags,
    p_exclude_tags: excludeTags,
  })
  if (error) throw new Error(`year_counts RPC failed: ${error.message}`)
  return ((data ?? []) as { n: number | string }[]).reduce((acc, r) => acc + Number(r.n), 0)
}

// Cached all-time unfiltered total. Backs the /statistics layout header.
// Throws on RPC failure so the failure isn't cached; callers catch + degrade.
export async function fetchTotalCount(): Promise<number> {
  "use cache"
  cacheLife("days")
  cacheTag("genres")
  cacheTag("stats")
  return sumYearCounts([], [])
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
