"use client"

import { cloneElement, isValidElement, useState } from "react"
import { METRICS, type LabelPos, type Metric } from "@/lib/tagGraphLogic"
import { DEFAULTS } from "@/lib/tagGraphDefaults"
import type { TagGraphState } from "@/lib/useTagGraphState"
import type { SpacingStats } from "@/lib/useForceLayout"

// Tiny ↺ that only renders when a control diverges from its default.
function ResetMark<T>({ value, dflt, onReset }: { value: T; dflt: T; onReset: () => void }) {
  if (value === dflt) return null
  return (
    <button
      type="button"
      onClick={onReset}
      title="Reset to default"
      aria-label="Reset to default"
      className="text-[10px] leading-none text-text-dim hover:text-accent transition-colors"
    >
      ↺
    </button>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
  title,
  children,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}) {
  return (
    <label
      className={`flex items-center justify-between gap-2 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      title={title}
    >
      <span className="text-text">{children}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors shrink-0 ${
          checked ? "bg-accent/30 border-accent/60" : "bg-bg-card border-border"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-accent transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  )
}

// Slider with label above and small value to the right of the label.
function SliderRow({
  label,
  title,
  display,
  reset,
  disabled,
  children,
}: {
  label: string
  title?: string
  display?: React.ReactNode
  reset?: React.ReactNode
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={`flex flex-col gap-1 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
      title={title}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-text">{label}</span>
        <span className="flex items-center gap-1.5 tabular-nums text-text-dim text-[10px]">
          {display}
          {reset}
        </span>
      </div>
      {/* The wrapping <label> binds to its first labelable descendant, which
          for rows with an input in `display` (e.g. Top-N) is that field, not
          the range. Inject an explicit aria-label so every slider is named. */}
      {isValidElement<{ "aria-label"?: string }>(children)
        ? cloneElement(children, { "aria-label": children.props["aria-label"] ?? label })
        : children}
    </label>
  )
}

function CollapsibleGroup({
  label,
  defaultOpen = true,
  toggle,
  children,
}: {
  label: string
  defaultOpen?: boolean
  toggle?: { checked: boolean; onChange: (v: boolean) => void; title?: string }
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border/40 pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left text-text hover:text-accent transition-colors flex-1 min-w-0"
        >
          <span aria-hidden className="text-text-dim text-[10px] w-3 inline-block">
            {open ? "▾" : "▸"}
          </span>
          <span className="font-display text-[11px] tracking-[0.15em] uppercase">{label}</span>
        </button>
        {toggle && (
          <button
            type="button"
            role="switch"
            aria-checked={toggle.checked}
            aria-label={`Enable ${label}`}
            title={toggle.title}
            onClick={() => toggle.onChange(!toggle.checked)}
            className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors shrink-0 ${
              toggle.checked ? "bg-accent/30 border-accent/60" : "bg-bg-card border-border"
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-accent transition-transform ${
                toggle.checked ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </button>
        )}
      </div>
      {open && <div className="flex flex-col gap-3 pl-5">{children}</div>}
    </div>
  )
}

export function TagGraphSettingsButton({
  open,
  onToggle,
}: {
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label="Graph settings"
      title="Graph settings"
      className={`w-7 h-7 flex items-center justify-center border rounded-sm transition-colors text-base leading-none cursor-pointer ${
        open
          ? "bg-bg-card border-accent/40 text-accent"
          : "bg-bg-card border-border/60 text-text-dim hover:text-text-bright hover:border-accent/50"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block transition-transform duration-300 ease-out ${open ? "rotate-45 text-accent" : ""}`}
      >
        ❖
      </span>
    </button>
  )
}

type PanelProps = {
  state: TagGraphState
  maxTopN: number
  labelSingular: string
  labelPlural: string
  spacingStats: SpacingStats | null
  searchQuery: string
  onSearchChange: (v: string) => void
  onReseed: () => void
  onClose: () => void
}

export default function TagGraphSettingsPanel({
  state,
  maxTopN,
  labelSingular,
  labelPlural,
  spacingStats,
  searchQuery,
  onSearchChange,
  onReseed,
  onClose,
}: PanelProps) {
  const topNDigits = String(maxTopN).length

  return (
    <div className="h-full w-full bg-bg-card border border-border/60 rounded-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col text-[11px] tracking-normal normal-case font-sans">
      {/* Header — eyebrow + reseed + reset + close */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 shrink-0">
        <span className="font-display text-[10px] tracking-[0.2em] uppercase text-accent">❖ Settings</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReseed}
            aria-label="Recompute layout"
            title="Recompute layout from a fresh random seed"
            className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-accent rounded-sm transition-colors text-sm leading-none cursor-pointer"
          >
            ↻
          </button>
          <button
            type="button"
            onClick={state.resetAll}
            aria-label="Reset all"
            title="Reset all controls to defaults"
            className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-accent rounded-sm transition-colors text-sm leading-none cursor-pointer"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
            className="w-6 h-6 flex items-center justify-center text-text-dim hover:text-text-bright rounded-sm transition-colors text-base leading-none cursor-pointer"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3" style={{ scrollbarWidth: "none" }}>
        <CollapsibleGroup label="Filters">
          {/* Search input at top of Filters */}
          <div className="flex items-center gap-2 bg-bg-card border border-border rounded-sm px-2 py-1.5 -ml-5">
            <svg aria-hidden viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-none stroke-current text-text-dim shrink-0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L13 13" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={`Focus on a ${labelSingular}…`}
              aria-label={`Focus on a ${labelSingular}`}
              className="flex-1 min-w-0 bg-transparent outline-none text-text text-xs placeholder:text-text-dim"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                className="text-text-dim hover:text-accent text-xs leading-none"
              >
                ×
              </button>
            )}
          </div>

          <SliderRow
            label="Top-N"
            title={`How many of the most-tagged ${labelPlural} to include.`}
            display={
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={topNDigits}
                value={state.topNDraft ?? String(state.topN)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "")
                  state.setTopNDraft(raw)
                  if (raw === "") return
                  const v = Number(raw)
                  if (Number.isFinite(v)) state.setTopN(Math.max(10, Math.min(maxTopN, Math.round(v))))
                }}
                onBlur={() => state.setTopNDraft(null)}
                style={{ width: `${topNDigits + 2}ch` }}
                className="min-w-0 bg-bg-card border border-border rounded-sm px-1 py-0 text-center tabular-nums text-text leading-tight"
              />
            }
            reset={
              <ResetMark
                value={state.topN}
                dflt={state.defaultTopN}
                onReset={() => {
                  state.setTopN(state.defaultTopN)
                  state.setTopNDraft(null)
                }}
              />
            }
          >
            <input
              type="range"
              min={10}
              max={maxTopN}
              step={1}
              value={state.topN}
              onChange={(e) => state.setTopN(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <SliderRow
            label="Min links / node"
            title={`Always keep at least this many strongest edges per ${labelSingular} visible.`}
            display={state.minLinks}
            reset={
              <ResetMark
                value={state.minLinks}
                dflt={DEFAULTS.minLinks}
                onReset={() => state.setMinLinks(DEFAULTS.minLinks)}
              />
            }
          >
            <input
              type="range"
              min={0}
              max={8}
              value={state.minLinks}
              onChange={(e) => state.setMinLinks(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <SliderRow
            label="Edge density"
            title="Percent of the strongest edges to draw."
            display={`${state.showTopPct}%`}
            reset={
              <ResetMark
                value={state.showTopPct}
                dflt={DEFAULTS.showTopPct}
                onReset={() => state.setShowTopPct(DEFAULTS.showTopPct)}
              />
            }
          >
            <input
              type="range"
              min={1}
              max={100}
              value={state.showTopPct}
              onChange={(e) => state.setShowTopPct(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>
        </CollapsibleGroup>

        <CollapsibleGroup
          label="Clustering"
          toggle={{
            checked: state.clustering,
            onChange: state.setClustering,
            title: "Detect tag communities (Louvain) and color nodes by group.",
          }}
        >
          {state.clustering && (
            <Toggle
              checked={state.showHulls}
              onChange={state.setShowHulls}
              title="Draw the shaded polygons around each cluster."
            >
              Show hulls
            </Toggle>
          )}

          <SliderRow
            label="Cluster cohesion"
            title="How tightly nodes in the same cluster pull together. At 1 clusters look tight and well-separated; at 0 the layout matches clustering-off (colours and hulls still apply)."
            display={state.clusterCohesion.toFixed(2)}
            disabled={!state.clustering}
            reset={
              <ResetMark
                value={state.clusterCohesion}
                dflt={DEFAULTS.clusterCohesion}
                onReset={() => state.setClusterCohesion(DEFAULTS.clusterCohesion)}
              />
            }
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.clusterCohesion}
              onChange={(e) => state.setClusterCohesion(Number(e.target.value))}
              className="w-full accent-accent"
              disabled={!state.clustering}
            />
          </SliderRow>
        </CollapsibleGroup>

        <CollapsibleGroup label="Display">
          <Toggle
            checked={state.focusOnHover}
            onChange={state.setFocusOnHover}
            title="Dim non-neighbour nodes when hovering."
          >
            Focus on hover
          </Toggle>

          <SliderRow
            label="Label visibility"
            title="How readily labels appear as you zoom in. Higher = labels show up at lower zoom (more visible overall); lower = labels only appear when zoomed in close."
            display={state.textFade.toFixed(2)}
            reset={
              <ResetMark
                value={state.textFade}
                dflt={DEFAULTS.textFade}
                onReset={() => state.setTextFade(DEFAULTS.textFade)}
              />
            }
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.textFade}
              onChange={(e) => state.setTextFade(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <SliderRow
            label="Node size"
            title="Visual radius multiplier."
            display={`${state.nodeScale.toFixed(2)}×`}
            reset={
              <ResetMark
                value={state.nodeScale}
                dflt={DEFAULTS.nodeScale}
                onReset={() => state.setNodeScale(DEFAULTS.nodeScale)}
              />
            }
          >
            <input
              type="range"
              min={0.3}
              max={4}
              step={0.05}
              value={state.nodeScale}
              onChange={(e) => state.setNodeScale(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <SliderRow
            label="Node opacity"
            title={`Fill transparency for ${labelSingular} circles.`}
            display={`${Math.round(state.nodeOpacity * 100)}%`}
            reset={
              <ResetMark
                value={state.nodeOpacity}
                dflt={DEFAULTS.nodeOpacity}
                onReset={() => state.setNodeOpacity(DEFAULTS.nodeOpacity)}
              />
            }
          >
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={state.nodeOpacity}
              onChange={(e) => state.setNodeOpacity(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <Toggle
            checked={state.labelAutoSize}
            onChange={state.setLabelAutoSize}
            title="On: bigger tags get bigger labels. Off: every label the same size."
          >
            Scale labels by node size
          </Toggle>

          <SliderRow
            label="Label size"
            title="Font-size multiplier."
            display={`${state.labelSize.toFixed(2)}×`}
            reset={
              <ResetMark
                value={state.labelSize}
                dflt={DEFAULTS.labelSize}
                onReset={() => state.setLabelSize(DEFAULTS.labelSize)}
              />
            }
          >
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={state.labelSize}
              onChange={(e) => state.setLabelSize(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <label
            className="flex items-center justify-between gap-2"
            title={`Where the ${labelSingular} name sits relative to its circle.`}
          >
            <span className="text-text">Label placement</span>
            <span className="flex items-center gap-1.5">
              <select
                value={state.labelPos}
                onChange={(e) => state.setLabelPos(e.target.value as LabelPos)}
                className="bg-bg-card border border-border rounded-sm px-2 py-0.5 text-text text-[10px]"
              >
                <option value="below">Below</option>
                <option value="above">Above</option>
                <option value="inside">Inside</option>
              </select>
              <ResetMark
                value={state.labelPos}
                dflt={DEFAULTS.labelPos}
                onReset={() => state.setLabelPos(DEFAULTS.labelPos)}
              />
            </span>
          </label>
        </CollapsibleGroup>

        <CollapsibleGroup label="Forces">
          <SliderRow
            label="Centre force"
            title="Pull every node toward the middle of the canvas. Higher keeps the graph anchored in view; 0 lets it drift out to the edges. Use to keep the layout from sliding off-screen."
            display={state.center.toFixed(2)}
            reset={
              <ResetMark
                value={state.center}
                dflt={DEFAULTS.center}
                onReset={() => state.setCenter(DEFAULTS.center)}
              />
            }
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.center}
              onChange={(e) => state.setCenter(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <SliderRow
            label="Repel force"
            title={`How hard every ${labelSingular} pushes every other one away (n-body charge). Controls overall whitespace. Fights against Link force, which pulls connected nodes together. Higher = more spread; lower = nodes pack tighter.`}
            display={state.repel}
            reset={
              <ResetMark value={state.repel} dflt={DEFAULTS.repel} onReset={() => state.setRepel(DEFAULTS.repel)} />
            }
          >
            <input
              type="range"
              min={0}
              max={1000}
              step={10}
              value={state.repel}
              onChange={(e) => state.setRepel(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>

          <SliderRow
            label="Link distance"
            title="Target length of edges that cross between clusters. Higher = clusters drift further apart (long inter-cluster ropes). Intra-cluster edges keep a fixed short length; only inter-cluster spacing responds to this."
            display={
              <>
                <span>{state.linkDistance.toFixed(1)}×</span>
                {spacingStats && (
                  <span
                    className={spacingStats.ratio < 2 ? "text-accent" : "text-text-dim"}
                    title={`Measured inter/intra ratio: ${spacingStats.inter.toFixed(0)}px / ${spacingStats.intra.toFixed(0)}px`}
                  >
                    ({spacingStats.ratio.toFixed(1)}×)
                  </span>
                )}
              </>
            }
            reset={
              <ResetMark
                value={state.linkDistance}
                dflt={DEFAULTS.linkDistance}
                onReset={() => state.setLinkDistance(DEFAULTS.linkDistance)}
              />
            }
          >
            <input
              type="range"
              min={1}
              max={15}
              step={0.1}
              value={state.linkDistance}
              onChange={(e) => state.setLinkDistance(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </SliderRow>
        </CollapsibleGroup>

        <CollapsibleGroup label="Advanced" defaultOpen={false}>
          <label
            className="flex items-center justify-between gap-2"
            title={`How ${labelSingular} similarity is measured. See About for formulas.`}
          >
            <span className="text-text">Metric</span>
            <span className="flex items-center gap-1.5">
              <select
                value={state.metric}
                onChange={(e) => state.setMetric(e.target.value as Metric)}
                className="bg-bg-card border border-border rounded-sm px-2 py-0.5 text-text text-[10px]"
              >
                {METRICS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ResetMark
                value={state.metric}
                dflt={DEFAULTS.metric}
                onReset={() => state.setMetric(DEFAULTS.metric)}
              />
            </span>
          </label>
        </CollapsibleGroup>
      </div>
    </div>
  )
}
