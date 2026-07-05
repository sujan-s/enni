import { describe, expect, it } from 'vitest'
import { dayOf, daysFor } from '../src/server/days'
import { summarise } from '../src/server/summarise'
import type { CounterRow } from '../src/server/types'

describe('days', () => {
  const now = new Date('2026-07-05T20:00:00Z')

  it('formats UTC days and applies offsets', () => {
    expect(dayOf(now)).toBe('2026-07-05')
    expect(dayOf(now, 330)).toBe('2026-07-06') // 01:30 IST
    expect(dayOf(now, -600)).toBe('2026-07-05')
  })

  it('produces oldest-first ranges', () => {
    expect(daysFor('day', now)).toEqual(['2026-07-05'])
    const week = daysFor('week', now)
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-06-29')
    expect(week[6]).toBe('2026-07-05')
    expect(daysFor('month', now)).toHaveLength(30)
  })
})

describe('summarise', () => {
  const rows: CounterRow[] = [
    { day: '2026-07-04', metric: 'page', value: '/a', count: 3 },
    { day: '2026-07-05', metric: 'page', value: '/a', count: 2 },
    { day: '2026-07-05', metric: 'page', value: '/b', count: 4 },
    { day: '2026-07-05', metric: 'flow', value: '/a → /b', count: 4 },
    { day: '2026-07-05', metric: 'country', value: 'IN', count: 9 },
    { day: '2026-07-05', metric: 'evt:404', value: '/missing', count: 2 },
  ]
  const days = ['2026-07-04', '2026-07-05']
  const s = summarise(rows, days)

  it('sums pageviews across days and per day', () => {
    expect(s.pageviews).toBe(9)
    expect(s.byDay).toEqual([
      { day: '2026-07-04', count: 3 },
      { day: '2026-07-05', count: 6 },
    ])
  })

  it('merges and ranks values across days', () => {
    expect(s.pages).toEqual([
      { value: '/a', count: 5 },
      { value: '/b', count: 4 },
    ])
  })

  it('splits flow edges', () => {
    expect(s.flows).toEqual([{ from: '/a', to: '/b', count: 4 }])
  })

  it('groups events by name', () => {
    expect(s.events['404']).toEqual([{ value: '/missing', count: 2 }])
  })

  it('ignores rows for days outside the range', () => {
    const out = summarise(rows, ['2026-07-05'])
    expect(out.byDay).toEqual([{ day: '2026-07-05', count: 6 }])
    expect(out.pageviews).toBe(6)
  })
})
