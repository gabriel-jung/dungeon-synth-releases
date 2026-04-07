"use client"

import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Recent" },
  { href: "/upcoming", label: "Upcoming" },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center gap-6 px-4 sm:px-6 pt-3 pb-1">
      {tabs.map((tab, i) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href)
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={`font-display text-[11px] tracking-[0.2em] uppercase transition-colors ${
              active
                ? "text-accent"
                : "text-text-dim hover:text-text"
            }`}
          >
            {active ? `· ${tab.label} ·` : tab.label}
          </a>
        )
      })}
    </nav>
  )
}
