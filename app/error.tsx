"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="max-w-xl mx-auto px-6 pt-16 text-center">
      <div className="font-display text-5xl text-accent mb-6 select-none">☥</div>
      <h1 className="font-display text-xl tracking-[0.2em] uppercase text-text-bright mb-3">
        A scroll went missing in the archive
      </h1>
      <p className="text-text-dim mb-8 italic">
        {error.message || "The page you sought has slipped from the catalogue."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="font-display text-xs tracking-[0.2em] uppercase text-accent hover:text-accent-hover border border-border hover:border-accent px-6 py-2 transition-colors cursor-pointer"
      >
        Try again
      </button>
    </div>
  )
}
