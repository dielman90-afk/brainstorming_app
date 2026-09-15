// **Haben alle Sterne dasselbe Muster?**
//
// Gemeldet: „Ich verstehe nicht, wieso die Sterne unterschiedlich sind. Alle
// Sterne sollen das gleiche Muster haben, also kleine und große und manche
// leuchtend."
//
// Das ist keine Einbildung, sondern gebaut: `makeSternfeld` backt je Stern
// einen Anteil `gleich` ein, der auf der mondabgewandten Seite von 0 auf 1
// steigt. Wo er 1 ist, bekommt **jeder** Stern dieselbe Größe (0,60) und
// dieselbe Helligkeit (0,62); die natürliche Verteilung `pow(zufall, 2,6)` —
// viele schwache, wenige helle — ist dort abgeschaltet, ebenso das Flimmern.
// Entstanden ist das aus einem früheren Wunsch („die Sterne auf der Seite, wo
// der Mond nicht scheint, gleich hell"). Es beantwortet ihn wörtlich und
// zerstört dabei genau das, was einen Sternhimmel ausmacht.
//
// Dieses Werkzeug misst die Verteilung **je Himmelsband**, gestaffelt nach dem
// Winkel zum Mond. Gleiches Muster heißt: Streuung und Spannweite von Größe
// und Helligkeit sind in jedem Band ähnlich.
//
//   node tools/sterne-muster.mjs

import { startServer, launchBrowser, openApp, selectEnv, ladeThree } from './harness-common.mjs';

const server = await startServer();
const browser = await launchBrowser();
let fehler = 0;
try {
  const { page, messages } = await openApp(browser);
  await selectEnv(page, 'night');
  await ladeThree(page);

  const daten = await page.evaluate(() => {
    const app = window.__app;
    const sterne = app.scene.getObjectByName('nacht-sterne');
    const g = sterne.geometry;
    const pos = g.attributes.position.array;
    const groesse = g.attributes.groesse.array;
    const farbe = g.attributes.farbe.array;
    const gleich = g.attributes.gleich ? g.attributes.gleich.array : null;
    const n = groesse.length;

    // Die Mondrichtung aus der Szene holen statt sie zu raten: Mond und
    // Sternfeld sitzen in derselben Gruppe, ihre gegenseitige Lage ist fest.
    const T = window.__THREE;
    const mond = app.scene.getObjectByName('nacht-mond');
    const welt = app.scene.getObjectByName('nacht-himmel');
    const mRi = mond
      .getWorldPosition(new T.Vector3())
      .applyQuaternion(welt.getWorldQuaternion(new T.Quaternion()).invert())
      .normalize();

    // Fünf Bänder vom Mond weg, je 36 Grad.
    const baender = [[], [], [], [], []];
    const R = Math.hypot(pos[0], pos[1], pos[2]) || 1;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] / R;
      const dy = pos[i * 3 + 1] / R;
      const dz = pos[i * 3 + 2] / R;
      const cos = dx * mRi.x + dy * mRi.y + dz * mRi.z;
      const grad = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      const b = Math.min(4, Math.floor(grad / 36));
      const y709 =
        0.2126 * farbe[i * 3] + 0.7152 * farbe[i * 3 + 1] + 0.0722 * farbe[i * 3 + 2];
      baender[b].push({ groesse: groesse[i], hell: y709, gleich: gleich ? gleich[i] : 0 });
    }
    const kennwerte = (liste, feld) => {
      const v = liste.map((s) => s[feld]).sort((a, b) => a - b);
      if (!v.length) return null;
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      const varianz = v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length;
      return {
        n: v.length,
        mittel: m,
        streuung: Math.sqrt(varianz),
        p05: v[Math.floor(v.length * 0.05)],
        p95: v[Math.floor(v.length * 0.95)],
      };
    };
    return baender.map((b, i) => ({
      von: i * 36,
      bis: (i + 1) * 36,
      groesse: kennwerte(b, 'groesse'),
      hell: kennwerte(b, 'hell'),
      gleich: b.length ? b.reduce((s, x) => s + x.gleich, 0) / b.length : 0,
    }));
  });

  console.log('\n=== Verteilung der Sterne nach Winkel zum Mond ===');
  console.log('  Band          n     Größe: Mittel  Streuung  p05..p95        Helligkeit: Mittel  Streuung  p05..p95');
  for (const b of daten) {
    const g = b.groesse;
    const h = b.hell;
    console.log(
      `  ${String(b.von).padStart(3)}–${String(b.bis).padEnd(3)}° ${String(g.n).padStart(5)}` +
        `        ${g.mittel.toFixed(3)}     ${g.streuung.toFixed(3)}   ${g.p05.toFixed(2)}..${g.p95.toFixed(2)}` +
        `              ${h.mittel.toFixed(3)}     ${h.streuung.toFixed(3)}   ${h.p05.toFixed(2)}..${h.p95.toFixed(2)}`
    );
  }

  // Gleiches Muster heißt: Die Streuung darf zwischen den Bändern nicht
  // einbrechen. Ein Band, dessen Streuung unter einem Drittel der größten
  // liegt, ist plattgedrückt — dort stehen lauter gleiche Punkte.
  const maxG = Math.max(...daten.map((b) => b.groesse.streuung));
  const maxH = Math.max(...daten.map((b) => b.hell.streuung));
  const minG = Math.min(...daten.map((b) => b.groesse.streuung));
  const minH = Math.min(...daten.map((b) => b.hell.streuung));
  console.log(
    `\n  Streuung der Größe      ${minG.toFixed(3)} bis ${maxG.toFixed(3)}  (Verhältnis ${(maxG / Math.max(1e-6, minG)).toFixed(1)}:1)`
  );
  console.log(
    `  Streuung der Helligkeit ${minH.toFixed(3)} bis ${maxH.toFixed(3)}  (Verhältnis ${(maxH / Math.max(1e-6, minH)).toFixed(1)}:1)`
  );
  const pruefe = (b, t) => {
    console.log(`  ${b ? '✅' : '❌'} ${t}`);
    if (!b) fehler++;
  };
  pruefe(maxG / Math.max(1e-6, minG) < 1.6, 'die Größenverteilung ist über den ganzen Himmel dieselbe');
  pruefe(maxH / Math.max(1e-6, minH) < 1.6, 'die Helligkeitsverteilung ist über den ganzen Himmel dieselbe');

  console.log(messages.length ? `\n❌ Konsole: ${messages.join(' | ')}` : '\n✓ Konsole sauber');
} finally {
  await browser.close();
  await server.stop();
}
process.exit(fehler ? 1 : 0);
