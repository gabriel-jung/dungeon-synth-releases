import { type NextRequest } from "next/server"
import { HTTP_CACHE_1H, sumYearCounts } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

// All-time release count with optional ?tag / ?xtag filters. Sums year_counts
// server-side; row count is tiny (~30 years).
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`total-count:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const dedupeSort = (vs: string[]) => Array.from(new Set(vs)).sort()
  const includeTags = dedupeSort(sp.getAll("tag"))
  const excludeTags = dedupeSort(sp.getAll("xtag"))

  try {
    const count = await sumYearCounts(includeTags, excludeTags)
    return Response.json({ count }, { headers: { "Cache-Control": HTTP_CACHE_1H } })
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
