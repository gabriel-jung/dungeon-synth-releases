"use client"

import { ReactNode, useState } from "react"
import { AlbumListItem } from "@/lib/types"
import RecentGrid from "./RecentGrid"
import { AlbumGrid } from "./AlbumDetail"

export default function DaySection({
  label,
  albums,
  defaultExpanded = false,
}: {
  label: ReactNode
  albums: AlbumListItem[]
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (albums.length === 0) return null

  return (
    <section>
      <div className="ornamental-divider">{label}</div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="font-display text-[10px] tracking-[0.1em] uppercase text-text-dim hover:text-accent transition-colors cursor-pointer mb-3"
      >
        {expanded ? "▾ hide covers" : "▸ show covers"}
      </button>

      {expanded ? (
        <RecentGrid albums={albums} />
      ) : (
        <AlbumGrid albums={albums} />
      )}
    </section>
  )
}
