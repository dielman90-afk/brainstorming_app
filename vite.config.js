import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

// HTTPS ist für WebXR auf der Quest Pflicht. Mit NO_HTTPS=1 startet der
// Dev-Server ohne Zertifikat (praktisch für lokale Headless-Tests).
const useHttps = process.env.NO_HTTPS !== '1';

// Baustand fest ins Bündel schreiben.
//
// Anlass: Ein gemeldeter Fehler war längst behoben – nur lief auf der Brille
// eine Woche alte Fassung, weil der behobene Stand nie deployt worden war. Ohne
// sichtbare Kennung ist das von außen nicht zu unterscheiden, und man sucht im
// Code nach einem Fehler, der dort gar nicht mehr steht.
// Netlify liefert COMMIT_REF; lokal kommt der Stand aus git.
function buildStamp() {
  const fromCi = process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

// Ziel des /api-Proxys. Die Browser-Tests (playwright.config.js) starten einen
// eigenen Proxy im Mock-Modus auf einem eigenen Port und zeigen hierher – so
// kann ein Testlauf nie an einem nebenher laufenden Entwicklungs-Proxy mit
// echtem API-Key landen.
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildStamp()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: useHttps ? [mkcert()] : [],
  server: {
    host: true,
    proxy: {
      '/api': apiTarget,
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': apiTarget,
    },
  },
});
