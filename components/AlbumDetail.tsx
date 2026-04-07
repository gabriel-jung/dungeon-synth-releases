"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Album, AlbumListItem, coverUrl, searchFor } from "@/lib/types"

export function AlbumGrid({ albums }: { albums: AlbumListItem[] }) {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3" style={{ columnGap: "1rem" }}>
      {albums.map((album, i) => (
        <div key={`${album.id}-${i}`} style={{ breakInside: "avoid" }}>
          <ReleaseCard album={album} />
        </div>
      ))}
    </div>
  )
}

export function ReleaseCard({ album }: { album: AlbumListItem }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2.5 hover:bg-bg-hover transition-colors cursor-pointer border-l-2 border-transparent hover:border-accent group"
      >
        <span
          role="link"
          onClick={(e) => { e.stopPropagation(); searchFor(album.artist) }}
          className="font-display text-[0.8rem] tracking-[0.04em] text-accent group-hover:text-accent-hover transition-colors"
        >
          {album.artist}
        </span>
        <br />
        <span className="text-text-bright italic text-[0.9rem]">{album.title}</span>
        {album.host_name && album.host_name.toLowerCase() !== album.artist.toLowerCase() && (
          <>
            <span className="text-text-dim"> · </span>
            <span
              role="link"
              onClick={(e) => { e.stopPropagation(); searchFor(album.host_name!) }}
              className="text-text-dim hover:text-accent transition-colors text-[0.7rem] tracking-wide uppercase"
            >
              {album.host_name}
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

  useEffect(() => {
    fetch(`/api/album?id=${albumStub.id}`)
      .then((r) => r.json())
      .then((data) => setAlbum(data))
  }, [albumStub.id])

  const img = album ? coverUrl(album.art_id) : null
  const showHost = album?.host_name && album.host_name.toLowerCase() !== albumStub.artist.toLowerCase()

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 10000, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="relative bg-bg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto animate-modal-in flex flex-col sm:flex-row"
        style={{ boxShadow: "0 0 60px -10px rgba(0,0,0,0.7)" }}
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
            <div className="w-full aspect-square animate-pulse bg-bg-hover" />
          )}
        </div>

        {/* Info — right side on desktop, below on mobile */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-3 sm:border-l border-t sm:border-t-0 border-border">
          <div>
            <h2 className="font-display text-lg text-text-bright font-bold leading-tight">
              {albumStub.title}
            </h2>
            <button
              onClick={() => { onClose(); searchFor(albumStub.artist) }}
              className="font-display text-sm text-accent hover:text-accent-hover transition-colors cursor-pointer text-left tracking-wide mt-0.5"
            >
              {albumStub.artist}
            </button>
          </div>

          {album ? (
            <>
              <div className="flex items-center gap-2 text-xs text-text-dim font-display tracking-wide">
                {album.date && (
                  <span>
                    {new Date(album.date + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
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

              <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
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
                  className="font-display text-xs tracking-wide text-accent hover:text-accent-hover transition-colors ml-auto"
                >
                  Bandcamp →
                </a>
              </div>
            </>
          ) : (
            <div className="py-4">
              <span className="text-text-dim text-sm italic">Loading...</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright bg-bg/70 transition-colors cursor-pointer text-lg rounded-full"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )
}
