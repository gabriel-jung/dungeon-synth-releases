"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"

const tabs = [
  { href: "/", label: "Recent" },
  { href: "/past", label: "Past" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/stats", label: "Stats" },
  { href: "/genres", label: "Genres" },
]

export default function TabBar({ pastYears = [] }: { pastYears?: number[] }) {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-4 sm:gap-6 pt-2">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href)
        const className = `font-display text-xs tracking-[0.1em] uppercase transition-colors py-2 ${
          active
            ? "text-accent border-b border-accent"
            : "text-text-dim hover:text-text active:text-accent-hover border-b border-transparent"
        }`

        if (tab.href === "/past" && pastYears.length > 0) {
          return (
            <PastTab
              key={tab.href}
              active={active}
              className={className}
              years={pastYears}
            />
          )
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={className}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}

function PastTab({ active, className, years }: { active: boolean; className: string; years: number[] }) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const scheduleHide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 120)
  }

  return (
    <div
      className="relative"
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onFocus={show}
      onBlur={scheduleHide}
    >
      <Link
        href="/past"
        prefetch
        aria-current={active ? "page" : undefined}
        aria-haspopup="true"
        aria-expanded={open}
        className={className}
        onClick={() => setOpen(false)}
      >
        Past
      </Link>
      {open && (
        <div
          role="menu"
          className="absolute left-1/2 -translate-x-1/2 top-full z-40 mt-1 bg-bg-card border border-border shadow-lg p-1.5"
        >
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${Math.min(years.length, 5)}, minmax(44px, 1fr))` }}
          >
            {years.map((y) => (
              <Link
                key={y}
                href={`/past/${y}`}
                prefetch
                role="menuitem"
                onClick={() => setOpen(false)}
                className="px-2 py-1 font-display text-[11px] tracking-[0.1em] text-text-dim hover:text-accent hover:bg-bg-hover tabular-nums text-center transition-colors"
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
