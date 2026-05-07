"use client"

import { formatDateHeading, formatDateShort, relativeDayLabel } from "@/lib/types"
import { useHydrated } from "@/lib/useHydrated"

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
