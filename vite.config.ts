import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.SERVER_URL || 'http://localhost:4005';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
