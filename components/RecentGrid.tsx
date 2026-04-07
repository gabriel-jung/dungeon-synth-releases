"use client"

import { useState } from "react"
import { AlbumListItem, coverUrl } from "@/lib/types"
import AlbumDetail from "./AlbumDetail"

export default function RecentGrid({ albums }: { albums: AlbumListItem[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AlbumListItem | null>(null)

  return (
    <>
      <div className={`grid gap-4 mx-auto ${
        albums.length === 1 ? "grid-cols-1 max-w-[280px]" :
        albums.length === 2 ? "grid-cols-2 max-w-[560px]" :
        albums.length === 3 ? "grid-cols-2 sm:grid-cols-3 max-w-[840px]" :
        "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      }`}>
        {albums.map((album) => {
          const img = coverUrl(album.art_id, "thumb")
          return (
          <button
            key={album.id}
            onClick={() => setSelected(album)}
            className="group flex flex-col gap-2 text-left cursor-pointer"
            onMouseEnter={() => setHoveredId(album.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="aspect-square rounded bg-bg-card border border-border overflow-hidden flex items-center justify-center hover-candlelight">
              {img ? (
                <img
                  src={img}
                  alt={`${album.artist} — ${album.title}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-3xl text-border select-none">♜</span>
              )}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`text-sm font-medium truncate transition-colors ${
                  hoveredId === album.id ? "text-accent" : "text-text-bright"
                }`}
              >
                {album.title}
              </span>
              <span className="text-xs text-text-dim truncate">
                {album.artist}
              </span>
            </div>
          </button>
          )
        })}
      </div>

      {selected && (
        <AlbumDetail albumStub={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
