import type { ReactNode } from "react"

export default function SectionHeader({
  chapter,
  title,
  right,
}: {
  chapter?: string
  title: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-4">
      <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright truncate">
        {chapter && <span className="text-accent/60 mr-2 tabular-nums">{chapter}.</span>}
        {title}
      </h2>
      {right}
    </div>
  )
}
