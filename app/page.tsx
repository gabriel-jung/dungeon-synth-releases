import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"
import { AlbumListItem, localDateStr, dateRange } from "@/lib/types"
import DateSlider from "@/components/DateSlider"
import TagFilter from "@/components/TagFilter"
import ReleaseList from "@/components/ReleaseList"
import YearCount from "@/components/YearCount"
import { Suspense } from "react"

export const revalidate = 3600

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const includeTags = Array.isArray(sp.tag) ? sp.tag : sp.tag ? [sp.tag] : []
  const excludeTags = Array.isArray(sp.xtag) ? sp.xtag : sp.xtag ? [sp.xtag] : []

  const today = localDateStr(new Date())
  const year = new Date().getFullYear()
  const yearStart = `${year}-01-01`
  const allDates = dateRange(today, yearStart)

  const yearCountPromise = supabase
    .from("albums")
    .select("*", { count: "exact", head: true })
    .gte("date", yearStart)
    .lte("date", today)
  // Fetch albums — lightweight list items
  const allRows: AlbumListItem[] = []
  const PAGE = 1000
  let from = 0

  // When tag filters are active, get matching album IDs first
  let tagFilterIds: Set<string> | null = null
  if (includeTags.length > 0 || excludeTags.length > 0) {
    async function albumIdsForTag(tag: string): Promise<Set<string>> {
      const { data } = await supabase
        .from("tags")
        .select("album_id")
        .eq("tag_name", tag)
        .limit(10000)
      return new Set<string>((data ?? []).map((r: { album_id: string }) => r.album_id))
    }

    // Get IDs that have ALL included tags (intersection)
    let matchIds: Set<string> | null = null
    for (const tag of includeTags) {
      const ids = await albumIdsForTag(tag)
      matchIds = matchIds
        ? new Set([...(matchIds as Set<string>)].filter((id) => ids.has(id)))
        : ids
    }

    // Get IDs that have ANY excluded tag (union) and remove them
    const excludeResults = await Promise.all(excludeTags.map(albumIdsForTag))
    const excludeIds = new Set(excludeResults.flatMap((s) => [...s]))

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

  const { count: yearCount } = await yearCountPromise

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
      <Suspense>
        <TagFilter tags={allTags} />
      </Suspense>
      {!hasTagFilters && yearCount !== null && <YearCount count={yearCount} year={year} />}
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
