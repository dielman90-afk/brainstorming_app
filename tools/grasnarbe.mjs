// **Traegt die Flaeche Struktur im Massstab der Bildpunkte?**
//
//   node tools/grasnarbe.mjs <bild.png> <x0,y0,x1,y1:Name> ...
//
// `kasten.mjs` meldet die Verteilung der Helligkeit; die sagt nichts darueber,
// ob die Flaeche **Korn** hat. Eine Wiese mit einem weichen Verlauf von 20
// Stufen und eine Wiese mit Halmwerk sehen in p05/p95 gleich aus — die eine
// liest als Tuch, die andere als Gras.
//
// Gemessen wird deshalb der **Nachbarunterschied**: |dx| und |dy| ueber die
// Vierernachbarschaft, dazu der Anteil der Paare, die um mehr als 40 Stufen
// springen. Der erste Wert ist die Struktur, der zweite das Flimmerrisiko.
// Getrennt nach x und y, weil Halme eine Richtung haben und ein isotropes
// Rauschen keine.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [datei, ...kaesten] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(datei));
const L = (x, y) => {
  const i = (y * p.width + x) * 4;
  return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
};

process.stdout.write(
  `${datei}\n\n${'Bereich'.padEnd(22)}${'n'.padStart(8)}${'Mittel'.padStart(9)}` +
    `${'sd'.padStart(7)}${'|dx|'.padStart(7)}${'|dy|'.padStart(7)}${'>40'.padStart(9)}\n`
);
for (const k of kaesten) {
  const [zone, name] = k.split(':');
  const [x0, y0, x1, y1] = zone.split(',').map(Number);
  let n = 0;
  let s = 0;
  let s2 = 0;
  let sx = 0;
  let sy = 0;
  let np = 0;
  let hoch = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = L(x, y);
      n++;
      s += v;
      s2 += v * v;
      if (x < x1) {
        const d = Math.abs(L(x + 1, y) - v);
        sx += d;
        np++;
        if (d > 40) hoch++;
      }
      if (y < y1) {
        const d = Math.abs(L(x, y + 1) - v);
        sy += d;
        np++;
        if (d > 40) hoch++;
      }
    }
  const m = s / n;
  process.stdout.write(
    `${(name ?? zone).padEnd(22)}${String(n).padStart(8)}${m.toFixed(1).padStart(9)}` +
      `${Math.sqrt(Math.max(0, s2 / n - m * m)).toFixed(2).padStart(7)}` +
      `${(sx / (n - (y1 - y0 + 1))).toFixed(2).padStart(7)}` +
      `${(sy / (n - (x1 - x0 + 1))).toFixed(2).padStart(7)}` +
      `${((hoch * 100) / np).toFixed(3).padStart(8)}%\n`
  );
}
