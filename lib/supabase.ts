import { createClient } from "@supabase/supabase-js"
import { AlbumListItem } from "./types"

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SECRET_KEY!

export const supabase = createClient(url, key)

export const ALBUM_LIST_SELECT = "id, date, artist, title, url, art_id, hosts!inner(name)"

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
  const { data } = await supabase
    .rpc("genre_counts")
    .order("n", { ascending: false })
  return (data ?? []).map((r: { name: string }) => r.name)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toAlbumListItem(r: any): AlbumListItem {
  return {
    id: r.id,
    artist: r.artist,
    title: r.title,
    url: r.url,
    date: r.date,
    art_id: r.art_id,
    host_name: (r.hosts as unknown as { name: string } | null)?.name ?? null,
  }
}
