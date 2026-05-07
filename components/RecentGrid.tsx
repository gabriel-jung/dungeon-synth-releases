"use client"

import { useState } from "react"
import { AlbumListItem, coverUrl, formatDateShort, isHostedRelease } from "@/lib/types"
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
          // Hotlinked Bandcamp art — see CLAUDE.md (no next/image to keep
          // bytes off Vercel egress).
          // eslint-disable-next-line @next/next/no-img-element
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
            className="text-[10px] text-text-dim hover:text-accent hover:underline decoration-dotted underline-offset-2 transition-colors cursor-pointer text-left truncate font-display tracking-wide uppercase"
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
  // Reset paging when the underlying list or page size changes. Adjust state
  // during render (per React docs) instead of an effect — avoids the brief
  // flash where the previous list's `visible` window applies to new data.
  const [prevAlbums, setPrevAlbums] = useState(albums)
  const [prevPageSize, setPrevPageSize] = useState(pageSize)
  if (albums !== prevAlbums || pageSize !== prevPageSize) {
    setPrevAlbums(albums)
    setPrevPageSize(pageSize)
    setVisible(pageSize)
  }

  const shown = albums.slice(0, visible)
  const hasMore = visible < albums.length
  // Grid row height depends on whether any visible card renders a host row.
  // When none do, compensate with a one-line spacer so the total release-area
  // height matches the skeleton (which always reserves the host row).
  const anyHostRow = !hideHost && shown.some((a) => isHostedRelease(a))

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {shown.map((album) => (
          <GridCard key={album.id} album={album} showDate={showDate} hideHost={hideHost} />
        ))}
      </div>

      {!anyHostRow && (
        <div aria-hidden="true" className="font-display tracking-wide uppercase text-[10px] invisible">·</div>
      )}

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
