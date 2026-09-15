// **Wie viel eines Bildes steht an?**
//
//   node tools/anschlag.mjs <bild.png> [<bild.png> …]
//
// Ausgebrannte Flächen sind der eine Fehler, den man nicht wegretuschieren
// kann: Wo ein Kanal bei 255 steht, ist die Information fort. Der Prüfer hat
// im Dojo „sechs Prozent des Bildes bei RGB 255/255/230" gemeldet — Rot und
// Grün abgeschnitten, Blau nicht, weshalb die hellste Fläche nicht weiss ist,
// sondern ein flaches Gelbplateau.
//
// Genau diese Unterscheidung braucht es: **einzelne** angeschlagene Kanäle
// sind der schlimmere Fall, weil sie die Farbe kippen, während alle drei
// zusammen nur Weiss ergeben. Gezählt werden deshalb beide getrennt, dazu die
// Gegenrichtung (abgesoffene Tiefen).
//
// Kein Browser noetig — das rechnet auf den Prüfbildern, die ohnehin da sind.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const dateien = process.argv.slice(2);
if (!dateien.length) {
  process.stderr.write('node tools/anschlag.mjs <bild.png> …\n');
  process.exit(1);
}

process.stdout.write(
  `${'Bild'.padEnd(26)}${'>=254 alle'.padStart(11)}${'>=254 einzeln'.padStart(14)}` +
    `${'<=1 alle'.padStart(10)}${'p99'.padStart(6)}${'max'.padStart(6)}\n`
);
for (const d of dateien) {
  const p = PNG.sync.read(fs.readFileSync(d));
  const n = p.width * p.height;
  let weiss = 0;
  let einzeln = 0;
  let schwarz = 0;
  const lum = [];
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const r = p.data[j];
    const g = p.data[j + 1];
    const b = p.data[j + 2];
    const hoch = (r >= 254 ? 1 : 0) + (g >= 254 ? 1 : 0) + (b >= 254 ? 1 : 0);
    if (hoch === 3) weiss++;
    else if (hoch > 0) einzeln++;
    if (r <= 1 && g <= 1 && b <= 1) schwarz++;
    lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }
  // **Wo steht es an?** Ein Prozentsatz sagt nicht, ob das ueber das Bild
  // verstreut ist oder als eine Flaeche steht. Ein zusammenhaengendes Plateau
  // ist der schlimmere Fall — verstreute Spitzlichter sind normal.
  let bx0 = 1e9;
  let bx1 = -1;
  let by0 = 1e9;
  let by1 = -1;
  let cx = 0;
  let cy = 0;
  let cn = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const hoch =
      (p.data[j] >= 254 ? 1 : 0) + (p.data[j + 1] >= 254 ? 1 : 0) + (p.data[j + 2] >= 254 ? 1 : 0);
    if (!hoch) continue;
    const x = i % p.width;
    const y = (i - x) / p.width;
    if (x < bx0) bx0 = x;
    if (x > bx1) bx1 = x;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;
    cx += x;
    cy += y;
    cn++;
  }
  lum.sort((a, b) => a - b);
  const pz = (q) => lum[Math.min(n - 1, Math.floor(q * n))];
  process.stdout.write(
    `${d.split('/').pop().padEnd(26)}` +
      `${((weiss / n) * 100).toFixed(2).padStart(10)}%` +
      `${((einzeln / n) * 100).toFixed(2).padStart(13)}%` +
      `${((schwarz / n) * 100).toFixed(2).padStart(9)}%` +
      `${pz(0.99).toFixed(0).padStart(6)}${lum[n - 1].toFixed(0).padStart(6)}` +
      (cn
        ? `   Schwerpunkt ${(cx / cn).toFixed(0)},${(cy / cn).toFixed(0)}  ` +
          `Kasten (${bx0},${by0})-(${bx1},${by1})`
        : '') +
      '\n'
  );
}
