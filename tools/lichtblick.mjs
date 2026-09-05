// **Was sieht das Licht?**
//
//   node tools/lichtblick.mjs [--env matrix] [--shot b-sessel]
//
// Eine Schattenkarte ist nichts anderes als das, was die Lichtquelle sieht. Wenn
// eine Stelle beleuchtet ist, obwohl Geometrie ueber ihr steht, dann fehlt diese
// Geometrie in genau diesem Blick — und dann sieht man hier das Loch.
//
// Das Werkzeug haengt die Pruefkamera auf die Schattenkamera um und legt ein
// Bild ab. Es ist bewusst stumpf: keine Zahl, ein Bild. Bei einem Loch von
// zwanzig Bildpunkten hilft Hinsehen mehr als jede Kennzahl.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { shotsFor, envArg, startServer, launchBrowser, openApp, selectEnv, lockCamera, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const ENV = envArg(argv, 'matrix');
const shotName = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : shotsFor(ENV)[0].name;

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await lockCamera(page, shotsFor(ENV).find((s) => s.name === shotName), 6.0);
  await ladeThree(page);
  const info = await page.evaluate((gruppe) => {
    const app = window.__app;
    const g = app.scene.children.find((c) => c.name === gruppe);
    let licht = null;
    g.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && !licht) licht = o;
    });
    if (!licht) return null;
    licht.shadow.updateMatrices(licht);
    const sc = licht.shadow.camera;
    sc.updateMatrixWorld(true);
    const cam = app.camera;
    if (app.__harnessLock) cancelAnimationFrame(app.__harnessLock);
    cam.position.setFromMatrixPosition(sc.matrixWorld);
    cam.quaternion.setFromRotationMatrix(sc.matrixWorld);
    cam.projectionMatrix.copy(sc.projectionMatrix);
    cam.projectionMatrixInverse.copy(sc.projectionMatrix).invert();
    cam.updateMatrixWorld(true);
    return { links: sc.left, rechts: sc.right, nah: sc.near, fern: sc.far, karte: licht.shadow.mapSize.x };
  }, `env-${ENV}`);
  if (!info) {
    process.stderr.write('Kein schattenwerfendes gerichtetes Licht in dieser Umgebung.\n');
    process.exit(1);
  }
  await page.waitForTimeout(400);
  const ziel = `/tmp/lichtblick-${ENV}.png`;
  fs.writeFileSync(ziel, PNG.sync.write(PNG.sync.read(await page.screenshot())));
  process.stdout.write(
    `Kasten ${info.links}..${info.rechts}, near ${info.nah}, far ${info.fern}, Karte ${info.karte}\n-> ${ziel}\n`
  );
} finally {
  await browser.close();
  await server.stop();
}
