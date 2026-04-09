"use client"

import { useState } from "react"
import { AlbumListItem, coverUrl } from "@/lib/types"
import AlbumDetail from "./AlbumDetail"

export default function RecentGrid({ albums }: { albums: AlbumListItem[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AlbumListItem | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {albums.map((album) => {
          const img = coverUrl(album.art_id, "full")
          return (
          <button
            key={album.id}
            onClick={() => setSelected(album)}
            className="group flex flex-col gap-1.5 text-left cursor-pointer"
            onMouseEnter={() => setHoveredId(album.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="aspect-square bg-bg-card border border-border overflow-hidden flex items-center justify-center hover-candlelight">
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
            <div className="flex flex-col min-w-0 px-0.5">
              <span
                className={`text-[0.8rem] leading-snug font-medium truncate transition-colors ${
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
