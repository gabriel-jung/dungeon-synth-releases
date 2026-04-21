// Pure logic for TagMapCanvas — metrics, Louvain clustering, edge filtering,
// and color palette. No React, no DOM, no d3-selection.

import { hsl } from "d3-color"
import type { SimulationNodeDatum, SimulationLinkDatum } from "d3-force"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TagCount = { name: string; n: number }
export type TagPair = { a: string; b: string; n: number }

export type Metric = "raw" | "jaccard" | "pmi" | "cosine"
export type LabelPos = "below" | "above" | "inside"

export type TagNode = SimulationNodeDatum & { id: string; count: number; cluster: number }
export type TagEdge = SimulationLinkDatum<TagNode> & { weight: number; inter: number }

export type MetricInfo = {
  value: Metric
  label: string
  tex: string
  blurb: (plural: string) => string
  wiki?: string
}

export const METRICS: MetricInfo[] = [
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

export const METRIC_VALUES: readonly Metric[] = ["raw", "jaccard", "pmi", "cosine"] as const
export const LABEL_POS_VALUES: readonly LabelPos[] = ["below", "above", "inside"] as const

// ---------------------------------------------------------------------------
// URL param helpers
// ---------------------------------------------------------------------------

export function parseEnum<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}

export function parseNumber(v: string | null, fallback: number, min: number, max: number): number {
  if (v == null) return fallback
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const CLUSTER_HUES = [35, 200, 0, 270, 110, 50, 320, 170, 230, 90]
const GOLDEN_ANGLE = 137.508

export function clusterColor(idx: number, lightDelta = 0): string {
  const h = idx < CLUSTER_HUES.length
    ? CLUSTER_HUES[idx]
    : (CLUSTER_HUES[0] + idx * GOLDEN_ANGLE) % 360
  const l = Math.min(0.5 + lightDelta, 0.75)
  return hsl(h, 0.4, l).formatHex()
}

// ---------------------------------------------------------------------------
// Edges — endpoint unwrap, weight, visibility, opacity
// ---------------------------------------------------------------------------

// d3-force mutates edges so source/target become Node objects after the first
// tick. Before that, they're still the original id strings.
export function edgeEndpoints(e: TagEdge): [string, string] {
  const s = typeof e.source === "object" ? (e.source as TagNode).id : (e.source as string)
  const t = typeof e.target === "object" ? (e.target as TagNode).id : (e.target as string)
  return [s, t]
}

// Laplace smoothing for PMI so log₂ stays defined when counts are tiny.
const PMI_ALPHA = 1

export function weightFor(
  metric: Metric,
  countA: number,
  countB: number,
  intersection: number,
  totalAlbums: number,
): number {
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

// Every node keeps its top-K strongest edges (floor) so sparse thresholds
// don't produce orphans. Above the floor, the density cap keeps the globally
// strongest fraction of edges and drops the rest from paint (they still feed
// the physics sim if the caller uses them there).
export function computeVisibleEdges(
  edges: TagEdge[],
  minLinks: number,
  showTopPct: number,
): Set<TagEdge> {
  const perNode = new Map<string, TagEdge[]>()
  for (const e of edges) {
    const [s, t] = edgeEndpoints(e)
    if (!perNode.has(s)) perNode.set(s, [])
    if (!perNode.has(t)) perNode.set(t, [])
    perNode.get(s)!.push(e)
    perNode.get(t)!.push(e)
  }
  const floor = new Set<TagEdge>()
  for (const arr of perNode.values()) {
    arr.sort((x, y) => y.weight - x.weight)
    for (let i = 0; i < Math.min(minLinks, arr.length); i++) floor.add(arr[i])
  }
  const sorted = edges.map((e) => e.weight).sort((a, b) => a - b)
  const dropCount = Math.floor(sorted.length * (1 - showTopPct / 100))
  const cutoff = dropCount > 0 ? sorted[dropCount - 1] : -Infinity
  const set = new Set<TagEdge>()
  for (const e of edges) if (e.weight > cutoff || floor.has(e)) set.add(e)
  return set
}

// ---------------------------------------------------------------------------
// Louvain community detection
// ---------------------------------------------------------------------------

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

export function detectCommunities(nodes: TagNode[], edges: TagEdge[]): Record<string, number> {
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

// Louvain numbers communities by discovery order; reassign so cluster 0 is
// the community that contains the highest-count tag, etc. Keeps colors stable
// across re-renders since the palette is indexed.
export function stabilizeClusters(
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

// ---------------------------------------------------------------------------
// Graph build — counts + pairs → nodes + weighted edges + clusters
// ---------------------------------------------------------------------------

export function buildTagGraph(
  counts: TagCount[],
  pairs: TagPair[],
  metric: Metric,
  topN: number,
): { nodes: TagNode[]; edges: TagEdge[] } {
  const active = new Set(
    [...counts].sort((x, y) => y.n - x.n).slice(0, topN).map((c) => c.name),
  )
  // PMI needs N = total albums. We don't have that directly, but sum of
  // per-tag counts over-counts by (avg tags per album) — still a reasonable
  // proxy for scale; the PMI ranking is what matters, not the absolute
  // value. Max-of-counts underestimates N and systematically biases PMI.
  const tagCounts = new Map<string, number>()
  let totalAlbums = 0
  for (const c of counts) {
    tagCounts.set(c.name, c.n)
    totalAlbums += c.n
  }
  totalAlbums = Math.max(totalAlbums, 1)

  const all: TagEdge[] = []
  for (const p of pairs) {
    if (!active.has(p.a) || !active.has(p.b)) continue
    const w = weightFor(metric, tagCounts.get(p.a) ?? 0, tagCounts.get(p.b) ?? 0, p.n, totalAlbums)
    if (w > 0) all.push({ source: p.a, target: p.b, weight: w, inter: p.n })
  }

  const ns: TagNode[] = [...active].map((t) => ({
    id: t,
    count: tagCounts.get(t) ?? 0,
    cluster: 0,
  }))
  const rawComms = detectCommunities(ns, all)
  const comms = stabilizeClusters(rawComms, tagCounts)
  for (const n of ns) n.cluster = comms[n.id] ?? 0
  return { nodes: ns, edges: all }
}
