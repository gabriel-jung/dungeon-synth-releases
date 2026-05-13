import { formatCount } from "@/lib/types"

export default function ReleaseCountText({
  count,
  year,
  filtered,
}: {
  count: number | null
  year?: number | null
  filtered: boolean
}) {
  if (count === null) {
    return <span className="text-xs italic text-text-dim">…</span>
  }
  return (
    <span className="text-xs text-text-dim">
      <span className="text-accent/60">[ </span>
      <span className="text-text tabular-nums">{formatCount(count)}</span>
      <span className="text-accent/60"> ]</span>
      {" "}release{count === 1 ? "" : "s"}
      {year != null && ` in ${year}`}
      {filtered && <span className="text-accent"> · filtered</span>}
    </span>
  )
}
