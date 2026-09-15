// **Was liegt insgesamt im Grafikspeicher — nicht je Umgebung.**
//
//   node tools/gesamtspeicher.mjs
//
// `measure.mjs` laeuft ueber die Gruppe **einer** Umgebung und meldet deren
// Texturen. Das ist die richtige Zahl fuer die Frage „passt diese Umgebung ins
// Budget" und die falsche fuer die Frage „warum ruckelt es".
//
// `main.js` baut naemlich **alle fuenf Umgebungen beim Start** und schaltet
// danach nur `group.visible` um. Unsichtbare Netze werden zwar nicht
// gezeichnet, ihre Texturen und Puffer liegen aber weiter im Grafikspeicher.
// Die Brille traegt also immer die Summe, nie den Einzelwert.
//
// Gemeldet werden: Texturbytes je Umgebung, die Summe ueber die ganze Szene
// (Mehrfachnutzungen nur einmal gezaehlt), dazu die Zaehler des Renderers
// selbst und die Zeit vom Seitenaufruf bis zum ersten Bild.
import { startServer, launchBrowser, openApp } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
try {
  const t0 = Date.now();
  const { page } = await openApp(browser);
  const startMs = Date.now() - t0;
  const r = await page.evaluate(() => {
    const app = window.__app;
    const gesehen = new Map();
    const bytesVon = (t) => {
      if (!t || !t.image) return 0;
      const b = t.image;
      const n = (b.width || 0) * (b.height || 0);
      // Vier Kanaele zu acht Bit, plus ein Drittel fuer die Mipkette.
      return Math.round(n * 4 * (t.generateMipmaps === false ? 1 : 1.3333));
    };
    const sammle = (wurzel, eimer) => {
      wurzel.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const key of ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'aoMap', 'bumpMap', 'metalnessMap', 'envMap']) {
            const t = m[key];
            if (!t || eimer.has(t.uuid)) continue;
            eimer.set(t.uuid, bytesVon(t));
          }
          if (m.uniforms) {
            for (const u of Object.values(m.uniforms)) {
              const t = u?.value;
              if (t?.isTexture && !eimer.has(t.uuid)) eimer.set(t.uuid, bytesVon(t));
            }
          }
        }
      });
    };
    const proUmgebung = [];
    for (const kind of app.scene.children) {
      if (!kind.name || !kind.name.startsWith('env-')) continue;
      const eimer = new Map();
      sammle(kind, eimer);
      let dreiecke = 0;
      kind.traverse((o) => {
        const g = o.geometry;
        if (!g) return;
        const n = g.index ? g.index.count / 3 : g.attributes?.position ? g.attributes.position.count / 3 : 0;
        dreiecke += n * (o.isInstancedMesh ? o.count : 1);
      });
      let b = 0;
      for (const v of eimer.values()) b += v;
      proUmgebung.push({ name: kind.name, mb: b / 1048576, texturen: eimer.size, dreiecke: Math.round(dreiecke), sichtbar: kind.visible });
    }
    const alle = new Map();
    sammle(app.scene, alle);
    let ges = 0;
    for (const v of alle.values()) ges += v;
    return {
      proUmgebung,
      gesamtMB: ges / 1048576,
      gesamtTexturen: alle.size,
      rendererTexturen: app.renderer.info.memory.textures,
      rendererGeometrien: app.renderer.info.memory.geometries,
      programme: app.renderer.info.programs?.length ?? null,
    };
  });
  console.log(`Ladezeit bis zum ersten Bild   ${(startMs / 1000).toFixed(1)} s\n`);
  console.log('Umgebung              Texturen      MB    Dreiecke   sichtbar');
  for (const u of r.proUmgebung) {
    console.log(
      `  ${u.name.padEnd(18)} ${String(u.texturen).padStart(6)} ${u.mb.toFixed(2).padStart(8)} ${String(u.dreiecke).padStart(11)}   ${u.sichtbar ? 'ja' : 'nein'}`
    );
  }
  console.log(`\nGanze Szene, Mehrfachnutzung einmal gezaehlt:`);
  console.log(`  Texturen        ${r.gesamtTexturen}`);
  console.log(`  Texturspeicher  ${r.gesamtMB.toFixed(2)} MB     <- das traegt die Brille, nicht der Einzelwert`);
  console.log(`  Renderer meldet ${r.rendererTexturen} Texturen, ${r.rendererGeometrien} Geometrien, ${r.programme} Programme`);
} finally {
  await browser.close();
  await server.stop();
}
