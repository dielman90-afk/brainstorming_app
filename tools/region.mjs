// Kennzahlen eines Bildbereichs: Mittel, Anteil sehr heller und sehr dunkler
// Pixel, Detailanteil. Damit wird „die Krone flimmert" zu einer Zahl.
//
//   node tools/region.mjs <bild.png> <x0> <y0> <x1> <y1>
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
process.stdout.write(
  `n=${n}  Mittel ${mean.toFixed(1)}  p05 ${vals[(n * 0.05) | 0].toFixed(0)}  p95 ${vals[(n * 0.95) | 0].toFixed(0)}  >190 ${(hell * 100).toFixed(1)}%  <40 ${(dunkel * 100).toFixed(1)}%\n`
);
