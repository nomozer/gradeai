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
        timeout: 300000,         // Wait 5 minutes for the AI to respond
        proxyTimeout: 300000,    // Wait 5 minutes for the proxy itself
        configure: (proxy, options) => {
          // Backend `--reload` window is ~1–2s. Without retry, any request
          // (especially the 10s heartbeat poll) hitting that window fails
          // with ECONNREFUSED → vite proxy returns 503 → browser logs a
          // red entry that looks like a real backend bug. Retry connection
          // failures up to 5 times spaced 300 ms apart before giving up,
          // so transient reload races stay invisible to the user.
          proxy.on('error', (err, req, res) => {
            const code = err && err.code;
            const connFailed = code === 'ECONNREFUSED' || code === 'ECONNRESET';
            req.__retryCount = (req.__retryCount || 0) + 1;
            if (connFailed && req.__retryCount <= 5 && res && !res.headersSent) {
              setTimeout(() => {
                try { proxy.web(req, res, options); }
                catch { /* fall through to 503 below */ }
              }, 300);
              return;
            }
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
