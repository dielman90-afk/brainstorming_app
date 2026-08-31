// **Liegt die Sterndichte am Bildrand am Rendern oder an der Verteilung?**
//
//   node tools/sternprojektion.mjs [--shot a-augenhoehe]
//
// Die Zahl der Sterne je Bildfläche fällt zum Bildrand hin ab. Ein Teil davon
// ist reine Optik: Eine geradlinige Projektion streckt den Rand, ein
// Raumwinkel deckt dort um 1/cos³θ mehr Bildpunkte ab. Gemessen fällt sie aber
// **stärker**, auf etwa die Hälfte des Erwarteten.
//
// Zwei Erklärungen sind möglich, und sie schließen sich aus:
//
//   A  Das Rendern verliert Sterne am Rand (Beschnitt, Punktgröße, Schwelle).
//   B  Der Himmel ist am Rand wirklich dünner — die Milchstraße steht in der
//      Bildmitte und hebt die Referenz an.
//
// Dieses Werkzeug entscheidet es: Es projiziert **alle** Scheitelpunkte des
// Sternfelds durch dieselbe Kamera und zählt sie je Band. Stimmt das mit der
// Zählung im Bild überein, war es die Verteilung; klafft es auseinander, das
// Rendern.
import { shotsFor, startServer, launchBrowser, openApp, selectEnv, ladeThree, lockCamera } from './harness-common.mjs';

const argv = process.argv.slice(2);
const name = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : 'a-augenhoehe';
const shot = shotsFor('night').find((s) => s.name === name);
if (!shot) throw new Error(`Kein Bild "${name}"`);

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  await lockCamera(page, shot, 6.0);
  await page.waitForTimeout(450);
  const daten = await page.evaluate(({ y0, y1, baender }) => {
    const T = window.__THREE;
    const app = window.__app;
    const sterne = app.scene.getObjectByName('nacht-sterne');
    const pos = sterne.geometry.attributes.position;
    const groesse = sterne.geometry.attributes.groesse;
    const W = app.renderer.getContext().drawingBufferWidth;
    const H = app.renderer.getContext().drawingBufferHeight;
    sterne.updateMatrixWorld(true);
    app.camera.updateMatrixWorld(true);
    const v = new T.Vector3();
    const zaehler = new Array(baender).fill(0);
    const hell = new Array(baender).fill(0);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(sterne.matrixWorld).project(app.camera);
      if (v.z < -1 || v.z > 1) continue;
      const x = ((v.x + 1) / 2) * W;
      const y = ((1 - v.y) / 2) * H;
      if (x < 0 || x >= W || y < y0 || y > y1) continue;
      const b = Math.min(baender - 1, Math.floor((x / W) * baender));
      zaehler[b]++;
      hell[b] += groesse.getX(i);
    }
    return { zaehler, hell, W, H };
  }, { y0: 0, y1: 260, baender: 8 });

  const { zaehler, hell, W, H } = daten;
  const breite = W / 8;
  const brenn = H / 2 / Math.tan(((shot.fov / 2) * Math.PI) / 180);
  console.log(`${name} (fov ${shot.fov}°), projizierte Sterne im Band y 0..260`);
  // **Die Spalte, auf die es ankommt, ist die letzte.** Dichte je Bildfläche
  // mal Streckung ist die Dichte je **Raumwinkel** — und die ist die Frage:
  // Ein gleichmäßig besetzter Himmel hat sie überall gleich, ganz gleich, wie
  // die Kamera steht.
  console.log('  Band     θ      Sterne   je 10^5 px²   erwartet (1/cos³θ)   Verhältnis   je Raumwinkel');
  const werte = zaehler.map((n, b) => {
    const mx = (b + 0.5) * breite - W / 2;
    const my = 130 - H / 2;
    const theta = (Math.atan(Math.hypot(mx, my) / brenn) * 180) / Math.PI;
    return { b, n, theta, dichte: (n * 1e5) / (breite * 260), streckung: 1 / Math.pow(Math.cos((theta * Math.PI) / 180), 3) };
  });
  const mitte = werte.reduce((a, w) => (w.theta < a.theta ? w : a));
  for (const w of werte) {
    const erwartet = (mitte.dichte * mitte.streckung) / w.streckung;
    console.log(
      `  ${String(w.b).padStart(4)}  ${w.theta.toFixed(1).padStart(6)}°  ${String(w.n).padStart(6)}   ${w.dichte.toFixed(1).padStart(11)}   ${erwartet.toFixed(1).padStart(18)}   ${(w.dichte / erwartet).toFixed(2).padStart(10)}   ${(w.dichte * w.streckung).toFixed(0).padStart(13)}`
    );
  }
  console.log(`  Summe projiziert: ${zaehler.reduce((a, b) => a + b, 0)} Sterne`);
} finally {
  await browser.close();
  await server.stop();
}
