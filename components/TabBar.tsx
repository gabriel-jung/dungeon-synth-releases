"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Releases", match: (p: string) => p === "/" || p.startsWith("/releases") },
  { href: "/statistics", label: "Statistics", match: (p: string) => p.startsWith("/statistics") },
  { href: "/graphs", label: "Tag Graphs", match: (p: string) => p.startsWith("/graphs") },
]

export default function TabBar() {
  const pathname = usePathname() ?? "/"

  return (
    <nav className="flex items-center gap-4 sm:gap-6 pt-2">
      {tabs.map((tab) => {
        const active = tab.match(pathname)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch
            aria-current={active ? "page" : undefined}
            className={`font-display text-xs tracking-[0.1em] uppercase transition-colors py-2 border-b ${
              active
                ? "text-accent border-accent"
                : "text-text-dim hover:text-text active:text-accent-hover border-transparent"
            }`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
