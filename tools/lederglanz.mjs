// **Hat das Leder ein Glanzlicht?**
//
//   node tools/lederglanz.mjs [<shot>]
//
// Der Pruefer liest die Sessel als Filz: p99 bei L 90, Maximum 113,6 ueber
// 281 009 rote Bildpunkte. Leder ist kein Filz — es hat eine glatte
// Deckschicht, und die zeigt sich als schmales, wanderndes Glanzband.
//
// Gemessen wird auf der Maske des Knotens (Ein- und Ausblenden, kein
// Rechteck), und zwar zweierlei, weil es sich widersprechen kann:
//
//   * **Glanz** — Anteil und Hoehe der oberen Bildpunkte. Ein Glanzlicht ist
//     ein SCHMALER heller Anteil; wird die ganze Flaeche heller, ist es
//     keines, sondern nur mehr Licht.
//   * **Korn im Glanz** — mittlerer Betrag des 3x3-Hochpasses innerhalb der
//     hellsten 5 % der Maske. Eine glatte Lackflaeche hat dort fast null; eine
//     Ledernarbe bricht das Glanzlicht in Sprenkel.
//
// Die Werkstoffe werden zur Laufzeit verstellt. `leather` und `leatherDark`
// teilen sich beide Sessel (seit dem Verschmelzen), sind also ueber die
// Materialliste des zusammengefuegten Netzes erreichbar.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0] ?? 'b-sessel';
const KNOTEN = 'construct-armchairs';

const bild = async (page) => {
  await page.waitForTimeout(320);
  return PNG.sync.read(await page.screenshot());
};
const L = (p, i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];

const sichtbar = (page, an) =>
  page.evaluate(
    ({ an, knoten }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-matrix');
      g.traverse((o) => {
        if (o.name && o.name.startsWith(knoten)) o.visible = an;
      });
    },
    { an, knoten: KNOTEN }
  );

