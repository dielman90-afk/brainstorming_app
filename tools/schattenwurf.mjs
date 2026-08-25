// **Wie viel Schatten kommt im Bild an?**
//
// Der Prüfer: „Es gibt keine Schlagschatten. Um den großen Stein in `rund-000`
// misst der Boden 5 bis 10 % Abfall ohne erkennbare Form. Bei einem Mond auf
// 29,9 Grad und ohne Atmosphäre gehört dort ein harter, langer, schwarz
// berandeter Schatten hin."
//
// Die Frage ist nicht „gibt es Schatten" — die Schattenkarte läuft, die
// Nachtseite entsteht aus ihr. Die Frage ist, **wie viel sie im Bild ausmacht**,
// und das ist ein Verhältnis: Ein Schatten nimmt nur das gerichtete Licht weg.
// Was das Himmelslicht beisteuert, bleibt stehen. Ist das Himmelslicht stark
// genug, ist der Schatten eine Tönung.
//
// Gemessen wird deshalb der Unterschied zwischen zwei Bildern derselben Kamera:
// einmal mit Schattenwurf, einmal ohne. Was dazwischen liegt, **ist** der
// Schatten — schwellenfrei und ohne Raterei, welches Pixel dazugehört.
//
//   node tools/schattenwurf.mjs [--himmel <staerke>] [--mond <staerke>]
//
// Mit den beiden Schaltern lässt sich das Verhältnis der Quellen verstellen,
// ohne die Datei anzufassen — dafür ist dieses Werkzeug gebaut.
import { PNG } from 'pngjs';
import {
  PLANET_SHOTS,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
} from './harness-common.mjs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? +process.argv[i + 1] : null;
};
const himmelStaerke = arg('--himmel');
const mondStaerke = arg('--mond');

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  if (himmelStaerke !== null || mondStaerke !== null) {
    await page.evaluate(
      ({ h, m }) => {
        const g = window.__app.scene.children.find((c) => c.name === 'env-night');
        g.traverse((o) => {
          if (o.isHemisphereLight && h !== null) o.intensity = h;
          if (o.isDirectionalLight && m !== null) o.intensity = m;
        });
      },
      { h: himmelStaerke, m: mondStaerke }
    );
  }
  const schalte = (an) =>
    page.evaluate((an) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-night');
      g.traverse((o) => {
        if (o.isDirectionalLight) o.castShadow = an;
      });
    }, an);

  console.log(
    `Himmel ${himmelStaerke ?? '(Stand)'}   Mond ${mondStaerke ?? '(Stand)'}\n` +
      'Kamera         Bildmittel   Schattenfläche   mittlerer Abfall   größter Abfall'
  );
  let summeFlaeche = 0;
  let summeMax = 0;
  for (const shot of PLANET_SHOTS) {
    if (shot.name === 'b-mond' || shot.name === 'h-mond-rot') continue; // kein Boden im Bild
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(300);
    await schalte(true);
    await page.waitForTimeout(260);
    const A = PNG.sync.read(await page.screenshot());
    await schalte(false);
    await page.waitForTimeout(260);
    const B = PNG.sync.read(await page.screenshot());
    await schalte(true);

    const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let n = 0;
    let summe = 0;
    let max = 0;
    let mittelA = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const a = L(A.data, i);
      const b = L(B.data, i);
      mittelA += a;
      const ab = b - a; // ohne Schatten heller
      if (ab > 2) {
        n++;
        summe += ab;
        if (ab > max) max = ab;
      }
    }
    const px = A.width * A.height;
    summeFlaeche += (100 * n) / px;
    summeMax += max;
    console.log(
      `${shot.name.padEnd(14)} ${(mittelA / px).toFixed(1).padStart(9)}   ` +
        `${((100 * n) / px).toFixed(2).padStart(12)} %   ` +
        `${(summe / Math.max(1, n)).toFixed(1).padStart(14)}   ${max.toFixed(0).padStart(13)}`
    );
  }
  console.log(
    `\nMittel über sechs Kameras: Fläche ${(summeFlaeche / 6).toFixed(2)} %, größter Abfall ${(summeMax / 6).toFixed(0)}`
  );
} finally {
  await browser.close();
  await server.stop();
}
