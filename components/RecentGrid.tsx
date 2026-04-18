"use client"

import { useEffect, useState } from "react"
import { AlbumListItem, coverUrl, formatDateShort } from "@/lib/types"
import AlbumDetail from "./AlbumDetail"
import ArtistModal from "./ArtistModal"
import HostModal from "./HostModal"
import { useAlbumCardModals } from "@/lib/useAlbumCardModals"

const PAGE_SIZE = 20

function GridCard({ album, showDate, hideHost }: { album: AlbumListItem; showDate: boolean; hideHost: boolean }) {
  const [selected, setSelected] = useState(false)
  const { artistModal, setArtistModal, hostModal, setHostModal, showHostInline, onArtistClick } =
    useAlbumCardModals(album, { hideHost })

  const img = coverUrl(album.art_id, "full")

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => setSelected(true)}
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
            <span className="text-3xl text-border select-none">♜</span>
          )}
        </button>
        <div className="flex flex-col min-w-0 px-0.5">
          <button
            onClick={() => setSelected(true)}
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
              onClick={(e) => { e.stopPropagation(); setHostModal(true) }}
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

      {selected && <AlbumDetail albumStub={album} onClose={() => setSelected(false)} />}
      {artistModal && <ArtistModal artist={album.artist} onClose={() => setArtistModal(false)} />}
      {hostModal && album.host_id && (
        <HostModal
          hostId={album.host_id}
          hostName={album.host_name!}
          imageId={album.host_image_id ?? null}
          url={album.host_url ?? null}
          onClose={() => setHostModal(false)}
        />
      )}
    </>
  )
}

export default function RecentGrid({ albums, showDate = false, hideHost = false }: { albums: AlbumListItem[]; showDate?: boolean; hideHost?: boolean }) {
  const [visible, setVisible] = useState(PAGE_SIZE)

  useEffect(() => { setVisible(PAGE_SIZE) }, [albums])

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
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim hover:text-accent border border-border/50 hover:border-accent/50 px-4 py-1.5 transition-colors cursor-pointer"
          >
            Load more · {albums.length - visible} remaining
          </button>
        </div>
      )}
    </>
  )
}
