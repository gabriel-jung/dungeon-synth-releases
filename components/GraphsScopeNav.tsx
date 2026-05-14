"use client"

import ScopeNav from "./ScopeNav"

const items = [
  { href: "/graphs/all", label: "All", match: (p: string) => p.startsWith("/graphs/all") },
  { href: "/graphs/genres", label: "Genres", match: (p: string) => p === "/graphs" || p.startsWith("/graphs/genres") },
  { href: "/graphs/themes", label: "Themes", match: (p: string) => p.startsWith("/graphs/themes") },
]

export default function GraphsScopeNav() {
  return <ScopeNav items={items} fallback="/graphs" />
}
