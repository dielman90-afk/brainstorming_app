// **Ist das Gras gleichmaessig gruen — und traegt es trotzdem Struktur?**
//
//   node tools/grasfarbe.mjs <bild.png> <x0> <y0> <x1> <y1>
//
// Zwei Groessen, die sich widersprechen koennen und deshalb zusammen gemessen
// werden muessen:
//
//   * **Farbstreuung.** Standardabweichung des Farbtons und des Rot-Blau-
//     Abstands. Eine Wiese, die in Gebiete zerfaellt, hat sie hoch.
//   * **Helligkeitsstruktur.** Hochpass (Bildpunkt minus 5x5-Mittel). Eine
//     Wiese ohne Oberflaeche hat ihn bei null.
//
// Das Ziel ist: Farbstreuung klein, Hochpass gross. Wer nur eines misst, macht
// aus dem Farbfeld ein Fleckenmuster oder umgekehrt.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const at = (x, y) => {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
};
const L = (x, y) => {
  const c = at(x, y);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const farbton = (c) => {
  const max = Math.max(...c);
  const min = Math.min(...c);
  if (max === min) return 0;
  const d = max - min;
  let h;
  if (max === c[0]) h = ((c[1] - c[2]) / d) % 6;
  else if (max === c[1]) h = (c[2] - c[0]) / d + 2;
  else h = (c[0] - c[1]) / d + 4;
  return ((h * 60) + 360) % 360;
};
const toene = [];
const rb = [];
let hp = 0;
let n = 0;
for (let y = +y0 + 2; y <= +y1 - 2; y++) {
  for (let x = +x0 + 2; x <= +x1 - 2; x++) {
    const c = at(x, y);
    toene.push(farbton(c));
    rb.push(c[0] - c[2]);
    let s5 = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s5 += L(x + dx, y + dy);
    hp += Math.abs(L(x, y) - s5 / 25);
    n++;
  }
}
const mit = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const abw = (a) => {
  const m = mit(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(24)} Farbton ${mit(toene).toFixed(1).padStart(5)}° ± ${abw(toene).toFixed(2).padStart(5)}   Rot-Blau ${mit(rb).toFixed(1).padStart(6)} ± ${abw(rb).toFixed(2).padStart(5)}   Hochpass ${(hp / n).toFixed(3).padStart(6)}`
);
