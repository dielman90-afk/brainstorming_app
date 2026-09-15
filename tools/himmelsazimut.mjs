// **Folgt der Himmelsverlauf der Sonne?**
//
//   node tools/himmelsazimut.mjs [--env island] [--hoehe 0,6,14,30,60]
//
// Der Prüfer hat den Verdacht geäußert, der Farbverlauf der Kuppel richte sich
// nach der Höhe und sonst nach nichts — dann stünde derselbe Himmel über der
// Sonne wie in ihrem Rücken, und das ist an einem klaren Tag der auffälligste
// Unterschied überhaupt.
//
// Gemessen wird nicht am Prüfbild, sondern an der Kuppel selbst: Alles außer
// ihr wird ausgeblendet, die Kamera steht im Mittelpunkt und blickt der Reihe
// nach in feste Richtungen. Der Bildpunkt in der Mitte IST dann die Farbe der
// Kuppel in dieser Richtung — kein Gelände, kein Nebel, keine Deutung.
//
// Die Ausgabe steht in Azimut relativ zur Sonne: 0 Grad heißt „in die Sonne",
// 180 Grad heißt „in ihrem Rücken".
import { PNG } from 'pngjs';
import { envArg, startServer, launchBrowser, openApp, selectEnv, ladeThree, SCHUSS } from './harness-common.mjs';

const argv = process.argv.slice(2);
const wert = (n, v) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : v);
const ENV = envArg(argv, 'island');
const HOEHEN = wert('--hoehe', '0,6,14,30,60').split(',').map(Number);
const SCHRITT = Number(wert('--schritt', '30'));

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, ENV);
  await ladeThree(page);

  // Nur die Kuppel. Sie ist am Fragment-Uniform `horizonColor` zu erkennen —
  // ein Name im Szenenbaum wäre ein Eingriff in src/.
  await page.evaluate((g) => {
    window.__envGruppe = g;
  }, `env-${ENV}`);
  const gefunden = await page.evaluate(() => {
    const app = window.__app;
    app.env.setWalkEnabled?.(false);
    // **Nur in der eigenen Umgebungsgruppe suchen.** Alle fuenf Umgebungen
    // haengen gleichzeitig in der Szene, drei von ihnen haben eine Kuppel —
    // der erste Anlauf fand die weisse Kuppel der Matrix und meldete fuer
    // jede Richtung und jede Hoehe denselben Wert 248.
    const gruppe = app.scene.getObjectByName(window.__envGruppe);
    let dome = null;
    gruppe?.traverse((o) => {
      if (o.isMesh && o.material?.uniforms?.horizonColor && o.material?.uniforms?.sunDir) dome = o;
    });
    if (!dome) return null;
    app.scene.traverse((o) => {
      o.userData.__sichtbarVorher = o.visible;
      o.visible = false;
    });
    for (let o = dome; o; o = o.parent) o.visible = true;
    const s = dome.material.uniforms.sunDir.value;
    return { sun: [s.x, s.y, s.z] };
  });
  if (!gefunden) {
    process.stderr.write(`Keine Kuppel in Umgebung "${ENV}".\n`);
    process.exit(1);
  }
  const sun = gefunden.sun;
  const sunAz = (Math.atan2(sun[0], -sun[2]) * 180) / Math.PI;
  const sunEl = (Math.asin(sun[1]) * 180) / Math.PI;
  process.stdout.write(
    `${ENV}: Sonne bei Azimut ${sunAz.toFixed(1)} Grad, Hoehe ${sunEl.toFixed(1)} Grad\n\n`
  );

  const punkt = async (azRel, hoehe) => {
    const az = ((sunAz + azRel) * Math.PI) / 180;
    const el = (hoehe * Math.PI) / 180;
    // Weltrichtung: Azimut 0 zeigt nach -Z, wächst nach +X (wie oben gerechnet).
    const d = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
    // Die Kamera muss jedes Bild neu gesetzt werden, sonst schreibt die
    // Bildschleife der App sie ueber (dieselbe Lehre wie in `lockCamera`).
    await page.evaluate(
      ({ d }) => {
        const app = window.__app;
        window.__ziel = d;
        if (!app.__himmelLock) {
          const tick = () => {
            const z = window.__ziel;
            app.player.position.set(0, 0, 0);
            app.player.rotation.set(0, 0, 0);
            app.camera.fov = 20;
            app.camera.position.set(0, 1.6, 0);
            app.camera.up.set(0, 1, 0);
            app.controls.target.set(z[0] * 10, 1.6 + z[1] * 10, z[2] * 10);
            app.camera.lookAt(z[0] * 10, 1.6 + z[1] * 10, z[2] * 10);
            app.camera.updateProjectionMatrix();
            app.__himmelLock = requestAnimationFrame(tick);
          };
          tick();
        }
      },
      { d }
    );
    await page.waitForTimeout(120);
    const png = PNG.sync.read(await page.screenshot(SCHUSS));
    // Mittel über 9x9 in der Bildmitte: ein einzelner Bildpunkt wäre
    // anfällig für die Rasterung der Kuppelgeometrie.
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    const cx = png.width >> 1;
    const cy = png.height >> 1;
    for (let y = cy - 4; y <= cy + 4; y++)
      for (let x = cx - 4; x <= cx + 4; x++) {
        const j = (y * png.width + x) * 4;
        r += png.data[j];
        g += png.data[j + 1];
        b += png.data[j + 2];
        n++;
      }
    return [r / n, g / n, b / n];
  };

  for (const hoehe of HOEHEN) {
    process.stdout.write(`Hoehe ${String(hoehe).padStart(3)} Grad\n`);
    process.stdout.write(
      `${'zur Sonne'.padStart(10)}${'R'.padStart(7)}${'G'.padStart(7)}${'B'.padStart(7)}${'L'.padStart(7)}${'dL'.padStart(7)}${'warm'.padStart(7)}\n`
    );
    const reihe = [];
    for (let a = 0; a < 360; a += SCHRITT) reihe.push([a, await punkt(a, hoehe)]);
    const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const l0 = L(reihe[0][1]);
    for (const [a, c] of reihe) {
      process.stdout.write(
        `${String(a).padStart(10)}${c[0].toFixed(1).padStart(7)}${c[1].toFixed(1).padStart(7)}${c[2].toFixed(1).padStart(7)}${L(c).toFixed(1).padStart(7)}${(L(c) - l0).toFixed(1).padStart(7)}${(c[0] - c[2]).toFixed(1).padStart(7)}\n`
      );
    }
    const ls = reihe.map(([, c]) => L(c));
    process.stdout.write(
      `  Spanne ueber den Azimut: ${(Math.max(...ls) - Math.min(...ls)).toFixed(2)} Stufen\n\n`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
