"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { MONTH_NAMES } from "@/lib/types"
import { ShortDate } from "./DateHeading"

function HorizontalSlider({
  trackRef,
  index,
  dates,
  monthDots,
  pos,
  onStartDrag,
  onClick,
  onKeyDown,
}: {
  trackRef: RefObject<HTMLDivElement | null>
  index: number
  dates: string[]
  monthDots: { pos: string }[]
  pos: string
  onStartDrag: (e: React.MouseEvent | React.TouchEvent) => void
  onClick: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  return (
    <div className="flex items-center gap-2 w-full px-3 py-1">
      <span className="font-display text-xs text-text-bright whitespace-nowrap shrink-0 tracking-wide">
        <ShortDate date={dates[index] ?? ""} />
      </span>
      <div
        ref={trackRef}
        onMouseDown={onStartDrag}
        onTouchStart={onStartDrag}
        onClick={onClick}
        onKeyDown={onKeyDown}
        role="slider"
        tabIndex={0}
        aria-label="Jump to date"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, dates.length - 1)}
        aria-valuenow={index}
        aria-valuetext={dates[index] ?? ""}
        aria-orientation="horizontal"
        className="relative flex-1 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        style={{ height: "20px" }}
      >
        {/* Track line */}
        <div
          className="absolute rounded-full bg-border"
          style={{ top: "8px", height: "4px", left: "8px", right: "8px" }}
        />

        {/* Filled portion */}
        <div
          className="absolute rounded-full bg-accent"
          style={{ top: "8px", height: "4px", left: "8px", width: pos }}
        />

        {/* Month tick marks — small lines below the track */}
        {monthDots.map((m, i) => (
          <div
            key={i}
            className="absolute bg-text-dim"
            style={{ left: m.pos, top: "14px", width: "1px", height: "5px" }}
          />
        ))}

        {/* Thumb */}
        <div className="absolute" style={{ left: `calc(${pos} - 5px)`, top: "4px" }}>
          <div className="w-3 h-3 rounded-full bg-accent ring-2 ring-bg" style={{ boxShadow: "0 0 8px 1px color-mix(in srgb, var(--color-accent) 50%, transparent)" }} />
        </div>
      </div>
    </div>
  )
}

