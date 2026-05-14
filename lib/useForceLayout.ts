"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { scaleSqrt } from "d3-scale"
import type { TagNode, TagEdge } from "@/lib/tagGraphLogic"
import {
  buildPositionSignature,
  applyCachedPositions,
  snapshotFromNodes,
  useGraphPositionCache,
} from "@/lib/useGraphPositionCache"
import { useDebounced } from "@/lib/useDebounced"
import { clusterSepFromLinkDistance, CLUSTER_COHESION_EPSILON } from "@/lib/tagGraphDefaults"

export type SpacingStats = { intra: number; inter: number; ratio: number }

export type Forces = {
  repel: number
  linkDistance: number
  center: number
  clusterCohesion: number
}

// Link spring stiffness is held constant; users tune layout via Repel and
// Link distance which already cover the visible whitespace + cluster gap
// axes.
const LINK_FORCE_CONSTANT = 0.5

type UseForceLayoutArgs = {
  category: string
  nodes: TagNode[]
  edges: TagEdge[]
  size: { w: number; h: number } | null
  forces: Forces
  clustering: boolean
  reseedTick: number
  // Stable inputs that change the graph shape; folded into the position
  // cache signature so a cache hit only happens when the same shape was
  // settled before.
  cacheSignature: string
}

export function useForceLayout(args: UseForceLayoutArgs) {
  const { category, nodes, edges, size, forces, clustering, reseedTick, cacheSignature } = args

  const debouncedRepel = useDebounced(forces.repel, 150)
  const debouncedLinkDistance = useDebounced(forces.linkDistance, 150)
  const debouncedCenter = useDebounced(forces.center, 150)
  const debouncedClusterCohesion = useDebounced(forces.clusterCohesion, 150)

  const [ready, setReady] = useState(false)
  const [spacingStats, setSpacingStats] = useState<SpacingStats | null>(null)
  const hullCacheRef = useRef<Map<number, [number, number][]>>(new Map())
  const positionCache = useGraphPositionCache(category)

  const maxCount = useMemo(() => {
    let m = 1
    for (const n of nodes) if (n.count > m) m = n.count
    return m
  }, [nodes])

  const baseRScale = useMemo(
    () => scaleSqrt().domain([1, maxCount]).range([6, 28]),
    [maxCount],
  )

  // Build the full cache key: the shape signature plus the force values
  // that would shift the settled layout meaningfully. We *don't* include
  // visual-only knobs (node opacity, label size, etc.).
  const cacheKey = useMemo(
    () =>
      buildPositionSignature([
        cacheSignature,
        clustering,
        debouncedRepel,
        debouncedLinkDistance,
        debouncedCenter,
        debouncedClusterCohesion,
        reseedTick,
      ]),
    [
      cacheSignature,
      clustering,
      debouncedRepel,
      debouncedLinkDistance,
      debouncedCenter,
      debouncedClusterCohesion,
      reseedTick,
    ],
  )

  useEffect(() => {
    if (!size || nodes.length === 0) return
    setReady(false)
    const { w, h } = size

    // Cache hit: rehydrate positions + hulls, skip settle entirely.
    // reseedTick is part of cacheKey so a ↻ press cannot collide with a
    // prior cached settle under the same forces.
    const cached = positionCache.read(cacheKey)
    if (cached && applyCachedPositions(nodes, cached)) {
      hullCacheRef.current = new Map(cached.hulls)
      setReady(true)
      return
    }

    // Deterministic per-node seeding: a given tag id always lands in the
    // same starting position for a given `reseedTick`. Adding nodes (Top-N
    // up) or changing forces never shifts the seed cloud — only the ↻
    // button advances `reseedTick`, which globally re-rolls every tag's
    // starting position. Lets the user compare slider effects against a
    // fixed starting state.
    const cx = w / 2
    const cy = h / 2
    const spread = Math.min(w, h) * 0.2
    const seed = (reseedTick + 1) * 2654435761
    const hashTo01 = (id: string, salt: number): number => {
      let h = (seed ^ salt) >>> 0
      for (let i = 0; i < id.length; i++) {
        h = (h * 31 + id.charCodeAt(i)) >>> 0
      }
      // Mix to avoid clustering for similar ids.
      h ^= h >>> 16
      h = (h * 0x85ebca6b) >>> 0
      h ^= h >>> 13
      return h / 0x100000000
    }
    for (const n of nodes) {
      n.x = cx + (hashTo01(n.id, 0xA) - 0.5) * spread
      n.y = cy + (hashTo01(n.id, 0xB) - 0.5) * spread
      n.vx = 0
      n.vy = 0
      n.fx = undefined
      n.fy = undefined
    }

    // Forces ignore clustering entirely once cohesion is at (or near) zero
    // so the layout collapses to the same equilibrium as clustering = off.
    // Colour + hull rendering still use the original `clustering` flag.
    const forceClustering = clustering && debouncedClusterCohesion > CLUSTER_COHESION_EPSILON
    const isSameCluster = (s: TagNode, t: TagNode) => forceClustering && s.cluster === t.cluster

    type Agg = { x: number; y: number; count: number; r: number; members: TagNode[] }
    const clusterAggs: Agg[] = []
    if (forceClustering) {
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

    function clusterRepulsionForce(alpha: number) {
      if (!forceClustering) return
      const STRENGTH = clusterSepFromLinkDistance(debouncedLinkDistance) * debouncedClusterCohesion
      if (STRENGTH === 0) return
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
          // Always-on inverse-distance push so the slider has effect even
          // when clusters aren't overlapping. Overlap regime adds an extra
          // hard push proportional to overlap depth. Internal multipliers
          // are tuned so the 0..2 slider covers "subtle" → "clusters fly
          // apart" visibly against the rest of the force budget.
          const baseKick = (want / dist) * STRENGTH * 60
          const overlap = Math.max(0, want - dist)
          const overlapKick = overlap * STRENGTH * 8
          const totalKick = (baseKick + overlapKick) * alpha
          const totalWeight = 1 / a.count + 1 / b.count
          const aShare = (1 / a.count) / totalWeight
          const bShare = (1 / b.count) / totalWeight
          const ux = dx / dist, uy = dy / dist
          const kx = ux * totalKick
          const ky = uy * totalKick
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

    const sim = forceSimulation<TagNode>(nodes)
      .force(
        "link",
        forceLink<TagNode, TagEdge>(edges)
          .id((d) => d.id)
          .distance((d) => {
            const s = d.source as TagNode
            const t = d.target as TagNode
            const density = Math.sqrt(Math.max(1, nodes.length) / 50)
            const intraScale = 1 + (debouncedLinkDistance - 1) * (1 - debouncedClusterCohesion)
            // 60px base keeps layouts visibly airy at default linkDistance.
            const base = (isSameCluster(s, t) ? 60 * intraScale : 60 * debouncedLinkDistance) * density
            return base + 40 / (1 + d.weight * 3)
          })
          .strength((d) => {
            const intra = 0.1 + 0.6 * debouncedClusterCohesion
            const base = isSameCluster(d.source as TagNode, d.target as TagNode) ? intra : 0.1
            return base * LINK_FORCE_CONSTANT
          }),
      )
      // No distanceMax: charge reaches across the whole graph, so Repel has
      // visible effect even on far-apart nodes. Cost is O(n²) per tick but
      // we settle once synchronously, so it's fine at our scale.
      .force("charge", forceManyBody().strength(-debouncedRepel))
      // `forceCenter` only translates the layout's centroid to (w/2, h/2);
      // a weak forceX/Y is what actually attracts outliers — that's what
      // the Center slider drives.
      .force("center", forceCenter(w / 2, h / 2))
      .force("x", forceX(w / 2).strength(debouncedCenter))
      .force("y", forceY(h / 2).strength(debouncedCenter))
      .force(
        "collision",
        forceCollide<TagNode>().radius((d) => baseRScale(d.count) + 6).strength(0.7),
      )
      .force("clusterRepulsion", clusterRepulsionForce)
      .alphaDecay(0.02)
      .stop()

    const raf = requestAnimationFrame(() => {
      while (sim.alpha() > sim.alphaMin()) sim.tick()

      // Measure cluster separation: mean intra-cluster edge length vs inter.
      // Ratio near 1 = visual mixing; high gap = well-separated communities.
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
      setSpacingStats({ intra, inter, ratio: intra ? inter / intra : 0 })

      // Cache cluster hull geometry now that positions are final.
      const nextHulls = new Map<number, [number, number][]>()
      if (clustering) {
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
      }
      hullCacheRef.current = nextHulls

      // Write through to session cache so back-nav rehydrates instantly.
      positionCache.write(cacheKey, snapshotFromNodes(nodes, nextHulls))

      setReady(true)
    })
    return () => {
      cancelAnimationFrame(raf)
      sim.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    nodes,
    edges,
    size,
    debouncedRepel,
    debouncedLinkDistance,
    debouncedCenter,
    debouncedClusterCohesion,
    clustering,
    reseedTick,
    cacheKey,
  ])

  return { ready, hullCacheRef, spacingStats }
}
