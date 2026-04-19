"use client"

import { useEffect, useState } from "react"
import { AlbumListItem, releaseCount } from "@/lib/types"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"
import ModalShell from "./ModalShell"
import ViewToggle, { type ViewMode } from "./ViewToggle"

export default function UpcomingModal({ onClose }: { onClose: () => void }) {
  const titleId = "upcoming-modal-title"
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState<ViewMode>("list")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/upcoming", { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ albums: AlbumListItem[] }>
      })
      .then((d) => setAlbums(d.albums ?? []))
      .catch((err) => { if ((err as Error).name !== "AbortError") setError(true) })
    return () => ctrl.abort()
  }, [reloadKey])

  const count = albums?.length ?? 0

  return (
    <ModalShell titleId={titleId} onClose={onClose}>
      <div className="pl-6 pr-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg text-text-bright font-bold truncate">
            Upcoming releases
          </h2>
          <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">
            {albums === null ? "loading" : releaseCount(count)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ViewToggle view={view} setView={setView} />
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer text-base leading-none"
          >
            <span className="hidden sm:inline">×</span>
            <span className="sm:hidden">←</span>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin" }}>
        {error ? (
          <FetchError onRetry={() => setReloadKey((k) => k + 1)} />
        ) : !albums ? (
          view === "grid" ? <GridSkeleton count={10} /> : <ListSkeleton count={10} />
        ) : albums.length === 0 ? (
          <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
            No upcoming releases
          </div>
        ) : view === "grid" ? (
          <RecentGrid albums={albums} showDate />
        ) : (
          <AlbumGrid albums={albums} showDate />
        )}
      </div>
    </ModalShell>
  )
}
