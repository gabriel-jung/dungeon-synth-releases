"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"
import { useOpenModal } from "@/lib/useModalUrl"
import { yearFromPath } from "@/lib/types"

const ITEM = "font-display text-[11px] tracking-[0.15em] uppercase transition-colors py-1 cursor-pointer"
const INACTIVE = "text-text-dim hover:text-text"
const ACTIVE = "text-accent"

// Scope nav for the releases area: Recent · Past Years ▾ · Upcoming
// One visual vocabulary for all three. No counts, no badges.
export default function ReleasesScopeNav({ pastYears = [] }: { pastYears?: number[] }) {
  const pathname = usePathname() ?? "/"
  const onRecent = pathname === "/"
  const onYear = pathname.startsWith("/releases/")
  const openModal = useOpenModal()
  const openUpcoming = () => openModal("upcoming", true)

  return (
    <div className="flex items-center gap-2">
      <Link
        href="/"
        prefetch
        aria-current={onRecent ? "page" : undefined}
        className={`${ITEM} ${onRecent ? ACTIVE : INACTIVE}`}
      >
        Recent
      </Link>
      <Sep />
      {pastYears.length > 0 ? (
        <PastYearsPicker years={pastYears} active={onYear} currentYear={yearFromPath(pathname)} />
      ) : (
        <span className={`${ITEM} text-border`}>Past years</span>
      )}
      <Sep />
      <button type="button" onClick={openUpcoming} className={`${ITEM} ${INACTIVE}`}>
        Upcoming
      </button>
    </div>
  )
}

function Sep() {
  return <span aria-hidden className="text-border text-[10px] leading-none select-none">·</span>
}

function PastYearsPicker({
  years,
  active,
  currentYear,
}: {
  years: number[]
  active: boolean
  currentYear: number | null
}) {
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        className={`${ITEM} ${active ? ACTIVE : INACTIVE}`}
      >
        {active && currentYear ? currentYear : "Past years"}
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
                href={`/releases/${y}`}
                prefetch
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`px-2 py-1 font-display text-[11px] tracking-[0.1em] tabular-nums text-center transition-colors ${
                  y === currentYear
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
