import type { Metadata } from "next"
import { Cinzel, Crimson_Text } from "next/font/google"
import ThemePicker from "@/components/ThemePicker"
import SearchBar from "@/components/SearchBar"
import TabBar from "@/components/TabBar"
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
        <header className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <a href="/" className="font-display text-lg sm:text-2xl font-bold text-accent hover:text-accent-hover transition-colors whitespace-nowrap tracking-[0.08em]">
              Dungeon Synth Releases
            </a>
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
          <div className="ornamental-divider mt-3 sm:mt-4 !mb-0">◆</div>
        </header>
        <TabBar />
        <main className="flex-1 min-h-0">{children}</main>
        <footer className="px-4 sm:px-6 py-3 text-center">
          <a href="https://bandcamp.com" target="_blank" rel="noopener noreferrer" className="text-text-dim hover:text-text text-xs transition-colors">from Bandcamp</a>
        </footer>
      </body>
    </html>
  )
}
