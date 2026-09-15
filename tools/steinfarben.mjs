// Was steht wirklich in den Scheitelfarben des Steinwerks?
//
// Die Bildmessung (`tools/materialien.mjs`) zählt Pixel und ist damit von
// Beleuchtung, Schatten und Nebel abhängig — ein Frostfleck auf der
// abgewandten Flanke ist im Bild dunkel, obwohl er in den Daten steht. Dieses
// Werkzeug liest die Farbattribute der zusammengefassten Steinnetze direkt aus
// und beantwortet damit die Frage des Prüfers ohne Umweg: Wie viele der vier
// angelegten Sorten sind überhaupt vorhanden, und wie stark?
//
// Gemessen wird gegen die Grundfarben aus `faerbeBruchstein`: Abstand zur
// Staub-, Bruch- und Frostfarbe im linearen Raum, jeweils relativ zum
// unveränderten Grundton.
//
//   node tools/steinfarben.mjs
import { startServer, launchBrowser, openApp, selectEnv } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  const werte = await page.evaluate(() => {
    const namen = ['nacht-brocken', 'nacht-formationen', 'nacht-findlinge'];
    const out = [];
    window.__app.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.color) return;
      if (!namen.some((n) => (o.name || '').includes(n))) return;
      const a = o.geometry.attributes.color;
      const roh = [];
      for (let i = 0; i < a.count; i++) roh.push([a.getX(i), a.getY(i), a.getZ(i)]);
      out.push({ name: o.name, farben: roh });
    });
    return out;
  });

  // sRGB-Hex → linear, wie THREE.Color es beim Setzen tut.
  const lin = (h) => {
    const f = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return [f(((h >> 16) & 255) / 255), f(((h >> 8) & 255) / 255), f((h & 255) / 255)];
  };
  const STAUB = lin(0x8a5540);
  const BRUCH = lin(0xb2a49b);
  const FROST = lin(0xbcd0e0);
  const d = (c, z) => Math.hypot(c[0] - z[0], c[1] - z[1], c[2] - z[2]);

  let gesamt = 0;
  let nStaub = 0;
  let nBruch = 0;
  let nFrost = 0;
  let starkBruch = 0;
  let starkFrost = 0;
  for (const m of werte) {
    for (const c of m.farben) {
      gesamt++;
      // Die Kontaktverdunklung skaliert alle drei Kanäle um bis zu 18 % nach
      // unten; deshalb vor dem Vergleich auf gleiche Helligkeit normieren.
      const s = (c[0] + c[1] + c[2]) / 3;
      if (s <= 1e-6) continue;
      const n = c.map((v) => v / s);
      const norm = (z) => {
        const t = (z[0] + z[1] + z[2]) / 3;
        return z.map((v) => v / t);
      };
      const dS = d(n, norm(STAUB));
      const dB = d(n, norm(BRUCH));
      const dF = d(n, norm(FROST));
      const nah = Math.min(dS, dB, dF);
      if (nah === dS) nStaub++;
      else if (nah === dB) nBruch++;
      else nFrost++;
      // „Stark" heißt: die Beimischung ist so hoch, dass die Fläche im Bild
      // als eigenes Material lesbar wird, nicht als Tönung.
      if (dB < 0.05) starkBruch++;
      if (dF < 0.14) starkFrost++;
    }
  }
  const p = (v) => ((100 * v) / gesamt).toFixed(2).padStart(6) + ' %';
  console.log(`Scheitel im Steinwerk: ${gesamt}`);
  console.log(`  nächste Sorte  Staub ${p(nStaub)}  Bruch ${p(nBruch)}  Frost ${p(nFrost)}`);
  console.log(`  deutlich       Bruch ${p(starkBruch)}  Frost ${p(starkFrost)}`);
} finally {
  await browser.close();
  await server.stop();
}
