"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useResetOnChange } from "@/lib/useResetOnChange"

type TagState = "neutral" | "include" | "exclude"

const CHIP_CLASS: Record<TagState, string> = {
  include: "bg-tag-include/20 text-tag-include border-b-2 border-tag-include",
  exclude: "bg-tag-exclude/20 text-tag-exclude border-b-2 border-tag-exclude line-through",
  neutral: "text-text-dim border-b-2 border-border/40 hover:border-border hover:text-text",
}

function TagButton({
  open,
  setOpen,
  activeCount,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  activeCount: number
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    // Slot lives in the root layout; one read on hydration is enough.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById("tag-filter-slot"))
  }, [])

  if (!slot) return null

  return createPortal(
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="font-display text-xs tracking-[0.1em] text-text-dim hover:text-text transition-colors cursor-pointer flex items-center gap-1.5"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Tag Filter
        {activeCount > 0 && (
          <span className="bg-accent/20 text-accent text-[10px] px-1.5 rounded-full">
            {activeCount}
          </span>
        )}
      </button>
      <span
        title="Tags scraped from Bandcamp release pages"
        aria-label="Tags scraped from Bandcamp release pages"
        className="font-display text-[10px] text-text-dim/60 hover:text-text-dim cursor-help border border-text-dim/30 rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none"
      >
        ?
      </span>
    </div>,
    slot,
  )
}

function cycle(state: TagState): TagState {
  if (state === "neutral") return "include"
  if (state === "include") return "exclude"
  return "neutral"
}

const TOP_COUNT = 50
const DEBOUNCE_MS = 600

export default function TagFilter({ tagsByCategory }: { tagsByCategory: Record<string, string[]> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const categories = useMemo(() => Object.keys(tagsByCategory), [tagsByCategory])
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [tab, setTab] = useState<string>(categories[0] ?? "")

  const [localIncluded, setLocalIncluded] = useState<Set<string>>(new Set(searchParams.getAll("tag")))
  const [localExcluded, setLocalExcluded] = useState<Set<string>>(new Set(searchParams.getAll("xtag")))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Back/forward / external link nav: pull URL state back into the local mirror.
  useResetOnChange([searchParams], () => {
    setLocalIncluded(new Set(searchParams.getAll("tag")))
    setLocalExcluded(new Set(searchParams.getAll("xtag")))
  })

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const activeCount = localIncluded.size + localExcluded.size

  const tags = useMemo(() => tagsByCategory[tab] ?? [], [tagsByCategory, tab])
  // Active tags from other categories are surfaced via FilterChips, not here.
  const visibleTags = useMemo(() => {
    const sorted = [...tags].sort()
    const base = showAll ? sorted : sorted.slice(0, TOP_COUNT)
    const active = tags.filter((t) => localIncluded.has(t) || localExcluded.has(t))
    return [...new Set([...active, ...base])].sort()
  }, [tags, showAll, localIncluded, localExcluded])

  function stateOf(tag: string): TagState {
    if (localIncluded.has(tag)) return "include"
    if (localExcluded.has(tag)) return "exclude"
    return "neutral"
  }

  const pushUrl = useCallback((inc: Set<string>, exc: Set<string>) => {
    const params = new URLSearchParams()
    const q = searchParams.get("q")
    if (q) params.set("q", q)
    for (const t of inc) params.append("tag", t)
    for (const t of exc) params.append("xtag", t)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }, [router, searchParams, pathname])

  function toggle(tag: string) {
    const next = cycle(stateOf(tag))

    const newInc = new Set(localIncluded)
    const newExc = new Set(localExcluded)
    newInc.delete(tag)
    newExc.delete(tag)
    if (next === "include") newInc.add(tag)
    if (next === "exclude") newExc.add(tag)

    setLocalIncluded(newInc)
    setLocalExcluded(newExc)

    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => pushUrl(newInc, newExc), DEBOUNCE_MS)
  }

  if (pathname?.startsWith("/graphs")) return null
  if (Object.values(tagsByCategory).every((l) => l.length === 0)) return null

  return (
    <>
      <TagButton
        open={open}
        setOpen={setOpen}
        activeCount={activeCount}
      />

      {open && (
        <div className="absolute inset-x-0 top-0 z-40 max-h-[70vh] overflow-y-auto bg-bg border-b border-border shadow-lg px-4 sm:px-6 py-3">
          {categories.length > 1 && (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 mb-2">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => { setTab(c); setShowAll(false) }}
                  aria-pressed={c === tab}
                  className={`font-display text-[10px] tracking-[0.15em] uppercase transition-colors cursor-pointer ${
                    c === tab ? "text-accent" : "text-text-dim hover:text-text"
                  }`}
                >
                  {c}s
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => {
              const state = stateOf(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggle(tag)}
                  className={`text-xs tracking-wide px-2 py-1 cursor-pointer transition-colors ${CHIP_CLASS[state]}`}
                >
                  {tag}
                </button>
              )
            })}
            {tags.length > TOP_COUNT && (
              <button
                onClick={() => setShowAll(!showAll)}
                aria-expanded={showAll}
                className="font-display text-[11px] tracking-wide text-text-dim hover:text-text transition-colors cursor-pointer px-1"
              >
                <span aria-hidden="true">{showAll ? "▾" : "▸"}</span> {showAll ? "show less" : "show more"}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
