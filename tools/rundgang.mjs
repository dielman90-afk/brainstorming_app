// **Der Rundgang um den Planeten — gemessen, nicht geschätzt.**
//
// Der 🌌 Nachthimmel ist seit dem Umbau eine Kugel mit 25 m Halbmesser. Drei
// Dinge daran kann kein Standbild belegen:
//
//   1. dass der Rundgang **schließt** — nach 2πR Bogen steht man wieder am
//      Anfang, und die Welt steht wieder so, wie sie stand;
//   2. dass man dabei **auf dem Boden bleibt** — der Spieler steht am Nordpol,
//      seine Höhe kommt aus `walk.floorAt`, und die weiche Nachführung
//      (`dt * 7`) darf über Kraterrändern nicht hinterherhinken;
//   3. dass der **Mond untergeht** und die Nachtseite noch Tonwert trägt.
//
// Punkt 1 und 2 laufen synchron über denselben Codepfad, den die Bildschleife
// benutzt (`walk.limit` / `walk.floorAt`) — ohne die Bildrate im Nenner, aus
// demselben Grund wie in `tools/gehbereich.mjs`. Punkt 3 braucht Bilder: alle
// 30 Grad eines.
//
//   node tools/rundgang.mjs [--bilder tools/shots/rundgang]

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import {
  startServer,
  launchBrowser,
  openApp,
  selectEnv,
  ladeThree,
  PLANET_SHOTS,
  ROOT,
} from './harness-common.mjs';

const argv = process.argv.slice(2);
const outDir = path.resolve(
  ROOT,
  argv.includes('--bilder') ? argv[argv.indexOf('--bilder') + 1] : 'tools/shots/rundgang'
);
fs.mkdirSync(outDir, { recursive: true });

