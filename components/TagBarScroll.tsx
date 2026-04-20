"use client"

import type { TagCount } from "@/lib/types"
import TagRow from "./TagRow"

type HeadingStyle = "section" | "caption"

// Vertically-scrolling bar list shared by the stats page and the tag-context
// panel inside ScopeModal. Mask + hidden scrollbar are defined once here so
// both call sites stay visually aligned.
export default function TagBarScroll({
  title,
  items,
  rows = 8,
  fixedHeight = false,
  headingStyle = "caption",
  emptyLabel,
  denominator,
}: {
  title: string
  items: TagCount[]
  rows?: number
  // Reserve the full row-height region even when items are fewer than `rows`
  // (keeps layout steady with the matching skeleton and across modal transitions).
  fixedHeight?: boolean
  headingStyle?: HeadingStyle
  emptyLabel?: string
  // When set, bars scale as n/denominator and labels render as percentages
  // rather than raw counts (used for "share of current tag's releases").
  denominator?: number
}) {
  const listHeight = `calc(${rows} * 1.75rem + ${rows - 1} * 0.125rem${headingStyle === "section" ? " + 1rem" : ""})`
  const sizeStyle = fixedHeight ? { height: listHeight } : { maxHeight: listHeight }

  if (items.length === 0) {
    if (!emptyLabel) return null
    return (
      <section>
        <Heading style={headingStyle}>{title}</Heading>
        <div
          className="flex items-center font-display text-xs tracking-wide text-text-dim"
          style={fixedHeight ? { height: listHeight } : undefined}
        >
          {emptyLabel}
        </div>
      </section>
    )
  }

  const max = denominator && denominator > 0 ? denominator : items[0].n || 1

  return (
    <section>
      <Heading style={headingStyle}>{title}</Heading>
      <div
        className="relative"
        style={{
          maskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 1.5rem), transparent 100%)",
        }}
      >
        <ol
          className="flex flex-col gap-0.5 overflow-y-auto pr-1"
          style={{ ...sizeStyle, scrollbarWidth: "none" }}
        >
          {items.map((t) => {
            const widthPct = Math.min((t.n / max) * 100, 100)
            const label = denominator ? `${Math.round(widthPct)}%` : undefined
            return <TagRow key={t.name} name={t.name} count={t.n} widthPct={widthPct} label={label} />
          })}
        </ol>
      </div>
    </section>
  )
}

function Heading({ style, children }: { style: HeadingStyle; children: React.ReactNode }) {
  if (style === "section") {
    return (
      <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright mb-4">
        {children}
      </h2>
    )
  }
  return (
    <div className="font-display text-[10px] tracking-[0.2em] uppercase text-accent/80 mb-3">
      {children}
    </div>
  )
}
