import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const before = params.get("before")
  const after = params.get("after")
  const limit = Math.min(Number(params.get("limit") ?? 500), 1000)

  if (!before && !after) {
    return Response.json({ error: "Missing 'before' or 'after' param" }, { status: 400 })
  }

  let query = supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .limit(limit)

  if (before) {
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
