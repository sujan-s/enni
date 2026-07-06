export interface EnniOptions {
  /** Where hits are POSTed. Defaults to `/api/hit`. */
  endpoint?: string
}

/** Report a custom event, e.g. `track('404')` or `track('s0', query)`. */
export type Track = (event: string, value?: string) => void

declare global {
  interface Window {
    enni?: Track
    __enni?: Track
  }
}

/**
 * Start the collector: counts the current page, auto-tracks SPA route
 * changes (history API), reports page-to-page flow edges from
 * sessionStorage, the external referrer host on entry, and device class.
 * No cookies, no identifiers; a no-op when Do Not Track is on (GPC is
 * deliberately not honoured — see "Privacy signals" in the README).
 * Safe to call more than once.
 */
export function init(opts: EnniOptions = {}): Track {
  if (typeof window === 'undefined') return () => {}
  const w = window
  if (w.__enni) return w.__enni
  const nav = navigator
  const off = nav.doNotTrack === '1'
  const ep = opts.endpoint || '/api/hit'

  const send = (body: Record<string, string>) => {
    if (off) return
    try {
      const s = JSON.stringify(body)
      if (!(nav.sendBeacon && nav.sendBeacon(ep, s)))
        fetch(ep, { method: 'POST', body: s, keepalive: true }).catch(() => {})
    } catch {}
  }

  let last = ''
  const page = () => {
    const p = location.pathname
    if (p === last) return
    last = p
    const b: Record<string, string> = {
      p,
      d: matchMedia('(pointer:coarse)').matches ? 'm' : 'd',
    }
    let prev = ''
    try {
      prev = sessionStorage.getItem('_enni') || ''
      sessionStorage.setItem('_enni', p)
    } catch {}
    if (prev && prev !== p) b.r = prev
    if (!prev) {
      try {
        const f = document.referrer && new URL(document.referrer).hostname
        if (f && f !== location.hostname) b.f = f
      } catch {}
    }
    send(b)
  }

  const h = history
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = h[m]
    h[m] = function (this: History, ...a: Parameters<History['pushState']>) {
      const r = orig.apply(this, a)
      page()
      return r
    }
  }
  addEventListener('popstate', page)

  const track: Track = (e, v) => {
    const b: Record<string, string> = { p: location.pathname, e }
    if (v != null) b.v = String(v)
    send(b)
  }
  w.enni = w.__enni = track
  page()
  return track
}
