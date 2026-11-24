import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'client',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': path.join(root, 'shared') },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
    fs: { allow: [root] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
