import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/baikal-booking/',
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3200',
        changeOrigin: true
      }
    }
  }
});
