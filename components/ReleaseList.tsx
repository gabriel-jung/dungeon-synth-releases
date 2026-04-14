"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlbumListItem } from "@/lib/types"
import DaySection from "./DaySection"
import DateHeading from "./DateHeading"
import { AlbumGrid, ReleaseCard } from "./AlbumDetail"

function groupByDate(albums: AlbumListItem[]): [string, AlbumListItem[]][] {
  const groups = new Map<string, AlbumListItem[]>()
  for (const album of albums) {
    const key = album.date ?? "Unknown"
    const list = groups.get(key)
    if (list) list.push(album)
    else groups.set(key, [album])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }))
  }
  return [...groups.entries()]
}

function LoadTrigger({ loading, onVisible }: { loading: boolean; onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const onVisibleRef = useRef(onVisible)
  onVisibleRef.current = onVisible

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisibleRef.current() },
      { root: document.getElementById("release-list"), rootMargin: "400px" },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="py-6 text-center text-text-dim">
      {loading ? (
        <span className="font-display text-xs tracking-[0.1em]">· · ·</span>
      ) : null}
    </div>
  )
}

export default function ReleaseList({
  albums: initialAlbums,
  recentDates: recentDatesArray,
  expandDate,
  hasMore = false,
  direction = "past",
  listOnly = false,
  includeYear = false,
}: {
  albums: AlbumListItem[]
  recentDates: string[]
  expandDate: string | null
  hasMore?: boolean
  direction?: "past" | "future"
  listOnly?: boolean
  includeYear?: boolean
}) {
  const searchParams = useSearchParams()
  const [q, setQ] = useState(searchParams.get("q") ?? "")
  const recentDates = useMemo(() => new Set(recentDatesArray), [recentDatesArray])
  const [extraAlbums, setExtraAlbums] = useState<AlbumListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const [searchResults, setSearchResults] = useState<AlbumListItem[] | null>(null)
  const [searching, setSearching] = useState(false)

  const albums = useMemo(() => [...initialAlbums, ...extraAlbums], [initialAlbums, extraAlbums])
  const trimmedQ = q.trim().toLowerCase()
  const isSearching = trimmedQ.length >= 2

  // The "edge" date: oldest for past, newest for future
  const edgeDate = useMemo(() => {
    return albums.reduce<string | null>((edge, a) => {
      if (!a.date || a.date === "Unknown") return edge
      if (!edge) return a.date
      return direction === "past" ? (a.date < edge ? a.date : edge) : (a.date > edge ? a.date : edge)
    }, null)
  }, [albums, direction])

  const fetchMore = useCallback(async (fromDate: string) => {
    setLoading(true)
    try {
      const param = direction === "past" ? `before=${fromDate}` : `after=${fromDate}`
      const res = await fetch(`/api/albums?${param}&limit=500`)
      const { albums: more } = await res.json() as { albums: AlbumListItem[] }
      if (!more || more.length === 0) {
        setExhausted(true)
      } else {
        setExtraAlbums((prev) => [...prev, ...more])
        if (more.length < 500) setExhausted(true)
      }
    } finally {
      setLoading(false)
    }
  }, [direction])

  const loadMore = useCallback(async () => {
    if (loading || exhausted || !edgeDate) return
    fetchMore(edgeDate)
  }, [loading, exhausted, edgeDate, fetchMore])

  // Listen for slider requesting a specific date
  const pendingDateRef = useRef<string | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const targetDate = (e as CustomEvent).detail as string
      const needsLoad = edgeDate && !loading && !exhausted && (
        direction === "past" ? targetDate < edgeDate : targetDate > edgeDate
      )
      if (needsLoad) {
        pendingDateRef.current = targetDate
        fetchMore(edgeDate)
      }
    }
    window.addEventListener("load-until-date", handler)
    return () => window.removeEventListener("load-until-date", handler)
  }, [edgeDate, loading, exhausted, fetchMore, direction])

  // When new albums load and we have a pending date, keep loading or scroll to it
  useEffect(() => {
    const target = pendingDateRef.current
    if (!target || loading) return
    const needsMore = edgeDate && !exhausted && (
      direction === "past" ? target < edgeDate : target > edgeDate
    )
    if (needsMore) {
      fetchMore(edgeDate)
    } else {
      pendingDateRef.current = null
      setTimeout(() => {
        const el = document.getElementById(`date-${target}`)
        const list = document.getElementById("release-list")
        if (el && list) {
          list.scrollTo({ top: el.offsetTop - list.offsetTop, behavior: "instant" })
        }
      }, 50)
    }
  }, [edgeDate, loading, exhausted, fetchMore, direction])

  useEffect(() => {
    const handler = (e: Event) => setQ((e as CustomEvent).detail ?? "")
    window.addEventListener("search-change", handler)
    return () => window.removeEventListener("search-change", handler)
  }, [])

  // Local filter (instant)
  const localFiltered = useMemo(() => {
    if (!isSearching) return null
    return albums.filter(
      (a) =>
        a.artist.toLowerCase().includes(trimmedQ) ||
        a.title.toLowerCase().includes(trimmedQ) ||
        (a.host_name && a.host_name.toLowerCase().includes(trimmedQ)),
    )
  }, [albums, trimmedQ, isSearching])

  // Server-side search with debounce
  useEffect(() => {
    if (!isSearching) {
      setSearchResults(null)
      return
    }
    setSearching(true)
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/albums/search?q=${encodeURIComponent(trimmedQ)}`)
        const { albums: results } = await res.json() as { albums: AlbumListItem[] }
        setSearchResults(results ?? [])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => { clearTimeout(timeout); setSearching(false) }
  }, [trimmedQ, isSearching])

  // Merge local + server results, deduped
  const displayAlbums = useMemo(() => {
    if (!isSearching) return albums
    const localIds = new Set((localFiltered ?? []).map((a) => a.id))
    const extra = (searchResults ?? []).filter((a) => !localIds.has(a.id))
    return [...(localFiltered ?? []), ...extra]
  }, [albums, isSearching, localFiltered, searchResults])

  const grouped = groupByDate(displayAlbums)

  return (
    <>
      {grouped.map(([date, dayAlbums], gi) => {
        const sectionCls = gi === 0 ? "" : "pt-4 sm:pt-6"
        const heading: React.ReactNode = listOnly
          ? null
          : date === "Unknown"
            ? "Unknown date"
            : <DateHeading date={date} includeYear={includeYear} />
        return (
          <section
            key={date}
            id={`date-${date}`}
            className={`${sectionCls} animate-fade-slide-in`}
            style={{ animationDelay: `${Math.min(gi * 50, 300)}ms` }}
          >
            {listOnly ? (
              dayAlbums.map((album) => (
                <ReleaseCard key={album.id} album={album} hideHost showDate />
              ))
            ) : recentDates.has(date) ? (
              <DaySection
                label={heading}
                albums={dayAlbums}
                defaultExpanded={date === expandDate}
              />
            ) : (
              <>
                <div className="ornamental-divider">{heading}</div>
                <AlbumGrid albums={dayAlbums} />
              </>
            )}
          </section>
        )
      })}
      {isSearching && searching && (
        <div className="py-6 flex items-center justify-center text-text-dim">
          <span className="font-display text-xs tracking-[0.1em] animate-pulse">Searching the archives...</span>
        </div>
      )}
      {isSearching && !searching && displayAlbums.length === 0 && (
        <div className="py-8 text-center text-text-dim">
          <span className="text-2xl block mb-2 select-none">♜</span>
          <span className="font-display text-xs tracking-[0.1em]">No releases found</span>
        </div>
      )}
      {!isSearching && hasMore && !exhausted && (
        <LoadTrigger loading={loading} onVisible={loadMore} />
      )}
      <div className="shrink-0" style={{ height: "40vh" }} />
    </>
  )
}
