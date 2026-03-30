"use client"

import { useState } from "react"
import { AlbumListItem, coverUrl } from "@/lib/types"
import AlbumDetail from "./AlbumDetail"

export default function RecentGrid({ albums }: { albums: AlbumListItem[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AlbumListItem | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {albums.map((album) => {
          const img = coverUrl(album.art_id)
          return (
          <button
            key={album.id}
            onClick={() => setSelected(album)}
            className="group flex flex-col gap-2 text-left cursor-pointer"
            onMouseEnter={() => setHoveredId(album.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <div className="aspect-square rounded bg-bg-card border border-border overflow-hidden flex items-center justify-center transition-colors group-hover:border-accent">
              {img ? (
                <img
                  src={img}
                  alt={`${album.artist} — ${album.title}`}
                  className="w-full h-full object-cover"
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
