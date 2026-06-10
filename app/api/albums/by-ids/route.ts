import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, HTTP_CACHE_1H } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"
import { toAlbumListItem, type AlbumListItem } from "@/lib/types"
import { MAX_ITEMS } from "@/lib/listCodec"

export type ByIdsResponse = { albums: AlbumListItem[] }

// Batch album fetch for the /list builder. Input is a CSV of decimal ids
// (`?ids=12,34,...`), capped at MAX_ITEMS. PostgREST does not preserve the
// order of an `in()` filter, so the client re-sorts to the requested order.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`by-ids:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const raw = request.nextUrl.searchParams.get("ids")
  if (!raw) return Response.json({ albums: [] } satisfies ByIdsResponse)

  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, MAX_ITEMS)

  if (ids.length === 0) return Response.json({ albums: [] } satisfies ByIdsResponse)

  const { data, error } = await supabase.from("albums").select(ALBUM_LIST_SELECT).in("id", ids)
  if (error) {
    logger.error({ route: "api/albums/by-ids", err: error.message }, "by-ids fetch failed")
    return Response.json({ error: "fetch failed" }, { status: 500 })
  }

  const rows = (data ?? []) as unknown[]
  const byId = new Map(rows.map((r) => { const a = toAlbumListItem(r); return [a.id, a] as const }))
  const albums = ids.map((id) => byId.get(id)).filter((a): a is AlbumListItem => a != null)

  return Response.json({ albums } satisfies ByIdsResponse, { headers: { "Cache-Control": HTTP_CACHE_1H } })
}
