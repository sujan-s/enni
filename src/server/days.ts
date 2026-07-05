/** `YYYY-MM-DD` for a moment, shifted by an offset in minutes (330 = IST). */
export function dayOf(now: Date, utcOffsetMinutes = 0): string {
  return new Date(now.getTime() + utcOffsetMinutes * 60_000).toISOString().slice(0, 10)
}

/** The days covered by a dashboard range, oldest first. */
export function daysFor(range: string, now: Date, utcOffsetMinutes = 0): string[] {
  const n = range === 'month' ? 30 : range === 'week' ? 7 : 1
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--)
    out.push(dayOf(new Date(now.getTime() - i * 86_400_000), utcOffsetMinutes))
  return out
}
