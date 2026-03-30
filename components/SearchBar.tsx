"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { searchFor } from "@/lib/types"

export default function SearchBar() {
  const searchParams = useSearchParams()
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input when search changes externally (e.g. clicking artist name)
  useEffect(() => {
    const handler = (e: Event) => setQuery((e as CustomEvent).detail ?? "")
    window.addEventListener("search-change", handler)
    return () => window.removeEventListener("search-change", handler)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => searchFor(value), 150)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (timer.current) clearTimeout(timer.current)
    searchFor(query)
  }

  function clear() {
    setQuery("")
    if (timer.current) clearTimeout(timer.current)
    searchFor("")
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full sm:w-52">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Search..."
        className={`flex-1 min-w-0 bg-bg-card border border-border px-3 py-1.5 text-base sm:text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent transition-colors ${
          query ? "rounded-l border-r-0" : "rounded"
        }`}
      />
      {query && (
        <button
          type="button"
          onClick={clear}
          className="w-10 h-10 bg-bg-card border border-border border-l-0 rounded-r flex items-center justify-center text-text-dim hover:text-text transition-colors cursor-pointer text-xl shrink-0"
        >
          ×
        </button>
      )}
    </form>
  )
}
