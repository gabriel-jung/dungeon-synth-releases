import { type NextRequest } from "next/server"
import { supabase } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")

  if (!id) {
    return Response.json({ error: "Missing id" }, { status: 400 })
  }

  const [albumRes, tagsRes] = await Promise.all([
    supabase
      .from("albums")
      .select("id, artist, title, url, art_id, date, host_id, num_tracks, duration_sec, hosts!inner(name)")
      .eq("id", id)
      .single(),
    supabase.from("album_tags").select("tags!inner(name)").eq("album_id", id),
  ])

  if (!albumRes.data) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  const r = albumRes.data
  return Response.json({
    id: r.id,
    artist: r.artist,
    title: r.title,
    url: r.url,
    art_id: r.art_id,
    date: r.date,
    host_id: r.host_id,
    host_name: (r.hosts as unknown as { name: string } | null)?.name ?? null,
    tags: ((tagsRes.data ?? []) as unknown as { tags: { name: string } }[]).map((t) => t.tags.name),
    num_tracks: r.num_tracks ?? 0,
    duration_sec: r.duration_sec ?? 0,
  })
}
