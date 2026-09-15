// **Hebt sich der Sturz vom Himmel ab?**
//
//   node tools/sturzkontrast.mjs <bild.png> <x0> <x1> <y0> <y1> <himmelX0> <himmelX1>
//
// Der Prüfer hat den Sturz in `4-aerial` als „gestrichelte Punktreihe"
// gemeldet: größter Abstand zum Himmel 16,2 Stufen, in sechs Zeilen exakt 0,0.
//
// Die Messung dazu ist zeilenweise, weil der Himmel selbst einen Verlauf hat:
// Je Zeile wird der Median eines reinen Himmelsstreifens gebildet und der
// größte Ausschlag des Sturzstreifens dagegen gestellt. Ausgegeben werden der
// mittlere und der größte Ausschlag sowie der Anteil der Zeilen, in denen der
// Sturz **gar nicht** vom Himmel zu trennen ist.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, x1, y0, y1, hx0, hx1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};
let summe = 0;
let groesster = 0;
let leer = 0;
let n = 0;
for (let y = +y0; y <= +y1; y++) {
  const himmel = [];
  for (let x = +hx0; x <= +hx1; x++) himmel.push(L(x, y));
  himmel.sort((a, b) => a - b);
  const grund = himmel[himmel.length >> 1];
  let max = 0;
  for (let x = +x0; x <= +x1; x++) max = Math.max(max, Math.abs(L(x, y) - grund));
  summe += max;
  if (max > groesster) groesster = max;
  if (max < 4) leer++;
  n++;
}
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(26)} Ausschlag Mittel ${(summe / n).toFixed(1).padStart(6)}   groesster ${groesster.toFixed(1).padStart(6)}   Zeilen ohne Sturz ${((leer * 100) / n).toFixed(1).padStart(5)} %`
);
