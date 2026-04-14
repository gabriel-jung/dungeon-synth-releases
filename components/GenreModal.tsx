"use client"

import ReleasesModal, { ViewToggle } from "./ReleasesModal"

export default function GenreModal({
  tags,
  expectedCount,
  onClose,
}: {
  tags: string[]
  expectedCount: number
  onClose: () => void
}) {
  const titleId = "genre-modal-title"
  const params = new URLSearchParams()
  for (const t of tags) params.append("tag", t)
  params.set("limit", "500")

  return (
    <ReleasesModal
      titleId={titleId}
      fetchUrl={`/api/albums/by-tags?${params.toString()}`}
      expectedCount={expectedCount}
      listShowDate
      onClose={onClose}
      header={(view, setView) => (
        <div className="pl-6 pr-14 pt-5 pb-3 shrink-0 border-b border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg text-text-bright font-bold tracking-wide truncate">
              {tags.length === 1 ? (
                tags[0]
              ) : (
                <>
                  {tags[0]} <span className="text-text-dim">×</span> {tags[1]}
                </>
              )}
            </h2>
            <p className="font-display text-[10px] tracking-[0.2em] uppercase text-text-dim mt-1">
              {tags.length === 1 ? "releases tagged" : "releases sharing both tags"}
            </p>
          </div>
          <ViewToggle view={view} setView={setView} />
        </div>
      )}
    />
  )
}
