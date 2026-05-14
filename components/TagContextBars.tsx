"use client"

import type { TagCount } from "@/lib/types"
import TagBarScroll from "./TagBarScroll"

const BAR_ROWS = 5

// Twin related-tag bar plots shown at the top of a tag scope modal. Position
// follows the current tag's category: same-category on the left, other on the
// right. Renders a trailing divider so callers can drop it in as a unit.
export default function TagContextBars({
  category,
  total,
  genres,
  themes,
  excludeTags = [],
}: {
  category: "genre" | "theme" | null
  total: number
  genres: TagCount[]
  themes: TagCount[]
  // Additional tags to hide from the bars (typically the current modal's
  // filter chips, since those albums are already constrained).
  excludeTags?: string[]
}) {
  // Drop rows whose share rounds to 0% — they look empty next to the sized
  // bars. Also drop any tag already active as a filter chip.
  const threshold = total > 0 ? total / 200 : 0
  const excluded = new Set(excludeTags)
  const visibleGenres = genres.filter((t) => t.n > threshold && !excluded.has(t.name))
  const visibleThemes = themes.filter((t) => t.n > threshold && !excluded.has(t.name))

  if (visibleGenres.length === 0 && visibleThemes.length === 0) return null

  const leftIsGenre = category !== "theme"
  const [left, right] = leftIsGenre
    ? [{ title: "Genres", items: visibleGenres }, { title: "Themes", items: visibleThemes }]
    : [{ title: "Themes", items: visibleThemes }, { title: "Genres", items: visibleGenres }]

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        <TagBarScroll title={left.title} items={left.items} rows={BAR_ROWS} fixedHeight denominator={total} emptyLabel="No related tags." />
        <TagBarScroll title={right.title} items={right.items} rows={BAR_ROWS} fixedHeight denominator={total} emptyLabel="No related tags." />
      </div>
      <div className="modal-rule my-5" />
    </>
  )
}

// Placeholder matching the real bars' footprint so the album grid doesn't
// jump when tag-context finishes loading. Uses the same heading markup so the
// heading cell height matches to the pixel.
export function TagContextBarsSkeleton() {
  const rowHeights = `calc(${BAR_ROWS} * 1.75rem + ${BAR_ROWS - 1} * 0.125rem)`
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 animate-pulse">
        <SkeletonColumn rowHeights={rowHeights} />
        <SkeletonColumn rowHeights={rowHeights} />
      </div>
      <div className="modal-rule my-5" />
    </>
  )
}

function SkeletonColumn({ rowHeights }: { rowHeights: string }) {
  return (
    <section>
      <div className="font-display text-[10px] tracking-[0.2em] uppercase text-accent/60 mb-3">
        <span className="invisible">Related</span>
      </div>
      <div className="flex flex-col gap-0.5" style={{ height: rowHeights }}>
        {Array.from({ length: BAR_ROWS }).map((_, i) => (
          <div key={i} className="h-7 bg-bg-card/60 rounded-sm" style={{ width: `${100 - i * 12}%` }} />
        ))}
      </div>
    </section>
  )
}

// Failure fallback matching the bars' footprint. Centred "(no data)" plus a
// retry button, same chrome as the stats page's ChunkDegraded.
export function TagContextBarsDegraded({ onRetry }: { onRetry: () => void }) {
  const rowHeights = `calc(${BAR_ROWS} * 1.75rem + ${BAR_ROWS - 1} * 0.125rem)`
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
        <DegradedColumn rowHeights={rowHeights} onRetry={onRetry} />
        <DegradedColumn rowHeights={rowHeights} onRetry={onRetry} />
      </div>
      <div className="modal-rule my-5" />
    </>
  )
}

function DegradedColumn({ rowHeights, onRetry }: { rowHeights: string; onRetry: () => void }) {
  return (
    <section>
      <div className="font-display text-[10px] tracking-[0.2em] uppercase text-accent/60 mb-3">
        <span className="invisible">Related</span>
      </div>
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ height: rowHeights }}
      >
        <span className="font-display text-xs tracking-[0.2em] uppercase text-text-dim">
          (no data) ✧
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="font-display text-[10px] tracking-[0.2em] uppercase text-accent hover:text-accent-hover transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    </section>
  )
}
