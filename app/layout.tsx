import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import ThemePicker from "@/components/ThemePicker"
import SearchBar from "@/components/SearchBar"
import { Suspense } from "react"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-screen flex flex-col font-sans">
        <header className="border-b border-border px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-baseline gap-2 sm:gap-3 min-w-0">
              <a href="/" className="text-base sm:text-xl font-bold text-accent hover:text-accent-hover transition-colors whitespace-nowrap">
                Dungeon Synth Releases
              </a>
              <a href="https://bandcamp.com" target="_blank" rel="noopener noreferrer" className="text-text-dim hover:text-text text-xs transition-colors hidden sm:inline">from Bandcamp</a>
            </div>
            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
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
        </header>
        <main className="flex-1">{children}</main>
        <footer className="px-4 sm:px-6 py-3" />
      </body>
    </html>
  )
}
