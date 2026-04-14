"use client"

import { useState } from "react"
import { hostImageUrl } from "@/lib/types"
import ReleasesModal, { ViewToggle } from "./ReleasesModal"

export default function HostModal({
  hostId,
  hostName,
  imageId,
  url,
  year,
  expectedCount,
  onClose,
}: {
  hostId: string
  hostName: string
  imageId: string | null
  url: string | null
  year: number
  expectedCount: number
  onClose: () => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const imgSrc = hostImageUrl(imageId)
  const titleId = `host-modal-title-${hostId}`

  return (
    <ReleasesModal
      titleId={titleId}
      fetchUrl={`/api/albums?host_id=${encodeURIComponent(hostId)}&year=${year}&limit=500`}
      expectedCount={expectedCount}
      listHideHost
      listShowDate
      onClose={onClose}
      header={(view, setView) => (
        <div className="pl-6 pr-14 pt-5 pb-3 shrink-0 border-b border-border flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {imgSrc && !imgFailed ? (
              <img
                src={imgSrc}
                alt=""
                onError={() => setImgFailed(true)}
                className="w-12 h-12 object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-12 h-12 flex items-center justify-center border border-border bg-bg-card shrink-0">
                <span className="text-2xl text-border select-none">♜</span>
              </div>
            )}
            <div className="min-w-0">
              {url ? (
                <a
                  id={titleId}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display text-lg text-text-bright font-bold tracking-wide truncate block hover:text-accent transition-colors"
                >
                  {hostName}
                </a>
              ) : (
                <h2 id={titleId} className="font-display text-lg text-text-bright font-bold tracking-wide truncate">
                  {hostName}
                </h2>
              )}
              <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim mt-1">
                {expectedCount} release{expectedCount === 1 ? "" : "s"} in {year}
              </p>
            </div>
          </div>
          <ViewToggle view={view} setView={setView} />
        </div>
      )}
    />
  )
}
