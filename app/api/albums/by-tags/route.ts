import { type NextRequest } from "next/server"
import { supabase, rpcRowToAlbumListItem } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const tags = sp.getAll("tag")
  const limit = Math.min(Number(sp.get("limit") ?? 500), 1000)

  if (tags.length === 0) {
    return Response.json({ error: "Missing 'tag' param" }, { status: 400 })
  }

  const { data, error } = await supabase.rpc("list_filtered_albums", {
    p_include_tags: tags,
    p_exclude_tags: [],
    p_before: null,
    p_after: null,
    p_limit: limit,
  })

  if (error) {
    console.error("[api/albums/by-tags] RPC failed:", error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(rpcRowToAlbumListItem) },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  )
}
