// **Wie viel Schlagschatten kommt im Bild an?**
//
//   node tools/schattenanteil.mjs [--env island]
//
// „Es gibt keine Schatten" ist eine Behauptung, die man nicht am Bild prüfen
// kann: Ein Schatten nimmt nur das **gerichtete** Licht weg, und was das
// Himmelslicht beisteuert, bleibt stehen. Ist das Himmelslicht stark genug, ist
// der Schatten eine Tönung und im Bild kaum zu finden.
//
// Gemessen wird deshalb der Unterschied zwischen zwei Aufnahmen derselben
// Kamera: einmal mit Schattenwurf, einmal ohne. Was dazwischen liegt, **ist**
// der Schatten — schwellenfrei und ohne Raterei, welches Pixel dazugehört.
//
// Ausgegeben werden je Bild: Anteil betroffener Bildpunkte, mittlerer und
// größter Abfall in Luminanzstufen. Ein Schatten, der 0,3 % der Fläche um zwei
// Stufen abdunkelt, ist keiner.
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'island');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  const setzeSchatten = (an) =>
    page.evaluate(
      ({ an, envId }) => {
        const g = window.__app.scene.children.find((c) => c.name === `env-${envId}`);
        if (!g) return 0;
        let n = 0;
        g.traverse((o) => {
          if (!o.isLight || !o.shadow) return;
          if (an) {
            if (o.userData.__warfSchatten) {
              o.castShadow = true;
              n++;
            }
          } else if (o.castShadow) {
            o.userData.__warfSchatten = true;
            o.castShadow = false;
            n++;
          }
        });
        return n;
      },
      { an, envId }
    );

  const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  console.log(`env-${envId}`);
  console.log('  Bild                Fläche mit Schatten   Abfall Mittel   Abfall größter');
  for (const shot of shotsFor(envId)) {
    await lockCamera(page, shot, 6.0);
    await setzeSchatten(true);
    await page.waitForTimeout(400);
    const mit = PNG.sync.read(await page.screenshot());
    const aus = await setzeSchatten(false);
    await page.waitForTimeout(400);
    const ohne = PNG.sync.read(await page.screenshot());
    await setzeSchatten(true);
    if (!aus) {
      console.log(`  ${shot.name.padEnd(18)} kein Licht mit Schattenkarte`);
      continue;
    }
    let n = 0;
    let summe = 0;
    let groesster = 0;
    for (let i = 0; i < mit.data.length; i += 4) {
      const d = L(ohne, i) - L(mit, i);
      if (d <= 1) continue;
      n++;
      summe += d;
      if (d > groesster) groesster = d;
    }
    const flaeche = mit.width * mit.height;
    console.log(
      `  ${shot.name.padEnd(18)} ${((n * 100) / flaeche).toFixed(2).padStart(17)} %   ${(summe / Math.max(1, n)).toFixed(1).padStart(13)}   ${groesster.toFixed(0).padStart(14)}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
