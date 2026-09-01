// **Wie viel Bild macht der Sturz aus?**
//
//   node tools/sturzprobe.mjs [--knoten waterfall-sheet]
//
// Ein Kasten um den Sturz zu legen und gegen den Himmel zu messen klingt
// einfach und ist es nicht: In `4-aerial` steht die Felswand im selben Kasten,
// und ihre 140 Stufen Abstand zum Himmel ueberdecken alles, was der Sturz tut.
// Mein erster Anlauf hat daraus „Ausschlag Mittel 74,1" gemacht — gemessen war
// der Fels.
//
// Also differentiell, wie beim Schattenanteil: Der Knoten wird unsichtbar
// geschaltet, und was sich zwischen den beiden Aufnahmen aendert, **ist** er.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const knoten = argv.includes('--knoten') ? argv[argv.indexOf('--knoten') + 1] : 'waterfall-sheet';
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await ladeThree(page);
  const zeige = (an) =>
    page.evaluate(
      ({ an, knoten }) => {
        const o = window.__app.scene.getObjectByName(knoten);
        if (!o) return false;
        o.visible = an;
        return true;
      },
      { an, knoten }
    );
  const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  console.log(`Knoten "${knoten}"`);
  console.log('  Bild                Flaeche   Ausschlag Mittel   groesster');
  for (const shot of shotsFor('island')) {
    await lockCamera(page, shot, 6.0);
    await zeige(true);
    await page.waitForTimeout(350);
    const mit = PNG.sync.read(await page.screenshot());
    const da = await zeige(false);
    await page.waitForTimeout(350);
    const ohne = PNG.sync.read(await page.screenshot());
    await zeige(true);
    if (!da) {
      console.log(`  ${shot.name.padEnd(18)} Knoten fehlt`);
      continue;
    }
    let n = 0;
    let summe = 0;
    let groesster = 0;
    for (let i = 0; i < mit.data.length; i += 4) {
      const d = Math.abs(L(mit, i) - L(ohne, i));
      if (d <= 1) continue;
      n++;
      summe += d;
      if (d > groesster) groesster = d;
    }
    console.log(
      `  ${shot.name.padEnd(18)} ${String(n).padStart(6)} px   ${(summe / Math.max(1, n)).toFixed(1).padStart(16)}   ${groesster.toFixed(0).padStart(9)}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
