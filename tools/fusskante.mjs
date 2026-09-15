// **Steht ein Koerper auf einer harten waagerechten Linie?**
//
//   node tools/fusskante.mjs <bild.png> <x0> <x1> <y0> <y1>
//
// Der Pruefer hat den fernen Huegelzug des Zengartens als „Pappaufsteller"
// gemeldet: „jeder Huegelkoerper endet in einem harten waagerechten Schnitt".
// Das ist eine Aussage ueber die **Form** einer Kante, und Formaussagen sind
// die, bei denen ich am haeufigsten danebengegriffen habe, wenn ich nur
// hingeschaut habe.
//
// Eine gezeichnete Kante ist ein Schnitt: Sie trifft in vielen Spalten
// **dieselbe** Bildzeile und springt dort um viele Stufen. Ein gewachsener
// Fuss ist eine Schraege: Der Sprung ist klein, und die Zeile, in der er
// steht, wandert von Spalte zu Spalte. Das Werkzeug gibt deshalb beides aus —
// die Staerke des staerksten senkrechten Sprungs je Spalte und die Haeufung
// der Zeilen, in denen diese Spruenge liegen.
//
// Die entscheidende Zahl ist die letzte: `groesste Zeilenhaeufung`. Liegen
// hundert Spalten mit ihrem staerksten Sprung in derselben Zeile, steht dort
// eine gezogene Linie. Verteilen sie sich, ist es ein Hang.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [file, x0, x1, y0, y1] = process.argv.slice(2);
if (!file || x1 === undefined) {
  console.error('node tools/fusskante.mjs <bild.png> <x0> <x1> <y0> <y1>');
  process.exit(1);
}
const img = PNG.sync.read(fs.readFileSync(file));
const L = (x, y) => {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
};

const zeilen = new Map();
const spalten = [];
let summe = 0;
for (let x = +x0; x < +x1; x++) {
  let best = 0;
  let bestY = -1;
  for (let y = +y0; y < +y1; y++) {
    const d = Math.abs(L(x, y + 1) - L(x, y));
    if (d > best) {
      best = d;
      bestY = y;
    }
  }
  spalten.push(best);
  zeilen.set(bestY, (zeilen.get(bestY) || 0) + 1);
  summe += best;
}
const n = spalten.length;
const top = [...zeilen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`${file}   x ${x0}..${x1}, y ${y0}..${y1}`);
console.log(`  staerkster senkrechter Sprung je Spalte: Mittel ${(summe / n).toFixed(1)}   Max ${Math.max(...spalten).toFixed(1)}`);
console.log(`  Spalten mit Sprung > 8 Stufen: ${spalten.filter((s) => s > 8).length} von ${n}` +
  `   > 14 Stufen: ${spalten.filter((s) => s > 14).length}`);
console.log(`  groesste Zeilenhaeufung: ${top.map(([y, c]) => `y=${y}: ${c}`).join('   ')}`);

// **Und dasselbe zeilenweise.** Der Spaltenblick oben findet je Spalte nur den
// *staerksten* Sprung und wird deshalb vom Umriss gegen den Himmel belegt,
// sobald das Band den Kamm mit einschliesst. Das Zeilenprofil summiert
// stattdessen den senkrechten Gradienten ueber die ganze Zeile: Eine gezogene
// Linie ist dort ein einzelner Ausschlag, ein Hang eine flache Bank.

// **Die eigentliche Frage: hoert der Koerper mittendrin auf?**
//
// Die beiden Messungen oben sind auf einen fernen Huegelzug nur bedingt
// scharf, weil in demselben Band auch der Umriss gegen den Himmel steht — und
// der ist dort die staerkste Kante, ganz gleich wie weich der Fuss ist.
//
// Der Befund „Pappaufsteller" hat aber eine Signatur, die man direkt zaehlen
// kann. Ein halbes Ellipsoid endet unten mit einer senkrechten Wand; darunter
// kommt Sand oder Dunst, und **dahinter** steht die naechste Kuppe. In einer
// senkrechten Spalte liest sich das als Gruen — Luecke — Gruen: der Koerper
// hoert auf und faengt weiter unten wieder an. Ein Hang, der weich in den
// Dunst laeuft, hat diese Luecke nicht; sein Gruen ist ein einziger
// zusammenhaengender Lauf.
//
// „Gruen" heisst G − (R+B)/2 > 6.
const gruen = (x, y) => {
  const i = (y * img.width + x) * 4;
  return img.data[i + 1] - (img.data[i] + img.data[i + 2]) / 2 > 6;
};
let mitLuecke = 0;
let lueckenPixel = 0;
let spaltenMitGruen = 0;
for (let x = +x0; x < +x1; x++) {
  let erste = -1;
  let letzte = -1;
  for (let y = +y0; y <= +y1; y++) {
    if (gruen(x, y)) {
      if (erste < 0) erste = y;
      letzte = y;
    }
  }
  if (erste < 0) continue;
  spaltenMitGruen++;
  let luecke = 0;
  for (let y = erste; y <= letzte; y++) if (!gruen(x, y)) luecke++;
  if (luecke > 0) mitLuecke++;
  lueckenPixel += luecke;
}
console.log(`  Spalten mit Gruen: ${spaltenMitGruen}` +
  `   davon mit Luecke im Koerper: ${mitLuecke} (${((mitLuecke / spaltenMitGruen) * 100).toFixed(1)} %)` +
  `   Lueckenpixel je Spalte: ${(lueckenPixel / spaltenMitGruen).toFixed(2)}`);

console.log('  Zeilenprofil (mittlerer senkrechter Gradient je Zeile):');
const profil = [];
for (let y = +y0; y < +y1; y++) {
  let s = 0;
  for (let x = +x0; x < +x1; x++) s += Math.abs(L(x, y + 1) - L(x, y));
  profil.push([y, s / (+x1 - +x0)]);
}
const hoch = Math.max(...profil.map((p) => p[1]));
for (const [y, s] of profil) {
  console.log(`    ${y}  ${s.toFixed(2).padStart(6)}  ${'#'.repeat(Math.round((s / hoch) * 56))}`);
}
