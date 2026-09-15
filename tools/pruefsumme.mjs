// Prüfsummen der Nachtumgebung im Seitenkontext: Geometrie, Vertexfarben,
// Texturen, Lichter, Kameralage. Damit lässt sich eine Abweichung zwischen zwei
// Durchläufen dorthin zurückverfolgen, wo sie entsteht — statt sie am Bild zu
// raten.
//
//   node tools/pruefsumme.mjs [--env night]
import { envArg, startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'night');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await ladeThree(page);
  await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const fnv = (zahlen) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < zahlen.length; i++) {
        const v = Math.round(zahlen[i] * 1e5) | 0;
        h ^= v & 0xff; h = Math.imul(h, 0x01000193);
        h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
        h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
        h ^= (v >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16);
    };
    const bytes = (arr) => {
      let h = 0x811c9dc5;
      for (let i = 0; i < arr.length; i += 7) { h ^= arr[i]; h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16);
    };
    const zeilen = [];
    const wurzel = window.__app.scene.getObjectByName('env-night') || window.__app.scene;
    wurzel.traverse((o) => {
      if (o.isMesh && o.geometry?.attributes?.position) {
        const g = o.geometry;
        zeilen.push(
          `mesh ${o.name || o.type} tris=${(g.index ? g.index.count : g.attributes.position.count) / 3} pos=${fnv(g.attributes.position.array)} nor=${g.attributes.normal ? fnv(g.attributes.normal.array) : '-'} col=${g.attributes.color ? fnv(g.attributes.color.array) : '-'}`
        );
      }
      if (o.isLight) zeilen.push(`light ${o.name || o.type} int=${o.intensity} pos=${o.position.toArray().map((v) => v.toFixed(4)).join(',')} col=${o.color.getHexString()}`);
      if (o.isSprite) zeilen.push(`sprite ${o.name} pos=${o.position.toArray().map((v) => v.toFixed(3)).join(',')} scale=${o.scale.x.toFixed(3)}`);
    });
    // Texturen: die Zeichenblätter selbst
    const gesehen = new Set();
    wurzel.traverse((o) => {
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const schluessel of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap']) {
          const t = m[schluessel];
          if (!t || !t.image || gesehen.has(t.uuid)) continue;
          gesehen.add(t.uuid);
          const c = t.image;
          if (!c.getContext) continue;
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          zeilen.push(`tex ${m.name || o.name}.${schluessel} ${c.width}x${c.height} ${bytes(d)}`);
        }
      }
    });
    zeilen.sort();
    return zeilen;
  });
  for (const z of out) console.log(z);
} finally {
  await browser.close();
  await server.stop();
}
