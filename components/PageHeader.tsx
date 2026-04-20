import type { ReactNode } from "react"

// Shared page header used on /stats and /genres. Mirrors the header block in
// the releases layout (scope nav + count row + gradient hr) so the separator
// bar sits in a consistent position across pages. `nav` is the optional top
// row (e.g. scope tabs), `description` is the sub-row prose.
export default function PageHeader({
  nav,
  description,
}: {
  nav?: ReactNode
  description: string
}) {
  return (
    <>
      <div className="shrink-0 px-4 sm:px-6 pt-1 pb-2 flex flex-col items-start min-w-0">
        {nav}
        <p className={`text-xs italic text-text-dim ${nav ? "mt-1" : "py-1"}`}>{description}</p>
      </div>
      <div
        aria-hidden
        className="shrink-0 h-px mx-4 sm:mx-6 bg-gradient-to-r from-transparent via-border/60 to-transparent"
      />
    </>
  )
}
