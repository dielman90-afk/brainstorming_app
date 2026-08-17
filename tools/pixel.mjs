// Pixelwerte aus den Prüfbildern lesen – dieselbe Sprache, in der der Prüfer
// seine Befunde formuliert. Ohne das bleibt „der Kiel ist zu dunkel" eine
// Meinung; mit ihm ist es eine Zahl, die man vorher/nachher vergleichen kann.
//
//   node tools/pixel.mjs <bild.png> <x,y> [<x,y> …]        Einzelpunkte (5×5-Mittel)
//   node tools/pixel.mjs <bild.png> --col <x> <y0> <y1>     Spalte abtasten
//   node tools/pixel.mjs <bild.png> --stats                 Bildmittel und Perzentile

import fs from 'node:fs';
import { PNG } from 'pngjs';

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const at = (x, y) => {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = Math.min(png.width - 1, Math.max(0, x + dx));
      const py = Math.min(png.height - 1, Math.max(0, y + dy));
      const i = (py * png.width + px) * 4;
      r += png.data[i];
      g += png.data[i + 1];
      b += png.data[i + 2];
      n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
};

const args = process.argv.slice(3);
if (args[0] === '--stats') {
  const all = [];
  for (let i = 0; i < png.data.length; i += 4) {
    all.push(lum(png.data[i], png.data[i + 1], png.data[i + 2]));
  }
  all.sort((a, b) => a - b);
  const mean = all.reduce((s, v) => s + v, 0) / all.length;
  const p = (q) => all[Math.floor(all.length * q)].toFixed(1);
  process.stdout.write(
    `Mittel ${mean.toFixed(1)}  p01 ${p(0.01)}  p50 ${p(0.5)}  p99 ${p(0.99)}\n`
  );
} else if (args[0] === '--col') {
  const x = +args[1];
  for (let y = +args[2]; y <= +args[3]; y += 20) {
    const [r, g, b] = at(x, y);
    process.stdout.write(`  y=${String(y).padStart(4)}  (${r},${g},${b})  L=${lum(r, g, b).toFixed(1)}\n`);
  }
} else {
  for (const a of args) {
    const [x, y] = a.split(',').map(Number);
    const [r, g, b] = at(x, y);
    process.stdout.write(`  ${a}  (${r},${g},${b})  L=${lum(r, g, b).toFixed(1)}\n`);
  }
}
