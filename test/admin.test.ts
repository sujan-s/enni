import { describe, expect, it } from 'vitest'
import { createAdminHandler } from '../src/server/admin'
import { createHitHandler } from '../src/server/hit'
import { MemoryStore } from '../src/stores/memory'

const NOW = () => new Date('2026-07-05T10:00:00Z')
const AUTH = { authorization: 'Basic ' + btoa('anyone:letmein') }

function get(path: string, headers: Record<string, string> = {}): Request {
  return new Request('https://dbie.rbihub.in' + path, { headers })
}

describe('createAdminHandler', () => {
  const store = new MemoryStore()
  const handler = createAdminHandler({ store, password: 'letmein', siteName: 'DBIE', now: NOW })

  it('challenges without credentials', async () => {
    const res = await handler(get('/admin'))
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('Basic')
  })

  it('rejects a wrong password', async () => {
    const res = await handler(get('/admin', { authorization: 'Basic ' + btoa('x:wrong') }))
    expect(res.status).toBe(401)
  })

  it('refuses to run without a configured password', async () => {
    const bare = createAdminHandler({ store, now: NOW })
    const prev = process.env.ANALYTICS_PASSWORD
    delete process.env.ANALYTICS_PASSWORD
    try {
      expect((await bare(get('/admin'))).status).toBe(503)
    } finally {
      if (prev !== undefined) process.env.ANALYTICS_PASSWORD = prev
    }
  })

  it('serves the self-contained dashboard', async () => {
    const res = await handler(get('/admin', AUTH))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('DBIE')
    // self-contained: no external scripts, styles or fonts
    expect(html).not.toMatch(/src="https?:/)
    expect(html).not.toMatch(/href="https?:/)
  })

  it('serves aggregated JSON for a range', async () => {
    const hit = createHitHandler({ store, now: NOW })
    const beacon = (body: object) =>
      hit(
        new Request('https://dbie.rbihub.in/api/hit', {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { host: 'dbie.rbihub.in' },
        }),
      )
    await beacon({ p: '/a' })
    await beacon({ p: '/b', r: '/a' })
    await beacon({ p: '/search', e: 's0', v: 'msme credit' })

    const res = await handler(get('/admin?data=1&range=week', AUTH))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.days).toHaveLength(7)
    expect(json.days[6]).toBe('2026-07-05')
    expect(json.pageviews).toBe(2)
    expect(json.pages).toEqual([
      { value: '/a', count: 1 },
      { value: '/b', count: 1 },
    ])
    expect(json.flows).toEqual([{ from: '/a', to: '/b', count: 1 }])
    expect(json.events.s0).toEqual([{ value: 'msme credit', count: 1 }])
  })

  it('escapes the site name in the HTML shell', async () => {
    const xss = createAdminHandler({
      store,
      password: 'letmein',
      siteName: '<script>alert(1)</script>',
      now: NOW,
    })
    const html = await (await xss(get('/admin', AUTH))).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
