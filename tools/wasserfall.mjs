// **Warum ist der Wasserfall im Bild ein Strich?**
//
//   node tools/wasserfall.mjs
//
// Der Prüfer: „Größter Abstand zum Himmel 16,2 Stufen; bei y = 360, 380, 400,
// 480, 640, 660 beträgt er 0,0 — der Sturz reißt über je 60 px vollständig ab."
//
// Vier Größen entscheiden darüber, und alle vier lassen sich ausrechnen statt
// vermuten: die Breite des Bandes in Weltmaß, sein Winkel zur Blickrichtung,
// seine Breite im Bild und der Abstand zur Felswand.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'island');
  await ladeThree(page);
  for (const shot of shotsFor('island')) {
    await lockCamera(page, shot, 6.0);
    await page.waitForTimeout(250);
    const d = await page.evaluate(() => {
      const T = window.__THREE;
      const app = window.__app;
      const bahn = app.scene.getObjectByName('waterfall-sheet');
      if (!bahn) return null;
      bahn.updateMatrixWorld(true);
      app.camera.updateMatrixWorld(true);
      const pos = bahn.geometry.attributes.position;
      const v = new T.Vector3();
      // Die Bahn ist als Paar linker/rechter Rand gebaut: gerade Indizes links,
      // ungerade rechts. Damit sind Breite und Normale je Querschnitt direkt da.
      const links = [];
      const rechts = [];
      for (let i = 0; i < pos.count; i += 2) {
        links.push(v.fromBufferAttribute(pos, i).clone().applyMatrix4(bahn.matrixWorld));
        rechts.push(v.fromBufferAttribute(pos, i + 1).clone().applyMatrix4(bahn.matrixWorld));
      }
      const kam = app.camera.getWorldPosition(new T.Vector3());
      const zeilen = [];
      for (const i of [0, Math.floor(links.length / 2), links.length - 1]) {
        const l = links[i];
        const r = rechts[i];
        const mitte = l.clone().add(r).multiplyScalar(0.5);
        const breite = l.distanceTo(r);
        const quer = r.clone().sub(l).normalize();
        const blick = mitte.clone().sub(kam).normalize();
        // Winkel zwischen Bandquerrichtung und Blick: 90 Grad heisst voll
        // sichtbar, 0 Grad heisst genau von der Kante.
        const grad = (Math.acos(Math.min(1, Math.abs(quer.dot(blick)))) * 180) / Math.PI;
        const pl = l.clone().project(app.camera);
        const pr = r.clone().project(app.camera);
        const px = (Math.abs(pr.x - pl.x) / 2) * 1280;
        const py = (Math.abs(pr.y - pl.y) / 2) * 720;
        zeilen.push({
          i,
          breite: breite.toFixed(2),
          abstand: mitte.distanceTo(kam).toFixed(1),
          grad: grad.toFixed(1),
          px: Math.hypot(px, py).toFixed(1),
        });
      }
      return zeilen;
    });
    if (!d) {
      console.log(`${shot.name}: keine Bahn gefunden`);
      continue;
    }
    console.log(`${shot.name}`);
    for (const z of d)
      console.log(
        `   Querschnitt ${String(z.i).padStart(2)}   Breite ${z.breite.padStart(6)} m   Abstand ${z.abstand.padStart(6)} m   Winkel zur Kante ${z.grad.padStart(5)} Grad   im Bild ${z.px.padStart(6)} px`
      );
  }
} finally {
  await browser.close();
  await server.stop();
}
