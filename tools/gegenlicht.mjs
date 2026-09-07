// **Wirkt die Transluzenz im Gegenlicht — und wirkt sie in der richtigen
// Richtung?**
//
//   node tools/gegenlicht.mjs [<shot>] [<x0,y0,x1,y1>]
//
// Der Pruefer meldet, das Gegenlichtbild sei vom Vorderlichtbild nicht zu
// unterscheiden. Die Frage dahinter ist nicht „ist die Szene hell genug", sondern
// „traegt der Blickterm des Laubs ueberhaupt bei". Gemessen wird deshalb
// differenziell: `uTranslucency` wird auf 0, auf den Stand und auf das
// Dreifache gesetzt; die Differenz IST der Beitrag.
//
// Dazu wird der Blickterm selbst ausgelesen — der Skalarprodukt zwischen
// Blickrichtung und Lichtrichtung, wie ihn der Shader sieht. Steht er auf null,
// laeuft der Effekt auf seinem Sockel, egal wie gross die Staerke ist.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0] ?? '5-backlight';
const K = argv[1] ? argv[1].split(',').map(Number) : [880, 40, 1270, 520];

const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await ladeThree(page);
  const shot = shotsFor('island').find((s) => s.name === shotName);
  await lockCamera(page, shot, 6.0);

  const blick = await page.evaluate(() => {
    const T = window.__THREE;
    const { camera, scene } = window.__app;
    const g = scene.children.find((c) => c.name === 'env-island');
    let licht = null;
    g.traverse((o) => {
      if (o.isDirectionalLight && !licht) licht = o;
    });
    const zurSonne = new T.Vector3()
      .copy(licht.getWorldPosition(new T.Vector3()))
      .sub(licht.target.getWorldPosition(new T.Vector3()))
      .normalize();
    const blickAchse = new T.Vector3();
    camera.getWorldDirection(blickAchse);
    // geometryViewDir zeigt VOM Fragment ZUR Kamera, also entgegen der
    // Blickachse. Genau dieses Skalarprodukt steht im Shader.
    const zurKamera = blickAchse.clone().negate();
    return {
      zurSonne: zurSonne.toArray().map((v) => +v.toFixed(3)),
      blickAchse: blickAchse.toArray().map((v) => +v.toFixed(3)),
      punktViewDir: +zurKamera.dot(zurSonne).toFixed(3),
      punktBlickInSonne: +blickAchse.dot(zurSonne).toFixed(3),
    };
  });

  const stelle = (faktor) =>
    page.evaluate((faktor) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let n = 0;
      g.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          const u = m.userData?.shader?.uniforms ?? m.userData?.uniforms;
          const t = u?.uTranslucency;
          if (!t) continue;
          if (m.userData.__transStand === undefined) m.userData.__transStand = t.value;
          t.value = m.userData.__transStand * faktor;
          n++;
        }
      });
      return n;
    }, faktor);

  process.stdout.write(
    `${shotName}, Kasten ${K.join(',')}\n\n` +
      `zur Sonne          ${blick.zurSonne.join(' | ')}\n` +
      `Blickachse         ${blick.blickAchse.join(' | ')}\n` +
      `geometryViewDir * lightDir   ${blick.punktViewDir}   (der Term im Shader)\n` +
      `Blickachse * lightDir        ${blick.punktBlickInSonne}   (positiv = in die Sonne)\n\n` +
      `${'Staerke'.padEnd(14)}${'Materialien'.padStart(12)}${'Mittel'.padStart(9)}${'p95'.padStart(8)}\n`
  );
  for (const f of [0, 1, 3]) {
    const n = await stelle(f);
    await page.waitForTimeout(360);
    const p = PNG.sync.read(await page.screenshot());
    const werte = [];
    for (let y = K[1]; y <= K[3]; y++)
      for (let x = K[0]; x <= K[2]; x++) werte.push(L(p, (y * p.width + x) * 4));
    werte.sort((a, b) => a - b);
    const m = werte.reduce((a, v) => a + v, 0) / werte.length;
    process.stdout.write(
      `${`x ${f}`.padEnd(14)}${String(n).padStart(12)}${m.toFixed(1).padStart(9)}${werte[
        Math.floor(werte.length * 0.95)
      ].toFixed(1).padStart(8)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
