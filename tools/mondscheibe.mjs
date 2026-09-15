// Kennzahlen einer Mondscheibe im Bild: Lage, Durchmesser, Tonwertumfang der
// beleuchteten Hälfte, Helligkeit der Nachtseite, Feinstruktur und der Verlauf
// des Hofs in Ringen.
//
//   node tools/mondscheibe.mjs <bild.png> [--rot|--weiss]
//
// Damit wird „er liest als abgebissener Keks" zu Zahlen: Ein Körper, der als
// Kugel liest, hat innerhalb der beleuchteten Fläche Struktur (Hochpass), eine
// Nachtseite über dem Himmel (Erdschein) und einen Hof, der über mehrere
// Radien abfällt statt an der Kante aufzuhören.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const f = process.argv[2];
const rot = !process.argv.includes('--weiss');
const p = PNG.sync.read(fs.readFileSync(f));
const px = (x, y) => {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
};
const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

let x0 = 1e9;
let y0 = 1e9;
let x1 = -1;
let y1 = -1;
for (let y = 0; y < p.height; y++) {
  for (let x = 0; x < p.width; x++) {
    const c = px(x, y);
    const treffer = rot ? c[0] > 60 && c[0] > c[2] * 1.4 : L(c) > 120;
    if (!treffer) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}
if (x1 < 0) {
  console.log('keine Scheibe gefunden');
  process.exit(0);
}
console.log(`Scheibe: x ${x0}..${x1}  y ${y0}..${y1}  ${x1 - x0 + 1}x${y1 - y0 + 1} px`);
const cx = (x0 + x1) / 2;
const cy = (y0 + y1) / 2;
const R = Math.max(x1 - x0 + 1, y1 - y0 + 1) / 2;

const spalten = [];
for (let x = Math.round(cx - R); x <= Math.round(cx + R); x++) {
  let s = 0;
  let n = 0;
  for (let y = Math.round(cy - R); y <= Math.round(cy + R); y++) {
    if (Math.hypot(x - cx, y - cy) > R * 0.97) continue;
    s += L(px(x, y));
    n++;
  }
  if (n) spalten.push((s / n).toFixed(0));
}
console.log(`Spaltenmittel links->rechts: ${spalten.join(' ')}`);

let hp = 0;
let nh = 0;
const hell = [];
const dunk = [];
for (let y = Math.round(cy - R); y <= Math.round(cy + R); y++) {
  for (let x = Math.round(cx - R); x <= Math.round(cx + R); x++) {
    if (Math.hypot(x - cx, y - cy) > R * 0.93) continue;
    const v = L(px(x, y));
    if (v > 25) {
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L(px(x + dx, y + dy));
      hp += Math.abs(v - s / 25);
      nh++;
      hell.push(v);
    } else dunk.push(v);
  }
}
hell.sort((a, b) => a - b);
const mit = (a) => a.reduce((s, v) => s + v, 0) / a.length;
console.log(
  `beleuchtet: n=${hell.length} Mittel ${mit(hell).toFixed(1)} p05 ${hell[Math.floor(hell.length * 0.05)].toFixed(0)} p95 ${hell[Math.floor(hell.length * 0.95)].toFixed(0)} Hochpass ${(hp / nh).toFixed(3)}`
);
if (dunk.length) {
  dunk.sort((a, b) => a - b);
  console.log(`Nachtseite: n=${dunk.length} Mittel ${mit(dunk).toFixed(2)} max ${dunk[dunk.length - 1].toFixed(1)}`);
}

for (const [a, b] of [
  [1.05, 1.3],
  [1.3, 1.7],
  [1.7, 2.2],
  [2.2, 2.9],
  [2.9, 3.8],
  [3.8, 5.0],
]) {
  let s = 0;
  let n = 0;
  for (let y = Math.round(cy - R * b); y <= Math.round(cy + R * b); y++) {
    for (let x = Math.round(cx - R * b); x <= Math.round(cx + R * b); x++) {
      if (y < 0 || x < 0 || y >= p.height || x >= p.width) continue;
      const d = Math.hypot(x - cx, y - cy) / R;
      if (d < a || d >= b) continue;
      s += L(px(x, y));
      n++;
    }
  }
  if (n) console.log(`  Hof ${a.toFixed(2)}-${b.toFixed(2)} R: ${(s / n).toFixed(2)}  (n=${n})`);
}
