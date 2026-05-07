import { Suspense } from "react"
import TagGraph from "@/components/TagGraphCanvas"
import { fetchTagGraph } from "@/lib/tagGraph"

export const metadata = {
  title: "Genres",
  description: "Interactive force-directed graph of dungeon synth genres and their relationships.",
  alternates: { canonical: "/graphs/genres" },
}

async function GenreGraphAsync() {
  const { counts, pairs } = await fetchTagGraph("genre")
  return <TagGraph counts={counts} pairs={pairs} />
}

export default function GenresPage() {
  return (
    <Suspense>
      <GenreGraphAsync />
    </Suspense>
  )
}
