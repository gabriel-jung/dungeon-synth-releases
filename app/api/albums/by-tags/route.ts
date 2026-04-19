import { type NextRequest } from "next/server"
import { supabase, HTTP_CACHE_1H, rpcRowToAlbumListItem } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`by-tags:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const tags = sp.getAll("tag")
  const limit = Math.min(Number(sp.get("limit") ?? 500), 1000)

  if (tags.length === 0) {
    return Response.json({ error: "Missing 'tag' param" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("list_filtered_albums", {
    p_include_tags: tags,
    p_exclude_tags: [],
    p_before: null,
    p_after: null,
    p_limit: limit,
  })

  if (error) {
    logger.error({ route: "api/albums/by-tags", err: error.message }, "RPC failed")
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(rpcRowToAlbumListItem) },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
