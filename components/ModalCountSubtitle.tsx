import { formatCount } from "@/lib/types"

export default function ModalCountSubtitle({
  count,
  suffix,
  loadingLabel = "loading",
}: {
  count: number | null
  suffix?: string
  loadingLabel?: string
}) {
  if (count === null) return <>{loadingLabel}</>
  const word = suffix ?? `release${count === 1 ? "" : "s"}`
  return (
    <>
      <span className="text-accent/60">[ </span>
      <span className="tabular-nums">{formatCount(count)}</span>
      <span className="text-accent/60"> ]</span>
      {" "}{word}
    </>
  )
}
