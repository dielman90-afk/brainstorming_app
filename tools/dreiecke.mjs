// **Wo stecken die Dreiecke?**
//
//   node tools/dreiecke.mjs [--env dojo] [--top 30]
//
// `measure.mjs` sagt, dass ein Budget gerissen ist. Es sagt nicht, wo. Ohne
// diese Aufstellung raet man, und beim Dojo mit elf Dateien und 11 450 Zeilen
// raet man lange.
//
// Gezaehlt wird je Zeichenknoten der sichtbaren Umgebung: Dreiecke der
// Geometrie mal Instanzenzahl, dazu ob der Knoten in den Schattenpass geht
// (ein Werfer wird ein zweites Mal gezeichnet und zaehlt im Budget also
// doppelt). Sortiert nach Anteil, damit die ersten Zeilen die Antwort sind.
import { envArg, startServer, launchBrowser, openApp, selectEnv } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'dojo');
const ti = argv.indexOf('--top');
const TOP = ti >= 0 ? Number(argv[ti + 1]) : 30;

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const liste = await page.evaluate(
    ({ gruppe }) => {
      const g = window.__app.scene.children.find((c) => c.name === gruppe);
      const out = [];
      g.traverse((o) => {
        if (!o.isMesh && !o.isLine && !o.isPoints) return;
        const geo = o.geometry;
        if (!geo) return;
        const idx = geo.index ? geo.index.count : geo.attributes.position?.count ?? 0;
        const proDreieck = o.isPoints ? 0 : o.isLine ? 0 : 3;
        const eins = proDreieck ? idx / proDreieck : 0;
        const n = o.isInstancedMesh ? o.count : 1;
        out.push({
          name: o.name || `(${o.type})`,
          typ: o.isInstancedMesh ? 'Instanz' : o.type,
          instanzen: n,
          proInstanz: Math.round(eins),
          gesamt: Math.round(eins * n),
          wirft: !!o.castShadow,
          sichtbar: o.visible,
        });
      });
      return out;
    },
    { gruppe: `env-${ENV}` }
  );
  liste.sort((a, b) => b.gesamt - a.gesamt);
  const summe = liste.reduce((a, b) => a + b.gesamt, 0);
  const werfer = liste.filter((l) => l.wirft).reduce((a, b) => a + b.gesamt, 0);
  process.stdout.write(
    `Umgebung ${ENV}: ${liste.length} Zeichenknoten, ${summe.toLocaleString('de-DE')} Dreiecke\n` +
      `davon Schattenwerfer ${werfer.toLocaleString('de-DE')} — die werden ein zweites Mal ` +
      `gezeichnet, das Budget sieht also ${(summe + werfer).toLocaleString('de-DE')}\n\n` +
      `${'Knoten'.padEnd(32)} ${'Instanzen'.padStart(9)} ${'je'.padStart(8)} ${'gesamt'.padStart(9)} ` +
      `${'Anteil'.padStart(7)}  Wurf\n`
  );
  for (const l of liste.slice(0, TOP)) {
    process.stdout.write(
      `${l.name.slice(0, 32).padEnd(32)} ${String(l.instanzen).padStart(9)} ` +
        `${String(l.proInstanz).padStart(8)} ${String(l.gesamt).padStart(9)} ` +
        `${((l.gesamt / summe) * 100).toFixed(1).padStart(6)} %  ${l.wirft ? 'ja' : '—'}` +
        `${l.sichtbar ? '' : '   (unsichtbar)'}\n`
    );
  }
  const rest = liste.slice(TOP).reduce((a, b) => a + b.gesamt, 0);
  if (rest) process.stdout.write(`${'… uebrige'.padEnd(32)} ${' '.repeat(19)}${String(rest).padStart(9)}\n`);
} finally {
  await browser.close();
  await server.stop();
}
