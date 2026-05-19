"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  parseEnum,
  parseNumber,
  parseBool,
  METRIC_VALUES,
  LABEL_POS_VALUES,
  type Metric,
  type LabelPos,
} from "@/lib/tagGraphLogic"
import { DEFAULTS, URL_KEYS, defaultTopN as resolveDefaultTopN } from "@/lib/tagGraphDefaults"

export type TagGraphState = ReturnType<typeof useTagGraphState>

export function useTagGraphState(maxTopN: number) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const defaultTopN = resolveDefaultTopN(maxTopN)

  // URL → initial state, read once on mount. Subsequent URL writes flow
  // the other direction (see sync effect below). `maxTopN` is stable per
  // route (genres vs themes are separate pages), so empty deps are safe.
  const initial = useMemo(
    () => ({
      metric: parseEnum<Metric>(searchParams.get(URL_KEYS.metric), METRIC_VALUES, DEFAULTS.metric),
      topN: parseNumber(searchParams.get(URL_KEYS.topN), defaultTopN, 10, maxTopN),
      showTopPct: parseNumber(searchParams.get(URL_KEYS.showTopPct), DEFAULTS.showTopPct, 1, 100),
      minLinks: parseNumber(searchParams.get(URL_KEYS.minLinks), DEFAULTS.minLinks, 0, 8),
      labelPos: parseEnum<LabelPos>(searchParams.get(URL_KEYS.labelPos), LABEL_POS_VALUES, DEFAULTS.labelPos),
      clustering: parseBool(searchParams.get(URL_KEYS.clustering), DEFAULTS.clustering),
      showHulls: parseBool(searchParams.get(URL_KEYS.showHulls), DEFAULTS.showHulls),
      focusOnHover: parseBool(searchParams.get(URL_KEYS.focusOnHover), DEFAULTS.focusOnHover),
      textFade: parseNumber(searchParams.get(URL_KEYS.textFade), DEFAULTS.textFade, 0, 1),
      linkDistance: parseNumber(searchParams.get(URL_KEYS.linkDistance), DEFAULTS.linkDistance, 1, 15),
      repel: parseNumber(searchParams.get(URL_KEYS.repel), DEFAULTS.repel, 0, 1000),
      center: parseNumber(searchParams.get(URL_KEYS.center), DEFAULTS.center, 0, 1),
      searchQuery: searchParams.get(URL_KEYS.searchQuery) ?? "",
      clusterCohesion: parseNumber(searchParams.get(URL_KEYS.clusterCohesion), DEFAULTS.clusterCohesion, 0, 1),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Filters
  const [metric, setMetric] = useState<Metric>(initial.metric)
  const [topN, setTopN] = useState(initial.topN)
  const [topNDraft, setTopNDraft] = useState<string | null>(null)
  const [showTopPct, setShowTopPct] = useState(initial.showTopPct)
  const [minLinks, setMinLinks] = useState(initial.minLinks)
  // Display
  const [nodeScale, setNodeScale] = useState<number>(DEFAULTS.nodeScale)
  const [nodeOpacity, setNodeOpacity] = useState<number>(DEFAULTS.nodeOpacity)
  const [labelSize, setLabelSize] = useState<number>(DEFAULTS.labelSize)
  const [labelAutoSize, setLabelAutoSize] = useState<boolean>(DEFAULTS.labelAutoSize)
  const [labelPos, setLabelPos] = useState<LabelPos>(initial.labelPos)
  const [textFade, setTextFade] = useState<number>(initial.textFade)
  const [focusOnHover, setFocusOnHover] = useState<boolean>(initial.focusOnHover)
  // Forces
  const [repel, setRepel] = useState<number>(initial.repel)
  const [linkDistance, setLinkDistance] = useState<number>(initial.linkDistance)
  const [center, setCenter] = useState<number>(initial.center)
  // Search query lives in URL so shared links preserve the active filter.
  const [searchQuery, setSearchQuery] = useState<string>(initial.searchQuery)
  // Clustering
  const [clustering, setClustering] = useState<boolean>(initial.clustering)
  const [showHulls, setShowHulls] = useState<boolean>(initial.showHulls)
  const [clusterCohesion, setClusterCohesion] = useState<number>(initial.clusterCohesion)

  // URL param sync (debounced, history.replaceState — no RSC refetch).
  // Only the shareable knobs (the ones a viewer would want to land on)
  // round-trip through the URL. Purely cosmetic settings stay local.
  useEffect(() => {
    const id = setTimeout(() => {
      const current = searchParams.toString()
      const params = new URLSearchParams(current)
      const setOrDelete = (k: string, v: string, fallback: string) => {
        if (v === fallback) params.delete(k)
        else params.set(k, v)
      }
      setOrDelete(URL_KEYS.metric, metric, DEFAULTS.metric)
      setOrDelete(URL_KEYS.topN, String(topN), String(defaultTopN))
      setOrDelete(URL_KEYS.showTopPct, String(showTopPct), String(DEFAULTS.showTopPct))
      setOrDelete(URL_KEYS.minLinks, String(minLinks), String(DEFAULTS.minLinks))
      setOrDelete(URL_KEYS.labelPos, labelPos, DEFAULTS.labelPos)
      setOrDelete(URL_KEYS.clustering, clustering ? "1" : "0", DEFAULTS.clustering ? "1" : "0")
      setOrDelete(URL_KEYS.showHulls, showHulls ? "1" : "0", DEFAULTS.showHulls ? "1" : "0")
      setOrDelete(URL_KEYS.focusOnHover, focusOnHover ? "1" : "0", DEFAULTS.focusOnHover ? "1" : "0")
      setOrDelete(URL_KEYS.textFade, String(textFade), String(DEFAULTS.textFade))
      setOrDelete(URL_KEYS.linkDistance, String(linkDistance), String(DEFAULTS.linkDistance))
      setOrDelete(URL_KEYS.repel, String(repel), String(DEFAULTS.repel))
      setOrDelete(URL_KEYS.center, String(center), String(DEFAULTS.center))
      setOrDelete(URL_KEYS.searchQuery, searchQuery, "")
      setOrDelete(URL_KEYS.clusterCohesion, String(clusterCohesion), String(DEFAULTS.clusterCohesion))
      const qs = params.toString()
      if (qs === current) return
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    }, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    metric,
    topN,
    showTopPct,
    minLinks,
    labelPos,
    clustering,
    showHulls,
    focusOnHover,
    textFade,
    linkDistance,
    repel,
    center,
    searchQuery,
    clusterCohesion,
  ])

  const resetAll = () => {
    setMetric(DEFAULTS.metric)
    setTopN(defaultTopN)
    setTopNDraft(null)
    setShowTopPct(DEFAULTS.showTopPct)
    setMinLinks(DEFAULTS.minLinks)
    setNodeScale(DEFAULTS.nodeScale)
    setNodeOpacity(DEFAULTS.nodeOpacity)
    setLabelSize(DEFAULTS.labelSize)
    setLabelAutoSize(DEFAULTS.labelAutoSize)
    setLabelPos(DEFAULTS.labelPos)
    setTextFade(DEFAULTS.textFade)
    setFocusOnHover(DEFAULTS.focusOnHover)
    setRepel(DEFAULTS.repel)
    setLinkDistance(DEFAULTS.linkDistance)
    setCenter(DEFAULTS.center)
    setSearchQuery("")
    setClustering(DEFAULTS.clustering)
    setShowHulls(DEFAULTS.showHulls)
    setClusterCohesion(DEFAULTS.clusterCohesion)
  }

  return {
    metric, setMetric,
    topN, setTopN,
    topNDraft, setTopNDraft,
    showTopPct, setShowTopPct,
    minLinks, setMinLinks,
    nodeScale, setNodeScale,
    nodeOpacity, setNodeOpacity,
    labelSize, setLabelSize,
    labelAutoSize, setLabelAutoSize,
    labelPos, setLabelPos,
    textFade, setTextFade,
    focusOnHover, setFocusOnHover,
    repel, setRepel,
    linkDistance, setLinkDistance,
    center, setCenter,
    clustering, setClustering,
    showHulls, setShowHulls,
    clusterCohesion, setClusterCohesion,
    searchQuery, setSearchQuery,
    defaultTopN,
    resetAll,
  }
}
