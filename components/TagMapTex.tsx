"use client"

import katex from "katex"
import "katex/dist/katex.min.css"
import { useMemo } from "react"

// Isolated katex consumer. Loaded via next/dynamic from TagMapCanvas so the
// ~50KB-gzipped katex bundle + CSS only ships when the user opens the
// "About this map" panel where the similarity formulas render.
export default function Tex({ tex, block = false }: { tex: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(tex, { throwOnError: false, displayMode: block }),
    [tex, block],
  )
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
