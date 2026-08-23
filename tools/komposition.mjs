// Kompositionskennzahlen eines Prüfbilds.
//
//   node tools/komposition.mjs <bild.png>
//
// Der Prüfer hat drei Dinge bemängelt, die sich zählen lassen:
//
//   * **Masseverteilung.** „Dunkle Masse links/rechts 1,00 bzw. 1,17 — keine
//     Asymmetrie." Ein Bild, dessen beide Hälften gleich viel Gewicht tragen,
//     hat keine Achse, an der sich der Blick entlanghangelt.
//   * **Schwerpunkt der Helligkeit.** Wo im Bild liegt das Licht? Genau in der
//     Mitte heißt Bullauge.
//   * **Vordergrundanker.** Gibt es im unteren Bilddrittel überhaupt etwas mit
//     eigener Form — oder nur Fläche?
//
// Die Masse wird über die **Dunkelheit** gewichtet (255 − L), weil in einer
// Nachtszene die dunklen Massen die Komposition tragen und nicht die hellen.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const p = PNG.sync.read(fs.readFileSync(process.argv[2]));
const L = (x, y) => { const i = (y * p.width + x) * 4; return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2]; };
let links = 0, rechts = 0, oben = 0, unten = 0;
let hx = 0, hy = 0, hw = 0;
for (let y = 0; y < p.height; y++) {
  for (let x = 0; x < p.width; x++) {
    const l = L(x, y);
    const masse = 255 - l;
    if (x < p.width / 2) links += masse; else rechts += masse;
    if (y < p.height / 2) oben += masse; else unten += masse;
    // Helligkeitsschwerpunkt: nur, was deutlich über dem Bildmittel liegt.
    if (l > 90) { const w = l - 90; hx += x * w; hy += y * w; hw += w; }
  }
}
const q = (a, b) => (Math.max(a, b) / Math.min(a, b)).toFixed(2);
const drittel = { n: 0, kante: 0 };
for (let y = (p.height * 0.66) | 0; y < p.height - 1; y++) {
  for (let x = 1; x < p.width - 1; x++) {
    drittel.n++;
    if (Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(L(x, y + 1) - L(x, y - 1)) > 26) drittel.kante++;
  }
}
console.log(
  `${process.argv[2].split('/').slice(-2).join('/').padEnd(26)} ` +
    `Masse L:R ${q(links, rechts)}  O:U ${q(oben, unten)}  ` +
    (hw > 0 ? `Lichtschwerpunkt ${((hx / hw / p.width) * 100).toFixed(1)}% / ${((hy / hw / p.height) * 100).toFixed(1)}%` : 'kein Licht über L 90') +
    `  Kantenanteil unteres Drittel ${((drittel.kante / drittel.n) * 100).toFixed(2)}%`
);
