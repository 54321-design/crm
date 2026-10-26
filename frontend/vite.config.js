import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: /api calls are proxied to the Express backend, so no CORS setup is needed locally.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
});
