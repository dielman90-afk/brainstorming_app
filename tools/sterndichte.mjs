// **Fällt die Sterndichte zum Bildrand ab — und wenn ja, warum?**
//
//   node tools/sterndichte.mjs <bild.png> [y0 y1] [--fov 70]
//
// Der Prüfer hat vermutet, zum Bildrand hin stünden weniger Sterne, und die
// Vermutung selbst als unbestätigt gekennzeichnet. Sie lässt sich am Bild
// prüfen — aber nur gegen die richtige Erwartung.
//
// **Eine geradlinige (rektilineare) Projektion streckt den Rand.** Ein
// Raumwinkel am Bildrand deckt mehr Bildpunkte ab als derselbe Raumwinkel in
// der Mitte, und zwar um den Faktor 1/cos³θ, wobei θ der Winkel zur
// Blickachse ist. Bei 102 Grad waagerechtem Blickfeld sind das am linken und
// rechten Rand 51 Grad und damit Faktor 4,0: Ein gleichmäßig besetzter
// Sternhimmel **muss** dort ein Viertel der Sterne je Bildpunkt zeigen. Das
// ist keine Lücke im Sternfeld, sondern was jedes Objektiv und jede Brille mit
// derselben Optik tut.
//
// Gemessen wird die Zahl lokaler Helligkeitsmaxima je senkrechtem Band, geteilt
// durch die Bandfläche, und daneben die Vorhersage aus 1/cos³θ.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const f = argv[0];
const y0 = +(argv[1] ?? 0);
const y1raw = argv[2];
const fov = +(argv.includes('--fov') ? argv[argv.indexOf('--fov') + 1] : 70);
const p = PNG.sync.read(fs.readFileSync(f));
const y1 = +(y1raw ?? Math.round(p.height * 0.45));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};

// Brennweite in Bildpunkten aus dem senkrechten Blickfeld.
const brenn = p.height / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
const BAENDER = 8;
const breite = Math.floor(p.width / BAENDER);
console.log(`${f}   Band y ${y0}..${y1},  fov ${fov}°,  Brennweite ${brenn.toFixed(0)} px`);
console.log('  Band      Mitte θ    Sterne   je 10^5 px²   erwartet (1/cos³θ)   Verhältnis');
const werte = [];
for (let b = 0; b < BAENDER; b++) {
  const xa = b * breite + 2;
  const xb = Math.min(p.width - 3, (b + 1) * breite - 2);
  let n = 0;
  for (let y = y0 + 2; y <= y1 - 2; y++) {
    for (let x = xa; x <= xb; x++) {
      const v = L(x, y);
      if (v < 55) continue;
      // Lokales Maximum in 3x3 — jeder Stern wird genau einmal gezählt.
      let max = true;
      for (let dy = -1; dy <= 1 && max; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (L(x + dx, y + dy) > v) {
            max = false;
            break;
          }
        }
      if (max) n++;
    }
  }
  const flaeche = (xb - xa + 1) * (y1 - y0 - 3);
  const mx = (xa + xb) / 2 - p.width / 2;
  const my = (y0 + y1) / 2 - p.height / 2;
  const theta = (Math.atan(Math.hypot(mx, my) / brenn) * 180) / Math.PI;
  const streckung = 1 / Math.pow(Math.cos((theta * Math.PI) / 180), 3);
  werte.push({ b, theta, dichte: (n * 1e5) / flaeche, streckung, n });
}
const mitte = werte.reduce((a, w) => (Math.abs(w.theta) < Math.abs(a.theta) ? w : a));
for (const w of werte) {
  const erwartet = (mitte.dichte * mitte.streckung) / w.streckung;
  console.log(
    `  ${String(w.b).padStart(4)}   ${w.theta.toFixed(1).padStart(8)}°   ${String(w.n).padStart(6)}   ${w.dichte.toFixed(1).padStart(11)}   ${erwartet.toFixed(1).padStart(18)}   ${(w.dichte / erwartet).toFixed(2).padStart(10)}`
  );
}
