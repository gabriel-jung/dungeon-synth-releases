import { createClient } from "@supabase/supabase-js"
import { AlbumListItem } from "./types"

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SECRET_KEY!

export const supabase = createClient(url, key)

export const ALBUM_LIST_SELECT = "id, date, artist, title, url, art_id, hosts!inner(name)"

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
