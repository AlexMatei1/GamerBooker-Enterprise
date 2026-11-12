import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const cert = process.env.DASHBOARD_TLS_CERT;
const key = process.env.DASHBOARD_TLS_KEY;
if (Boolean(cert) !== Boolean(key)) throw new Error('Set both DASHBOARD_TLS_CERT and DASHBOARD_TLS_KEY for local HTTPS.');

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    https: cert && key ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined,
    proxy: {
      '/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
