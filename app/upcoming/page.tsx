import { supabase, ALBUM_LIST_SELECT, toAlbumListItem } from "@/lib/supabase"
import { AlbumListItem, localDateStr, dateRange } from "@/lib/types"
import DateSlider from "@/components/DateSlider"
import ReleaseList from "@/components/ReleaseList"
import { Suspense } from "react"

export const revalidate = 86400 // once per day

export default async function UpcomingPage() {
  const today = localDateStr(new Date())
  const tomorrow = localDateStr(new Date(Date.now() + 86400000))

  // Fetch upcoming albums (next 7 days initially)
  const cutoff = localDateStr(new Date(Date.now() + 7 * 86400000))
  const allRows: AlbumListItem[] = []
  const PAGE = 1000
  let from = 0

  while (true) {
    const { data } = await supabase
      .from("albums")
      .select(ALBUM_LIST_SELECT)
      .gt("date", today)
      .lte("date", cutoff)
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1)

    if (!data || data.length === 0) break
    for (const r of data) allRows.push(toAlbumListItem(r))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Find the furthest upcoming album date
  const { data: maxRow } = await supabase
    .from("albums")
    .select("date")
    .gt("date", today)
    .order("date", { ascending: false })
    .limit(1)
    .single()

  const yearEnd = `${new Date().getFullYear()}-12-31`
  const lastAlbumDate = maxRow?.date && maxRow.date <= yearEnd ? maxRow.date : yearEnd
  const allDates = dateRange(tomorrow, lastAlbumDate)

  const expandDate = allDates.find((d) => allRows.some((a) => a.date === d)) ?? null

  return (
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
            <ReleaseList albums={allRows} recentDates={[]} expandDate={expandDate} hasMore direction="future" listOnly includeYear />
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
