"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

export default function YearCount({ count, year }: { count: number; year: number }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setSlot(document.getElementById("year-count-slot"))
  }, [])

  if (!slot) return null

  return createPortal(
    <span className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-text-dim pb-1">
      {count.toLocaleString()} releases in {year}
    </span>,
    slot,
  )
}
