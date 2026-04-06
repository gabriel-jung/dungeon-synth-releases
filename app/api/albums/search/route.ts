import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"

export async function GET(request: NextRequest) {
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

  return Response.json({ albums: (data ?? []).map(toAlbumListItem) })
}
