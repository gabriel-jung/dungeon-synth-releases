"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AlbumListItem, parseWeekKey, tagFilterQs, weekKeyOf } from "@/lib/types"
import DaySection from "./DaySection"
import DateHeading from "./DateHeading"

// Move a week key forward or backward by N weeks. Null on parse failure.
function shiftWeek(weekKey: string, delta: number): string | null {
  const range = parseWeekKey(weekKey)
  if (!range) return null
  const d = new Date(range.start + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + delta * 7)
  return weekKeyOf(d.toISOString().slice(0, 10))
}

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
  expandDate,
  hasMore = false,
  includeYear = false,
  lowerBound,
  upperBound,
}: {
  albums: AlbumListItem[]
  expandDate: string | null
  hasMore?: boolean
  includeYear?: boolean
  // Year-scoped pages pass these so scroll stops at year boundary instead
  // of spilling into the previous/next year.
  lowerBound?: string
  upperBound?: string
}) {
  const searchParams = useSearchParams()
  const [extraAlbums, setExtraAlbums] = useState<AlbumListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  // Weeks already fetched — includes the weeks covered by the SSR initial
  // rows so the infinite-scroll loader doesn't re-request them. Reset below
  // whenever the filter or initial rows change.
  const loadedWeeksRef = useRef<Set<string>>(new Set())
  // Mirror of every album id currently in state, kept in lockstep with
  // setExtraAlbums so we can drop dupes without rebuilding a Set per fetch.
  const loadedIdsRef = useRef<Set<string>>(new Set())

  const albums = useMemo(() => [...initialAlbums, ...extraAlbums], [initialAlbums, extraAlbums])

  // The "edge" date: oldest date in the loaded set (we always scroll toward
  // the past after the initial today-first window).
  const edgeDate = useMemo(() => {
    return albums.reduce<string | null>((edge, a) => {
      if (!a.date || a.date === "Unknown") return edge
      if (!edge) return a.date
      return a.date < edge ? a.date : edge
    }, null)
  }, [albums])

  const tagQs = useMemo(() => tagFilterQs(searchParams), [searchParams])

  // Initial loaded-weeks set, derived from the SSR rows. Memoised so a parent
  // re-render that recreates `initialAlbums` doesn't force a re-walk.
  const initialLoadedWeeks = useMemo(() => {
    const s = new Set<string>()
    for (const a of initialAlbums) {
      if (a.date && a.date !== "Unknown") s.add(weekKeyOf(a.date))
    }
    return s
  }, [initialAlbums])
  const initialIds = useMemo(() => new Set(initialAlbums.map((a) => a.id)), [initialAlbums])

  // Stale extras would bleed across filter changes.
  useEffect(() => {
    setExtraAlbums([])
    setExhausted(false)
    loadedWeeksRef.current = new Set(initialLoadedWeeks)
    loadedIdsRef.current = new Set(initialIds)
  }, [tagQs, initialLoadedWeeks, initialIds])

  // Fetch a single ISO week bucket. Weeks are cache-stable; client never
  // requests arbitrary date ranges — slider drags and scroll both resolve
  // to bucket keys so CDN hits are bounded.
  const fetchWeek = useCallback(async (weekKey: string): Promise<number> => {
    if (loadedWeeksRef.current.has(weekKey)) return 0
    loadedWeeksRef.current.add(weekKey)
    const extra = tagQs ? `&${tagQs}` : ""
    const clamps =
      (lowerBound ? `&clamp_start=${lowerBound}` : "") +
      (upperBound ? `&clamp_end=${upperBound}` : "")
    const res = await fetch(`/api/albums?week=${weekKey}&limit=500${extra}${clamps}`)
    const { albums: more } = await res.json() as { albums: AlbumListItem[] }
    if (more && more.length > 0) {
      const fresh: AlbumListItem[] = []
      for (const a of more) {
        if (loadedIdsRef.current.has(a.id)) continue
        loadedIdsRef.current.add(a.id)
        fresh.push(a)
      }
      if (fresh.length > 0) setExtraAlbums((prev) => [...prev, ...fresh])
    }
    return more?.length ?? 0
  }, [tagQs, lowerBound, upperBound])

  // Advance one week beyond the edge date (older for past, newer for future)
  // and stop when a boundary is reached or many empty weeks pile up.
  const EMPTY_WEEK_CAP = 8
  const loadMore = useCallback(async () => {
    if (loading || exhausted || !edgeDate) return
    setLoading(true)
    try {
      let cursorWeek = shiftWeek(weekKeyOf(edgeDate), -1)
      let consecutiveEmpty = 0
      for (let i = 0; i < EMPTY_WEEK_CAP; i++) {
        if (!cursorWeek) break
        const range = parseWeekKey(cursorWeek)
        if (!range) break
        if (lowerBound && range.end < lowerBound) { setExhausted(true); break }
        if (upperBound && range.start > upperBound) { setExhausted(true); break }
        const n = await fetchWeek(cursorWeek)
        if (n > 0) return
        consecutiveEmpty++
        if (consecutiveEmpty >= EMPTY_WEEK_CAP) { setExhausted(true); break }
        cursorWeek = shiftWeek(cursorWeek, -1)
      }
    } finally {
      setLoading(false)
    }
  }, [loading, exhausted, edgeDate, fetchWeek, lowerBound, upperBound])

  // Slider click / key = navigate to a date. Fetch the target week plus ±1
  // neighbour so the user always lands on a populated section.
  useEffect(() => {
    const handler = async (e: Event) => {
      const targetDate = (e as CustomEvent).detail as string
      if (!targetDate) return
      const targetWeek = weekKeyOf(targetDate)
      setLoading(true)
      try {
        await Promise.all([
          fetchWeek(targetWeek),
          shiftWeek(targetWeek, -1) ? fetchWeek(shiftWeek(targetWeek, -1)!) : Promise.resolve(0),
          shiftWeek(targetWeek, 1) ? fetchWeek(shiftWeek(targetWeek, 1)!) : Promise.resolve(0),
        ])
      } finally {
        setLoading(false)
      }
      setTimeout(() => {
        const el = document.getElementById(`date-${targetDate}`)
        const list = document.getElementById("release-list")
        if (el && list) list.scrollTo({ top: el.offsetTop - list.offsetTop, behavior: "instant" })
      }, 50)
    }
    window.addEventListener("load-until-date", handler)
    return () => window.removeEventListener("load-until-date", handler)
  }, [fetchWeek])

  const grouped = groupByDate(albums)

  return (
    <>
      {grouped.map(([date, dayAlbums], gi) => {
        const sectionCls = gi === 0 ? "" : "pt-4 sm:pt-6"
        const heading: React.ReactNode =
          date === "Unknown"
            ? "Unknown date"
            : <DateHeading date={date} includeYear={includeYear} />
        return (
          <section
            key={date}
            id={`date-${date}`}
            className={`${sectionCls} animate-fade-slide-in`}
            style={{ animationDelay: `${Math.min(gi * 50, 300)}ms` }}
          >
            <DaySection
              label={heading}
              albums={dayAlbums}
              defaultExpanded={date === expandDate}
            />
          </section>
        )
      })}
      {!loading && albums.length === 0 && (
        <div className="py-8 text-center text-text-dim">
          <span aria-hidden="true" className="text-2xl block mb-2 select-none">♜</span>
          <span className="font-display text-xs tracking-[0.1em]">
            {tagQs ? "No releases match this filter" : "No releases found"}
          </span>
        </div>
      )}
      {hasMore && !exhausted && (
        <LoadTrigger loading={loading} onVisible={loadMore} />
      )}
      <div className="shrink-0" style={{ height: "40vh" }} />
    </>
  )
}
