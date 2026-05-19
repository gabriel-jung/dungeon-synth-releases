import { type NextRequest } from "next/server"
import { supabase, HTTP_CACHE_1H, rpcRowToAlbumListItem } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

// Unified scoped-list endpoint for the shared ScopeModal.
// Accepts:
//   - scope: artist | host | genre  (at least one; genre is implied by any `genre=` param)
//   - artist=<name>
//   - host_id=<id>   year=<year>  (optional year clamp; also applies to artist scope)
//   - genre=<name>   (repeatable, intersection, also used as scope value)
//   - xgenre=<name>  (repeatable, excluded tags inside modal)
//   - tag=<name>     (repeatable, page-level include filter, preserved)
//   - xtag=<name>    (repeatable, page-level exclude filter, preserved)
//
// All paths go through `list_filtered_albums`, which now accepts artist /
// host_id / year so the SQL planner narrows by entity BEFORE the tag-filter
// CTE. Previously we fetched 200 tag-matched rows and discarded most JS-side.
export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`by-scope:${ipFromRequest(request)}`, 60, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const sp = request.nextUrl.searchParams
  const artist = sp.get("artist")
  const hostId = sp.get("host_id")
  const year = sp.get("year")
  const genres = sp.getAll("genre")
  const xgenres = sp.getAll("xgenre")
  const tags = sp.getAll("tag")
  const xtags = sp.getAll("xtag")

  if (!artist && !hostId && genres.length === 0) {
    return Response.json(
      { error: "Must provide one of: artist, host_id, or genre" },
      { status: 400 },
    )
  }

  // host_id / year arrive as raw query strings. Coerce up front so a
  // malformed value is a clean 400, not a NaN that JSON-serialises to null
  // and silently drops the filter.
  const hostIdNum = hostId ? Number(hostId) : null
  const yearNum = year ? Number(year) : null
  if (
    (hostIdNum !== null && !Number.isInteger(hostIdNum)) ||
    (yearNum !== null && !Number.isInteger(yearNum))
  ) {
    return Response.json(
      { error: "host_id and year must be integers" },
      { status: 400 },
    )
  }

  const allInclude = [...tags, ...genres]
  const allExclude = [...xtags, ...xgenres]
  // Entity-scoped catalogues are bounded (one artist / one host), so 500 is
  // enough headroom. Pure genre-scope sweeps the full catalogue; 100 keeps
  // the cover-grid payload tight (modal pages further if needed).
  const limit = artist || hostId ? 500 : 100

  const hostMetaPromise = hostIdNum !== null
    ? supabase.from("hosts").select("id, name, image_id, url").eq("id", hostIdNum).maybeSingle()
    : null

  const [rpcRes, hostMeta] = await Promise.all([
    supabase.rpc("list_filtered_albums", {
      p_include_tags: allInclude,
      p_exclude_tags: allExclude,
      p_before: null,
      p_after: null,
      p_limit: limit,
      p_artist: artist,
      p_host_id: hostIdNum,
      p_year: yearNum,
    }),
    hostMetaPromise,
  ])

  if (rpcRes.error) {
    logger.error(
      { route: "api/albums/by-scope", rpc: "list_filtered_albums", err: rpcRes.error.message },
      "RPC failed",
    )
    return Response.json({ error: rpcRes.error.message }, { status: 500 })
  }

  return Response.json(
    {
      albums: (rpcRes.data ?? []).map(rpcRowToAlbumListItem),
      host: hostMeta?.data ?? null,
    },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
