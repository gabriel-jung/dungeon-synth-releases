"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname, useSearchParams } from "next/navigation"
import { tagFilterQs, yearFromPath } from "@/lib/types"
import CalendarHeatmap from "./CalendarHeatmap"

// Calendar icon that reveals a floating heatmap popover. Collapsed state is
// a single-icon button so the scope row takes no extra vertical space. Popover
// is portalled and positioned with getBoundingClientRect so it fits regardless
// of the button's horizontal position.
export default function HeatmapPopoverButton({
  today,
  defaultYear,
}: {
  today: string
  defaultYear: number
}) {
  const pathname = usePathname() ?? "/"
  const year = yearFromPath(pathname) ?? defaultYear

  const searchParams = useSearchParams()
  const tagQs = useMemo(() => tagFilterQs(searchParams), [searchParams])

  const [open, setOpen] = useState(false)
  const [days, setDays] = useState<{ date: string; n: number }[] | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  // Invalidate cached payload when year or filter changes.
  useEffect(() => { setDays(null) }, [year, tagQs])

  useEffect(() => {
    if (!open || days) return
    const ctrl = new AbortController()
    const extra = tagQs ? `&${tagQs}` : ""
    fetch(`/api/daily?year=${year}${extra}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.days) setDays(d.days) })
      .catch(() => {})
    return () => ctrl.abort()
  }, [open, days, year, tagQs])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const update = () => {
      const btn = btnRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const margin = 16
      const width = Math.min(920, window.innerWidth - margin * 2)
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
      setPos({ top: rect.bottom + 8, left, width })
    }
    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popRef.current && !popRef.current.contains(target) &&
        btnRef.current && !btnRef.current.contains(target)
      ) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const popover = open && pos && typeof document !== "undefined" ? createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label={`Daily release activity for ${year}`}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 50 }}
      className="bg-bg-card border border-border shadow-lg p-4"
    >
      <div className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim mb-3">
        Daily release activity · {year}
      </div>
      {days ? (
        <CalendarHeatmap days={days} year={year} today={today} />
      ) : (
        <div className="h-24 flex items-center justify-center text-text-dim text-xs italic animate-pulse">
          loading…
        </div>
      )}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Daily release activity — ${year}`}
        title={`Daily release activity — ${year}`}
        className="text-text-dim hover:text-accent transition-colors cursor-pointer leading-none w-5 h-5 flex items-center justify-center border border-border/50 hover:border-accent/60"
      >
        <span aria-hidden className="text-[11px]">▦</span>
      </button>
      {popover}
    </>
  )
}
