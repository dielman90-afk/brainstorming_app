// **Was kostet die Aufhellung von unten an den Gegenstaenden, die oben stehen?**
//
//   node tools/aufhellung.mjs
//
// Die Insel hat zwei gerichtete Aufhellungen von unten (1,9 und 0,85). Sie sind
// fuer den KIEL gebaut, der ohne sie nach unten wegsackt, obwohl unter ihm nur
// heller Himmel steht. Sie treffen aber jeden Koerper der Szene, auch die
// Findlinge auf der Wiese — und dort kehren sie die Lesart um.
//
// Gemessen am Findling in `1-eyelevel`: Die nach oben weisende Facette
// (Normale 0,05 | 0,56 | 0,83) bekommt vom Bounce N·L = -0,32, also nichts;
// die seitlich-untere (-0,75 | -0,07 | 0,65) bekommt +0,47. Ergebnis: Die
// untere Facette steht bei L 133 und die obere bei L 103. Ein Stein, dessen
// Oberseite dunkler ist als seine Unterseite, liest als Papierfaltung.
//
// Beide Seiten muessen zusammen gemessen werden, sonst tauscht man den einen
// Fehler gegen den anderen:
//
//   * **Findling** — der Abstand obere minus untere Facette. Er soll positiv
//     werden (oben heller), ohne dass die Modellierung verschwindet.
//   * **Kiel** — Mittel und Spannweite in `3-edge-down`. Er darf nicht wieder
//     nach unten wegsacken.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

// Findling in 1-eyelevel: oben, seitlich-unten, sonnenzugewandt.
const STEIN = [
  ['oben', 856, 366],
  ['unten', 837, 391],
  ['Sonne', 870, 375],
];
const KIEL = [
  [380, 250, 900, 310],
  [380, 320, 900, 380],
  [380, 390, 900, 450],
];

const bild = async (page) => {
  await page.waitForTimeout(330);
  return PNG.sync.read(await page.screenshot());
};
const L = (p, x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};
const kasten = (p, K) => {
  const w = [];
  for (let y = K[1]; y <= K[3]; y++) for (let x = K[0]; x <= K[2]; x++) w.push(L(p, x, y));
  w.sort((a, b) => a - b);
  const m = w.reduce((a, b) => a + b, 0) / w.length;
  return [m, w[Math.floor(w.length * 0.95)] - w[Math.floor(w.length * 0.05)]];
};

// Die beiden Aufhellungen sind die gerichteten Lichter mit negativem y in der
// Position. So sind sie ohne Namen zu finden und ohne Reihenfolgeannahme.
const stelle = (page, faktor) =>
  page.evaluate((faktor) => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    let n = 0;
    g.traverse((o) => {
      if (!o.isDirectionalLight || o.position.y >= 0) return;
      if (o.userData.__aufAlt === undefined) o.userData.__aufAlt = o.intensity;
      o.intensity = o.userData.__aufAlt * faktor;
      n++;
    });
    return n;
  }, faktor);

// Die Hemisphaere der Insel ist oben und unten fast gleichfarbig
// (0xc6e2f4 gegen 0xbcd6ea) und damit praktisch richtungslos: Sie hellt auf,
// ohne eine Seite zu bevorzugen — sie kann also nichts umkehren. Wenn sie den
// Verlust am Kiel auffaengt, ist die Senkung der gerichteten Aufhellung kein
// Tausch, sondern ein Gewinn.
const himmel = (page, faktor) =>
  page.evaluate((faktor) => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    let n = 0;
    g.traverse((o) => {
      // Nicht die Kompensation des globalen Lichts (negative Staerke).
      if (!o.isHemisphereLight || o.intensity < 0) return;
      if (o.userData.__himAlt === undefined) o.userData.__himAlt = o.intensity;
      o.intensity = o.userData.__himAlt * faktor;
      n++;
    });
    return n;
  }, faktor);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  const messen = async (name, n) => {
    await lockCamera(page, shotsFor('island').find((s) => s.name === '1-eyelevel'), 6.0);
    const a = await bild(page);
    const werte = STEIN.map(([, x, y]) => L(a, x, y));
    await lockCamera(page, shotsFor('island').find((s) => s.name === '3-edge-down'), 6.0);
    const b = await bild(page);
    const k = KIEL.map((K) => kasten(b, K));
    process.stdout.write(
      `  ${name.padEnd(7)} (${n})  Findling oben ${werte[0].toFixed(1).padStart(5)}  unten ${werte[1].toFixed(1).padStart(5)}  Sonne ${werte[2].toFixed(1).padStart(5)}   ` +
        `oben-unten ${(werte[0] - werte[1]).toFixed(1).padStart(6)}   Kiel ` +
        k.map(([m, s]) => `${m.toFixed(0)}/${s.toFixed(0)}`).join('  ') +
        '\n'
    );
  };
  await lockCamera(page, shotsFor('island').find((s) => s.name === '1-eyelevel'), 6.0);
  await bild(page);
  process.stdout.write('Faktor auf beide Aufhellungen von unten (Kiel: Mittel/Spanne je Band):\n');
  for (const f of [1.0, 0.35]) {
    const n = await stelle(page, f);
    await messen(`Bounce x${f}`, n);
  }
  process.stdout.write('\nBounce x0,35, dazu die Hemisphaere angehoben:\n');
  for (const h of [1.15, 1.3, 1.45]) {
    await stelle(page, 0.35);
    const n = await himmel(page, h);
    await messen(`Himmel x${h}`, n);
  }
  await stelle(page, 1.0);
  await himmel(page, 1.0);
} finally {
  await browser.close();
  await server.stop();
}
