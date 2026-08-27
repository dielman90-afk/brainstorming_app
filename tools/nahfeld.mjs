// **Was liegt in Armeslänge?**
//
// Der Prüfer hat das untere Bilddrittel als leer gemeldet: „bei 15 von 20
// Bildern unter 0,7 %, bei dreien 0,00 %". Für die Augenhöhenkamera ist
// gerechnet, welchen Bogen dieses Drittel überhaupt zeigt — bei Neigung −15°
// und 70° Bildwinkel ist es das Band von **1,4 bis 3,7 m**. Darüber steht schon
// der Horizont bei 8,9 m.
//
// **Diese Kamera blickt aber 30° neben die Laufrichtung.** Sie schaut zum Mond,
// nicht nach vorn. Ein Block, der bei 2,5 m Querabstand neben der Bahn liegt,
// steht aus 2,7 m Entfernung unter 43° zur Bahn — auf der einen Seite fällt er
// damit knapp ins Bild, auf der anderen liegt er 73° neben der Achse und damit
// außerhalb der halben Bildbreite von 52°. **Die Hälfte aller Nahanker kann
// diese Kamera grundsätzlich nicht sehen.** Wer daraus schließt, es liege nichts
// da, misst die Kamera und nicht die Szene.
//
// Dieses Werkzeug misst deshalb, was ein *Gehender* sieht: an zwölf Stationen
// des Rundgangs je drei Blickrichtungen — geradeaus in Laufrichtung und 45°
// nach links und rechts —, alle mit derselben Neigung von −15°. Sechsunddreißig
// Ansichten, und je Ansicht der Kantenanteil im unteren Bilddrittel nach
// demselben Maß wie `tools/komposition.mjs`.
//
//   node tools/nahfeld.mjs [--bilder <ordner>]

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { startServer, launchBrowser, openApp, selectEnv, ladeThree, ROOT } from './harness-common.mjs';

const argv = process.argv.slice(2);
const outDir = argv.includes('--bilder')
  ? path.resolve(ROOT, argv[argv.indexOf('--bilder') + 1])
  : null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });

// Dasselbe Kantenmaß wie in `tools/komposition.mjs` — ein anderer Schwellwert
// gäbe eine andere Zahl, und dann ließe sich nichts vergleichen.
function kantenanteilUnten(png) {
  const L = (x, y) => {
    const i = (y * png.width + x) * 4;
    return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
  };
  let n = 0;
  let kante = 0;
  for (let y = (png.height * 0.66) | 0; y < png.height - 1; y++) {
    for (let x = 1; x < png.width - 1; x++) {
      n++;
      if (Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(L(x, y + 1) - L(x, y - 1)) > 26) kante++;
    }
  }
  return (kante / n) * 100;
}

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);

  const GIER = [-45, 0, 45];
  const zeilen = [];
  for (let k = 0; k < 12; k++) {
    const grad = k * 30;
    for (const gier of GIER) {
      await page.evaluate(
        ({ grad, gier }) => {
          const T = window.__THREE;
          const app = window.__app;
          app.env.setWalkEnabled?.(false);
          const welt = app.scene.getObjectByName('nacht-welt');
          const himmel = app.scene.getObjectByName('nacht-himmel');
          const kuppel = app.scene.getObjectByName('nacht-kuppel');
          welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), (grad * Math.PI) / 180);
          himmel.quaternion.copy(welt.quaternion);
          kuppel.userData.setzeWeltdrehung(welt.quaternion);
          welt.updateMatrixWorld(true);

          const boden = app.scene.getObjectByName('nacht-welt-boden');
          const oben = new T.Vector3(0, 1, 0).applyQuaternion(welt.quaternion.clone().invert());
          const augeY = 25 + boden.userData.heightAt(oben) + 1.6;

          // Laufrichtung ist −Z; die Gierung dreht davon weg, die Neigung
          // bleibt bei −15° wie bei der Augenhöhenkamera.
          const g = (gier * Math.PI) / 180;
          const zielX = Math.sin(g) * 11.6;
          const zielZ = -Math.cos(g) * 11.6;
          const zielY = augeY - 11.6 * Math.tan(Math.PI / 12);

          app.camera.fov = 70;
          app.camera.position.set(0, augeY, 0);
          app.camera.up.set(0, 1, 0);
          app.camera.lookAt(zielX, zielY, zielZ);
          app.camera.updateProjectionMatrix();
          // **Ohne das hier zieht `controls.update()` die Kamera zurück.** Ein
          // erster Anlauf hat Neigung −15° und −45° gemessen und für beide auf
          // die dritte Nachkommastelle dieselbe Zahl bekommen: Die Kamera stand
          // in Wahrheit beide Male dort, wo die Steuerung sie haben wollte.
          app.controls.target.set(zielX, zielY, zielZ);
          app.renderer.render(app.scene, app.camera);
        },
        { grad, gier }
      );
      await page.waitForTimeout(220);
      const buf = await page.screenshot();
      if (outDir) {
        const name = `nah-${String(grad).padStart(3, '0')}-${gier >= 0 ? 'r' : 'l'}${Math.abs(gier)}.png`;
        fs.writeFileSync(path.join(outDir, name), buf);
      }
      zeilen.push({ grad, gier, anteil: kantenanteilUnten(PNG.sync.read(buf)) });
    }
  }

  console.log('\n=== Kantenanteil im unteren Bilddrittel, aus der Sicht eines Gehenden ===');
  console.log('  Grad    links 45°   geradeaus   rechts 45°');
  for (let k = 0; k < 12; k++) {
    const drei = zeilen.filter((z) => z.grad === k * 30);
    console.log(
      `  ${String(k * 30).padStart(4)}   ` +
        drei.map((z) => `${z.anteil.toFixed(2)}%`.padStart(10)).join('  ')
    );
  }
  const alle = zeilen.map((z) => z.anteil).sort((a, b) => a - b);
  const leer = alle.filter((a) => a < 0.7).length;
  console.log(
    `\n  Mittel ${(alle.reduce((s, a) => s + a, 0) / alle.length).toFixed(2)}%,` +
      ` Median ${alle[alle.length >> 1].toFixed(2)}%,` +
      ` kleinster ${alle[0].toFixed(2)}%, größter ${alle[alle.length - 1].toFixed(2)}%`
  );
  console.log(`  Ansichten unter 0,7 %: ${leer} von ${alle.length}`);
  if (outDir) console.log(`\n  Bilder in ${path.relative(ROOT, outDir)}`);
  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
} finally {
  await browser.close();
  await server.stop();
}
