import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      client: 'src/client/index.ts',
      vitals: 'src/client/vitals.ts',
      dynamo: 'src/stores/dynamo.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  {
    // Drop-in <script> build of the collector, size-gated at ≤1KB gzipped.
    entry: { collector: 'src/client/collector.ts' },
    format: ['iife'],
    minify: true,
    target: 'es2020',
  },
])
