// **Helligkeitsverteilung in einem Bildausschnitt.**
//
//   node tools/kasten.mjs <bild.png> <x0> <y0> <x1> <y1>
//
// Der kleine Bruder von `knotenwerte.mjs`: Der misst auf der Beitragsmaske
// eines benannten Knotens, dieser auf einem Rechteck in einem fertigen Bild.
// Gebraucht wird er dort, wo es keinen Knoten gibt — nach dem Verschmelzen
// haben Einzelteile keine Namen mehr, und ein verschmolzenes Netz enthaelt
// beide Sessel.
//
// Den Kasten findet man am ehesten, indem man zwei Staende voneinander
// abzieht: Was sich geaendert hat, IST das Bauteil.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};
const v = [];
for (let y = +y0; y <= +y1; y++) for (let x = +x0; x <= +x1; x++) v.push(L(x, y));
v.sort((a, b) => a - b);
const q = (t) => v[Math.floor(v.length * t)].toFixed(0);
const m = v.reduce((a, b) => a + b, 0) / v.length;
process.stdout.write(
  `n=${v.length} Mittel=${m.toFixed(1)} p05=${q(0.05)} p50=${q(0.5)} p95=${q(0.95)}` +
    ` max=${v[v.length - 1].toFixed(0)} unter40=${((v.filter((x) => x < 40).length * 100) / v.length).toFixed(1)}%\n`
);