// Nur die roten Werkstoffe: Holz und Sockel sollen nicht mitgeregelt werden.
const stelle = (page, werte) =>
  page.evaluate(
    ({ werte, knoten }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-matrix');
      let n = 0;
      // Die Hemisphaere steht bei 3,9, weil es bisher keine Umgebungskarte
      // gab. Kommt eine dazu, zaehlt derselbe Lichtweg zweimal — darum muss
      // sie im selben Zug mitgeregelt werden.
      g.traverse((o) => {
        if (o.isHemisphereLight) {
          if (o.userData.__altHemi === undefined) o.userData.__altHemi = o.intensity;
          o.intensity = o.userData.__altHemi * (werte.hemi ?? 1);
        }
      });
      g.traverse((o) => {
        if (!o.name || !o.name.startsWith(knoten) || !o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (!m.color || m.color.r < m.color.b * 1.5) continue; // rot?
          if (m.userData.__alt === undefined) {
            m.userData.__alt = {
              roughness: m.roughness,
              metalness: m.metalness,
              nx: m.normalScale?.x ?? 1,
              env: m.envMap,
              envI: m.envMapIntensity,
            };
          }
          const a = m.userData.__alt;
          m.roughness = werte.roughness ?? a.roughness;
          m.metalness = werte.metalness ?? a.metalness;
          if (m.normalScale) m.normalScale.set(werte.normal ?? a.nx, werte.normal ?? a.nx);
          // Umgebungskarte: In einer weissen Leere ist der Raum selbst die
          // Lichtquelle. Ohne sie hat das Leder nur drei gerichtete Lampen und
          // spiegelt nichts — der Grund, aus dem es als Filz liest.
          // Ohne Angabe bleibt die Karte des Stands stehen — sonst nimmt das
          // Werkzeug der Umgebung ihre eigene Umgebungskarte weg und misst
          // einen Zustand, den es selbst erzeugt hat.
          m.envMap = werte.env === undefined ? a.env : window.__envProbe;
          m.envMapIntensity = werte.env === undefined ? a.envI : werte.env;
          m.needsUpdate = true;
          n++;
        }
      });
      return n;
    },
    { werte, knoten: KNOTEN }
  );

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'matrix');
  const shot = shotsFor('matrix').find((s) => s.name === shotName);
  if (!shot) {
    process.stderr.write(`Kein Shot "${shotName}".\n`);
    process.exit(1);
  }
  await lockCamera(page, shot, 6.0);
  await ladeThree(page);
  // Prozedurale Sonde: weisse Kuppel oben, etwas kuehler und dunkler unten —
  // dieselbe Verteilung, die der Nutzer sieht. Der PMREM faltet ueber die
  // Richtung, die Geometrie der Sonde ist gleichgueltig.
  await page.evaluate(() => {
    const T = window.__THREE;
    const szene = new T.Scene();
    const mat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader:
        'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'varying vec3 vD; void main(){ float u = normalize(vD).y * 0.5 + 0.5; vec3 oben = vec3(1.0); vec3 unten = vec3(0.72,0.74,0.78); gl_FragColor = vec4(mix(unten, oben, smoothstep(0.35,0.78,u)), 1.0); }',
    });
    szene.add(new T.Mesh(new T.SphereGeometry(8, 32, 20), mat));
    const gen = new T.PMREMGenerator(window.__app.renderer);
    window.__envProbe = gen.fromScene(szene, 0, 0.1, 30).texture;
    gen.dispose();
  });

  const voll = await bild(page);
  await sichtbar(page, false);
  const ohne = await bild(page);
  await sichtbar(page, true);
  const maske = [];
  for (let i = 0; i < voll.width * voll.height; i++) {
    const j = i * 4;
    const d = Math.max(
      Math.abs(voll.data[j] - ohne.data[j]),
      Math.abs(voll.data[j + 1] - ohne.data[j + 1]),
      Math.abs(voll.data[j + 2] - ohne.data[j + 2])
    );
    // **Die Maske allein reicht nicht.** Blendet man die Sessel aus,
    // verschwindet auch ihr Schlagschatten — die aufgehellten Bodenpixel
    // stehen dann in der Maske und sind mit L 157 bis 222 das Hellste darin.
    // Gemessen wuerde damit der Boden. Darum zusaetzlich die Farbprobe: Leder
    // ist rot, der Boden ist neutral.
    const rot = voll.data[j] > voll.data[j + 2] + 12;
    if (d >= 3 && rot) maske.push(i);
  }
  const n = await stelle(page, {});
  process.stdout.write(`${shotName}  Maske ${maske.length} Punkte  (${n} rote Werkstoffe)\n`);
  process.stdout.write(
    `${'Einstellung'.padEnd(26)}${'p50'.padStart(6)}${'p95'.padStart(6)}${'p99'.padStart(6)}${'max'.padStart(7)}${'>110'.padStart(8)}${'>140'.padStart(8)}${'Korn'.padStart(7)}\n`
  );

  const messen = async (name, werte) => {
    await stelle(page, werte);
    const p = await bild(page);
    const werteL = maske.map((i) => L(p, i * 4));
    const sortiert = [...werteL].sort((a, b) => a - b);
    const q = (f) => sortiert[Math.min(sortiert.length - 1, Math.floor(sortiert.length * f))];
    const anteil = (s) => (sortiert.filter((v) => v > s).length * 100) / sortiert.length;
    // Korn in den hellsten 5 %: 3x3-Hochpass, Mittelwert des Betrags.
    const schwelle = q(0.95);
    let summe = 0;
    let zahl = 0;
    for (let k = 0; k < maske.length; k++) {
      if (werteL[k] <= schwelle) continue;
      const i = maske[k];
      const x = i % p.width;
      const y = (i / p.width) | 0;
      if (x < 1 || y < 1 || x >= p.width - 1 || y >= p.height - 1) continue;
      let umfeld = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          umfeld += L(p, ((y + dy) * p.width + (x + dx)) * 4);
        }
      summe += Math.abs(werteL[k] - umfeld / 8);
      zahl++;
    }
    process.stdout.write(
      `${name.padEnd(26)}${q(0.5).toFixed(0).padStart(6)}${q(0.95).toFixed(0).padStart(6)}${q(0.99).toFixed(0).padStart(6)}${sortiert[sortiert.length - 1].toFixed(0).padStart(7)}` +
        `${(anteil(110).toFixed(2) + '%').padStart(8)}${(anteil(140).toFixed(2) + '%').padStart(8)}${(summe / Math.max(1, zahl)).toFixed(2).padStart(7)}\n`
    );
  };

  await messen('Stand', {});
  await messen('Stand erneut', {});
} finally {
  await browser.close();
  await server.stop();
}
