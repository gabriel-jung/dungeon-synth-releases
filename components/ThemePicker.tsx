"use client"

import { useEffect, useRef, useState } from "react"

const themes = [
  { id: "catacombs", bg: "#1a1410", accent: "#a63d2f" },
  { id: "stone", bg: "#12151a", accent: "#5b8fb9" },
  { id: "moonlit", bg: "#141520", accent: "#c4993c" },
  { id: "abyss", bg: "#0c0a12", accent: "#8b5ec4" },
  { id: "ember", bg: "#181210", accent: "#cc6a2e" },
  { id: "mire", bg: "#101410", accent: "#5a9a4a" },
  { id: "fog", bg: "#e8e6e1", accent: "#4a7a5a" },
  { id: "parchment", bg: "#f0e8d8", accent: "#8b2e20" },
  { id: "overcast", bg: "#2a2a2e", accent: "#8a9ab0" },
  { id: "bone", bg: "#f5f0e8", accent: "#6a5040" },
]

export default function ThemePicker() {
  const [theme, setTheme] = useState("catacombs")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem("theme")
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute("data-theme", saved)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("click", handler, true)
    return () => document.removeEventListener("click", handler, true)
  }, [open])

  function pick(id: string) {
    setTheme(id)
    setOpen(false)
    localStorage.setItem("theme", id)
    document.documentElement.setAttribute("data-theme", id)
  }

  const current = themes.find((t) => t.id === theme) ?? themes[0]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-full border-2 border-border hover:border-text-dim transition-colors cursor-pointer"
        style={{
          background: `linear-gradient(135deg, ${current.bg} 50%, ${current.accent} 50%)`,
        }}
        aria-label="Change theme"
      />

      {open && (
        <div className="absolute right-0 top-full mt-2 p-3 bg-bg-card border border-border rounded-lg shadow-lg z-50 flex flex-col gap-3">
          <div className="flex gap-3">
            {themes.slice(0, 5).map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => pick(t.id)}
                className={`w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-125 ${
                  theme === t.id
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-card"
                    : ""
                }`}
                style={{
                  background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                }}
                aria-label={t.id}
              />
            ))}
          </div>
          <div className="flex gap-3">
            {themes.slice(5, 10).map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => pick(t.id)}
                className={`w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-125 ${
                  theme === t.id
                    ? "ring-2 ring-accent ring-offset-2 ring-offset-bg-card"
                    : ""
                }`}
                style={{
                  background: `linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)`,
                }}
                aria-label={t.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
