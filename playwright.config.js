// Browser-Tests (tests/e2e) gegen die echte App in Chromium.
//
// Drei Server, alle mit eigenen Ports – ein nebenher laufendes `npm run dev`
// stört nicht, und umgekehrt:
//
//   API   Express-Proxy im Mock-Modus, ohne Key. Ein Testlauf kann damit nie
//         echte Claude-Aufrufe auslösen, auch nicht über eine lokale .env
//         (dotenv überschreibt gesetzte Variablen nicht).
//   dev   Vite-Dev-Server – der Weg, über den die App auch auf die Quest kommt.
//   prod  Produktions-Build über `vite preview`. Eigenes Projekt, weil sich
//         beide unterscheiden können: Der Startabsturz vom September trat nur
//         am Dev-Server auf, weil der Minifier im Build `let` zu `var` macht.
//
// Ohne GPU rendert Chromium per SwiftShader in Software. Das ist langsam (das
// Dojo braucht Sekunden pro Bild) – daher die großzügigen Zeitgrenzen und nur
// ein bis zwei Worker.
import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const API_PORT = 3191;
const DEV_PORT = 5191;
const PROD_PORT = 5192;
const API_URL = `http://localhost:${API_PORT}`;

// In diesem Repo-Container liegt Chromium vorinstalliert unter
// /opt/pw-browsers; in CI installiert `npx playwright install chromium` den
// passenden Browser, dann bleibt executablePath leer.
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM || (fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Jeder Test startet die App in einem frischen Kontext – sie sind
  // voneinander unabhängig und dürfen auch innerhalb einer Datei parallel
  // laufen. Mehr als zwei Worker bremsen sich beim Software-Rendering nur
  // gegenseitig aus.
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
    },
  },
  projects: [
    {
      name: 'dev',
      testIgnore: /prod\.spec\.js$/,
      use: { baseURL: `http://localhost:${DEV_PORT}` },
    },
    {
      name: 'prod',
      testMatch: /prod\.spec\.js$/,
      use: { baseURL: `http://localhost:${PROD_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'node server/index.js',
      url: `${API_URL}/api/health`,
      env: { PORT: String(API_PORT), MOCK_AI: '1', ANTHROPIC_API_KEY: '' },
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${DEV_PORT} --strictPort`,
      url: `http://localhost:${DEV_PORT}/`,
      env: { NO_HTTPS: '1', API_PROXY_TARGET: API_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Eigener Ausgabeordner, damit ein Testlauf kein vorhandenes dist/ ersetzt.
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}/`,
      env: { NO_HTTPS: '1', API_PROXY_TARGET: API_URL },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
