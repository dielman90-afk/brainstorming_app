// **Gibt es ein Pixelgitter im Bild, und woher kommt es?**
//
// Der Prüfer hat unter dem Sputnik ein regelmäßiges 2-Pixel-Schachbrett
// gefunden und es als „das einzige echte Pixelgitter der Szene — kein
// Stilmittel, sondern eine Rechenspur" bezeichnet. Sein Nachweis war die
// **Autokorrelation des Hochpasses**: Ein Wechselmuster mit Periode 2 zeigt
// sich als negative Korrelation bei einem Bildpunkt Versatz und positiver bei
// zweien.
//
// Dieses Werkzeug macht daraus eine wiederholbare Messung — und, wichtiger,
// eine, mit der sich der Verursacher **einkreisen** lässt: Es rendert
// dieselbe Ansicht mehrfach und schaltet dabei je einen Kandidaten um.
//
//   node tools/raster.mjs
//
// Gemessen wird über einem Bereich, der beim Sputnik im Halbschatten liegt.
// Ausgegeben wird r(1,0), r(2,0), r(0,1) und r(1,1) des Hochpasses: Je näher
// r(1,0) an −1 und r(2,0) an +1, desto strenger das Schachbrett.
import { PNG } from 'pngjs';
import {
  PLANET_SHOTS,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  lockCamera,
  ladeThree,
} from './harness-common.mjs';

const BEREICH = { x0: 380, y0: 520, x1: 470, y1: 575 }; // Halbschatten am Sputnik

function autokorrelation(buf) {
  const p = PNG.sync.read(buf);
  const L = (x, y) => {
    const i = (y * p.width + x) * 4;
    return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  };
  // Hochpass: Wert minus 5x5-Mittel. Der Verlauf des Halbschattens fällt damit
  // heraus, das Gitter bleibt stehen.
  const w = BEREICH.x1 - BEREICH.x0 + 1;
  const h = BEREICH.y1 - BEREICH.y0 + 1;
  const hp = new Float64Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = BEREICH.x0 + i;
      const y = BEREICH.y0 + j;
      let s = 0;
      let n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          s += L(x + dx, y + dy);
          n++;
        }
      hp[j * w + i] = L(x, y) - s / n;
    }
  }
  const mit = hp.reduce((s, v) => s + v, 0) / hp.length;
  let var0 = 0;
  for (const v of hp) var0 += (v - mit) * (v - mit);
  var0 /= hp.length;
  const r = (dx, dy) => {
    let s = 0;
    let n = 0;
    for (let j = 0; j + dy < h; j++)
      for (let i = 0; i + dx < w; i++) {
        s += (hp[j * w + i] - mit) * (hp[(j + dy) * w + i + dx] - mit);
        n++;
      }
    return var0 > 1e-9 ? s / n / var0 : 0;
  };
  return { rms: Math.sqrt(var0), r10: r(1, 0), r20: r(2, 0), r01: r(0, 1), r11: r(1, 1) };
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  const shot = PLANET_SHOTS.find((s) => s.name === 'g-sputnik');

  const faelle = [
    { name: 'Stand', tun: async () => {} },
    {
      name: 'Schatten aus',
      tun: () =>
        page.evaluate(() => {
          window.__app.scene.children
            .find((c) => c.name === 'env-night')
            .traverse((o) => {
              if (o.isDirectionalLight) o.castShadow = false;
            });
        }),
    },
    {
      name: 'PCFSoft',
      tun: () =>
        page.evaluate(() => {
          const T = window.__THREE;
          const app = window.__app;
          app.scene.children
            .find((c) => c.name === 'env-night')
            .traverse((o) => {
              if (o.isDirectionalLight) {
                o.castShadow = true;
                o.shadow.map?.dispose();
                o.shadow.map = null;
              }
            });
          app.renderer.shadowMap.type = T.PCFSoftShadowMap;
          app.renderer.shadowMap.needsUpdate = true;
          app.scene.traverse((o) => {
            const m = Array.isArray(o.material) ? o.material : [o.material];
            for (const mm of m) if (mm) mm.needsUpdate = true;
          });
        }),
    },
    {
      name: 'radius 2',
      tun: () =>
        page.evaluate(() => {
          window.__app.scene.children
            .find((c) => c.name === 'env-night')
            .traverse((o) => {
              if (o.isDirectionalLight && o.castShadow) {
                o.shadow.radius = 2;
                o.shadow.map?.dispose();
                o.shadow.map = null;
              }
            });
        }),
    },
    {
      name: 'radius 6',
      tun: () =>
        page.evaluate(() => {
          window.__app.scene.children
            .find((c) => c.name === 'env-night')
            .traverse((o) => {
              if (o.isDirectionalLight && o.castShadow) {
                o.shadow.radius = 6;
                o.shadow.map?.dispose();
                o.shadow.map = null;
              }
            });
        }),
    },
    {
      name: 'VSM r4',
      tun: () =>
        page.evaluate(() => {
          const T = window.__THREE;
          const app = window.__app;
          app.renderer.shadowMap.type = T.VSMShadowMap;
          app.scene.children
            .find((c) => c.name === 'env-night')
            .traverse((o) => {
              if (o.isDirectionalLight && o.castShadow) {
                o.shadow.radius = 4;
                o.shadow.blurSamples = 8;
                o.shadow.map?.dispose();
                o.shadow.map = null;
              }
            });
          app.renderer.shadowMap.needsUpdate = true;
          app.scene.traverse((o) => {
            const m = Array.isArray(o.material) ? o.material : [o.material];
            for (const mm of m) if (mm) mm.needsUpdate = true;
          });
        }),
    },
    {
      name: 'Kontakt-AO aus',
      tun: () =>
        page.evaluate(() => {
          const T = window.__THREE;
          const app = window.__app;
          app.renderer.shadowMap.type = T.PCFShadowMap;
          app.scene.traverse((o) => {
            const m = Array.isArray(o.material) ? o.material : [o.material];
            for (const mm of m) if (mm) mm.needsUpdate = true;
            if (o.name === 'kontaktverdunklung') o.visible = false;
          });
        }),
    },
  ];

  console.log('Fall               RMS    r(1,0)   r(2,0)   r(0,1)   r(1,1)');
  for (const f of faelle) {
    await f.tun();
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(400);
    const a = autokorrelation(await page.screenshot());
    console.log(
      `${f.name.padEnd(16)} ${a.rms.toFixed(3).padStart(6)}  ` +
        `${a.r10.toFixed(3).padStart(7)}  ${a.r20.toFixed(3).padStart(7)}  ` +
        `${a.r01.toFixed(3).padStart(7)}  ${a.r11.toFixed(3).padStart(7)}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
