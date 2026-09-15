// **Was kauft jeder Schattenwerfer, und was kostet er?**
//
//   node tools/wurfnutzen.mjs [--env dojo] [--top 16] [shot …]
//
// Ausgangslage im Dojo: 233 278 Dreiecke, davon 185 116 in Schattenwerfern.
// Werfer werden ein zweites Mal gezeichnet, das Budget sieht also 418 394 —
// und die Vorgabe liegt bei 350 000. Die Verdopplung IST die Ueberschreitung.
//
// Wer aus dem Schattenpass darf, ist damit keine Geschmacksfrage, sondern eine
// Rechnung: Kosten sind die Dreiecke, Nutzen sind die Bildpunkte, die sich
// aendern, wenn der Knoten nicht mehr wirft. Ein Werfer, der null Bildpunkte
// aendert, ist reine Kosten — und die erste Messung dieser Art hat fuer die
// gesamten Requisiten des Dojo (23 940 Dreiecke) genau **zwei** Bildpunkte
// gefunden.
//
// Gemessen wird ueber mehrere Kameras zugleich, weil ein Wurf in einer Kamera
// unsichtbar und in der naechsten das Bildthema sein kann.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'dojo');
const ti = argv.indexOf('--top');
const TOP = ti >= 0 ? Number(argv[ti + 1]) : 16;
const rest = argv.filter(
  (a, i) => !a.startsWith('--') && argv[i - 1] !== '--env' && argv[i - 1] !== '--top'
);

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const alle = shotsFor(ENV);
  const shots = rest.length ? alle.filter((s) => rest.includes(s.name)) : alle;

  // Werfer mit ihren Dreiecken, absteigend.
  const werfer = await page.evaluate(
    ({ gruppe }) => {
      const g = window.__app.scene.children.find((c) => c.name === gruppe);
      const nach = new Map();
      g.traverse((o) => {
        if (!o.isMesh || !o.castShadow || !o.geometry) return;
        const idx = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position?.count ?? 0;
        const n = o.isInstancedMesh ? o.count : 1;
        const name = o.name || `(${o.type})`;
        nach.set(name, (nach.get(name) ?? 0) + Math.round((idx / 3) * n));
      });
      return [...nach].map(([name, tris]) => ({ name, tris })).sort((a, b) => b.tris - a.tris);
    },
    { gruppe: `env-${ENV}` }
  );

  const bild = async () => {
    await page.waitForTimeout(400);
    return PNG.sync.read(await page.screenshot({ timeout: 120000 }));
  };
  const wurf = (name, an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name === name) o.castShadow = an;
        });
      },
      { an, name, gruppe: `env-${ENV}` }
    );

  // Referenzbilder je Kamera einmal.
  const referenz = {};
  for (const s of shots) {
    await lockCamera(page, s, 6.0);
    referenz[s.name] = await bild();
  }

  process.stdout.write(
    `Umgebung ${ENV}, ${shots.length} Kameras, ${werfer.length} Werfer\n\n` +
      `${'Werfer'.padEnd(32)} ${'Dreiecke'.padStart(9)}   Geaenderte Bildpunkte je Kamera\n`
  );
  let frei = 0;
  for (const w of werfer.slice(0, TOP)) {
    await wurf(w.name, false);
    const zeile = [];
    let gesamt = 0;
    for (const s of shots) {
      await lockCamera(page, s, 6.0);
      const b = await bild();
      const ref = referenz[s.name];
      let n = 0;
      let su = 0;
      for (let i = 0; i < b.data.length; i += 4) {
        const d = Math.abs(
          lum(b.data[i], b.data[i + 1], b.data[i + 2]) - lum(ref.data[i], ref.data[i + 1], ref.data[i + 2])
        );
        if (d < 2) continue;
        n++;
        su += d;
      }
      gesamt += n;
      zeile.push(`${s.name.split('-')[0]} ${String(n).padStart(6)}${n ? `/${(su / n).toFixed(0)}` : ''}`);
    }
    await wurf(w.name, true);
    if (!gesamt) frei += w.tris;
    process.stdout.write(
      `${w.name.slice(0, 32).padEnd(32)} ${String(w.tris).padStart(9)}   ${zeile.join('  ')}\n`
    );
  }
  process.stdout.write(
    `\nWerfer ohne einen einzigen geaenderten Bildpunkt: ${frei.toLocaleString('de-DE')} Dreiecke.\n`
  );
} finally {
  await browser.close();
  await server.stop();
}
