"use client"

import { usePathname } from "next/navigation"

const tabs = [
  { href: "/", label: "Recent" },
  { href: "/upcoming", label: "Upcoming" },
]

export default function TabBar() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-4 px-4 sm:px-6 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href)
        return (
          <a
            key={tab.href}
            href={tab.href}
            className={`py-2 text-sm transition-colors border-b-2 -mb-px ${
              active
                ? "border-accent text-text-bright"
                : "border-transparent text-text-dim hover:text-text"
            }`}
          >
            {tab.label}
          </a>
        )
      })}
    </nav>
  )
}
