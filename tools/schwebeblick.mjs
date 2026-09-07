// **Sieht man von der Insel aus, dass sie fliegt?**
//
//   node tools/schwebeblick.mjs [--richtungen 16] [--hoehe 1.6] [--bilder <ordner>]
//
// Der Pruefer: „Auf Augenhoehe verraet nichts, dass die Insel fliegt." Das ist
// eine Aussage ueber die Umgebung, nicht ueber eine Kamera — die sechs
// Pruefbilder zeigen sechs Richtungen, der Nutzer dreht sich um alle.
//
// Gemessen wird deshalb ein Rundblick auf Augenhoehe, und je Richtung drei
// Zahlen:
//
//   * **Himmel in der unteren Bildhaelfte.** Die Kamera blickt waagerecht;
//     unterhalb der Bildmitte liegt damit alles, was tiefer steht als das Auge.
//     Auf einer normalen Landschaft ist dort **kein** Himmel — auf einer
//     fliegenden Insel sieht man dort an der Kante vorbei ins Leere.
//
//     **Der erste Anlauf hat hier falsch gezaehlt.** Er nahm je Spalte den
//     obersten Bodenpunkt als Horizont und zaehlte allen Himmel darunter. Ein
//     Baum am Bildrand setzt diesen „Horizont" damit an seine Krone, und der
//     ganze Himmel neben dem Stamm galt als Blick ins Leere — gemessen 3 bis
//     13 Prozent in jeder Richtung, also „alles verraet das Fliegen", was
//     offensichtlich Unsinn ist. Die untere Bildhaelfte kennt dieses Problem
//     nicht: Dort steht von der Inselmitte aus kein Laub.
//   * **Fremde Inseln.** Bildpunkte, die zu einem anderen Inselkoerper gehoeren
//     als dem, auf dem man steht — gemessen ueber die Tiefe: alles jenseits von
//     40 m ist nicht mehr die eigene Insel.
//   * **Wolken unter der Kammlinie.** Eine Wolke, die tiefer steht als der
//     Horizont, sagt dasselbe wie die Kante, nur weicher.
//
// Eine Richtung „verraet das Fliegen", wenn eine der drei Zahlen ueber ihrer
// Schwelle liegt. Gemeldet wird der Anteil solcher Richtungen.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const wert = (n, v) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : v);
const N = +wert('--richtungen', 16);
const HOEHE = +wert('--hoehe', 1.6);
const ordner = argv.includes('--bilder') ? path.resolve(ROOT, wert('--bilder', '')) : null;
if (ordner) fs.mkdirSync(ordner, { recursive: true });

const istHimmel = (p, i) => {
  const r = p.data[i];
  const g = p.data[i + 1];
  const b = p.data[i + 2];
  return b > r + 16 && b > 110 && g > r;
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  process.stdout.write(
    `Rundblick auf ${HOEHE.toFixed(2)} m, ${N} Richtungen\n\n` +
      `${'Richtung'.padStart(9)}${'Himmel unten'.padStart(15)}${'Wolke unten'.padStart(14)}${'verraet'.padStart(9)}\n`
  );
  let verraten = 0;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const shot = {
      name: `rund-${i}`,
      pos: [0, HOEHE, 0],
      look: [Math.sin(a) * 60, HOEHE - 3, Math.cos(a) * 60],
      fov: 70,
    };
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(320);
    const p = PNG.sync.read(await page.screenshot());
    if (ordner) fs.writeFileSync(path.join(ordner, `rund-${String(i).padStart(2, '0')}.png`), PNG.sync.write(p));
    let unterHorizont = 0;
    let wolkeTief = 0;
    const mitte = p.height >> 1;
    for (let x = 0; x < p.width; x++) {
      for (let y = mitte; y < p.height; y++) {
        const j = (y * p.width + x) * 4;
        if (istHimmel(p, j)) unterHorizont++;
        else {
          const r = p.data[j];
          const g = p.data[j + 1];
          const b = p.data[j + 2];
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          if (mx > 195 && mx - mn < 30) wolkeTief++;
        }
      }
    }
    const ges = p.width * mitte;
    const aH = (unterHorizont * 100) / ges;
    const aW = (wolkeTief * 100) / ges;
    const ja = aH > 0.15 || aW > 0.15;
    if (ja) verraten++;
    process.stdout.write(
      `${String(Math.round((a * 180) / Math.PI)).padStart(7)}°${aH.toFixed(3).padStart(14)}%${aW.toFixed(3).padStart(13)}%${(ja ? 'ja' : 'nein').padStart(9)}\n`
    );
  }
  process.stdout.write(`\n${verraten} von ${N} Richtungen verraten das Fliegen (${((verraten * 100) / N).toFixed(0)} %)\n`);
} finally {
  await browser.close();
  await server.stop();
}
