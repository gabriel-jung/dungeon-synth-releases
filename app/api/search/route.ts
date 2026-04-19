import { type NextRequest } from "next/server"
import { supabase } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { rpcRowToAlbumListItem, type AlbumListItem, type FilteredAlbumRow } from "@/lib/types"

export type SearchResponse = { albums: AlbumListItem[] }

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`search:${ipFromRequest(request)}`, 30, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) return Response.json({ albums: [] } satisfies SearchResponse)

  const { data, error } = await supabase.rpc("search_all", { p_q: q, p_limit: 50 })
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as FilteredAlbumRow[]
  return Response.json(
    { albums: rows.map(rpcRowToAlbumListItem) } satisfies SearchResponse,
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  )
}
