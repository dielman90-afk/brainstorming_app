// **Wie viel Spiegelung verträgt eine Wasserfläche?**
//
//   node tools/wasserprobe.mjs [--env zen] [--knoten zen-wasser] [shot]
//
// Gemessen war: Die Umgebungskarte liefert 49 bis 90 Prozent des Bildes der
// Teichfläche, und das Ergebnis steht bei 9 bis 17 Prozent Sättigung, während
// der Beckengrund darunter bei 45 bis 52 liegt. Eine Fläche, die zu vier
// Fünfteln aus einer glatten Himmelsspiegelung besteht, landet im flachen
// Bereich der ACES-Kurve und verliert dort ihre Farbe — dieselbe Lehre wie bei
// Wolken, Sonnenscheibe und Grasfase.
//
// Drei Stellschrauben stehen zur Wahl, und keine davon lässt sich raten:
//
//   * `clearcoat` — eine ZWEITE Spiegelkeule über der ersten. Für den nassen
//     Stein im Dojo richtig (Wasserfilm über Substrat), für einen Teich falsch:
//     Wasser hat eine Grenzfläche, nicht zwei.
//   * `ior` — three rechnet mit 1,5 (F0 = 0,04). Wasser hat 1,333 (F0 = 0,02).
//   * `envMapIntensity` — der grobe Regler.
//
// Ausgegeben werden je Kombination Helligkeit, Sättigung und Binnenkontrast in
// der Wassermaske. Die Maske entsteht einmal differenziell und bleibt dann
// fest, damit alle Zeilen dieselben Bildpunkte vergleichen.
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
let KNOTEN = 'zen-wasser';
const ki = argv.indexOf('--knoten');
if (ki >= 0) KNOTEN = argv[ki + 1];
const rest = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--env' && argv[i - 1] !== '--knoten');
const SHOT = rest[0] ?? 'b-pond';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function saett(r, g, b) {
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
}

// Die Reihe: erst der Ist-Stand, dann die Schrauben einzeln, dann zusammen.
const REIHE = [
  { name: 'Ist-Stand', werte: {} },
  { name: 'ior 1.333', werte: { ior: 1.333 } },
  { name: 'clearcoat 0.35', werte: { clearcoat: 0.35 } },
  { name: 'clearcoat 0', werte: { clearcoat: 0 } },
  { name: 'envInt 0.6', werte: { envMapIntensity: 0.6 } },
  { name: 'ior+cc0.35', werte: { ior: 1.333, clearcoat: 0.35 } },
  { name: 'ior+cc0.35+env0.7', werte: { ior: 1.333, clearcoat: 0.35, envMapIntensity: 0.7 } },
  { name: 'ior+cc0.25+env0.55', werte: { ior: 1.333, clearcoat: 0.25, envMapIntensity: 0.55 } },
  { name: 'ior+cc0+env0.55', werte: { ior: 1.333, clearcoat: 0, envMapIntensity: 0.55 } },
];

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  const shot = shotsFor(ENV).find((s) => s.name === SHOT);
  if (!shot) {
    process.stderr.write(`Kein Shot "${SHOT}" in Umgebung "${ENV}".\n`);
    process.exit(1);
  }
  await lockCamera(page, shot, 6.0);

  const bild = async () => {
    await page.waitForTimeout(320);
    return PNG.sync.read(await page.screenshot(SCHUSS));
  };
  const sichtbar = (an) =>
    page.evaluate(
      ({ an, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name === name) o.visible = an;
        });
      },
      { an, name: KNOTEN, gruppe: `env-${ENV}` }
    );
  const setzen = (werte) =>
    page.evaluate(
      ({ werte, name, gruppe }) => {
        const g = window.__app.scene.children.find((c) => c.name === gruppe);
        g.traverse((o) => {
          if (o.name !== name || !o.material) return;
          window.__ist = window.__ist ?? {
            ior: o.material.ior,
            clearcoat: o.material.clearcoat,
            envMapIntensity: o.material.envMapIntensity,
          };
          Object.assign(o.material, window.__ist, werte);
          o.material.needsUpdate = true;
        });
      },
      { werte, name: KNOTEN, gruppe: `env-${ENV}` }
    );

  await sichtbar(true);
  const mit = await bild();
  await sichtbar(false);
  const ohne = await bild();
  await sichtbar(true);
  const maske = [];
  for (let i = 0; i < mit.data.length; i += 4) {
    const d =
      Math.abs(mit.data[i] - ohne.data[i]) +
      Math.abs(mit.data[i + 1] - ohne.data[i + 1]) +
      Math.abs(mit.data[i + 2] - ohne.data[i + 2]);
    if (d >= 6) maske.push(i);
  }
  process.stdout.write(`${SHOT}: Maske ${maske.length} px\n\n`);

  for (const { name, werte } of REIHE) {
    await setzen(werte);
    const b = await bild();
    const L = [];
    let ss = 0;
    for (const i of maske) {
      L.push(lum(b.data[i], b.data[i + 1], b.data[i + 2]));
      ss += saett(b.data[i], b.data[i + 1], b.data[i + 2]);
    }
    // **Feinstruktur.** Der Umfang p95-p05 sagt nichts darüber, ob die
    // Spiegelung noch aufgebrochen ist oder nur gleichmäßig heller steht.
    // Deshalb die mittlere Abweichung eines Bildpunkts von seinen vier
    // Nachbarn, nur innerhalb der Maske: Das ist der Hochpass, und er
    // entscheidet, ob eine Schraube Struktur oder nur Schleier wegnimmt.
    let hoch = 0;
    let hn = 0;
    for (const i of maske) {
      const x = (i / 4) % b.width;
      if (x < 1 || x > b.width - 2) continue;
      const c = lum(b.data[i], b.data[i + 1], b.data[i + 2]);
      let s4 = 0;
      for (const o of [-4, 4, -b.width * 4, b.width * 4]) {
        const j = i + o;
        if (j < 0 || j >= b.data.length) continue;
        s4 += lum(b.data[j], b.data[j + 1], b.data[j + 2]);
      }
      hoch += Math.abs(c - s4 / 4);
      hn++;
    }
    L.sort((a, c) => a - c);
    const p = (q) => L[Math.min(L.length - 1, Math.floor(q * L.length))];
    process.stdout.write(
      `${name.padEnd(20)} L ${(L.reduce((a, c) => a + c, 0) / L.length).toFixed(1).padStart(6)}  ` +
        `p05 ${p(0.05).toFixed(0).padStart(3)}  p50 ${p(0.5).toFixed(0).padStart(3)}  ` +
        `p95 ${p(0.95).toFixed(0).padStart(3)}  Umfang ${(p(0.95) - p(0.05)).toFixed(0).padStart(3)}  ` +
        `Saett ${((ss / maske.length) * 100).toFixed(1).padStart(5)}%  ` +
        `Hochpass ${(hoch / Math.max(hn, 1)).toFixed(2).padStart(5)}\n`
    );
  }
  await setzen({});
} finally {
  await browser.close();
  await server.stop();
}
