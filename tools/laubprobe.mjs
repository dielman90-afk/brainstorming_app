// **Woher kommt das Flimmern in der Krone?**
//
//   node tools/laubprobe.mjs
//
// Der Prüfer hat die Konifere in `5-backlight` als „pixelweise abwechselndes
// Schwarz-Weiss-Gitter" gemeldet, Hochpass 27,4. Vier Ursachen kommen in
// Frage, und sie lassen sich einzeln abschalten statt zu raten:
//
//   normalScale   Ein starkes Relief auf einer Nadel von einem Bildpunkt
//                 ergibt je Bildpunkt eine andere Normale.
//   Himmelssaum   Der Fresnel-Saum aus addSkyRim.
//   Spiegelanteil MeshStandardMaterial gibt jedem Dielektrikum F0 = 0,04.
//   Rauheit       Eine enge Glanzkeule schaltet zwischen Nachbarpixeln um.
//
// Gemessen wird der Hochpass im Kronenbereich, je Schalter einzeln.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';
import { PNG } from 'pngjs';

const KASTEN = [950, 150, 1250, 450];
const shot = shotsFor('island').find((s) => s.name === '5-backlight');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await ladeThree(page);
  await lockCamera(page, shot, 6.0);

  const messen = async (name) => {
    await page.waitForTimeout(400);
    const p = PNG.sync.read(await page.screenshot());
    const L = (x, y) => {
      const i = (y * p.width + x) * 4;
      return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
    };
    let hp = 0;
    let n = 0;
    let dunkel = 0;
    let hell = 0;
    for (let y = KASTEN[1] + 2; y <= KASTEN[3] - 2; y++) {
      for (let x = KASTEN[0] + 2; x <= KASTEN[2] - 2; x++) {
        let s = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L(x + dx, y + dy);
        const v = L(x, y);
        hp += Math.abs(v - s / 25);
        if (v < 40) dunkel++;
        if (v > 190) hell++;
        n++;
      }
    }
    console.log(
      `  ${name.padEnd(34)} Hochpass ${(hp / n).toFixed(3).padStart(7)}   unter L40 ${((dunkel * 100) / n).toFixed(1).padStart(5)} %   ueber L190 ${((hell * 100) / n).toFixed(1).padStart(5)} %`
    );
  };

  const stelle = (was) =>
    page.evaluate((was) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      let getroffen = 0;
      g.traverse((o) => {
        const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of mats) {
          // **Nicht ueber den Programmschluessel filtern.** Der erste Anlauf
          // hat auf 'dojo-foliage-v1' geprueft — aber addSkyRim() umhuellt das
          // Material und setzt einen eigenen Schluessel. Die Probe hat damit
          // kein einziges Material erwischt und vier identische Zahlen
          // geliefert; ich haette daraus fast geschlossen, es liege an keiner
          // der vier Ursachen. Alphaschwelle plus Normalenkarte trifft genau
          // das Laub.
          if (!(m.alphaTest > 0) || !m.normalMap) continue;
          getroffen++;
          if (!m.userData.__sicherung) {
            m.userData.__sicherung = {
              normalScale: m.normalScale.clone(),
              roughness: m.roughness,
            };
          }
          const sich = m.userData.__sicherung;
          m.normalScale.copy(sich.normalScale);
          m.roughness = sich.roughness;
          if (was === 'ohne-normale') m.normalScale.set(0, 0);
          if (was === 'ohne-glanz') m.roughness = 1.0;
          if (was === 'halbe-normale') m.normalScale.copy(sich.normalScale).multiplyScalar(0.5);
          if (was === 'rau 0,92') m.roughness = 0.92;
          if (was === 'rau 0,92 + normale 0,75') {
            m.roughness = 0.92;
            m.normalScale.copy(sich.normalScale).multiplyScalar(0.75);
          }
          if (was === 'rau 0,92 + normale 0,6') {
            m.roughness = 0.92;
            m.normalScale.copy(sich.normalScale).multiplyScalar(0.6);
          }
          if (was === 'rau 1,0 + normale 0,6') {
            m.roughness = 1.0;
            m.normalScale.copy(sich.normalScale).multiplyScalar(0.6);
          }
          m.needsUpdate = true;
        }
      });
      return getroffen;
    }, was);

  console.log('Konifere in 5-backlight, Kasten (950,150)-(1250,450)');
  for (const was of ['stand', 'rau 0,92', 'rau 0,92 + normale 0,75', 'rau 0,92 + normale 0,6', 'rau 1,0 + normale 0,6']) {
    const n = await stelle(was);
    await messen(`${was} (${n} Materialien)`);
  }
} finally {
  await browser.close();
  await server.stop();
}
