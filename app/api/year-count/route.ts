import { type NextRequest } from "next/server"
import { supabase, HTTP_CACHE_1H } from "@/lib/supabase"
import { localDateStr } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`year-count:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const year = Number(sp.get("year")) || new Date().getUTCFullYear()
  const includeTags = sp.getAll("tag")
  const excludeTags = sp.getAll("xtag")
  const today = localDateStr(new Date())

  // Single scalar from year_count RPC. Avoids shipping ~365 daily rows
  // just to sum them in JS.
  const { data } = await supabase.rpc("year_count", {
    p_year: year,
    p_up_to: today,
    p_include_tags: includeTags,
    p_exclude_tags: excludeTags,
  })

  return Response.json(
    { count: Number(data ?? 0) },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
