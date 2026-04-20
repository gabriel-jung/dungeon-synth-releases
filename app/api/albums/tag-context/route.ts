import { type NextRequest } from "next/server"
import { HTTP_CACHE_1H } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { fetchTagContext } from "@/lib/tagContext"
import { logger } from "@/lib/logger"

// Top co-occurring genres and themes for the given tag or pair of tags.
// Drives the twin bar plots at the top of the scope modal.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`tag-context:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const tags = sp.getAll("tag")
  const excludeTags = sp.getAll("xtag")
  if (tags.length === 0) return Response.json({ error: "Missing tag" }, { status: 400 })

  try {
    const ctx = await fetchTagContext(tags, excludeTags)
    return Response.json(ctx, { headers: { "Cache-Control": HTTP_CACHE_1H } })
  } catch (err) {
    logger.error({ route: "api/albums/tag-context", err: (err as Error).message }, "fetch failed")
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
