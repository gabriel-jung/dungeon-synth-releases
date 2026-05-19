import Link from "next/link"

export default function AboutButton() {
  return (
    <Link
      href="/about"
      aria-label="About this site"
      title="About this site"
      className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center border border-border hover:border-accent text-text-dim hover:text-accent font-display text-sm transition-colors"
    >
      ?
    </Link>
  )
}
