import { type NextRequest } from "next/server"
import { supabase, ALBUM_LIST_SELECT, paginateAll, toAlbumListItem } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const tags = sp.getAll("tag")
  const limit = Math.min(Number(sp.get("limit") ?? 500), 1000)

  if (tags.length === 0) {
    return Response.json({ error: "Missing 'tag' param" }, { status: 400 })
  }

  const { data: tagRows } = await supabase
    .from("tags")
    .select("id, name")
    .in("name", tags)
  const idToName = new Map<number, string>(
    (tagRows ?? []).map((r: { id: number; name: string }) => [r.id, r.name]),
  )
  if (idToName.size < tags.length) {
    return Response.json({ albums: [] })
  }
  const tagIds = [...idToName.keys()]

  // Single paginated scan rather than N queries — collect album_id → tag names.
  const rows = await paginateAll<{ album_id: string; tag_id: number }>(
    async (from, to) => {
      const { data } = await supabase
        .from("album_tags")
        .select("album_id, tag_id")
        .in("tag_id", tagIds)
        .range(from, to)
      return data
    },
  )
  const perTag = new Map<string, Set<string>>()
  for (const name of tags) perTag.set(name, new Set<string>())
  for (const r of rows) {
    const name = idToName.get(r.tag_id)
    if (name) perTag.get(name)!.add(r.album_id)
  }

  const sets = [...perTag.values()]
  let intersection = sets[0]
  for (let i = 1; i < sets.length; i++) {
    intersection = new Set([...intersection].filter((id) => sets[i].has(id)))
  }
  if (intersection.size === 0) {
    return Response.json({ albums: [] })
  }

  const { data, error } = await supabase
    .from("albums")
    .select(ALBUM_LIST_SELECT)
    .in("id", [...intersection])
    .order("date", { ascending: false })
    .limit(limit)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(
    { albums: (data ?? []).map(toAlbumListItem) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  )
}
