// **Hat die Sonnenscheibe Farbe?**
//
//   node tools/sonnenkern.mjs <bild.png> <x0> <y0> <x1> <y1>
//
// Der Pruefer: „5036 Pixel reines (255,255,255), Saettigung entlang y = 175
// durchgehend 0." Gemessen wird der Anteil voll ausgebrannter Bildpunkte, die
// mittlere Saettigung (max minus min ueber die Kanaele) und die groesste.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
let weiss = 0;
let n = 0;
let sattSumme = 0;
let sattMax = 0;
for (let y = +y0; y <= +y1; y++) {
  for (let x = +x0; x <= +x1; x++) {
    const i = (y * p.width + x) * 4;
    const r = p.data[i];
    const g = p.data[i + 1];
    const b = p.data[i + 2];
    if (r === 255 && g === 255 && b === 255) weiss++;
    const s = Math.max(r, g, b) - Math.min(r, g, b);
    sattSumme += s;
    if (s > sattMax) sattMax = s;
    n++;
  }
}
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(24)} reines Weiss ${String(weiss).padStart(5)} px (${((weiss * 100) / n).toFixed(1).padStart(5)} %)   Saettigung Mittel ${(sattSumme / n).toFixed(1).padStart(5)}   groesste ${String(sattMax).padStart(3)}`
);
