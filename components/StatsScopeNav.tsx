"use client"

import ScopeNav from "./ScopeNav"

const items = [
  { href: "/statistics", label: "Overall", match: (p: string) => p === "/statistics" },
  { href: "/statistics/by-year", label: "By Year", match: (p: string) => p.startsWith("/statistics/by-year") },
]

export default function StatsScopeNav() {
  return <ScopeNav items={items} fallback="/statistics" />
}
