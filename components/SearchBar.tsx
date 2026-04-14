"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { searchFor } from "@/lib/types"

export default function SearchBar() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const onGenres = pathname?.startsWith("/genres") ?? false
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
    <form onSubmit={handleSubmit} className="flex items-center w-full sm:w-56">
      <span className="font-display text-text-dim text-xs tracking-wide mr-2 hidden sm:inline select-none">⌕</span>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={onGenres ? "Search genres..." : "Search releases..."}
        className="flex-1 min-w-0 bg-transparent border-b border-border px-1 py-1.5 text-base sm:text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent transition-colors font-sans"
      />
      {query && (
        <button
          type="button"
          onClick={clear}
          className="ml-1 w-6 h-6 flex items-center justify-center text-text-dim hover:text-text transition-colors cursor-pointer text-sm shrink-0"
        >
          ×
        </button>
      )}
    </form>
  )
}
