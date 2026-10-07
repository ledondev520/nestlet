import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'frontend',
  base: '/next/',
  publicDir: false,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./frontend', import.meta.url)) } },
  build: {
    outDir: '../public/next',
    emptyOutDir: true,
    sourcemap: false,
    // Fixed, explicit files keep the server's static allowlist closed.
    rollupOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'app.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]'
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4173', '/logo.svg': 'http://127.0.0.1:4173' }
  }
});
