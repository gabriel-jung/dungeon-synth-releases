import { Suspense } from "react"
import FilterChips from "./FilterChips"

export default function FilterChipsSlot() {
  return (
    <div className="absolute top-1 right-4 sm:right-6 max-w-[60%] overflow-x-auto">
      <Suspense>
        <FilterChips />
      </Suspense>
    </div>
  )
}
