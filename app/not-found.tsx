import Link from "next/link"

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-6 pt-16 text-center">
      <div className="font-display text-6xl text-accent mb-6 select-none">†</div>
      <h1 className="font-display text-xl tracking-[0.2em] uppercase text-text-bright mb-3">
        Lost in the catacombs
      </h1>
      <p className="text-text-dim mb-8 italic">
        No page dwells at this path.
      </p>
      <Link
        href="/"
        className="font-display text-xs tracking-[0.2em] uppercase text-accent hover:text-accent-hover border border-border hover:border-accent px-6 py-2 transition-colors"
      >
        Return to the archive
      </Link>
    </div>
  )
}
