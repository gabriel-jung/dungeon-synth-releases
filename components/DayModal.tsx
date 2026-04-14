"use client"

import { formatDateHeading } from "@/lib/types"
import ReleasesModal, { ViewToggle } from "./ReleasesModal"

export default function DayModal({
  date,
  expectedCount,
  onClose,
}: {
  date: string
  expectedCount: number
  onClose: () => void
}) {
  const titleId = `day-modal-title-${date}`

  return (
    <ReleasesModal
      titleId={titleId}
      fetchUrl={`/api/albums?date=${date}&limit=500`}
      expectedCount={expectedCount}
      onClose={onClose}
      header={(view, setView) => (
        <div className="pl-6 pr-14 pt-5 pb-3 shrink-0 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg text-text-bright font-bold tracking-wide truncate">
              {formatDateHeading(date, true)}
            </h2>
            <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim mt-1">
              {expectedCount} release{expectedCount === 1 ? "" : "s"}
            </p>
          </div>
          <ViewToggle view={view} setView={setView} />
        </div>
      )}
    />
  )
}
