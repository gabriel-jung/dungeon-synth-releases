"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from "d3-force"
import { polygonHull } from "d3-polygon"
import { mean } from "d3-array"
import { scaleLinear, scaleSqrt } from "d3-scale"
import { usePathname, useSearchParams } from "next/navigation"
import { openModal, pushModalUrl, toQueryString } from "@/lib/modalUrl"
import {
  buildTagGraph,
  clusterColor,
  computeVisibleEdges,
  edgeEndpoints,
  parseEnum,
  parseNumber,
  METRICS,
  METRIC_VALUES,
  LABEL_POS_VALUES,
  type Metric,
  type LabelPos,
  type TagCount,
  type TagPair,
  type TagNode,
  type TagEdge,
} from "@/lib/tagGraphLogic"
import type { ForceGraphMethods, ForceGraphProps } from "react-force-graph-2d"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as React.ForwardRefExoticComponent<ForceGraphProps<any, any> & React.RefAttributes<ForceGraphMethods<any, any> | undefined>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FgMethods = ForceGraphMethods<any, any>

// Lazy-loaded so katex (see TagGraphTex) only ships when the About panel opens.
const Tex = dynamic(() => import("./TagGraphTex"), {
  ssr: false,
  loading: () => null,
})

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

type HoverInfo =
  | { kind: "node"; name: string; count: number; conns: number }
  | { kind: "edge"; a: string; b: string; inter: number; weight: number }

