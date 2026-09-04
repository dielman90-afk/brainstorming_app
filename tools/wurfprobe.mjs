// **Wieviel Schatten wirft jeder Werfer wirklich — und wohin?**
//
//   node tools/wurfprobe.mjs [<shot>] [<x0> <y0> <x1> <y1>]
//
// Nicht „wirft der Knoten Schatten?" (das steht im Quelltext), sondern „wieviel
// dunkler wird dieser Bildbereich dadurch?". Gemessen wird differenziell: Der
// Knoten bleibt sichtbar, nur sein `castShadow` wird abgeschaltet. Die
// Differenz IST sein Schlagschatten — ohne Schwelle und ohne dass der Knoten
// selbst aus dem Bild verschwindet.
//
// Gemeldet wird zusaetzlich die Flaeche: Ein Werfer, der 40 Stufen auf drei
// Promille der Bildpunkte legt, ist etwas anderes als einer, der 5 Stufen auf
// ein Viertel legt.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0] ?? '4-aerial';
const K = argv.length >= 5 ? argv.slice(1, 5).map(Number) : [330, 230, 900, 460];

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot());
};
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
const mittel = (p) => {
  let s = 0;
  let n = 0;
  for (let y = K[1]; y <= K[3]; y++)
    for (let x = K[0]; x <= K[2]; x++) {
      s += L(p, (y * p.width + x) * 4);
      n++;
    }
  return s / n;
};
// Anteil der Bildpunkte, die sich um mindestens 4 Stufen aufhellen, und wie
// stark im Mittel — das ist die Flaeche des Schlagschattens und seine Tiefe.
const wirkung = (mit, ohne) => {
  let n = 0;
  let summe = 0;
  let ges = 0;
  for (let y = K[1]; y <= K[3]; y++)
    for (let x = K[0]; x <= K[2]; x++) {
      const i = (y * mit.width + x) * 4;
      const d = L(ohne, i) - L(mit, i);
      ges++;
      if (d >= 4) {
        n++;
        summe += d;
      }
    }
  return [(n * 100) / ges, n ? summe / n : 0];
};

const werferSchalter = (page, name, an) =>
  page.evaluate(
    ({ name, an }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let n = 0;
      g.traverse((o) => {
        if (o.isMesh && (name === null || o.name === name) && o.userData.__warWerfer !== undefined) {
          o.castShadow = an ? o.userData.__warWerfer : false;
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
  const werfer = await page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    const z = {};
    g.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      o.userData.__warWerfer = true;
      const k = o.name || '(ohne Namen)';
      z[k] = (z[k] || 0) + 1;
    });
    return z;
  });
  const mit = await bild(page);
  process.stdout.write(
    `${shotName}, Kasten ${K.join(',')} — mit allen Schatten Mittel ${mittel(mit).toFixed(1)}\n\n` +
      `${'Werfer'.padEnd(20)}${'Flaeche'.padStart(9)}${'Tiefe'.padStart(8)}${'Mittel ohne'.padStart(13)}\n`
  );
  for (const name of [...Object.keys(werfer), null]) {
    await werferSchalter(page, name, false);
    const ohne = await bild(page);
    await werferSchalter(page, null, true);
    const [flaeche, tiefe] = wirkung(mit, ohne);
    // **Die Schattenschicht als Bild.** „Schatten ohne Form" ist eine Aussage
    // ueber Gestalt, und die entscheidet kein Mittelwert. Die Differenz wird
    // als Graubild ausgegeben, invertiert: schwarz = tiefer Schatten.
    if (name === null) {
      const aus = new PNG({ width: mit.width, height: mit.height });
      for (let i = 0; i < mit.width * mit.height; i++) {
        const j = i * 4;
        const d = Math.max(0, Math.min(255, (L(ohne, j) - L(mit, j)) * 4));
        aus.data[j] = aus.data[j + 1] = aus.data[j + 2] = 255 - d;
        aus.data[j + 3] = 255;
      }
      fs.writeFileSync('/tmp/schattenschicht.png', PNG.sync.write(aus));
    }
    process.stdout.write(
      `${(name ?? 'ALLE zusammen').padEnd(20)}${flaeche.toFixed(2).padStart(8)}%${tiefe.toFixed(1).padStart(8)}${mittel(ohne).toFixed(1).padStart(13)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
