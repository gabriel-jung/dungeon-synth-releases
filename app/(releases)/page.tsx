import type { Metadata } from "next"
import { connection } from "next/server"
import { supabase, fetchRecentAlbums } from "@/lib/supabase"
import { type AlbumListItem, coverUrl, dateRange, dedupeById, localDateStr, parseTagParams, pickLatestDate, rpcRowToAlbumListItem } from "@/lib/types"
import { SITE_URL } from "@/lib/site"
import DateSlider from "@/components/DateSlider"
import ReleaseList from "@/components/ReleaseList"
import { Suspense } from "react"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}): Promise<Metadata> {
  const sp = await searchParams
  const raw = sp.album
  const albumId = Array.isArray(raw) ? raw[0] : raw
  if (!albumId) return {}

  const { data } = await supabase
    .from("albums")
    .select("id, artist, title, art_id, date, hosts!inner(name)")
    .eq("id", albumId)
    .single()
  if (!data) return {}

  const hostName = (data.hosts as unknown as { name: string } | null)?.name
  const title = `${data.artist} — ${data.title}`
  const descParts = [
    `Dungeon synth release by ${data.artist}`,
    hostName && hostName.toLowerCase() !== data.artist.toLowerCase() ? `on ${hostName}` : null,
    data.date ? `(${data.date})` : null,
  ].filter(Boolean)
  const description = descParts.join(" ") + "."
  const image = coverUrl(data.art_id, "full")

  return {
    title,
    description,
    alternates: { canonical: `/?album=${albumId}` },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/?album=${albumId}`,
      siteName: "Dungeon Synth Releases",
      type: "music.album",
      ...(image ? { images: [{ url: image, width: 350, height: 350, alt: title }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)

  const today = localDateStr(new Date())
  const yearStart = `${new Date().getUTCFullYear()}-01-01`
  const allDates = dateRange(today, yearStart)
  const tomorrow = localDateStr(new Date(Date.parse(today) + 86400000))

  const allRows: AlbumListItem[] = []
  const hasTagFilters = includeTags.length > 0 || excludeTags.length > 0

  if (hasTagFilters) {
    // Filtered path: first page via RPC. Infinite scroll paginates further
    // through /api/albums with tag params (cursor = edge date).
    const { data, error } = await supabase.rpc("list_filtered_albums", {
      p_include_tags: includeTags,
      p_exclude_tags: excludeTags,
      p_before: tomorrow,
      p_after: null,
      p_limit: 500,
    })
    if (error) throw new Error(`list_filtered_albums RPC failed: ${error.message}`)
    for (const r of data ?? []) allRows.push(rpcRowToAlbumListItem(r))
  } else {
    // Unfiltered path: 7-day window via cached helper so all visitors
    // share one Supabase fetch until the daily cron rolls it.
    const rows = await fetchRecentAlbums(today)
    for (const r of rows) allRows.push(r)
  }

  const deduped = dedupeById(allRows)
  const expandDate = pickLatestDate(deduped)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full">
      <div className="flex flex-col sm:flex-row sm:gap-4 h-full">
        {/* Horizontal date slider — mobile only */}
        <div className="sm:hidden shrink-0">
          <Suspense>
            <DateSlider dates={allDates} orientation="horizontal" />
          </Suspense>
          <hr className="border-border" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto" id="release-list" style={{ scrollbarWidth: "none" }}>
          <Suspense>
            <ReleaseList albums={deduped} expandDate={expandDate} hasMore lowerBound={yearStart} />
          </Suspense>
        </div>

        {/* Vertical date slider — desktop only */}
        <div className="hidden sm:block shrink-0" style={{ width: "70px" }}>
          <Suspense>
            <DateSlider dates={allDates} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
