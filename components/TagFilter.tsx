"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

type TagState = "neutral" | "include" | "exclude"

function TagButton({
  open,
  setOpen,
  activeCount,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  activeCount: number
}) {
  const slotRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    slotRef.current = document.getElementById("tag-filter-slot")
    setMounted(true)
  }, [])

  if (!mounted || !slotRef.current) return null

  return createPortal(
    <button
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      className="font-display text-xs tracking-[0.1em] text-text-dim hover:text-text transition-colors cursor-pointer flex items-center gap-1.5"
    >
      <span aria-hidden="true">{open ? "▾" : "▸"}</span> Filter
      {activeCount > 0 && (
        <span className="bg-accent/20 text-accent text-[10px] px-1.5 rounded-full">
          {activeCount}
        </span>
      )}
    </button>,
    slotRef.current,
  )
}

function cycle(state: TagState): TagState {
  if (state === "neutral") return "include"
  if (state === "include") return "exclude"
  return "neutral"
}

const TOP_COUNT = 50
const DEBOUNCE_MS = 600

export default function TagFilter({ tags }: { tags: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  // Local tag state for instant UI feedback
  const [localIncluded, setLocalIncluded] = useState<Set<string>>(new Set(searchParams.getAll("tag")))
  const [localExcluded, setLocalExcluded] = useState<Set<string>>(new Set(searchParams.getAll("xtag")))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync from URL when searchParams change externally
  useEffect(() => {
    setLocalIncluded(new Set(searchParams.getAll("tag")))
    setLocalExcluded(new Set(searchParams.getAll("xtag")))
  }, [searchParams])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const activeCount = localIncluded.size + localExcluded.size

  const topTags = tags.slice(0, TOP_COUNT).sort()
  const allTagsSorted = [...tags].sort()
  const baseTags = showAll ? allTagsSorted : topTags
  // Always include active tags even if not in top N
  const activeTags = tags.filter((t) => localIncluded.has(t) || localExcluded.has(t))
  const visibleTags = [...new Set([...activeTags, ...baseTags])].sort()

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

    // Debounce the URL push
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => pushUrl(newInc, newExc), DEBOUNCE_MS)
  }

  if (tags.length === 0) return null

  return (
    <>
      <TagButton open={open} setOpen={setOpen} activeCount={activeCount} />

      {open && (
        <div className="border-b border-border px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {visibleTags.map((tag) => {
              const state = stateOf(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggle(tag)}
                  className={`text-xs tracking-wide px-2 py-1 cursor-pointer transition-colors ${
                    state === "include"
                      ? "bg-tag-include/20 text-tag-include border-b-2 border-tag-include"
                      : state === "exclude"
                        ? "bg-tag-exclude/20 text-tag-exclude border-b-2 border-tag-exclude line-through"
                        : "text-text-dim border-b border-border/40 hover:border-border hover:text-text"
                  }`}
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
                <span aria-hidden="true">{showAll ? "▾" : "▸"}</span> {showAll ? "top genres" : `all ${tags.length} genres`}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
