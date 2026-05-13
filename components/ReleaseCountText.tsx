import { releaseCount } from "@/lib/types"

export default function ReleaseCountText({
  count,
  year,
  filtered,
}: {
  count: number | null
  year?: number | null
  filtered: boolean
}) {
  return (
    <span className="text-xs italic text-text-dim">
      {count === null ? "…" : releaseCount(count)}
      {year != null && ` in ${year}`}
      {filtered && <span className="text-accent not-italic"> · filtered</span>}
    </span>
  )
}
