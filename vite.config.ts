import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Single-container app: in dev, Vite (5173) proxies /api to the Express server (3001).
// In production, Express serves the built client bundle from src/client/dist.
export default defineConfig({
  root: path.resolve(__dirname, 'src/client'),
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/client'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Build into <root>/dist/client so production can serve it from dist/
    // alongside the compiled server (dist/server). See src/server/app.ts.
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});