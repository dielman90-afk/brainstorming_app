// **Wo wechselt das Harkmuster von Relief zu Strich — und tut es das abrupt?**
//
//   node tools/sandband.mjs <bild.png> <x0> <x1> <y0> <y1> [schritt]
//
// Prueferbefund 1.6: „Die Harkringe zerfallen mit der Entfernung in Striche;
// der Umschlag von Relief zu Strich steht bei y ungefaehr 500." Das ist eine
// Aussage ueber einen **Verlauf**, und Verlaeufe sind nur dann ein Mangel,
// wenn sie springen — eine Rille, die auf einen Bildpunkt zusammenschrumpft,
// darf ihre Plastizitaet verlieren, das ist Perspektive.
//
// Je Zeilenband drei Zahlen:
//
//   Hub      p95 − p05 der Helligkeit: wie stark das Muster ueberhaupt traegt.
//   Licht    p95 − Median: der helle Grat.
//   Schatten Median − p05: die dunkle Rille.
//
// Ein Relief hat beides; ein Strich hat nur Schatten. Das Verhaeltnis
// Licht/Schatten ist deshalb der Umschlag, und ob er springt, sieht man daran,
// ob es von Band zu Band gleitet oder in einem Schritt faellt.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [file, x0, x1, y0, y1, schritts] = process.argv.slice(2);
if (!file || y1 === undefined) {
  console.error('node tools/sandband.mjs <bild.png> <x0> <x1> <y0> <y1> [schritt]');
  process.exit(1);
}
const schritt = +(schritts ?? 20);
const img = PNG.sync.read(fs.readFileSync(file));
const L = (x, y) => {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
};

console.log(`${file}   x ${x0}..${x1}`);
console.log('  Zeile    Hub   Licht  Schatten   L/S');
for (let y = +y0; y + schritt <= +y1; y += schritt) {
  const werte = [];
  for (let yy = y; yy < y + schritt; yy++) for (let x = +x0; x < +x1; x++) werte.push(L(x, yy));
  werte.sort((a, b) => a - b);
  const q = (p) => werte[Math.floor(p * (werte.length - 1))];
  const med = q(0.5);
  const licht = q(0.95) - med;
  const schatten = med - q(0.05);
  console.log(
    `  ${String(y).padStart(5)}  ${(q(0.95) - q(0.05)).toFixed(1).padStart(5)}  ` +
      `${licht.toFixed(1).padStart(5)}  ${schatten.toFixed(1).padStart(7)}  ` +
      `${(licht / (schatten || 1)).toFixed(2).padStart(5)}`
  );
}
