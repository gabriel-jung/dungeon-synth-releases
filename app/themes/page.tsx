import { Suspense } from "react"
import TagMap from "@/components/TagMap"
import PageHeader from "@/components/PageHeader"
import { fetchTagMap } from "@/lib/tagMap"

export const metadata = {
  title: "Themes",
  description: "Interactive force-directed map of dungeon synth themes and their relationships.",
  alternates: { canonical: "/themes" },
}

export default async function ThemesPage() {
  const { counts, pairs } = await fetchTagMap("theme")
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="A cartography of theme affinities, drawn from shared Bandcamp tags." />
      <div className="flex-1 min-h-0">
        <Suspense>
          <TagMap counts={counts} pairs={pairs} itemLabel="theme" />
        </Suspense>
      </div>
    </div>
  )
}
