// **Hat der Planet eine Gestalt oder nur eine Oberfläche?**
//
// Der Prüfer: „Die Kugel hat Textur, aber keine Topographie. Aus dem Orbit ist
// der Umriss ein makelloser Kreis — kein Kraterrand bricht ihn." Am Bild ist
// das schwer zu messen: Der Terminator trennt die Nachtseite mit demselben
// Kontrast wie die Kante gegen den Himmel, und ein Schwellwert kann beides
// nicht auseinanderhalten. Also wird es an der Geometrie gemessen.
//
// Zwei Auskünfte:
//
//   1. **Das Höhenfeld selbst** — Spanne, Standardabweichung und die größte
//      Neigung über eine Kantenlänge des Gitters.
//   2. **Der Umriss aus der Orbitkamera** — für jeden Bildazimut der größte
//      Sehwinkel über alle Punkte des zugehörigen Großkreises. Das ist die
//      wahre perspektivische Silhouette und nicht die Näherung „R + h am
//      Äquator". Ausgegeben wird die Rauheit: die mittlere Abweichung vom
//      ausgleichenden Kreis, in Bogenminuten und in Bildpunkten.
//
//   node tools/gestalt.mjs
import { startServer, launchBrowser, openApp, selectEnv, ladeThree, PLANET_SHOTS, VIEWPORT } from './harness-common.mjs';

const orbit = PLANET_SHOTS.find((s) => s.name === 'd-orbit');
const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  const erg = await page.evaluate(
    ({ kam, fov, breite, hoehe }) => {
      const T = window.__THREE;
      const boden = window.__app.scene.getObjectByName('nacht-welt-boden');
      const heightAt = boden.userData.heightAt;
      const R = 25;

      // --- 1. Das Höhenfeld ---------------------------------------------
      // Gleichverteilte Richtungen über die Fibonacci-Spirale.
      const N = 40000;
      const gold = Math.PI * (3 - Math.sqrt(5));
      const hs = [];
      const dirs = [];
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * (i + 0.5)) / N;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const a = i * gold;
        const d = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        dirs.push(d);
        hs.push(heightAt(d));
      }
      const mit = hs.reduce((s, v) => s + v, 0) / N;
      const sd = Math.sqrt(hs.reduce((s, v) => s + (v - mit) * (v - mit), 0) / N);
      const sortiert = [...hs].sort((a, b) => a - b);

      // Größte Neigung: Vorwärtsdifferenz über 41 cm (die Kantenlänge des
      // Gitters bei detail 63).
      const SCHRITT = 0.41;
      const t1 = new T.Vector3();
      const p2 = new T.Vector3();
      let maxNeig = 0;
      let summeNeig = 0;
      for (let i = 0; i < N; i += 4) {
        const d = dirs[i];
        t1.set(0, 1, 0);
        if (Math.abs(d.y) > 0.9) t1.set(1, 0, 0);
        t1.crossVectors(d, t1).normalize();
        p2.copy(d).addScaledVector(t1, SCHRITT / R).normalize();
        const dh = Math.abs(heightAt(p2) - hs[i]);
        const neig = dh / SCHRITT;
        summeNeig += neig;
        if (neig > maxNeig) maxNeig = neig;
      }

      // --- 2. Der Umriss aus der Orbitkamera -----------------------------
      const C = new T.Vector3(kam[0], kam[1], kam[2]);
      const D = C.length();
      const blick = C.clone().negate().normalize();
      // Bildebenenbasis
      let e1 = new T.Vector3(0, 1, 0);
      if (Math.abs(blick.y) > 0.9) e1 = new T.Vector3(1, 0, 0);
      e1 = e1.clone().cross(blick).normalize();
      const e2 = blick.clone().cross(e1).normalize();

      const SCHRITTE = 360;
      const winkel = [];
      const radien = [];
      const P = new T.Vector3();
      const dd = new T.Vector3();
      const zumP = new T.Vector3();
      for (let k = 0; k < SCHRITTE; k++) {
        const phi = (k / SCHRITTE) * Math.PI * 2;
        // Richtung in der Bildebene
        const e = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
        // Großkreis durch Blickachse und e; suche den größten Sehwinkel.
        let best = 0;
        for (let g = 0; g <= 900; g++) {
          const th = (g / 900) * Math.PI;
          dd.copy(blick).multiplyScalar(-Math.cos(th)).addScaledVector(e, Math.sin(th)).normalize();
          P.copy(dd).multiplyScalar(R + heightAt(dd));
          zumP.subVectors(P, C);
          const w = zumP.angleTo(blick);
          if (w > best) best = w;
        }
        winkel.push(phi);
        radien.push(best);
      }
      const rm = radien.reduce((s, v) => s + v, 0) / SCHRITTE;
      let a1 = 0;
      let b1 = 0;
      for (let i = 0; i < SCHRITTE; i++) {
        a1 += radien[i] * Math.cos(winkel[i]);
        b1 += radien[i] * Math.sin(winkel[i]);
      }
      a1 = (2 * a1) / SCHRITTE;
      b1 = (2 * b1) / SCHRITTE;
      const rest = radien.map((r, i) => r - (rm + a1 * Math.cos(winkel[i]) + b1 * Math.sin(winkel[i])));
      const rau = rest.reduce((s, v) => s + Math.abs(v), 0) / SCHRITTE;
      const restSort = [...rest].sort((x, y) => x - y);
      // Bildpunkte je Radiant an der Bildmitte
      const pxProRad = hoehe / 2 / Math.tan((fov * Math.PI) / 360);
      return {
        D,
        hMin: sortiert[0],
        hMax: sortiert[N - 1],
        hSd: sd,
        neigMax: maxNeig,
        neigMit: summeNeig / (N / 4),
        umrissMit: rm,
        umrissRau: rau,
        umrissSpanne: restSort[SCHRITTE - 1] - restSort[0],
        pxProRad,
      };
    },
    { kam: orbit.pos, fov: orbit.fov, breite: VIEWPORT.width, hoehe: VIEWPORT.height }
  );

  const bogenMin = (rad) => (rad * 180 * 60) / Math.PI;
  console.log('Höhenfeld über 40 000 gleichverteilte Richtungen');
  console.log(`  Spanne        ${erg.hMin.toFixed(2)} bis ${erg.hMax.toFixed(2)} m  (${(erg.hMax - erg.hMin).toFixed(2)} m)`);
  console.log(`  Streuung      ${erg.hSd.toFixed(3)} m  = ${((100 * erg.hSd) / 25).toFixed(2)} % des Halbmessers`);
  console.log(`  Neigung       Mittel ${erg.neigMit.toFixed(3)}  größte ${erg.neigMax.toFixed(2)} (über 41 cm)`);
  console.log(`\nUmriss aus der Orbitkamera (${erg.D.toFixed(1)} m Abstand)`);
  console.log(`  Sehradius     ${bogenMin(erg.umrissMit).toFixed(1)}'  = ${(erg.umrissMit * erg.pxProRad).toFixed(1)} px`);
  console.log(`  Rauheit       ${bogenMin(erg.umrissRau).toFixed(2)}' = ${(erg.umrissRau * erg.pxProRad).toFixed(2)} px  (${((100 * erg.umrissRau) / erg.umrissMit).toFixed(2)} % des Halbmessers)`);
  console.log(`  Spanne        ${(erg.umrissSpanne * erg.pxProRad).toFixed(2)} px`);
} finally {
  await browser.close();
  await server.stop();
}
