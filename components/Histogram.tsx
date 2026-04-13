"use client"

import { useMemo, useState } from "react"
import { releaseCount } from "@/lib/types"

export type HistBin = { label: string; count: number; width?: number }

const MIN_HOVER_ZONE = 0.1

export default function Histogram({
  title,
  bins,
  valueSuffix = "",
}: {
  title: string
  bins: HistBin[]
  valueSuffix?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const active = hover !== null ? bins[hover] : null

  const geometry = useMemo(() => {
    const density = (b: HistBin) => b.count / (b.width ?? 1)
    const maxDensity = Math.max(1, ...bins.map(density))
    return bins.map((b) => {
      const r = density(b) / maxDensity
      const zoneR = Math.max(r, MIN_HOVER_ZONE)
      return { r, zoneR, barInZone: r / zoneR }
    })
  }, [bins])

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright truncate">
          {title}
        </h2>
        {active && (
          <span className="font-display text-xs tracking-wide text-text-dim truncate shrink min-w-0">
            <span className="text-text-bright">{active.label}</span>
            {" — "}
            {releaseCount(active.count)}
            {valueSuffix}
          </span>
        )}
      </div>
      <div className="flex items-end gap-[3px] h-32">
        {bins.map((b, i) => {
          const { r, zoneR, barInZone } = geometry[i]
          return (
            <div
              key={b.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="flex-1 min-w-0 flex items-end cursor-default"
              style={{ height: `${zoneR * 100}%` }}
            >
              <div
                className="w-full transition-colors"
                style={{
                  height: `${barInZone * 100}%`,
                  minHeight: b.count > 0 ? "2px" : "0",
                  opacity: 0.7,
                  background: hover === i
                    ? "var(--color-plot-bar-hover)"
                    : `color-mix(in srgb, var(--color-plot-bar-max) ${r * 100}%, var(--color-plot-bar-min))`,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-[3px] mt-1">
        {bins.map((b) => (
          <div
            key={`l-${b.label}`}
            className="flex-1 text-center text-[9px] font-display tracking-[0.1em] uppercase text-text-dim truncate min-w-0"
          >
            {b.label}
          </div>
        ))}
      </div>
    </div>
  )
}
