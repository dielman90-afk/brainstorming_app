// **Welcher Knoten malt den hellen Fleck in den Felskiel?**
//
//   node tools/kielfleck.mjs [<shot>] [<x0> <y0> <x1> <y1>]
//
// Der Pruefer meldet in `3-edge-down` einen Kasten (400,385)–(480,425) mit
// Mittel 88,8 gegen 47,4 daneben — eine erdfarbene Insel mitten im dunklen
// Kiel. Zwei Vermutungen haben sich schon als falsch erwiesen (eine tiefe
// Erdzunge; die Vertexfarbe des Fels), beide durch Hinsehen statt Messen.
//
// Also differenziell: Jeder benannte Knoten der Umgebung wird einmal
// ausgeblendet, und gemeldet wird, wie stark sich der Kasten dadurch aendert.
// Der Knoten, der den Fleck malt, ist der, ohne den der Kasten dunkel wird.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0] ?? '3-edge-down';
const K = argv.length >= 5 ? argv.slice(1, 5).map(Number) : [400, 385, 480, 425];

const namen = (page) =>
  page.evaluate(() => {
    const g = window.__app.scene.children.find((c) => c.name === 'env-island');
    const s = new Set();
    g.traverse((o) => {
      if (o.name && o !== g) s.add(o.name);
    });
    return [...s];
  });

const sichtbar = (page, name, an) =>
  page.evaluate(
    ({ name, an }) => {
      const g = window.__app.scene.children.find((c) => c.name === 'env-island');
      g.traverse((o) => {
        if (o.name === name) o.visible = an;
      });
    },
    { name, an }
  );

const mittel = (p) => {
  let s = 0;
  let n = 0;
  for (let y = K[1]; y <= K[3]; y++)
    for (let x = K[0]; x <= K[2]; x++) {
      const i = (y * p.width + x) * 4;
      s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
      n++;
    }
  return s / n;
};

