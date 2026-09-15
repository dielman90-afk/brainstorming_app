// **Ein freier Blick, ohne den festen Kamerasatz anzutasten.**
//
//   node tools/blick.mjs --env matrix --pos 2,1.2,-3 --look 1.06,0.5,-4.78 [--fov 40] [--out bild.png]
//
// Die sechs Pruefkameras je Umgebung sind eingefroren, damit sich zwei Staende
// vergleichen lassen. Zum HINSEHEN taugen sie nur begrenzt: Wer wissen will,
// ob eine Naht an der Rueckseite eines Sessels schliesst, braucht eine Kamera
// dort — und darf dafuer den Vergleichsmassstab nicht verstellen. Dieses
// Werkzeug macht Bilder, die nichts messen und nichts festschreiben.
import path from 'node:path';
import { ROOT, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const wert = (name, vorgabe) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : vorgabe);
const zahlen = (s) => s.split(',').map(Number);
const ENV = envArg(argv, 'matrix');
const shot = {
  name: 'blick',
  pos: zahlen(wert('--pos', '2,1.2,-3')),
  look: zahlen(wert('--look', '0,0.6,-3.9')),
  fov: Number(wert('--fov', '45')),
};
const out = path.resolve(ROOT, wert('--out', 'tools/shots/blick.png'));

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await lockCamera(page, shot, Number(wert('--zeit', '6.0')));
  await page.waitForTimeout(450);
  await page.screenshot({ path: out });
  process.stdout.write(`${out}\n`);
} finally {
  await browser.close();
  await server.stop();
}
