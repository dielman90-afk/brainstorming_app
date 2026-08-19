// Zwei Prüfbilder vergleichen. Für Pakete, die ausdrücklich **nichts** am Bild
// ändern sollen (Verschmelzen, Instancing), ist das die einzige belastbare
// Prüfung: Der Blick übersieht eine Verschiebung um zwei Pixel, der Zähler
// nicht.
//
//   node tools/diff.mjs <a.png> <b.png> [--karte diff.png]
//
// Gemeldet werden Anteil abweichender Pixel (Schwelle 2, 8 und 24 von 255),
// mittlere und größte Abweichung sowie der Schwerpunkt der Abweichung – Letzterer
// sagt, *wo* im Bild sich etwas geändert hat.

import fs from 'node:fs';
import { PNG } from 'pngjs';

const [fa, fb] = process.argv.slice(2);
const karteArg = process.argv.indexOf('--karte');
const a = PNG.sync.read(fs.readFileSync(fa));
const b = PNG.sync.read(fs.readFileSync(fb));
if (a.width !== b.width || a.height !== b.height) {
  process.stderr.write('Bilder verschieden groß\n');
  process.exit(2);
}
const n = a.width * a.height;
let summe = 0;
let max = 0;
let maxAt = [0, 0];
const zahl = [0, 0, 0];
let sx = 0;
let sy = 0;
let gewicht = 0;
const karte = karteArg > 0 ? new PNG({ width: a.width, height: a.height }) : null;
for (let i = 0; i < n; i++) {
  const p = i * 4;
  const d = Math.max(
    Math.abs(a.data[p] - b.data[p]),
    Math.abs(a.data[p + 1] - b.data[p + 1]),
    Math.abs(a.data[p + 2] - b.data[p + 2])
  );
  summe += d;
  if (d > max) {
    max = d;
    maxAt = [i % a.width, (i / a.width) | 0];
  }
  if (d >= 2) zahl[0]++;
  if (d >= 8) zahl[1]++;
  if (d >= 24) zahl[2]++;
  if (d >= 8) {
    sx += (i % a.width) * d;
    sy += ((i / a.width) | 0) * d;
    gewicht += d;
  }
  if (karte) {
    const v = Math.min(255, d * 8);
    karte.data[p] = v;
    karte.data[p + 1] = v;
    karte.data[p + 2] = v;
    karte.data[p + 3] = 255;
  }
}
if (karte) fs.writeFileSync(process.argv[karteArg + 1], PNG.sync.write(karte));
const pct = (v) => ((v / n) * 100).toFixed(3) + '%';
process.stdout.write(
  `${fa.split('/').pop().padEnd(16)} ` +
    `Δmittel ${(summe / n).toFixed(3)}  Δmax ${max} @${maxAt[0]},${maxAt[1]}  ` +
    `≥2 ${pct(zahl[0])}  ≥8 ${pct(zahl[1])}  ≥24 ${pct(zahl[2])}` +
    (gewicht ? `  Schwerpunkt ${(sx / gewicht) | 0},${(sy / gewicht) | 0}` : '') +
    '\n'
);
