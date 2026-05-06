import type { Metadata } from "next"
import Link from "next/link"
import { Cinzel, Crimson_Text } from "next/font/google"
import ThemePicker from "@/components/ThemePicker"
import SearchTrigger from "@/components/SearchTrigger"
import SearchPalette from "@/components/SearchPalette"
import TabBar from "@/components/TabBar"
import ScrollDescent from "@/components/ScrollDescent"
import NavigationProgress from "@/components/NavigationProgress"
import ModalRouter from "@/components/ModalRouter"
import TagFilter from "@/components/TagFilter"
import FilterChips from "@/components/FilterChips"
import { fetchGenreTags } from "@/lib/supabase"
import { SITE_URL } from "@/lib/site"
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
  const allTags = await fetchGenreTags()
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${crimsonText.variable} antialiased`}
    >
      <head>
        {/* Stamp data-theme + texture-opacity from localStorage *before* the
            first paint so non-default themes don't flash the default palette
            during hydration. Wrapped in try/catch — Safari private mode and
            disabled-storage browsers throw on access. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t)document.documentElement.setAttribute("data-theme",t);var o=localStorage.getItem("texture-opacity");if(o!==null)document.documentElement.style.setProperty("--texture-opacity",o)}catch(e){}})();`,
          }}
        />
      </head>
      <body className="h-dvh flex flex-col font-sans overflow-hidden">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[10100] focus:bg-bg focus:text-accent focus:px-3 focus:py-1 focus:border focus:border-accent focus:font-display focus:text-xs focus:uppercase focus:tracking-[0.15em] focus:no-underline"
        >
          Skip to content
        </a>
        <Suspense>
          <NavigationProgress />
        </Suspense>
        <ScrollDescent />
        <header className="px-4 sm:px-6 pt-6 sm:pt-8">
          <div className="flex items-start justify-between gap-4">
            <Link href="/" className="group flex flex-col">
              <span className="font-display text-2xl sm:text-4xl font-bold text-accent group-hover:text-accent-hover transition-colors tracking-[0.1em] leading-tight">
                Dungeon Synth
              </span>
              <span className="font-display text-[10px] sm:text-xs tracking-[0.2em] uppercase text-text-dim mt-1">
                — Releases from Bandcamp —
              </span>
            </Link>
            <div className="flex items-center gap-3 sm:gap-4 shrink-0 pt-1">
              <Suspense>
                <SearchTrigger />
              </Suspense>
              <ThemePicker />
            </div>
          </div>
          <div className="masthead-rule mt-4 sm:mt-6"></div>
          <div className="flex items-end justify-between gap-4">
            <Suspense>
              <TabBar />
            </Suspense>
            <div className="flex flex-col items-end gap-1 min-w-0 pb-2">
              <div id="tag-filter-slot" />
              <Suspense>
                <FilterChips />
              </Suspense>
            </div>
          </div>
        </header>
        <Suspense>
          <TagFilter tags={allTags} />
        </Suspense>
        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0">
          <Suspense>{children}</Suspense>
        </main>
        <Suspense>
          <ModalRouter />
        </Suspense>
        <Suspense>
          <SearchPalette />
        </Suspense>
        <footer className="shrink-0" />
      </body>
    </html>
  )
}