export default function DateSlider({
  dates,
  orientation = "vertical",
}: {
  dates: string[]
  orientation?: "vertical" | "horizontal"
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [index, setIndex] = useState(0)
  const dragging = useRef(false)
  const horiz = orientation === "horizontal"

  const count = dates.length

  useEffect(() => {
    setIndex(0)
    setMounted(true)

    const list = document.getElementById("release-list")
    if (!list) return

    // Section list is rebuilt as DaySection mounts/unmounts. Refresh the cache
    // when the DOM mutates rather than re-querying on every scroll tick.
    let sections: HTMLElement[] = Array.from(
      list.querySelectorAll<HTMLElement>("section[id^='date-']"),
    )
    const mo = new MutationObserver(() => {
      sections = Array.from(list.querySelectorAll<HTMLElement>("section[id^='date-']"))
    })
    mo.observe(list, { childList: true, subtree: true })

    function onScroll() {
      if (dragging.current) return

      const atBottom = list!.scrollTop + list!.clientHeight >= list!.scrollHeight - 10
      if (atBottom && dates.length > 0) {
        setIndex(dates.length - 1)
        return
      }

      let closestDate: string | null = null
      for (const section of sections) {
        const top = section.offsetTop - list!.offsetTop - list!.scrollTop
        if (top <= 20) {
          closestDate = section.id.replace("date-", "")
        } else {
          break
        }
      }
      if (closestDate) {
        const idx = dates.indexOf(closestDate)
        if (idx >= 0) {
          setIndex(idx)
          emitDateChange(idx)
        }
      }
    }

    list.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      list.removeEventListener("scroll", onScroll)
      mo.disconnect()
    }
  }, [dates])

  const scrollToDate = useCallback((dateStr: string, smooth = false) => {
    const el = document.getElementById(`date-${dateStr}`)
    const list = document.getElementById("release-list")
    if (el && list) {
      const offset = el.offsetTop - list.offsetTop
      list.scrollTo({ top: offset, behavior: smooth ? "smooth" : "instant" })
    } else {
      // Date section not loaded yet — ReleaseList's windowed loader listens
      // for this and fetches the bucket covering the target date.
      window.dispatchEvent(new CustomEvent("load-until-date", { detail: dateStr }))
    }
  }, [])

  function indexFromEvent(
    e: React.MouseEvent | MouseEvent | React.TouchEvent | TouchEvent
  ) {
    if (!trackRef.current || count <= 1) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const pad = 8

    let client: number
    if ("touches" in e) {
      client = horiz
        ? (e.touches[0]?.clientX ?? (e as TouchEvent).changedTouches[0].clientX)
        : (e.touches[0]?.clientY ?? (e as TouchEvent).changedTouches[0].clientY)
    } else {
      client = horiz ? (e as MouseEvent).clientX : (e as MouseEvent).clientY
    }

    const size = horiz ? rect.width : rect.height
    const start = horiz ? rect.left : rect.top
    const usable = size - pad * 2
    const pct = Math.max(0, Math.min(1, (client - start - pad) / usable))
    return Math.round(pct * (count - 1))
  }

  function emitDateChange(idx: number) {
    const frac = count <= 1 ? 0 : idx / (count - 1)
    window.dispatchEvent(new CustomEvent("visible-date-change", { detail: frac }))
  }

  function startDrag(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    dragging.current = true
    const idx = indexFromEvent(e)
    setIndex(idx)
    emitDateChange(idx)

    function onMove(ev: MouseEvent | TouchEvent) {
      ev.preventDefault()
      const i = indexFromEvent(ev)
      setIndex(i)
      emitDateChange(i)
    }

    function onUp(ev: MouseEvent | TouchEvent) {
      const idx = indexFromEvent(ev)
      setIndex(idx)
      emitDateChange(idx)
      if (dates[idx]) scrollToDate(dates[idx])
      // Keep dragging flag on briefly so scroll handler doesn't snap back
      setTimeout(() => { dragging.current = false }, 100)
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onUp)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    document.addEventListener("touchmove", onMove, { passive: false })
    document.addEventListener("touchend", onUp)
  }

  function handleClick(e: React.MouseEvent) {
    const idx = indexFromEvent(e)
    setIndex(idx)
    emitDateChange(idx)
    if (dates[idx]) scrollToDate(dates[idx])
  }

  function handleKey(e: React.KeyboardEvent) {
    if (count <= 1) return
    let next = index
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowUp":
        next = Math.max(0, index - 1); break
      case "ArrowRight":
      case "ArrowDown":
        next = Math.min(count - 1, index + 1); break
      case "PageUp":
        next = Math.max(0, index - 7); break
      case "PageDown":
        next = Math.min(count - 1, index + 7); break
      case "Home":
        next = 0; break
      case "End":
        next = count - 1; break
      default: return
    }
    e.preventDefault()
    setIndex(next)
    emitDateChange(next)
    if (dates[next]) scrollToDate(dates[next])
  }

  // Month dots at first-of-month, labels centered between consecutive dots.
  // Memoised so scroll-driven `index` changes don't re-walk the dates array.
  // Computed before the mounted/empty early return so hook order stays stable.
  const { monthDots, monthLabels } = useMemo(() => {
    const dots: { label: string; frac: number; pos: string }[] = []
    const seenMonths = new Set<number>()
    for (let i = 0; i < count; i++) {
      const m = new Date(dates[i] + "T00:00:00").getMonth()
      if (seenMonths.has(m)) continue
      seenMonths.add(m)
      const f = count <= 1 ? 0 : i / (count - 1)
      dots.push({
        label: MONTH_NAMES[m],
        frac: f,
        pos: `calc(8px + ${f} * (100% - 16px))`,
      })
    }
    const labels: { label: string; pos: string }[] = []
    for (let i = 0; i < dots.length; i++) {
      const startF = dots[i].frac
      const endF = i + 1 < dots.length ? dots[i + 1].frac : (count <= 1 ? 0 : 1)
      const midF = (startF + endF) / 2
      labels.push({
        label: dots[i].label,
        pos: `calc(8px + ${midF} * (100% - 16px))`,
      })
    }
    return { monthDots: dots, monthLabels: labels }
  }, [dates, count])

  if (!mounted || count === 0) {
    return horiz ? <div style={{ height: "44px" }} /> : <div style={{ width: "70px" }} />
  }

  const frac = count <= 1 ? 0 : index / (count - 1)
  const pos = `calc(8px + ${frac} * (100% - 16px))`

  if (horiz) {
    return <HorizontalSlider
      trackRef={trackRef}
      index={index}
      dates={dates}
      monthDots={monthDots}
      pos={pos}
      onStartDrag={startDrag}
      onClick={handleClick}
      onKeyDown={handleKey}
    />
  }

  // Vertical (default)
  return (
    <div className="flex flex-col items-center h-full pb-8">
      {/* Current date label */}
      <div className="mb-3 px-2 py-1 rounded bg-bg-card border border-border font-display text-xs text-text-bright text-center whitespace-nowrap tracking-wide">
        <ShortDate date={dates[index] ?? ""} />
      </div>

      {/* Track area */}
      <div
        ref={trackRef}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onClick={handleClick}
        onKeyDown={handleKey}
        role="slider"
        tabIndex={0}
        aria-label="Jump to date"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, count - 1)}
        aria-valuenow={index}
        aria-valuetext={dates[index] ?? ""}
        aria-orientation="vertical"
        className="relative flex-1 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        style={{ width: "70px" }}
      >
        {/* Track line */}
        <div
          className="absolute rounded-full bg-border"
          style={{ left: "34px", width: "3px", top: "8px", bottom: "8px" }}
        />

        {/* Filled portion */}
        <div
          className="absolute rounded-full bg-accent"
          style={{
            left: "34px",
            width: "3px",
            top: "8px",
            height: pos,
          }}
        />

        {/* Month boundary ticks — small horizontal lines crossing the track */}
        {monthDots.map((m, i) => (
          <div
            key={`tick-${i}`}
            className="absolute bg-border"
            style={{ top: m.pos, left: "29px", width: "13px", height: "2px" }}
          />
        ))}

        {/* Month labels — centered between ticks */}
        {monthLabels.map((m, i) => (
          <div
            key={`label-${i}`}
            className="absolute"
            style={{ top: m.pos, left: "44px", transform: "translateY(-50%)" }}
          >
            <span className="font-display text-[11px] text-text-dim leading-none whitespace-nowrap tracking-wide">
              {m.label}
            </span>
          </div>
        ))}

        {/* End caps — horizontal ticks at track top and bottom */}
        {monthDots[0]?.frac !== 0 && (
          <div
            className="absolute bg-border"
            style={{ top: "8px", left: "29px", width: "13px", height: "2px" }}
          />
        )}
        <div
          className="absolute bg-border"
          style={{ bottom: "8px", left: "29px", width: "13px", height: "2px" }}
        />

        {/* Thumb */}
        <div
          className="absolute flex items-center"
          style={{ top: `calc(${pos} - 7px)`, left: "27px" }}
        >
          <div className="w-3.5 h-3.5 rounded-full bg-accent ring-2 ring-bg" style={{ boxShadow: "0 0 8px 1px color-mix(in srgb, var(--color-accent) 50%, transparent)" }} />
        </div>
      </div>
    </div>
  )
}
