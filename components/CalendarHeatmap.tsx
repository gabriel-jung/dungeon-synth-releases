"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { formatDateShort, localDateStr, releaseCount } from "@/lib/types"
import { hrefWithModal } from "@/lib/modalUrl"

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const PALETTES = {
  theme: [
    "color-mix(in srgb, var(--color-accent) 12%, var(--color-bg-card))",
    "color-mix(in srgb, var(--color-accent) 22%, var(--color-bg-card))",
    "color-mix(in srgb, var(--color-accent) 35%, var(--color-bg-card))",
    "color-mix(in srgb, var(--color-accent) 50%, var(--color-bg-card))",
    "color-mix(in srgb, var(--color-accent) 68%, var(--color-bg-card))",
    "color-mix(in srgb, var(--color-accent) 86%, var(--color-bg-card))",
    "var(--color-accent)",
    "color-mix(in srgb, var(--color-text-bright) 35%, var(--color-accent))",
    "color-mix(in srgb, var(--color-text-bright) 65%, var(--color-accent))",
  ],
  inferno: [
    "#3b0f6f", "#6b176f", "#982567", "#c0385a", "#df5040",
    "#f27220", "#fa9b06", "#fbc42d", "#fcffa4",
  ],
  viridis: [
    "#440154", "#482475", "#414487", "#355f8d", "#2a788e",
    "#21918c", "#22a884", "#44bf70", "#7ad151",
  ],
} as const
type PaletteName = keyof typeof PALETTES
const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[]

type Day = { date: string; n: number }
type Cell = { key: string; dateStr: string; count: number; weekIdx: number; dow: number; inRange: boolean; isFuture: boolean; month: number; colorIdx: number }

