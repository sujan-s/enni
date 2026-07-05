# enni

First-party, counter-only web analytics that ships inside your Next.js site: a
**~0.6KB collector**, **one API route**, and a **password-protected admin
dashboard** — storing only anonymous counters in DynamoDB.

No third parties, no cookies, no visitor identifiers, no consent banner. The
server stores only aggregate counters — no events, no IPs, no fingerprints —
so there is nothing to leak, **by construction**.

Answers, per day / 7 days / 30 days:

- most-visited pages
- page-to-page navigation flows (rendered as a sankey)
- visitor countries (from the CDN's edge header, never from the IP)
- referrers, device split, 404s, zero-result searches, downloads, web-vitals buckets

## Install

```sh
npm install enni
```

## Set up the table (two commands)

```sh
bash node_modules/enni/setup/create-table.sh enni-counters ap-south-1
```

That runs `create-table` (on-demand billing, so idle cost is zero) and enables
TTL — counters expire after 400 days. Then attach
`node_modules/enni/setup/iam-policy.json` (fill in the table ARN) to your
compute role. The policy grants exactly two actions: `dynamodb:UpdateItem` and
`dynamodb:Query`.

Environment variables:

| Variable | Purpose |
|---|---|
| `ENNI_TABLE` | DynamoDB table name |
| `ANALYTICS_PASSWORD` | password for `/enni` (any username) |

## Wire it into Next.js (App Router)

**1. The collector** — a client component mounted once in the root layout:

```tsx
// app/analytics.tsx
'use client'
import { useEffect } from 'react'
import { init } from 'enni/client'

export function Analytics() {
  useEffect(() => {
    init() // posts to /api/hit; pass { endpoint } to change
  }, [])
  return null
}
```

```tsx
// app/layout.tsx — inside <body>
<Analytics />
```

It counts the first page, auto-tracks SPA route changes via the history API,
reports the page-to-page transition edge (kept in `sessionStorage`, so the
server only ever sees anonymous edge counts), the external referrer host on
entry, and a mobile/desktop flag. It is a no-op when Do Not Track or Global
Privacy Control is on, and fails silently.

Prefer a plain script tag? Copy `node_modules/enni/dist/collector.global.js`
to `public/enni.js` and add
`<script defer src="/enni.js" data-endpoint="/api/hit"></script>`.

**2. The collector endpoint:**

```ts
// app/api/hit/route.ts
import { createHitHandler } from 'enni'
import { DynamoStore } from 'enni/dynamo'

const store = new DynamoStore() // reads ENNI_TABLE
export const POST = createHitHandler({ store, utcOffsetMinutes: 330 }) // 330 = IST days
```

**3. The dashboard:**

```ts
// app/enni/route.ts
import { createAdminHandler } from 'enni'
import { DynamoStore } from 'enni/dynamo'

export const dynamic = 'force-dynamic'
const store = new DynamoStore()
export const GET = createAdminHandler({
  store,
  siteName: 'dbie.rbihub.in',
  utcOffsetMinutes: 330,
})
```

Browse the site, then open `/enni` (any username, password from
`ANALYTICS_PASSWORD`). That's the whole integration.

> Set `utcOffsetMinutes` to the same value in both handlers; it shifts the
> **day bucketing** (write and read) away from UTC, e.g. 330 for IST.

## Custom events (same mechanism, near-zero cost)

The collector registers `window.enni(event, value?)`. The value defaults to
the current path, and event hits do not double-count as pageviews.

```tsx
// 404s — from a client component rendered by app/not-found.tsx
useEffect(() => { window.enni?.('404') }, [])

// zero-result site searches — the best missing-content signal
if (results.length === 0) window.enni?.('s0', query)

// file downloads / "go to dataset" clicks
window.enni?.('dl', href)
```

The dashboard gives `404`, `s0` and `dl` their own cards ("404s",
"Zero-result searches", "Downloads"); any other event name gets a generic
card.

**Web vitals** (optional, separate import so the core stays tiny): buckets
LCP, CLS and INP into good/ok/poor histograms — no timings stored.

```tsx
import { vitals } from 'enni/vitals'
useEffect(() => { init(); vitals() }, [])
```

## What is never collected

The storage contract (`CounterStore`) accepts only `(day, metric, value) += 1`
increments, so nothing per-visitor *can* be stored:

- no cookies, no localStorage identifiers, no fingerprints
- no IP addresses — the rate limiter holds them in memory transiently, and
  the country comes from `CloudFront-Viewer-Country` (or `X-Vercel-IP-Country`
  / `CF-IPCountry`), never from an IP lookup
- no user-agent strings — the client sends a single `m`/`d` flag
- no query strings or fragments — paths are truncated at `?` and `#` before
  counting, on the client and again on the server
- no timestamps finer than the day bucket

Abuse of the open collector endpoint is therefore noise, not a breach; it is
additionally origin-checked and rate limited (token bucket per IP, in memory).

## Data model

One DynamoDB item per (day, metric, value), incremented blind with `ADD`:

| pk | sk | n | exp |
|---|---|---|---|
| `2026-07-05` | `page#/prices/consumer-price-index` | 41 | TTL epoch |
| `2026-07-05` | `flow#/stories → /stories/the-lights-came-on` | 7 | … |
| `2026-07-05` | `country#IN` | 214 | … |
| `2026-07-05` | `evt:s0#msme credit` | 3 | … |

A day of traffic is a few hundred items; a dashboard load is one `Query` per
day in the range (7 or 30, in parallel). On-demand billing keeps this
effectively free at documentation-site scale.

## A second site in under an hour

Everything is options, not constants:

- separate table per site: run `create-table.sh` again and set `ENNI_TABLE`
- or one shared table: `new DynamoStore({ site: 'docs' })` prefixes the
  partition key (`docs#2026-07-05`) — the tenancy hook is designed in, v1
  just doesn't ship a combined view
- cross-origin collection (e.g. a static microsite posting to the main app):
  `createHitHandler({ allowedOrigins: ['docs.rbihub.in'] })`

## Local preview

```sh
pnpm build && pnpm preview
# → http://localhost:4321/enni  (password: preview, seeded sample data)
```

## Amplify notes (first deployment)

- **Geo header probe** (PRD open question 1): deploy a temporary route and
  check the header actually reaches WEB_COMPUTE:

  ```ts
  // app/api/geo-probe/route.ts — delete after checking
  export const GET = (req: Request) =>
    Response.json({ country: req.headers.get('cloudfront-viewer-country') })
  ```

  If it is absent, countries are simply not counted (the card stays empty) —
  there is no third-party fallback by design, so nothing else breaks.
- **Compute role** (open question 2): attach the IAM policy to the app's SSR
  compute role (Amplify console → App settings → IAM roles). Verify with one
  browse-then-check-`/enni` round trip.
- **CSP**: the dashboard is one self-contained HTML page with inline CSS/JS
  and zero external requests. If you enforce a strict CSP, allow
  `'unsafe-inline'` for `/enni` only (it sits behind Basic auth).

## API surface

| Export | From | What |
|---|---|---|
| `init(opts?)` | `enni/client` | start the collector, returns `track` |
| `vitals(endpoint?)` | `enni/vitals` | optional web-vitals buckets |
| `createHitHandler(opts)` | `enni` | `POST` route handler (standard `Request` → `Response`) |
| `createAdminHandler(opts)` | `enni` | `GET` dashboard + JSON route handler |
| `DynamoStore` | `enni/dynamo` | production counter store |
| `MemoryStore` | `enni` | dev/test counter store |
| `CounterStore` | `enni` | interface, if you want another backend |

Handlers take and return web-standard `Request`/`Response`, so they work
anywhere that speaks them (Next.js route handlers today; others untested).
