import { describe, expect, it } from 'vitest'
import { createHitHandler } from '../src/server/hit'
import { MemoryStore } from '../src/stores/memory'

const NOW = () => new Date('2026-07-05T10:00:00Z')

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://dbie.rbihub.in/api/hit', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { host: 'dbie.rbihub.in', ...headers },
  })
}

describe('createHitHandler', () => {
  it('counts a page hit with flow, referrer, device and country', async () => {
    const store = new MemoryStore()
    const handler = createHitHandler({ store, now: NOW })
    const res = await handler(
      post(
        { p: '/b', r: '/a', f: 'news.ycombinator.com', d: 'd' },
        { 'cloudfront-viewer-country': 'IN' },
      ),
    )
    expect(res.status).toBe(204)
    const rows = await store.query(['2026-07-05'])
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]))
    expect(byMetric).toEqual({
      page: '/b',
      flow: '/a → /b',
      ref: 'news.ycombinator.com',
      dev: 'desktop',
      country: 'IN',
    })
  })

  it('rejects non-POST methods', async () => {
    const handler = createHitHandler({ store: new MemoryStore(), now: NOW })
    const res = await handler(new Request('https://x.test/api/hit', { method: 'GET' }))
    expect(res.status).toBe(405)
  })

  it('rejects cross-origin posts but allows same-host and allowlisted origins', async () => {
    const store = new MemoryStore()
    const handler = createHitHandler({ store, allowedOrigins: ['friend.example'], now: NOW })
    expect((await handler(post({ p: '/' }, { origin: 'https://evil.example' }))).status).toBe(403)
    expect((await handler(post({ p: '/' }, { origin: 'not a url' }))).status).toBe(403)
    expect((await handler(post({ p: '/' }, { origin: 'https://dbie.rbihub.in' }))).status).toBe(204)
    expect((await handler(post({ p: '/' }, { origin: 'https://friend.example' }))).status).toBe(204)
  })

  it('rate limits per IP without persisting anything', async () => {
    const store = new MemoryStore()
    const handler = createHitHandler({
      store,
      rateLimit: { capacity: 2, refillPerSec: 0 },
      now: NOW,
    })
    const hdrs = { 'x-forwarded-for': '203.0.113.9' }
    expect((await handler(post({ p: '/' }, hdrs))).status).toBe(204)
    expect((await handler(post({ p: '/' }, hdrs))).status).toBe(204)
    expect((await handler(post({ p: '/' }, hdrs))).status).toBe(429)
    // a different caller is unaffected
    expect((await handler(post({ p: '/' }, { 'x-forwarded-for': '198.51.100.7' }))).status).toBe(
      204,
    )
  })

  it('rejects malformed and oversized bodies', async () => {
    const handler = createHitHandler({ store: new MemoryStore(), now: NOW })
    expect((await handler(post('not json'))).status).toBe(400)
    expect((await handler(post({ nope: true }))).status).toBe(400)
    expect((await handler(post({ p: '/', v: 'x'.repeat(3000) }))).status).toBe(413)
  })

  it('buckets days by the configured offset', async () => {
    const store = new MemoryStore()
    const handler = createHitHandler({
      store,
      utcOffsetMinutes: 330,
      now: () => new Date('2026-07-05T20:00:00Z'), // 01:30 IST next day
    })
    await handler(post({ p: '/' }))
    expect(await store.query(['2026-07-06'])).toHaveLength(1)
  })

  it('returns 500 when the store fails', async () => {
    const handler = createHitHandler({
      store: {
        add: async () => {
          throw new Error('boom')
        },
        query: async () => [],
      },
      now: NOW,
    })
    expect((await handler(post({ p: '/' }))).status).toBe(500)
  })
})
