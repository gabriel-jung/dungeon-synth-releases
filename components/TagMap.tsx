"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { hsl } from "d3-color"
import { max, mean, group } from "d3-array"
import { scaleSqrt, scaleLinear } from "d3-scale"
import { polygonHull } from "d3-polygon"
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
  type Simulation,
  type ForceLink,
  type ForceManyBody,
  type ForceCollide,
} from "d3-force"
import { zoom as d3Zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom"
import { select, type Selection } from "d3-selection"
import "d3-transition"
import katex from "katex"
import "katex/dist/katex.min.css"
import { usePathname, useSearchParams } from "next/navigation"
import { openModal, pushModalUrl, toQueryString } from "@/lib/modalUrl"

export type TagCount = { name: string; n: number }
export type TagPair = { a: string; b: string; n: number }

type Metric = "raw" | "jaccard" | "pmi" | "cosine"
type Node = SimulationNodeDatum & { id: string; count: number; cluster: number }
type Edge = SimulationLinkDatum<Node> & { weight: number; inter: number }

type HoverInfo =
  | { kind: "node"; name: string; count: number; conns: number }
  | { kind: "edge"; a: string; b: string; inter: number; weight: number }

type MetricInfo = { value: Metric; label: string; tex: string; blurb: (plural: string) => string; wiki?: string }

const METRICS: MetricInfo[] = [
  {
    value: "jaccard",
    label: "Jaccard",
    tex: String.raw`J(A,B) = \frac{|A \cap B|}{|A \cup B|}`,
    blurb: (p) =>
      `How much two ${p} overlap, as a share of everything tagged with either one. A good all-purpose default.`,
    wiki: "https://en.wikipedia.org/wiki/Jaccard_index",
  },
  {
    value: "raw",
    label: "Raw",
    tex: String.raw`\mathrm{Raw}(A,B) = |A \cap B|`,
    blurb: (p) =>
      `Just the number of albums tagged with both. Popular ${p} will dominate even when they aren't really related.`,
  },
  {
    value: "pmi",
    label: "PMI",
    tex: String.raw`\mathrm{PMI}(A,B) = \log_2 \frac{|A \cap B| \cdot N}{|A| \cdot |B|}`,
    blurb: (p) =>
      `How much more often two ${p} appear together than pure chance would predict. Great for spotting surprising pairings.`,
    wiki: "https://en.wikipedia.org/wiki/Pointwise_mutual_information",
  },
  {
    value: "cosine",
    label: "Cosine",
    tex: String.raw`\cos(A,B) = \frac{|A \cap B|}{\sqrt{|A| \cdot |B|}}`,
    blurb: (p) =>
      `Similar to Jaccard, but kinder when one ${p.replace(/s$/, "")} is much bigger than the other.`,
    wiki: "https://en.wikipedia.org/wiki/Cosine_similarity",
  },
]

function Tex({ tex, block = false }: { tex: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: block }),
    [tex, block],
  )
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

const CLUSTER_HUES = [35, 200, 0, 270, 110, 50, 320, 170, 230, 90]
const GOLDEN_ANGLE = 137.508

function clusterColor(idx: number, lightDelta = 0): string {
  const h = idx < CLUSTER_HUES.length
    ? CLUSTER_HUES[idx]
    : (CLUSTER_HUES[0] + idx * GOLDEN_ANGLE) % 360
  const l = Math.min(0.5 + lightDelta, 0.75)
  return hsl(h, 0.4, l).formatHex()
}

type LouvainGraph = {
  ids: string[]
  adj: Map<string, Map<string, number>>
  selfLoop: Map<string, number>
  totalWeight: number
}

function louvainPhase1(g: LouvainGraph): { partition: Map<string, number>; moved: boolean } {
  const { ids, adj, selfLoop } = g
  const m = g.totalWeight
  const partition = new Map<string, number>()
  ids.forEach((id, i) => partition.set(id, i))
  if (m === 0) return { partition, moved: false }
  const m2 = 2 * m

  const deg = new Map<string, number>()
  for (const id of ids) {
    let d = 2 * (selfLoop.get(id) ?? 0)
    for (const w of adj.get(id)!.values()) d += w
    deg.set(id, d)
  }
  const sumTot = new Map<number, number>()
  for (const id of ids) sumTot.set(partition.get(id)!, deg.get(id)!)

  let moved = false
  let improved = true
  let iter = 0
  while (improved && iter < 20) {
    improved = false
    iter++
    for (const id of ids) {
      const cur = partition.get(id)!
      const ki = deg.get(id)!
      const neigh = new Map<number, number>()
      for (const [nb, w] of adj.get(id)!) {
        const c = partition.get(nb)!
        neigh.set(c, (neigh.get(c) || 0) + w)
      }
      sumTot.set(cur, sumTot.get(cur)! - ki)
      let best = cur
      let bestGain = (neigh.get(cur) ?? 0) - (sumTot.get(cur)! * ki) / m2
      for (const [c, sumIn] of neigh) {
        if (c === cur) continue
        const gain = sumIn - ((sumTot.get(c) ?? 0) * ki) / m2
        if (gain > bestGain) { bestGain = gain; best = c }
      }
      sumTot.set(best, (sumTot.get(best) ?? 0) + ki)
      if (best !== cur) { partition.set(id, best); improved = true; moved = true }
    }
  }
  return { partition, moved }
}

function louvainAggregate(g: LouvainGraph, partition: Map<string, number>): {
  newGraph: LouvainGraph
  nodeToSuper: Map<string, string>
} {
  const unique = [...new Set(partition.values())]
  const remap = new Map<number, number>()
  unique.forEach((c, i) => remap.set(c, i))
  const newIds = unique.map((_, i) => `c${i}`)
  const nodeToSuper = new Map<string, string>()
  for (const [n, c] of partition) nodeToSuper.set(n, newIds[remap.get(c)!])

  const newAdj = new Map<string, Map<string, number>>()
  const newSelf = new Map<string, number>()
  for (const id of newIds) { newAdj.set(id, new Map()); newSelf.set(id, 0) }

  for (const [n, w] of g.selfLoop) {
    if (w === 0) continue
    const c = nodeToSuper.get(n)!
    newSelf.set(c, newSelf.get(c)! + w)
  }
  for (const [src, neighbors] of g.adj) {
    for (const [dst, w] of neighbors) {
      if (src >= dst) continue
      const cs = nodeToSuper.get(src)!
      const cd = nodeToSuper.get(dst)!
      if (cs === cd) {
        newSelf.set(cs, newSelf.get(cs)! + w)
      } else {
        newAdj.get(cs)!.set(cd, (newAdj.get(cs)!.get(cd) || 0) + w)
        newAdj.get(cd)!.set(cs, (newAdj.get(cd)!.get(cs) || 0) + w)
      }
    }
  }
  return {
    newGraph: { ids: newIds, adj: newAdj, selfLoop: newSelf, totalWeight: g.totalWeight },
    nodeToSuper,
  }
}

