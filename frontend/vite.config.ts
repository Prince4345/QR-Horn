import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths required for Capacitor (file / https://localhost)
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('html5-qrcode')) return 'qr-scanner';
          if (id.includes('html2canvas') || id.includes('jspdf')) return 'sticker-export';
          if (id.includes('firebase')) return 'firebase';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
        },
      },
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
