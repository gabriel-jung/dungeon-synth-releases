"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { openModal, pushModalUrl, toQueryString } from "@/lib/modalUrl"
import {
  buildTagGraph,
  computeVisibleEdges,
  edgeEndpoints,
  type TagCount,
  type TagPair,
} from "@/lib/tagGraphLogic"
import { useTagGraphState } from "@/lib/useTagGraphState"
import { useForceLayout } from "@/lib/useForceLayout"
import { useDebounced } from "@/lib/useDebounced"
import TagGraphSettingsPanel, { TagGraphSettingsButton } from "./TagGraphControls"
import TagGraphAbout from "./TagGraphAbout"
import TagGraphRenderer, { readThemeColors, type ThemeColors } from "./TagGraphRenderer"
import type { ForceGraphMethods } from "react-force-graph-2d"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FgMethods = ForceGraphMethods<any, any>

// Zoom slider bounds. The slider track is log-mapped so 1x sits near the
// middle and a step feels equal whether you zoom in or out. Keep these in
// sync with minZoom/maxZoom on the ForceGraph2D in TagGraphRenderer.
const ZOOM_MIN = 0.1
const ZOOM_MAX = 16
const ZOOM_SPAN = ZOOM_MAX / ZOOM_MIN
// Slider position (0..1) <-> zoom factor.
const posToZoom = (p: number) => ZOOM_MIN * ZOOM_SPAN ** p
const zoomToPos = (k: number) =>
  Math.log(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k)) / ZOOM_MIN) / Math.log(ZOOM_SPAN)

