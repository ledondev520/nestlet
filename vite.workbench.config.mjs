import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Design-preview build for the workbench shell only. The production server
// static allowlist is unchanged and never serves this bundle; root decides
// integration. Usage: npx vite dev --config vite.workbench.config.mjs
export default defineConfig({
  root: 'frontend',
  base: '/workbench-preview/',
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./frontend', import.meta.url)) } },
  build: {
    outDir: '../public/next-workbench',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: { workbench: fileURLToPath(new URL('./frontend/workbench.html', import.meta.url)) },
      output: {
        codeSplitting: false,
        entryFileNames: 'workbench.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]'
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    // Preview-only: rewrite Origin so the backend's same-origin check sees the
    // API target, not the dev server. Never ship this to production config.
    proxy: {
      '/api': { target: 'http://127.0.0.1:4173', changeOrigin: true, headers: { origin: 'http://127.0.0.1:4173' } },
      '/logo.svg': { target: 'http://127.0.0.1:4173', changeOrigin: true }
    }
  }
});
