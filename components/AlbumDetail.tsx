"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Album, AlbumListItem, coverUrl, formatDateShort, searchFor } from "@/lib/types"
import { useModal } from "@/lib/useModal"

export function AlbumGrid({
  albums,
  hideHost = false,
  showDate = false,
}: {
  albums: AlbumListItem[]
  hideHost?: boolean
  showDate?: boolean
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
      {albums.map((album, i) => (
        <ReleaseCard key={`${album.id}-${i}`} album={album} hideHost={hideHost} showDate={showDate} />
      ))}
    </div>
  )
}

export function ReleaseCard({
  album,
  hideHost = false,
  showDate = false,
}: {
  album: AlbumListItem
  hideHost?: boolean
  showDate?: boolean
}) {
  const [open, setOpen] = useState(false)
  const showHostInline =
    !hideHost && album.host_name && album.host_name.toLowerCase() !== album.artist.toLowerCase()

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="w-full text-left py-2.5 pl-2 border-l-2 border-transparent hover:bg-bg-hover hover:border-accent transition-colors cursor-pointer group"
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); searchFor(album.artist) }}
          className="font-display text-sm tracking-[0.05em] text-accent group-hover:text-accent-hover transition-colors text-left cursor-pointer"
        >
          {album.artist}
        </button>
        <br />
        <span className="text-text-bright italic text-sm">{album.title}</span>
        {showHostInline && (
          <>
            <span className="text-text-dim"> · </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); searchFor(album.host_name!) }}
              className="text-text-dim hover:text-accent transition-colors text-xs tracking-wide uppercase cursor-pointer"
            >
              {album.host_name}
            </button>
          </>
        )}
        {showDate && album.date && (
          <>
            <span className="text-text-dim"> · </span>
            <span className="text-text-dim text-xs tracking-wide tabular-nums">
              {formatDateShort(album.date, true)}
            </span>
          </>
        )}
      </div>
      {open && <AlbumDetail albumStub={album} onClose={() => setOpen(false)} />}
    </>
  )
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function AlbumDetail({
  albumStub,
  onClose,
}: {
  albumStub: AlbumListItem
  onClose: () => void
}) {
  const [album, setAlbum] = useState<Album | null>(null)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = `album-modal-title-${albumStub.id}`

  useModal(onClose, dialogRef)

  useEffect(() => {
    let cancelled = false
    setError(false)
    fetch(`/api/album?id=${albumStub.id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => { if (!cancelled) setAlbum(data) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [albumStub.id, reloadKey])

  const img = album ? coverUrl(album.art_id) : null
  const showHost = album?.host_name && album.host_name.toLowerCase() !== albumStub.artist.toLowerCase()

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
        className="relative bg-bg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto animate-modal-in flex flex-col sm:flex-row border border-border outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover — left side on desktop, top on mobile */}
        <div className="sm:w-72 shrink-0 bg-bg-card flex items-center justify-center">
          {img ? (
            <img
              src={img}
              alt={`${albumStub.artist} — ${albumStub.title}`}
              className="w-full h-auto"
            />
          ) : album ? (
            <div className="py-16 sm:py-0 sm:w-full sm:aspect-square flex items-center justify-center">
              <span className="text-5xl text-border select-none">♜</span>
            </div>
          ) : (
            <div className="w-full aspect-square bg-bg-hover flex items-center justify-center">
              <span className="text-3xl text-border select-none animate-pulse">♜</span>
            </div>
          )}
        </div>

        {/* Info — right side on desktop, below on mobile */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-3 sm:border-l border-t sm:border-t-0 border-border">
          <div>
            <h2 id={titleId} className="font-display text-lg text-text-bright font-bold leading-tight">
              {albumStub.title}
            </h2>
            <button
              onClick={() => { onClose(); searchFor(albumStub.artist) }}
              className="font-display text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer text-left tracking-wide mt-0.5"
            >
              {albumStub.artist}
            </button>
          </div>

          {error ? (
            <div className="py-8 flex flex-col items-center gap-2 text-text-dim font-display text-xs tracking-wide">
              <span>Failed to load album</span>
              <button
                onClick={() => setReloadKey((k) => k + 1)}
                className="text-accent hover:text-accent-hover transition-colors cursor-pointer uppercase tracking-[0.2em] text-[10px]"
              >
                Retry
              </button>
            </div>
          ) : album ? (
            <>
              <div className="modal-rule" />
              <div className="flex items-center gap-2 text-xs text-text-dim font-display tracking-wide">
                {album.date && <span>{formatDateShort(album.date, true)}</span>}
                {album.num_tracks > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span>
                      {album.num_tracks} tracks{album.duration_sec > 0 && ` · ${formatDuration(album.duration_sec)}`}
                    </span>
                  </>
                )}
              </div>

              {album.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {album.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] tracking-wide uppercase px-2 py-0.5 text-text-dim border-b border-border/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="modal-rule mt-auto" />
              <div className="flex items-center justify-between">
                {showHost && (
                  <button
                    onClick={() => { onClose(); searchFor(album.host_name!) }}
                    className="text-text-dim text-xs hover:text-accent transition-colors cursor-pointer text-left italic"
                  >
                    on {album.host_name}
                  </button>
                )}
                <a
                  href={album.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display text-xs tracking-[0.1em] text-accent hover:text-accent-hover transition-colors ml-auto"
                >
                  Bandcamp →
                </a>
              </div>
            </>
          ) : (
            <div className="py-8 flex flex-col items-center gap-2">
              <span className="text-text-dim text-sm italic font-display tracking-wide">Retrieving...</span>
            </div>
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