export default function CalendarHeatmap({ days, year, today: todayStr }: { days: Day[]; year: number; today: string }) {
  const [hover, setHover] = useState<Cell | null>(null)
  const [palette, setPalette] = useState<PaletteName>("theme")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectDay = (cell: Cell) => {
    router.push(hrefWithModal(searchParams as unknown as URLSearchParams, "day", cell.dateStr, pathname))
  }

  const { cells, monthSpans, monthPaths, totalWeeks } = useMemo(() => {
    const counts = new Map(days.map((d) => [d.date, d.n]))

    const nonZero = days.map((d) => d.n).filter((n) => n > 0).sort((a, b) => a - b)
    const qAt = (p: number) =>
      nonZero[Math.min(Math.floor(nonZero.length * p), nonZero.length - 1)] ?? 1
    const qPoints = [0.12, 0.25, 0.4, 0.55, 0.7, 0.82, 0.9, 0.95]
    const thresholds = nonZero.length ? qPoints.map(qAt) : qPoints.map((_, i) => i + 1)

    // UTC throughout — local tz caused SSR/CSR hydration mismatches when
    // Node (UTC) and browser disagreed on which day a cell belonged to.
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year, 11, 31))
    const today = new Date(`${todayStr}T00:00:00Z`)

    const startDow = (yearStart.getUTCDay() + 6) % 7
    const firstMonday = new Date(yearStart)
    firstMonday.setUTCDate(yearStart.getUTCDate() - startDow)

    const cells: Cell[] = []
    const monthSpans = new Map<number, { start: number; end: number }>()
    const cur = new Date(firstMonday)
    let weekIdx = 0
    while (true) {
      for (let dow = 0; dow < 7; dow++) {
        const dateStr = localDateStr(cur)
        const inRange = cur >= yearStart && cur <= yearEnd
        const isFuture = inRange && cur > today
        const month = cur.getUTCMonth()
        const count = counts.get(dateStr) ?? 0
        if (inRange) {
          const s = monthSpans.get(month)
          if (!s) monthSpans.set(month, { start: weekIdx, end: weekIdx })
          else s.end = weekIdx
        }
        let colorIdx = 0
        for (const t of thresholds) if (count > t) colorIdx++
        cells.push({ key: dateStr, dateStr, count, weekIdx, dow, inRange, isFuture, month, colorIdx })
        cur.setUTCDate(cur.getUTCDate() + 1)
      }
      if (cur > yearEnd) break
      weekIdx++
    }
    const totalWeeks = weekIdx + 1

    const monthPaths: string[] = []
    for (let m = 1; m <= 11; m++) {
      const firstDay = new Date(Date.UTC(year, m, 1))
      const daysSince = Math.round((firstDay.getTime() - firstMonday.getTime()) / 86400000)
      const w = Math.floor(daysSince / 7)
      const d = daysSince % 7
      monthPaths.push(
        d === 0
          ? `M ${w} 0 L ${w} 7`
          : `M ${w + 1} 0 L ${w + 1} ${d} L ${w} ${d} L ${w} 7`,
      )
    }

    return { cells, monthSpans, monthPaths, totalWeeks }
  }, [days, year, todayStr])

  const delimColor = "color-mix(in srgb, var(--color-text-dim) 38%, transparent)"
  const colorStops = PALETTES[palette]

  const cellColor = (c: Cell) => {
    if (!c.inRange) return "transparent"
    if (c.count === 0) {
      return c.isFuture
        ? "color-mix(in srgb, var(--color-bg-card) 60%, transparent)"
        : "var(--color-bg-card)"
    }
    return colorStops[Math.min(c.colorIdx, colorStops.length - 1)]
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="h-6 mb-2 font-display text-sm tracking-wide text-text-bright flex items-center justify-between gap-4">
        <div className="min-w-0 truncate">
          {hover?.inRange && (
            <>
              <span className="text-text-bright">{formatDateShort(hover.dateStr, true)}</span>
              <span className="text-text-dim">
                {" — "}
                {releaseCount(hover.count)}
                {hover.isFuture && hover.count > 0 ? " (upcoming)" : ""}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] tracking-[0.15em] uppercase text-text-dim">
          <span>Less</span>
          <button
            type="button"
            onClick={() => {
              const i = PALETTE_NAMES.indexOf(palette)
              setPalette(PALETTE_NAMES[(i + 1) % PALETTE_NAMES.length])
            }}
            title={`Palette: ${palette} (click to cycle)`}
            aria-label={`Current palette: ${palette}. Click to cycle.`}
            className="flex h-3 w-14 overflow-hidden rounded-[1px] border border-border hover:border-text-bright transition-colors"
          >
            {colorStops.map((c, i) => (
              <div key={i} style={{ background: c }} className="flex-1" />
            ))}
          </button>
          <span>More</span>
        </div>
      </div>
      <div
        className="grid w-full text-[10px] font-display tracking-[0.1em] text-text-dim uppercase"
        style={{
          gridTemplateColumns: `auto repeat(${totalWeeks}, minmax(14px, 1fr))`,
        }}
      >
        {[...monthSpans.entries()].map(([m, { start, end }]) => (
          <div
            key={`m-${m}`}
            className="leading-none pb-1 text-center"
            style={{
              gridColumnStart: start + 2,
              gridColumnEnd: end + 3,
              gridRowStart: 1,
            }}
          >
            {MONTH_NAMES[m]}
          </div>
        ))}

        {DAY_LABELS.map((label, dow) => (
          <div
            key={`d-${dow}`}
            className="pr-2 flex items-center leading-none"
            style={{ gridColumnStart: 1, gridRowStart: dow + 2 }}
          >
            {label}
          </div>
        ))}

        {cells.map((c) => {
          const clickable = c.inRange && c.count > 0
          return (
            <div
              key={c.key}
              onMouseEnter={() => c.inRange && setHover(c)}
              onMouseLeave={() => setHover((h) => (h?.key === c.key ? null : h))}
              onClick={() => clickable && selectDay(c)}
              className={`group p-[1.5px] ${clickable ? "cursor-pointer" : ""}`}
              style={{ gridColumnStart: c.weekIdx + 2, gridRowStart: c.dow + 2 }}
            >
              <div
                className={`aspect-square rounded-[2px] border transition-transform ${
                  clickable ? "group-hover:scale-150 group-hover:z-10" : c.inRange ? "group-hover:scale-125 group-hover:z-10" : ""
                } ${hover?.key === c.key ? "border-text-bright" : "border-bg/60"}`}
                style={{ background: cellColor(c) }}
              />
            </div>
          )
        })}

        <svg
          aria-hidden
          preserveAspectRatio="none"
          viewBox={`0 0 ${totalWeeks} 7`}
          className="pointer-events-none w-full h-full"
          style={{
            gridColumnStart: 2,
            gridColumnEnd: totalWeeks + 2,
            gridRowStart: 2,
            gridRowEnd: "span 7",
          }}
        >
          {monthPaths.map((d, i) => (
            <path
              key={`del-${i}`}
              d={d}
              stroke={delimColor}
              strokeWidth="1"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
    </div>
  )
}
