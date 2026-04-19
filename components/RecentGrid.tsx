"use client"

import { useEffect, useState } from "react"
import { AlbumListItem, coverUrl, formatDateShort } from "@/lib/types"
import { useAlbumCardModals } from "@/lib/useAlbumCardModals"

const DEFAULT_PAGE_SIZE = 10

function GridCard({ album, showDate, hideHost }: { album: AlbumListItem; showDate: boolean; hideHost: boolean }) {
  const { showHostInline, onArtistClick, openHost, push } = useAlbumCardModals(album, { hideHost })
  const openAlbum = (e?: React.SyntheticEvent) => { e?.stopPropagation(); push("album", album.id) }

  const img = coverUrl(album.art_id, "full")

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={openAlbum}
        className="aspect-square bg-bg-card border border-border overflow-hidden flex items-center justify-center hover-candlelight cursor-pointer"
      >
        {img ? (
          <img
            src={img}
            alt={`${album.artist} — ${album.title}`}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span aria-hidden="true" className="text-3xl text-border select-none">♜</span>
        )}
      </button>
      <div className="flex flex-col min-w-0 px-0.5">
        <button
          type="button"
          onClick={openAlbum}
          className="text-[0.8rem] leading-snug font-medium truncate text-left text-text-bright hover:text-accent transition-colors cursor-pointer"
        >
          {album.title}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onArtistClick() }}
          className="text-xs text-text-dim hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left truncate"
        >
          {album.artist}
        </button>
        {showHostInline && (
          <button
            onClick={(e) => { e.stopPropagation(); openHost() }}
            className="text-[10px] text-text-dim/60 hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left truncate font-display tracking-wide uppercase"
          >
            {album.host_name}
          </button>
        )}
        {showDate && album.date && (
          <span className="text-[10px] tracking-wide tabular-nums text-text-dim/80 truncate mt-0.5">
            {formatDateShort(album.date, true)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function RecentGrid({
  albums,
  showDate = false,
  hideHost = false,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  albums: AlbumListItem[]
  showDate?: boolean
  hideHost?: boolean
  pageSize?: number
}) {
  const [visible, setVisible] = useState(pageSize)

  useEffect(() => { setVisible(pageSize) }, [albums, pageSize])

  const shown = albums.slice(0, visible)
  const hasMore = visible < albums.length

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {shown.map((album) => (
          <GridCard key={album.id} album={album} showDate={showDate} hideHost={hideHost} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setVisible((v) => v + pageSize)}
            className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim hover:text-accent border border-border/50 hover:border-accent/50 px-4 py-1.5 transition-colors cursor-pointer"
          >
            Load more · {albums.length - visible} remaining
          </button>
        </div>
      )}
    </>
  )
}
