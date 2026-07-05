// Local preview: serves the admin dashboard on http://localhost:4321/enni
// with seeded sample data (password: preview). No AWS needed.
import { createServer } from 'node:http'
import { createAdminHandler, createHitHandler, MemoryStore } from '../dist/index.js'

const store = new MemoryStore()
const today = new Date()
const day = (offset) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10)

const pages = ['/', '/prices/consumer-price-index', '/stories', '/stories/the-lights-came-on', '/datasets', '/about']
const countries = ['IN', 'US', 'GB', 'SG', 'DE', 'AE', 'JP']
const refs = ['news.ycombinator.com', 'x.com', 'rbi.org.in', 'linkedin.com']
let seed = 42
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

for (let d = 0; d < 30; d++) {
  const n = 40 + Math.floor(rand() * 120)
  for (let i = 0; i < n; i++) {
    const p = pick(pages)
    const entries = [
      { metric: 'page', value: p },
      { metric: 'country', value: pick(countries) },
      { metric: 'dev', value: rand() < 0.55 ? 'mobile' : 'desktop' },
    ]
    if (rand() < 0.6) entries.push({ metric: 'flow', value: `${pick(pages)} → ${p}` })
    if (rand() < 0.2) entries.push({ metric: 'ref', value: pick(refs) })
    if (rand() < 0.05) entries.push({ metric: 'evt:404', value: '/old-link-' + Math.floor(rand() * 5) })
    if (rand() < 0.08) entries.push({ metric: 'evt:s0', value: pick(['msme credit', 'gold reserves', 'upi volumes']) })
    if (rand() < 0.1) entries.push({ metric: 'evt:dl', value: '/files/handbook.pdf' })
    if (rand() < 0.3)
      entries.push({
        metric: 'evt:vital',
        value: pick(['lcp:good', 'lcp:good', 'lcp:ok', 'cls:good', 'cls:poor', 'inp:good', 'inp:ok']),
      })
    await store.add(day(d), entries)
  }
}

const admin = createAdminHandler({ store, password: 'preview', siteName: 'dbie.rbihub.in (sample)' })
const hit = createHitHandler({ store })

createServer(async (req, res) => {
  const url = `http://localhost:4321${req.url}`
  const chunks = []
  for await (const c of req) chunks.push(c)
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  })
  const out = req.url.startsWith('/api/hit') ? await hit(request) : await admin(request)
  res.writeHead(out.status, Object.fromEntries(out.headers))
  res.end(Buffer.from(await out.arrayBuffer()))
}).listen(4321, () => {
  console.log('Dashboard: http://localhost:4321/enni  (any username, password: preview)')
})
