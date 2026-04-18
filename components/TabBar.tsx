"use client"

import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Recent" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/stats", label: "Stats" },
  { href: "/genres", label: "Genres" },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-4 sm:gap-6 pt-2">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href)
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={`font-display text-xs tracking-[0.1em] uppercase transition-colors py-2 ${
              active
                ? "text-accent border-b border-accent"
                : "text-text-dim hover:text-text active:text-accent-hover border-b border-transparent"
            }`}
          >
            {tab.label}
          </a>
        )
      })}
    </nav>
  )
}
