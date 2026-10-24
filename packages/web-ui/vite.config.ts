import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces for LAN and mobile access
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'lynq.local',
      'localhost',
      '127.0.0.1',
      '.local',
    ],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
