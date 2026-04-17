import { supabase, ALBUM_LIST_SELECT, toAlbumListItem, rpcRowToAlbumListItem } from "@/lib/supabase"
import { AlbumListItem, localDateStr, dateRange, parseTagParams } from "@/lib/types"
import DateSlider from "@/components/DateSlider"
import ReleaseList from "@/components/ReleaseList"
import { Suspense } from "react"

export const revalidate = 3600

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
  const hasTagFilters = includeTags.length > 0 || excludeTags.length > 0

  if (hasTagFilters) {
    // Filtered path: first page via RPC. Infinite scroll paginates further
    // through /api/albums with tag params (cursor = edge date).
    const tomorrow = localDateStr(new Date(Date.now() + 86400000))
    const { data, error } = await supabase.rpc("list_filtered_albums", {
      p_include_tags: includeTags,
      p_exclude_tags: excludeTags,
      p_before: tomorrow,
      p_after: null,
      p_limit: 500,
    })
    if (error) console.error("[page] list_filtered_albums RPC failed:", error.message)
    for (const r of data ?? []) allRows.push(rpcRowToAlbumListItem(r))
  } else {
    // Unfiltered path: only fetch last 7 days for fast initial load.
    const cutoff = allDates[6]
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from("albums")
        .select(ALBUM_LIST_SELECT)
        .lte("date", today)
        .gte("date", cutoff)
        .order("date", { ascending: false })
        .range(from, from + PAGE - 1)
      if (error) {
        console.error("[page] albums query failed:", error.message)
        break
      }
      if (!data || data.length === 0) break
      for (const r of data) allRows.push(toAlbumListItem(r))
      if (data.length < PAGE) break
      from += PAGE
    }
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
              <ReleaseList albums={deduped} recentDates={recentArray} expandDate={expandDate} hasMore />
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
