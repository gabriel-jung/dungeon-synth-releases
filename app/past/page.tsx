import Link from "next/link"
import { supabase } from "@/lib/supabase"

export const revalidate = 21600

export const metadata = {
  title: "Past",
  description: "Browse past years of dungeon synth releases.",
  alternates: { canonical: "/past" },
}

export default async function PastIndexPage() {
  const { data, error } = await supabase.rpc("distinct_years")
  if (error) throw new Error(`distinct_years RPC failed: ${error.message}`)

  const currentYear = new Date().getUTCFullYear()
  const years = ((data ?? []) as { year: number | string }[])
    .map((r) => Number(r.year))
    .filter((y) => y < currentYear)
    .sort((a, b) => b - a)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12 overflow-y-auto h-full" style={{ scrollbarWidth: "none" }}>
      <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright mb-6">
        Past Years
      </h2>
      {years.length === 0 ? (
        <p className="text-text-dim font-display text-xs tracking-[0.1em]">
          No past years yet.
        </p>
      ) : (
        <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {years.map((y) => (
            <li key={y}>
              <Link
                href={`/past/${y}`}
                prefetch
                className="group flex items-center justify-center border border-border/60 hover:border-accent/60 bg-bg-card/40 hover:bg-bg-card transition-colors py-5 font-display text-2xl text-text-bright group-hover:text-accent tracking-[0.1em] tabular-nums"
              >
                {y}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
