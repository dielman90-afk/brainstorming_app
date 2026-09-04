// **Wie hell darf das Laub werden, ohne seine Silhouette zu verlieren?**
//
//   node tools/laubton.mjs
//
// Befund des Pruefers: Die Szene zerfaellt in zwei Helligkeitsplateaus. Alles
// Vegetative liegt unten, der Boden oben, und sie ueberlappen nicht. Auf den
// eigenen Bildpunkten des Laubes gemessen (`tools/knotenwerte.mjs`, also ohne
// den Himmel im Kasten): Mittel 58,7, p95 122, **0,0 % ueber L 190**, waehrend
// die Wiese daneben bei 172 steht.
//
// Es ist nicht der Schatten — ohne jeden Schlagschatten wird das Laub sogar
// dunkler (56,2). Es ist die Albedo der Blattkarten.
//
// Zwei Groessen, die gegeneinander laufen und deshalb zusammen gemessen werden
// muessen:
//
//   * **Helligkeit auf den Laubpixeln** — was der Befund verlangt.
//   * **Silhouettensprung** gegen den Himmel — was helleres Laub verliert. Ein
//     Baum, der so hell wird wie der Himmel, hat keine Kontur mehr.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const KANTE = [950, 150, 1250, 450]; // Konifere gegen Himmel in 5-backlight
const bild = async (page) => {
  await page.waitForTimeout(340);
  return PNG.sync.read(await page.screenshot());
};
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

// Faktor auf die Grundfarbe der beiden Blattwerkstoffe. Der Ausgangswert wird
// beim ersten Antreffen gesichert, damit der Lauf nicht kumulativ wird.
const stelle = (page, faktor) =>
  page.evaluate((faktor) => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    const gesehen = new Set();
    let n = 0;
    g.traverse((o) => {
      for (const m of o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []) {
        if (!m.userData?.foliage || gesehen.has(m)) continue;
        gesehen.add(m);
        if (!m.userData.__tonAlt) m.userData.__tonAlt = m.color.clone();
        m.color.copy(m.userData.__tonAlt).multiplyScalar(faktor);
        n++;
      }
    });
    return n;
  }, faktor);

const sichtbar = (page, name, an) =>
  page.evaluate(
    ({ name, an }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      g.traverse((o) => {
        if (o.name === name) o.visible = an;
      });
    },
    { name, an }
  );

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');

  const messen = async (name, n) => {
    // 1-eyelevel: Helligkeit auf den eigenen Punkten des Laubes.
    await lockCamera(page, shotsFor('island').find((s) => s.name === '1-eyelevel'), 6.0);
    const voll = await bild(page);
    await sichtbar(page, 'island-laub', false);
    const ohne = await bild(page);
    await sichtbar(page, 'island-laub', true);
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
    werte.sort((a, b) => a - b);
    const q = (f) => werte[Math.min(werte.length - 1, Math.floor(werte.length * f))];
    const mittel = werte.reduce((a, b) => a + b, 0) / werte.length;
    const ueber = (s) => (werte.filter((v) => v > s).length * 100) / werte.length;

    // 5-backlight: Silhouettensprung der Konifere gegen den Himmel.
    await lockCamera(page, shotsFor('island').find((s) => s.name === '5-backlight'), 6.0);
    const b = await bild(page);
    const istLaub = (x, y) => {
      const i = (y * b.width + x) * 4;
      return !(b.data[i + 2] > b.data[i] + 18 && L(b, i) > 120);
    };
    let summe = 0;
    let kanten = 0;
    for (let y = KANTE[1]; y <= KANTE[3]; y++)
      for (let x = KANTE[0]; x < KANTE[2]; x++)
        if (istLaub(x, y) !== istLaub(x + 1, y)) {
          summe += Math.abs(L(b, (y * b.width + x) * 4) - L(b, (y * b.width + x + 1) * 4));
          kanten++;
        }
    process.stdout.write(
      `  ${name.padEnd(8)} (${n} Werkst.)  Laub Mittel ${mittel.toFixed(1).padStart(5)}  p95 ${q(0.95).toFixed(0).padStart(3)}  >150 ${(ueber(150).toFixed(1) + '%').padStart(6)}  >190 ${(ueber(190).toFixed(1) + '%').padStart(6)}   Silhouette ${(summe / Math.max(1, kanten)).toFixed(1).padStart(5)} (${kanten})\n`
    );
  };

  await lockCamera(page, shotsFor('island').find((s) => s.name === '1-eyelevel'), 6.0);
  await bild(page); // erst nach dem ersten Bild sind die Werkstoffe erreichbar
  for (const f of [1.0, 1.3, 1.6, 2.0, 2.5]) {
    const n = await stelle(page, f);
    await messen(`x${f}`, n);
  }
  await stelle(page, 1.0);
} finally {
  await browser.close();
  await server.stop();
}
