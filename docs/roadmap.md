# Roadmap

Loose backlog of planned work. Not a commitment, not ordered strictly by priority.

## Planned

### Geographic map (`/map`)
World map of artists/hosts by location. Strong scenes in US, Poland, Germany, Brazil, France — visualising that is genuinely interesting and orthogonal to the existing tag/release views.

**Prereq (scraper side, `bandcamp-explorer-data`):**
- Clean the already-scraped location strings — currently mixed granularity (sometimes city, sometimes country, sometimes fictional).
- Normalise to at least `country_code` (ISO 3166-1 alpha-2). Add `lat/lng`, `admin1`, `city`, `location_raw`, `geocode_status` if feasible.
- Geocoding via Nominatim (rate-limited, cache per-string).

**Schema (site-side, `hosts` table):**
```
country_code   text         -- minimum
admin1         text         -- optional
city           text         -- optional
lat, lng       numeric      -- for dot mode
location_raw   text         -- audit trail
geocode_status text         -- ok | failed | fictional | blank
```

**Site implementation:**
- `/map` route.
- Phase 1: choropleth by `country_code` (`react-simple-maps` + Natural Earth topojson). Works with country-only data.
- Phase 2: dot overlay once lat/lng populated.
- Click-through reuses existing `ScopeModal` (host kind) — no new modal infra.

### Tag category curation
Attribution quality in `tags.category` is uneven. User is exploring/curating manually in the scraper repo.

Example of planned addition: **`band` category** for tags that are literally artist/project names (common bandcamp convention: users tag releases with related bands). Keeps those tags out of the `/graphs/genres` and `/graphs/themes` maps.

If new categories land, the site may need either:
- A new TagGraph scope (analogous to `/graphs/genres`, `/graphs/themes`), or
- A filter in existing scopes to exclude them.

Decide on a per-category basis.

### Recommendation engine ("similar artists")
Host tag vectors + cosine similarity → "similar to" suggestions. Surface inside existing `ScopeModal` (album/artist/host kinds) rather than a new page.

**Depends on:**
- Enough signal per host (filter to hosts with ≥ N releases).
- New RPC: precompute top-K neighbours per host, cache.

Deferred — not needed before geo map work.

## Undecided

### Site shell
Right now `/` drops straight into the release feed — no onboarding for new visitors. Candidates:
- Landing / about / methodology page explaining data source + how tag graphs are built.
- Consistent cross-nav between `/`, `/graphs/genres`, `/graphs/themes`, `/statistics`, `/releases`.
- Not yet prioritised.

## Parked / rejected

- **Louvain cluster browser** — expose communities from `lib/tagGraphLogic.ts` as browsable "subgenre families". Rejected: feels more like a paper/blog post than a useful site feature. Clusters are already used for node colour, which is enough.
- **TagGraph polish** (search-to-focus, per-map filters, share URLs) — not a current itch.
- **Release-level artist/label graph** — too many nodes, not compelling; host-level aggregation is what becomes the reco engine above.
