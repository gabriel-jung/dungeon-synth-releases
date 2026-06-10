import PageHeader from "@/components/PageHeader"
import ListBuilder from "@/components/ListBuilder"
import { decodeState, chartIds } from "@/lib/listCodec"
import { fetchAlbumsByIds } from "@/lib/supabase"

export const metadata = {
  title: "Lists",
  description: "Build a list of the dungeon synth releases and share it.",
  alternates: { canonical: "/list" },
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
