"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Album, AlbumListItem, coverUrl, searchFor } from "@/lib/types"

export function AlbumGrid({ albums }: { albums: AlbumListItem[] }) {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3" style={{ columnGap: "1rem" }}>
      {albums.map((album) => (
        <div key={album.id} style={{ breakInside: "avoid" }}>
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
        className="w-full text-left px-3 py-2 hover:bg-bg-hover transition-colors cursor-pointer border-l-2 border-transparent hover:border-accent"
      >
        <span
          role="link"
          onClick={(e) => { e.stopPropagation(); searchFor(album.artist) }}
          className="text-accent hover:text-accent-hover transition-colors"
        >
          {album.artist}
        </span>
        <span className="text-text-dim"> — </span>
        <span className="text-text-bright">{album.title}</span>
        {album.host_name && album.host_name.toLowerCase() !== album.artist.toLowerCase() && (
          <>
            <span className="text-text-dim"> · </span>
            <span
              role="link"
              onClick={(e) => { e.stopPropagation(); searchFor(album.host_name!) }}
              className="text-text-dim hover:text-accent transition-colors text-xs"
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
      style={{ zIndex: 10000 }}
      onClick={onClose}
    >
      <div
        className="relative bg-bg-card border-[3px] border-double border-border rounded-sm max-w-lg w-full mx-4 flex flex-col sm:flex-row overflow-hidden max-h-[90vh] overflow-y-auto animate-modal-in"
        style={{ boxShadow: "inset 0 0 30px -10px color-mix(in srgb, var(--color-accent) 10%, transparent), 0 25px 50px -12px rgba(0,0,0,0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cover */}
        <div className="sm:w-48 shrink-0 bg-bg flex items-center justify-center aspect-square sm:aspect-auto sm:min-h-48">
          {img ? (
            <img
              src={img}
              alt={`${albumStub.artist} — ${albumStub.title}`}
              className="w-full h-auto"
            />
          ) : album ? (
            <span className="text-5xl text-border select-none">♜</span>
          ) : (
            <div className="w-full h-full animate-pulse bg-bg-hover" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 p-5 flex flex-col gap-3 min-w-0">
          <div>
            <h2 className="font-display text-text-bright font-bold truncate">
              {albumStub.title}
            </h2>
            <button
              onClick={() => { onClose(); searchFor(albumStub.artist) }}
              className="text-accent text-sm hover:text-accent-hover transition-colors cursor-pointer text-left"
            >
              {albumStub.artist}
            </button>
          </div>

          {album ? (
            <>
              <div className="flex items-center gap-3 text-xs text-text-dim">
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
                  <span>
                    {album.num_tracks} tracks{album.duration_sec > 0 && ` · ${formatDuration(album.duration_sec)}`}
                  </span>
                )}
              </div>

              {album.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {album.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-1.5 py-0.5 rounded-sm bg-tag-neutral text-text-dim border border-border/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-auto flex flex-col gap-1 text-sm">
                {showHost && (
                  <button
                    onClick={() => { onClose(); searchFor(album.host_name!) }}
                    className="text-text-dim text-xs hover:text-accent transition-colors cursor-pointer text-left"
                  >
                    on {album.host_name}
                  </button>
                )}
                <a
                  href={album.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover transition-colors w-fit"
                >
                  View on Bandcamp →
                </a>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center">
              <span className="text-text-dim text-sm">Loading...</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-sm bg-bg/80 text-text-dim hover:text-text transition-colors cursor-pointer text-sm"
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  )
}
