"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlbumListItem, isHostedRelease } from "@/lib/types"
import { useOpenModal } from "@/lib/useModalUrl"
import { SEARCH_PALETTE_EVENT } from "./searchPaletteEvent"

type SearchResponse = { albums: AlbumListItem[] }

// Archive-wide command palette. ⌘K / Ctrl-K / `/` opens; Esc closes.
// Pick = push modal URL param (?album=<id>), close palette. No ?q= in URL.
export default function SearchPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<AlbumListItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const openRef = useRef(open)
  openRef.current = open
  const openModal = useOpenModal()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const isTyping = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
      const slash = e.key === "/" && !isTyping
      if (cmdK || slash) {
        e.preventDefault()
        setOpen((v) => !v)
      } else if (e.key === "Escape" && openRef.current) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  useEffect(() => {
    // Let any external trigger open the palette without keyboard-coupling.
    const onOpen = () => setOpen(true)
    window.addEventListener(SEARCH_PALETTE_EVENT, onOpen)
    return () => window.removeEventListener(SEARCH_PALETTE_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (open) {
      setActiveIdx(0)
      // Microtask so portal has mounted before focus call.
      queueMicrotask(() => inputRef.current?.focus())
    } else {
      setQuery("")
      setResults(null)
    }
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
        setActiveIdx(0)
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

  const pickAlbum = useCallback(
    (a: AlbumListItem) => {
      setOpen(false)
      openModal("album", a.id)
    },
    [openModal],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % results.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const picked = results[activeIdx]
      if (picked) pickAlbum(picked)
    }
  }

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-start justify-center pt-[10vh] sm:pt-[14vh] animate-backdrop-in backdrop-blur-xs bg-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Search archive"
    >
      <div
        className="bg-bg-card border border-border w-[min(32rem,calc(100vw-1.5rem))] max-h-[70vh] flex flex-col animate-modal-in shadow-[0_0_80px_-10px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span aria-hidden="true" className="font-display text-text-dim select-none">⌕</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search the archive…"
            aria-label="Search archive"
            className="flex-1 min-w-0 bg-transparent py-1 text-base text-text placeholder:text-text-dim focus:outline-none font-sans"
          />
          <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 border border-border/60 text-[10px] font-display tracking-wide text-text-dim select-none">
            Esc
          </kbd>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {query.trim().length < 2 ? (
            <div className="px-4 py-3 font-display text-xs tracking-[0.1em] text-text-dim italic">
              Type 2+ characters to search releases and artists.
            </div>
          ) : loading && !results ? (
            <div className="px-4 py-3 font-display text-xs tracking-[0.1em] text-text-dim animate-pulse">
              Searching…
            </div>
          ) : results && results.length === 0 ? (
            <div className="px-4 py-3 font-display text-xs tracking-[0.1em] text-text-dim">
              No matches
            </div>
          ) : results ? (
            <ul role="listbox" aria-label="Search results">
              {results.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => pickAlbum(a)}
                    className={`w-full px-3 py-1.5 text-left cursor-pointer transition-colors ${
                      i === activeIdx ? "bg-bg-hover" : "hover:bg-bg-hover"
                    }`}
                  >
                    <div className="truncate font-sans text-sm text-text-bright italic">
                      {a.title}
                    </div>
                    <div className="truncate font-display text-[10px] tracking-[0.1em] uppercase text-text-dim">
                      {a.artist}
                      {isHostedRelease(a) && <span className="text-text-dim/60"> · {a.host_name}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
