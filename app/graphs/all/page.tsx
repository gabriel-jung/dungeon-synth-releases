import { Suspense } from "react"
import TagGraph from "@/components/TagGraphCanvas"
import { fetchTagGraph } from "@/lib/tagGraph"

export const metadata = {
  title: "All tags",
  description: "Interactive force-directed graph of every dungeon synth tag across all categories.",
  alternates: { canonical: "/graphs/all" },
}

async function AllGraphAsync() {
  const { counts, pairs, totalAlbums } = await fetchTagGraph("all")
  return <TagGraph counts={counts} pairs={pairs} totalAlbums={totalAlbums} itemLabel="tag" />
}

export default function AllTagsPage() {
  return (
    <Suspense>
      <AllGraphAsync />
    </Suspense>
  )
}
