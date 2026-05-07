import Link from "next/link"
import PageHeader from "@/components/PageHeader"

export const metadata = {
  title: "About",
  description: "What this site is, where the data comes from, and how the views work.",
  alternates: { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <PageHeader description="Notes on the source and the methodology." />
      <div className="flex-1 min-h-0 pt-6 sm:pt-8">
        <div className="h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 flex flex-col gap-10 text-sm leading-relaxed text-text-dim">
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright">
                What this is
              </h2>
              <p>
                Every dungeon synth release on Bandcamp, sorted by date. Filter by tag,
                artist, label, and more.
              </p>
              <p>
                It can also be explored through different statistics and interactive maps.
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright">
                Data
              </h2>
              <p>
                Compiled daily from public Bandcamp pages. Each release shows its artist,
                label, release date, cover art, and the artist&rsquo;s chosen tags.
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright">
                Tag graphs
              </h2>
              <p>
                The{" "}
                <Link
                  href="/graphs/genres"
                  className="text-text hover:text-accent underline decoration-dotted underline-offset-2 transition-colors"
                >
                  genres
                </Link>
                {" "}and{" "}
                <Link
                  href="/graphs/themes"
                  className="text-text hover:text-accent underline decoration-dotted underline-offset-2 transition-colors"
                >
                  themes
                </Link>
                {" "}graphs each draw from a curated selection of tags (genres on one, themes
                on the other) and position them by how often they share releases. Tags used
                together frequently sit close; unrelated ones drift apart. Tightly linked
                tags share a color, marking the loose subgenre families that emerge from the
                data. Open the <span className="text-text">?</span> on either graph for the
                formulas behind the layout.
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright">
                Stack
              </h2>
              <p>
                Next.js 16 (App Router, Cache Components), React 19, Supabase Postgres,
                Tailwind CSS, and a force-directed canvas built on d3-force and
                react-force-graph. Hosted on Vercel. Python on the data-collection side.
              </p>
            </section>

            <section className="flex flex-col gap-3">
              <h2 className="font-display text-base sm:text-lg tracking-[0.15em] uppercase text-text-bright">
                Source
              </h2>
              <ul className="flex flex-col gap-1 list-disc list-inside marker:text-border">
                <li>
                  <a
                    href="https://github.com/gabriel-jung/dungeon-synth-releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text hover:text-accent underline decoration-dotted underline-offset-2 transition-colors"
                  >
                    Site repository ↗
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/gabriel-jung/bandcamp-explorer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text hover:text-accent underline decoration-dotted underline-offset-2 transition-colors"
                  >
                    Data collector repository ↗
                  </a>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
