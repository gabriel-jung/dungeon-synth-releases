import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"
import { AlbumListItem, localDateStr, dateRange, parseTagParams } from "@/lib/types"
import DateSlider from "@/components/DateSlider"
import ReleaseList from "@/components/ReleaseList"
import { Suspense } from "react"

// Short revalidate: pages stamped with today's date would otherwise outlive
// the day rollover, leaving "Today" labels pointing at what's now yesterday.
export const revalidate = 300

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)

  const today = localDateStr(new Date())
  const yearStart = `${new Date().getUTCFullYear()}-01-01`
  const allDates = dateRange(today, yearStart)

  const allRows: AlbumListItem[] = []
  const PAGE = 1000
  let from = 0

  // Batch all include/exclude tags into one join: single query returns every
  // (album_id, tag_name) pair, grouped client-side into per-tag sets.
  let tagFilterIds: Set<string> | null = null
  if (includeTags.length > 0 || excludeTags.length > 0) {
    const allTags = [...includeTags, ...excludeTags]
    const { data } = await supabase
      .from("album_tags")
      .select("album_id, tags!inner(name)")
      .in("tags.name", allTags)
      .limit(20000)
    const perTag = new Map<string, Set<string>>()
    for (const name of allTags) perTag.set(name, new Set<string>())
    const rows = (data ?? []) as unknown as { album_id: string; tags: { name: string } | { name: string }[] }[]
    for (const r of rows) {
      const name = Array.isArray(r.tags) ? r.tags[0]?.name : r.tags?.name
      if (name) perTag.get(name)?.add(r.album_id)
    }

    let matchIds: Set<string> | null = null
    for (const tag of includeTags) {
      const ids = perTag.get(tag) ?? new Set<string>()
      if (!matchIds) { matchIds = ids; continue }
      const next = new Set<string>()
      for (const id of matchIds) if (ids.has(id)) next.add(id)
      matchIds = next
    }
    const excludeIds = new Set<string>()
    for (const tag of excludeTags) for (const id of perTag.get(tag) ?? []) excludeIds.add(id)

    if (matchIds) {
      for (const id of excludeIds) matchIds.delete(id)
      tagFilterIds = matchIds
    } else {
      tagFilterIds = excludeIds.size > 0 ? excludeIds : null
    }
  }

  const hasTagFilters = tagFilterIds !== null

  // Without tag filters, only fetch last 7 days for fast initial load (covers only for latest day)
  const cutoff = !hasTagFilters ? allDates[6] : null

  while (true) {
    let query = supabase
      .from("albums")
      .select(ALBUM_LIST_SELECT)
      .lte("date", today)
      .order("date", { ascending: false })
      .range(from, from + PAGE - 1)

    if (cutoff) query = query.gte("date", cutoff)
    if (includeTags.length > 0 && tagFilterIds) query = query.in("id", [...tagFilterIds])

    const { data } = await query
    if (!data || data.length === 0) break

    for (const r of data) {
      if (excludeTags.length > 0 && tagFilterIds && tagFilterIds.has(r.id)) continue
      allRows.push(toAlbumListItem(r))
    }

    if (data.length < PAGE) break
    from += PAGE
  }

  // Deduplicate albums (same ID can appear if data has dupes)
  const seen = new Set<string>()
  const deduped = allRows.filter((a) => { if (seen.has(a.id)) return false; seen.add(a.id); return true })

  // Only the most recent day with releases gets cover art
  const latestDate = allDates.find((d) => deduped.some((a) => a.date === d)) ?? null
  const recentArray = latestDate ? [latestDate] : []
  const expandDate = latestDate

  // Strip art_id for all days except the latest to avoid unnecessary cover fetches
  for (const item of deduped) {
    if (item.date !== latestDate) item.art_id = undefined
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full">
        <div className="flex flex-col sm:flex-row sm:gap-4 sm:pt-6 h-full">
          {/* Horizontal date slider — mobile only */}
          <div className="sm:hidden shrink-0">
            <Suspense>
              <DateSlider dates={allDates} orientation="horizontal" />
            </Suspense>
            <hr className="border-border" />
          </div>

          <div className="flex-1 min-w-0 flex flex-col overflow-y-auto pt-4 sm:pt-0" id="release-list" style={{ scrollbarWidth: "none" }}>
            <Suspense>
              <ReleaseList albums={deduped} recentDates={recentArray} expandDate={expandDate} hasMore={!hasTagFilters} />
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
    </>
  )
}
