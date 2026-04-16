import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const before = params.get("before")
  const after = params.get("after")
  const hostId = params.get("host_id")
  const artist = params.get("artist")
  const year = params.get("year")
  const date = params.get("date")
  const limit = Math.min(Number(params.get("limit") ?? 500), 1000)

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
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(toAlbumListItem) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  )
}
