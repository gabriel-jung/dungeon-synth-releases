import { Suspense } from "react"
import FilterChips from "./FilterChips"

// Sits as a flex child in the layout header row; the parent uses
// justify-between so chips pin to the right of the scope nav without
// overlapping the count widget below it.
export default function FilterChipsSlot() {
  return (
    <div className="max-w-full sm:max-w-[60%] overflow-x-auto pt-1">
      <Suspense>
        <FilterChips />
      </Suspense>
    </div>
  )
}
