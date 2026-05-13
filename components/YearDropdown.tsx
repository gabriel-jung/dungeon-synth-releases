"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

export const NAV_ITEM = "font-display text-[11px] tracking-[0.15em] uppercase transition-colors py-1 cursor-pointer"
export const NAV_INACTIVE = "text-text-dim hover:text-text"
export const NAV_ACTIVE = "text-accent"

export function NavSep() {
  return <span aria-hidden className="text-border text-[10px] leading-none select-none">·</span>
}

// Hover/click dropdown of years. Shared by ReleasesScopeNav ("Past years ▾")
// and StatsScopeNav ("By year ▾"). Visual + interaction is identical; the
// route prefix and idle label differ.
export default function YearDropdown({
  years,
  active,
  activeYear,
  idleLabel,
  hrefFor,
}: {
  years: number[]
  active: boolean
  activeYear: number | null
  idleLabel: string
  hrefFor: (year: number) => string
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const scheduleHide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 140)
  }

  return (
    <div
      className="relative"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`${NAV_ITEM} ${active ? NAV_ACTIVE : NAV_INACTIVE}`}
      >
        {active && activeYear ? activeYear : idleLabel}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-40 bg-bg-card border border-border shadow-lg p-1.5"
        >
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${Math.min(years.length, 5)}, minmax(44px, 1fr))` }}
          >
            {years.map((y) => (
              <Link
                key={y}
                href={hrefFor(y)}
                prefetch
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`px-2 py-1 font-display text-[11px] tracking-[0.1em] tabular-nums text-center transition-colors ${
                  y === activeYear
                    ? "text-accent bg-bg-hover"
                    : "text-text-dim hover:text-accent hover:bg-bg-hover"
                }`}
              >
                {y}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
