import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"
import { checkRateLimit, ipFromRequest, rateLimitResponse } from "@/lib/rateLimit"

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`search:${ipFromRequest(request)}`, 30, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const q = request.nextUrl.searchParams.get("q")?.trim()

  if (!q || q.length < 2) {
    return Response.json({ albums: [] })
  }

  const pattern = `%${q}%`

  const { data, error } = await supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .or(`artist.ilike.${pattern},title.ilike.${pattern}`)
    .order("date", { ascending: false })
    .limit(200)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(toAlbumListItem) },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  )
}