// Canvas ctx.fillStyle won't evaluate CSS custom-property strings, so we
// resolve the active theme's hex once and convert to rgba() with alpha
// applied per draw call. The canvas paint loop calls this hundreds of
// times per frame; cache the parsed channels so we never regex+parseInt
// the same hex twice.
const RGB_CACHE = new Map<string, [number, number, number] | null>()
function hexToRgba(hex: string, alpha: number): string {
  let rgb = RGB_CACHE.get(hex)
  if (rgb === undefined) {
    const m = hex.match(/^#?([0-9a-f]{6})$/i)
    if (m) {
      const n = parseInt(m[1], 16)
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    } else {
      rgb = null
    }
    RGB_CACHE.set(hex, rgb)
  }
  if (!rgb) return hex
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`
}

type ThemeColors = { font: string; text: string; textDim: string; bg: string }

// Synchronous probe used by the lazy state initializer (so canvas paint
// has real values on the first frame) and by the data-theme observer.
function readThemeColors(): ThemeColors {
  if (typeof document === "undefined") {
    return { font: "serif", text: "", textDim: "", bg: "" }
  }
  const probe = document.createElement("span")
  probe.className = "font-display"
  probe.style.visibility = "hidden"
  probe.style.position = "absolute"
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const font = cs.fontFamily || "serif"
  const root = getComputedStyle(document.documentElement)
  const text = root.getPropertyValue("--color-text-bright").trim()
  const textDim = root.getPropertyValue("--color-text-dim").trim()
  const bg = root.getPropertyValue("--color-bg").trim()
  document.body.removeChild(probe)
  return { font, text, textDim, bg }
}

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
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const fgRef = useRef<FgMethods | undefined>(undefined)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const labelSingular = itemLabel
  const labelPlural = `${itemLabel}s`

  const maxTopN = counts.length
  const topNDigits = String(maxTopN).length
  const defaultTopN = Math.min(50, maxTopN)

  // URL → initial state, read once on mount. Subsequent URL writes flow
  // the other direction (see the sync effect below). Safe to keep empty
  // deps: `TagGraphCanvas` is mounted per route (`/graphs/genres` and `/graphs/themes`
  // are separate pages), so `counts`/`maxTopN` never mutate under us.
  const initial = useMemo(() => ({
    metric: parseEnum<Metric>(searchParams.get("m"), METRIC_VALUES, "jaccard"),
    topN: parseNumber(searchParams.get("n"), defaultTopN, 10, maxTopN),
    showTopPct: parseNumber(searchParams.get("d"), 30, 1, 100),
    minLinks: parseNumber(searchParams.get("ml"), 2, 0, 8),
    labelPos: parseEnum<LabelPos>(searchParams.get("lp"), LABEL_POS_VALUES, "inside"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const DEFAULTS = useMemo(() => ({
    metric: "jaccard" as Metric,
    topN: defaultTopN,
    showTopPct: 30,
    minLinks: 2,
    repulsion: 80,
    linkStiffness: 0.5,
    gravity: 0.05,
    linkSpread: 1,
    interRatio: 4,
    linkScale: 1.5,
    nodeScale: 1,
    nodeOpacity: 0.75,
    labelSize: 1,
    labelLimit: null as number | null,
    labelThreshold: 7,
    labelPos: "inside" as LabelPos,
  }), [defaultTopN])

  const [metric, setMetric] = useState<Metric>(initial.metric)
  const [topN, setTopN] = useState(initial.topN)
  const [topNDraft, setTopNDraft] = useState<string | null>(null)
  const [showTopPct, setShowTopPct] = useState(initial.showTopPct)
  const [minLinks, setMinLinks] = useState(initial.minLinks)
  const [repulsion, setRepulsion] = useState(80)
  const [linkStiffness, setLinkStiffness] = useState(0.5)
  const [gravity, setGravity] = useState(0.05)
  const [linkSpread, setLinkSpread] = useState(1)
  const [interRatio, setInterRatio] = useState(4)
  // Cohesion + cluster-separation are fixed — they're insurance forces for
  // sparse/isolated clusters. Inter/intra ratio does the visible work.
  const COHESION = 0.2
  const CLUSTER_SEP = 0.2
  const [linkScale, setLinkScale] = useState(1.5)
  const [nodeScale, setNodeScale] = useState(1)
  const [nodeOpacity, setNodeOpacity] = useState(0.75)
  const [labelSize, setLabelSize] = useState(1)
  const [labelLimit, setLabelLimit] = useState<number | null>(null)
  const [labelThreshold, setLabelThreshold] = useState(7) // min on-screen px for a label to render
  const [labelPos, setLabelPos] = useState<LabelPos>(initial.labelPos)
  // Per-control reset — renders a tiny ↺ only when the value differs from
  // its default. Click restores just that one control.
  const resetBtn = <T,>(value: T, dflt: T, reset: () => void) =>
    value === dflt ? null : (
      <button
        type="button"
        onClick={reset}
        title="Reset to default"
        aria-label="Reset to default"
        className="text-[10px] leading-none text-text-dim hover:text-accent transition-colors"
      >
        ↺
      </button>
    )

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [zoomLevel, setZoomLevel] = useState(1)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  // Touch devices fire onNodeHover on tap but never onMouseMove, so the
  // tooltip would land at (0,0) and overlap the header. Skip hover UI when
  // the primary pointer is coarse.
  const coarsePointerRef = useRef(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(pointer: coarse)")
    coarsePointerRef.current = mq.matches
    const onChange = (e: MediaQueryListEvent) => { coarsePointerRef.current = e.matches }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  const [spacingStats, setSpacingStats] = useState<{ intra: number; inter: number; ratio: number } | null>(null)
  const spacingStatsRef = useRef<{ intra: number; inter: number; ratio: number } | null>(null)
  // Hull geometry (expanded polygon points per cluster) is constant between
  // settles — positions are pinned. Cache once per settle, reuse each frame
  // so pan/zoom doesn't re-run polygonHull + array allocations.
  const hullCacheRef = useRef<Map<number, [number, number][]>>(new Map())
  const [reseedTick, setReseedTick] = useState(0) // bumped → force a fresh sync-settle
  // Settings panel reads the latest measurement on open; gating state on
  // `showAdvanced` avoids re-renders when the panel is closed.
  const showAdvancedRef = useRef(false)
  const [shareCopied, setShareCopied] = useState(false)
  const shareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (shareTimerRef.current) clearTimeout(shareTimerRef.current)
  }, [])

  const debouncedTopN = useDebounced(topN, 200)
  const debouncedRepulsion = useDebounced(repulsion, 150)
  const debouncedLinkStiffness = useDebounced(linkStiffness, 150)
  const debouncedGravity = useDebounced(gravity, 150)
  const debouncedLinkSpread = useDebounced(linkSpread, 150)
  const debouncedInterRatio = useDebounced(interRatio, 150)
  const debouncedShowTopPct = useDebounced(showTopPct, 200)
  const linkScaleRef = useRef(linkScale)
  useEffect(() => { linkScaleRef.current = linkScale }, [linkScale])

  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [ready, setReady] = useState(false)
  // Lazy initializer reads the active theme synchronously so the first canvas
  // frame paints with real colors instead of empty strings. The data-theme
  // observer below keeps the values in sync on theme switch.
  const [themeColors, setThemeColors] = useState<ThemeColors>(readThemeColors)
  const { font: fontFamily, text: textColor, textDim: textDimColor, bg: bgColor } = themeColors
  // Incremented whenever we mutate node fx/fy outside the library's engine —
  // forces graphData identity to change so ForceGraph repaints.
  const [repaintTick, setRepaintTick] = useState(0)
  // Only the FIRST settle for a given (nodes, edges) set should auto-fit;
  // physics re-settles must preserve the user's current zoom so parameter
  // changes are actually visible.
  const needsFitRef = useRef(true)

  // Base (k=1) positions captured after sync-settle, used by link-length
  // slider to rescale about viewport center without touching the sim.
  const baseRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const openTagModal = (tags: string[]) => {
    let next = new URLSearchParams(window.location.search)
    next.delete("genre")
    for (const t of tags) next = openModal(next, "genre", t)
    pushModalUrl(`${pathname}${toQueryString(next)}`)
  }

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
  const hiTags = useMemo(() => {
    const set = new Set(clickedTags)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      for (const [name, lower] of lowerNames) if (lower.includes(q)) set.add(name)
    }
    return set
  }, [clickedTags, searchQuery, lowerNames])

  const { nodes, edges } = useMemo(
    () => buildTagGraph(counts, pairs, metric, debouncedTopN),
    [counts, pairs, metric, debouncedTopN],
  )

  const visibleEdges = useMemo(
    () => computeVisibleEdges(edges, minLinks, debouncedShowTopPct),
    [edges, minLinks, debouncedShowTopPct],
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

  const hiNeighbors = useMemo(() => {
    const n = new Set<string>()
    if (clickedTags.size === 0) return n
    for (const e of edges) {
      const [s, t] = edgeEndpoints(e)
      if (clickedTags.has(s)) n.add(t)
      if (clickedTags.has(t)) n.add(s)
    }
    return n
  }, [edges, clickedTags])

  const maxCount = useMemo(() => {
    let m = 1
    for (const n of nodes) if (n.count > m) m = n.count
    return m
  }, [nodes])

  // Weight domain is metric-dependent: Jaccard/Cosine ∈ [0,1] but Raw can
  // be in the thousands. Normalize so linkWidth stays bounded.
  const maxWeight = useMemo(() => {
    let m = 1
    for (const e of edges) if (e.weight > m) m = e.weight
    return m
  }, [edges])

  // Collision uses the unscaled radius so the `nodeScale` slider is visual
  // only — flipping it doesn't re-settle.
  const baseRScale = useMemo(() => {
    return scaleSqrt().domain([1, maxCount]).range([6, 28])
  }, [maxCount])
  const rScale = useMemo(() => {
    return scaleSqrt().domain([1, maxCount]).range([6 * nodeScale, 28 * nodeScale])
  }, [maxCount, nodeScale])

  const fontScale = useMemo(() => {
    return scaleLinear().domain([1, maxCount]).range([6.5 * labelSize, 10.5 * labelSize])
  }, [maxCount, labelSize])

  // Font strings are parsed by the Canvas API each time `ctx.font = …` is
  // assigned. At 1000 nodes/frame that's 60k parses/sec. Cache the
  // constructed string per distinct count. Deps are the primitives that
  // determine cache validity — they don't appear in the body but bumping
  // any of them must drop the cache so stale strings don't paint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fontStringCache = useMemo(() => new Map<number, string>(), [maxCount, labelSize, fontFamily])


  const labelSet = useMemo(() => {
    if (labelLimit === null) return null
    const ordered = [...nodes].sort((a, b) => b.count - a.count).slice(0, labelLimit)
    return new Set(ordered.map((n) => n.id))
  }, [nodes, labelLimit])

  // Scale about the current viewport center in graph coords, then adjust
  // zoom inversely so the view the user was looking at stays put — only
  // relative spacing between nodes changes visually.
  const scaleBaseRef = useRef(1)
  const applyLinkScale = (k: number) => {
    if (!size) return
    const fg = fgRef.current
    const center = fg?.centerAt?.() ?? { x: size.w / 2, y: size.h / 2 }
    const prev = scaleBaseRef.current
    const ratio = k / prev
    const cx = center.x
    const cy = center.y
    for (const n of nodes) {
      const base = baseRef.current.get(n.id)
      if (!base) continue
      const cur = { x: n.fx ?? base.x, y: n.fy ?? base.y }
      const nx = (cur.x - cx) * ratio + cx
      const ny = (cur.y - cy) * ratio + cy
      n.fx = nx
      n.fy = ny
      n.x = nx
      n.y = ny
    }
    scaleBaseRef.current = k
    // Counter-zoom so the viewport stays on the same content: positions
    // expanded by ratio → zoom divided by ratio keeps on-screen size.
    if (fg) fg.zoom(fg.zoom() / ratio, 0)
    setRepaintTick((t) => t + 1)
  }

  useEffect(() => {
    if (!size || nodes.length === 0) return
    setReady(false)
    const { w, h } = size

    // Seed tight around the centre. Wide-spread seeding leaves nodes with
    // weak/no edges stranded far away when alpha decays before forces can
    // pull them in. A compact starting cloud lets the sim converge reliably.
    const cx = w / 2
    const cy = h / 2
    const spread = Math.min(w, h) * 0.2
    for (const n of nodes) {
      n.x = cx + (Math.random() - 0.5) * spread
      n.y = cy + (Math.random() - 0.5) * spread
      n.vx = 0
      n.vy = 0
      n.fx = undefined
      n.fy = undefined
    }

    function clusterForce(alpha: number) {
      const k = COHESION
      const centroids = new Map<number, { x: number; y: number; count: number }>()
      for (const n of nodes) {
        const e = centroids.get(n.cluster) ?? { x: 0, y: 0, count: 0 }
        e.x += n.x ?? 0
        e.y += n.y ?? 0
        e.count++
        centroids.set(n.cluster, e)
      }
      for (const e of centroids.values()) {
        e.x /= e.count
        e.y /= e.count
      }
      for (const n of nodes) {
        const c = centroids.get(n.cluster)!
        n.vx = (n.vx ?? 0) + (c.x - (n.x ?? 0)) * alpha * k
        n.vy = (n.vy ?? 0) + (c.y - (n.y ?? 0)) * alpha * k
      }
    }

    // Cluster membership is fixed for the lifetime of this simulation —
    // build the per-cluster member list once. Per-tick work then just sums
    // positions and runs the pairwise repulsion.
    type Agg = { x: number; y: number; count: number; r: number; members: TagNode[] }
    const clusterAggs: Agg[] = []
    {
      const byId = new Map<number, Agg>()
      for (const n of nodes) {
        let a = byId.get(n.cluster)
        if (!a) {
          a = { x: 0, y: 0, count: 0, r: 0, members: [] }
          byId.set(n.cluster, a)
          clusterAggs.push(a)
        }
        a.members.push(n)
        a.count++
      }
    }

    // Cluster-centroid pairwise repulsion so whole communities don't overlap.
    // Each cluster is treated as a super-node at its centroid with effective
    // radius = furthest member edge; overlap → members kicked apart,
    // weighted inversely by cluster size so small clusters move more.
    function clusterRepulsionForce(alpha: number) {
      const STRENGTH = CLUSTER_SEP
      for (const a of clusterAggs) {
        let sx = 0, sy = 0
        for (const n of a.members) { sx += n.x ?? 0; sy += n.y ?? 0 }
        a.x = sx / a.count
        a.y = sy / a.count
        let maxR = 0
        for (const n of a.members) {
          const dx = (n.x ?? 0) - a.x
          const dy = (n.y ?? 0) - a.y
          const d = Math.sqrt(dx * dx + dy * dy) + baseRScale(n.count) + 6
          if (d > maxR) maxR = d
        }
        a.r = maxR
      }
      for (let i = 0; i < clusterAggs.length; i++) {
        for (let j = i + 1; j < clusterAggs.length; j++) {
          const a = clusterAggs[i], b = clusterAggs[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
          const want = a.r + b.r
          if (dist >= want) continue
          const overlap = want - dist
          const totalWeight = 1 / a.count + 1 / b.count
          const aShare = (1 / a.count) / totalWeight
          const bShare = (1 / b.count) / totalWeight
          const ux = dx / dist, uy = dy / dist
          const kx = ux * overlap * STRENGTH * alpha
          const ky = uy * overlap * STRENGTH * alpha
          for (const n of a.members) { n.vx = (n.vx ?? 0) - kx * aShare; n.vy = (n.vy ?? 0) - ky * aShare }
          for (const n of b.members) { n.vx = (n.vx ?? 0) + kx * bShare; n.vy = (n.vy ?? 0) + ky * bShare }
        }
      }
    }

    const sim = forceSimulation<TagNode>(nodes)
      .force(
        "link",
        forceLink<TagNode, TagEdge>(edges)
          .id((d) => d.id)
          .distance((d) => {
            const s = d.source as TagNode
            const t = d.target as TagNode
            const same = s.cluster === t.cluster
            // Base distances auto-scale with √(nodeCount/50) so a 1000-node
            // graph spreads proportionally without forcing the user to
            // crank Cluster spacing by ~√20. Slider values stay relative.
            const density = Math.sqrt(Math.max(1, nodes.length) / 50)
            const base = (same ? 30 : 30 * debouncedInterRatio) * density
            return (base + 40 / (1 + d.weight * 3)) * debouncedLinkSpread
          })
          .strength((d) => {
            const s = d.source as TagNode
            const t = d.target as TagNode
            const base = s.cluster === t.cluster ? 0.7 : 0.1
            return base * debouncedLinkStiffness
          }),
      )
      .force("charge", forceManyBody().strength(-debouncedRepulsion).distanceMax(300))
      // `forceCenter` only translates the whole layout to keep the centroid
      // at (w/2, h/2); it doesn't pull individual nodes. A weak forceX/Y
      // is what actually attracts outliers toward the centre — that's what
      // the Centring slider controls.
      .force("center", forceCenter(w / 2, h / 2))
      .force("x", forceX(w / 2).strength(debouncedGravity))
      .force("y", forceY(h / 2).strength(debouncedGravity))
      .force(
        "collision",
        forceCollide<TagNode>().radius((d) => baseRScale(d.count) + 6).strength(0.7),
      )
      .force("cluster", clusterForce)
      .force("clusterRepulsion", clusterRepulsionForce)
      .alphaDecay(0.02)
      .stop()

    const raf = requestAnimationFrame(() => {
      while (sim.alpha() > sim.alphaMin()) sim.tick()
      baseRef.current = new Map(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
      scaleBaseRef.current = 1
      applyLinkScale(linkScaleRef.current)

      // Measure how tight clusters sit: mean intra-cluster edge length vs
      // inter-cluster. A high intra:inter gap means well-separated
      // communities; a ratio near 1 means visual mixing.
      let intraSum = 0, intraN = 0, interSum = 0, interN = 0
      for (const e of edges) {
        const s = e.source as TagNode
        const t = e.target as TagNode
        const dx = (s.x ?? 0) - (t.x ?? 0)
        const dy = (s.y ?? 0) - (t.y ?? 0)
        const d = Math.sqrt(dx * dx + dy * dy)
        if (s.cluster === t.cluster) { intraSum += d; intraN++ }
        else { interSum += d; interN++ }
      }
      const intra = intraN ? intraSum / intraN : 0
      const inter = interN ? interSum / interN : 0
      const stats = { intra, inter, ratio: intra ? inter / intra : 0 }
      spacingStatsRef.current = stats
      if (showAdvancedRef.current) setSpacingStats(stats)

      // Cache cluster hull geometry now that positions are final.
      const nextHulls = new Map<number, [number, number][]>()
      const byCluster = new Map<number, TagNode[]>()
      for (const n of nodes) {
        const arr = byCluster.get(n.cluster)
        if (arr) arr.push(n)
        else byCluster.set(n.cluster, [n])
      }
      for (const [cid, members] of byCluster) {
        if (members.length < 3) continue
        const pts = members.map((n) => [n.x ?? 0, n.y ?? 0] as [number, number])
        const hull = polygonHull(pts)
        if (!hull) continue
        const cxh = mean(hull, (p) => p[0])!
        const cyh = mean(hull, (p) => p[1])!
        const expand = 25
        nextHulls.set(
          cid,
          hull.map(([x, y]) => {
            const dx = x - cxh
            const dy = y - cyh
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            return [x + (dx / dist) * expand, y + (dy / dist) * expand]
          }),
        )
      }
      hullCacheRef.current = nextHulls
      setReady(true)
      // Fit is performed by onEngineStop once the lib has ingested
      // graphData — guarantees fgRef resolved and node bbox is current.
    })
    return () => {
      cancelAnimationFrame(raf)
      sim.stop()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, size, debouncedRepulsion, debouncedLinkStiffness, debouncedGravity, debouncedLinkSpread, debouncedInterRatio, reseedTick])

  useEffect(() => {
    if (!ready) return
    applyLinkScale(linkScale)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkScale, ready])

  // Graph shape changed → allow the next settle to auto-fit the viewport.
  useEffect(() => {
    needsFitRef.current = true
  }, [nodes, edges])

  // Purely visual control changes — trigger a repaint without touching
  // the sim or viewport.
  useEffect(() => {
    if (!ready) return
    setRepaintTick((t) => t + 1)
  }, [ready, nodeScale, labelSize, labelPos, labelLimit, labelThreshold, nodeOpacity])

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

  // Re-resolve when ThemePicker swaps `data-theme` so canvas labels track
  // the active palette. (Initial values come from the lazy useState above.)
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeColors(readThemeColors()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => mo.disconnect()
  }, [])

  // URL param sync (debounced, history.replaceState — no RSC refetch).
  useEffect(() => {
    const id = setTimeout(() => {
      const current = searchParams.toString()
      const params = new URLSearchParams(current)
      const setOrDelete = (k: string, v: string, fallback: string) => {
        if (v === fallback) params.delete(k)
        else params.set(k, v)
      }
      setOrDelete("m", metric, "jaccard")
      setOrDelete("n", String(topN), String(defaultTopN))
      setOrDelete("d", String(showTopPct), "30")
      setOrDelete("ml", String(minLinks), "2")
      setOrDelete("lp", labelPos, "inside")
      const qs = params.toString()
      if (qs === current) return
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, topN, showTopPct, minLinks, labelPos])

  // Escape closes overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (searchParams.get("genre") || searchParams.get("album")) return
      if (aboutOpen) setAboutOpen(false)
      else if (showAdvanced) setShowAdvanced(false)
      else if (fullscreen) setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [aboutOpen, showAdvanced, fullscreen, searchParams])

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
    ctx.fillStyle = bgColor || "#0a0a0a"
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(canvas, 0, 0)
    out.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${labelSingular}-graph-${metric}.png`
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkVisibility = useCallback((l: any) => {
    const s = (l as TagEdge).source as TagNode
    const t = (l as TagEdge).target as TagNode
    return !banTags.has(s.id) && !banTags.has(t.id)
  }, [banTags])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkColor = useCallback((l: any) => {
    const s = l.source as TagNode
    const t = l.target as TagNode
    const same = s.cluster === t.cluster
    const baseA = same ? 0.35 : 0.08
    let alpha = baseA
    if (hiTags.size > 0) {
      const emph = (id: string) => hiTags.has(id) || hiNeighbors.has(id)
      if (!(emph(s.id) || emph(t.id))) alpha = baseA * 0.25
    }
    return same
      ? hexToRgba(textColor, alpha)
      : hexToRgba(textDimColor, alpha)
  }, [hiTags, hiNeighbors, textColor, textDimColor])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkWidth = useCallback((l: any) => 0.5 + ((l as TagEdge).weight / maxWeight) * 2, [maxWeight])

  const graphData = useMemo(
    () => ({ nodes: [...nodes], links: [...visibleEdges] }),
    // repaintTick intentional: mutating fx/fy in place needs a new
    // graphData reference for ForceGraph to repaint when cooldownTicks=0.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, visibleEdges, repaintTick],
  )

  const labelYOffset = (r: number) => {
    if (labelPos === "above") return -(r + 4)
    if (labelPos === "below") return r + 4
    return 0 // inside
  }
  const labelBaseline = (): CanvasTextBaseline => {
    if (labelPos === "above") return "alphabetic"
    if (labelPos === "below") return "hanging"
    return "middle"
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`${labelSingular.charAt(0).toUpperCase()}${labelSingular.slice(1)} co-occurrence graph: ${nodes.length} ${labelPlural}, ${visibleEdges.size} connections`}
      onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
      className={
        fullscreen
          ? "fixed inset-0 z-[9000] bg-bg overflow-hidden"
          : "relative h-full w-full overflow-hidden"
      }
    >
      {size && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeId="id"
          cooldownTicks={0}
          warmupTicks={0}
          enableNodeDrag={false}
          nodeRelSize={1}
          nodeVal={(n) => rScale((n as TagNode).count) ** 2}
          nodeVisibility={(n) => !banTags.has((n as TagNode).id)}
          onNodeClick={(n) => openTagModal([(n as TagNode).id])}
          onLinkClick={(l) => {
            const [s, t] = edgeEndpoints(l as TagEdge)
            openTagModal([s, t])
          }}
          onNodeHover={(n) => {
            if (coarsePointerRef.current) return
            if (!n) { setHover(null); return }
            const tn = n as TagNode
            setHover({
              kind: "node",
              name: tn.id,
              count: tn.count,
              conns: edgesForNode.get(tn.id) ?? 0,
            })
          }}
          onLinkHover={(l) => {
            if (coarsePointerRef.current) return
            if (!l) { setHover(null); return }
            const le = l as TagEdge
            const [a, b] = edgeEndpoints(le)
            setHover({ kind: "edge", a, b, inter: le.inter, weight: le.weight })
          }}
          onZoomEnd={(t) => {
            // ForceGraph fires this synchronously inside its render path; defer
            // the state write so React doesn't see a setState during another
            // component's render.
            const k = t.k
            queueMicrotask(() => setZoomLevel(k))
          }}
          onEngineStop={() => {
            // Gated so user-initiated pan/zoom isn't snapped back on
            // later settles (param tweaks re-run the engine).
            if (needsFitRef.current) {
              fgRef.current?.zoomToFit(0, 60)
              needsFitRef.current = false
            }
          }}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as TagNode
            if (banTags.has(n.id)) return
            const anyHi = hiTags.size > 0
            const dim = anyHi && !hiTags.has(n.id) && !hiNeighbors.has(n.id)
            const r = rScale(n.count)
            const color = clusterColor(n.cluster)
            ctx.beginPath()
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.globalAlpha = dim ? nodeOpacity * 0.2 : nodeOpacity
            ctx.fill()
            ctx.globalAlpha = dim ? 0.3 : 1
            ctx.lineWidth = 1.5 / globalScale
            ctx.strokeStyle = clusterColor(n.cluster, 0.2)
            ctx.stroke()
            ctx.globalAlpha = 1

            if (labelSet && !labelSet.has(n.id)) return
            const fs = fontScale(n.count)
            if (fs * globalScale < labelThreshold) return
            ctx.globalAlpha = dim ? 0.3 : 1
            let fontStr = fontStringCache.get(n.count)
            if (!fontStr) {
              fontStr = `${fs}px ${fontFamily}`
              fontStringCache.set(n.count, fontStr)
            }
            ctx.font = fontStr
            ctx.textAlign = "center"
            ctx.textBaseline = labelBaseline()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(ctx as any).letterSpacing = `${fs * 0.04}px`
            ctx.lineWidth = 2.5 / globalScale
            ctx.strokeStyle = hexToRgba(bgColor, 0.7)
            ctx.lineJoin = "round"
            const ty = (n.y ?? 0) + labelYOffset(r)
            ctx.strokeText(n.id, n.x ?? 0, ty)
            ctx.fillStyle = textColor
            ctx.fillText(n.id, n.x ?? 0, ty)
            ctx.globalAlpha = 1
          }}
          onRenderFramePre={(ctx, globalScale) => {
            // Hull points are cached per settle (see sim rAF). Per-frame
            // work is just draw calls.
            for (const [cid, pts] of hullCacheRef.current) {
              const col = clusterColor(cid)
              ctx.beginPath()
              const n = pts.length
              const mid = (i: number): [number, number] => {
                const a = pts[i]
                const b = pts[(i + 1) % n]
                return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
              }
              const m0 = mid(0)
              ctx.moveTo(m0[0], m0[1])
              for (let i = 0; i < n; i++) {
                const ctrl = pts[(i + 1) % n]
                const next = mid((i + 1) % n)
                ctx.quadraticCurveTo(ctrl[0], ctrl[1], next[0], next[1])
              }
              ctx.closePath()
              ctx.fillStyle = col
              ctx.globalAlpha = 0.06
              ctx.fill()
              ctx.globalAlpha = 0.18
              ctx.lineWidth = 1 / globalScale
              ctx.strokeStyle = col
              ctx.lineJoin = "round"
              ctx.lineCap = "round"
              ctx.stroke()
              ctx.globalAlpha = 1
            }
          }}
          linkVisibility={linkVisibility}
          linkColor={linkColor}
          linkWidth={linkWidth}
          backgroundColor="transparent"
          minZoom={0.2}
          maxZoom={8}
        />
      )}

      {/* Top-left: Settings + About */}
      <div className="absolute top-3 left-3 z-20 flex items-start gap-2 text-[10px] tracking-[0.15em] uppercase font-display text-text-dim">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              const next = !showAdvanced
              setShowAdvanced(next)
              showAdvancedRef.current = next
              if (next) setSpacingStats(spacingStatsRef.current)
              if (aboutOpen) setAboutOpen(false)
            }}
            aria-expanded={showAdvanced}
            className={`flex items-center gap-1.5 backdrop-blur-sm border rounded-sm px-3 py-1.5 transition-colors ${
              showAdvanced
                ? "bg-bg/90 border-accent/40 text-accent"
                : "bg-bg/75 border-border/60 text-text-dim hover:text-text"
            }`}
          >
            <span
              aria-hidden
              className={`inline-block transition-transform duration-300 ease-out ${
                showAdvanced ? "rotate-45 text-accent" : "text-accent/60"
              }`}
            >
              ❖
            </span>
            <span>Settings</span>
          </button>
          {showAdvanced && (
            <div className="absolute top-full left-0 mt-2 bg-bg/90 backdrop-blur-sm border border-border/60 rounded-sm px-3 py-3 flex flex-col gap-3 w-[min(46rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100svh-6rem))] overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-end -mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setMetric(DEFAULTS.metric)
                    setTopN(DEFAULTS.topN)
                    setTopNDraft(null)
                    setShowTopPct(DEFAULTS.showTopPct)
                    setMinLinks(DEFAULTS.minLinks)
                    setRepulsion(DEFAULTS.repulsion)
                    setLinkStiffness(DEFAULTS.linkStiffness)
                    setGravity(DEFAULTS.gravity)
                    setLinkSpread(DEFAULTS.linkSpread)
                    setInterRatio(DEFAULTS.interRatio)
                    setLinkScale(DEFAULTS.linkScale)
                    setNodeScale(DEFAULTS.nodeScale)
                    setNodeOpacity(DEFAULTS.nodeOpacity)
                    setLabelSize(DEFAULTS.labelSize)
                    setLabelLimit(DEFAULTS.labelLimit)
                    setLabelThreshold(DEFAULTS.labelThreshold)
                    setLabelPos(DEFAULTS.labelPos)
                  }}
                  className="text-[9px] tracking-[0.15em] uppercase text-text-dim hover:text-accent border border-border/60 rounded-sm px-2 py-0.5 transition-colors"
                  title="Reset every control to its default"
                >
                  ↺ Reset
                </button>
              </div>
              {/* Data — rebuilds the graph */}
              <div className="flex flex-row items-start gap-4">
                <div className="flex items-center gap-1.5 text-accent/70 text-[9px] w-20 shrink-0 pt-1.5">
                  <span className="text-accent/60">❖</span>
                  <span>Data</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 flex-1">
                  <label className="flex items-center gap-2" title={`How ${labelSingular} similarity is measured. See About for formulas.`}>
                    <span>Metric</span>
                    <select
                      value={metric}
                      onChange={(e) => setMetric(e.target.value as Metric)}
                      className="bg-bg-card border border-border rounded-sm px-2 py-1 text-text"
                    >
                      {METRICS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    {resetBtn(metric, DEFAULTS.metric, () => setMetric(DEFAULTS.metric))}
                  </label>
                  <label className="flex items-center gap-2" title={`How many of the most-tagged ${labelPlural} to include in the graph. Rebuilds clusters.`}>
                    <span>Keep top N</span>
                    <input
                      type="range" min={10} max={maxTopN} step={1} value={topN}
                      onChange={(e) => setTopN(Number(e.target.value))}
                      className="w-56 accent-accent"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={topNDigits}
                      value={topNDraft ?? String(topN)}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/\D/g, "")
                        setTopNDraft(raw)
                        if (raw === "") return
                        const v = Number(raw)
                        if (Number.isFinite(v)) setTopN(Math.max(10, Math.min(maxTopN, Math.round(v))))
                      }}
                      onBlur={() => setTopNDraft(null)}
                      style={{ width: `${topNDigits + 2}ch` }}
                      className="min-w-0 bg-bg-card border border-border rounded-sm px-1 py-0 text-center tabular-nums text-text normal-case tracking-normal leading-tight"
                    />
                    {resetBtn(topN, DEFAULTS.topN, () => { setTopN(DEFAULTS.topN); setTopNDraft(null) })}
                  </label>
                </div>
              </div>

              {/* Physics — re-settles the layout */}
              <div className="flex flex-row items-start gap-4">
                <div className="flex items-center gap-1.5 text-accent/70 text-[9px] w-20 shrink-0 pt-1.5">
                  <span className="text-accent/60">❖</span>
                  <span>Physics</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 flex-1">
                  <label className="flex items-center gap-2" title={`How much farther apart different-cluster ${labelPlural} sit than same-cluster ones. The primary cluster-separation dial.`}>
                    <span>Cluster spacing</span>
                    <input
                      type="range" min={1} max={20} step={0.25} value={interRatio}
                      onChange={(e) => setInterRatio(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{interRatio.toFixed(1)}×</span>
                    {resetBtn(interRatio, DEFAULTS.interRatio, () => setInterRatio(DEFAULTS.interRatio))}
                    {spacingStats && (
                      <span
                        className={`tabular-nums text-[9px] normal-case tracking-normal ${
                          spacingStats.ratio < 2 ? "text-accent" : "text-text-dim"
                        }`}
                        title={`Measured inter/intra ratio: ${spacingStats.inter.toFixed(0)}px / ${spacingStats.intra.toFixed(0)}px`}
                      >
                        (measured {spacingStats.ratio.toFixed(1)}×)
                      </span>
                    )}
                  </label>
                  <label className="flex items-center gap-2" title="Uniform multiplier on target edge length. Scales the whole layout without changing relative proportions.">
                    <span>Overall scale</span>
                    <input
                      type="range" min={0.3} max={5} step={0.05} value={linkSpread}
                      onChange={(e) => setLinkSpread(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{linkSpread.toFixed(2)}×</span>
                    {resetBtn(linkSpread, DEFAULTS.linkSpread, () => setLinkSpread(DEFAULTS.linkSpread))}
                  </label>
                  <label className="flex items-center gap-2" title={`How tightly each edge pulls its ${labelPlural} to their target distance. Higher = stiffer springs; lower = looser, more repulsion-driven.`}>
                    <span>Edge stiffness</span>
                    <input
                      type="range" min={0} max={5} step={0.05} value={linkStiffness}
                      onChange={(e) => setLinkStiffness(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{linkStiffness.toFixed(2)}×</span>
                    {resetBtn(linkStiffness, DEFAULTS.linkStiffness, () => setLinkStiffness(DEFAULTS.linkStiffness))}
                  </label>
                  <label className="flex items-center gap-2" title={`How strongly ${labelPlural} push each other apart. Useful for decluttering crowded areas without touching the edge layout.`}>
                    <span>Node repulsion</span>
                    <input
                      type="range" min={0} max={1000} step={10} value={repulsion}
                      onChange={(e) => setRepulsion(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text text-right inline-block min-w-[4ch]">{repulsion}</span>
                    {resetBtn(repulsion, DEFAULTS.repulsion, () => setRepulsion(DEFAULTS.repulsion))}
                  </label>
                  <label className="flex items-center gap-2" title="Pull toward the centre of the canvas. Zero lets the graph drift; higher values keep everything anchored.">
                    <span>Centring</span>
                    <input
                      type="range" min={0} max={1} step={0.01} value={gravity}
                      onChange={(e) => setGravity(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{gravity.toFixed(2)}</span>
                    {resetBtn(gravity, DEFAULTS.gravity, () => setGravity(DEFAULTS.gravity))}
                  </label>
                </div>
              </div>

              {/* Edges — visual filter */}
              <div className="flex flex-row items-start gap-4">
                <div className="flex items-center gap-1.5 text-accent/70 text-[9px] w-20 shrink-0 pt-1.5">
                  <span className="text-accent/60">❖</span>
                  <span>Edges</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 flex-1">
                  <label className="flex items-center gap-2" title="Percent of the strongest edges to draw. Hidden edges still shape the layout — this only controls what's painted.">
                    <span>Visible edges</span>
                    <input
                      type="range" min={1} max={100} value={showTopPct}
                      onChange={(e) => setShowTopPct(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text">{showTopPct}%</span>
                    {resetBtn(showTopPct, DEFAULTS.showTopPct, () => setShowTopPct(DEFAULTS.showTopPct))}
                  </label>
                  <label className="flex items-center gap-2" title={`Always keep at least this many strongest edges per ${labelSingular} visible, even if the density cap would hide them. Prevents orphans.`}>
                    <span>Min edges / node</span>
                    <input
                      type="range" min={0} max={8} value={minLinks}
                      onChange={(e) => setMinLinks(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text">{minLinks}</span>
                    {resetBtn(minLinks, DEFAULTS.minLinks, () => setMinLinks(DEFAULTS.minLinks))}
                  </label>
                </div>
              </div>

              {/* Display — purely visual */}
              <div className="flex flex-row items-start gap-4">
                <div className="flex items-center gap-1.5 text-accent/70 text-[9px] w-20 shrink-0 pt-1.5">
                  <span className="text-accent/60">❖</span>
                  <span>Display</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 flex-1">
                  <label className="flex items-center gap-2" title="Visual radius multiplier. Purely cosmetic — does not disturb the layout.">
                    <span>Node size</span>
                    <input
                      type="range" min={0.3} max={4} step={0.05} value={nodeScale}
                      onChange={(e) => setNodeScale(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{nodeScale.toFixed(2)}×</span>
                    {resetBtn(nodeScale, DEFAULTS.nodeScale, () => setNodeScale(DEFAULTS.nodeScale))}
                  </label>
                  <label className="flex items-center gap-2" title="Zooms the rendered layout about the viewport centre while keeping node sizes constant. Purely visual.">
                    <span>Layout zoom</span>
                    <input
                      type="range" min={0.2} max={6} step={0.05} value={linkScale}
                      onChange={(e) => setLinkScale(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{linkScale.toFixed(2)}×</span>
                    {resetBtn(linkScale, DEFAULTS.linkScale, () => setLinkScale(DEFAULTS.linkScale))}
                  </label>
                  <label className="flex items-center gap-2" title={`Fill transparency for ${labelSingular} circles. Lower values let overlapping nodes show through.`}>
                    <span>Node opacity</span>
                    <input
                      type="range" min={0.1} max={1} step={0.05} value={nodeOpacity}
                      onChange={(e) => setNodeOpacity(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{Math.round(nodeOpacity * 100)}%</span>
                    {resetBtn(nodeOpacity, DEFAULTS.nodeOpacity, () => setNodeOpacity(DEFAULTS.nodeOpacity))}
                  </label>
                  <label className="flex items-center gap-2" title={`Where the ${labelSingular} name sits relative to its circle.`}>
                    <span>Label placement</span>
                    <select
                      value={labelPos}
                      onChange={(e) => setLabelPos(e.target.value as LabelPos)}
                      className="bg-bg-card border border-border rounded-sm px-2 py-1 text-text"
                    >
                      <option value="below">Below</option>
                      <option value="above">Above</option>
                      <option value="inside">Inside</option>
                    </select>
                    {resetBtn(labelPos, DEFAULTS.labelPos, () => setLabelPos(DEFAULTS.labelPos))}
                  </label>
                  <label className="flex items-center gap-2" title="Font-size multiplier for the text.">
                    <span>Label size</span>
                    <input
                      type="range" min={0.5} max={3} step={0.05} value={labelSize}
                      onChange={(e) => setLabelSize(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{labelSize.toFixed(2)}×</span>
                    {resetBtn(labelSize, DEFAULTS.labelSize, () => setLabelSize(DEFAULTS.labelSize))}
                  </label>
                  <label className="flex items-center gap-2" title={`Cap on how many labels to print. Largest ${labelPlural} win when limited.`}>
                    <span>Max labels</span>
                    <input
                      type="range" min={0} max={nodes.length}
                      value={labelLimit ?? nodes.length}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        setLabelLimit(v >= nodes.length ? null : v)
                      }}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">
                      {labelLimit === null ? "all" : labelLimit}
                    </span>
                    {resetBtn(labelLimit, DEFAULTS.labelLimit, () => setLabelLimit(DEFAULTS.labelLimit))}
                  </label>
                  <label className="flex items-center gap-2" title="Labels are only drawn when their on-screen height is at least this many pixels. Raise it to auto-hide labels as you zoom out.">
                    <span>Label min size</span>
                    <input
                      type="range" min={0} max={24} step={1} value={labelThreshold}
                      onChange={(e) => setLabelThreshold(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{labelThreshold}px</span>
                    {resetBtn(labelThreshold, DEFAULTS.labelThreshold, () => setLabelThreshold(DEFAULTS.labelThreshold))}
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            needsFitRef.current = true
            setReseedTick((t) => t + 1)
          }}
          aria-label="Recompute layout"
          title="Recompute layout from a fresh random seed"
          className="w-7 h-7 flex items-center justify-center backdrop-blur-sm border rounded-sm bg-bg/75 border-border/60 text-text-dim hover:text-text hover:border-accent/50 transition-colors"
        >
          ↻
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => { setAboutOpen((v) => !v); if (showAdvanced) setShowAdvanced(false) }}
            aria-expanded={aboutOpen}
            aria-label="About this graph"
            className={`w-7 h-7 flex items-center justify-center backdrop-blur-sm border rounded-sm font-sans italic text-sm transition-colors ${
              aboutOpen
                ? "bg-bg/90 border-accent/40 text-accent"
                : "bg-bg/75 border-border/60 hover:text-text hover:border-accent/50"
            }`}
          >
            ?
          </button>
          {aboutOpen && (
            <div className="absolute top-full left-0 mt-2 w-[min(34rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100svh-8rem))] overflow-y-auto bg-bg-card border border-border rounded-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <span className="font-display text-[10px] tracking-[0.2em] uppercase text-accent">
                  About this graph
                </span>
                <button
                  type="button"
                  onClick={() => setAboutOpen(false)}
                  aria-label="Close"
                  className="text-text-dim hover:text-text text-sm leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-3 space-y-3 text-xs text-text-dim leading-relaxed normal-case tracking-normal">
                <p>
                  Each <span className="text-text">circle</span> is a {labelSingular}, sized by the
                  number of albums tagged with it. A <span className="text-text">line</span>{" "}
                  between two {labelPlural} means albums share both tags.
                </p>
                <p>
                  Colors mark <span className="text-text">groups</span> of {labelPlural} that link
                  densely to one another — found automatically (
                  <a
                    href="https://en.wikipedia.org/wiki/Louvain_method"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-dim hover:text-accent underline decoration-dotted underline-offset-2"
                  >
                    Louvain method ↗
                  </a>
                  ). Shaded hulls trace each group.
                </p>
                <div>
                  <div className="font-display text-[10px] tracking-[0.15em] uppercase text-accent/80 mb-1">
                    Interacting
                  </div>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Hover a circle or line for details</li>
                    <li>Click a circle to filter releases by that {labelSingular}</li>
                    <li>Scroll or arrow keys to pan, + / − to zoom</li>
                  </ul>
                </div>
                <div>
                  <div className="font-display text-[10px] tracking-[0.15em] uppercase text-accent/80 mb-1">
                    Similarity metrics
                  </div>
                  <div className="space-y-1.5">
                    {METRICS.map((m) => {
                      const active = m.value === metric
                      return (
                        <div key={m.value} className={active ? "" : "opacity-60"}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="font-display text-[10px] text-accent">
                              <span className="tracking-[0.15em] uppercase">{m.label}</span>
                              {m.wiki && (
                                <a
                                  href={m.wiki}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-text-dim hover:text-accent"
                                >
                                  ↗
                                </a>
                              )}
                              {active && <span className="text-text-dim"> · current</span>}
                            </span>
                            <span className="text-sm text-text">
                              <Tex tex={m.tex} />
                            </span>
                          </div>
                          <p className="text-[11px] text-text-dim mt-0.5 leading-snug">{m.blurb(labelPlural)}</p>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-text-dim/80 mt-2 pt-2 border-t border-border/50 leading-snug">
                    <Tex tex={String.raw`A, B`} /> = the two {labelPlural};{" "}
                    <Tex tex={String.raw`|A|`} /> = albums tagged with it;{" "}
                    <Tex tex={String.raw`N`} /> = total albums.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 13.5rem clearance reserves room for the Settings + ↻ + ? row at top-left. */}
      <div className="absolute top-3 right-3 z-20 w-9 sm:w-[min(15rem,calc(100vw-13.5rem))] focus-within:w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden transition-[width] duration-200">
        <div className="flex items-center gap-2 bg-bg/75 backdrop-blur-sm border border-border/60 rounded-sm px-2 py-1">
          <span aria-hidden className="font-display text-xs text-text-dim select-none">⌕</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Focus on a ${labelSingular}…`}
            aria-label={`Focus on a ${labelSingular}`}
            className="flex-1 min-w-0 bg-transparent outline-none text-text text-xs placeholder:text-text-dim"
          />
        </div>
      </div>

      {/* Bottom-right: zoom slider, fullscreen, PNG, share */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 sm:gap-2.5 bg-bg/90 backdrop-blur-sm border border-border rounded-sm px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase font-display text-text-dim">
        <div className="hidden sm:flex items-center gap-2">
          <span aria-hidden className="text-accent/50">◈</span>
          <input
            type="range" min={0.3} max={5} step={0.05} value={zoomLevel}
            onChange={(e) => setZoomFromSlider(Number(e.target.value))}
            aria-label="Zoom"
            className="w-24 accent-accent"
          />
          <button
            type="button"
            onClick={() => setZoomFromSlider(1)}
            title="Reset zoom"
            aria-label="Reset zoom to 1×"
            className={`tabular-nums normal-case tracking-normal transition-colors cursor-pointer ${
              Math.abs(zoomLevel - 1) < 0.02 ? "text-text" : "text-accent hover:text-accent-hover"
            }`}
          >
            {zoomLevel.toFixed(1)}×
          </button>
          <span aria-hidden className="text-border/60 select-none">|</span>
        </div>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-pressed={fullscreen}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          className="w-8 h-8 flex items-center justify-center text-accent border border-transparent hover:text-accent-hover hover:border-accent/40 hover:bg-accent/10 rounded-sm transition-colors"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            {fullscreen ? (
              <>
                <path d="M10 2v4h4" />
                <path d="M14 2l-4 4" />
                <path d="M6 14v-4H2" />
                <path d="M2 14l4-4" />
              </>
            ) : (
              <>
                <path d="M2 6V2h4" />
                <path d="M2 2l4 4" />
                <path d="M14 10v4h-4" />
                <path d="M14 14l-4-4" />
              </>
            )}
          </svg>
        </button>
        <button
          type="button"
          onClick={downloadPng}
          aria-label="Save graph as PNG"
          title="Save graph as PNG"
          className="w-8 h-8 flex items-center justify-center text-accent border border-transparent hover:text-accent-hover hover:border-accent/40 hover:bg-accent/10 rounded-sm transition-colors"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v9" />
            <path d="M4 7l4 4 4-4" />
            <path d="M3 14h10" />
          </svg>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={copyShareLink}
            aria-label="Copy shareable link"
            title="Copy shareable link"
            className="w-8 h-8 flex items-center justify-center text-accent border border-transparent hover:text-accent-hover hover:border-accent/40 hover:bg-accent/10 rounded-sm transition-colors"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="w-4 h-4 fill-none stroke-current" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="8" height="10" rx="1" />
              <path d="M11 14H4a1 1 0 0 1-1-1V5" />
            </svg>
          </button>
          <div
            role="status"
            aria-live="polite"
            className={`absolute bottom-full right-0 mb-2 px-2 py-1 rounded-sm bg-accent text-bg text-[9px] tracking-[0.2em] font-display whitespace-nowrap pointer-events-none transition-opacity duration-200 ${
              shareCopied ? "opacity-100" : "opacity-0"
            }`}
          >
            link copied
          </div>
        </div>
      </div>

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

      {/* Loader */}
      {!ready && nodes.length > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="font-display text-accent/70 text-xs tracking-[0.3em] uppercase animate-pulse">
            ❧ drawing the graph
          </div>
        </div>
      )}

      {/* Hover tooltip — follows the cursor */}
      {hover && (
        <div
          ref={tooltipRef}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed z-50 bg-bg-card border border-border rounded-sm px-3 py-2 text-xs"
          style={{ left: hoverPos.x + 14, top: hoverPos.y + 14 }}
        >
          {hover.kind === "node" ? (
            <>
              <div className="font-display text-sm text-accent">{hover.name}</div>
              <div className="text-text-dim font-display tracking-wide text-[10px] uppercase mt-0.5">
                {hover.count} albums · {hover.conns} connections
              </div>
            </>
          ) : (
            <>
              <div className="font-display text-sm text-accent">
                {hover.a} <span className="text-text-dim">×</span> {hover.b}
              </div>
              <div className="text-text-dim font-display tracking-wide text-[10px] uppercase mt-0.5">
                {hover.inter} shared albums · strength {hover.weight.toFixed(2)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