const bild = async (page) => {
  await page.waitForTimeout(300);
  return PNG.sync.read(await page.screenshot());
};

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await lockCamera(page, shotsFor('island').find((s) => s.name === shotName), 6.0);
  await ladeThree(page);

  // --- Was steht dort ueberhaupt? -------------------------------------------
  //
  // Ein Strahl durch die Kastenmitte beantwortet in einem Zug, welcher Knoten
  // getroffen wird, wie seine Flaechennormale liegt und ob die Sonne sie
  // ueberhaupt sehen kann. Ohne das bleibt „heller Fleck" eine Vermutung.
  // Mehrere Bildpunkte auf einmal, darunter zwei zur Kontrolle: einer mitten
  // in der Wiese, einer tief im Kiel. Stimmt die Abbildung Bildpunkt ->
  // Strahl, muss der eine Gras und der andere Fels treffen. Tut er das nicht,
  // misst der Strahl etwas anderes als das Auge sieht — und dann ist jede
  // Aussage ueber „die Flaeche dort" wertlos.
  const punkte = [
    ['Kastenmitte', (K[0] + K[2]) / 2, (K[1] + K[3]) / 2],
    ['Wiese oben', 640, 90],
    ['Kiel Mitte', 640, 450],
    ['Kiel links', 250, 300],
  ];
  const treffer = await page.evaluate(
    ({ punkte }) => {
      const T = window.__THREE;
      const app = window.__app;
      const g = app.scene.children.find((c) => c.name === 'env-island');
      const cam = app.camera;
      cam.updateMatrixWorld(true);
      const gr = new T.Vector2();
      app.renderer.getSize(gr);
      let sonne = null;
      app.scene.traverse((o) => {
        if (o.isDirectionalLight && o.castShadow && (!sonne || o.intensity > sonne.intensity)) sonne = o;
      });
      const a = new T.Vector3();
      const b = new T.Vector3();
      sonne.getWorldPosition(a);
      sonne.target.getWorldPosition(b);
      const L = a.sub(b).normalize();
      const rc = new T.Raycaster();
      const raus = punkte.map(([name, px, py]) => {
        rc.setFromCamera(new T.Vector2((px / gr.x) * 2 - 1, -((py / gr.y) * 2 - 1)), cam);
        const hits = rc.intersectObject(g, true).filter((h) => h.object.visible);
        return {
          name,
          px,
          py,
          // **Was steht zwischen dieser Stelle und der Sonne?** Das ist die
          // eigentliche Frage bei einem Loch im Schlagschatten: Ist die Stelle
          // wirklich unverdeckt (dann fehlt Geometrie), oder verdeckt sie
          // etwas, das im Schattendurchgang nicht mitzeichnet (dann fehlt ein
          // Werfer)?
          zurSonne: (() => {
            if (!hits.length) return null;
            const p0 = hits[0].point.clone().addScaledVector(L, 0.05);
            const rc2 = new T.Raycaster(p0, L.clone());
            // Sprites brauchen eine Kamera zum Raycasten; ohne sie wirft
            // `Sprite.raycast` beim ersten Sonnen- oder Nebelsprite.
            rc2.camera = cam;
            return rc2
              .intersectObject(g, true)
              .filter((h) => h.object.visible)
              .slice(0, 4)
              .map((h) => ({
                knoten: h.object.name || '(ohne Namen)',
                d: h.distance,
                wirft: !!h.object.castShadow,
              }));
          })(),
          treffer: hits.slice(0, 3).map((x) => {
            const nn = x.face
              ? x.face.normal.clone().transformDirection(x.object.matrixWorld).normalize()
              : null;
            return {
              knoten: x.object.name || '(ohne Namen)',
              d: x.distance,
              gruppe: x.face?.materialIndex,
              n: nn ? [nn.x, nn.y, nn.z] : null,
              NdotL: nn ? nn.dot(L) : null,
            };
          }),
        };
      });
      return { gr: [gr.x, gr.y], L: [L.x, L.y, L.z], raus };
    },
    { punkte }
  );
  process.stdout.write(
    `Zeichenpuffer ${treffer.gr[0]}x${treffer.gr[1]}, Sonnenrichtung (${treffer.L.map((v) => v.toFixed(3)).join(' | ')})\n`
  );
  for (const p of treffer.raus) {
    process.stdout.write(`  ${p.name.padEnd(13)} Bildpunkt ${p.px},${p.py}\n`);
    if (!p.treffer.length) process.stdout.write('    (kein Treffer)\n');
    for (const x of p.treffer)
      process.stdout.write(
        `    ${x.d.toFixed(2).padStart(7)} m  ${x.knoten.padEnd(16)} Gruppe ${x.gruppe}  n=(${x.n.map((v) => v.toFixed(2)).join(' | ')})  N-Punkt-L ${x.NdotL.toFixed(3)}\n`
      );
    const zs = p.zurSonne;
    process.stdout.write(
      zs && zs.length
        ? `    zur Sonne: ${zs.map((x) => `${x.d.toFixed(2)} m ${x.knoten}${x.wirft ? '' : ' (wirft KEINEN Schatten)'}`).join(', ')}\n`
        : '    zur Sonne: nichts im Weg -> die Stelle ist wirklich unverdeckt\n'
    );
  }
  process.stdout.write('\n');

  const voll = mittel(await bild(page));
  process.stdout.write(`${shotName}, Kasten ${K.join(',')} — Stand ${voll.toFixed(1)}\n\n`);
  const zeilen = [];
  for (const name of await namen(page)) {
    await sichtbar(page, name, false);
    const ohne = mittel(await bild(page));
    await sichtbar(page, name, true);
    if (Math.abs(ohne - voll) >= 0.5) zeilen.push([name, ohne]);
  }
  zeilen.sort((a, b) => Math.abs(b[1] - voll) - Math.abs(a[1] - voll));
  for (const [name, ohne] of zeilen)
    process.stdout.write(
      `  ohne ${name.padEnd(24)} ${ohne.toFixed(1).padStart(6)}   (${(ohne - voll >= 0 ? '+' : '') + (ohne - voll).toFixed(1)})\n`
    );
  if (!zeilen.length) process.stdout.write('  (kein Knoten aendert den Kasten um mehr als 0,5)\n');

  // --- Und welches Licht? ---------------------------------------------------
  //
  // Ein heller Fleck kann aus der Vertexfarbe kommen oder aus der Beleuchtung.
  // Die erste Vermutung war die Farbe und war falsch; also wird auch das Licht
  // gemessen statt geraten. Die Schalter bauen aufeinander auf.
  const lichter = await page.evaluate(() => {
    const raus = [];
    window.__app.scene.traverse((o) => {
      if (o.isLight) raus.push(`${o.type} ${o.name || '(ohne Namen)'}  Staerke ${o.intensity.toFixed(2)}  wirft Schatten: ${o.castShadow ? 'ja' : 'nein'}`);
    });
    return raus;
  });
  process.stdout.write(`\nLichter der Szene:\n${lichter.map((l) => '  ' + l).join('\n')}\n\nSchalter:\n`);
  const schalter = [
    ['Sonnenschatten aus', () => window.__app.scene.traverse((o) => { if (o.isDirectionalLight) o.castShadow = false; })],
    ['Sonne aus', () => window.__app.scene.traverse((o) => { if (o.isDirectionalLight) o.visible = false; })],
    ['alle Lichter aus', () => window.__app.scene.traverse((o) => { if (o.isLight) o.visible = false; })],
  ];
  for (const [was, fn] of schalter) {
    await page.evaluate(fn);
    const w = mittel(await bild(page));
    process.stdout.write(`  ${was.padEnd(24)} ${w.toFixed(1).padStart(6)}   (${(w - voll >= 0 ? '+' : '') + (w - voll).toFixed(1)})\n`);
  }
} finally {
  await browser.close();
  await server.stop();
}
