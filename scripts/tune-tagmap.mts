// Sweeps TagMap physics parameters against real genre data, runs a
// synchronous d3-force settle per combination, and reports layout metrics
// that matter for legibility: cluster separation, link-length ratio, and
// total bounding-box area. Goal: pick defaults that give clear structure
// without exaggerated spread.
//
// Run: npx tsx scripts/tune-tagmap.mts
//
// Requires SUPABASE_URL + SUPABASE_SECRET_KEY in .env.local (same vars the
// site uses).

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force"
import { polygonHull, polygonArea } from "d3-polygon"
import { readFileSync } from "node:fs"
import { scaleSqrt } from "d3-scale"
// Node 25's native TS loader conflicts with tsx for static imports of .ts —
// use a dynamic import so tsx's hook is in control.
const logicMod = await import("../lib/tagMapLogic.ts")
const buildTagGraph = logicMod.buildTagGraph as typeof import("../lib/tagMapLogic.ts").buildTagGraph
type TagNode = import("../lib/tagMapLogic.ts").TagNode
type TagEdge = import("../lib/tagMapLogic.ts").TagEdge

function loadEnv() {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY!

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`RPC ${fn} failed: ${r.status} ${await r.text()}`)
  return r.json() as Promise<T>
}

async function fetchData(category: "genre" | "theme", topK = 300) {
  const counts = await rpc<{ name: string; n: number }[]>("tag_counts", {
    p_category: category,
    p_top_k: topK,
  })
  const pairs = await rpc<{ tag_a: string; tag_b: string; n: number }[]>(
    "tag_pairs",
    { p_category: category, p_top_k: topK },
  )
  return { counts, pairs: pairs.map((p) => ({ a: p.tag_a, b: p.tag_b, n: Number(p.n) })) }
}

type Params = {
  repulsion: number
  cohesion: number
  clusterSep: number
  linkStiffness: number
  gravity: number
}

function settle(
  nodes: TagNode[],
  edges: TagEdge[],
  p: Params,
  w = 1600,
  h = 900,
): void {
  const maxCount = Math.max(1, ...nodes.map((n) => n.count))
  const rScale = scaleSqrt().domain([1, maxCount]).range([6, 28])

  for (const n of nodes) {
    n.x = Math.random() * w
    n.y = Math.random() * h
    n.vx = 0
    n.vy = 0
    n.fx = undefined
    n.fy = undefined
  }

  const clusterForce = (alpha: number) => {
    if (p.cohesion === 0) return
    const cen = new Map<number, { x: number; y: number; c: number }>()
    for (const n of nodes) {
      const e = cen.get(n.cluster) ?? { x: 0, y: 0, c: 0 }
      e.x += n.x ?? 0; e.y += n.y ?? 0; e.c++
      cen.set(n.cluster, e)
    }
    for (const e of cen.values()) { e.x /= e.c; e.y /= e.c }
    for (const n of nodes) {
      const c = cen.get(n.cluster)!
      n.vx = (n.vx ?? 0) + (c.x - (n.x ?? 0)) * alpha * p.cohesion
      n.vy = (n.vy ?? 0) + (c.y - (n.y ?? 0)) * alpha * p.cohesion
    }
  }

  const clusterRepulsionForce = (alpha: number) => {
    if (p.clusterSep === 0) return
    type Agg = { x: number; y: number; c: number; r: number; m: TagNode[] }
    const aggs = new Map<number, Agg>()
    for (const n of nodes) {
      let a = aggs.get(n.cluster)
      if (!a) { a = { x: 0, y: 0, c: 0, r: 0, m: [] }; aggs.set(n.cluster, a) }
      a.x += n.x ?? 0; a.y += n.y ?? 0; a.c++; a.m.push(n)
    }
    for (const a of aggs.values()) {
      a.x /= a.c; a.y /= a.c
      let maxR = 0
      for (const n of a.m) {
        const dx = (n.x ?? 0) - a.x, dy = (n.y ?? 0) - a.y
        const d = Math.sqrt(dx * dx + dy * dy) + rScale(n.count) + 6
        if (d > maxR) maxR = d
      }
      a.r = maxR
    }
    const list = [...aggs.values()]
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j]
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const want = a.r + b.r
        if (dist >= want) continue
        const overlap = want - dist
        const tw = 1 / a.c + 1 / b.c
        const aShare = (1 / a.c) / tw
        const bShare = (1 / b.c) / tw
        const ux = dx / dist, uy = dy / dist
        const kx = ux * overlap * p.clusterSep * alpha
        const ky = uy * overlap * p.clusterSep * alpha
        for (const n of a.m) { n.vx = (n.vx ?? 0) - kx * aShare; n.vy = (n.vy ?? 0) - ky * aShare }
        for (const n of b.m) { n.vx = (n.vx ?? 0) + kx * bShare; n.vy = (n.vy ?? 0) + ky * bShare }
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
          return (same ? 30 : 120) + 40 / (1 + d.weight * 3)
        })
        .strength((d) => {
          const s = d.source as TagNode
          const t = d.target as TagNode
          const base = s.cluster === t.cluster ? 0.7 : 0.1
          return base * p.linkStiffness
        }),
    )
    .force("charge", forceManyBody().strength(-p.repulsion).distanceMax(300))
    .force("center", forceCenter(w / 2, h / 2).strength(p.gravity))
    .force(
      "collision",
      forceCollide<TagNode>().radius((d) => rScale(d.count) + 6).strength(0.7),
    )
    .force("cluster", clusterForce)
    .force("clusterRepulsion", clusterRepulsionForce)
    .alphaDecay(0.02)
    .stop()

  while (sim.alpha() > sim.alphaMin()) sim.tick()
}

