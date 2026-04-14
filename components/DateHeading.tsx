"use client"

import { useEffect, useState } from "react"
import { formatDateHeading, formatDateShort, relativeDayLabel } from "@/lib/types"

export default function DateHeading({
  date,
  includeYear = false,
}: {
  date: string
  includeYear?: boolean
}) {
  const [label, setLabel] = useState(() => formatDateHeading(date, includeYear))

  useEffect(() => {
    const rel = relativeDayLabel(date)
    setLabel(rel ?? formatDateHeading(date, includeYear))
  }, [date, includeYear])

  return <>{label}</>
}

export function ShortDate({ date }: { date: string }) {
  const [label, setLabel] = useState(() => (date ? formatDateShort(date) : ""))

  useEffect(() => {
    if (!date) return setLabel("")
    const rel = relativeDayLabel(date)
    setLabel(rel ?? formatDateShort(date))
  }, [date])

  return <>{label}</>
}
