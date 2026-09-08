// **Steht die Ferne ueber oder unter dem Himmel?**
//
//   node tools/fernsicht.mjs [--env zen] [shot]
//
// Prüferbefund 14: *„Der Nebel frisst den Mittelgrund."* Gemessen in
// `a-eyelevel` an vier Spalten: Der Himmel dicht ueber dem Horizont steht bei
// L 169 bis 192, die Huegel darunter bei 186 bis 203. **Die ferne Erde ist
// heller als der Himmel darueber** — und damit kann sie gar nicht als Erde
// lesen, sondern nur als Dunstbank.
//
// Die Ursache ist die Nebelfarbe: 0xecd9bb landet nach ACES bei rund 203, der
// Himmel am Horizont bei rund 178. Was der Nebel verschluckt, wird heller als
// sein Hintergrund. Physikalisch ist der Dunst am Horizont der Himmel am
// Horizont; die beiden muessen zusammenfallen.
//
// Gemessen wird differenziell: Die Maske der fernen Huegel entsteht durch
// Ab- und Anschalten des Knotens, das Himmelsband liegt unmittelbar darueber
// (dieselben Spalten, dreissig Zeilen hoeher). Die Nebelfarbe und die
// Endweite lassen sich dabei aus dem Harness stellen, ohne die Quelle
// anzufassen — sie stehen in `scene.fog`.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const rest = argv.filter(
  (a, i) => !a.startsWith('--') && argv[i - 1] !== '--env' && argv[i - 1] !== '--bilder'
);
const SHOT = rest[0] ?? 'a-eyelevel';
// Zahlen entscheiden hier nicht allein: Ob eine Huegelkette als Ferne liest
// oder als dunkles Band, sagt nur das Bild. `--bilder <ordner>` legt je Zeile
// der Reihe eines ab.
const bi = argv.indexOf('--bilder');
const BILDER = bi >= 0 ? argv[bi + 1] : null;
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Nebelfarbe und Endweite. Die erste Zeile ist der Ist-Stand.
// **Die Farbe ist gebunden, die Weite nicht.** Die Horizontfarbe der
// Himmelskuppel ist absichtlich dieselbe wie die Nebelfarbe (siehe den
// Kommentar an `makeDome` im Zen): Der Saum laeuft bis dorthin, wo der Nebel
// gesaettigt ist, und traefe dort ein anders getoenter Himmel auf den Boden,
// stuende die Horizontlinie als Kante im Bild. Eine dunklere Nebelfarbe
// erkauft die Ferne also mit einer Naht am Horizont. Die Endweite hat diese
// Nebenwirkung nicht: Sie laesst den Huegeln mehr von ihrer eigenen Farbe,
// ohne den Ton zu verschieben, bei dem Boden und Himmel zusammentreffen.
const REIHE = [
  [0xecd9bb, 46],
  [0xecd9bb, 55],
  [0xecd9bb, 62],
  [0xecd9bb, 70],
  [0xecd9bb, 82],
  [0xe3cfae, 62],
];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === SHOT);
  await lockCamera(page, shot, 6.0);
  const bild = async () => {
    await page.waitForTimeout(340);
    return PNG.sync.read(await page.screenshot());
  };
  const sichtbar = (name, an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name === name) o.visible = an;
        });
      },
      { an, name, gruppe: `env-${ENV}` }
    );
  const nebel = (hex, far) =>
    page.evaluate(
      ({ hex, far }) => {
        const f = window.__app.scene.fog;
        if (f) {
          f.color.setHex(hex);
          f.far = far;
        }
      },
      { hex, far }
    );

  // Maske der Huegel, und daraus das Himmelsband darueber.
  const mit = await bild();
  await sichtbar('zen-ferne', false);
  const ohne = await bild();
  await sichtbar('zen-ferne', true);
  const huegel = [];
  const obersteZeile = new Map(); // Spalte -> oberste Huegelzeile
  for (let i = 0; i < mit.data.length; i += 4) {
    const d =
      Math.abs(mit.data[i] - ohne.data[i]) +
      Math.abs(mit.data[i + 1] - ohne.data[i + 1]) +
      Math.abs(mit.data[i + 2] - ohne.data[i + 2]);
    if (d < 6) continue;
    huegel.push(i);
    const px = (i / 4) % mit.width;
    const py = Math.floor(i / 4 / mit.width);
    if (!obersteZeile.has(px) || py < obersteZeile.get(px)) obersteZeile.set(px, py);
  }
  // Das Himmelsband: dieselben Spalten, dreissig Zeilen ueber der Huegelkante.
  // Nicht ein festes Rechteck — die Huegelkante ist keine Waagerechte, und ein
  // Rechteck haette an manchen Spalten Huegel und an anderen Wolken erwischt.
  const himmel = [];
  for (const [px, py] of obersteZeile) {
    for (let dy = 12; dy <= 34; dy++) {
      const y = py - dy;
      if (y < 0) continue;
      himmel.push((y * mit.width + px) * 4);
    }
  }
  process.stdout.write(
    `${SHOT}: Huegel ${huegel.length} px, Himmelsband darueber ${himmel.length} px\n\n` +
      `${'Nebel      far'.padEnd(18)} ${'Huegel'.padStart(7)} ${'Himmel'.padStart(7)} ` +
      `${'Diff'.padStart(7)}  ${'Ferne-Umfang'.padStart(12)}\n`
  );

  for (const [hex, far] of REIHE) {
    await nebel(hex, far);
    const b = await bild();
    if (BILDER) fs.writeFileSync(`${BILDER}/nebel-${hex.toString(16)}-${far}.png`, PNG.sync.write(b));
    const mittel = (liste) => {
      let s = 0;
      for (const i of liste) s += lum(b.data[i], b.data[i + 1], b.data[i + 2]);
      return s / liste.length;
    };
    const hs = huegel.map((i) => lum(b.data[i], b.data[i + 1], b.data[i + 2])).sort((a, c) => a - c);
    const p = (q) => hs[Math.min(hs.length - 1, Math.floor(q * hs.length))];
    const h = mittel(huegel);
    const s = mittel(himmel);
    process.stdout.write(
      `${`0x${hex.toString(16)}  ${far}`.padEnd(18)} ${h.toFixed(1).padStart(7)} ${s.toFixed(1).padStart(7)} ` +
        `${(h - s).toFixed(1).padStart(7)}  ${(p(0.95) - p(0.05)).toFixed(1).padStart(12)}\n`
    );
  }
  await nebel(0xecd9bb, 46);
} finally {
  await browser.close();
  await server.stop();
}
