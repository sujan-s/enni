import type { CounterRow } from './types'

export interface Ranked {
  value: string
  count: number
}

export interface Summary {
  days: string[]
  pageviews: number
  byDay: { day: string; count: number }[]
  pages: Ranked[]
  flows: { from: string; to: string; count: number }[]
  countries: Ranked[]
  referrers: Ranked[]
  devices: Ranked[]
  events: Record<string, Ranked[]>
}

/** Fold per-day counter rows into the dashboard's ranked lists. */
export function summarise(rows: CounterRow[], days: string[]): Summary {
  const byDay = new Map<string, number>(days.map((d) => [d, 0]))
  const agg = new Map<string, Map<string, number>>()
  for (const r of rows) {
    let m = agg.get(r.metric)
    if (!m) agg.set(r.metric, (m = new Map()))
    m.set(r.value, (m.get(r.value) ?? 0) + r.count)
    if (r.metric === 'page' && byDay.has(r.day)) byDay.set(r.day, byDay.get(r.day)! + r.count)
  }
  const top = (metric: string, n: number): Ranked[] =>
    [...(agg.get(metric) ?? [])]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, n)

  const events: Record<string, Ranked[]> = {}
  for (const metric of agg.keys())
    if (metric.startsWith('evt:')) events[metric.slice(4)] = top(metric, 50)

  const flows = top('flow', 60).flatMap(({ value, count }) => {
    const i = value.indexOf(' → ')
    return i < 0 ? [] : [{ from: value.slice(0, i), to: value.slice(i + 3), count }]
  })

  return {
    days,
    pageviews: [...byDay.values()].reduce((a, b) => a + b, 0),
    byDay: days.map((day) => ({ day, count: byDay.get(day) ?? 0 })),
    pages: top('page', 100),
    flows,
    countries: top('country', 250),
    referrers: top('ref', 100),
    devices: top('dev', 2),
    events,
  }
}
