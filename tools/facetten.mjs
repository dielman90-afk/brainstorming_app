// **Warum ist diese Facette dunkler als jene?**
//
//   node tools/facetten.mjs <shot> <x,y> [<x,y> ...]
//
// Der Pruefer meldet an den Findlingen, die nach OBEN weisende Facette sei
// dunkler als eine seitliche oder nach unten weisende — bei drei von vier
// Steinen um 31 bis 39 Luminanzstufen. Das waere, wenn es an der Vertexfarbe
// laege, ein Fehler; wenn es an der Verdeckung liegt, ist es Physik.
//
// Je Bildpunkt wird deshalb alles zusammen ausgelesen, was die Frage
// entscheidet:
//
//   * welcher Knoten und welche Werkstoffgruppe getroffen wird,
//   * die WELTNORMALE der Flaeche und ihr N·L zur Sonne,
//   * ob zwischen der Stelle und der Sonne Geometrie steht (und ob sie wirft),
//   * und der gemessene Bildwert an derselben Stelle.
//
// Damit laesst sich „dunkel, weil abgewandt" von „dunkel, weil verdeckt" und
// von „dunkel, weil falsch gefaerbt" trennen, ohne zu raten.
import { PNG } from 'pngjs';
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const shotName = argv[0];
const PUNKTE = argv.slice(1).map((s) => s.split(',').map(Number));
if (!shotName || !PUNKTE.length) {
  process.stderr.write('Aufruf: node tools/facetten.mjs <shot> <x,y> [<x,y> ...]\n');
  process.exit(1);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await lockCamera(page, shotsFor('island').find((s) => s.name === shotName), 6.0);
  await ladeThree(page);
  await page.waitForTimeout(320);
  const bild = PNG.sync.read(await page.screenshot());

  const daten = await page.evaluate((PUNKTE) => {
    const T = window.__THREE;
    const app = window.__app;
    const g = app.scene.children.find((c) => c.name === 'env-island');
    const cam = app.camera;
    cam.updateMatrixWorld(true);
    const gr = new T.Vector2();
    app.renderer.getSize(gr);
    // Nur die Sonne der INSEL, nicht die erstbeste der Szene — die Szene
    // enthaelt die Lichter aller Umgebungen.
    let sonne = null;
    g.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && !sonne) sonne = o;
    });
    const a = new T.Vector3();
    const b = new T.Vector3();
    sonne.getWorldPosition(a);
    sonne.target.getWorldPosition(b);
    const L = a.sub(b).normalize();
    const rc = new T.Raycaster();
    return PUNKTE.map(([px, py]) => {
      rc.setFromCamera(new T.Vector2((px / gr.x) * 2 - 1, -((py / gr.y) * 2 - 1)), cam);
      const treffer = rc.intersectObject(g, true).filter((h) => h.object.visible);
      if (!treffer.length) return { px, py, leer: true };
      const h = treffer[0];
      const n = h.face
        ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
        : null;
      const rc2 = new T.Raycaster(h.point.clone().addScaledVector(L, 0.05), L.clone());
      rc2.camera = cam;
      const davor = rc2
        .intersectObject(g, true)
        .filter((x) => x.object.visible)
        .slice(0, 3)
        .map((x) => `${x.distance.toFixed(2)} m ${x.object.name || '(ohne Namen)'}${x.object.castShadow ? '' : ' [wirft nicht]'}`);
      return {
        px,
        py,
        knoten: h.object.name || '(ohne Namen)',
        gruppe: h.face?.materialIndex,
        d: h.distance,
        n: n ? [n.x, n.y, n.z] : null,
        NdotL: n ? n.dot(L) : null,
        davor,
      };
    });
  }, PUNKTE);

  const lum = (x, y) => {
    const i = (y * bild.width + x) * 4;
    return 0.2126 * bild.data[i] + 0.7152 * bild.data[i + 1] + 0.0722 * bild.data[i + 2];
  };
  process.stdout.write(`${shotName}\n`);
  for (const t of daten) {
    if (t.leer) {
      process.stdout.write(`  ${t.px},${t.py}  (kein Treffer)\n`);
      continue;
    }
    process.stdout.write(
      `  ${String(t.px + ',' + t.py).padEnd(10)} L=${lum(t.px, t.py).toFixed(1).padStart(5)}  ${t.knoten} (Gruppe ${t.gruppe}, ${t.d.toFixed(1)} m)\n` +
        `             Normale (${t.n.map((v) => v.toFixed(2)).join(' | ')})  N-Punkt-L ${t.NdotL.toFixed(3)}\n` +
        `             zur Sonne: ${t.davor.length ? t.davor.join(', ') : 'frei'}\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
