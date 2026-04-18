"use client"

import { useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { buildSplitUrl, hostImageUrl } from "@/lib/types"
import ReleasesModal, { ViewToggle } from "./ReleasesModal"

export default function HostModal({
  hostId,
  hostName,
  imageId,
  url,
  year,
  expectedCount = 0,
  onClose,
}: {
  hostId: string
  hostName: string
  imageId: string | null
  url: string | null
  year?: number
  expectedCount?: number
  onClose: () => void
}) {
  const sp = useSearchParams()
  const tags = sp.getAll("tag")
  const xtags = sp.getAll("xtag")
  const hasFilter = tags.length + xtags.length > 0
  const [imgFailed, setImgFailed] = useState(false)
  const [loadedCount, setLoadedCount] = useState<number | null>(null)
  const imgSrc = hostImageUrl(imageId)
  const titleId = `host-modal-title-${hostId}`

  const fetchUrl = useMemo(
    () => buildSplitUrl({ hostId, year, tags, xtags }),
    [hostId, year, tags.join("|"), xtags.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const displayCount = loadedCount ?? (expectedCount > 0 ? expectedCount : null)
  const subtitle = displayCount !== null
    ? `${displayCount} release${displayCount === 1 ? "" : "s"}${year ? ` in ${year}` : ""}`
    : year ? `releases in ${year}` : "releases"

  return (
    <ReleasesModal
      titleId={titleId}
      fetchUrl={fetchUrl}
      expectedCount={expectedCount || 10}
      listHideHost
      listShowDate
      onClose={onClose}
      onAlbumsLoaded={(albums) => setLoadedCount(albums.length)}
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
                <span aria-hidden="true" className="text-xl text-border select-none">♜</span>
              </div>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-base text-text-bright font-bold tracking-wide truncate">
                {hostName}
              </h2>
              <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim">
                {subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display text-xs tracking-[0.1em] text-accent hover:text-accent-hover transition-colors"
              >
                Bandcamp →
              </a>
            )}
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
