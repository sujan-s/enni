import type { CounterEntry, HitPayload } from './types'

const EVENT_RE = /^[a-z0-9_-]{1,24}$/
const HOST_RE = /^[a-z0-9.-]{1,128}$/

function cleanPath(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let p = v
  // Never count query strings or fragments — they can carry personal data.
  const cut = p.search(/[?#]/)
  if (cut >= 0) p = p.slice(0, cut)
  if (!/^\/\S{0,511}$/.test(p)) return null
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

function cleanHost(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const h = v.toLowerCase()
  return HOST_RE.test(h) ? h : null
}

/** Strictly validate a raw JSON body into a hit, or reject it. */
export function parseHit(raw: unknown): HitPayload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const p = cleanPath(o.p)
  if (!p) return null
  const hit: HitPayload = { p }
  const r = cleanPath(o.r)
  if (r && r !== p) hit.r = r
  const f = cleanHost(o.f)
  if (f) hit.f = f
  if (o.d === 'm' || o.d === 'd') hit.d = o.d
  if (typeof o.e === 'string' && EVENT_RE.test(o.e)) {
    hit.e = o.e
    if (typeof o.v === 'string' && o.v.length > 0)
      hit.v = o.v.slice(0, 200).replace(/[\u0000-\u001f\u007f]/g, '')
  }
  return hit
}

/**
 * Expand one hit into the counters it increments. An event hit counts
 * only its event (value defaults to the current path, so `track('404')`
 * from a not-found page counts the missing path); a page hit counts
 * page, flow edge, referrer, device and country.
 */
export function entriesFor(hit: HitPayload, country: string | null): CounterEntry[] {
  if (hit.e) return [{ metric: `evt:${hit.e}`, value: hit.v || hit.p }]
  const out: CounterEntry[] = [{ metric: 'page', value: hit.p }]
  if (hit.r) out.push({ metric: 'flow', value: `${hit.r} → ${hit.p}` })
  if (hit.f) out.push({ metric: 'ref', value: hit.f })
  if (hit.d) out.push({ metric: 'dev', value: hit.d === 'm' ? 'mobile' : 'desktop' })
  if (country) out.push({ metric: 'country', value: country })
  return out
}

const COUNTRY_HEADERS = ['cloudfront-viewer-country', 'x-vercel-ip-country', 'cf-ipcountry']

/** Two-letter country from a trusted edge header; never from the IP. */
export function countryFrom(headers: Headers, names: string[] = COUNTRY_HEADERS): string | null {
  for (const n of names) {
    const v = headers.get(n)
    if (v && /^[A-Za-z]{2}$/.test(v)) return v.toUpperCase()
  }
  return null
}
