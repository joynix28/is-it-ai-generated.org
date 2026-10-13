import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // Transformers.js ships its own wasm assets; do not inline anything large.
    assetsInlineLimit: 0,
  },
  worker: {
    format: 'es',
  },
  server: {
    headers: {
      // Same headers Cloudflare Pages sends, so local dev matches production.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