type Metrics = {
  meanLinkLen: number
  meanNodeRadius: number
  linkToRadiusRatio: number
  meanClusterRadius: number
  clusterOverlapRatio: number // fraction of cluster pairs whose expanded hulls overlap
  bboxArea: number
  nodes: number
  clusters: number
}

function measure(nodes: TagNode[], edges: TagEdge[]): Metrics {
  const maxCount = Math.max(1, ...nodes.map((n) => n.count))
  const rScale = scaleSqrt().domain([1, maxCount]).range([6, 28])

  // Link lengths (Euclidean between node positions).
  let linkLenSum = 0
  for (const e of edges) {
    const s = e.source as TagNode
    const t = e.target as TagNode
    const dx = (s.x ?? 0) - (t.x ?? 0)
    const dy = (s.y ?? 0) - (t.y ?? 0)
    linkLenSum += Math.sqrt(dx * dx + dy * dy)
  }
  const meanLinkLen = edges.length ? linkLenSum / edges.length : 0
  const meanNodeRadius =
    nodes.reduce((s, n) => s + rScale(n.count), 0) / Math.max(1, nodes.length)

  // Per-cluster bounding hull + centroid.
  const byCluster = new Map<number, TagNode[]>()
  for (const n of nodes) {
    if (!byCluster.has(n.cluster)) byCluster.set(n.cluster, [])
    byCluster.get(n.cluster)!.push(n)
  }
  type CInfo = { cx: number; cy: number; r: number }
  const clusters: CInfo[] = []
  for (const members of byCluster.values()) {
    if (members.length < 1) continue
    const cx = members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length
    const cy = members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length
    let maxR = 0
    for (const n of members) {
      const dx = (n.x ?? 0) - cx
      const dy = (n.y ?? 0) - cy
      const d = Math.sqrt(dx * dx + dy * dy) + rScale(n.count) + 6 + 25
      if (d > maxR) maxR = d
    }
    clusters.push({ cx, cy, r: maxR })
  }
  const meanClusterRadius =
    clusters.reduce((s, c) => s + c.r, 0) / Math.max(1, clusters.length)

  let overlaps = 0
  let pairs = 0
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      pairs++
      const a = clusters[i], b = clusters[j]
      const dx = b.cx - a.cx, dy = b.cy - a.cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < a.r + b.r) overlaps++
    }
  }
  const clusterOverlapRatio = pairs ? overlaps / pairs : 0

  // Bounding box of positions (cheaper than full polygonHull).
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    const x = n.x ?? 0, y = n.y ?? 0
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  const bboxArea = (maxX - minX) * (maxY - minY)

  return {
    meanLinkLen,
    meanNodeRadius,
    linkToRadiusRatio: meanLinkLen / Math.max(1, meanNodeRadius),
    meanClusterRadius,
    clusterOverlapRatio,
    bboxArea,
    nodes: nodes.length,
    clusters: clusters.length,
  }
}

