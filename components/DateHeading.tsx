"use client"

import { useEffect, useState } from "react"
import { formatDateHeading, formatDateShort, relativeDayLabel } from "@/lib/types"

// Hydration flag: SSR/first paint renders the static format so the markup
// matches the server render exactly; after mount we can safely substitute the
// client-relative label ("Today" / "Yesterday") which depends on the user's
// wall clock.
function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    // One-shot post-mount flag so the next render can use client-only labels
    // without breaking SSR markup parity. setState-in-effect is the canonical
    // hydration pattern.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
  }, [])
  return hydrated
}

export default function DateHeading({
  date,
  includeYear = false,
}: {
  date: string
  includeYear?: boolean
}) {
  const hydrated = useHydrated()
  const label = hydrated
    ? (relativeDayLabel(date) ?? formatDateHeading(date, includeYear))
    : formatDateHeading(date, includeYear)

  return <>{label}</>
}

export function ShortDate({ date }: { date: string }) {
  const hydrated = useHydrated()
  if (!date) return <>{""}</>
  const label = hydrated
    ? (relativeDayLabel(date) ?? formatDateShort(date))
    : formatDateShort(date)

  return <>{label}</>
}
