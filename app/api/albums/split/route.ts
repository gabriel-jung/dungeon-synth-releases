import { type NextRequest } from "next/server"
import { supabase } from "@/lib/supabase"
import { AlbumListItem } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400"

// Nested select — one round-trip for albums + their full tag list.
const SPLIT_SELECT = "id, artist, title, url, art_id, date, hosts!inner(id, name, image_id, url), album_tags(tags!inner(name))"

type HostJoin = { id: string; name: string; image_id: string | null; url: string | null }
type TagJoin = { tags: { name: string } | { name: string }[] | null }
type AlbumWithTags = {
  id: string | number
  artist: string
  title: string
  url: string
  art_id: string | number | null
  date: string | null
  hosts: HostJoin | HostJoin[] | null
  album_tags: TagJoin[] | null
}

function toAlbumListItem(r: AlbumWithTags): AlbumListItem {
  const host = Array.isArray(r.hosts) ? r.hosts[0] : r.hosts
  return {
    id: String(r.id),
    artist: r.artist,
    title: r.title,
    url: r.url,
    date: r.date,
    art_id: r.art_id == null ? null : String(r.art_id),
    host_id: host?.id ? String(host.id) : null,
    host_name: host?.name ?? null,
    host_image_id: host?.image_id ?? null,
    host_url: host?.url ?? null,
  }
}

function extractTagNames(row: AlbumWithTags): Set<string> {
  const names = new Set<string>()
  for (const at of row.album_tags ?? []) {
    const t = Array.isArray(at.tags) ? at.tags[0] : at.tags
    if (t?.name) names.add(t.name)
  }
  return names
}

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`split:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const params = request.nextUrl.searchParams
  const artist = params.get("artist")
  const hostId = params.get("host_id")
  const year = params.get("year")
  const tags = params.getAll("tag")
  const xtags = params.getAll("xtag")

  if (!artist && !hostId) {
    return Response.json({ error: "Missing 'artist' or 'host_id' param" }, { status: 400 })
  }

  let query = supabase
    .from("albums")
    .select(SPLIT_SELECT)
    .order("date", { ascending: false })
    .limit(1000)

  if (artist) {
    query = query.eq("artist", artist)
  } else if (hostId) {
    query = query.eq("host_id", hostId)
    if (year) {
      query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
    }
  }

  const { data, error } = await query
  if (error) {
    logger.error({ route: "api/albums/split", err: error.message }, "query failed")
    return Response.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as AlbumWithTags[]

  // No filter → everything goes into "other".
  if (tags.length === 0 && xtags.length === 0) {
    return Response.json(
      { matching: [], other: rows.map(toAlbumListItem) },
      { headers: { "Cache-Control": CACHE } },
    )
  }

  const matching: AlbumListItem[] = []
  const other: AlbumListItem[] = []
  for (const r of rows) {
    const rowTags = extractTagNames(r)
    const isMatch =
      tags.every((t) => rowTags.has(t)) && xtags.every((t) => !rowTags.has(t))
    ;(isMatch ? matching : other).push(toAlbumListItem(r))
  }

  return Response.json(
    { matching, other },
    { headers: { "Cache-Control": CACHE } },
  )
}
