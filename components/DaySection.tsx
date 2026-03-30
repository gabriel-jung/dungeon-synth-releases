"use client"

import { useState } from "react"
import { AlbumListItem } from "@/lib/types"
import RecentGrid from "./RecentGrid"
import { ReleaseCard } from "./AlbumDetail"

export default function DaySection({
  label,
  albums,
  defaultExpanded = false,
}: {
  label: string
  albums: AlbumListItem[]
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (albums.length === 0) return null

  return (
    <section>
      <div className="flex items-baseline gap-3 border-b border-border pb-2 mb-2">
        <h3 className="text-text-dim text-sm tracking-wider">
          {label}
        </h3>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-text-dim hover:text-text text-xs transition-colors cursor-pointer"
        >
          {expanded ? "▾ hide covers" : "▸ show covers"}
        </button>
      </div>

      {expanded ? (
        <RecentGrid albums={albums} />
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3" style={{ columnGap: "1rem" }}>
          {albums.map((album) => (
            <div key={album.id} style={{ breakInside: "avoid" }}>
              <ReleaseCard album={album} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
