// **Wie viel eines Bildes ist reiner Nebel?**
//
// Linearer Nebel sättigt bei `far` vollständig: Alles dahinter wird exakt die
// Nebelfarbe, ohne einen Rest Modellierung. Der Prüfer hat das als „einfarbige
// Ausschnitte" und „ein Loch im Negativ" beschrieben; hier wird gezählt, wie
// groß der Anteil ist und wie nah die übrigen dunklen Pixel schon daran liegen.
//
//   node tools/nebelanteil.mjs <nebelfarbe-hex> <bild.png> [<bild.png> …]
//   node tools/nebelanteil.mjs 1c0d09 tools/shots/planet-08/*.png
import fs from 'node:fs';
import { PNG } from 'pngjs';

const hex = parseInt(process.argv[2], 16);
const NR = (hex >> 16) & 255;
const NG = (hex >> 8) & 255;
const NB = hex & 255;

for (const f of process.argv.slice(3)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  let genau = 0;
  let nah = 0;
  let groesstesFeld = 0;
  // Größtes zusammenhängendes Feld exakter Nebelfarbe, mit einer Flutfüllung.
  const ist = new Uint8Array(p.width * p.height);
  for (let i = 0, k = 0; k < ist.length; k++, i += 4) {
    const d =
      Math.abs(p.data[i] - NR) + Math.abs(p.data[i + 1] - NG) + Math.abs(p.data[i + 2] - NB);
    if (d === 0) {
      ist[k] = 1;
      genau++;
    }
    if (d <= 6) nah++;
  }
  const gesehen = new Uint8Array(ist.length);
  const stapel = [];
  for (let k = 0; k < ist.length; k++) {
    if (!ist[k] || gesehen[k]) continue;
    let n = 0;
    stapel.push(k);
    gesehen[k] = 1;
    while (stapel.length) {
      const q = stapel.pop();
      n++;
      const x = q % p.width;
      const y = (q / p.width) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= p.width || ny >= p.height) continue;
        const nk = ny * p.width + nx;
        if (ist[nk] && !gesehen[nk]) {
          gesehen[nk] = 1;
          stapel.push(nk);
        }
      }
    }
    if (n > groesstesFeld) groesstesFeld = n;
  }
  const ges = p.width * p.height;
  console.log(
    f.replace(/.*\//, '').padEnd(16),
    `exakt ${((100 * genau) / ges).toFixed(2).padStart(6)} %`,
    ` bis auf 6 ${((100 * nah) / ges).toFixed(2).padStart(6)} %`,
    ` größte zusammenhängende Fläche ${String(groesstesFeld).padStart(7)} px`
  );
}
