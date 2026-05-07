"use client"

import { useState } from "react"

// Adjust-state-during-render guard for "reset something when these deps
// change" patterns. Cheaper than a useEffect: skips the extra commit phase
// so the reset paints in one go. Reference equality on each dep, like
// useEffect's dep array.
export function useResetOnChange(deps: readonly unknown[], reset: () => void): void {
  const [prev, setPrev] = useState(deps)
  const changed =
    prev.length !== deps.length ||
    prev.some((p, i) => p !== deps[i])
  if (changed) {
    setPrev(deps)
    reset()
  }
}
