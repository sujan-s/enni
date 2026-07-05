import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

describe('collector size (R1)', () => {
  it('stays at or under 1KB gzipped', async () => {
    const result = await build({
      entryPoints: ['src/client/collector.ts'],
      bundle: true,
      minify: true,
      format: 'iife',
      target: 'es2020',
      write: false,
    })
    const bytes = gzipSync(result.outputFiles[0]!.contents).length
    // eslint-disable-next-line no-console
    console.info(`collector: ${bytes} bytes gzipped`)
    expect(bytes).toBeLessThanOrEqual(1024)
  })
})
