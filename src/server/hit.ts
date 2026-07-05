import { RateLimiter, type RateLimiterOptions } from './ratelimit'
import type { CounterStore } from './types'
import { countryFrom, entriesFor, parseHit } from './validate'
import { dayOf } from './days'

export interface HitHandlerOptions {
  store: CounterStore
  /**
   * Extra origin hosts allowed to post hits. The request's own host is
   * always allowed, so same-site deployments need nothing here.
   */
  allowedOrigins?: string[]
  /** Token-bucket settings, or `false` to disable rate limiting. */
  rateLimit?: RateLimiterOptions | false
  /** Header names to read the visitor country from, in order. */
  countryHeaders?: string[]
  /** Shift day bucketing away from UTC, e.g. 330 for IST. */
  utcOffsetMinutes?: number
  /** Clock override for tests. */
  now?: () => Date
}

/**
 * The collector endpoint. Mount as a Next.js route handler:
 *
 *   // app/api/hit/route.ts
 *   export const POST = createHitHandler({ store })
 *
 * Privacy by construction: the request's IP is touched only by the
 * transient rate limiter, the country comes from an edge header, and
 * the only writes are counter increments via `entriesFor`.
 */
export function createHitHandler(opts: HitHandlerOptions): (req: Request) => Promise<Response> {
  const limiter = opts.rateLimit === false ? null : new RateLimiter(opts.rateLimit)
  const status = (code: number) => new Response(null, { status: code })

  return async (req) => {
    if (req.method !== 'POST') return status(405)

    const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '')
      .split(',')[0]!
      .trim()
      .split(':')[0]!
    const origin = req.headers.get('origin')
    if (origin) {
      let originHost: string
      try {
        originHost = new URL(origin).hostname
      } catch {
        return status(403)
      }
      if (originHost !== host && !opts.allowedOrigins?.includes(originHost)) return status(403)
    }

    if (limiter) {
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim() || 'unknown'
      if (!limiter.allow(ip)) return status(429)
    }

    const text = await req.text()
    if (text.length > 2048) return status(413)
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return status(400)
    }
    const hit = parseHit(raw)
    if (!hit) return status(400)

    const day = dayOf(opts.now?.() ?? new Date(), opts.utcOffsetMinutes)
    const country = countryFrom(req.headers, opts.countryHeaders)
    try {
      await opts.store.add(day, entriesFor(hit, country))
    } catch {
      return status(500)
    }
    return status(204)
  }
}
