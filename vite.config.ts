import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When the backend is ready, point this proxy at it so the frontend
// can keep calling relative /api/* paths in both dev and prod.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // These libraries are only ever used by a handful of admin/manufacturing
    // screens (Excel export, QR generation/scanning). Splitting them into
    // their own chunks keeps them out of the initial bundle every role
    // downloads on first load — they're only fetched when a route that
    // actually needs them is visited (see App.tsx's React.lazy routes).
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-excel': ['xlsx', 'exceljs'],
          'vendor-qr': ['qrcode.react', 'html5-qrcode'],
        },
      },
    },
    // Excel/QR vendor chunks are legitimately large (~500kb+) — this only
    // silences the default warning threshold, it doesn't change what ships;
    // the manualChunks split above is what actually keeps them out of the
    // critical path.
    chunkSizeWarningLimit: 700,
  },
});
