// **Vier Nebeleinstellungen gegeneinander, an denselben vier Kameras.**
//
// Der Prüfer: „In `rund-270` sind 3,93 % aller Bildpixel dieser eine Wert […]
// das größte Objekt im Bild ist kein Objekt, es hat einen Umriss und sonst
// nichts." Die Ursache ist gemessen: RGB(28,13,9) ist `0x1c0d09`, die
// Nebelfarbe. Linearer Nebel sättigt bei `far` vollständig, und `far` stand auf
// 13 m — jeder Grat ab 16 m Bogen ist damit reine Nebelfarbe.
//
// Welche Einstellung die richtige ist, lässt sich nicht herleiten: Der Nebel
// soll die Nähe staffeln **und** die Ferne modelliert lassen, und das sind zwei
// Forderungen an eine Zahl. Also gerendert und gezählt.
//
//   node tools/nebelversuch.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ROOT,
  PLANET_SHOTS,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
  ladeThree,
} from './harness-common.mjs';

const VARIANTEN = [
  { name: 'a-5-13', near: 5, far: 13 },
  { name: 'b-5-24', near: 5, far: 24 },
  { name: 'c-6-34', near: 6, far: 34 },
  { name: 'd-aus', aus: true },
];
const KAMERAS = ['a-augenhoehe', 'c-krater', 'e-boden', 'f-kante'];

const ziel = path.resolve(ROOT, process.argv[2] ?? 'tools/shots/nebelversuch');
const server = await startServer();
const browser = await launchBrowser();
try {
  await fs.mkdir(ziel, { recursive: true });
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  for (const v of VARIANTEN) {
    await page.evaluate(
      ({ near, far, aus }) => {
        const scene = window.__app.scene;
        if (aus) {
          scene.fog = null;
          return;
        }
        // Die Farbe bleibt; nur der Verlauf wird verstellt.
        if (!window.__nebelUr) window.__nebelUr = scene.fog.color.getHex();
        scene.fog = new window.__THREE.Fog(window.__nebelUr, near, far);
      },
      v
    );
    for (const name of KAMERAS) {
      const shot = PLANET_SHOTS.find((s) => s.name === name);
      // **Kein `nebel: false`.** Der Schalter des Prüfstands würde den Nebel
      // abräumen, den dieser Versuch gerade gesetzt hat.
      await lockCamera(page, shot, 6.0);
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(ziel, `${v.name}-${name}.png`) });
    }
    console.log(`✓ ${v.name}`);
  }
} finally {
  await browser.close();
  await server.stop();
}
console.log(`Bilder in ${ziel}`);
