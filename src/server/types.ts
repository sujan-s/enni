/** A validated hit from the collector. Short keys keep the beacon tiny. */
export interface HitPayload {
  /** Path visited, e.g. `/prices/consumer-price-index`. */
  p: string
  /** Previous path in this tab (flow edge source). */
  r?: string
  /** External referrer host, only on session entry. */
  f?: string
  /** Device class: mobile or desktop. */
  d?: 'm' | 'd'
  /** Custom event name, e.g. `404`, `s0`, `dl`, `vital`. */
  e?: string
  /** Custom event value, e.g. the missing path or search query. */
  v?: string
}

export interface CounterEntry {
  metric: string
  value: string
}

export interface CounterRow extends CounterEntry {
  /** UTC (or offset-shifted) day, `YYYY-MM-DD`. */
  day: string
  count: number
}

/**
 * The only storage contract in the system: increment counters, read
 * counters. Nothing per-visitor can pass through it by construction.
 */
export interface CounterStore {
  add(day: string, entries: CounterEntry[]): Promise<void>
  query(days: string[]): Promise<CounterRow[]>
}
