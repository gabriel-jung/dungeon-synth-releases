import Link from "next/link"

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
