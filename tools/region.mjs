// Kennzahlen eines Bildbereichs: Mittel, Anteil sehr heller und sehr dunkler
// Pixel, Detailanteil. Damit wird „die Krone flimmert" zu einer Zahl.
//
//   node tools/region.mjs <bild.png> <x0> <y0> <x1> <y1> [--hochpass]
//
// --hochpass gibt zusätzlich aus, wie viel **feine** Struktur im Bereich
// steckt: Pixel minus 5x5-Mittel. Eine Fläche kann eine große Spannweite haben
// und trotzdem glatt sein (weicher Verlauf); der Hochpass trennt beides.
// Dazu die mittlere Kantenstärke, waagerecht und senkrecht.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const L = (i) => 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
const vals = [];
for (let y = +y0; y <= +y1; y++) for (let x = +x0; x <= +x1; x++) vals.push(L((y * p.width + x) * 4));
vals.sort((a, b) => a - b);
const n = vals.length;
const hell = vals.filter((v) => v > 190).length / n;
const dunkel = vals.filter((v) => v < 40).length / n;
const mean = vals.reduce((s, v) => s + v, 0) / n;
if (process.argv.includes('--hochpass')) {
  const X0 = +x0;
  const Y0 = +y0;
  const X1 = +x1;
  const Y1 = +y1;
  const lum = (x, y) => L((y * p.width + x) * 4);
  let hp = 0;
  let dH = 0;
  let dV = 0;
  let m = 0;
  const hps = [];
  for (let y = Y0 + 2; y <= Y1 - 2; y++) {
    for (let x = X0 + 2; x <= X1 - 2; x++) {
      let s5 = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s5 += lum(x + dx, y + dy);
      const d = Math.abs(lum(x, y) - s5 / 25);
      hp += d;
      hps.push(d);
      dH += Math.abs(lum(x + 1, y) - lum(x, y));
      dV += Math.abs(lum(x, y + 1) - lum(x, y));
      m++;
    }
  }
  hps.sort((a, b) => a - b);
  process.stdout.write(
    `Hochpass |d| ${(hp / m).toFixed(3)}  p95 ${hps[(m * 0.95) | 0].toFixed(2)}  ` +
      `Kante waagerecht ${(dH / m).toFixed(3)}  senkrecht ${(dV / m).toFixed(3)}\n`
  );
}
process.stdout.write(
  `n=${n}  Mittel ${mean.toFixed(1)}  p05 ${vals[(n * 0.05) | 0].toFixed(0)}  p95 ${vals[(n * 0.95) | 0].toFixed(0)}  >190 ${(hell * 100).toFixed(1)}%  <40 ${(dunkel * 100).toFixed(1)}%\n`
);
