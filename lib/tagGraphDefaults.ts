// Shared TagGraph defaults — used by `components/TagGraphCanvas.tsx`,
// `lib/useTagGraphState.ts`, and `scripts/tune-taggraph.mts` so the canvas
// and the param-sweep CLI agree on the same baseline.

import type { Metric, LabelPos } from "@/lib/tagGraphLogic"

export const DEFAULTS = {
  // Filters
  metric: "jaccard" as Metric,
  showTopPct: 30,
  minLinks: 2,
  // Display
  nodeScale: 1,
  nodeOpacity: 0.9,
  labelSize: 1,
  labelAutoSize: true,
  labelPos: "inside" as LabelPos,
  textFade: 0.5,
  focusOnHover: true,
  // Forces
  repel: 50,
  linkDistance: 3,
  center: 0.05,
  // Clustering
  clustering: true,
  showHulls: true,
  clusterCohesion: 1,
} as const

const FALLBACK_TOP_N = 100

export function defaultTopN(maxTopN: number): number {
  return Math.min(FALLBACK_TOP_N, maxTopN)
}

// Cluster centroid repulsion is driven by Link distance: as inter-edge
// length grows, cluster centroids push apart proportionally. Shared
// between the live canvas and `scripts/tune-taggraph.mts`.
export const clusterSepFromLinkDistance = (ld: number): number => ld * 0.05

// Below this Cluster cohesion value the force-side acts as if clustering
// were off entirely — keeps the slider's 0 endpoint behaviourally identical
// to toggling clustering off.
export const CLUSTER_COHESION_EPSILON = 0.001

export const URL_KEYS = {
  metric: "m",
  topN: "n",
  showTopPct: "d",
  minLinks: "ml",
  labelPos: "lp",
  clustering: "c",
  showHulls: "sh",
  focusOnHover: "fh",
  textFade: "lf",
  linkDistance: "ld",
  repel: "r",
  center: "ce",
  searchQuery: "q",
  clusterCohesion: "co",
} as const
