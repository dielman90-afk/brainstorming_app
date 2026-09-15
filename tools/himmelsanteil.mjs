// Wie viel Himmel steht in einem Bild, und wie unruhig ist die Kante?
//
//   node tools/himmelsanteil.mjs <bild.png> [...]
//
// „Eine Kuppe auf 85 Prozent der Fläche, kein Horizontereignis" (Prüfer über
// `rund-030`) ist eine Aussage über den Himmelsanteil und die Kammlinie. Der
// Himmel wird wie in `horizont.mjs` über den Farbton getrennt — der Boden ist
// warm (R über B), der Himmel kühl —, nicht über die Helligkeit.
import fs from 'node:fs';
import { PNG } from 'pngjs';
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  let himmel = 0;
  const kante = new Array(p.width).fill(p.height);
  for (let x = 0; x < p.width; x++) {
    for (let y = 0; y < p.height; y++) {
      const i = (y * p.width + x) * 4;
      const kuehl = p.data[i + 2] >= p.data[i];
      if (kuehl) himmel++;
      else if (kante[x] === p.height) kante[x] = y;
    }
  }
  // Gesamtvariation der Kammlinie: die Summe der Höhensprünge von Spalte zu
  // Spalte. Ein gezogener Strich hat sie nahe null, eine zerklüftete Kante viel.
  let variation = 0;
  for (let x = 1; x < p.width; x++) variation += Math.abs(kante[x] - kante[x - 1]);
  const gueltig = kante.filter((v) => v < p.height);
  console.log(
    `${f.split('/').slice(-2).join('/').padEnd(30)} Himmel ${((himmel * 100) / (p.width * p.height)).toFixed(1).padStart(5)}%   Kamm y ${Math.min(...gueltig)}…${Math.max(...gueltig)}   Gesamtvariation ${variation.toFixed(0).padStart(6)} px`
  );
}
