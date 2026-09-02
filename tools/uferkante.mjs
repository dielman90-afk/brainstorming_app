// **Wie hart ist die Uferkante?**
//
//   node tools/uferkante.mjs <bild.png>
//
// Der Prüfer über den Bach: „eine durchscheinende Platte mit geraden
// Polygonkanten". Eine gerade Polygonkante ist im Bild ein Sprung: zwei
// benachbarte Bildpunkte, zwischen denen der Tonwert um viele Stufen springt,
// und das über eine lange, gerade Linie.
//
// Gemessen wird der Anteil der waagerechten Nachbarpaare im Bachbereich, deren
// Unterschied über 12 Stufen liegt — der Sprunganteil —, und die mittlere
// Sprunghöhe. Ein weiches Ufer hat viele kleine Übergänge statt weniger großer.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};
let spruenge = 0;
let summe = 0;
let n = 0;
for (let y = +y0; y <= +y1; y++) {
  for (let x = +x0; x < +x1; x++) {
    const d = Math.abs(L(x + 1, y) - L(x, y));
    if (d > 12) {
      spruenge++;
      summe += d;
    }
    n++;
  }
}
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(26)} Spruenge ueber 12 Stufen: ${((spruenge * 100) / n).toFixed(3).padStart(6)} %   mittlere Sprunghoehe ${(summe / Math.max(1, spruenge)).toFixed(1).padStart(5)}`
);
