// IIFE entry for the drop-in <script> build (dist/collector.global.js).
// <script defer src="/enni.js" data-endpoint="/api/hit"></script>
import { init } from './core'

const s = document.currentScript as HTMLScriptElement | null
init({ endpoint: s?.dataset.endpoint })
