// **Wo liegt der Boden?**
//
// Auf der Platte konnte man eine Prüfkamera hinschreiben: x, z frei wählen,
// y = 1,6. Auf dem Planeten ist die Augenhöhe eine Kugelschale, und der
// Unterschied zwischen „am Kraterrand" und „im Krater" sind zwei Meter, die man
// nicht raten kann. Das Werkzeug rechnet Bogenlänge und Azimut vom Startpunkt
// in Weltkoordinaten um und fragt das Höhenfeld der Umgebung.
//
//   node tools/planetort.mjs 8.5,-38 11.4,-38 [bogen,azimut …] [--auge 1.6]
//
// Gemeldet werden Richtung, Geländehöhe, der Ort auf der Oberfläche und der
// Ort in Augenhöhe darüber — fertig zum Einsetzen in PLANET_SHOTS.

import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const argv = process.argv.slice(2);
const auge = argv.includes('--auge') ? Number(argv[argv.indexOf('--auge') + 1]) : 1.6;
const orte = argv.filter((a) => /^-?[\d.]+,-?[\d.]+$/.test(a)).map((a) => a.split(',').map(Number));
if (!orte.length) {
  console.error('Beispiel: node tools/planetort.mjs 8.5,-38 11.4,-38');
  process.exit(1);
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  const zeilen = await page.evaluate(
    ({ orte, auge }) => {
      const T = window.__THREE;
      const boden = window.__app.scene.getObjectByName('nacht-welt-boden');
      const heightAt = boden.userData.heightAt;
      const R = 25;
      // Dasselbe Tangentensystem wie in environments.js: Am Nordpol ist Ost
      // die +Z- und Nord die +X-Achse.
      const ost = new T.Vector3(0, 0, 1);
      const nord = new T.Vector3(1, 0, 0);
      return orte.map(([bogen, az]) => {
        const th = bogen / R;
        const a = (az * Math.PI) / 180;
        const d = new T.Vector3(0, 1, 0)
          .multiplyScalar(Math.cos(th))
          .addScaledVector(ost, Math.sin(th) * Math.cos(a))
          .addScaledVector(nord, Math.sin(th) * Math.sin(a))
          .normalize();
        const h = heightAt(d);
        const rs = R + h;
        const ra = rs + auge;
        return {
          bogen,
          az,
          d: [d.x, d.y, d.z],
          h,
          boden: [d.x * rs, d.y * rs, d.z * rs],
          auge: [d.x * ra, d.y * ra, d.z * ra],
        };
      });
    },
    { orte, auge }
  );
  const f = (v) => v.map((x) => x.toFixed(2)).join(', ');
  for (const z of zeilen) {
    console.log(
      `${String(z.bogen).padStart(6)} m  Azimut ${String(z.az).padStart(5)}°   Höhe ${z.h >= 0 ? '+' : ''}${z.h.toFixed(
        2
      )} m
        Richtung  [${z.d.map((x) => x.toFixed(4)).join(', ')}]
        Boden     [${f(z.boden)}]
        Auge      [${f(z.auge)}]   (${auge} m)`
    );
  }
} finally {
  await browser.close();
  await server.stop();
}
