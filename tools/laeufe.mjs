// **Wie viel einer Flaeche ist voellig unbehandelt?**
//
//   node tools/laeufe.mjs <bild.png> <x0> <y0> <x1> <y1>
//
// Der Pruefer misst Materialien an „konstanten Laeufen": waagerechte Folgen
// benachbarter Bildpunkte, deren Luminanz sich um weniger als eine Stufe
// unterscheidet. Eine Flaeche mit Oberflaeche hat kurze Laeufe, eine
// unbehandelte lange. Seine Zahlen: Findlinge 35,4 und 37,7 Prozent bei
// laengstem Lauf 91 px, Kiel 16,1 Prozent, Wiese 6,7.
//
// Ausgegeben werden der Anteil der Bildpunkte in Laeufen ab sechs und der
// laengste Lauf.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};
let inLauf = 0;
let gesamt = 0;
let laengster = 0;
for (let y = +y0; y <= +y1; y++) {
  let lauf = 1;
  for (let x = +x0 + 1; x <= +x1; x++) {
    if (Math.abs(L(x, y) - L(x - 1, y)) < 1) {
      lauf++;
    } else {
      if (lauf >= 6) inLauf += lauf;
      if (lauf > laengster) laengster = lauf;
      lauf = 1;
    }
    gesamt++;
  }
  if (lauf >= 6) inLauf += lauf;
  if (lauf > laengster) laengster = lauf;
  gesamt++;
}
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(24)} in Laeufen ab 6: ${((inLauf * 100) / gesamt).toFixed(1).padStart(5)} %   laengster Lauf ${String(laengster).padStart(3)} px`
);
