"use client"

import { useEffect, useState } from "react"
import { AlbumListItem, formatDateHeading } from "@/lib/types"
import { useResetOnChange } from "@/lib/useResetOnChange"
import { AlbumGrid } from "./AlbumDetail"
import RecentGrid from "./RecentGrid"
import { GridSkeleton, ListSkeleton, FetchError } from "./ModalSkeletons"
import ModalShell from "./ModalShell"
import ModalHeader from "./ModalHeader"
import ModalCloseButton from "./ModalCloseButton"
import ModalCountSubtitle from "./ModalCountSubtitle"
import ViewToggle, { type ViewMode } from "./ViewToggle"

export default function DayModal({
  date,
  expectedCount,
  onClose,
}: {
  date: string
  expectedCount: number
  onClose: () => void
}) {
  const titleId = `day-modal-title-${date}`
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState<ViewMode>(expectedCount > 20 ? "list" : "grid")
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null)
  const [error, setError] = useState(false)
  useResetOnChange([date, reloadKey], () => { setAlbums(null); setError(false) })

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/albums?date=${date}&limit=500`, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ albums: AlbumListItem[] }>
      })
      .then((d) => { setError(false); setAlbums(d.albums ?? []) })
      .catch((err) => { if ((err as Error).name !== "AbortError") setError(true) })
    return () => ctrl.abort()
  }, [date, reloadKey])

  const count = albums?.length ?? expectedCount

  return (
    <ModalShell titleId={titleId} onClose={onClose}>
      <ModalHeader
        titleId={titleId}
        title={formatDateHeading(date, true)}
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
          view === "grid" ? <GridSkeleton count={expectedCount} /> : <ListSkeleton count={expectedCount} />
        ) : albums.length === 0 ? (
          <div className="py-8 text-center text-text-dim font-display text-xs tracking-wide">
            No releases found
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
