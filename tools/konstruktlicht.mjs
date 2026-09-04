// **Wie hell darf die Sitzgruppe werden?**
//
//   node tools/konstruktlicht.mjs
//
// Befund: Der Sessel liest als schwarzer Ausschnitt vor Weiss. Auf seinen
// eigenen Bildpunkten gemessen liegt der Median bei 16 bis 30, waehrend der
// Hintergrund bei 226 steht; 77 % der Sesselflaeche liegen unter L 40. Er war
// schon vor dem Schattenpaket so — 25,3 gegen 24,1 in der Knopftafel.
//
// Der Hebel ist hier ungewoehnlich sauber: Boden und Kuppel sind
// UNBELEUCHTETE Materialien (`MeshBasicMaterial` und ein eigener Shader). Licht
// trifft in dieser Umgebung ausschliesslich die Moebel. Man kann die Beleuchtung
// also anheben, ohne dass die weisse Leere sich um eine Stufe aendert — was in
// jeder anderen Umgebung des Projekts undenkbar waere.
//
// Gemessen werden zwei Dinge, die gegeneinander laufen:
//
//   * **Tonlage des Sessels** — Median und Anteil unter L 40 auf seinen eigenen
//     Bildpunkten (Maske aus Ein- und Ausblenden, kein Rechteck).
//   * **Modellierung** — die Spanne p05 bis p95 auf denselben Punkten. Ein
//     Sessel, der gleichmaessig heller wird, hat nichts gewonnen.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const KNOTEN = ['construct-armchairs', 'construct-armchairs-1', 'construct-armchairs-2'];
const bild = async (page) => {
  await page.waitForTimeout(330);
  return PNG.sync.read(await page.screenshot());
};
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const sicht = (page, an) =>
  page.evaluate(
    ({ an, namen }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-matrix');
      g.traverse((o) => {
        if (namen.includes(o.name)) o.visible = an;
      });
    },
    { an, namen: KNOTEN }
  );

// Hemisphaere und Fuehrungslicht getrennt: Die eine hebt die Schattenseite, das
// andere die Modellierung.
const stelle = (page, hemi, key) =>
  page.evaluate(
    ({ hemi, key }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-matrix');
      g.traverse((o) => {
        if (o.userData.__alt === undefined && o.isLight) o.userData.__alt = o.intensity;
        if (o.isHemisphereLight) o.intensity = o.userData.__alt * hemi;
        else if (o.isDirectionalLight && o.castShadow) o.intensity = o.userData.__alt * key;
      });
    },
    { hemi, key }
  );

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'matrix');
  await lockCamera(page, shotsFor('matrix').find((s) => s.name === 'b-sessel'), 6.0);

  const messen = async (name) => {
    const voll = await bild(page);
    await sicht(page, false);
    const ohne = await bild(page);
    await sicht(page, true);
    const w = [];
    for (let i = 0; i < voll.width * voll.height; i++) {
      const j = i * 4;
      const d = Math.max(
        Math.abs(voll.data[j] - ohne.data[j]),
        Math.abs(voll.data[j + 1] - ohne.data[j + 1]),
        Math.abs(voll.data[j + 2] - ohne.data[j + 2])
      );
      if (d >= 3) w.push(L(voll, j));
    }
    w.sort((a, b) => a - b);
    const q = (f) => w[Math.min(w.length - 1, Math.floor(w.length * f))];
    const unter40 = (w.filter((v) => v < 40).length * 100) / w.length;
    process.stdout.write(
      `  ${name.padEnd(20)} Median ${q(0.5).toFixed(0).padStart(4)}   p05 ${q(0.05).toFixed(0).padStart(3)}   p95 ${q(0.95).toFixed(0).padStart(4)}   Spanne ${(q(0.95) - q(0.05)).toFixed(0).padStart(4)}   unter L40 ${unter40.toFixed(1).padStart(5)} %\n`
    );
  };

  await bild(page);
  for (const [h, k] of [
    [1.0, 1.0],
    [1.5, 1.0],
    [2.0, 1.0],
    [2.0, 1.4],
    [2.6, 1.4],
    [3.2, 1.6],
  ]) {
    await stelle(page, h, k);
    await messen(`Hemi x${h} Key x${k}`);
  }
  await stelle(page, 1.0, 1.0);
} finally {
  await browser.close();
  await server.stop();
}
