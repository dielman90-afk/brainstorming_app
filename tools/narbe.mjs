// **Wie fein darf die Ledernarbung sein?**
//
//   node tools/narbe.mjs [<shot>] [<x0,y0,x1,y1>]
//
// Die Narbung ist eine 128er-Kachel mit 60 Voronoi-Zellen, 14-fach gekachelt.
// Eine Zelle ist damit 8,9 mm gross — Rindsleder hat Poren unter einem
// Millimeter. Aus einem Meter Abstand liest das nicht als Leder, sondern als
// Reptilhaut, und die Kachel selbst wird als Ornament sichtbar.
//
// Feiner machen ist nicht umsonst: Was kleiner wird als ein Bildpunkt, wird zu
// Rauschen und kann beim Kopfdrehen kribbeln. Darum misst dieses Werkzeug beide
// Seiten in einem Lauf und faehrt dafuer `repeat` zur Laufzeit ab:
//
//   * **Kachel** — staerkste Periode der Autokorrelation ueber eine
//     hochpassgefilterte Zeile und ihre Staerke. Sichtbare Wiederholung.
//   * **Zittern** — mittlerer Sprung je Bildpunkt, wenn die Kamera in
//     1,5-mm-Schritten quer wandert. Kribbeln in der Brille.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0] ?? 'b-sessel';
const [X0, Y0, X1, Y1] = (argv[1] ?? '430,60,640,300').split(',').map(Number);
const WIEDERHOLUNGEN = [14, 20, 26, 34];
const SCHRITTE = [0, 0.0015, 0.003];

const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const stelle = (page, n) =>
  page.evaluate((n) => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-matrix');
    let zahl = 0;
    const gesehen = new Set();
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const karte of [m.normalMap, m.roughnessMap]) {
          if (!karte || gesehen.has(karte)) continue;
          gesehen.add(karte);
          karte.repeat.set(n, n);
          karte.needsUpdate = true;
          zahl++;
        }
      }
    });
    return zahl;
  }, n);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'matrix');
  const shot = shotsFor('matrix').find((s) => s.name === shotName);
  const d = [shot.look[0] - shot.pos[0], 0, shot.look[2] - shot.pos[2]];
  const quer = [d[2], 0, -d[0]];
  const len = Math.hypot(quer[0], quer[2]) || 1;
  quer[0] /= len;
  quer[2] /= len;

  process.stdout.write(
    `${shotName}  Kasten ${X0},${Y0}-${X1},${Y1}\n` +
      `${'repeat'.padStart(7)}${'Periode'.padStart(9)}${'Staerke'.padStart(9)}${'Streuung'.padStart(10)}${'Zittern'.padStart(9)}\n`
  );

  for (const n of WIEDERHOLUNGEN) {
    const bilder = [];
    for (const sch of SCHRITTE) {
      await lockCamera(page, { ...shot, pos: [shot.pos[0] + quer[0] * sch, shot.pos[1], shot.pos[2] + quer[2] * sch] }, 6.0);
      await stelle(page, n);
      await page.waitForTimeout(340);
      bilder.push(PNG.sync.read(await page.screenshot()));
    }
    const bild = bilder[0];
    const breite = X1 - X0 + 1;
    // Autokorrelation
    const summe = new Float64Array(161);
    const gew = new Float64Array(161);
    for (let y = Y0; y <= Y1; y++) {
      const hp = new Float64Array(breite);
      for (let k = 2; k < breite - 2; k++) {
        let m = 0;
        for (let dd = -2; dd <= 2; dd++) m += L(bild, (y * bild.width + X0 + k + dd) * 4);
        hp[k] = L(bild, (y * bild.width + X0 + k) * 4) - m / 5;
      }
      let energie = 0;
      for (let k = 2; k < breite - 2; k++) energie += hp[k] * hp[k];
      if (energie < 1) continue;
      for (let v = 8; v <= 160 && v < breite - 6; v++) {
        let s = 0;
        for (let k = 2; k < breite - 2 - v; k++) s += hp[k] * hp[k + v];
        summe[v] += s / energie;
        gew[v] += 1;
      }
    }
    const werte = [];
    for (let v = 8; v <= 160; v++) if (gew[v]) werte.push([summe[v] / gew[v], v]);
    werte.sort((a, b) => b[0] - a[0]);
    // Zittern und Streuung
    const vals = [];
    let zit = 0;
    let zahl = 0;
    for (let y = Y0; y <= Y1; y++)
      for (let x = X0; x <= X1; x++) {
        const i = (y * bild.width + x) * 4;
        vals.push(L(bild, i));
        for (let k = 1; k < bilder.length; k++) {
          zit += Math.abs(L(bilder[k], i) - L(bilder[k - 1], i));
          zahl++;
        }
      }
    const mit = vals.reduce((a, b) => a + b, 0) / vals.length;
    const streu = Math.sqrt(vals.reduce((a, v) => a + (v - mit) ** 2, 0) / vals.length);
    process.stdout.write(
      `${String(n).padStart(7)}${String(werte[0][1]).padStart(9)}${werte[0][0].toFixed(3).padStart(9)}` +
        `${streu.toFixed(1).padStart(10)}${(zit / Math.max(1, zahl)).toFixed(2).padStart(9)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
