# Next.js 16 — Agent Reference

This project uses **Next.js 16** (App Router). Many APIs differ from training data. Follow these rules precisely.

## Breaking changes from v15→v16

### Async Request APIs (enforced — no sync fallback)
`cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are **async**. Always `await` them.

```ts
// WRONG
const cookieStore = cookies()
// RIGHT
const cookieStore = await cookies()

// Page/Layout props
export default async function Page({ params, searchParams }: PageProps<'/blog/[slug]'>) {
  const { slug } = await params
  const query = await searchParams
}
```

Run `npx next typegen` to generate `PageProps`, `LayoutProps`, `RouteContext` helpers.

### `middleware` → `proxy`
- Rename `middleware.ts` → `proxy.ts`
- Rename export `middleware` → `proxy`
- `edge` runtime is **not** supported in `proxy` (uses `nodejs`)
- `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize` in next.config

### PPR / caching config
- `experimental.ppr` and `experimental_ppr` route segment config **removed**
- `experimental.dynamicIO` **removed** → use top-level `cacheComponents: true`
- `unstable_cacheLife` / `unstable_cacheTag` → `cacheLife` / `cacheTag` (stable, no `unstable_` prefix)
- `revalidateTag(tag, profile)` — second arg (cacheLife profile) is **required** in the Next 16 type signature; pass `"days"` / `"hours"` / etc.
- New: `updateTag(tag)` for read-your-writes semantics in Server Actions
- New: `refresh()` to refresh the client router from a Server Action

### Turbopack by default
- `next dev` and `next build` use Turbopack by default — no `--turbopack` flag needed
- Custom `webpack` config causes `next build` to fail unless `--webpack` flag is passed
- `experimental.turbopack` → top-level `turbopack` in next.config
- Sass `~` tilde imports not supported; use bare `node_modules` path instead

### Parallel routes
All `@slot` folders require an explicit `default.js`. Builds fail without it.

```tsx
// app/@modal/default.tsx
export default function Default() { return null }
```

### ESLint
- `next lint` command **removed** — run `eslint` directly; `next build` no longer lints
- `eslint` option in next.config **removed**
- `@next/eslint-plugin-next` now defaults to ESLint Flat Config

### Removed APIs
- `serverRuntimeConfig` / `publicRuntimeConfig` — use `process.env` and `NEXT_PUBLIC_` prefix
- `next/legacy/image` — use `next/image`
- `images.domains` — use `images.remotePatterns`
- `devIndicators.appIsrStatus`, `buildActivity`, `buildActivityPosition`
- AMP support entirely removed (`next/amp`, `useAmp`, `amp` config)

### Image defaults changed
| Setting | Old default | New default |
|---|---|---|
| `minimumCacheTTL` | 60s | 14400s (4h) |
| `imageSizes` | includes 16 | 16 removed |
| `qualities` | all | `[75]` only |
| `maximumRedirects` | unlimited | 3 |
| local IP optimization | allowed | blocked (set `dangerouslyAllowLocalIP: true` to re-enable) |

Local images with query strings require `images.localPatterns[].search` config.

### Other
- `next dev` outputs to `.next/dev` (separate from `.next/` used by build)
- `reactCompiler` option promoted from `experimental` to stable top-level
- React 19.2: `ViewTransition`, `useEffectEvent`, `Activity` available in App Router
- Parallel route slots require explicit `default.js` — builds fail without it
- For slow client navigations: export `unstable_instant` from the route *in addition to* using Suspense

## File conventions (App Router)
```
app/
  layout.tsx       # Root layout — required
  page.tsx         # Route segment
  loading.tsx      # Suspense boundary
  error.tsx        # Error boundary (must be 'use client')
  not-found.tsx    # 404
  proxy.ts         # Was: middleware.ts
  route.ts         # API route handler
```

## React Server Components
- Default: Server Components (no `useState`, no browser APIs)
- Add `'use client'` directive only when needed (interactivity, hooks, browser APIs)
- Add `'use server'` for Server Actions (form mutations, data writes)
