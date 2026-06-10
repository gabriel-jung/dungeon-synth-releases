"use client"

import { useEffect, useRef, useState } from "react"
import { AlbumListItem, formatDateShort, isHostedRelease } from "@/lib/types"
import { useOpenModal } from "@/lib/useModalUrl"
import { cacheAlbumStub } from "@/lib/albumCache"

type SearchResponse = { albums: AlbumListItem[] }

// Search box for the /list builder. Each result shows full info (title, artist,
// host, date), opens the detail modal on click, and has a separate + to add it
// to the list. Reuses /api/search and mirrors SearchPalette's chrome.
export default function ListSearchAdd({
  onPick,
  addedIds,
}: {
  onPick: (a: AlbumListItem) => void
  addedIds: Set<string>
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AlbumListItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const openModal = useOpenModal()

  // Close on a click that is neither in the search nor in an open modal. This
  // keeps results visible while a detail modal (opened from a result) is up, so
  // closing that modal returns the user to their search instead of a blank box.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (rootRef.current?.contains(t)) return
      if (t.closest('[role="dialog"]')) return
      setOpen(false)
    }
    window.addEventListener("pointerdown", onDown)
    return () => window.removeEventListener("pointerdown", onDown)
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (!res.ok) return
        const data = (await res.json()) as SearchResponse
        setResults(data.albums ?? [])
      } catch (err) {
        if ((err as Error).name !== "AbortError") throw err
      } finally {
        setLoading(false)
      }
    }, 180)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query])

  const openInfo = (a: AlbumListItem) => {
    cacheAlbumStub(a) // paint the modal header instantly from known data
    openModal("album", a.id) // search stays open behind the modal
  }

  const showResults = open && query.trim().length >= 2

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-bg-card border border-border transition-colors focus-within:border-accent/60">
        <span aria-hidden="true" className="font-display text-text-dim select-none">⌕</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Search releases to add…"
          aria-label="Search releases to add to the list"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 min-w-0 bg-transparent py-0.5 text-sm text-text placeholder:text-text-dim focus:outline-none font-sans"
        />
      </div>

      {showResults && (
        <div
          className="absolute z-20 mt-1 w-full max-h-[60vh] overflow-y-auto bg-bg-card border border-border shadow-[0_0_60px_-10px_rgba(0,0,0,0.8)]"
          style={{ scrollbarWidth: "thin", overscrollBehavior: "contain" }}
        >
          {loading && !results ? (
            <div className="px-4 py-3 font-display text-xs tracking-[0.1em] text-text-dim animate-pulse">Searching…</div>
          ) : results && results.length === 0 ? (
            <div className="px-4 py-3 font-display text-xs tracking-[0.1em] text-text-dim">(no entries) ✧</div>
          ) : results ? (
            <ul>
              {results.map((a) => {
                const added = addedIds.has(a.id)
                return (
                  <li key={a.id} className="flex items-stretch border-b border-border/40 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => openInfo(a)}
                      className="flex-1 min-w-0 px-3 py-2 text-left flex flex-col gap-0.5 transition-colors hover:bg-bg-hover cursor-pointer"
                      title="Open details"
                    >
                      <span className="truncate font-sans text-sm text-text-bright italic">{a.title}</span>
                      <span className="truncate font-display text-[10px] tracking-[0.1em] uppercase text-text-dim">
                        {a.artist}
                        {isHostedRelease(a) && <span className="text-text-dim/60"> · {a.host_name}</span>}
                      </span>
                      {a.date && (
                        <span className="font-display text-[10px] tracking-wide tabular-nums text-text-dim/70">
                          {formatDateShort(a.date, true)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() => onPick(a)}
                      aria-label={added ? `${a.title} already added` : `Add ${a.title} to the list`}
                      className={`shrink-0 w-11 flex items-center justify-center border-l border-border/40 text-lg leading-none transition-colors ${
                        added
                          ? "text-accent/70 cursor-default"
                          : "text-text-dim hover:text-accent hover:bg-bg-hover cursor-pointer"
                      }`}
                    >
                      {added ? "✓" : "+"}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  )
}
