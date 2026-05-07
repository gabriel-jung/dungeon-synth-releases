import { Suspense } from "react"
import TagGraph from "@/components/TagGraphCanvas"
import { fetchTagGraph } from "@/lib/tagGraph"

export const metadata = {
  title: "Themes",
  description: "Interactive force-directed graph of dungeon synth themes and their relationships.",
  alternates: { canonical: "/graphs/themes" },
}

async function ThemeGraphAsync() {
  const { counts, pairs } = await fetchTagGraph("theme")
  return <TagGraph counts={counts} pairs={pairs} itemLabel="theme" />
}

export default function ThemesPage() {
  return (
    <Suspense>
      <ThemeGraphAsync />
    </Suspense>
  )
}
