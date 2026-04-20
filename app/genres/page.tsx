import { Suspense } from "react"
import TagMap from "@/components/TagMap"
import PageHeader from "@/components/PageHeader"
import { fetchTagMap } from "@/lib/tagMap"

export const metadata = {
  title: "Genres",
  description: "Interactive force-directed map of dungeon synth genres and their relationships.",
  alternates: { canonical: "/genres" },
}

export default async function GenresPage() {
  const { counts, pairs } = await fetchTagMap("genre")
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="A cartography of genre affinities, drawn from shared Bandcamp tags." />
      <div className="flex-1 min-h-0">
        <Suspense>
          <TagMap counts={counts} pairs={pairs} />
        </Suspense>
      </div>
    </div>
  )
}
