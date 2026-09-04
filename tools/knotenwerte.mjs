// **Helligkeitsverteilung auf den eigenen Bildpunkten eines Knotens.**
//
//   node tools/knotenwerte.mjs <shot> <knoten> [<knoten> ...]
//
// Ein Rechteck um eine Baumkrone enthaelt immer auch Himmel, und der Himmel
// ist das Hellste im Bild. Wer so misst, ob Laub Sonnenlicht abbekommt, misst
// den Himmel — genau daran ist der Befund „kein Sonnenlicht auf Laub"
// gescheitert (Kasten ueber die ganze Krone: 25,4 % ueber L 190; davon gehoert
// fast alles dem Himmel dahinter).
//
// Deshalb differenziell: Der Knoten wird einmal aus- und einmal eingeblendet,
// und die geaenderten Bildpunkte SIND seine Flaeche. Innerhalb dieser Maske
// wird dann die Verteilung gemessen — ohne Schwelle, ohne Rechteck, ohne
// Himmel.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
// `--ohne-werfer` schaltet vorher alle Schlagschatten ab. Damit laesst sich
// trennen, ob eine Flaeche dunkel ist, weil sie im Schatten liegt, oder weil
// ihr Werkstoff so dunkel ist.
const OHNE_WERFER = argv.includes('--ohne-werfer');
const MASKE = argv.includes('--maske');
const rest = argv.filter((a) => a !== '--ohne-werfer' && a !== '--maske');
const shotName = rest[0] ?? '1-eyelevel';
const KNOTEN = rest.slice(1);
if (!KNOTEN.length) {
  process.stderr.write('Kein Knoten angegeben.\n');
  process.exit(1);
}

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot());
};
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const sichtbar = (page, name, an) =>
  page.evaluate(
    ({ name, an }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let n = 0;
      g.traverse((o) => {
        if (o.name === name) {
          o.visible = an;
          n++;
        }
      });
      return n;
    },
    { name, an }
  );

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await lockCamera(page, shotsFor('island').find((s) => s.name === shotName), 6.0);
  if (OHNE_WERFER) {
    await page.evaluate(() => {
      window.__app.scene.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
    });
  }
  const voll = await bild(page);
  process.stdout.write(
    `${shotName}${OHNE_WERFER ? '  (ohne alle Schlagschatten)' : ''}\n${'Knoten'.padEnd(16)}${'Punkte'.padStart(8)}${'Mittel'.padStart(8)}${'p05'.padStart(6)}${'p50'.padStart(6)}${'p95'.padStart(6)}${'max'.padStart(6)}${'>190'.padStart(8)}${'>150'.padStart(8)}\n`
  );
  for (const name of KNOTEN) {
    const n = await sichtbar(page, name, false);
    const ohne = await bild(page);
    await sichtbar(page, name, true);
    const werte = [];
    for (let i = 0; i < voll.width * voll.height; i++) {
      const j = i * 4;
      const d = Math.max(
        Math.abs(voll.data[j] - ohne.data[j]),
        Math.abs(voll.data[j + 1] - ohne.data[j + 1]),
        Math.abs(voll.data[j + 2] - ohne.data[j + 2])
      );
      if (d >= 3) werte.push(L(voll, j));
    }
    // **Die Maske als Bild.** Zahlen sagen, WIE VIEL ein Knoten beitraegt,
    // nicht WO. Bei einer Kontaktverdunklung ist genau das die Frage: Sitzt
    // der Fleck unter dem Gegenstand oder irgendwo daneben?
    if (MASKE) {
      const aus = new PNG({ width: voll.width, height: voll.height });
      for (let i = 0; i < voll.width * voll.height; i++) {
        const j = i * 4;
        const d = Math.max(
          Math.abs(voll.data[j] - ohne.data[j]),
          Math.abs(voll.data[j + 1] - ohne.data[j + 1]),
          Math.abs(voll.data[j + 2] - ohne.data[j + 2])
        );
        const hell = Math.min(255, d * 12);
        aus.data[j] = aus.data[j + 1] = aus.data[j + 2] = 255 - hell;
        aus.data[j + 3] = 255;
      }
      fs.writeFileSync(`/tmp/maske-${name}.png`, PNG.sync.write(aus));
      process.stdout.write(`  -> /tmp/maske-${name}.png\n`);
    }
    if (!werte.length) {
      process.stdout.write(`${name.padEnd(16)}  (nicht im Bild, ${n} Knoten)\n`);
      continue;
    }
    werte.sort((a, b) => a - b);
    const q = (f) => werte[Math.min(werte.length - 1, Math.floor(werte.length * f))];
    const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;
    const anteil = (s) => (werte.filter((v) => v > s).length * 100) / werte.length;
    process.stdout.write(
      `${name.padEnd(16)}${String(werte.length).padStart(8)}${mittel.toFixed(1).padStart(8)}${q(0.05).toFixed(0).padStart(6)}${q(0.5).toFixed(0).padStart(6)}${q(0.95).toFixed(0).padStart(6)}${werte[werte.length - 1].toFixed(0).padStart(6)}${(anteil(190).toFixed(1) + '%').padStart(8)}${(anteil(150).toFixed(1) + '%').padStart(8)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
