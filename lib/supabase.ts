import { createClient } from "@supabase/supabase-js"
import { cacheLife, cacheTag } from "next/cache"

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
  const { data } = await supabase
    .rpc("tag_counts")
    .order("n", { ascending: false })
  return (data ?? []).map((r: { name: string }) => r.name)
}

export async function fetchPastYears(): Promise<number[]> {
  "use cache"
  cacheLife("days")
  cacheTag("past-years")
  const { data } = await supabase.rpc("distinct_years")
  const currentYear = new Date().getUTCFullYear()
  return ((data ?? []) as { year: number | string }[])
    .map((r) => Number(r.year))
    .filter((y) => y < currentYear)
    .sort((a, b) => b - a)
}

export { toAlbumListItem, rpcRowToAlbumListItem } from "./types"
