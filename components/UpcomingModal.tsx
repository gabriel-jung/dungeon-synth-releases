"use client"

import { useEffect, useState } from "react"
import { AlbumListItem } from "@/lib/types"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"
import ModalShell from "./ModalShell"
import ModalHeader from "./ModalHeader"
import ModalCloseButton from "./ModalCloseButton"
import ModalCountSubtitle from "./ModalCountSubtitle"
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
      <ModalHeader
        titleId={titleId}
        title="Upcoming releases"
        subtitle={<ModalCountSubtitle count={albums === null ? null : count} />}
        actions={
          <>
            <ViewToggle view={view} setView={setView} />
            <ModalCloseButton onClick={onClose} />
          </>
        }
      />
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