export default function TagGraphCanvas({
  counts,
  pairs,
  itemLabel = "genre",
}: {
  counts: TagCount[]
  pairs: TagPair[]
  itemLabel?: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<FgMethods | undefined>(undefined)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const labelSingular = itemLabel
  const labelPlural = `${itemLabel}s`
  const maxTopN = counts.length

  const state = useTagGraphState(maxTopN)
  const [showSettings, setShowSettings] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)

  // Open one popover at a time. Centralised so each trigger only has to
  // call this with its own key instead of remembering every sibling.
  const openOnly = (which: "about" | "view" | "export" | "settings" | null) => {
    setAboutOpen(which === "about")
    setViewOpen(which === "view")
    setExportOpen(which === "export")
    setShowSettings(which === "settings")
  }
  const [reseedTick, setReseedTick] = useState(0)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [themeColors, setThemeColors] = useState<ThemeColors>(readThemeColors)
  const [shareCopied, setShareCopied] = useState(false)
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only the FIRST settle for a given (nodes, edges) set should auto-fit;
  // physics re-settles must preserve the user's current zoom so parameter
  // changes are actually visible.
  const needsFitRef = useRef(true)

  useEffect(() => () => {
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current)
  }, [])

  // Debounce inputs that trigger graph rebuild or edge re-filter.
  const debouncedTopN = useDebounced(state.topN, 200)
  const debouncedShowTopPct = useDebounced(state.showTopPct, 200)

  // Tag filter params from the URL (ScopeModal uses the same `tag`/`xtag`
  // convention to ban or focus tags).
  const banTagsKey = searchParams.getAll("xtag").join("|")
  const clickedTagsKey = searchParams.getAll("tag").join("|")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const banTags = useMemo(() => new Set(searchParams.getAll("xtag")), [banTagsKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clickedTags = useMemo(() => new Set(searchParams.getAll("tag")), [clickedTagsKey])

  const lowerNames = useMemo(
    () => counts.map((c) => [c.name, c.name.toLowerCase()] as const),
    [counts],
  )

  const { nodes, edges } = useMemo(
    () => buildTagGraph(counts, pairs, state.metric, debouncedTopN, state.clustering),
    [counts, pairs, state.metric, debouncedTopN, state.clustering],
  )

  const visibleEdges = useMemo(
    () => computeVisibleEdges(edges, state.minLinks, debouncedShowTopPct),
    [edges, state.minLinks, debouncedShowTopPct],
  )

  const edgesForNode = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of edges) {
      const [s, t] = edgeEndpoints(e)
      m.set(s, (m.get(s) ?? 0) + 1)
      m.set(t, (m.get(t) ?? 0) + 1)
    }
    return m
  }, [edges])

  const hiTags = useMemo(() => {
    const set = new Set(clickedTags)
    const q = state.searchQuery.trim().toLowerCase()
    if (q) {
      for (const [name, lower] of lowerNames) if (lower.includes(q)) set.add(name)
    }
    if (state.focusOnHover && hoveredId) set.add(hoveredId)
    return set
  }, [clickedTags, state.searchQuery, lowerNames, hoveredId, state.focusOnHover])

  // Adjacency index built once per visibleEdges change. Hover ticks then
  // only do O(|hiTags|) lookups instead of O(|E|) edge walks.
  const neighborMap = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of visibleEdges) {
      const [s, t] = edgeEndpoints(e)
      if (!m.has(s)) m.set(s, new Set())
      if (!m.has(t)) m.set(t, new Set())
      m.get(s)!.add(t)
      m.get(t)!.add(s)
    }
    return m
  }, [visibleEdges])

  const hiNeighbors = useMemo(() => {
    const n = new Set<string>()
    for (const id of hiTags) {
      const neigh = neighborMap.get(id)
      if (neigh) for (const x of neigh) n.add(x)
    }
    return n
  }, [neighborMap, hiTags])

  // Force layout (settle + hulls + cluster forces).
  const { ready, hullCacheRef, spacingStats } = useForceLayout({
    category: itemLabel,
    nodes,
    edges,
    size,
    forces: {
      repel: state.repel,
      linkDistance: state.linkDistance,
      center: state.center,
      clusterCohesion: state.clusterCohesion,
    },
    clustering: state.clustering,
    reseedTick,
    cacheSignature: [
      itemLabel,
      state.metric,
      debouncedTopN,
      state.minLinks,
      debouncedShowTopPct,
    ].join("|"),
  })

  // Size + ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [fullscreen])

  // Re-resolve theme colors on theme switch.
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeColors(readThemeColors()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => mo.disconnect()
  }, [])

  // Mark needs-fit when the graph shape changes.
  useEffect(() => {
    needsFitRef.current = true
  }, [nodes, edges])

  // Escape closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (searchParams.get("genre") || searchParams.get("album")) return
      if (aboutOpen || viewOpen || exportOpen || showSettings) openOnly(null)
      else if (fullscreen) setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [aboutOpen, viewOpen, exportOpen, showSettings, fullscreen, searchParams])

  // Arrow pan / +- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if (target?.isContentEditable) return
      const fg = fgRef.current
      if (!fg) return
      const step = 60
      let dx = 0, dy = 0, zf = 1
      if (e.key === "ArrowLeft") dx = -step
      else if (e.key === "ArrowRight") dx = step
      else if (e.key === "ArrowUp") dy = -step
      else if (e.key === "ArrowDown") dy = step
      else if (e.key === "+" || e.key === "=") zf = 1.2
      else if (e.key === "-" || e.key === "_") zf = 1 / 1.2
      else return
      e.preventDefault()
      const k = fg.zoom()
      if (zf !== 1) { fg.zoom(k * zf, 120); return }
      const c = fg.centerAt()
      fg.centerAt(c.x + dx / k, c.y + dy / k, 120)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const openTagModal = (tags: string[]) => {
    let next = new URLSearchParams(window.location.search)
    next.delete("genre")
    for (const t of tags) next = openModal(next, "genre", t)
    pushModalUrl(`${pathname}${toQueryString(next)}`)
  }

  const setZoomFromSlider = (k: number) => {
    fgRef.current?.zoom(k, 0)
  }

  const downloadPng = () => {
    const container = containerRef.current
    if (!container) return
    const canvas = container.querySelector("canvas") as HTMLCanvasElement | null
    if (!canvas) return
    const out = document.createElement("canvas")
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = themeColors.bg || "#0a0a0a"
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0)
    out.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${labelSingular}-graph-${state.metric}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, "image/png")
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareCopied(true)
      if (shareTimerRef.current) clearTimeout(shareTimerRef.current)
      shareTimerRef.current = setTimeout(() => setShareCopied(false), 1800)
    } catch {
      // older browsers / insecure contexts
    }
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${labelSingular.charAt(0).toUpperCase()}${labelSingular.slice(1)} co-occurrence graph: ${nodes.length} ${labelPlural}, ${visibleEdges.size} connections`}
      className={
        fullscreen
          ? "fixed inset-0 z-[9000] bg-bg overflow-hidden"
          : "relative h-full w-full overflow-hidden"
      }
    >
      <TagGraphRenderer
        nodes={nodes}
        edges={edges}
        visibleEdges={visibleEdges}
        hullCacheRef={hullCacheRef}
        size={size}
        fgRef={fgRef}
        ready={ready}
        banTags={banTags}
        hiTags={hiTags}
        hiNeighbors={hiNeighbors}
        hoveredId={hoveredId}
        clustering={state.clustering}
        nodeScale={state.nodeScale}
        nodeOpacity={state.nodeOpacity}
        labelSize={state.labelSize}
        labelAutoSize={state.labelAutoSize}
        labelPos={state.labelPos}
        textFade={state.textFade}
        focusOnHover={state.focusOnHover}
        showHulls={state.showHulls && state.clustering}
        themeColors={themeColors}
        onNodeClick={(id) => openTagModal([id])}
        onEdgeClick={(a, b) => openTagModal([a, b])}
        onHoverNode={setHoveredId}
        onZoomChange={setZoomLevel}
        needsFitRef={needsFitRef}
        edgesForNode={edgesForNode}
      />

      {/* Top-right: [?] [⤢ view] [↗ export] [⚙ settings] */}
      <div className="absolute top-3 right-3 z-30 flex items-start gap-2 text-[10px] tracking-[0.15em] uppercase font-display text-text-dim">
        {/* About */}
        <div className="relative">
          <button
            type="button"
            onClick={() => openOnly(aboutOpen ? null : "about")}
            aria-expanded={aboutOpen}
            aria-label="About this graph"
            className={`w-7 h-7 flex items-center justify-center border rounded-sm font-sans italic text-sm transition-colors cursor-pointer ${
              aboutOpen
                ? "bg-bg-card border-accent/40 text-accent"
                : "bg-bg-card border-border/60 text-text-dim hover:text-text-bright hover:border-accent/50"
            }`}
          >
            ?
          </button>
          <TagGraphAbout
            open={aboutOpen}
            onClose={() => setAboutOpen(false)}
            metric={state.metric}
            labelSingular={labelSingular}
            labelPlural={labelPlural}
          />
        </div>

        {/* View: zoom + fullscreen */}
        <div className="relative">
          <button
            type="button"
            onClick={() => openOnly(viewOpen ? null : "view")}
            aria-expanded={viewOpen}
            aria-label="View controls"
            title="View controls"
            className={`w-7 h-7 flex items-center justify-center border rounded-sm text-base leading-none transition-colors cursor-pointer ${
              viewOpen
                ? "bg-bg-card border-accent/40 text-accent"
                : "bg-bg-card border-border/60 text-text-dim hover:text-text-bright hover:border-accent/50"
            }`}
          >
            ⤢
          </button>
          {viewOpen && (
            <div className="absolute top-full right-0 mt-2 w-[min(15rem,calc(100vw-1.5rem))] bg-bg-card border border-border/60 rounded-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                <span className="font-display text-[10px] tracking-[0.2em] uppercase text-accent">⤢ View</span>
                <button
                  type="button"
                  onClick={() => setViewOpen(false)}
                  aria-label="Close"
                  className="w-5 h-5 flex items-center justify-center text-text-dim hover:text-text-bright text-base leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>
              <div className="px-3 py-3 flex flex-col gap-3 text-[11px] tracking-normal normal-case font-sans">
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-text">Zoom</span>
                    <button
                      type="button"
                      onClick={() => setZoomFromSlider(1)}
                      title="Reset zoom"
                      className={`tabular-nums text-[10px] transition-colors cursor-pointer ${
                        Math.abs(zoomLevel - 1) < 0.02 ? "text-text-dim" : "text-accent hover:text-accent-hover"
                      }`}
                    >
                      {zoomLevel.toFixed(1)}×
                    </button>
                  </div>
                  <input
                    type="range" min={0} max={1} step={0.005} value={zoomToPos(zoomLevel)}
                    onChange={(e) => setZoomFromSlider(posToZoom(Number(e.target.value)))}
                    aria-label="Zoom"
                    className="w-full accent-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setFullscreen((v) => !v)}
                  className="flex items-center justify-between gap-2 text-text hover:text-accent transition-colors cursor-pointer"
                >
                  <span>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
                  <span className="text-text-dim text-base leading-none">⤢</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Export: copy link + download PNG */}
        <div className="relative">
          <button
            type="button"
            onClick={() => openOnly(exportOpen ? null : "export")}
            aria-expanded={exportOpen}
            aria-label="Export"
            title="Export"
            className={`w-7 h-7 flex items-center justify-center border rounded-sm text-base leading-none transition-colors cursor-pointer ${
              exportOpen
                ? "bg-bg-card border-accent/40 text-accent"
                : "bg-bg-card border-border/60 text-text-dim hover:text-text-bright hover:border-accent/50"
            }`}
          >
            ↗
          </button>
          {exportOpen && (
            <div className="absolute top-full right-0 mt-2 w-[min(15rem,calc(100vw-1.5rem))] bg-bg-card border border-border/60 rounded-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
                <span className="font-display text-[10px] tracking-[0.2em] uppercase text-accent">↗ Export</span>
                <button
                  type="button"
                  onClick={() => setExportOpen(false)}
                  aria-label="Close"
                  className="w-5 h-5 flex items-center justify-center text-text-dim hover:text-text-bright text-base leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>
              <div className="px-3 py-3 flex flex-col gap-2 text-[11px] tracking-normal normal-case font-sans">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="flex items-center justify-between gap-2 text-text hover:text-accent transition-colors cursor-pointer"
                >
                  <span>{shareCopied ? "Link copied" : "Copy link"}</span>
                  <span className="text-text-dim text-base leading-none">↗</span>
                </button>
                <button
                  type="button"
                  onClick={downloadPng}
                  className="flex items-center justify-between gap-2 text-text hover:text-accent transition-colors cursor-pointer"
                >
                  <span>Download PNG</span>
                  <span className="text-text-dim text-base leading-none">↓</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <TagGraphSettingsButton
          open={showSettings}
          onToggle={() => openOnly(showSettings ? null : "settings")}
        />
      </div>

      {/* Right-docked settings panel — slides in from the right edge */}
      {showSettings && (
        <div className="absolute top-12 right-3 bottom-3 z-20 w-[min(20rem,calc(100vw-1.5rem))]">
          <TagGraphSettingsPanel
            state={state}
            maxTopN={maxTopN}
            labelSingular={labelSingular}
            labelPlural={labelPlural}
            spacingStats={spacingStats}
            searchQuery={state.searchQuery}
            onSearchChange={state.setSearchQuery}
            onReseed={() => {
              needsFitRef.current = true
              setReseedTick((t) => t + 1)
            }}
            onClose={() => setShowSettings(false)}
          />
        </div>
      )}


      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="font-display text-accent/60 text-sm tracking-[0.25em] uppercase mb-1">
              ❧ empty cartography
            </div>
            <div className="font-sans italic text-text-dim text-xs">
              no {labelPlural} match the current filter
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
