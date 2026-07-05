/**
 * Optional web-vitals addon: buckets LCP, CLS and INP into
 * good / ok / poor (web.dev thresholds) and reports each once per
 * pageload as a `vital` event when the page is hidden. Histogram
 * buckets only — no timings, no identifiers.
 */
export function vitals(endpoint = '/api/hit'): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return
  const nav = navigator
  if (nav.doNotTrack === '1' || (nav as { globalPrivacyControl?: boolean }).globalPrivacyControl)
    return

  let lcp = 0
  let cls = 0
  let inp = 0
  const observe = (type: string, cb: (entries: PerformanceEntry[]) => void, extra?: object) => {
    try {
      new PerformanceObserver((l) => cb(l.getEntries())).observe({
        type,
        buffered: true,
        ...extra,
      } as PerformanceObserverInit)
    } catch {}
  }
  observe('largest-contentful-paint', (es) => {
    const e = es[es.length - 1]
    if (e) lcp = e.startTime
  })
  observe('layout-shift', (es) => {
    for (const e of es as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
      if (!e.hadRecentInput) cls += e.value
  })
  observe(
    'event',
    (es) => {
      for (const e of es) inp = Math.max(inp, e.duration)
    },
    { durationThreshold: 40 },
  )

  const bucket = (v: number, good: number, poor: number) =>
    v <= good ? 'good' : v <= poor ? 'ok' : 'poor'
  let sent = false
  const flush = () => {
    if (sent || document.visibilityState !== 'hidden') return
    sent = true
    const p = location.pathname
    const report = (name: string, b: string) => {
      try {
        navigator.sendBeacon(endpoint, JSON.stringify({ p, e: 'vital', v: `${name}:${b}` }))
      } catch {}
    }
    if (lcp) report('lcp', bucket(lcp, 2500, 4000))
    report('cls', bucket(cls, 0.1, 0.25))
    if (inp) report('inp', bucket(inp, 200, 500))
  }
  addEventListener('visibilitychange', flush)
  addEventListener('pagehide', flush)
}
