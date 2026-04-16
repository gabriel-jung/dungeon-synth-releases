"use client"

import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlbumListItem } from "@/lib/types"
import { useModal } from "@/lib/useModal"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"

export type ViewMode = "grid" | "list"

export default function ReleasesModal({
  titleId,
  header,
  fetchUrl,
  expectedCount,
  listHideHost = false,
  listShowDate = false,
  onClose,
  onAlbumsLoaded,
}: {
  titleId: string
  header: (view: ViewMode, setView: (v: ViewMode) => void, onClose: () => void) => ReactNode
  fetchUrl: string
  expectedCount: number
  listHideHost?: boolean
  listShowDate?: boolean
  onClose: () => void
  onAlbumsLoaded?: (albums: AlbumListItem[]) => void
}) {
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  const [view, setView] = useState<ViewMode>(expectedCount > 20 ? "list" : "grid")
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const onAlbumsLoadedRef = useRef(onAlbumsLoaded)
  useLayoutEffect(() => { onAlbumsLoadedRef.current = onAlbumsLoaded })

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
      .then((data) => {
        if (!cancelled) {
          const loaded = data.albums ?? []
          setAlbums(loaded)
          onAlbumsLoadedRef.current?.(loaded)
        }
      })
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
        className="bg-bg max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col animate-modal-in border border-border outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {header(view, setView, onClose)}
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
            <RecentGrid albums={albums} showDate={listShowDate} hideHost={listHideHost} />
          ) : (
            <AlbumGrid albums={albums} hideHost={listHideHost} showDate={listShowDate} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function ViewToggle({ view, setView }: { view: ViewMode; setView: (v: ViewMode) => void }) {
  return (
    <div className="shrink-0 flex border border-border overflow-hidden">
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

