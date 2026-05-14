"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { scaleLinear, scaleSqrt } from "d3-scale"
import {
  clusterColor,
  edgeEndpoints,
  type LabelPos,
  type TagEdge,
  type TagNode,
} from "@/lib/tagGraphLogic"
import type { ForceGraphMethods, ForceGraphProps } from "react-force-graph-2d"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as unknown as React.ForwardRefExoticComponent<ForceGraphProps<any, any> & React.RefAttributes<ForceGraphMethods<any, any> | undefined>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FgMethods = ForceGraphMethods<any, any>

export type HoverInfo =
  | { kind: "node"; name: string; count: number; conns: number }
  | { kind: "edge"; a: string; b: string; inter: number; weight: number }

// Canvas ctx.fillStyle won't evaluate CSS custom-property strings, so we
// resolve the active theme's hex once and convert to rgba() with alpha
// applied per draw call. The paint loop calls this hundreds of times per
// frame; cache the parsed channels so we never regex+parseInt the same hex
// twice.
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

export type ThemeColors = { font: string; text: string; textDim: string; bg: string }

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

type Props = {
  nodes: TagNode[]
  edges: TagEdge[]
  visibleEdges: Set<TagEdge>
  hullCacheRef: React.MutableRefObject<Map<number, [number, number][]>>
  size: { w: number; h: number } | null
  fgRef: React.MutableRefObject<FgMethods | undefined>
  ready: boolean
  // Filter state
  banTags: Set<string>
  hiTags: Set<string>
  hiNeighbors: Set<string>
  hoveredId: string | null
  clustering: boolean
  // Visual state
  nodeScale: number
  nodeOpacity: number
  labelSize: number
  labelPos: LabelPos
  textFade: number
  focusOnHover: boolean
  showHulls: boolean
  // Theme colors
  themeColors: ThemeColors
  // Interaction
  onNodeClick: (id: string) => void
  onEdgeClick: (a: string, b: string) => void
  onHoverNode: (id: string | null) => void
  onZoomChange: (k: number) => void
  onEngineStop?: () => void
  needsFitRef: React.MutableRefObject<boolean>
  edgesForNode: Map<string, number>
}

