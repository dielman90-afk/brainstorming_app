// **Sieht man die Hüllkörper überhaupt?**
//
//   node tools/huellenprobe.mjs
//
// Kronen und Büsche bestehen aus zwei Lagen: einer Kartenschale, die schwingt
// (`foliageMaterial` bringt den Wind mit), und einem Hüllkörper darin, der
// stillsteht — `addWind` wird auf der Insel genau einmal aufgerufen, naemlich
// fuer die Blumen. Die Frage ist nicht, ob das stimmt (es steht im Quelltext),
// sondern ob es sich SIEHT: Der Huellkoerper sitzt als Verdecker innerhalb der
// Schale, und was niemand sieht, braucht keinen Shader.
//
// Gemessen wird differenziell: einmal mit, einmal ohne den Knoten. Die
// geaenderten Bildpunkte SIND sein Beitrag — ohne Schwelle, ohne Annahme.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const TEILE = ['island-krone', 'bushes', 'island-laub', 'bush-leaves'];

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

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot());
};

// Anteil der Bildpunkte, die sich unterscheiden, und wie stark im Mittel.
const beitrag = (a, b) => {
  let n = 0;
  let summe = 0;
  for (let i = 0; i < a.width * a.height; i++) {
    const p = i * 4;
    const d = Math.max(
      Math.abs(a.data[p] - b.data[p]),
      Math.abs(a.data[p + 1] - b.data[p + 1]),
      Math.abs(a.data[p + 2] - b.data[p + 2])
    );
    if (d >= 3) {
      n++;
      summe += d;
    }
  }
  return [(n / (a.width * a.height)) * 100, n ? summe / n : 0];
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  for (const shot of shotsFor('island')) {
    await lockCamera(page, shot, 6.0);
    const voll = await bild(page);
    process.stdout.write(`${shot.name}\n`);
    for (const teil of TEILE) {
      const n = await sichtbar(page, teil, false);
      const ohne = await bild(page);
      await sichtbar(page, teil, true);
      const [anteil, staerke] = beitrag(voll, ohne);
      process.stdout.write(
        `  ${teil.padEnd(14)} ${String(n).padStart(2)} Knoten   sichtbar auf ${anteil.toFixed(3).padStart(7)} % der Flaeche   mittlere Aenderung ${staerke.toFixed(1).padStart(5)}\n`
      );
    }
  }
} finally {
  await browser.close();
  await server.stop();
}
