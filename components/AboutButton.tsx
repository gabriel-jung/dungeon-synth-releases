import Link from "next/link"

// Header-cluster icon next to ThemePicker. Single entry point to /about so
// site-shell content (data source, methodology, repo links) stays out of
// the masthead and footer, both intentionally chrome-light.
export default function AboutButton() {
  return (
    <Link
      href="/about"
      aria-label="About this site"
      title="About this site"
      className="w-8 h-8 flex items-center justify-center border border-border hover:border-accent text-text-dim hover:text-accent font-display italic text-sm transition-colors"
    >
      ?
    </Link>
  )
}
