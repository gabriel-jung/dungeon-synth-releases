"use client"

import { useOpenModal } from "@/lib/useModalUrl"
import { cacheHostStub } from "@/lib/albumCache"

export default function HostRow({
  hostId,
  name,
  count,
  widthPct,
}: {
  hostId: string
  name: string
  count: number
  widthPct: number
}) {
  const openModal = useOpenModal()
  const open = () => {
    // Seed the name we already show here so the modal header paints instantly
    // instead of flashing the raw host id while it re-fetches. image_id/url
    // aren't known on the stats bar; the by-scope fetch fills them in.
    cacheHostStub({ id: hostId, name, image_id: null, url: null })
    openModal("host", hostId)
  }

  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={open}
        aria-label={`${name}, ${count} releases`}
        style={{ "--bar-bg": `color-mix(in srgb, var(--color-plot-bar-max) ${widthPct}%, var(--color-plot-bar-min))` } as React.CSSProperties}
        className="relative h-7 w-full flex items-center text-left cursor-pointer group hover:[--bar-bg:var(--color-plot-bar-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      >
        <div
          className="absolute inset-y-0 left-0 transition-colors"
          style={{ width: `${widthPct}%`, opacity: 0.7, background: "var(--bar-bg)" }}
        />
        <span className="relative font-sans text-sm text-text group-hover:text-text-bright pl-2 truncate min-w-0 flex-1 transition-colors">
          {name}
        </span>
        <span className="relative font-display text-xs tracking-[0.1em] text-text-bright tabular-nums pl-3 pr-2 shrink-0">
          {count}
        </span>
      </button>
    </li>
  )
}