function detectCommunities(nodes: Node[], edges: Edge[]): Record<string, number> {
  const originalIds = nodes.map((n) => n.id)
  const adj = new Map<string, Map<string, number>>()
  for (const id of originalIds) adj.set(id, new Map())
  let total = 0
  for (const e of edges) {
    const [s, t] = edgeEndpoints(e)
    if (s === t) continue
    adj.get(s)!.set(t, (adj.get(s)!.get(t) || 0) + e.weight)
    adj.get(t)!.set(s, (adj.get(t)!.get(s) || 0) + e.weight)
    total += e.weight
  }
  let g: LouvainGraph = { ids: originalIds, adj, selfLoop: new Map(originalIds.map((id) => [id, 0])), totalWeight: total }
  const supByOrig = new Map<string, string>()
  for (const id of originalIds) supByOrig.set(id, id)

  for (let level = 0; level < 10; level++) {
    const { partition, moved } = louvainPhase1(g)
    if (!moved) break
    const { newGraph, nodeToSuper } = louvainAggregate(g, partition)
    for (const id of originalIds) {
      supByOrig.set(id, nodeToSuper.get(supByOrig.get(id)!) ?? supByOrig.get(id)!)
    }
    if (newGraph.ids.length === g.ids.length) break
    g = newGraph
  }

  const finals = [...new Set(supByOrig.values())]
  const idx = new Map<string, number>()
  finals.forEach((s, i) => idx.set(s, i))
  const out: Record<string, number> = {}
  for (const id of originalIds) out[id] = idx.get(supByOrig.get(id)!)!
  return out
}

function stabilizeClusters(
  comms: Record<string, number>,
  counts: Map<string, number>,
): Record<string, number> {
  const anchors = new Map<number, { node: string; count: number }>()
  for (const [node, c] of Object.entries(comms)) {
    const cnt = counts.get(node) ?? 0
    const cur = anchors.get(c)
    if (!cur || cnt > cur.count || (cnt === cur.count && node < cur.node)) {
      anchors.set(c, { node, count: cnt })
    }
  }
  const sorted = [...anchors.entries()].sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count
    return a[1].node.localeCompare(b[1].node)
  })
  const remap = new Map<number, number>()
  sorted.forEach(([c], i) => remap.set(c, i))
  const out: Record<string, number> = {}
  for (const [node, c] of Object.entries(comms)) out[node] = remap.get(c)!
  return out
}

type LabelPos = "below" | "above" | "inside"

function edgeOpacity(
  d: Edge,
  visible: Set<Edge>,
  hiTags: Set<string>,
  hiNeighbors: Set<string>,
): number {
  if (!visible.has(d)) return 0
  const s = d.source as Node
  const t = d.target as Node
  const base = s.cluster === t.cluster ? 0.35 : 0.08
  if (hiTags.size > 0) {
    const emph = (id: string) => hiTags.has(id) || hiNeighbors.has(id)
    if (!(emph(s.id) || emph(t.id))) return base * 0.25
  }
  return base
}

