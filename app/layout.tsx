import type { Metadata } from "next"
import { Cinzel, Crimson_Text } from "next/font/google"
import ThemePicker from "@/components/ThemePicker"
import SearchBar from "@/components/SearchBar"
import TabBar from "@/components/TabBar"
import TagFilter from "@/components/TagFilter"
import FilterChips from "@/components/FilterChips"
import YearReleaseCount from "@/components/YearReleaseCount"
import ScrollDescent from "@/components/ScrollDescent"
import AlbumDeepLink from "@/components/AlbumDeepLink"
import { fetchGenreTags, yearCountQuery } from "@/lib/supabase"
import { localDateStr } from "@/lib/types"
import { SITE_URL } from "@/lib/site"
import { Suspense } from "react"
import "./globals.css"

export const revalidate = 3600

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


const DESCRIPTION =
  "A chronicle of dungeon synth releases from Bandcamp. Browse by genre, label, and artist."

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Dungeon Synth Releases",
    template: "%s — Dungeon Synth Releases",
  },
  description: DESCRIPTION,
  applicationName: "Dungeon Synth Releases",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Dungeon Synth Releases",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Dungeon Synth Releases",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Dungeon Synth Releases",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const year = new Date().getUTCFullYear()
  const today = localDateStr(new Date())
  const [{ count: yearCount }, allTags] = await Promise.all([
    yearCountQuery(year, today),
    fetchGenreTags(),
  ])

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
          <div className="flex items-end justify-between gap-4">
            <TabBar />
            {yearCount !== null && (
              <Suspense>
                <YearReleaseCount initialCount={yearCount} year={year} />
              </Suspense>
            )}
          </div>
        </header>
        <Suspense>
          <TagFilter tags={allTags} />
        </Suspense>
        <Suspense>
          <FilterChips />
        </Suspense>
        <main className="flex-1 min-h-0">{children}</main>
        <Suspense>
          <AlbumDeepLink />
        </Suspense>
        <footer className="shrink-0" />
      </body>
    </html>
  )
}
