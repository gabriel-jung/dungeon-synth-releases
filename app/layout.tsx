import type { Metadata } from "next"
import { Cinzel, Crimson_Text } from "next/font/google"
import ThemePicker from "@/components/ThemePicker"
import SearchBar from "@/components/SearchBar"
import TabBar from "@/components/TabBar"
import ScrollDescent from "@/components/ScrollDescent"
import { Suspense } from "react"
import "./globals.css"

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "700"],
})

const crimsonText = Crimson_Text({
  variable: "--font-crimson",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
})


export const metadata: Metadata = {
  title: "Dungeon Synth Releases",
  description: "Latest dungeon synth releases from Bandcamp",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${crimsonText.variable} antialiased`}
    >
      <body className="h-screen flex flex-col font-sans overflow-hidden">
        <ScrollDescent />
        <header className="px-4 sm:px-6 pt-6 sm:pt-8 pb-3 sm:pb-4">
          <div className="flex items-start justify-between gap-4">
            <a href="/" className="group flex flex-col">
              <span className="font-display text-2xl sm:text-4xl font-bold text-accent group-hover:text-accent-hover transition-colors tracking-[0.1em] leading-tight">
                Dungeon Synth
              </span>
              <span className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-text-dim mt-1">
                — Releases from Bandcamp —
              </span>
            </a>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0 pt-1">
              <div id="tag-filter-slot" />
              <div className="hidden sm:block">
                <Suspense>
                  <SearchBar />
                </Suspense>
              </div>
              <ThemePicker />
            </div>
          </div>
          <div className="sm:hidden mt-2">
            <Suspense>
              <SearchBar />
            </Suspense>
          </div>
          <div className="masthead-rule mt-4 sm:mt-6"></div>
          <TabBar />
        </header>
        <main className="flex-1 min-h-0">{children}</main>
        <footer className="shrink-0" />
      </body>
    </html>
  )
}
