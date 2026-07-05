import { dashboardHtml } from './dashboard'
import { daysFor } from './days'
import { summarise } from './summarise'
import type { CounterStore } from './types'

export interface AdminOptions {
  store: CounterStore
  /** Dashboard password. Defaults to the `ANALYTICS_PASSWORD` env var. */
  password?: string
  /** Shown in the dashboard header; falls back to the browser host. */
  siteName?: string
  /** Shift day bucketing away from UTC, e.g. 330 for IST. */
  utcOffsetMinutes?: number
  /** Clock override for tests. */
  now?: () => Date
}

/**
 * The dashboard endpoint, behind HTTP Basic auth (any username, the
 * password from `ANALYTICS_PASSWORD`). Mount as a Next.js route handler:
 *
 *   // app/admin/route.ts
 *   export const GET = createAdminHandler({ store })
 *
 * A plain GET serves the self-contained dashboard; `?data=1&range=…`
 * serves the aggregated JSON the dashboard fetches.
 */
export function createAdminHandler(opts: AdminOptions): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 })
    const password = opts.password ?? process.env.ANALYTICS_PASSWORD
    if (!password)
      return new Response('Set ANALYTICS_PASSWORD to enable the dashboard.', { status: 503 })
    if (!authorised(req.headers.get('authorization'), password))
      return new Response('Authentication required.', {
        status: 401,
        headers: { 'www-authenticate': 'Basic realm="analytics", charset="UTF-8"' },
      })

    const url = new URL(req.url)
    if (url.searchParams.has('data')) {
      const range = url.searchParams.get('range') ?? 'week'
      const days = daysFor(range, opts.now?.() ?? new Date(), opts.utcOffsetMinutes)
      const rows = await opts.store.query(days)
      return Response.json(summarise(rows, days), {
        headers: { 'cache-control': 'no-store' },
      })
    }
    return new Response(
      dashboardHtml({ siteName: opts.siteName, utcOffsetMinutes: opts.utcOffsetMinutes ?? 0 }),
      {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
      },
    )
  }
}

function authorised(header: string | null, password: string): boolean {
  if (!header || !header.startsWith('Basic ')) return false
  let decoded: string
  try {
    decoded = atob(header.slice(6))
  } catch {
    return false
  }
  const colon = decoded.indexOf(':')
  if (colon < 0) return false
  return safeEqual(decoded.slice(colon + 1), password)
}

/** Constant-time-ish comparison without a node:crypto dependency. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}
