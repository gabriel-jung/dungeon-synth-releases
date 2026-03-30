"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlbumListItem, formatDateHeading } from "@/lib/types"
import DaySection from "./DaySection"
import { ReleaseCard } from "./AlbumDetail"

function groupByDate(albums: AlbumListItem[]): [string, AlbumListItem[]][] {
  const groups = new Map<string, AlbumListItem[]>()
  for (const album of albums) {
    const key = album.date ?? "Unknown"
    const list = groups.get(key)
    if (list) list.push(album)
    else groups.set(key, [album])
  }
  return [...groups.entries()]
}

export default function ReleaseList({
  albums,
  recentDates: recentDatesArray,
  expandDate,
}: {
  albums: AlbumListItem[]
  recentDates: string[]
  expandDate: string | null
}) {
  const searchParams = useSearchParams()
  const [q, setQ] = useState(searchParams.get("q")?.toLowerCase() ?? "")
  const recentDates = useMemo(() => new Set(recentDatesArray), [recentDatesArray])

  useEffect(() => {
    const handler = (e: Event) => setQ(((e as CustomEvent).detail ?? "").toLowerCase())
    window.addEventListener("search-change", handler)
    return () => window.removeEventListener("search-change", handler)
  }, [])

  const filtered = useMemo(() => {
    if (!q) return albums
    return albums.filter(
      (a) =>
        a.artist.toLowerCase().includes(q) ||
        a.title.toLowerCase().includes(q) ||
        (a.host_name && a.host_name.toLowerCase().includes(q)),
    )
  }, [albums, q])

  const grouped = groupByDate(filtered)

  return (
    <>
      {grouped.map(([date, dayAlbums], gi) => {
        const sectionCls = gi === 0 ? "" : "pt-4 sm:pt-6"
        if (recentDates.has(date)) {
          return (
            <section key={date} id={`date-${date}`} className={sectionCls}>
              <DaySection
                label={formatDateHeading(date)}
                albums={dayAlbums}
                defaultExpanded={date === expandDate}
              />
            </section>
          )
        }

        return (
          <section key={date} id={`date-${date}`} className={sectionCls}>
            <h3 className="text-text-dim text-sm tracking-wider border-b border-border pb-2 mb-2">
              {date === "Unknown" ? "Unknown date" : formatDateHeading(date)}
            </h3>
            <div className="columns-1 sm:columns-2 lg:columns-3" style={{ columnGap: "1rem" }}>
              {dayAlbums.map((album) => (
                <div key={album.id} style={{ breakInside: "avoid" }}>
                  <ReleaseCard album={album} />
                </div>
              ))}
            </div>
          </section>
        )
      })}
      <div style={{ minHeight: "calc(100vh - 200px)" }} />
    </>
  )
}
