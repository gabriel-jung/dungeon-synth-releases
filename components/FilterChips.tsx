"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import FilterPill from "./FilterPill"

export default function FilterChips() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const emphasized = searchParams.getAll("tag")
  const banned = searchParams.getAll("xtag")
  if (emphasized.length === 0 && banned.length === 0) return null

  const writeParams = (mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString())
    mutate(params)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const removeTag = (kind: "tag" | "xtag", value: string) => {
    writeParams((p) => {
      const remaining = p.getAll(kind).filter((t) => t !== value)
      p.delete(kind)
      for (const t of remaining) p.append(kind, t)
    })
  }

  const clearAll = () => {
    writeParams((p) => {
      p.delete("tag")
      p.delete("xtag")
    })
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {emphasized.map((t) => (
        <FilterPill key={`e-${t}`} kind="include" label={t} onClear={() => removeTag("tag", t)} />
      ))}
      {banned.map((t) => (
        <FilterPill key={`b-${t}`} kind="exclude" label={t} onClear={() => removeTag("xtag", t)} />
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="font-display text-[10px] tracking-[0.15em] uppercase text-text-dim hover:text-accent transition-colors cursor-pointer pl-1"
      >
        clear
      </button>
    </div>
  )
}

