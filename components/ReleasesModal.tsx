"use client"

import { ReactNode, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlbumListItem } from "@/lib/types"
import { useModal } from "@/lib/useModal"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"

export type ViewMode = "grid" | "list"

export default function ReleasesModal({
  titleId,
  header,
  fetchUrl,
  expectedCount,
  listHideHost = false,
  listShowDate = false,
  onClose,
}: {
  titleId: string
  header: (view: ViewMode, setView: (v: ViewMode) => void) => ReactNode
  fetchUrl: string
  expectedCount: number
  listHideHost?: boolean
  listShowDate?: boolean
  onClose: () => void
}) {
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  const [view, setView] = useState<ViewMode>(expectedCount > 20 ? "list" : "grid")
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)

  useModal(onClose, dialogRef)

  useEffect(() => {
    let cancelled = false
    setError(false)
    setAlbums(null)
    fetch(fetchUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => { if (!cancelled) setAlbums(data.albums ?? []) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [fetchUrl, reloadKey])

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center animate-backdrop-in backdrop-blur-xs"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative bg-bg max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col animate-modal-in border border-border outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {header(view, setView)}
        <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin" }}>
          {error ? (
            <FetchError onRetry={() => setReloadKey((k) => k + 1)} />
          ) : !albums ? (
            view === "grid" ? <GridSkeleton count={expectedCount} /> : <ListSkeleton count={expectedCount} />
          ) : albums.length === 0 ? (
            <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
              No releases found
            </div>
          ) : view === "grid" ? (
            <RecentGrid albums={albums} showDate={listShowDate} />
          ) : (
            <AlbumGrid albums={albums} hideHost={listHideHost} showDate={listShowDate} />
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright bg-bg/80 border border-border/50 transition-colors cursor-pointer text-lg"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )
}

export function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="shrink-0 flex border border-border overflow-hidden mt-1">
      <button
        onClick={() => setView("grid")}
        aria-label="Grid view"
        className={`px-2 py-1 text-xs transition-colors cursor-pointer ${
          view === "grid" ? "bg-accent/20 text-text-bright" : "text-text-dim hover:text-text"
        }`}
      >
        ▦
      </button>
      <button
        onClick={() => setView("list")}
        aria-label="List view"
        className={`px-2 py-1 text-xs transition-colors cursor-pointer border-l border-border ${
          view === "list" ? "bg-accent/20 text-text-bright" : "text-text-dim hover:text-text"
        }`}
      >
        ☰
      </button>
    </div>
  )
}

function GridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="aspect-square bg-bg-card border border-border" />
          <div className="h-3 bg-bg-card w-3/4" />
          <div className="h-2.5 bg-bg-card w-1/2" />
        </div>
      ))}
    </div>
  )
}

function ListSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="py-2.5 pl-2 border-l-2 border-transparent">
          <div className="h-3 bg-bg-card w-1/2 mb-1.5" />
          <div className="h-3 bg-bg-card w-3/4" />
        </div>
      ))}
    </div>
  )
}

function FetchError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-8 flex flex-col items-center gap-2 text-text-dim font-display text-xs tracking-wide">
      <span>Failed to load releases</span>
      <button
        onClick={onRetry}
        className="text-accent hover:text-accent-hover transition-colors cursor-pointer uppercase tracking-[0.2em] text-[10px]"
      >
        Retry
      </button>
    </div>
  )
}
