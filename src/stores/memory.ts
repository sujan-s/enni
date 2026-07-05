import type { CounterEntry, CounterRow, CounterStore } from '../server/types'

const SEP = '\u0000'

/** In-memory store for local development and tests. */
export class MemoryStore implements CounterStore {
  private days = new Map<string, Map<string, number>>()

  async add(day: string, entries: CounterEntry[]): Promise<void> {
    let m = this.days.get(day)
    if (!m) this.days.set(day, (m = new Map()))
    for (const e of entries) {
      const k = e.metric + SEP + e.value
      m.set(k, (m.get(k) ?? 0) + 1)
    }
  }

  async query(days: string[]): Promise<CounterRow[]> {
    const out: CounterRow[] = []
    for (const day of days) {
      const m = this.days.get(day)
      if (!m) continue
      for (const [k, count] of m) {
        const i = k.indexOf(SEP)
        out.push({ day, metric: k.slice(0, i), value: k.slice(i + 1), count })
      }
    }
    return out
  }
}
