"use client"

import { useCallback, useMemo } from "react"
import type { TagNode } from "@/lib/tagGraphLogic"

// sessionStorage cache of settled node positions + hull geometry, keyed by
// the graph-shape signature. Lets back-nav (or reopening the same scope)
// rehydrate instantly without a fresh d3-force settle. Sized to one entry
// per signature per category; quota is generous (~5MB) so we don't bother
// evicting.

const CACHE_KEY_PREFIX = "tag-graph-positions-v1"

type CachedSnapshot = {
  positions: Array<[string, number, number]>
  hulls: Array<[number, [number, number][]]>
}

function makeKey(category: string, sig: string): string {
  return `${CACHE_KEY_PREFIX}:${category}:${sig}`
}

export function buildPositionSignature(parts: Array<string | number | boolean>): string {
  return parts.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : String(p))).join("|")
}

export function useGraphPositionCache(category: string) {
  const read = useCallback(
    (sig: string): CachedSnapshot | null => {
      if (typeof sessionStorage === "undefined") return null
      try {
        const raw = sessionStorage.getItem(makeKey(category, sig))
        if (!raw) return null
        return JSON.parse(raw) as CachedSnapshot
      } catch {
        return null
      }
    },
    [category],
  )

  const write = useCallback(
    (sig: string, snapshot: CachedSnapshot) => {
      if (typeof sessionStorage === "undefined") return
      // sessionStorage.setItem is synchronous and the snapshot can run
      // 5–15 KB; defer to idle time so it never adds jank to the frame
      // right after a settle.
      const run = () => {
        try {
          sessionStorage.setItem(makeKey(category, sig), JSON.stringify(snapshot))
        } catch {
          // Quota exceeded or storage disabled, cache is an optimization.
        }
      }
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
      if (typeof ric === "function") ric(run)
      else setTimeout(run, 0)
    },
    [category],
  )

  return useMemo(() => ({ read, write }), [read, write])
}

export function snapshotFromNodes(
  nodes: TagNode[],
  hulls: Map<number, [number, number][]>,
): CachedSnapshot {
  return {
    positions: nodes.map((n) => [n.id, n.x ?? 0, n.y ?? 0]),
    hulls: [...hulls.entries()],
  }
}

export function applyCachedPositions(nodes: TagNode[], snapshot: CachedSnapshot): boolean {
  const map = new Map(snapshot.positions.map(([id, x, y]) => [id, { x, y }]))
  let allHit = true
  for (const n of nodes) {
    const p = map.get(n.id)
    if (p) {
      n.x = p.x
      n.y = p.y
      n.vx = 0
      n.vy = 0
      n.fx = undefined
      n.fy = undefined
    } else {
      allHit = false
    }
  }
  return allHit
}
