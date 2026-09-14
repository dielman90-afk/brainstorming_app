// **Verschmiert eine Flaeche zu Balken, und aendert die Zeichnung dabei ihre
// Richtung?**
//
//   node tools/streckung.mjs <bild.png> <x0> <x1> <y0> <y1>
//
// Wo der Boden flach im Blick liegt, deckt ein Bildpunkt laengs der
// Blickrichtung ein Vielfaches dessen, was er quer deckt. Jede Zeichnung
// darauf — Kornkarte, Harkrille, Rauschfeld — wird in der einen Richtung
// weggemittelt und bleibt in der anderen stehen. Im Bild sind das senkrechte
// Schlieren.
//
// Drei Masse, und nur zwei davon taugen:
//
//   quer/laengs  mittleres |L(x+1,y) − L(x,y)| gegen |L(x,y+1) − L(x,y)|.
//                **Verwechselbar, steht nur noch als Warnung da.** Eine
//                Harkspur, die selbst waagerecht laeuft, hebt `quer` genauso
//                wie ein Schlierenband es tut; das Verhaeltnis misst dann die
//                Richtung der Zeichnung, nicht ihre Verschmierung.
//
//   Spaltenmittel  erst jede Bildspalte ueber das ganze Band mitteln, dann die
//                mittlere Differenz benachbarter Spalten. Alles, was waagerecht
//                durch das Band laeuft, traegt zu jeder Spalte gleich bei und
//                faellt heraus; stehen bleibt die senkrechte Struktur.
//                **Aber: der Nahbereich hat von sich aus mehr davon.** Im
//                Zen-Garten steht das unterste Band jeder Kamera bei 1,4 bis
//                2,1 und das Band darueber bei 1,0 bis 1,4 — das ist Detail,
//                kein Fehler. Der Wert taugt zum Vergleich zweier Staende
//                derselben Stelle, nicht als Fehlermass fuer sich.
//
//   Richtung     Strukturtensor ueber Streifen von sechs Zeilen: Winkel der
//                vorherrschenden Kante und ihre Kohaerenz. **Das ist das Mass,
//                das entscheidet, ob eine Zeichnung ihre Richtung wechselt.**
//                Ich habe in `d-aerial` eine waagerechte Bruchkante gesucht, an
//                der die Harklinien senkrecht kippen — der Tensor sagt 61,1 bis
//                61,9 Grad ueber achtzig Zeilen hinweg, Kohaerenz 0,88 bis
//                0,93. Es gibt dort keinen Richtungswechsel; was wechselt, ist
//                der Abstand der Linien.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [file, x0, x1, y0, y1] = process.argv.slice(2);
if (!file || y1 === undefined) {
  console.error('node tools/streckung.mjs <bild.png> <x0> <x1> <y0> <y1>');
  process.exit(1);
}
const img = PNG.sync.read(fs.readFileSync(file));
const L = (x, y) => {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
};
let quer = 0;
let laengs = 0;
let n = 0;
for (let y = +y0; y < +y1 - 1; y++) {
  for (let x = +x0; x < +x1 - 1; x++) {
    quer += Math.abs(L(x + 1, y) - L(x, y));
    laengs += Math.abs(L(x, y + 1) - L(x, y));
    n++;
  }
}
const spalten = [];
for (let x = +x0; x < +x1; x++) {
  let s = 0;
  let k = 0;
  for (let y = +y0; y < +y1; y++) {
    s += L(x, y);
    k++;
  }
  spalten.push(s / k);
}
let sprung = 0;
for (let i = 1; i < spalten.length; i++) sprung += Math.abs(spalten[i] - spalten[i - 1]);
sprung /= spalten.length - 1;

console.log(
  `${file}   x ${x0}..${x1}, y ${y0}..${y1}\n` +
    `  quer ${(quer / n).toFixed(3)}   laengs ${(laengs / n).toFixed(3)}   ` +
    `Verhaeltnis ${(quer / Math.max(1e-6, laengs)).toFixed(2)}  (verwechselbar)\n` +
    `  Spaltenmittel-Nachbarschritt ${sprung.toFixed(3)}`
);

const yA = Math.max(1, +y0);
const yB = Math.min(img.height - 2, +y1);
const xA = Math.max(1, +x0);
const xB = Math.min(img.width - 2, +x1);
for (let ys = yA; ys + 6 <= yB; ys += 6) {
  let gxx = 0;
  let gyy = 0;
  let gxy = 0;
  for (let y = ys; y < ys + 6; y++) {
    for (let x = xA; x < xB; x++) {
      const gx = (L(x + 1, y) - L(x - 1, y)) / 2;
      const gy = (L(x, y + 1) - L(x, y - 1)) / 2;
      gxx += gx * gx;
      gyy += gy * gy;
      gxy += gx * gy;
    }
  }
  const winkel = (0.5 * Math.atan2(2 * gxy, gxx - gyy) * 180) / Math.PI;
  const koh = Math.hypot(gxx - gyy, 2 * gxy) / Math.max(1e-9, gxx + gyy);
  console.log(
    `  Zeilen ${String(ys).padStart(4)}..${String(ys + 5).padStart(4)}   ` +
      `Kantenwinkel ${winkel.toFixed(1).padStart(6)}°   Kohaerenz ${koh.toFixed(2)}`
  );
}