export default function TagGraphRenderer({
  nodes,
  edges,
  visibleEdges,
  hullCacheRef,
  size,
  fgRef,
  ready,
  banTags,
  hiTags,
  hiNeighbors,
  hoveredId,
  clustering,
  nodeScale,
  nodeOpacity,
  labelSize,
  labelPos,
  textFade,
  focusOnHover,
  showHulls,
  themeColors,
  onNodeClick,
  onEdgeClick,
  onHoverNode,
  onZoomChange,
  needsFitRef,
  edgesForNode,
}: Props) {
  const { font: fontFamily, text: textColor, textDim: textDimColor, bg: bgColor } = themeColors

  const [hover, setHover] = useState<HoverInfo | null>(null)

  // Touch devices fire onNodeHover on tap but never onMouseMove, so the
  // tooltip would land at (0,0). Skip hover UI on coarse pointers.
  const coarsePointerRef = useRef(false)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(pointer: coarse)")
    coarsePointerRef.current = mq.matches
    const onChange = (e: MediaQueryListEvent) => { coarsePointerRef.current = e.matches }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const maxCount = useMemo(() => {
    let m = 1
    for (const n of nodes) if (n.count > m) m = n.count
    return m
  }, [nodes])

  const rScale = useMemo(
    () => scaleSqrt().domain([1, maxCount]).range([6 * nodeScale, 28 * nodeScale]),
    [maxCount, nodeScale],
  )

  const fontScale = useMemo(
    () => scaleLinear().domain([1, maxCount]).range([6.5 * labelSize, 10.5 * labelSize]),
    [maxCount, labelSize],
  )

  // Font strings are parsed by the Canvas API each time `ctx.font = …` is
  // assigned. At 1000 nodes/frame that's 60k parses/sec. Cache per count.
  const fontStringCache = useMemo(
    () => new Map<number, string>(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maxCount, labelSize, fontFamily],
  )

  const maxWeight = useMemo(() => {
    let m = 1
    for (const e of edges) if (e.weight > m) m = e.weight
    return m
  }, [edges])

  const graphData = useMemo(
    () => ({ nodes: [...nodes], links: [...visibleEdges] }),
    [nodes, visibleEdges],
  )

  // Nullify the lib's internal d3-force engine — we run our own settle
  // in `useForceLayout` and write positions to the node objects, so any
  // additional forces from the lib would drift the layout. We pass the
  // `autoPauseRedraw={false}` prop below so the lib paints every frame
  // (cheap with our small node counts) and visual-only updates like
  // hover-focus dim land immediately without needing a sim restart.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    fg.d3Force("link", null)
    fg.d3Force("charge", null)
    fg.d3Force("center", null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData])

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

  // Foam-style zoom-driven label fade. Higher `textFade` = labels appear at
  // lower zoom. Smoothly interpolates label alpha through the fade band
  // instead of the previous hard-cutoff threshold.
  const fadeLo = useMemo(() => 1.2 - textFade * 0.5, [textFade])
  const fadeHi = useMemo(() => 2.0 - textFade * 0.5, [textFade])

  const labelYOffset = (r: number) => {
    if (labelPos === "above") return -(r + 4)
    if (labelPos === "below") return r + 4
    return 0
  }
  const labelBaseline = (): CanvasTextBaseline => {
    if (labelPos === "above") return "alphabetic"
    if (labelPos === "below") return "hanging"
    return "middle"
  }

  return (
    <>
      {size && (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          nodeId="id"
          cooldownTicks={0}
          warmupTicks={0}
          autoPauseRedraw={false}
          enableNodeDrag={false}
          nodeRelSize={1}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeVal={(n: any) => rScale((n as TagNode).count) ** 2}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          nodeVisibility={(n: any) => !banTags.has((n as TagNode).id)}
          onNodeClick={(n) => onNodeClick((n as TagNode).id)}
          onLinkClick={(l) => {
            const [s, t] = edgeEndpoints(l as TagEdge)
            onEdgeClick(s, t)
          }}
          onNodeHover={(n) => {
            if (coarsePointerRef.current) return
            if (!n) {
              setHover(null)
              onHoverNode(null)
              return
            }
            const tn = n as TagNode
            setHover({
              kind: "node",
              name: tn.id,
              count: tn.count,
              conns: edgesForNode.get(tn.id) ?? 0,
            })
            if (focusOnHover) onHoverNode(tn.id)
          }}
          onLinkHover={(l) => {
            if (coarsePointerRef.current) return
            if (!l) { setHover(null); return }
            const le = l as TagEdge
            const [a, b] = edgeEndpoints(le)
            setHover({ kind: "edge", a, b, inter: le.inter, weight: le.weight })
          }}
          onZoomEnd={(t) => {
            // ForceGraph fires this synchronously inside its render path;
            // defer the state write so React doesn't see a setState during
            // another component's render.
            const k = t.k
            queueMicrotask(() => onZoomChange(k))
          }}
          onEngineStop={() => {
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
            const isHovered = hoveredId === n.id
            const isNeighbor = hiNeighbors.has(n.id)
            const isHiTag = hiTags.has(n.id)
            const dim = anyHi && !isHiTag && !isNeighbor
            const baseR = rScale(n.count)
            // Pop the hovered node and its neighbours so the focus is
            // unmistakable: hovered gets 1.4×, direct neighbours 1.15×.
            const r = isHovered ? baseR * 1.4 : isNeighbor ? baseR * 1.15 : baseR
            // Neutral fill when clustering is off — no group hue is
            // meaningful. Falls back to the theme's dim text colour, which
            // reads as muted grey on every theme.
            const color = clustering ? clusterColor(n.cluster) : (textDimColor || "#9ca3af")
            ctx.beginPath()
            ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.globalAlpha = dim ? nodeOpacity * 0.08 : nodeOpacity
            ctx.fill()
            ctx.globalAlpha = dim ? 0.15 : 1
            ctx.lineWidth = (isHovered ? 2.5 : 1.5) / globalScale
            ctx.strokeStyle = isHovered
              ? textColor
              : clustering
                ? clusterColor(n.cluster, 0.2)
                : (textColor || "#cbd5e1")
            ctx.stroke()
            ctx.globalAlpha = 1

            // Zoom-driven label fade. Below fadeLo: invisible. Above fadeHi:
            // full alpha. In between: smoothly interpolated. Replaces the
            // old hard cutoff `fs * globalScale < labelThreshold`.
            const labelAlpha = Math.min(1, Math.max(0, (globalScale - fadeLo) / (fadeHi - fadeLo)))
            if (labelAlpha <= 0) return
            const fs = fontScale(n.count)
            ctx.globalAlpha = dim ? labelAlpha * 0.3 : labelAlpha
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
            if (!showHulls) return
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

      {/* Loader */}
      {!ready && nodes.length > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="font-display text-accent/70 text-xs tracking-[0.3em] uppercase animate-pulse">
            ❧ drawing the graph
          </div>
        </div>
      )}

      {/* Hover tooltip — docked top-left of the graph area (skipped on coarse pointer) */}
      {hover && <HoverTooltip hover={hover} />}
    </>
  )
}

export { readThemeColors }

function HoverTooltip({ hover }: { hover: HoverInfo }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute top-3 left-3 z-20 bg-bg-card border border-border/60 rounded-sm px-3 py-2 text-xs max-w-[min(20rem,calc(100vw-1.5rem))]"
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
  )
}