// Silence polygonArea — unused import warning if we remove, keep for future.
void polygonArea
void polygonHull

function fmt(n: number, p = 1) {
  if (!isFinite(n)) return "—"
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  return n.toFixed(p)
}

function row(label: string, m: Metrics) {
  return [
    label.padEnd(38),
    `link=${fmt(m.meanLinkLen)}`.padEnd(12),
    `r=${fmt(m.meanNodeRadius)}`.padEnd(9),
    `L/r=${fmt(m.linkToRadiusRatio, 2)}`.padEnd(11),
    `clR=${fmt(m.meanClusterRadius)}`.padEnd(11),
    `overlap=${(m.clusterOverlapRatio * 100).toFixed(0)}%`.padEnd(13),
    `bbox=${fmt(Math.sqrt(m.bboxArea))}px`,
  ].join("")
}

async function main() {
  const category: "genre" | "theme" = "genre"
  const topK = 100
  console.log(`Fetching ${category} data (top ${topK}) …`)
  const { counts, pairs } = await fetchData(category, topK)
  console.log(`  counts=${counts.length}, pairs=${pairs.length}`)

  // Seed a deterministic RNG so repeated sweeps compare apples-to-apples.
  const baseRandom = Math.random
  let seed = 42
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0xffffffff
  }

  const defaults: Params = {
    repulsion: 80,
    cohesion: 0.08,
    clusterSep: 0.15,
    linkStiffness: 1,
    gravity: 0.05,
  }

  const runOnce = (label: string, p: Params) => {
    const { nodes, edges } = buildTagGraph(counts, pairs, "jaccard", topK)
    settle(nodes, edges, p)
    const m = measure(nodes, edges)
    console.log(row(label, m))
  }

  console.log("\n== Defaults ==")
  runOnce("defaults", defaults)

  console.log("\n== Sweep: node repulsion ==")
  for (const v of [0, 40, 80, 150, 300, 500, 800, 1000]) {
    runOnce(`repulsion=${v}`, { ...defaults, repulsion: v })
  }

  console.log("\n== Sweep: cluster cohesion ==")
  for (const v of [0, 0.05, 0.1, 0.2, 0.4, 0.7, 1]) {
    runOnce(`cohesion=${v}`, { ...defaults, cohesion: v })
  }

  console.log("\n== Sweep: cluster separation ==")
  for (const v of [0, 0.15, 0.3, 0.6, 1, 1.5, 2]) {
    runOnce(`clusterSep=${v}`, { ...defaults, clusterSep: v })
  }

  console.log("\n== Sweep: link stiffness ==")
  for (const v of [0, 0.3, 0.7, 1, 1.5, 2.5, 4]) {
    runOnce(`linkStiffness=${v}`, { ...defaults, linkStiffness: v })
  }

  console.log("\n== Sweep: gravity ==")
  for (const v of [0, 0.02, 0.05, 0.1, 0.2, 0.5, 1]) {
    runOnce(`gravity=${v}`, { ...defaults, gravity: v })
  }

  // Targeted: low overlap + readable L/r. Weaker link springs + stronger
  // cluster separation should let communities spread apart.
  console.log("\n== Combined: lower link stiffness + stronger clusterSep ==")
  for (const ls of [0.2, 0.35, 0.5]) {
    for (const cs of [0.5, 1, 1.5, 2]) {
      runOnce(
        `linkStiffness=${ls}, clusterSep=${cs}`,
        { ...defaults, linkStiffness: ls, clusterSep: cs },
      )
    }
  }

  // Restore original RNG.
  Math.random = baseRandom
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
