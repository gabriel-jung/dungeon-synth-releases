import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, HTTP_CACHE_1H, toAlbumListItem, rpcRowToAlbumListItem } from "@/lib/supabase"
import { parseWeekKey } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

// Two access modes:
//   - `?week=YYYY-Www` — bounded ISO week bucket. Cache-friendly. Powers the
//     infinite-scroll release list and slider-jump loading. Optional
//     `clamp_start`/`clamp_end` restrict the window for year-view pages.
//   - `?date=YYYY-MM-DD` — single-day list for the calendar heatmap modal.
// Both accept `tag=`/`xtag=` page-level filters which route through the
// `list_filtered_albums` RPC.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`albums:${ipFromRequest(request)}`, 120, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const params = request.nextUrl.searchParams
  const week = params.get("week")
  const date = params.get("date")
  const tags = params.getAll("tag")
  const xtags = params.getAll("xtag")
  const clampStart = params.get("clamp_start")
  const clampEnd = params.get("clamp_end")
  const limit = Math.min(Number(params.get("limit") ?? 500), 1000)

  if (week) {
    const range = parseWeekKey(week)
    if (!range) return Response.json({ error: "Invalid week key" }, { status: 400 })
    const start = clampStart && clampStart > range.start ? clampStart : range.start
    const end = clampEnd && clampEnd < range.end ? clampEnd : range.end
    if (tags.length > 0 || xtags.length > 0) {
      const { data, error } = await supabase.rpc("list_filtered_albums", {
        p_include_tags: tags,
        p_exclude_tags: xtags,
        // RPC takes exclusive `before` + inclusive `after`. Emulate [start..end].
        p_before: addOneDay(end),
        p_after: addOneDay(start, -1),
        p_limit: limit,
      })
      if (error) {
        logger.error({ route: "api/albums", rpc: "list_filtered_albums", week, err: error.message }, "RPC failed")
        return Response.json({ error: error.message }, { status: 500 })
      }
      return Response.json(
        { albums: (data ?? []).map(rpcRowToAlbumListItem) },
        { headers: { "Cache-Control": HTTP_CACHE_1H } },
      )
    }
    const { data, error } = await supabase
      .from("albums")
      .select(ALBUM_LIST_SELECT)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false })
      .limit(limit)
    if (error) {
      logger.error({ route: "api/albums", week, err: error.message }, "week query failed")
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json(
      { albums: (data ?? []).map(toAlbumListItem) },
      { headers: { "Cache-Control": HTTP_CACHE_1H } },
    )
  }

  if (date) {
    const { data, error } = await supabase
      .from("albums")
      .select(ALBUM_LIST_SELECT)
      .eq("date", date)
      .order("artist", { ascending: true })
      .limit(limit)
    if (error) {
      logger.error({ route: "api/albums", date, err: error.message }, "date query failed")
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json(
      { albums: (data ?? []).map(toAlbumListItem) },
      { headers: { "Cache-Control": HTTP_CACHE_1H } },
    )
  }

  return Response.json({ error: "Missing 'week' or 'date' param" }, { status: 400 })
}

function addOneDay(dateStr: string, sign = 1): string {
  const d = new Date(dateStr + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + sign)
  return d.toISOString().slice(0, 10)
}