function computeLabelGeom(
  r: number,
  pos: LabelPos,
): { dy: number; baseline: string; cyOffset: number } {
  switch (pos) {
    case "above":
      return { dy: -(r + 4), baseline: "auto", cyOffset: -(r + 6) }
    case "inside":
      return { dy: 0, baseline: "central", cyOffset: 0 }
    case "below":
    default:
      return { dy: r + 4, baseline: "hanging", cyOffset: r + 8 }
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

const METRIC_VALUES: readonly Metric[] = ["raw", "jaccard", "pmi", "cosine"] as const
const LABEL_POS_VALUES: readonly LabelPos[] = ["below", "above", "inside"] as const

function parseEnum<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

function parseNumber(v: string | null, fallback: number, min: number, max: number): number {
  if (v == null) return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// d3-force mutates edges so source/target become Node objects after the first
// tick. Before that, they're still the original id strings.
function edgeEndpoints(e: Edge): [string, string] {
  const s = typeof e.source === "object" ? (e.source as Node).id : (e.source as string)
  const t = typeof e.target === "object" ? (e.target as Node).id : (e.target as string)
  return [s, t]
}

export default function TagMap({
  counts,
  pairs,
  itemLabel = "genre",
}: {
  counts: TagCount[]
  pairs: TagPair[]
  itemLabel?: string
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const labelSingular = itemLabel
  const labelPlural = `${itemLabel}s`
  const labelCapital = `${itemLabel.charAt(0).toUpperCase()}${itemLabel.slice(1)}`

  // Push genre(s) to URL so ModalRouter opens the ScopeModal. Single tag =
  // node click; two tags = edge click (intersection inside the modal). Uses
  // pushModalUrl so the /genres RSC tree isn't refetched for a modal toggle.
  const openTagModal = (tags: string[]) => {
    let next = new URLSearchParams(window.location.search)
    // Strip any previous genre params so we don't accidentally accumulate.
    next.delete("genre")
    for (const t of tags) next = openModal(next, "genre", t)
    pushModalUrl(`${pathname}${toQueryString(next)}`)
  }
  const maxTopN = counts.length
  const topNDigits = String(maxTopN).length
  const defaultTopN = Math.min(50, maxTopN)

  // Initial state reads URL once on mount; later writes flow the other direction.
  const initial = useMemo(() => ({
    metric: parseEnum<Metric>(searchParams.get("m"), METRIC_VALUES, "jaccard"),
    topN: parseNumber(searchParams.get("n"), defaultTopN, 10, maxTopN),
    showTopPct: parseNumber(searchParams.get("d"), 30, 1, 100),
    minLinks: parseNumber(searchParams.get("ml"), 2, 0, 8),
    labelPos: parseEnum<LabelPos>(searchParams.get("lp"), LABEL_POS_VALUES, "inside"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  const [metric, setMetric] = useState<Metric>(initial.metric)
  const [topN, setTopN] = useState(initial.topN)
  const [topNDraft, setTopNDraft] = useState<string | null>(null)
  const [showTopPct, setShowTopPct] = useState(initial.showTopPct)
  const [linkScale, setLinkScale] = useState(2.2)
  const [nodeScale, setNodeScale] = useState(1)
  const [nodeOpacity, setNodeOpacity] = useState(0.75)
  const [labelSize, setLabelSize] = useState(1)
  const [labelLimit, setLabelLimit] = useState<number | null>(null) // null = all
  const [labelPos, setLabelPos] = useState<LabelPos>(initial.labelPos)
  const [minLinks, setMinLinks] = useState(initial.minLinks)
  const [repulsion, setRepulsion] = useState(80)
  const [cohesion, setCohesion] = useState(0.08)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [simReady, setSimReady] = useState(false)
  const [settling, setSettling] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const labelSizeRef = useRef(1)
  const labelLimitRef = useRef<number | null>(null)
  const labelPosRef = useRef<LabelPos>("inside")
  const recomputeLabelsRef = useRef<() => void>(() => {})
  const simRef = useRef<Simulation<Node, Edge> | null>(null)
  const linkSelRef = useRef<Selection<SVGLineElement, Edge, SVGGElement, unknown> | null>(null)
  const rebuildLinksRef = useRef<(visible: Set<Edge>) => void>(() => {})
  const visibleEdgesRef = useRef<Set<Edge>>(new Set())
  const cohesionRef = useRef(0.08)
  const banTagsRef = useRef<Set<string>>(new Set())
  const hiTagsRef = useRef<Set<string>>(new Set())
  const hiNeighborsRef = useRef<Set<string>>(new Set())

  const debouncedTopN = useDebounced(topN, 200)
  const debouncedShowTopPct = useDebounced(showTopPct, 200)
  const debouncedLinkScale = useDebounced(linkScale, 150)
  const debouncedNodeScale = useDebounced(nodeScale, 150)
  const debouncedRepulsion = useDebounced(repulsion, 150)

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of counts) m.set(c.name, c.n)
    return m
  }, [counts])

  const totalAlbums = useMemo(() => {
    let max = 0
    for (const c of counts) if (c.n > max) max = c.n
    return Math.max(max, 1)
  }, [counts])

  const { nodes, edges } = useMemo(() => {
    const active = new Set(
      [...counts].sort((x, y) => y.n - x.n).slice(0, debouncedTopN).map((c) => c.name),
    )

    // Laplace smoothing for PMI so log₂ stays defined when counts are tiny.
    const PMI_ALPHA = 1
    const weightFor = (a: string, b: string, intersection: number): number => {
      const countA = tagCounts.get(a) ?? 0
      const countB = tagCounts.get(b) ?? 0
      if (metric === "raw") return intersection
      if (metric === "jaccard") {
        const union = countA + countB - intersection
        return union > 0 ? intersection / union : 0
      }
      if (metric === "cosine") {
        const denom = Math.sqrt(countA) * Math.sqrt(countB)
        return denom > 0 ? intersection / denom : 0
      }
      if (metric === "pmi") {
        if (countA === 0 || countB === 0) return 0
        const expected = (countA * countB) / totalAlbums
        return Math.max(0, Math.log2((intersection + PMI_ALPHA) / (expected + PMI_ALPHA)))
      }
      return 0
    }

    const all: Edge[] = []
    for (const p of pairs) {
      if (!active.has(p.a) || !active.has(p.b)) continue
      const w = weightFor(p.a, p.b, p.n)
      if (w > 0) all.push({ source: p.a, target: p.b, weight: w, inter: p.n })
    }

    const ns: Node[] = [...active].map((t) => ({
      id: t,
      count: tagCounts.get(t) ?? 0,
      cluster: 0,
    }))
    const rawComms = detectCommunities(ns, all)
    const comms = stabilizeClusters(rawComms, tagCounts)
    for (const n of ns) n.cluster = comms[n.id] ?? 0
    return { nodes: ns, edges: all }
  }, [counts, pairs, tagCounts, totalAlbums, metric, debouncedTopN])

  // Visibility mask for edges. All edges participate in the simulation; this
  // set controls which are painted. Every node retains its top-K strongest
  // links to avoid becoming unreachable at low densities.
  const visibleEdges = useMemo(() => {
    const perNode = new Map<string, Edge[]>()
    for (const e of edges) {
      const [s, t] = edgeEndpoints(e)
      if (!perNode.has(s)) perNode.set(s, [])
      if (!perNode.has(t)) perNode.set(t, [])
      perNode.get(s)!.push(e)
      perNode.get(t)!.push(e)
    }
    const floor = new Set<Edge>()
    for (const arr of perNode.values()) {
      arr.sort((x, y) => y.weight - x.weight)
      for (let i = 0; i < Math.min(minLinks, arr.length); i++) floor.add(arr[i])
    }
    const sorted = edges.map((e) => e.weight).sort((a, b) => a - b)
    const dropCount = Math.floor(sorted.length * (1 - debouncedShowTopPct / 100))
    const cutoff = dropCount > 0 ? sorted[dropCount - 1] : -Infinity
    const set = new Set<Edge>()
    for (const e of edges) if (e.weight > cutoff || floor.has(e)) set.add(e)
    return set
  }, [edges, debouncedShowTopPct, minLinks])

  // Debounced URL-writeback for persisted settings. Uses router.replace so
  // slider drags don't pollute browser history, and merges with existing
  // params (tag/xtag filters from the global TagFilter).
  useEffect(() => {
    const id = setTimeout(() => {
      const current = searchParams.toString()
      const params = new URLSearchParams(current)
      const setOrDelete = (key: string, value: string, fallback: string) => {
        if (value === fallback) params.delete(key)
        else params.set(key, value)
      }
      setOrDelete("m", metric, "jaccard")
      setOrDelete("n", String(topN), String(defaultTopN))
      setOrDelete("d", String(showTopPct), "30")
      setOrDelete("ml", String(minLinks), "2")
      setOrDelete("lp", labelPos, "inside")
      const qs = params.toString()
      if (qs === current) return
      // history.replaceState bypasses Next.js's RSC re-fetch: these params are
      // only consumed on initial client mount for state hydration, never used
      // server-side, so a server round-trip per slider change is wasted work.
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, topN, showTopPct, minLinks, labelPos])

  // Escape closes overlays. ScopeModal (opened via URL) handles its own
  // Escape via useModal, so we only need to close panels here.
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

  // Stabilize via serialized keys so unrelated URL changes (e.g. the scope
  // modal's ?genre=) don't bust dependent memos and rebuild the graph.
  const banTagsKey = searchParams.getAll("xtag").join("|")
  const clickedTagsKey = searchParams.getAll("tag").join("|")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const banTags = useMemo(() => new Set(searchParams.getAll("xtag")), [banTagsKey])
  // Highlight = union of explicit tag chips (?tag=...) and substring matches
  // from the in-canvas search input. Search lives local to this map — it
  // highlights nodes in place rather than navigating to the release list.
  const [searchQuery, setSearchQuery] = useState("")
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const clickedTags = useMemo(() => new Set(searchParams.getAll("tag")), [clickedTagsKey])
  // Precomputed once per counts — keystrokes re-iterate but don't re-lowercase.
  const lowerNames = useMemo(
    () => counts.map((c) => [c.name, c.name.toLowerCase()] as const),
    [counts],
  )
  const hiTags = useMemo(() => {
    const set = new Set(clickedTags)
    if (searchQuery) {
      for (const [name, lower] of lowerNames) if (lower.includes(searchQuery)) set.add(name)
    }
    return set
  }, [clickedTags, searchQuery, lowerNames])
  // Neighbor expansion applies only to explicitly clicked tags, not search
  // matches — searching "punk" should pop out only genres containing "punk",
  // not their related genres.
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

  // Render with d3
  useEffect(() => {
    const svg = select(svgRef.current!)
    const container = containerRef.current!
    const w = container.clientWidth
    const h = container.clientHeight

    const positionTooltip = (clientX: number, clientY: number) => {
      const apply = () => {
        const el = tooltipRef.current
        if (!el) return
        let x = clientX + 14
        let y = clientY - 10
        const rect = el.getBoundingClientRect()
        if (rect.width > 0) {
          if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - 14
          if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
          if (y < 8) y = 8
        }
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      }
      if (tooltipRef.current) apply()
      else requestAnimationFrame(apply)
    }

    svg.selectAll("*").remove()
    const g = svg.append("g")
    setSimReady(false)
    setSettling(true)
    let tickedOnce = false
    let initialFitDone = false

    const zoom = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on("zoom", (e) => {
        g.attr("transform", e.transform.toString())
        setZoomLevel(e.transform.k)
      })
    svg.call(zoom)
    zoomBehaviorRef.current = zoom

    if (nodes.length === 0) return

    const maxCount = max(nodes, (d) => d.count) ?? 1
    const maxWeight = max(edges, (d) => d.weight) ?? 1
    const rScale = scaleSqrt().domain([1, maxCount]).range([6 * debouncedNodeScale, 28 * debouncedNodeScale])
    const wScale = scaleLinear().domain([0, maxWeight]).range([0.5, 6])
    const fontScale = scaleLinear().domain([1, maxCount]).range([6.5, 10.5])

    const hullG = g.append("g").attr("class", "hulls")

    // Precomputed adjacency: hover lookups avoid scanning all edges.
    const edgesForNode = new Map<string, Edge[]>()
    for (const n of nodes) edgesForNode.set(n.id, [])
    for (const edge of edges) {
      const [s, t] = edgeEndpoints(edge)
      edgesForNode.get(s)?.push(edge)
      edgesForNode.get(t)?.push(edge)
    }

    const baseEdgeOpacity = (d: Edge): number => edgeOpacity(
      d,
      visibleEdgesRef.current,
      hiTagsRef.current,
      hiNeighborsRef.current,
    )

    // Hidden edges still participate in the force sim via the edges array;
    // only visible edges consume DOM writes per tick.
    const linkLayer = g.append("g")
    const edgeKeys = new WeakMap<Edge, string>()

    function buildLinks(visible: Set<Edge>) {
      const data = edges.filter((e) => visible.has(e))
      const sel = linkLayer
        .selectAll<SVGLineElement, Edge>("line")
        .data(data, (d) => {
          let k = edgeKeys.get(d as Edge)
          if (k) return k
          const [s, t] = edgeEndpoints(d as Edge)
          k = `${s}|${t}`
          edgeKeys.set(d as Edge, k)
          return k
        })
        .join(
          (enter) =>
            enter
              .append("line")
              .attr("stroke-linecap", "round")
              .attr("stroke-width", (d) => wScale(d.weight))
              .attr("stroke", (d) => {
                const s = d.source as Node
                const t = d.target as Node
                return s.cluster === t.cluster ? clusterColor(s.cluster, 0.15) : "var(--color-border)"
              })
              .style("pointer-events", "stroke")
              .style("cursor", "pointer")
              .on("mouseenter", function (e: MouseEvent, d) {
                select(this).attr("opacity", 0.95).attr("stroke-width", wScale(d.weight) + 2)
                const s = d.source as Node
                const t = d.target as Node
                setHover({ kind: "edge", a: s.id, b: t.id, inter: d.inter, weight: d.weight })
                positionTooltip(e.clientX, e.clientY)
              })
              .on("mousemove", (e: MouseEvent) => positionTooltip(e.clientX, e.clientY))
              .on("mouseleave", function (_e, d) {
                select(this)
                  .attr("opacity", baseEdgeOpacity(d))
                  .attr("stroke-width", wScale(d.weight))
                setHover(null)
              })
              .on("click", (_e, d) => {
                const s = (d.source as Node).id
                const t = (d.target as Node).id
                openTagModal([s, t])
              }),
          (update) => update,
          (exit) => exit.remove(),
        )
        .attr("opacity", baseEdgeOpacity)
        .attr("x1", (d) => (d.source as Node).x ?? 0)
        .attr("y1", (d) => (d.source as Node).y ?? 0)
        .attr("x2", (d) => (d.target as Node).x ?? 0)
        .attr("y2", (d) => (d.target as Node).y ?? 0)
      linkSelRef.current = sel
      return sel
    }
    rebuildLinksRef.current = buildLinks
    buildLinks(visibleEdgesRef.current)

    const nodeSel = g
      .append("g")
      .selectAll<SVGGElement, Node>("g")
      .data(nodes, (d) => d.id)
      .join("g")
      .classed("node-g", true)
      .style("cursor", "pointer")

    nodeSel
      .append("circle")
      .attr("r", (d) => rScale(d.count))
      .attr("fill", (d) => clusterColor(d.cluster))
      .attr("fill-opacity", nodeOpacity)
      .attr("stroke", (d) => clusterColor(d.cluster, 0.2))
      .attr("stroke-width", 1.5)

    const labelGeom = (d: Node) => computeLabelGeom(rScale(d.count), labelPosRef.current)

    nodeSel
      .append("text")
      .attr("dy", (d) => labelGeom(d).dy)
      .attr("dominant-baseline", (d) => labelGeom(d).baseline)
      .attr("font-size", (d) => `${fontScale(d.count) * labelSizeRef.current}px`)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--color-text-bright)")
      .attr("stroke", "var(--color-bg)")
      .attr("stroke-width", 2.5)
      .attr("stroke-opacity", 0.7)
      .attr("stroke-linejoin", "round")
      .attr("paint-order", "stroke")
      .attr("font-family", "var(--font-display)")
      .attr("letter-spacing", "0.04em")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .text((d) => d.id)

    // Labels we've decided to show this tick. Driven by greedy collision in the
    // simulation tick handler; hover handlers consult this set.
    const labelVisible = new Set<string>()

    function recomputeLabels() {
      labelVisible.clear()
      const limit = labelLimitRef.current
      if (limit === null) {
        for (const n of nodes) labelVisible.add(n.id)
      } else {
        const ordered = [...nodes].sort((a, b) => b.count - a.count)
        for (let i = 0; i < Math.min(limit, ordered.length); i++) {
          labelVisible.add(ordered[i].id)
        }
      }
      nodeSel.selectAll<SVGTextElement, Node>("text")
        .style("opacity", (d) => (labelVisible.has((d as Node).id) ? 1 : 0))
    }
    recomputeLabelsRef.current = recomputeLabels

    nodeSel
      .on("mouseenter", function (e: MouseEvent, d) {
        const el = this as SVGGElement
        el.parentNode?.appendChild(el)
        const neighbors = new Set<string>()
        for (const edge of edgesForNode.get(d.id) ?? []) {
          const s = (edge.source as Node).id
          const t = (edge.target as Node).id
          neighbors.add(s === d.id ? t : s)
        }
        nodeSel.selectAll<SVGCircleElement, Node>("circle")
          .style("opacity", (n) => (n.id === d.id || neighbors.has(n.id) ? 1 : 0.1))
        nodeSel.selectAll<SVGTextElement, Node>("text")
          .style("opacity", (n) => {
            if (n.id === d.id || neighbors.has(n.id)) return 1
            return labelVisible.has(n.id) ? 0.1 : 0
          })
        linkSelRef.current?.style("opacity", (l) => {
          const s = (l.source as Node).id
          const t = (l.target as Node).id
          return s === d.id || t === d.id ? 0.9 : 0.05
        })
        setHover({ kind: "node", name: d.id, count: d.count, conns: neighbors.size })
        positionTooltip(e.clientX, e.clientY)
      })
      .on("mousemove", (e: MouseEvent) => positionTooltip(e.clientX, e.clientY))
      .on("mouseleave", () => {
        nodeSel.selectAll<SVGCircleElement, Node>("circle").style("opacity", 1)
        nodeSel.selectAll<SVGTextElement, Node>("text")
          .style("opacity", (n) => (labelVisible.has((n as Node).id) ? 1 : 0))
        linkSelRef.current?.style("opacity", (l) => {
          const s = (l.source as Node).cluster
          const t = (l.target as Node).cluster
          return s === t ? 0.35 : 0.08
        })
        setHover(null)
      })
      .on("click", (_e, d) => {
        openTagModal([d.id])
      })

    function clusterForce(alpha: number) {
      const k = cohesionRef.current
      if (k === 0) return
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

    // Push cluster centroids apart so hulls don't overlap. `d3-force`'s
    // charge force repels individual nodes but caps reach and doesn't prevent
    // whole-cluster entanglement. We treat each community as a super-node
    // and apply pairwise repulsion between centroids, distributing the kick
    // evenly to each cluster's members.
    function clusterRepulsionForce(alpha: number) {
      const STRENGTH = 0.15
      const MIN_GAP = 0 // extra padding beyond each cluster's effective radius
      type ClusterAgg = { x: number; y: number; count: number; r: number; members: Node[] }
      const aggs = new Map<number, ClusterAgg>()
      for (const n of nodes) {
        let a = aggs.get(n.cluster)
        if (!a) { a = { x: 0, y: 0, count: 0, r: 0, members: [] }; aggs.set(n.cluster, a) }
        a.x += n.x ?? 0
        a.y += n.y ?? 0
        a.count++
        a.members.push(n)
      }
      for (const a of aggs.values()) {
        a.x /= a.count
        a.y /= a.count
        // Actual bounding radius: furthest member-edge from centroid. Using
        // sqrt(sum r²) underestimates for clusters with outlier nodes, which
        // leaves hulls visibly overlapping even when centroids are "far enough".
        let maxR = 0
        for (const n of a.members) {
          const dx = (n.x ?? 0) - a.x
          const dy = (n.y ?? 0) - a.y
          const d = Math.sqrt(dx * dx + dy * dy) + rScale(n.count) + 6
          if (d > maxR) maxR = d
        }
        a.r = maxR
      }
      const list = [...aggs.values()]
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i]
          const b = list[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
          const want = a.r + b.r + MIN_GAP
          if (dist >= want) continue
          const overlap = want - dist
          // Split force inversely by cluster size — small clusters move more.
          const totalWeight = 1 / a.count + 1 / b.count
          const aShare = (1 / a.count) / totalWeight
          const bShare = (1 / b.count) / totalWeight
          const ux = dx / dist
          const uy = dy / dist
          const kx = ux * overlap * STRENGTH * alpha
          const ky = uy * overlap * STRENGTH * alpha
          for (const n of a.members) {
            n.vx = (n.vx ?? 0) - kx * aShare
            n.vy = (n.vy ?? 0) - ky * aShare
          }
          for (const n of b.members) {
            n.vx = (n.vx ?? 0) + kx * bShare
            n.vy = (n.vy ?? 0) + ky * bShare
          }
        }
      }
    }

    const clusterGroups = group(nodes, (n) => n.cluster)
    const clusterIds = Array.from(clusterGroups.keys())
    const hullSel = hullG
      .selectAll<SVGPathElement, number>("path")
      .data(clusterIds, (d) => d as number)
      .join("path")
      .attr("fill", (cid) => clusterColor(cid))
      .attr("opacity", 0.06)
      .attr("stroke", (cid) => clusterColor(cid))
      .attr("stroke-opacity", 0.18)
      .attr("stroke-width", 1)

    function updateHulls() {
      hullSel.attr("d", (cid) => {
        const members = clusterGroups.get(cid)
        if (!members || members.length < 3) return null
        const points = members.map((n) => [n.x ?? 0, n.y ?? 0] as [number, number])
        const hull = polygonHull(points)
        if (!hull) return null
        const cx = mean(hull, (p) => p[0])!
        const cy = mean(hull, (p) => p[1])!
        const expanded = hull.map(([x, y]) => {
          const dx = x - cx
          const dy = y - cy
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const exp = 25
          return [x + (dx / dist) * exp, y + (dy / dist) * exp]
        })
        return `M${expanded.join("L")}Z`
      })
    }

    let tickCount = 0
    let frameSkip = 0

    simRef.current?.stop()

    // d3-force would otherwise seed positions via a deterministic phyllotaxis
    // spiral, so a node with no edges parks in the same spot on every load.
    // Seed with a random position inside the viewport so the layout (and any
    // edgeless drifters) varies from one reload to the next.
    for (const n of nodes) {
      n.x = Math.random() * w
      n.y = Math.random() * h
      n.vx = 0
      n.vy = 0
    }

    const sim = forceSimulation<Node>(nodes)
      .force(
        "link",
        forceLink<Node, Edge>(edges)
          .id((d) => d.id)
          .distance((d) => {
            const s = d.source as Node
            const t = d.target as Node
            const same = s.cluster === t.cluster
            return ((same ? 30 : 120) + 40 / (1 + d.weight * 3)) * debouncedLinkScale
          })
          .strength((d) => {
            const s = d.source as Node
            const t = d.target as Node
            const same = s.cluster === t.cluster
            const wn = d.weight / maxWeight
            return same ? 0.5 + 0.4 * wn : 0.05 + 0.1 * wn
          }),
      )
      .force("charge", forceManyBody().strength(-debouncedRepulsion).distanceMax(300))
      .force("center", forceCenter(w / 2, h / 2).strength(0.05))
      .force("collision", forceCollide<Node>().radius((d) => rScale(d.count) + 6).strength(0.7))
      .force("cluster", clusterForce)
      .force("clusterRepulsion", clusterRepulsionForce)
      .alphaDecay(0.02)
      .stop()

    // Skip the chaotic initial phase so nodes appear already near final position.
    const PREWARM_TICKS = 30
    for (let i = 0; i < PREWARM_TICKS; i++) sim.tick()

    sim
      .on("tick", () => {
        tickCount++
        // 30fps paint is imperceptible from 60fps for a graph settling; physics still runs full-rate.
        if ((frameSkip++ & 1) === 1) return
        linkSelRef.current
          ?.attr("x1", (d) => (d.source as Node).x ?? 0)
          .attr("y1", (d) => (d.source as Node).y ?? 0)
          .attr("x2", (d) => (d.target as Node).x ?? 0)
          .attr("y2", (d) => (d.target as Node).y ?? 0)
        nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
        if (!tickedOnce) { tickedOnce = true; setSimReady(true) }
        if ((tickCount & 3) === 0) updateHulls()
      })
      .on("end", () => {
        updateHulls()
        setSettling(false)
        if (nodes.length === 0) return
        if (initialFitDone) return
        initialFitDone = true
        const pad = 60
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const n of nodes) {
          const x = n.x ?? 0, y = n.y ?? 0
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
        const bw = Math.max(1, maxX - minX)
        const bh = Math.max(1, maxY - minY)
        const k = Math.max(0.3, Math.min(w / (bw + pad * 2), h / (bh + pad * 2), 2))
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        const tx = w / 2 - k * cx
        const ty = h / 2 - k * cy
        svg.transition().duration(400).call(zoom.transform, zoomIdentity.translate(tx, ty).scale(k))
      })

    recomputeLabels()
    simRef.current = sim
    sim.restart()
    return () => {
      sim.stop()
      if (simRef.current === sim) simRef.current = null
    }
  }, [nodes, edges, fullscreen])

  // Live-update node opacity without rebuilding the simulation.
  useEffect(() => {
    if (!svgRef.current) return
    select(svgRef.current).selectAll<SVGCircleElement, Node>("circle").attr("fill-opacity", nodeOpacity)
  }, [nodeOpacity, nodes])

  // Live-update label size without rebuilding the simulation. The sim's tick
  // collision reads labelSizeRef.current directly, so bbox tests stay in sync.
  useEffect(() => {
    labelSizeRef.current = labelSize
    if (!svgRef.current || nodes.length === 0) return
    const maxCount = max(nodes, (d) => d.count) ?? 1
    const fs = scaleLinear().domain([1, maxCount]).range([6.5, 10.5])
    select(svgRef.current)
      .selectAll<SVGTextElement, Node>("text")
      .attr("font-size", (d) => `${fs(d.count) * labelSize}px`)
  }, [labelSize, nodes])

  // Live-update label limit. Flip the ref and recompute immediately so
  // we don't have to wait for the next sim tick.
  useEffect(() => {
    labelLimitRef.current = labelLimit
    recomputeLabelsRef.current()
  }, [labelLimit])

  // When the node count drops below the user's chosen label limit, snap the
  // slider to "all" so its value matches its visible position.
  useEffect(() => {
    if (labelLimit !== null && labelLimit > nodes.length) setLabelLimit(null)
  }, [nodes.length, labelLimit])

  // Live-update node size + label position. Resize circles, reposition text,
  // and update collision radius in place — no sim rebuild.
  useEffect(() => {
    labelPosRef.current = labelPos
    if (!svgRef.current || nodes.length === 0) return
    const maxCount = max(nodes, (d) => d.count) ?? 1
    const rS = scaleSqrt().domain([1, maxCount]).range([6 * debouncedNodeScale, 28 * debouncedNodeScale])
    const svg = select(svgRef.current)
    svg.selectAll<SVGCircleElement, Node>("circle").attr("r", (d) => rS(d.count))
    const geom = (d: Node) => computeLabelGeom(rS(d.count), labelPos)
    svg.selectAll<SVGTextElement, Node>("text")
      .attr("dy", (d) => geom(d).dy)
      .attr("dominant-baseline", (d) => geom(d).baseline)
    const coll = simRef.current?.force("collision") as ForceCollide<Node> | undefined
    if (coll) coll.radius((d) => rS(d.count) + 6)
    recomputeLabelsRef.current()
  }, [labelPos, nodes, debouncedNodeScale])

  const prevVisibleEdgesRef = useRef<Set<Edge> | null>(null)
  useEffect(() => {
    visibleEdgesRef.current = visibleEdges
    banTagsRef.current = banTags
    hiTagsRef.current = hiTags
    hiNeighborsRef.current = hiNeighbors
    if (!svgRef.current) return
    const anyHi = hiTags.size > 0
    const svg = select(svgRef.current)
    if (prevVisibleEdgesRef.current !== visibleEdges) {
      rebuildLinksRef.current(visibleEdges)
      prevVisibleEdgesRef.current = visibleEdges
    }
    linkSelRef.current
      ?.style("display", (d) => {
        const s = (d.source as Node).id
        const t = (d.target as Node).id
        return banTags.has(s) || banTags.has(t) ? "none" : null
      })
      .style("opacity", (d) => edgeOpacity(d, visibleEdges, hiTags, hiNeighbors))
    svg
      .selectAll<SVGGElement, Node>("g.node-g")
      .style("display", (d) => (banTags.has(d.id) ? "none" : null))
      .style("opacity", (d) => {
        if (banTags.has(d.id)) return null
        if (anyHi && !hiTags.has(d.id) && !hiNeighbors.has(d.id)) return 0.2
        return null
      })
  }, [visibleEdges, banTags, hiTags, hiNeighbors])

  // Live-update link length. Nudge alpha so the graph relaxes instead of restarting cold.
  const bumpSim = () => {
    const sim = simRef.current
    if (!sim) return
    setSettling(true)
    sim.alpha(0.3).restart()
  }

  useEffect(() => {
    const link = simRef.current?.force("link") as ForceLink<Node, Edge> | undefined
    if (!link) return
    link.distance((d) => {
      const s = d.source as Node
      const t = d.target as Node
      const same = s.cluster === t.cluster
      return ((same ? 30 : 120) + 40 / (1 + d.weight * 3)) * debouncedLinkScale
    })
    bumpSim()
  }, [debouncedLinkScale])

  useEffect(() => {
    const charge = simRef.current?.force("charge") as ForceManyBody<Node> | undefined
    if (charge) charge.strength(-debouncedRepulsion)
    bumpSim()
  }, [debouncedRepulsion])

  useEffect(() => {
    cohesionRef.current = cohesion
    bumpSim()
  }, [cohesion])

  const setZoomFromSlider = (k: number) => {
    const svg = select(svgRef.current!)
    const zoom = zoomBehaviorRef.current
    const container = containerRef.current
    if (!zoom || !container) return
    const cx = container.clientWidth / 2
    const cy = container.clientHeight / 2
    svg.call(zoom.scaleTo, k, [cx, cy])
  }

  const downloadPng = () => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container) return
    const clone = svg.cloneNode(true) as SVGSVGElement
    const w = container.clientWidth
    const h = container.clientHeight
    clone.setAttribute("width", String(w))
    clone.setAttribute("height", String(h))
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")

    const styleProps = [
      "fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity",
      "opacity", "font-family", "font-size", "font-weight",
      "text-anchor", "dominant-baseline", "paint-order", "letter-spacing",
    ]
    const inlineStyles = (src: Element, dst: Element) => {
      const cs = getComputedStyle(src)
      let s = ""
      for (const p of styleProps) {
        const v = cs.getPropertyValue(p)
        if (v && v !== "none") s += `${p}:${v};`
      }
      if (s) dst.setAttribute("style", s)
      for (let i = 0; i < src.children.length && i < dst.children.length; i++) {
        inlineStyles(src.children[i], dst.children[i])
      }
    }
    inlineStyles(svg, clone)

    const bg = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim() || "#0a0a0a"
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    rect.setAttribute("width", "100%")
    rect.setAttribute("height", "100%")
    rect.setAttribute("fill", bg)
    clone.insertBefore(rect, clone.firstChild)

    const serial = new XMLSerializer().serializeToString(clone)
    const svgBlob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${serial}`], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(svgBlob)
    const img = new Image()
    img.onload = () => {
      const scale = 2
      const canvas = document.createElement("canvas")
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext("2d")
      if (!ctx) { URL.revokeObjectURL(url); return }
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return
        const pngUrl = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = pngUrl
        a.download = `${labelSingular}-map-${metric}.png`
        a.click()
        URL.revokeObjectURL(pngUrl)
      }, "image/png")
    }
    img.onerror = (e) => {
      console.error("Failed to load SVG for PNG export", e, serial.slice(0, 500))
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1800)
    } catch {
      // Clipboard blocked (older browsers, insecure context). Silent fail —
      // the user can copy the URL bar instead.
    }
  }

  return (
    <div
      ref={containerRef}
      className={
        fullscreen
          ? "fixed inset-0 z-[9000] bg-bg overflow-hidden"
          : "relative h-full w-full overflow-hidden"
      }
    >
      <svg
        ref={svgRef}
        role="img"
        aria-label={`${labelCapital} co-occurrence map: ${nodes.length} ${labelPlural}, ${edges.length} connections`}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      />
      {!simReady && nodes.length > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="font-display text-accent/70 text-xs tracking-[0.3em] uppercase animate-pulse">
            ❧ plotting
          </div>
        </div>
      )}
      {simReady && settling && (
        <div
          className="hidden sm:flex absolute top-3 right-3 z-20 pointer-events-none items-center gap-1.5 bg-bg/75 backdrop-blur-sm border border-border/60 rounded-sm px-2 py-1 text-[9px] font-display tracking-[0.2em] uppercase text-text-dim animate-pulse"
          aria-live="polite"
        >
          <span aria-hidden className="text-accent/70">❧</span>
          computing
        </div>
      )}
      {/* In-canvas search. Local state only — highlights nodes without
          navigating or touching the URL. */}
      <div className={`absolute ${settling ? "top-12" : "top-3"} right-3 z-20 w-[min(16rem,calc(100vw-1.5rem))]`}>
        <div className="flex items-center gap-2 bg-bg/75 backdrop-blur-sm border border-border/60 rounded-sm px-2 py-1">
          <span aria-hidden className="font-display text-xs text-text-dim select-none">⌕</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.trim().toLowerCase())}
            placeholder={`Focus on a ${itemLabel}…`}
            aria-label={`Focus map on a ${itemLabel}`}
            className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder:text-text-dim focus:outline-none font-sans"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="text-text-dim hover:text-text text-sm leading-none cursor-pointer"
            >
              ×
            </button>
          )}
        </div>
      </div>
      {/* Configure + About — control chrome stacked at top-left. */}
      <div className="absolute top-3 left-3 z-20 flex items-start gap-2 text-[10px] tracking-[0.15em] uppercase font-display text-text-dim">
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowAdvanced((v) => !v); if (aboutOpen) setAboutOpen(false) }}
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
            <div className="absolute top-full left-0 mt-2 bg-bg/90 backdrop-blur-sm border border-border/60 rounded-sm px-3 py-3 flex flex-col gap-3 w-[min(44rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100svh-6rem))] overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {/* Data group */}
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
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2" title={`How many of the most-tagged ${labelPlural} to include in the map. Rebuilds clusters.`}>
                    <span>Keep top N</span>
                    <input
                      type="range"
                      min={10}
                      max={maxTopN}
                      step={1}
                      value={topN}
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
                  </label>
                </div>
              </div>

              {/* Layout group */}
              <div className="flex flex-row items-start gap-4">
                <div className="flex items-center gap-1.5 text-accent/70 text-[9px] w-20 shrink-0 pt-1.5">
                  <span className="text-accent/60">❖</span>
                  <span>Layout</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 flex-1">
                  <label className="flex items-center gap-2" title="Visual radius multiplier for circles">
                    <span>Node size</span>
                    <input
                      type="range"
                      min={0.3}
                      max={4}
                      step={0.05}
                      value={nodeScale}
                      onChange={(e) => setNodeScale(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{nodeScale.toFixed(2)}×</span>
                  </label>
                  <label className="flex items-center gap-2" title={`Preferred distance between linked ${labelPlural}. Larger values spread the map out.`}>
                    <span>Link length</span>
                    <input
                      type="range"
                      min={0.2}
                      max={6}
                      step={0.05}
                      value={linkScale}
                      onChange={(e) => setLinkScale(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{linkScale.toFixed(2)}×</span>
                  </label>
                  <label className="flex items-center gap-2" title="How strongly nodes push each other apart. Higher values spread the map.">
                    <span>Node repulsion</span>
                    <input
                      type="range"
                      min={10}
                      max={300}
                      step={5}
                      value={repulsion}
                      onChange={(e) => setRepulsion(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text">{repulsion}</span>
                  </label>
                  <label className="flex items-center gap-2" title="How strongly each node is pulled toward its community centroid. Zero disables clustering force.">
                    <span>Cluster cohesion</span>
                    <input
                      type="range"
                      min={0}
                      max={0.3}
                      step={0.005}
                      value={cohesion}
                      onChange={(e) => setCohesion(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{cohesion.toFixed(3)}</span>
                  </label>
                </div>
              </div>

              {/* Style group */}
              <div className="flex flex-row items-start gap-4">
                <div className="flex items-center gap-1.5 text-accent/70 text-[9px] w-20 shrink-0 pt-1.5">
                  <span className="text-accent/60">❖</span>
                  <span>Style</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 flex-1">
                  <label className="flex items-center gap-2" title="Share of strongest links to draw. Hidden links still shape the layout.">
                    <span>Link density</span>
                    <input
                      type="range"
                      min={1}
                      max={100}
                      value={showTopPct}
                      onChange={(e) => setShowTopPct(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text">{showTopPct}%</span>
                  </label>
                  <label className="flex items-center gap-2" title={`Always show at least this many strongest links per ${labelSingular}, even if link density would hide them.`}>
                    <span>Min links / node</span>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      value={minLinks}
                      onChange={(e) => setMinLinks(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text">{minLinks}</span>
                  </label>
                  <label className="flex items-center gap-2" title={`Fill transparency for ${labelSingular} circles. Lower values let overlapping nodes show through.`}>
                    <span>Node opacity</span>
                    <input
                      type="range"
                      min={0.1}
                      max={1}
                      step={0.05}
                      value={nodeOpacity}
                      onChange={(e) => setNodeOpacity(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{Math.round(nodeOpacity * 100)}%</span>
                  </label>
                  <label className="flex items-center gap-2" title={`Where ${labelSingular} names sit relative to their circle.`}>
                    <span>Label position</span>
                    <select
                      value={labelPos}
                      onChange={(e) => setLabelPos(e.target.value as LabelPos)}
                      className="bg-bg-card border border-border rounded-sm px-2 py-1 text-text"
                    >
                      <option value="below">Below</option>
                      <option value="above">Above</option>
                      <option value="inside">Inside</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2" title={`Font-size multiplier for ${labelSingular} names.`}>
                    <span>Label size</span>
                    <input
                      type="range"
                      min={0.5}
                      max={3}
                      step={0.05}
                      value={labelSize}
                      onChange={(e) => setLabelSize(Number(e.target.value))}
                      className="w-32 accent-accent"
                    />
                    <span className="tabular-nums text-text normal-case tracking-normal">{labelSize.toFixed(2)}×</span>
                  </label>
                  <label className="flex items-center gap-2" title={`How many ${labelSingular} names to display. Largest nodes win when limited.`}>
                    <span>Labels shown</span>
                    <input
                      type="range"
                      min={0}
                      max={nodes.length}
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
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => { setAboutOpen((v) => !v); if (showAdvanced) setShowAdvanced(false) }}
            aria-expanded={aboutOpen}
            aria-label="About this map"
            className={`w-7 h-7 flex items-center justify-center backdrop-blur-sm border rounded-sm font-serif italic text-sm transition-colors ${
              aboutOpen
                ? "bg-bg/90 border-accent/40 text-accent"
                : "bg-bg/75 border-border/60 text-text-dim hover:text-text hover:border-accent/50"
            }`}
          >
            ?
          </button>
          {aboutOpen && (
            <div className="absolute top-full left-0 mt-2 w-[min(34rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100svh-8rem))] overflow-y-auto bg-bg-card border border-border rounded-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                <span className="font-display text-[10px] tracking-[0.2em] uppercase text-accent">
                  About this map
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
                between two {labelPlural} means albums share both tags. Thicker, brighter lines
                mean stronger overlap.
              </p>
              <p>
                Colors mark <span className="text-text">groups</span> of {labelPlural} that link
                densely to one another — found automatically from the data, not labeled
                by hand (
                <a
                  href="https://en.wikipedia.org/wiki/Louvain_method"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-dim hover:text-accent underline decoration-dotted underline-offset-2"
                  aria-label="Wikipedia article for the Louvain community-detection method"
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
                  <li>Scroll or use the zoom slider to pan in</li>
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
                                aria-label={`Wikipedia article for ${m.label}`}
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

      {/* View & capture — zoom the current view, save it, share it. */}
      <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 sm:gap-2.5 bg-bg/90 backdrop-blur-sm border border-border rounded-sm px-3 py-1.5 text-[10px] tracking-[0.15em] uppercase font-display text-text-dim">
        <div className="hidden sm:flex items-center gap-2">
          <span aria-hidden className="text-accent/50">◈</span>
          <input
            type="range"
            min={0.3}
            max={5}
            step={0.05}
            value={zoomLevel}
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
          aria-label="Save map as PNG"
          title="Save map as PNG"
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

      {nodes.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="font-display text-accent/60 text-sm tracking-[0.25em] uppercase mb-1">
              ❧ empty cartography
            </div>
            <div className="font-serif italic text-text-dim text-xs">
              no {labelPlural} match the current filter
            </div>
          </div>
        </div>
      )}
      {hover && (
        <div
          ref={tooltipRef}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed z-50 bg-bg-card border border-border rounded-sm px-3 py-2 text-xs"
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
