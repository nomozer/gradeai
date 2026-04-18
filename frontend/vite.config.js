import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Don't spam stderr / browser console when the backend is briefly
        // unreachable (e.g. during uvicorn's auto-reload).  Heartbeat and
        // other polling requests can safely retry on the next tick.
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ detail: 'Backend unavailable' }));
            }
          });
        },
      },
    },
  },
});
