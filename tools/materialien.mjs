// Wie viele Materialien sieht man wirklich?
//
// Der Prüfer schrieb zum Steinwerk: „Materialtrennung: zwei Sorten, nicht
// vier. Frischer Bruch und Frost sind nirgends zu finden." Das ist eine
// Aussage über Pixel, also lässt sie sich zählen. Vier Sorten sind angelegt:
// Staub (gesättigt orange), Fels (entsättigt rosagrau), frischer Bruch (hell
// und kühl) und Frost (blaustichig). Unter dem bläulichen Mondlicht bleiben
// zwei Größen brauchbar zur Trennung:
//
//   * **rot minus blau** — nur Frost kann diese Zahl unter null drücken; jedes
//     Marsmaterial hat mehr Rot als Blau.
//   * **Sättigung bei hoher Helligkeit** — frischer Bruch ist hell *und*
//     entsättigt; beleuchteter Staub ist hell und bleibt gesättigt.
//
//   node tools/materialien.mjs <bild.png> [<bild.png> …]
import fs from 'node:fs';
import { PNG } from 'pngjs';

for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  let boden = 0;
  let staub = 0;
  let fels = 0;
  let bruch = 0;
  let frost = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      const r = p.data[i];
      const g = p.data[i + 1];
      const b = p.data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Himmel ist dunkel und blau; Sterne sind winzig und hell. Als Boden
      // zählt, was hell genug ist und mehr Rot als Grün trägt – oder kühl,
      // aber deutlich heller als der Nachthimmel (Frost).
      const istBoden = L > 26 && (r > g + 3 || L > 90);
      if (!istBoden) continue;
      boden++;
      const sat = max > 0 ? (max - min) / max : 0;
      if (b >= r) frost++;
      else if (sat > 0.34) staub++;
      else if (L > 110 && sat < 0.22) bruch++;
      else fels++;
    }
  }
  const pct = (v) => ((100 * v) / Math.max(1, boden)).toFixed(2).padStart(6) + ' %';
  console.log(f.replace(/.*\//, '').padEnd(18), `Boden ${String(boden).padStart(7)} px`);
  console.log('   Staub', pct(staub), ' Fels', pct(fels), ' Bruch', pct(bruch), ' Frost', pct(frost));
}
