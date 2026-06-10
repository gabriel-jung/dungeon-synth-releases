import { type NextRequest } from "next/server"
import { supabase, HTTP_CACHE_1H } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"
import { rpcRowToAlbumListItem, type AlbumListItem, type FilteredAlbumRow } from "@/lib/types"

export type SearchResponse = { albums: AlbumListItem[] }

// Escape LIKE/ILIKE metacharacters so user-supplied `%` / `_` are matched
// literally instead of acting as wildcards. Unescaped, a pattern like
// `%a%b%c%` defeats the trigram index and forces a sequential scan.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&")
}

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`search:${ipFromRequest(request)}`, 30, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  // Cap length before the trigram match: long crafted patterns are pure cost.
  const raw = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100)
  if (!raw || raw.length < 2) return Response.json({ albums: [] } satisfies SearchResponse)
  const q = escapeLike(raw)

  const { data, error } = await supabase.rpc("search_all", { p_q: q, p_limit: 50 })
  if (error) {
    logger.error({ route: "api/search", err: error.message }, "search_all RPC failed")
    return Response.json({ error: "search failed" }, { status: 500 })
  }

  const rows = (data ?? []) as FilteredAlbumRow[]
  return Response.json(
    { albums: rows.map(rpcRowToAlbumListItem) } satisfies SearchResponse,
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
