// **Ist der Sternhimmel gleichmäßig besetzt?**
//
//   node tools/sternhimmel.mjs
//
// Die Frage kam aus einem Prüferbefund („die Sterndichte fällt zum Bildrand"),
// und am Bild ist sie **nicht** sauber zu beantworten: Eine geradlinige
// Projektion streckt den Rand um 1/cos³θ, und dieser Faktor ändert sich
// innerhalb eines Messbandes so stark, dass jede Bandkorrektur mit einem
// mittleren θ schon die Antwort verfälscht. Der erste Anlauf ist genau daran
// gescheitert und hat einen Randabfall gefunden, der zur Hälfte seine eigene
// Näherung war.
//
// Also ohne Kamera: Die Richtungen aller Sterne werden in **flächengleiche**
// Himmelsfelder einsortiert. Gleichmäßig heißt dann schlicht, dass jedes Feld
// gleich viele enthält — bis auf die Wurzelstreuung und die Milchstraße.
import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
try {
  const { page } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);
  const d = await page.evaluate(() => {
    const sterne = window.__app.scene.getObjectByName('nacht-sterne');
    const pos = sterne.geometry.attributes.position;
    const n = pos.count;
    // Flächengleiche Felder: 8 Ringe gleicher Höhe in sin(Breite), je Ring so
    // viele Felder, dass alle dieselbe Fläche haben.
    const RINGE = 8;
    const felder = [];
    for (let r = 0; r < RINGE; r++) felder.push(new Array(RINGE * 2).fill(0));
    const richtungen = [];
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const l = Math.hypot(x, y, z);
      richtungen.push([x / l, y / l, z / l]);
      const s = y / l; // sin(Breite)
      const r = Math.min(RINGE - 1, Math.floor(((s + 1) / 2) * RINGE));
      const az = Math.atan2(z, x) + Math.PI;
      felder[r][Math.min(RINGE * 2 - 1, Math.floor((az / (2 * Math.PI)) * RINGE * 2))]++;
    }
    return { n, felder, richtungen };
  });

  const alle = d.felder.flat();
  const mittel = alle.reduce((a, b) => a + b, 0) / alle.length;
  const abw = Math.sqrt(alle.reduce((a, b) => a + (b - mittel) ** 2, 0) / alle.length);
  console.log(`${d.n} Sterne in ${alle.length} flächengleichen Feldern`);
  console.log(`  Mittel ${mittel.toFixed(2)}   Streuung ${abw.toFixed(2)}   Wurzelstreuung bei Zufall ${Math.sqrt(mittel).toFixed(2)}`);
  console.log(`  kleinstes Feld ${Math.min(...alle)}   größtes ${Math.max(...alle)}`);
  console.log('\n  Ringe von Süd nach Nord (Zeile = Ring, Zahl = Sterne je Feld):');
  d.felder.forEach((ring, r) => {
    const summe = ring.reduce((a, b) => a + b, 0);
    console.log(`   Ring ${r}  Summe ${String(summe).padStart(4)}   ${ring.map((v) => String(v).padStart(3)).join(' ')}`);
  });

  // Und die Milchstraße als Zahl: Dichte über dem Winkelabstand zu ihrer Ebene.
  // Ihre Ebene wird aus den Sternen selbst geschätzt — als die Richtung, die die
  // Streuung der Sternrichtungen minimiert (kleinster Eigenvektor der
  // Streumatrix, hier über eine einfache Suche).
  const R = d.richtungen;
  let bestePol = null;
  for (let a = 0; a < 64; a++) {
    for (let b = 0; b < 32; b++) {
      const phi = (a / 64) * Math.PI * 2;
      const th = ((b + 0.5) / 32) * Math.PI;
      const p = [Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi)];
      let nah = 0;
      for (const r of R) if (Math.abs(r[0] * p[0] + r[1] * p[1] + r[2] * p[2]) < 0.2) nah++;
      if (!bestePol || nah > bestePol.nah) bestePol = { p, nah };
    }
  }
  const p = bestePol.p;
  console.log('\n  Dichte über dem Abstand zur Milchstraßenebene (flächengleiche Bänder):');
  const BAENDER = 6;
  const zaehler = new Array(BAENDER).fill(0);
  for (const r of R) {
    const s = Math.abs(r[0] * p[0] + r[1] * p[1] + r[2] * p[2]); // |sin(Breite zur Ebene)|
    zaehler[Math.min(BAENDER - 1, Math.floor(s * BAENDER))]++;
  }
  // Jedes Band hat dieselbe Fläche: 2 * 2π * (1/BAENDER) Steradiant.
  zaehler.forEach((v, i) => {
    const von = (Math.asin(i / BAENDER) * 180) / Math.PI;
    const bis = (Math.asin(Math.min(1, (i + 1) / BAENDER)) * 180) / Math.PI;
    console.log(`   ${von.toFixed(0).padStart(3)}°..${bis.toFixed(0).padStart(3)}° von der Ebene:  ${String(v).padStart(4)} Sterne`);
  });
} finally {
  await browser.close();
  await server.stop();
}
