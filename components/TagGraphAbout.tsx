"use client"

import dynamic from "next/dynamic"
import { METRICS, type Metric } from "@/lib/tagGraphLogic"

// Lazy-loaded so katex (see TagGraphTex) only ships when this panel opens.
const Tex = dynamic(() => import("./TagGraphTex"), {
  ssr: false,
  loading: () => null,
})

type Props = {
  open: boolean
  onClose: () => void
  metric: Metric
  labelSingular: string
  labelPlural: string
}

export default function TagGraphAbout({ open, onClose, metric, labelSingular, labelPlural }: Props) {
  if (!open) return null
  return (
    <div className="absolute top-full right-0 mt-2 w-[min(34rem,calc(100vw-1.5rem))] max-h-[min(70vh,calc(100svh-8rem))] overflow-y-auto bg-bg-card border border-border rounded-sm shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="font-display text-[10px] tracking-[0.2em] uppercase text-accent">
          About this graph
        </span>
        <button
          type="button"
          onClick={onClose}
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
          densely to one another, found automatically (
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
  )
}
