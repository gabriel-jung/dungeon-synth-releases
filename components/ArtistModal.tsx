"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import ReleasesModal, { ViewToggle } from "./ReleasesModal"
import { buildSplitUrl, coverUrl } from "@/lib/types"

export default function ArtistModal({
  artist,
  onClose,
}: {
  artist: string
  onClose: () => void
}) {
  const sp = useSearchParams()
  const tags = sp.getAll("tag")
  const xtags = sp.getAll("xtag")
  const hasFilter = tags.length + xtags.length > 0
  const [coverArtId, setCoverArtId] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const titleId = `artist-modal-title-${artist.replace(/\W+/g, "-").toLowerCase()}`
  const imgSrc = coverArtId ? coverUrl(coverArtId, "thumb") : null

  const fetchUrl = useMemo(
    () => buildSplitUrl({ artist, tags, xtags }),
    [artist, tags.join("|"), xtags.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <ReleasesModal
      titleId={titleId}
      fetchUrl={fetchUrl}
      expectedCount={10}
      listShowDate
      onClose={onClose}
      onAlbumsLoaded={(albums) => {
        setCount(albums.length)
        const art = albums[0]?.art_id
        if (art) setCoverArtId(art)
      }}
      header={(view, setView, onClose) => (
        <div className="pl-6 pr-4 pt-4 pb-3 shrink-0 border-b border-border flex items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {imgSrc && !imgFailed ? (
              <img
                src={imgSrc}
                alt=""
                onError={() => setImgFailed(true)}
                decoding="async"
                className="w-10 h-10 object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-10 h-10 flex items-center justify-center border border-border bg-bg-card shrink-0">
                <span className="text-xl text-border select-none">♞</span>
              </div>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-base text-text-bright font-bold tracking-wide truncate">
                {artist}
              </h2>
              <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">
                {count !== null ? `${count} release${count === 1 ? "" : "s"}` : "releases"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!hasFilter && <ViewToggle view={view} setView={setView} />}
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center text-text-dim hover:text-text-bright border border-border/50 transition-colors cursor-pointer text-base leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    />
  )
}
