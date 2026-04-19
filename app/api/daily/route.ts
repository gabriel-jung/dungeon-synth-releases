import { type NextRequest } from "next/server"
import { supabase, HTTP_CACHE_1H } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

// Daily release counts for a given year. Backs the collapsible heatmap on
// release-list pages. Cheap RPC, long SWR cache so repeat opens are free.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`daily:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const year = Number(sp.get("year")) || new Date().getUTCFullYear()
  const includeTags = sp.getAll("tag")
  const excludeTags = sp.getAll("xtag")
  const { data, error } = await supabase.rpc("daily_counts", {
    p_year: year,
    p_include_tags: includeTags,
    p_exclude_tags: excludeTags,
  })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const days = (data ?? []).map(
    (r: { date: string; n: number | string }) => ({ date: r.date, n: Number(r.n) }),
  )
  return Response.json(
    { days },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
