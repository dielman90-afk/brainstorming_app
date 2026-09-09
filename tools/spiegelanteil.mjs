// **Wie viel vom Bild einer Fläche kommt aus ihrer Spiegelung?**
//
//   node tools/spiegelanteil.mjs [--env zen] <shot> <knoten>
//
// Differenziell wie überall hier: Die Umgebungskarte des Materials wird
// abgehängt und wieder angehängt; was sich ändert, IST die Spiegelung.
//
// Die Frage kam vom Befund „das Wasser ist eine tote milchige Scheibe". Der
// erste Verdacht war, es spiegle gar nicht — die Messung sagte das Gegenteil:
// Ohne Karte fällt der Teich um durchschnittlich 109 Stufen ab. Er spiegelte
// also sehr wohl, nur war in der Karte nichts als ein Himmelsverlauf. Ohne
// diese Zahl hätte ich am falschen Ende angefangen.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const rest = argv.filter((a, i) => a !== '--env' && argv[i - 1] !== '--env');
const shotName = rest[0] ?? 'b-pond';
const KNOTEN = rest[1];
if (!KNOTEN) {
  process.stderr.write('Kein Knoten angegeben.\n');
  process.exit(1);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === shotName);
  if (!shot) {
    process.stderr.write(`Kein Shot "${shotName}" in Umgebung "${ENV}".\n`);
    process.exit(1);
  }
  await lockCamera(page, shot, 6.0);
  const bild = async () => {
    await page.waitForTimeout(350);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };
  const karte = (an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name !== name || !o.material) return;
          if (an) o.material.envMap = window.__karteMerk ?? o.material.envMap;
          else {
            window.__karteMerk = o.material.envMap;
            o.material.envMap = null;
          }
          o.material.needsUpdate = true;
        });
      },
      { an, name: KNOTEN, gruppe: `env-${ENV}` }
    );

  const mit = await bild();
  await karte(false);
  const ohne = await bild();
  await karte(true);
  let n = 0;
  let summe = 0;
  let max = 0;
  for (let i = 0; i < mit.width * mit.height; i++) {
    const j = i * 4;
    const d = Math.max(
      Math.abs(mit.data[j] - ohne.data[j]),
      Math.abs(mit.data[j + 1] - ohne.data[j + 1]),
      Math.abs(mit.data[j + 2] - ohne.data[j + 2])
    );
    if (d >= 2) {
      n++;
      summe += d;
      max = Math.max(max, d);
    }
  }
  process.stdout.write(
    `${ENV} / ${shotName} / ${KNOTEN}\n` +
      `  ${n} Bildpunkte (${((n * 100) / (mit.width * mit.height)).toFixed(2)} % des Bildes)\n` +
      `  mittlere Aenderung ${n ? (summe / n).toFixed(1) : 0}, groesste ${max}\n`
  );
} finally {
  await browser.close();
  await server.stop();
}
