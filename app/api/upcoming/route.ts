import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, HTTP_CACHE_1H, toAlbumListItem } from "@/lib/supabase"
import { localDateStr } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

// Scheduled-for-the-future releases. Typical volume is under 20 rows/year,
// so one call returns the entire set — no pagination, long CDN cache.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`upcoming:${ipFromRequest(request)}`, 30, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const today = localDateStr(new Date())
  const { data, error } = await supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .gt("date", today)
    .order("date", { ascending: true })
    .limit(500)

  if (error) {
    logger.error({ route: "api/upcoming", err: error.message }, "query failed")
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(toAlbumListItem) },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
