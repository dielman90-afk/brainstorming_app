// **Welcher Bodenpunkt liegt unter diesem Bildpunkt?**
//
//   node tools/bodenpunkt.mjs [--env zen] [--hoehe -0.02] <shot> <x,y> [<x,y> …]
//
// `wasistda.mjs` schiesst einen Strahl auf die Netze und meldet Namen. Das ist
// das richtige Werkzeug fuer „welches Ding ist das"; fuer „wie weit ist der
// Boden dort weg" ist es das falsche, weil jeder Treffer von der Netzlage
// abhaengt und ein durchsichtiges oder beidseitiges Netz die Reihenfolge
// verdreht.
//
// Hier wird kein Netz gefragt. Der Strahl der **lebenden Kamera** wird mit
// einer waagerechten Ebene geschnitten — reine Rechnung, kein Netz, kein
// Sortieren. Gemeldet werden Weltort, Abstand vom Gartenmittelpunkt und
// Abstand von der Kamera.
//
// Gebraucht habe ich das, weil ich im Zen-Garten einen Streifen am unteren
// Bildrand einer falschen Entfernung zugeordnet und daraufhin vier Versuche
// an der falschen Stelle gefahren habe.
import { envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, shotsFor, VIEWPORT } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'zen');
const hi = argv.indexOf('--hoehe');
const HOEHE = hi >= 0 ? Number(argv[hi + 1]) : 0;
const rest = argv.filter(
  (a, i) => !a.startsWith('--') && argv[i - 1] !== '--env' && argv[i - 1] !== '--hoehe'
);
const shotName = rest[0];
const punkte = rest.slice(1).map((s) => s.split(',').map(Number));
const shot = shotsFor(ENV).find((s) => s.name === shotName);
if (!shot || punkte.length === 0) {
  console.error('node tools/bodenpunkt.mjs [--env zen] [--hoehe 0] <shot> <x,y> …');
  process.exit(1);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await lockCamera(page, shot, 6.0);
  await page.waitForTimeout(400);
  const aus = await page.evaluate(
    ({ punkte, hoehe, vw, vh, pos, look, fov }) => {
      const T = window.__THREE;
      const cam = window.__app.camera;
      // **Ohne das steht die Kamera unverdreht.** `lockCamera` setzt Ort und
      // Blickrichtung in einer eigenen rAF-Schleife; die Weltmatrix, aus der
      // `unproject` rechnet, traegt zum Zeitpunkt dieses Aufrufs aber den
      // Stand der App-Schleife. Gemessen lieferte die Bildmitte daraufhin
      // (10 | -69) statt (0 | 0) — die Kamera schaute geradeaus statt zum
      // Ursprung. Dieselbe Falle steckt in `wasistda.mjs`.
      cam.position.set(pos[0], pos[1], pos[2]);
      cam.up.set(0, 1, 0);
      cam.lookAt(look[0], look[1], look[2]);
      cam.fov = fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      const zeile = [];
      for (const [px, py] of punkte) {
        const ndc = new T.Vector3((px / vw) * 2 - 1, -((py / vh) * 2 - 1), 0.5);
        ndc.unproject(cam);
        const dir = ndc.sub(cam.position).normalize();
        const t = (hoehe - cam.position.y) / dir.y;
        const p = cam.position.clone().addScaledVector(dir, t);
        zeile.push({
          px,
          py,
          x: p.x,
          z: p.z,
          r: Math.hypot(p.x, p.z),
          d: t < 0 ? Infinity : cam.position.distanceTo(p),
        });
      }
      return { kamera: cam.position.toArray(), fov: cam.fov, aspect: cam.aspect, zeile };
    },
    { punkte, hoehe: HOEHE, vw: VIEWPORT.width, vh: VIEWPORT.height, pos: shot.pos, look: shot.look, fov: shot.fov }
  );
  console.log(
    `${ENV}/${shotName}   Kamera (${aus.kamera.map((v) => v.toFixed(2)).join(' | ')})  fov ${aus.fov}  Seitenverhaeltnis ${aus.aspect.toFixed(3)}`
  );
  for (const z of aus.zeile) {
    console.log(
      `  (${String(z.px).padStart(4)},${String(z.py).padStart(4)})  Welt (${z.x.toFixed(2)} | ${z.z.toFixed(2)})   ` +
        `r ${z.r.toFixed(2)} m   Kameraabstand ${Number.isFinite(z.d) ? z.d.toFixed(2) + ' m' : 'ueber dem Horizont'}`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
