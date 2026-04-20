import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, HTTP_CACHE_1H, toAlbumListItem, rpcRowToAlbumListItem } from "@/lib/supabase"
import { AlbumListItem, dedupeById } from "@/lib/types"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"
import { logger } from "@/lib/logger"

// Unified scoped-list endpoint for the shared ScopeModal.
// Accepts:
//   - scope: artist | host | genre  (at least one; genre is also implied by any `genre=` param)
//   - artist=<name>
//   - host_id=<id>   year=<year>  (optional year clamp for host)
//   - genre=<name>   (repeatable — intersection; also used as a scope value)
//   - xgenre=<name>  (repeatable — excluded tags inside modal)
//   - tag=<name>     (repeatable — page-level include filter, preserved)
//   - xtag=<name>    (repeatable — page-level exclude filter, preserved)
//
// Behaviour:
//   - If any include/exclude tag or genre is present, routes through the
//     `list_filtered_albums` RPC (server-side intersection).
//   - Artist/host-only path uses the direct select (faster + paginatable).
//   - For artist/host + tag/xtag/genre/xgenre combinations, fetches via the
//     filtered-albums RPC then narrows by artist/host in-process (DB can't
//     combine both server-side in the current RPC shape).
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

  const allInclude = [...tags, ...genres]
  const allExclude = [...xtags, ...xgenres]
  const hasTagFilter = allInclude.length > 0 || allExclude.length > 0

  // Fetch host metadata when scoping by host, so ModalRouter can render the
  // header without a second round-trip.
  const hostMetaPromise = hostId
    ? supabase.from("hosts").select("id, name, image_id, url").eq("id", hostId).maybeSingle()
    : null

  // Genre-only (with optional tag filter) → RPC path. Cap well below the
  // full catalogue: the modal starts with a 5-tile paged cover grid and the
  // list view is backed by this same payload, so 100 covers the common case
  // without shipping 500 rows each open.
  if (!artist && !hostId) {
    const { data, error } = await supabase.rpc("list_filtered_albums", {
      p_include_tags: allInclude,
      p_exclude_tags: allExclude,
      p_before: null,
      p_after: null,
      p_limit: 100,
    })
    if (error) {
      logger.error({ route: "api/albums/by-scope", rpc: "list_filtered_albums", err: error.message }, "RPC failed")
      return Response.json({ error: error.message }, { status: 500 })
    }
    return Response.json(
      { albums: dedupeById((data ?? []).map(rpcRowToAlbumListItem)) },
      { headers: { "Cache-Control": HTTP_CACHE_1H } },
    )
  }

  // Artist/host + tag filter → RPC then narrow. Cap p_limit lower when an
  // artist/host constraint is set (single-artist catalogues are small, so
  // fetching 1000 tag-matches just to discard most of them client-side is waste).
  if (hasTagFilter) {
    const [rpcRes, hostMeta] = await Promise.all([
      supabase.rpc("list_filtered_albums", {
        p_include_tags: allInclude,
        p_exclude_tags: allExclude,
        p_before: null,
        p_after: null,
        p_limit: 200,
      }),
      hostMetaPromise,
    ])
    if (rpcRes.error) {
      logger.error({ route: "api/albums/by-scope", rpc: "list_filtered_albums", err: rpcRes.error.message }, "RPC failed")
      return Response.json({ error: rpcRes.error.message }, { status: 500 })
    }
    let rows: AlbumListItem[] = (rpcRes.data ?? []).map(rpcRowToAlbumListItem)
    if (artist) rows = rows.filter((a) => a.artist === artist)
    if (hostId) rows = rows.filter((a) => a.host_id === hostId)
    if (year) {
      const start = `${year}-01-01`
      const end = `${year}-12-31`
      rows = rows.filter((a) => a.date && a.date >= start && a.date <= end)
    }
    return Response.json(
      { albums: dedupeById(rows), host: hostMeta?.data ?? null },
      { headers: { "Cache-Control": HTTP_CACHE_1H } },
    )
  }

  // Artist or host only (no tag filter) → direct select.
  let query = supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .order("date", { ascending: false })
    .limit(1000)

  if (artist) {
    query = query.eq("artist", artist)
  } else if (hostId) {
    query = query.eq("host_id", hostId)
    if (year) query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
  }

  const [queryRes, hostMeta] = await Promise.all([query, hostMetaPromise])
  if (queryRes.error) {
    logger.error({ route: "api/albums/by-scope", err: queryRes.error.message }, "query failed")
    return Response.json({ error: queryRes.error.message }, { status: 500 })
  }
  return Response.json(
    { albums: (queryRes.data ?? []).map(toAlbumListItem), host: hostMeta?.data ?? null },
    { headers: { "Cache-Control": HTTP_CACHE_1H } },
  )
}
