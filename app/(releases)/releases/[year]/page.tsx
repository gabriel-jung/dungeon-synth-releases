import { notFound } from "next/navigation"
import { connection } from "next/server"
import { supabase, ALBUM_LIST_SELECT, toAlbumListItem, rpcRowToAlbumListItem } from "@/lib/supabase"
import { AlbumListItem, dateRange, dedupeById, parseTagParams } from "@/lib/types"
import DateSlider from "@/components/DateSlider"
import ReleaseList from "@/components/ReleaseList"
import { Suspense } from "react"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year } = await params
  return {
    title: `${year}`,
    description: `Dungeon synth releases from ${year}.`,
    alternates: { canonical: `/releases/${year}` },
  }
}

export default async function YearReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await connection()
  const { year: yearParam } = await params
  const year = Number(yearParam)
  const currentYear = new Date().getUTCFullYear()
  if (!Number.isInteger(year) || year < 1900 || year > currentYear) notFound()

  const sp = await searchParams
  const { includeTags, excludeTags } = parseTagParams(sp)

  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`
  const allDates = dateRange(yearEnd, yearStart)

  const hasTagFilters = includeTags.length > 0 || excludeTags.length > 0
  let rows: AlbumListItem[]

  if (hasTagFilters) {
    const { data, error } = await supabase.rpc("list_filtered_albums", {
      p_include_tags: includeTags,
      p_exclude_tags: excludeTags,
      p_before: `${year + 1}-01-01`,
      p_after: `${year - 1}-12-31`,
      p_limit: 500,
    })
    if (error) throw new Error(`list_filtered_albums RPC failed: ${error.message}`)
    rows = dedupeById((data ?? []).map(rpcRowToAlbumListItem))
  } else {
    const { data, error } = await supabase
      .from("albums")
      .select(ALBUM_LIST_SELECT)
      .lte("date", yearEnd)
      .gte("date", yearStart)
      .order("date", { ascending: false })
      .range(0, 499)
    if (error) throw new Error(`albums query failed: ${error.message}`)
    rows = (data ?? []).map(toAlbumListItem)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 h-full">
      <div className="flex flex-col sm:flex-row sm:gap-4 h-full">
        <div className="sm:hidden shrink-0">
          <Suspense>
            <DateSlider dates={allDates} orientation="horizontal" />
          </Suspense>
          <hr className="border-border" />
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto" id="release-list" style={{ scrollbarWidth: "none" }}>
          <Suspense>
            <ReleaseList
              albums={rows}
              expandDate={null}
              hasMore={rows.length === 500}
              lowerBound={yearStart}
              upperBound={yearEnd}
              includeYear
            />
          </Suspense>
        </div>

        <div className="hidden sm:block shrink-0" style={{ width: "70px" }}>
          <Suspense>
            <DateSlider dates={allDates} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
