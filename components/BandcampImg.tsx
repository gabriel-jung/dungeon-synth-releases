/* eslint-disable @next/next/no-img-element */
import type { ImgHTMLAttributes } from "react"

// Hotlinked Bandcamp art. CLAUDE.md forbids next/image so cover bytes don't
// flow through Vercel egress; this wrapper applies the lint disable once
// rather than at every call site.
export default function BandcampImg({ alt = "", ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img alt={alt} {...rest} />
}
