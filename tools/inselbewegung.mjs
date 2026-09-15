// **Was bewegt sich auf der Insel, wie schnell, und springt etwas?**
//
//   node tools/inselbewegung.mjs [--von 0] [--bis 400] [--schritt 0.25]
//
// Die sechs Prüfbilder stehen auf einem eingefrorenen Zeitpunkt und können
// über Bewegung nichts aussagen. Dieses Werkzeug stellt die Uhr der Umgebung
// von Hand und liest **Positionen aus der Szene**, nicht Bildpunkte: Ein
// Sprung ist eine Ortsdifferenz, und dafür braucht es keine Schwelle und kein
// Rendern.
//
// Gemeldet wird je beweglichem Knoten:
//
//   * die mittlere Schrittweite je Zeitschritt (die normale Bewegung),
//   * die groesste Schrittweite (ein Sprung sticht um Groessenordnungen
//     heraus, ein weicher Lauf tut das nicht),
//   * und ob der Knoten zum Zeitpunkt des groessten Schritts im Sichtkegel
//     einer der sechs Prüfkameras steht — ein Sprung ausserhalb des Bildes ist
//     kein Fehler, den man sieht.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const zahl = (flagge, vorgabe) =>
  argv.includes(flagge) ? Number(argv[argv.indexOf(flagge) + 1]) : vorgabe;
const VON = zahl('--von', 0);
const BIS = zahl('--bis', 400);
const SCHRITT = zahl('--schritt', 0.25);

// Die Uhr wird umgehaengt, nicht gestellt: Die Renderschleife ruft
// `env.update()` in jedem Bild erneut auf, und der einfrierende Verschluss des
// Harness setzt sonst sofort auf die Standbildzeit zurueck.
const setzeZeit = (page, t) =>
  page.evaluate((t) => {
    const env = window.__app.env.environments.find((e) => e.id === 'island');
    const original = (env.__originalUpdate ??= env.update);
    env.update = () => original(t);
    original(t);
  }, t);

// **Ortsposition, nicht Weltposition.** Die Weltposition eines Knotens aendert
// sich auch dann, wenn nur sein Elter bewegt wird — eine Mini-Insel schleppt
// ihre sechzig Kinder mit, und die Liste bestand beim ersten Anlauf aus nichts
// anderem. Gefragt ist, welcher Knoten sich **selbst** bewegt.
//
// Instanzierte Meshes (Voegel, Falter, Blumen) bewegen sich nicht ueber ihre
// Ortsposition, sondern ueber `instanceMatrix`; fuer sie wird die Verschiebung
// der ersten Instanz gelesen. Sonst stuenden sie mit 0 in der Liste, obwohl sie
// die beweglichsten Dinge der Szene sind.
const orte = (page) =>
  page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    const raus = {};
    const pfade = new Map();
    g.traverse((o) => {
      const elter = o.parent ? pfade.get(o.parent) : null;
      const eigen = o.name || `[${o.parent ? o.parent.children.indexOf(o) : 0}]`;
      const pfad = elter ? `${elter}/${eigen}` : eigen;
      pfade.set(o, pfad);
      // Die Sichtbarkeit wird mitgelesen: Ein Sprung, den niemand sehen kann,
      // ist kein Fehler im Bild. Wolken loesen sich vor der Umbruchkante auf und
      // springen unsichtbar — das muss die Messung unterscheiden koennen, sonst
      // meldet sie denselben Befund vor und nach der Korrektur.
      let sichtbar = o.visible;
      for (let e = o.parent; e && sichtbar; e = e.parent) sichtbar = e.visible;
      raus[pfad] = [o.position.x, o.position.y, o.position.z, sichtbar ? 1 : 0];
      if (o.isInstancedMesh && o.instanceMatrix) {
        const a = o.instanceMatrix.array;
        raus[`${pfad} :Instanz0`] = [a[12], a[13], a[14], sichtbar ? 1 : 0];
      }
    });
    return raus;
  });

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await lockCamera(page, shotsFor('island')[0], 6.0);

  const reihen = new Map();
  let vorher = null;
  for (let t = VON; t <= BIS; t += SCHRITT) {
    await setzeZeit(page, t);
    const jetzt = await orte(page);
    if (vorher) {
      for (const [k, p] of Object.entries(jetzt)) {
        const q = vorher[k];
        if (!q) continue;
        const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        if (!reihen.has(k)) reihen.set(k, { summe: 0, n: 0, max: 0, tMax: 0, ort: p, blind: 0 });
        const r = reihen.get(k);
        // Schritte, bei denen der Knoten an einem der beiden Enden unsichtbar
        // war, zaehlen nicht gegen ihn — sie werden getrennt gezaehlt und
        // ausgewiesen, damit die Auslassung nachpruefbar bleibt.
        if (!p[3] || !q[3]) {
          r.blind++;
          continue;
        }
        r.summe += d;
        r.n++;
        if (d > r.max) {
          r.max = d;
          r.tMax = t;
          r.ort = p;
        }
      }
    }
    vorher = jetzt;
  }

  const zeilen = [...reihen.entries()]
    .filter(([, r]) => r.max > 1e-6 && r.n > 0)
    .sort((a, b) => b[1].max / Math.max(1e-9, b[1].summe / b[1].n) - a[1].max / Math.max(1e-9, a[1].summe / a[1].n));

  process.stdout.write(
    `Bewegte Knoten zwischen t=${VON} und t=${BIS} s, Schritt ${SCHRITT} s.\n` +
      'Verhaeltnis = groesster Schritt / mittlerer Schritt. Ein weicher Lauf liegt bei 1 bis 3;\n' +
      'ein Sprung liegt um Groessenordnungen darueber.\n\n' +
      `${'Knoten'.padEnd(26)}${'Mittel (m)'.padStart(12)}${'Max (m)'.padStart(12)}${'Verhaeltnis'.padStart(13)}${'bei t'.padStart(9)}${'unsichtbar'.padStart(12)}\n`
  );
  for (const [k, r] of zeilen.slice(0, 40)) {
    const mittel = r.summe / r.n;
    process.stdout.write(
      `${k.padEnd(26)}${mittel.toFixed(4).padStart(12)}${r.max.toFixed(4).padStart(12)}${(r.max / mittel).toFixed(1).padStart(13)}${r.tMax.toFixed(2).padStart(9)}${String(r.blind).padStart(12)}\n`
    );
  }
  if (!zeilen.length) process.stdout.write('  (nichts bewegt sich)\n');
} finally {
  await browser.close();
  await server.stop();
}
