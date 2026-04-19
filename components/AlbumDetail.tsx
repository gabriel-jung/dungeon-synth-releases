"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Album, AlbumListItem, coverUrl, formatDateShort } from "@/lib/types"
import { useModal } from "@/lib/useModal"
import { useAlbumCardModals } from "@/lib/useAlbumCardModals"
import { SITE_URL } from "@/lib/site"

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
      {albums.map((album) => (
        <ReleaseCard key={album.id} album={album} hideHost={hideHost} showDate={showDate} />
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
  const { showHostInline, onArtistClick, openHost, push } = useAlbumCardModals(album, { hideHost })
  const openAlbum = (e?: React.SyntheticEvent) => { e?.stopPropagation(); push("album", album.id) }

  // Card-level click opens the album. Nested buttons stop propagation so
  // artist/host/date don't trigger the album modal.
  return (
    <article
      onClick={openAlbum}
      role="button"
      tabIndex={0}
      aria-label={`Open ${album.artist} — ${album.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openAlbum(e) }
      }}
      className="py-2.5 pl-2 border-l-2 border-transparent hover:bg-bg-hover hover:border-accent transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onArtistClick() }}
        className="text-[0.95rem] text-accent hover:text-accent-hover hover:underline decoration-dotted underline-offset-2 transition-colors text-left cursor-pointer"
      >
        {album.artist}
      </button>
      <div>
        <span className="text-text-bright italic text-sm">{album.title}</span>
        {showHostInline && (
          <>
            <span className="text-text-dim"> · </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openHost() }}
              className="text-text-dim hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors text-xs tracking-wide uppercase cursor-pointer"
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
    </article>
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
  initialAlbum = null,
  onClose,
}: {
  albumStub: AlbumListItem
  initialAlbum?: Album | null
  onClose: () => void
}) {
  const [album, setAlbum] = useState<Album | null>(initialAlbum)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasInitialRef = useRef(initialAlbum?.id === albumStub.id)
  const { onArtistClick, openHost, push } = useAlbumCardModals(albumStub)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = `album-modal-title-${albumStub.id}`

  useModal(onClose, dialogRef)

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    // Caller already handed us the full album — skip the initial fetch.
    // Subsequent retries (reloadKey > 0) always refetch.
    if (hasInitialRef.current && reloadKey === 0) {
      hasInitialRef.current = false
      return
    }
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

  async function handleShare() {
    const url = `${SITE_URL}/?album=${albumStub.id}`
    const title = `${albumStub.artist} — ${albumStub.title}`
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }) } catch {}
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  // Prefer stub for fields the card already has so the modal paints without
  // waiting for the server round-trip. Album-only fields (tags, num_tracks,
  // duration) stream in when the fetch resolves.
  const artId = album?.art_id ?? albumStub.art_id ?? null
  const img = coverUrl(artId)
  const hostName = album?.host_name ?? albumStub.host_name ?? null
  const bandcampUrl = album?.url ?? albumStub.url
  const releaseDate = album?.date ?? albumStub.date
  const showHost = hostName && hostName.toLowerCase() !== albumStub.artist.toLowerCase()

  const portal = createPortal(
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
        className="relative bg-bg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto sm:overflow-visible animate-modal-in flex flex-col sm:flex-row border border-border outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(0,0,0,0.8), 0 0 20px -5px color-mix(in srgb, var(--color-accent) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover — left side on desktop, top on mobile */}
        <div className="sm:w-72 shrink-0 bg-bg-card flex items-center justify-center">
          {img ? (
            <img
              src={img}
              alt={`${albumStub.artist} — ${albumStub.title}`}
              decoding="async"
              className="w-full h-auto"
            />
          ) : (
            <div className="py-16 sm:py-0 sm:w-full sm:aspect-square flex items-center justify-center">
              <span aria-hidden="true" className="text-5xl text-border select-none">♜</span>
            </div>
          )}
        </div>

        {/* Info — right side on desktop, below on mobile */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-3 sm:border-l border-t sm:border-t-0 border-border sm:max-h-72 sm:overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div>
            <h2 id={titleId} className="text-xl text-text-bright font-bold leading-tight">
              {albumStub.title}
            </h2>
            <button
              onClick={onArtistClick}
              className="text-base text-accent hover:text-accent-hover hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left mt-0.5"
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
          ) : (
            <>
              <div className="modal-rule" />
              <div className="flex items-center gap-2 text-xs text-text-dim font-display tracking-wide">
                {releaseDate && <span>{formatDateShort(releaseDate, true)}</span>}
                {album && album.num_tracks > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <span>
                      {album.num_tracks} tracks{album.duration_sec > 0 && ` · ${formatDuration(album.duration_sec)}`}
                    </span>
                  </>
                )}
              </div>

              {album && album.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {album.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => push("genre", tag)}
                      className="text-[10px] tracking-wide uppercase px-2 py-0.5 text-text-dim border-b border-border/60 hover:text-accent hover:border-accent/60 transition-colors cursor-pointer"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}

              <div className="modal-rule mt-auto" />
              <div className="flex items-center justify-between gap-4">
                {showHost && (
                  <button
                    onClick={openHost}
                    className="text-text-dim text-xs hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left italic"
                  >
                    on {hostName}
                  </button>
                )}
                <div className="flex items-center gap-4 ml-auto">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="font-display text-xs tracking-[0.1em] text-text-dim hover:text-accent transition-colors cursor-pointer"
                  >
                    {copied ? "Copied ✓" : "Share"}
                  </button>
                  <a
                    href={bandcampUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-display text-xs tracking-[0.1em] text-accent hover:text-accent-hover transition-colors"
                  >
                    Bandcamp →
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright bg-bg/80 border border-border/50 transition-colors cursor-pointer text-base leading-none"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )

  return portal
}
