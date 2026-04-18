import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, toAlbumListItem, rpcRowToAlbumListItem } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

const CACHE = "public, s-maxage=3600, stale-while-revalidate=86400"

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`albums:${ipFromRequest(request)}`, 120, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const params = request.nextUrl.searchParams
  const before = params.get("before")
  const after = params.get("after")
  const hostId = params.get("host_id")
  const artist = params.get("artist")
  const year = params.get("year")
  const date = params.get("date")
  const tags = params.getAll("tag")
  const xtags = params.getAll("xtag")
  const limit = Math.min(Number(params.get("limit") ?? 500), 1000)

  // Tag-filtered pagination: route to RPC (same function used by home page).
  if ((tags.length > 0 || xtags.length > 0) && (before || after)) {
    const { data, error } = await supabase.rpc("list_filtered_albums", {
      p_include_tags: tags,
      p_exclude_tags: xtags,
      p_before: before ?? null,
      p_after: after ?? null,
      p_limit: limit,
    })
    if (error) {
      logger.error({ route: "api/albums", rpc: "list_filtered_albums", err: error.message }, "RPC failed")
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json(
      { albums: (data ?? []).map(rpcRowToAlbumListItem) },
      { headers: { "Cache-Control": CACHE } },
    )
  }

  if (!before && !after && !hostId && !date && !artist) {
    return Response.json({ error: "Missing 'before', 'after', 'host_id', 'artist', or 'date' param" }, { status: 400 })
  }

  let query = supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .limit(limit)

  if (artist) {
    query = query.eq("artist", artist).order("date", { ascending: false })
  } else if (date) {
    query = query.eq("date", date).order("artist", { ascending: true })
  } else if (hostId) {
    query = query.eq("host_id", hostId).order("date", { ascending: false })
    if (year) {
      query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
    }
  } else if (before) {
    query = query.lt("date", before).order("date", { ascending: false })
  } else {
    query = query.gt("date", after!).order("date", { ascending: true })
  }

  const { data, error } = await query

  if (error) {
    logger.error({ route: "api/albums", err: error.message }, "query failed")
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(toAlbumListItem) },
    { headers: { "Cache-Control": CACHE } },
  )
}
