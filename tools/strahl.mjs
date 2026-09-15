// **Was steht in diesem Pixel?**
//
// Das Werkzeug, dessen Fehlen drei Bau- und Renderzyklen gekostet hat: In
// Paket 7 stand eine fahle Platte in `d-aerial`, und ich habe der Reihe nach
// die Kuppelfarben, die Färbung des Fernrings und die Kante der Bodenplatte
// verdächtigt — alles falsch. Ein Strahl durch das Pixel traf `nacht-huegel`
// in 39,9 m. Das ist seither die **erste** Handlung bei einem unerklärten
// Fleck, nicht die vierte.
//
//   node tools/strahl.mjs --env night --shot a-augenhoehe 610,200 [x,y …]
//
// `--alle` zeigt auch Treffer auf abgeschalteten Umgebungen.
//
// Gemeldet wird je Treffer der Objektname, die Entfernung, die Zeichenreihen-
// folge und die Weltkoordinate — in der Reihenfolge, in der der Strahl sie
// durchschlägt. Additive Punktwolken und Sprites werden mitgeprüft; sie
// erscheinen im Bild oft dort, wo die Geometrie schon lange durch ist.

import {
  shotsFor,
  envArg,
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  placeCamera,
  ladeThree,
} from './harness-common.mjs';

const argv = process.argv.slice(2);
const envId = envArg(argv, 'night');
const alle = argv.includes('--alle'); // auch unsichtbare Treffer zeigen
const shotName = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : shotsFor(envId)[0].name;
const punkte = argv
  .filter((a) => /^\d+,\d+$/.test(a))
  .map((a) => a.split(',').map(Number));
if (!punkte.length) {
  console.error('Kein Punkt angegeben. Beispiel: node tools/strahl.mjs --shot a-augenhoehe 610,200');
  process.exit(1);
}

const shot = shotsFor(envId).find((s) => s.name === shotName);
if (!shot) throw new Error(`Kamera "${shotName}" gibt es in "${envId}" nicht`);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, envId);
  await placeCamera(page, shot);
  await ladeThree(page);

  const ergebnis = await page.evaluate(({ punkte }) => {
    const T = window.__THREE;
    const { camera, scene, renderer } = window.__app;
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const rc = new T.Raycaster();
    // Punktwolken sind sonst praktisch untreffbar: Der Schwellwert ist ein
    // Weltradius um den Strahl, und ein Staubkorn hat keine Fläche.
    rc.params.Points.threshold = 0.5;
    return punkte.map(([px, py]) => {
      const ndc = new T.Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1);
      rc.setFromCamera(ndc, camera);
      const hits = rc.intersectObjects(scene.children, true).slice(0, 8);
      return {
        px,
        py,
        richtung: [rc.ray.direction.x, rc.ray.direction.y, rc.ray.direction.z].map((v) => +v.toFixed(3)),
        treffer: hits.map((t) => {
          // **Sichtbarkeit muss die Kette hoch geprüft werden.** Der Raycaster
          // von three prüft `visible` überhaupt nicht, und die abgeschalteten
          // Umgebungen sind nur an ihrer Wurzelgruppe unsichtbar — ihre Kinder
          // stehen weiter auf `true`. Ohne diese Schleife meldet das Werkzeug
          // die Wolkenschalen der Himmelsinsel als Treffer im Nachthimmel.
          let sichtbar = true;
          let wurzel = t.object.name || '';
          for (let o = t.object; o; o = o.parent) {
            if (o.visible === false) sichtbar = false;
            if (o.parent && o.parent.type === 'Scene') wurzel = o.name || `(${o.type})`;
          }
          return {
            name: t.object.name || `(${t.object.type})`,
            wurzel,
            dist: +t.distance.toFixed(2),
            ro: t.object.renderOrder,
            sichtbar,
            ort: [t.point.x, t.point.y, t.point.z].map((v) => +v.toFixed(2)),
          };
        }),
      };
    });
  }, { punkte });

  console.log(`${envId} / ${shotName}  (${shot.pos.join(' | ')}) → (${shot.look.join(' | ')})\n`);
  for (const e of ergebnis) {
    console.log(`Pixel ${e.px},${e.py}  Strahl ${e.richtung.join(' ')}`);
    if (!e.treffer.length) console.log('   — nichts getroffen (Himmel ohne Geometrie)');
    const gezeigt = alle ? e.treffer : e.treffer.filter((t) => t.sichtbar);
    if (!gezeigt.length) console.log('   — nichts Sichtbares getroffen');
    for (const t of gezeigt) {
      console.log(
        `   ${t.dist.toFixed(2).padStart(8)} m  ${t.name.padEnd(22)} [${t.wurzel}] ro=${t.ro}  ${
          t.sichtbar ? '' : '(unsichtbar) '
        }bei ${t.ort.join(' | ')}`
      );
    }
    console.log('');
  }
} finally {
  await browser.close();
  await server.stop();
}
