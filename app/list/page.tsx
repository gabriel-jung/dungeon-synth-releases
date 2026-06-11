import type { Metadata } from "next"
import PageHeader from "@/components/PageHeader"
import ListBuilder from "@/components/ListBuilder"
import { decodeState, chartIds, aspectCanvas, autoCanvas, chartCapacity } from "@/lib/listCodec"
import { fetchAlbumsByIds } from "@/lib/supabase"
import { SITE_URL } from "@/lib/site"

// A shared `?d=` link unfurls as the actual chart: the PNG route renders the
// exact list, so og:image points straight at it. (The `opengraph-image` file
// convention can't read query params, but generateMetadata can.)
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>
}): Promise<Metadata> {
  const base: Metadata = {
    title: "Lists",
    description: "Build a list of the dungeon synth releases and share it.",
    alternates: { canonical: "/list" },
  }
  const { d } = await searchParams
  if (!d) return base
  const state = await decodeState(d)
  if (state.items.length === 0) return base
  const title = state.title.trim() || "A dungeon synth list"
  const description = `${state.items.length} release${state.items.length === 1 ? "" : "s"}, shared from Dungeon Synth Releases.`
  // Mirror the image route's page-1 layout: auto hugs the actual covers.
  const layoutCount = Math.max(1, Math.min(state.items.length, chartCapacity(state)))
  const { w, h } = state.aspect === "auto" ? autoCanvas(state, layoutCount) : aspectCanvas(state.aspect)
  return {
    ...base,
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `${SITE_URL}/api/list/image?d=${encodeURIComponent(d)}`, width: w, height: h }],
    },
    twitter: { card: "summary_large_image" },
  }
}

// Builder is fully client-driven once mounted; the server pass only hydrates a
// shared `?d=` link so the grid paints with real covers on first load.
export default async function ListPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams
  const state = await decodeState(d ?? null)
  const albums = await fetchAlbumsByIds(chartIds(state))

  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="Build a list of the dungeon synth releases and share it." />
      <div className="flex-1 min-h-0 pt-6 sm:pt-8 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
        <ListBuilder initialState={state} initialAlbums={albums} />
      </div>
    </div>
  )
}