const R = 25;
const UMFANG = 2 * Math.PI * R;

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);

  // --- 1 und 2: der Gang, synchron ------------------------------------------
  const gang = await page.evaluate(
    ({ R, UMFANG }) => {
      const T = window.__THREE;
      const app = window.__app;
      const walk = app.env.walk();
      if (!walk.istPlanet) throw new Error('Der Nachthimmel meldet keinen Planeten');
      const welt = app.scene.getObjectByName('nacht-welt');
      const boden = app.scene.getObjectByName('nacht-welt-boden');
      const heightAt = boden.userData.heightAt;
      const start = welt.quaternion.clone();

      // 3,3 cm je Schritt: 2,4 m/s bei 72 Bildern je Sekunde, also genau das,
      // was in der Brille passiert.
      const dt = 1 / 72;
      const schritt = 2.4 * dt;
      const n = Math.round(UMFANG / schritt);
      const ziel = { x: 0, z: 0 };
      const oben = new T.Vector3();
      const inv = new T.Quaternion();

      let floorY = null;
      let vorherEcht = null;
      // Zwei verschiedene Fragen, und sie dürfen nicht vermischt werden:
      //   feldFehler  — weicht `walk.floorAt` vom wirklichen Gelände ab? Das
      //                 wäre ein Fehler des Planeten.
      //   folgeFehler — wie weit hinkt die weiche Nachführung (dt * 7) hinter
      //                 dem Gelände her? Das ist eine Eigenschaft der App, die
      //                 es in jeder Umgebung gibt.
      let feldFehler = 0;
      let maxAbweichung = 0;
      let maxAbweichungBei = 0;
      let maxSteigung = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      const alleFolge = [];
      const kurve = [];

      for (let i = 0; i < n; i++) {
        // Ein Schritt nach vorn: Der Kopf driftet um `schritt` über den
        // Freiraum hinaus, die Sperre holt ihn zurück und dreht dabei die Welt.
        walk.limit(0, 0.9 + schritt, ziel);
        const zielY = walk.floorAt(ziel.x, ziel.z);
        if (floorY === null) floorY = zielY;
        floorY += (zielY - floorY) * Math.min(1, dt * 7);

        // Wo liegt der Boden wirklich? Unabhängig gerechnet: die Richtung unter
        // dem Spieler, zurückgedreht in Planetenkoordinaten.
        inv.copy(welt.quaternion).invert();
        oben.set(ziel.x, Math.sqrt(Math.max(0, R * R - ziel.x * ziel.x - ziel.z * ziel.z)), ziel.z)
          .normalize()
          .applyQuaternion(inv);
        const rg = R + heightAt(oben);
        const echt = Math.sqrt(Math.max(0, rg * rg - ziel.x * ziel.x - ziel.z * ziel.z));

        feldFehler = Math.max(feldFehler, Math.abs(zielY - echt));
        const ab = Math.abs(floorY - echt);
        alleFolge.push(ab);
        if (ab > maxAbweichung) {
          maxAbweichung = ab;
          maxAbweichungBei = i * schritt;
          maxSteigung = vorherEcht === null ? 0 : Math.abs(echt - vorherEcht) / schritt;
        }
        vorherEcht = echt;
        if (echt < minY) minY = echt;
        if (echt > maxY) maxY = echt;
        if (i % Math.round(n / 24) === 0) kurve.push(+(echt - R).toFixed(2));
      }

      // Schließt der Rundgang? Der Winkel zwischen Anfangs- und Endstellung.
      const zurueck = welt.quaternion.clone().multiply(start.clone().invert());
      const restwinkel = 2 * Math.acos(Math.min(1, Math.abs(zurueck.w)));

      // Und steht der Boden wieder da, wo er stand?
      inv.copy(welt.quaternion).invert();
      const obenEnde = new T.Vector3(0, 1, 0).applyQuaternion(inv);
      alleFolge.sort((a, b) => a - b);
      return {
        feldFehler,
        folgeP50: alleFolge[Math.floor(n * 0.5)],
        folgeP95: alleFolge[Math.floor(n * 0.95)],
        maxSteigung,
        schritte: n,
        strecke: n * schritt,
        maxAbweichung,
        maxAbweichungBei,
        spanne: maxY - minY,
        restwinkelGrad: (restwinkel * 180) / Math.PI,
        restbogen: restwinkel * R,
        hoeheStart: heightAt(new T.Vector3(0, 1, 0)),
        hoeheEnde: heightAt(obenEnde),
        kurve,
      };
    },
    { R, UMFANG }
  );

  console.log('\n=== Rundgang: schließt er? ===');
  console.log(`  ${gang.schritte} Schritte zu 3,3 cm = ${gang.strecke.toFixed(2)} m Bogen`);
  console.log(
    `  Restwinkel nach der Runde ${gang.restwinkelGrad.toFixed(4)}° = ${(gang.restbogen * 100).toFixed(2)} cm`
  );
  console.log(
    `  Geländehöhe am Start ${gang.hoeheStart.toFixed(4)} m, am Ende ${gang.hoeheEnde.toFixed(4)} m`
  );
  console.log(gang.restbogen < 0.02 ? '  ✅ der Rundgang schließt' : '  ❌ der Rundgang schließt nicht');

  console.log('\n=== Bodenkontakt ===');
  console.log(`  Geländespanne über die Runde ${gang.spanne.toFixed(2)} m`);
  console.log(`  Profil (alle 6,5 m, Höhe über dem Sollradius): ${gang.kurve.join(' ')}`);
  console.log(
    `\n  a) Höhenfeld: |walk.floorAt − wirkliches Gelände| max ${(gang.feldFehler * 1000).toFixed(3)} mm`
  );
  console.log(
    gang.feldFehler < 0.001
      ? '     ✅ die Sperre steht exakt auf dem Gelände'
      : '     ❌ die Sperre weicht vom Gelände ab'
  );
  console.log(
    `\n  b) Nachführung: |geglättete Höhe − Gelände| p50 ${(gang.folgeP50 * 100).toFixed(2)} cm,` +
      ` p95 ${(gang.folgeP95 * 100).toFixed(2)} cm, max ${(gang.maxAbweichung * 100).toFixed(2)} cm` +
      ` bei ${gang.maxAbweichungBei.toFixed(1)} m (Steigung dort ${gang.maxSteigung.toFixed(2)})`
  );
  console.log(
    `     Erwartung für einen Tiefpass erster Ordnung mit k = 7/s:` +
      ` Nachlauf = Geländerate / k = ${gang.maxSteigung.toFixed(2)} · 2,4 / 7 =` +
      ` ${((gang.maxSteigung * 2.4) / 7 * 100).toFixed(1)} cm`
  );

  // --- 3: zwölf Bilder, alle 30 Grad ----------------------------------------
  const shot = PLANET_SHOTS[0];
  const zeilen = [];
  for (let k = 0; k < 12; k++) {
    const grad = k * 30;
    const werte = await page.evaluate(
      ({ grad, pos, look, fov }) => {
        const T = window.__THREE;
        const app = window.__app;
        app.env.setWalkEnabled?.(false);
        const welt = app.scene.getObjectByName('nacht-welt');
        const himmel = app.scene.getObjectByName('nacht-himmel');
        const kuppel = app.scene.getObjectByName('nacht-kuppel');
        // Um dieselbe Achse wie beim Gehen nach vorn (+Z): (-z, 0, x) mit
        // der Abdrift (0, 0, 1), also die +X-Achse.
        welt.quaternion.setFromAxisAngle(new T.Vector3(1, 0, 0), (grad * Math.PI) / 180);
        himmel.quaternion.copy(welt.quaternion);
        kuppel.userData.setzeWeltdrehung(welt.quaternion);

        app.camera.fov = fov;
        app.camera.position.set(pos[0], pos[1], pos[2]);
        app.camera.up.set(0, 1, 0);
        app.camera.lookAt(look[0], look[1], look[2]);
        app.camera.updateProjectionMatrix();
        app.controls.target.set(look[0], look[1], look[2]);
        app.renderer.render(app.scene, app.camera);

        // Wo steht der Mond? Höhenwinkel über dem Horizont des Spielers.
        const mond = app.scene.getObjectByName('nacht-mond');
        const w = mond.getWorldPosition(new T.Vector3()).sub(new T.Vector3(0, 25, 0)).normalize();
        return { hoehe: (Math.asin(w.y) * 180) / Math.PI };
      },
      { grad, pos: shot.pos, look: shot.look, fov: shot.fov }
    );
    await page.waitForTimeout(220);
    const buf = await page.screenshot();
    fs.writeFileSync(path.join(outDir, `rund-${String(grad).padStart(3, '0')}.png`), buf);
    const png = PNG.sync.read(buf);
    let summe = 0;
    const werteL = [];
    for (let i = 0; i < png.data.length; i += 4) {
      const l = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
      summe += l;
      werteL.push(l);
    }
    werteL.sort((a, b) => a - b);
    zeilen.push({
      grad,
      bogen: (grad / 360) * UMFANG,
      mond: werte.hoehe,
      mittel: summe / werteL.length,
      p05: werteL[Math.floor(werteL.length * 0.05)],
      p95: werteL[Math.floor(werteL.length * 0.95)],
    });
  }

  console.log('\n=== Zwölf Stationen ===');
  console.log('  Grad   Bogen     Mond      Mittel   p05    p95   Spanne');
  for (const z of zeilen) {
    console.log(
      `  ${String(z.grad).padStart(4)}  ${z.bogen.toFixed(1).padStart(6)} m  ${z.mond
        .toFixed(1)
        .padStart(6)}°  ${z.mittel.toFixed(1).padStart(7)}  ${z.p05.toFixed(1).padStart(5)}  ${z.p95
        .toFixed(1)
        .padStart(5)}  ${(z.p95 - z.p05).toFixed(1).padStart(6)}`
    );
  }
  const nachtseite = zeilen.filter((z) => z.mond < 0);
  console.log(
    `\n  Stationen mit untergegangenem Mond: ${nachtseite.length} von 12` +
      (nachtseite.length
        ? `, Tonwertspanne dort ${Math.min(...nachtseite.map((z) => z.p95 - z.p05)).toFixed(1)} bis ${Math.max(
            ...nachtseite.map((z) => z.p95 - z.p05)
          ).toFixed(1)}`
        : '')
  );

  console.log(`\n  Bilder in ${path.relative(ROOT, outDir)}`);
  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
} finally {
  await browser.close();
  await server.stop();
}
