"use client"

import { useEffect, useRef } from "react"

/**
 * Darkens the page as the user moves through the date range.
 * Listens to "visible-date-change" events from DateSlider (0–1 fraction).
 */
export default function ScrollDescent() {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const MAX_DARKEN = 0.18

    function handler(e: Event) {
      const frac = (e as CustomEvent).detail as number
      if (overlayRef.current) {
        overlayRef.current.style.opacity = `${frac * MAX_DARKEN}`
      }
    }

    window.addEventListener("visible-date-change", handler)
    return () => window.removeEventListener("visible-date-change", handler)
  }, [])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 pointer-events-none bg-black"
      style={{ zIndex: 9997, opacity: 0 }}
    />
  )
}
