// **Ist das Laub gruen — oder weisslich?**
//
//   node tools/laubgruen.mjs --env dojo <shot> <knoten> [<knoten> ...] [--himmel 6] [--rauheit 0.9]
//
// Befund des Nutzers aus der Brille: „Die Blaetter draussen in der
// Dojo-Umgebung sind irgendwie viel zu weiss. Muessten die nicht gruener
// sein?" `knotenwerte.mjs` misst nur Helligkeit; ein Blatt kann aber hell UND
// gruen sein, oder mittelhell und grau. Hier zaehlt die Farbe.
//
// Differenziell wie dort: Der Knoten wird aus- und eingeblendet, die
// geaenderten Bildpunkte sind seine Flaeche. Auf dieser Maske:
//
//   * Saettigung (HSL, 0-100) im Mittel und Median,
//   * Farbton im Mittel (Grad; Gruen liegt um 90-140),
//   * Anteil „weisslich": Saettigung unter 20 bei L ueber 140,
//   * Helligkeit im Mittel.
//
// `--himmel x` setzt zur Laufzeit die Staerke der Himmelskarte auf allen
// Laubmaterialien (`userData.foliage`), `--rauheit x` ihre Rauheit. Damit
// laesst sich ein Regler abtasten, ohne die Quelle anzufassen.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'dojo');
const wert = (name) => (argv.includes(name) ? Number(argv[argv.indexOf(name) + 1]) : undefined);
const HIMMEL = wert('--himmel');
const RAUHEIT = wert('--rauheit');
const rest = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
const shotName = rest[0];
const KNOTEN = rest.slice(1);
if (!shotName || !KNOTEN.length) {
  process.stderr.write('Aufruf: node tools/laubgruen.mjs --env dojo <shot> <knoten> ...\n');
  process.exit(1);
}

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot(SCHUSS));
};

function hsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === shotName);
  if (!shot) throw new Error(`Kein Shot "${shotName}" in "${ENV}"`);
  if (HIMMEL !== undefined || RAUHEIT !== undefined) {
    const n = await page.evaluate(
      ({ himmel, rauheit, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        const gesehen = new Set();
        g.traverse((o) => {
          const m = o.material;
          if (!m || !m.userData?.foliage || gesehen.has(m)) return;
          gesehen.add(m);
          if (himmel !== null) {
            m.userData.himmelStaerke = himmel;
            m.envMapIntensity = himmel;
          }
          if (rauheit !== null) m.roughness = rauheit;
        });
        return gesehen.size;
      },
      { himmel: HIMMEL ?? null, rauheit: RAUHEIT ?? null, gruppe: `env-${ENV}` }
    );
    process.stdout.write(`(${n} Laubmaterialien: himmel ${HIMMEL ?? '-'}, rauheit ${RAUHEIT ?? '-'})\n`);
  }
  await lockCamera(page, shot, 6.0);
  const voll = await bild(page);
  process.stdout.write(
    `${shotName}\n${'Knoten'.padEnd(26)}${'Punkte'.padStart(8)}${'L'.padStart(7)}${'Sat'.padStart(7)}${'SatMed'.padStart(8)}${'Ton'.padStart(7)}${'weisslich'.padStart(11)}\n`
  );
  for (const name of KNOTEN) {
    const setze = (an) =>
      page.evaluate(
        ({ name, an, gruppe }) => {
          const g = window.__app.scene.children.find((c) => c.name === gruppe);
          let n = 0;
          g.traverse((o) => {
            if (o.name === name) {
              o.visible = an;
              n++;
            }
          });
          return n;
        },
        { name, an, gruppe: `env-${ENV}` }
      );
    await setze(false);
    const ohne = await bild(page);
    await setze(true);
    const sat = [];
    let sL = 0;
    let sx = 0;
    let sy = 0;
    let weiss = 0;
    for (let i = 0; i < voll.width * voll.height; i++) {
      const j = i * 4;
      const d = Math.max(
        Math.abs(voll.data[j] - ohne.data[j]),
        Math.abs(voll.data[j + 1] - ohne.data[j + 1]),
        Math.abs(voll.data[j + 2] - ohne.data[j + 2])
      );
      if (d < 3) continue;
      const { h, s } = hsl(voll.data[j], voll.data[j + 1], voll.data[j + 2]);
      const L = 0.2126 * voll.data[j] + 0.7152 * voll.data[j + 1] + 0.0722 * voll.data[j + 2];
      sat.push(s);
      sL += L;
      // Farbton als Kreismittel, gewichtet mit der Saettigung – ein graues
      // Bildpunkt hat keinen Ton, der zaehlen duerfte.
      sx += Math.cos((h * Math.PI) / 180) * s;
      sy += Math.sin((h * Math.PI) / 180) * s;
      if (s < 0.2 && L > 140) weiss++;
    }
    if (!sat.length) {
      process.stdout.write(`${name.padEnd(26)}  (nicht im Bild)\n`);
      continue;
    }
    const n = sat.length;
    const sortiert = [...sat].sort((a, b) => a - b);
    const ton = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
    process.stdout.write(
      `${name.padEnd(26)}${String(n).padStart(8)}${(sL / n).toFixed(1).padStart(7)}${((sat.reduce((a, b) => a + b, 0) / n) * 100).toFixed(1).padStart(7)}${(sortiert[Math.floor(n / 2)] * 100).toFixed(1).padStart(8)}${ton.toFixed(0).padStart(7)}${(((weiss / n) * 100).toFixed(1) + ' %').padStart(11)}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
