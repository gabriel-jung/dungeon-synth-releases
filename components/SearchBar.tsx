"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { AlbumListItem, isHostedRelease, searchFor } from "@/lib/types"
import AlbumDetail from "./AlbumDetail"

// Add new facet param keys here as they ship (themes, locations…) so
// Clear-All clears them in one sweep.
const FILTER_PARAM_KEYS = ["q", "tag", "xtag"] as const

type SearchResponse = { albums: AlbumListItem[] }

export default function SearchBar() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const onGenres = pathname?.startsWith("/genres") ?? false
  const hasActiveFilter = FILTER_PARAM_KEYS.some((k) => searchParams.has(k))

  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const [results, setResults] = useState<AlbumListItem[] | null>(null)
  const [open, setOpen] = useState(false)
  const [albumOpen, setAlbumOpen] = useState<AlbumListItem | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync input when ?q= changes from elsewhere (artist-name click, etc).
  // The dispatched event is the sync channel because peer components that
  // listen only read initial q from searchParams, not live.
  useEffect(() => {
    const handler = (e: Event) => setQuery((e as CustomEvent).detail ?? "")
    window.addEventListener("search-change", handler)
    return () => window.removeEventListener("search-change", handler)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  // Debounced search. /genres skips dropdown — ?q= drives node highlighting.
  useEffect(() => {
    if (onGenres) return
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      return
    }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        if (!res.ok) return
        const data = (await res.json()) as SearchResponse
        setResults(data.albums)
      } catch (err) {
        if ((err as Error).name !== "AbortError") throw err
      }
    }, 200)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, onGenres])

  // Clear any pending /genres-path debounce on unmount.
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  const resetLocal = useCallback(() => {
    setQuery("")
    setResults(null)
    setOpen(false)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)
    setOpen(true)
    // On /genres, keep ?q= live for node highlighting. Elsewhere, defer
    // commit to Enter so the main list doesn't reflow on every keystroke.
    if (onGenres) {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => searchFor(value), 150)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    searchFor(query)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false)
      inputRef.current?.blur()
    }
  }

  function clear() {
    resetLocal()
    searchFor("")
  }

  function clearAllFilters() {
    resetLocal()
    const params = new URLSearchParams(searchParams.toString())
    for (const k of FILTER_PARAM_KEYS) params.delete(k)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
    // Peer q-listeners (ReleaseList, GenreMap) only sync via this event —
    // they don't re-read ?q= from searchParams.
    window.dispatchEvent(new CustomEvent("search-change", { detail: "" }))
  }

  function pickAlbum(a: AlbumListItem) {
    setAlbumOpen(a)
    setOpen(false)
  }

  const trimmed = query.trim()
  const showDropdown = !onGenres && open
  const showHint = showDropdown && trimmed.length < 2
  const loading = !onGenres && trimmed.length >= 2 && results === null

  return (
    <div ref={rootRef} className="relative w-full sm:w-56">
      <form onSubmit={handleSubmit} className="flex items-center">
        <span aria-hidden="true" className="font-display text-text-dim text-xs tracking-wide mr-2 hidden sm:inline select-none">⌕</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={onGenres ? "Search genres..." : "Search archive…"}
          aria-label={onGenres ? "Search genres" : "Search the archive — all releases, artists, and labels across all years"}
          className="flex-1 min-w-0 bg-transparent border-b border-border px-1 py-1.5 text-base sm:text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent transition-colors font-sans"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="ml-1 w-6 h-6 flex items-center justify-center text-text-dim hover:text-text transition-colors cursor-pointer text-sm shrink-0"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </form>
      {hasActiveFilter && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={clearAllFilters}
            className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim hover:text-accent transition-colors cursor-pointer"
          >
            clear all filters
          </button>
        </div>
      )}

      {showDropdown && (
        <div
          role="menu"
          aria-label="Archive search results"
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-bg-card border border-border shadow-lg max-h-[70vh] overflow-y-auto"
        >
          {showHint && (
            <div className="px-4 py-3 text-text-dim font-display text-xs tracking-[0.1em] italic">
              Type 2+ characters to search the archive.
            </div>
          )}
          {!showHint && loading && !results && (
            <div className="px-4 py-3 text-text-dim font-display text-xs tracking-[0.1em] animate-pulse">
              Searching…
            </div>
          )}
          {!showHint && results && results.length === 0 && !loading && (
            <div className="px-4 py-3 text-text-dim font-display text-xs tracking-[0.1em]">
              No matches
            </div>
          )}
          {!showHint && results && results.length > 0 && (
            <div className="py-1">
              {results.map((a) => (
                <AlbumItem key={a.id} album={a} onClick={() => pickAlbum(a)} />
              ))}
            </div>
          )}
        </div>
      )}

      {albumOpen && (
        <AlbumDetail albumStub={albumOpen} onClose={() => setAlbumOpen(null)} />
      )}
    </div>
  )
}

function AlbumItem({ album, onClick }: { album: AlbumListItem; onClick: () => void }) {
  const showHost = isHostedRelease(album)
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full px-3 py-1.5 hover:bg-bg-hover text-left cursor-pointer"
    >
      <div className="truncate font-sans text-sm text-text-bright italic">{album.title}</div>
      <div className="truncate font-display text-[10px] tracking-[0.1em] uppercase text-text-dim">
        {album.artist}
        {showHost && <span className="text-border"> · {album.host_name}</span>}
      </div>
    </button>
  )
}
