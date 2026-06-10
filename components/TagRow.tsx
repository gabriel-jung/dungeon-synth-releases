"use client"

import { useOpenModal } from "@/lib/useModalUrl"

export default function TagRow({
  name,
  count,
  widthPct,
  label,
}: {
  name: string
  count: number
  widthPct: number
  label?: string
}) {
  const openModal = useOpenModal()
  const open = () => openModal("genre", name)

  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={open}
        aria-label={`${name}, ${label ?? `${count} releases`}`}
        style={{ "--bar-bg": `color-mix(in srgb, var(--color-plot-bar-max) ${widthPct}%, var(--color-plot-bar-min))` } as React.CSSProperties}
        className="relative h-7 w-full flex items-center text-left cursor-pointer group hover:[--bar-bg:var(--color-plot-bar-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/60"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-sm transition-colors"
          style={{ width: `${widthPct}%`, opacity: 0.7, background: "var(--bar-bg)" }}
        />
        <span className="relative font-sans text-sm text-text group-hover:text-text-bright pl-2 truncate min-w-0 flex-1 transition-colors">
          {name}
        </span>
        <span className="relative font-display text-xs tracking-[0.1em] text-text-bright tabular-nums pl-3 pr-2 shrink-0">
          {label ?? count}
        </span>
      </button>
    </li>
  )
}
