// **Wie sanft ist das Gelände wirklich?**
//
// Zwei Prüferbefunde hängen an derselben Zahl: „Die Krümmungskante ist ein
// Zirkelschlag" (Rauheit des Horizonts 0,69 bis 0,94 px) und „Die Nachtseite
// trägt keine Modellierung" (Tonwertspanne des Bodens 4,5 von 255). Beide sagen
// dasselbe: Es gibt zu wenig Hang.
//
// Gemessen wird direkt am Höhenfeld, nicht am Bild — dort steht die Ursache.
// Für ein Gitter von Richtungen auf der Kugel: die Höhe, der Betrag des
// Gradienten (also der Tangens des Hangwinkels) und die zweite Ableitung
// (Krümmung, die Grate und Mulden trägt).
//
//   node tools/gelaende.mjs

import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);

  const d = await page.evaluate(() => {
    const T = window.__THREE;
    const app = window.__app;
    const boden = app.scene.getObjectByName('nacht-welt-boden');
    const heightAt = boden.userData.heightAt;
    const R = 25;

    // Ein gleichmäßiges Gitter über die Kugel (Fibonacci), plus ein dichtes
    // Band entlang der Laufspur, weil dort der Spieler steht.
    const richtungen = [];
    const N = 4000;
    const gold = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = gold * i;
      richtungen.push(new T.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
    }

    // Hangwinkel: Höhendifferenz über einen kleinen Bogen in zwei Richtungen.
    const SCHRITT = 0.5; // m Bogen
    const dw = SCHRITT / R;
    const hang = [];
    const kruemmung = [];
    const hoehen = [];
    const a = new T.Vector3();
    const b = new T.Vector3();
    const t1 = new T.Vector3();
    const t2 = new T.Vector3();
    for (const dir of richtungen) {
      const h0 = heightAt(dir);
      hoehen.push(h0);
      // Tangentenpaar
      t1.set(0, 1, 0);
      if (Math.abs(dir.y) > 0.9) t1.set(1, 0, 0);
      t1.crossVectors(dir, t1).normalize();
      t2.crossVectors(dir, t1);
      let g2 = 0;
      let k2 = 0;
      for (const t of [t1, t2]) {
        a.copy(dir).multiplyScalar(Math.cos(dw)).addScaledVector(t, Math.sin(dw)).normalize();
        b.copy(dir).multiplyScalar(Math.cos(dw)).addScaledVector(t, -Math.sin(dw)).normalize();
        const ha = heightAt(a);
        const hb = heightAt(b);
        const g = (ha - hb) / (2 * SCHRITT);
        g2 += g * g;
        k2 += Math.abs(ha - 2 * h0 + hb) / (SCHRITT * SCHRITT);
      }
      hang.push((Math.atan(Math.sqrt(g2)) * 180) / Math.PI);
      kruemmung.push(k2);
    }
    const kw = (v) => {
      const s = [...v].sort((x, y) => x - y);
      return {
        p50: s[(s.length * 0.5) | 0],
        p90: s[(s.length * 0.9) | 0],
        p99: s[(s.length * 0.99) | 0],
        max: s[s.length - 1],
        mittel: s.reduce((q, x) => q + x, 0) / s.length,
      };
    };
    // --- Und jetzt dort, wo der Spieler wirklich steht ----------------------
    //
    // Das Mittel über die ganze Kugel sagt wenig: Was zählt, ist das Gelände
    // **innerhalb des 8,9-m-Horizonts** um die Laufspur. Der Rest ist nie zu
    // sehen. Fuer zwoelf Stationen: die Hoehen auf dem Horizontkranz (dort
    // entsteht die Silhouette) und die Haenge im Sichtfeld.
    const wegX = new T.Vector3(1, 0, 0);
    const stationen = [];
    for (let k = 0; k < 12; k++) {
      const grad = k * 30;
      const pol = new T.Vector3(0, 1, 0).applyAxisAngle(wegX, -(grad / 360) * 2 * Math.PI);
      // Kranz bei 8,9 m Bogen: 72 Richtungen rundum.
      const w = 8.9 / R;
      t1.set(0, 1, 0);
      if (Math.abs(pol.y) > 0.9) t1.set(1, 0, 0);
      t1.crossVectors(pol, t1).normalize();
      t2.crossVectors(pol, t1);
      const kranz = [];
      const kranzHang = [];
      for (let i = 0; i < 72; i++) {
        const az = (i / 72) * Math.PI * 2;
        a.copy(pol).multiplyScalar(Math.cos(w))
          .addScaledVector(t1, Math.sin(w) * Math.cos(az))
          .addScaledVector(t2, Math.sin(w) * Math.sin(az))
          .normalize();
        kranz.push(heightAt(a));
      }
      // Hänge im Sichtfeld: 200 Richtungen innerhalb von 8,9 m Bogen.
      for (let i = 0; i < 200; i++) {
        const ww = (Math.sqrt((i + 0.5) / 200) * 8.9) / R;
        const az = i * gold;
        a.copy(pol).multiplyScalar(Math.cos(ww))
          .addScaledVector(t1, Math.sin(ww) * Math.cos(az))
          .addScaledVector(t2, Math.sin(ww) * Math.sin(az))
          .normalize();
        const h0 = heightAt(a);
        const tt1 = new T.Vector3();
        tt1.set(0, 1, 0);
        if (Math.abs(a.y) > 0.9) tt1.set(1, 0, 0);
        tt1.crossVectors(a, tt1).normalize();
        const tt2 = new T.Vector3().crossVectors(a, tt1);
        let g2 = 0;
        for (const t of [tt1, tt2]) {
          b.copy(a).multiplyScalar(Math.cos(dw)).addScaledVector(t, Math.sin(dw)).normalize();
          const hb1 = heightAt(b);
          b.copy(a).multiplyScalar(Math.cos(dw)).addScaledVector(t, -Math.sin(dw)).normalize();
          const hb2 = heightAt(b);
          const g = (hb1 - hb2) / (2 * SCHRITT);
          g2 += g * g;
        }
        kranzHang.push((Math.atan(Math.sqrt(g2)) * 180) / Math.PI);
      }
      const kmin = Math.min(...kranz);
      const kmax = Math.max(...kranz);
      const hs = [...kranzHang].sort((x, y) => x - y);
      stationen.push({
        grad,
        kranzSpanne: kmax - kmin,
        // Wie stark schwankt der Kranz von Nachbar zu Nachbar? Das ist die
        // Zackigkeit der Silhouette.
        kranzZacken: kranz.reduce((s2, h, i) => s2 + Math.abs(h - kranz[(i + 1) % 72]), 0) / 72,
        hangP50: hs[(hs.length * 0.5) | 0],
        hangP90: hs[(hs.length * 0.9) | 0],
      });
    }
    return { hang: kw(hang), kruemmung: kw(kruemmung), hoehe: kw(hoehen), spanne: kw(hoehen).max - [...hoehen].sort((x,y)=>x-y)[0], stationen };
  });

  const z = (n, o, e = 2) =>
    `  ${n.padEnd(26)} p50 ${o.p50.toFixed(e).padStart(7)}  p90 ${o.p90.toFixed(e).padStart(7)}` +
    `  p99 ${o.p99.toFixed(e).padStart(7)}  max ${o.max.toFixed(e).padStart(7)}`;
  console.log('\n=== Das Höhenfeld, an 4000 Richtungen abgetastet ===');
  console.log(z('Hangwinkel in Grad', d.hang));
  console.log(z('Krümmung in 1/m', d.kruemmung, 3));
  console.log(z('Höhe über dem Sollradius', d.hoehe));
  console.log(`\n  Gesamte Höhenspanne ${d.spanne.toFixed(2)} m auf einer Kugel von 25 m Halbmesser`);
  // Zum Vergleich: Wie steil muss ein Hang sein, damit ein gerichtetes Licht
  // ihn modelliert? Bei 45 Grad Lichteinfall aendert ein Hang von x Grad die
  // Beleuchtung um den Faktor cos(45-x)/cos(45+x).
  const f = (x) => Math.cos(((45 - x) * Math.PI) / 180) / Math.cos(((45 + x) * Math.PI) / 180);
  console.log(
    `\n  Zum Vergleich: Ein Hang von ${d.hang.p50.toFixed(1)}° (Median) aendert die Beleuchtung` +
      ` bei 45° Lichteinfall um den Faktor ${f(d.hang.p50).toFixed(2)};` +
      ` bei ${d.hang.p90.toFixed(1)}° (p90) um ${f(d.hang.p90).toFixed(2)}.`
  );
  console.log('\n=== Was der Spieler sieht: innerhalb des 8,9-m-Horizonts ===');
  console.log('  Station   Hoehenspanne am Kranz   Zacken je Schritt   Hang p50   Hang p90');
  for (const s of d.stationen) {
    console.log(
      `  ${String(s.grad).padStart(5)}     ${s.kranzSpanne.toFixed(2).padStart(6)} m` +
        `             ${s.kranzZacken.toFixed(3).padStart(6)} m` +
        `        ${s.hangP50.toFixed(1).padStart(5)}°     ${s.hangP90.toFixed(1).padStart(5)}°`
    );
  }
  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
} finally {
  await browser.close();
  await server.stop();
}
