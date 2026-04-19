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
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={expanded ? "Hide covers" : "Show covers"}
        className="ornamental-divider w-full cursor-pointer hover:text-accent transition-colors group"
      >
        <span className="flex items-center gap-2">
          {label}
          <span
            aria-hidden="true"
            className="text-[10px] text-border group-hover:text-accent transition-colors"
          >
            {expanded ? "▾" : "▸"}
          </span>
        </span>
      </button>
      {expanded ? <RecentGrid albums={albums} pageSize={50} /> : <AlbumGrid albums={albums} />}
    </section>
  )
}
