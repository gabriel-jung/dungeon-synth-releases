"use client"

import { useFormStatus } from "react-dom"
import { retryStatsChunk } from "@/lib/stats-actions"
import { emptyMsg, type StatsChunkTag } from "@/lib/stats"
import SectionHeader from "./SectionHeader"

function RetryButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="font-display text-[10px] tracking-[0.2em] uppercase text-accent hover:text-accent-hover disabled:opacity-50 disabled:cursor-wait transition-colors cursor-pointer"
    >
      {pending ? "Retrying…" : "Retry"}
    </button>
  )
}

export default function ChunkDegraded({
  chapter,
  title,
  tag,
  height = "h-32",
}: {
  chapter?: string
  title: string
  tag: StatsChunkTag
  height?: string
}) {
  return (
    <section>
      <SectionHeader chapter={chapter} title={title} />
      <div className={`${height} flex flex-col items-center justify-center gap-2`}>
        <span className="font-display text-xs tracking-[0.2em] uppercase text-text-dim">
          {emptyMsg(true)}
        </span>
        <form action={retryStatsChunk.bind(null, tag)}>
          <RetryButton />
        </form>
      </div>
    </section>
  )
}
