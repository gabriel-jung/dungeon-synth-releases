// Shared page header used on /stats and /genres. Mirrors the header block in
// the releases layout (scope nav + count row + gradient hr) so the separator
// bar sits in a consistent position across pages.
export default function PageHeader({ description }: { description: string }) {
  return (
    <>
      <div className="shrink-0 px-4 sm:px-6 pt-1 pb-2">
        <p className="text-xs italic text-text-dim py-1">{description}</p>
      </div>
      <div
        aria-hidden
        className="shrink-0 h-px mx-4 sm:mx-6 bg-gradient-to-r from-transparent via-border/60 to-transparent"
      />
    </>
  )
}
