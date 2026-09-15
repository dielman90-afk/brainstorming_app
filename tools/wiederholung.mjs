// **Ist der Prüfstand überhaupt wiederholbar?**
//
// Jeder Regressionsvergleich in diesem Auftrag steht und fällt damit, dass
// dasselbe Bild zweimal dasselbe ergibt. Dieses Werkzeug nimmt ein Bild
// mehrfach hintereinander in **einem** Seitenaufruf auf und vergleicht die
// Aufnahmen miteinander. Bleibt ein Unterschied, liegt er an der laufenden
// Animation und nicht an einer Änderung am Aufbau.
//
//   node tools/wiederholung.mjs [--env night] [--shot a-augenhoehe] [--n 4]
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'night');
const name = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : 'a-augenhoehe';
const anzahl = +(argv.includes('--n') ? argv[argv.indexOf('--n') + 1] : 4);
const shot = shotsFor(envId).find((s) => s.name === name);
if (!shot) throw new Error(`Kein Bild "${name}" in ${envId}`);
const outDir = path.resolve(ROOT, 'tools/shots/wiederholung');

const server = await startServer();
const browser = await launchBrowser();
try {
  await fs.mkdir(outDir, { recursive: true });
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  await lockCamera(page, shot, 6.0);
  for (let i = 0; i < anzahl; i++) {
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(outDir, `${name}-${i}.png`) });
  }
  console.log(`${anzahl} Aufnahmen in tools/shots/wiederholung/`);
} finally {
  await browser.close();
  await server.stop();
}
