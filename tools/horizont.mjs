// Wie unruhig ist die Geländekante gegen den Himmel?
//
//   node tools/horizont.mjs <bild.png> [x0 x1]
//
// Der Prüfer hat den Horizont als „gezogenen Strich" bemängelt und es
// gemessen: `c-crater` links, Kante y 281…291, Spanne **10 px auf 260 px
// Breite**, 93,8 % der Nachbarspalten auf exakt gleicher Höhe. Diese Zahl
// gehört in ein Werkzeug, damit sie über die Durchläufe vergleichbar bleibt.
//
// Die Kante wird nicht über eine Helligkeitsschwelle gesucht — die hält nicht,
// seit der Himmel selbst einen Verlauf trägt (dieselbe Falle wie bei
// silhouette.mjs). Stattdessen über den **Farbton**: Der Boden ist warm
// (R deutlich über B), der Himmel ist kühl (B über R). Der Vorzeichenwechsel
// von R − B ist die Kante, und er ist von der Helligkeit unabhängig.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0s, x1s] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const X0 = +(x0s ?? 0);
const X1 = +(x1s ?? p.width - 1);
const warm = (x, y) => { const i = (y * p.width + x) * 4; return p.data[i] - p.data[i + 2]; };
const kanten = [];
for (let x = X0; x <= X1; x++) {
  let k = null;
  for (let y = 4; y < p.height - 6; y++) {
    // Erste Zeile, ab der es sechs Zeilen am Stück warm bleibt.
    let ok = true;
    for (let d = 0; d < 6; d++) if (warm(x, y + d) <= 2) { ok = false; break; }
    if (ok) { k = y; break; }
  }
  kanten.push(k);
}
const gueltig = kanten.filter((k) => k !== null);
if (gueltig.length < 20) { console.log(`${f}: keine Kante gefunden`); process.exit(0); }
const sortiert = [...gueltig].sort((a, b) => a - b);
const p02 = sortiert[(sortiert.length * 0.02) | 0];
const p98 = sortiert[(sortiert.length * 0.98) | 0];
let gleich = 0, paare = 0;
for (let i = 1; i < kanten.length; i++) {
  if (kanten[i] === null || kanten[i - 1] === null) continue;
  paare++;
  if (kanten[i] === kanten[i - 1]) gleich++;
}
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(26)} Kante p02…p98 = ${p02}…${p98}  Spanne ${p98 - p02} px auf ${X1 - X0 + 1} px  ` +
    `Nachbarspalten gleich hoch: ${((gleich / paare) * 100).toFixed(1)}%`
);
