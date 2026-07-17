import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

// HTTPS ist für WebXR auf der Quest Pflicht. Mit NO_HTTPS=1 startet der
// Dev-Server ohne Zertifikat (praktisch für lokale Headless-Tests).
const useHttps = process.env.NO_HTTPS !== '1';

export default defineConfig({
  plugins: useHttps ? [mkcert()] : [],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
