import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base './' so the same build loads from Electron's orbit:// protocol and
// from Capacitor's https://localhost WebView.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  build: { outDir: 'dist', target: 'es2022', chunkSizeWarningLimit: 4000 },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
});
