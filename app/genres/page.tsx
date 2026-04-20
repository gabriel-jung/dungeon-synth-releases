import { Suspense } from "react"
import TagMap from "@/components/TagMap"
import PageHeader from "@/components/PageHeader"
import { fetchTagMap } from "@/lib/tagMap"

export const metadata = {
  title: "Genres",
  description: "Interactive force-directed map of dungeon synth genres and their relationships.",
  alternates: { canonical: "/genres" },
}

async function GenreMapAsync() {
  const { counts, pairs } = await fetchTagMap("genre")
  return <TagMap counts={counts} pairs={pairs} />
}

export default function GenresPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="A cartography of genre affinities, drawn from shared Bandcamp tags." />
      <div className="flex-1 min-h-0">
        <Suspense>
          <GenreMapAsync />
        </Suspense>
      </div>
    </div>
  )
}
