import { supabase } from "@/lib/supabase"
import { AlbumListItem, localDateStr } from "@/lib/types"
import DateSlider from "@/components/DateSlider"
import TagFilter from "@/components/TagFilter"
import ReleaseList from "@/components/ReleaseList"
import { Suspense } from "react"

export const revalidate = 3600

function recentDates(count: number): Set<string> {
  const dates = new Set<string>()
  const now = new Date()
  for (let i = 0; i < count; i++) {
    dates.add(localDateStr(new Date(now.getTime() - i * 86400000)))
  }
  return dates
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const includeTags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : []
  const excludeTags = Array.isArray(sp.xtag) ? sp.xtag : sp.xtag ? [sp.xtag] : []

  const today = localDateStr(new Date())
  const last7 = recentDates(7)

  // Fetch albums — lightweight list items (art_id only for last 7 days)
  const allRows: AlbumListItem[] = []
  const PAGE = 1000
  let from = 0

  // When tag filters are active, get matching album IDs first
  let tagFilterIds: Set<string> | null = null
  if (includeTags.length > 0 || excludeTags.length > 0) {
    // Get IDs that have ALL included tags
    let matchIds: Set<string> | null = null
    for (const tag of includeTags) {
      const { data } = await supabase
        .from("tags")
        .select("album_id")
        .eq("tag_name", tag)
        .limit(10000)
      const ids = new Set<string>((data ?? []).map((r: { album_id: string }) => r.album_id))
      if (matchIds) {
        const prev: Set<string> = matchIds
        matchIds = new Set<string>([...prev].filter((id) => ids.has(id)))
      } else {
        matchIds = ids
      }
    }

    // Get IDs that have ANY excluded tag and remove them
    const excludeIds = new Set<string>()
    for (const tag of excludeTags) {
      const { data } = await supabase
        .from("tags")
        .select("album_id")
        .eq("tag_name", tag)
        .limit(10000)
      for (const r of data ?? []) excludeIds.add(r.album_id)
    }

    if (matchIds) {
      for (const id of excludeIds) matchIds.delete(id)
      tagFilterIds = matchIds
    } else {
      tagFilterIds = excludeIds.size > 0 ? excludeIds : null
    }
  }

  while (true) {
    let query = supabase
      .from("albums")
      .select("id, date, artist, title, url, art_id, hosts!inner(name)")
      .lte("date", today)
      .order("date", { ascending: false })
      .range(from, from + PAGE - 1)

    // If including tags, filter to matching IDs
    if (includeTags.length > 0 && tagFilterIds) {
      query = query.in("id", [...tagFilterIds])
    }

    const { data } = await query
    if (!data || data.length === 0) break

    for (const r of data) {
      // If excluding tags, skip excluded IDs
      if (excludeTags.length > 0 && tagFilterIds && tagFilterIds.has(r.id)) continue
      allRows.push({
        id: r.id,
        artist: r.artist,
        title: r.title,
        url: r.url,
        date: r.date,
        art_id: last7.has(r.date) ? r.art_id : undefined,
        host_name: (r.hosts as unknown as { name: string } | null)?.name ?? null,
      })
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  // Fetch available tags (distinct names + counts) for the filter panel
  const tagCounts = new Map<string, number>()
  let tagFrom = 0
  while (true) {
    const { data } = await supabase
      .from("tags")
      .select("tag_name")
      .range(tagFrom, tagFrom + 999)
    if (!data || data.length === 0) break
    for (const r of data) tagCounts.set(r.tag_name, (tagCounts.get(r.tag_name) ?? 0) + 1)
    if (data.length < 1000) break
    tagFrom += 1000
  }
  const allTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)

  const availableDates = allRows
    .map((a) => a.date)
    .filter((d): d is string => d != null && d !== "Unknown")
    .filter((d, i, arr) => arr.indexOf(d) === i)

  // Expand the most recent day in the last 7 that has albums
  const expandDate = availableDates.find((d) => last7.has(d)) ?? null

  // Serialize recentDates as array for client component
  const last7Array = [...last7]

  return (
    <>
      <Suspense>
        <TagFilter tags={allTags} />
      </Suspense>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:gap-4 sm:pt-6" style={{ height: "calc(100dvh - 100px)" }}>
          {/* Horizontal date slider — mobile only */}
          <div className="sm:hidden shrink-0">
            <Suspense>
              <DateSlider dates={availableDates} orientation="horizontal" />
            </Suspense>
            <hr className="border-border" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto pt-4 sm:pt-0" id="release-list" style={{ scrollbarWidth: "none" }}>
            <Suspense>
              <ReleaseList albums={allRows} recentDates={last7Array} expandDate={expandDate} />
            </Suspense>
          </div>

          {/* Vertical date slider — desktop only */}
          <div className="hidden sm:block shrink-0" style={{ width: "70px" }}>
            <Suspense>
              <DateSlider dates={availableDates} />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  )
}
