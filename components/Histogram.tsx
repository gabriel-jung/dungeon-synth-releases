"use client"

import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { releaseCount } from "@/lib/types"
import SectionHeader from "./SectionHeader"

export type HistBin = { label: string; count: number; width?: number }

const MIN_HOVER_ZONE = 0.1
const MIN_BAR_PX = 4
// Smallest bins still need to be visible; floor the colour-mix at 25% of the
// max-tinted colour so a single-release bucket reads against the background.
const MIN_BAR_TINT_PCT = 25

export default function Histogram({
  title,
  bins,
  chapter,
  barHeight = "h-32",
  framed = false,
  minBarPx,
  valueSuffix = "",
}: {
  title: string
  bins: HistBin[]
  chapter?: string
  barHeight?: string
  framed?: boolean
  // Floor bar width so labels stay readable. When bins.length × minBarPx
  // exceeds the container, the chart area scrolls horizontally. Used by
  // the dense year histogram (label "1990" needs ~32 px to render fully).
  minBarPx?: number
  valueSuffix?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const active = hover !== null ? bins[hover] : null
  const scrollable = minBarPx != null
  const scrollRef = useRef<HTMLDivElement>(null)

  // Snap to right edge once on mount so the newest bucket lands in view.
  // Deps intentionally exclude `bins` so a filter change doesn't reset
  // the user's horizontal scroll position.
  useLayoutEffect(() => {
    if (scrollable && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [scrollable])

  const geometry = useMemo(() => {
    const density = (b: HistBin) => b.count / (b.width ?? 1)
    const maxDensity = Math.max(1, ...bins.map(density))
    return bins.map((b) => {
      const r = density(b) / maxDensity
      const zoneR = Math.max(r, MIN_HOVER_ZONE)
      const tintPct = Math.max(r * 100, MIN_BAR_TINT_PCT)
      const background = `color-mix(in srgb, var(--color-plot-bar-max) ${tintPct}%, var(--color-plot-bar-min))`
      return { r, zoneR, barInZone: r / zoneR, background }
    })
  }, [bins])

  const cellFlex = scrollable
    ? { flex: `0 0 ${minBarPx}px` }
    : undefined

  return (
    <div className="w-full">
      <SectionHeader
        chapter={chapter}
        title={title}
        right={
          <span
            className={`font-display text-xs tracking-wide text-text-dim truncate shrink min-w-0 transition-opacity duration-150 ${active ? "opacity-100" : "opacity-0"}`}
            aria-hidden={!active}
          >
            {active && (
              <>
                <span className="text-text-bright">{active.label}</span>
                {", "}
                {releaseCount(active.count)}
                {valueSuffix}
              </>
            )}
          </span>
        }
      />
      <div className={`relative ${framed ? "px-3 pt-3" : ""}`}>
        {framed && (
          <>
            <span aria-hidden className="pointer-events-none absolute top-0 left-0 text-accent/60 text-xs leading-none select-none">⌜</span>
            <span aria-hidden className="pointer-events-none absolute top-0 right-0 text-accent/60 text-xs leading-none select-none">⌝</span>
            <span aria-hidden className="pointer-events-none absolute bottom-0 left-0 text-accent/60 text-xs leading-none select-none">⌞</span>
            <span aria-hidden className="pointer-events-none absolute bottom-0 right-0 text-accent/60 text-xs leading-none select-none">⌟</span>
          </>
        )}
        <div
          ref={scrollRef}
          className={scrollable ? "overflow-x-auto" : ""}
          style={scrollable ? { scrollbarWidth: "none" } : undefined}
        >
          <div className={`flex items-end gap-[3px] ${barHeight}`}>
            {bins.map((b, i) => {
              const { zoneR, barInZone, background } = geometry[i]
              const isZero = b.count === 0
              return (
                <div
                  key={b.label}
                  tabIndex={0}
                  aria-label={`${b.label}: ${releaseCount(b.count)}${valueSuffix}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="flex-1 min-w-0 flex items-end cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
                  style={{ height: `${zoneR * 100}%`, ...cellFlex }}
                >
                  {isZero ? (
                    <div className="w-full h-px bg-border/60" aria-hidden />
                  ) : (
                    <div
                      className="w-full animate-bar-grow transition-colors"
                      style={{
                        height: `${barInZone * 100}%`,
                        minHeight: `${MIN_BAR_PX}px`,
                        opacity: 0.7,
                        animationDelay: `${i * 25}ms`,
                        background: hover === i ? "var(--color-plot-bar-hover)" : background,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className="flex gap-[3px] mt-1">
            {bins.map((b) => (
              <div
                key={`l-${b.label}`}
                className="flex-1 text-center text-[9px] font-display tracking-[0.1em] uppercase text-text-dim min-w-0 truncate tabular-nums"
                style={cellFlex}
              >
                {b.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
