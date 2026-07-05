# Footfall — first-party, counter-only web analytics

**One-liner:** a tiny analytics kit that ships inside a Next.js site — a ~1KB collector script, one API
route, and a password-protected `/admin` dashboard — storing only anonymous counters in DynamoDB.
No third parties, no cookies, no visitor identifiers, no consent banner. First deployment: dbie.rbihub.in.

## Problem

RBIH web properties need basic usage insight (what's read, how people move, where from) without
handing visitor data to a third party, adding a consent banner, or running an analytics server.
Hosted tools fail the same-domain + data-sovereignty test; self-hosted suites are heavier than the
sites they'd measure.

## Goals

1. Answer, per day/week/month: most-visited pages · page-to-page navigation flows · visitor countries.
2. 100% private **by construction**: the server stores only aggregate counters — no events, no IPs,
   no IDs, no cookies, no fingerprints. There is nothing to leak.
3. Ships with the site: all code in the host repo; the only external pieces are one DynamoDB table
   and one IAM policy (documented two-command setup).
4. Dashboard at `<site>/admin`, behind Basic auth (single password from an env var).
5. Effectively free (on-demand DynamoDB, counters only) and invisible to page performance (≤1KB
   script, `sendBeacon`, no layout impact).

## Non-goals (v1)

Unique-visitor counts · sessions/retention · scroll depth · session replay · realtime dashboards ·
multi-site tenancy (design for it, don't build it) · historical backfill.

## How it works

```
browser (first-party module, auto-tracks SPA route changes)
  └─ sendBeacon POST /api/hit { path, prevPath, referrerHost, event? }
       └─ Next route handler (Amplify WEB_COMPUTE runtime)
            ├─ country ← CloudFront-Viewer-Country header (IP never read into storage)
            └─ DynamoDB UpdateItem ADD — counters keyed (day · metric · value):
                 page · /prices/consumer-price-index        +1
                 flow · /stories → /stories/the-lights-came-on  +1
                 country · IN                                +1
                 referrer · news.ycombinator.com             +1

/admin — 401 Basic auth (ANALYTICS_PASSWORD env var)
  └─ aggregates counters → top pages, countries, referrers, 404s
     + flows as a sankey (Plotly, already in the host bundle)
```

Flows without tracking: the client keeps its own previous path in `sessionStorage` and reports the
transition edge; the server only ever sees anonymous edge counts.

## Also counted (same mechanism, near-zero cost)

Zero-result site searches (ranked list of missing datasets — the best product signal) · file
downloads and "go to dataset" clicks · 404 paths · device class (mobile/desktop) · web-vitals
histogram buckets.

## Requirements

| # | Requirement |
|---|-------------|
| R1 | Collector ≤1KB gzipped, no dependencies, fails silently, respects `navigator.doNotTrack` |
| R2 | Counter-only storage; no request may persist IP, UA string, or any per-visitor value |
| R3 | `/admin` behind Basic auth; day/week/month ranges; loads in <2s |
| R4 | Rate-limited, origin-checked collector endpoint (abuse ≈ noise, not breach) |
| R5 | DynamoDB TTL on daily rows (e.g. 400 days); table + IAM setup documented and scripted |
| R6 | Packaged so a second site (docs.rbihub.in) can adopt with <1h of work |

## Acceptance (v1 done when…)

Deployed on dev.dbie.rbihub.in: browsing the site produces visible page/flow/country counts on
`/admin`; a DPDP-minded reviewer can read the collector + handler in one sitting and confirm R2;
Lighthouse perf unchanged with the collector installed.

## Open questions

1. **Geo header:** confirm Amplify compute receives `CloudFront-Viewer-Country` (5-min probe on
   dev). If not, country needs a plan B — no third-party lookups allowed, and GeoLite2's licence
   forbids bundling in a public repo.
2. Amplify SSR compute role: confirm role attachment path for the DynamoDB policy.
3. Uniques later? Plausible-style daily-rotating salted hash is the only candidate — it weakens R2
   and is deliberately out of v1.
