import { Suspense } from "react"
import TagMap from "@/components/TagMap"
import PageHeader from "@/components/PageHeader"
import { fetchTagMap } from "@/lib/tagMap"

export const metadata = {
  title: "Themes",
  description: "Interactive force-directed map of dungeon synth themes and their relationships.",
  alternates: { canonical: "/themes" },
}

async function ThemeMapAsync() {
  const { counts, pairs } = await fetchTagMap("theme")
  return <TagMap counts={counts} pairs={pairs} itemLabel="theme" />
}

export default function ThemesPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="A cartography of theme affinities, drawn from shared Bandcamp tags." />
      <div className="flex-1 min-h-0">
        <Suspense>
          <ThemeMapAsync />
        </Suspense>
      </div>
    </div>
  )
}
