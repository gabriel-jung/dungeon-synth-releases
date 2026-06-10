import { type NextRequest } from "next/server"
import { supabase, HTTP_CACHE_1H } from "@/lib/supabase"
import { localDateStr } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`year-count:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const year = Number(sp.get("year")) || new Date().getUTCFullYear()
  const dedupeSort = (vs: string[]) => Array.from(new Set(vs)).sort()
  const includeTags = dedupeSort(sp.getAll("tag"))
  const excludeTags = dedupeSort(sp.getAll("xtag"))
  const today = localDateStr(new Date())

  // Single scalar from year_count RPC. Avoids shipping ~365 daily rows
  // just to sum them in JS.
  const { data, error } = await supabase.rpc("year_count", {
    p_year: year,
    p_up_to: today,
    p_include_tags: includeTags,
    p_exclude_tags: excludeTags,
  })

  // Don't cache a wrong zero: on RPC failure return an uncached 500 instead
  // of letting `Number(undefined ?? 0)` poison the CDN with count: 0 for 1h.
  if (error) {
    logger.error({ route: "api/year-count", year, err: error.message }, "year_count RPC failed")
    return Response.json({ error: "query failed" }, { status: 500 })
  }

  return Response.json(
    { count: Number(data ?? 0) },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
