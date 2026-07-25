import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mini App (React + Vite) build config.
// - Frontend manba: `src/`, kirish nuqtasi: `index.html` (repo ildizida)
// - Chiqish: `dist/` (Netlify publish papkasi)
// - `scripts/build.js` vite build dan keyin statik admin panelni `dist/admin/` ga ko'chiradi
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
