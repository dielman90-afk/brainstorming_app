// **Verteilung eines Bildes innerhalb einer Maske.**
//
//   node tools/maskenwerte.mjs <maske.png> <bild.png> [<bild.png> ...]
//
// `knotenwerte.mjs --maske` schreibt die Beitragsmaske eines Knotens als Bild.
// Damit laesst sich derselbe Ausschnitt auf einem ANDEREN Stand messen — der
// Weg, ein Vorher zu bekommen, wenn das Bauteil dort noch keinen eigenen
// Knoten hatte, weil es mit anderen zusammen verschmolzen war.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [maskeDatei, ...bilder] = process.argv.slice(2);
const m = PNG.sync.read(fs.readFileSync(maskeDatei));
const punkte = [];
for (let i = 0; i < m.width * m.height; i++) if (m.data[i * 4] < 250) punkte.push(i);
process.stdout.write(`Maske ${punkte.length} Punkte\n`);
for (const datei of bilder) {
  const p = PNG.sync.read(fs.readFileSync(datei));
  const v = punkte.map((i) => 0.2126 * p.data[i*4] + 0.7152 * p.data[i*4+1] + 0.0722 * p.data[i*4+2]);
  v.sort((a, b) => a - b);
  const q = (t) => v[Math.floor(v.length * t)].toFixed(0);
  const mit = v.reduce((a, b) => a + b, 0) / v.length;
  process.stdout.write(
    `${datei.split('/').slice(-2).join('/').padEnd(28)} Mittel ${mit.toFixed(1).padStart(6)}  p05 ${q(0.05).padStart(3)}  p50 ${q(0.5).padStart(3)}  p95 ${q(0.95).padStart(3)}  Spanne ${(q(0.95) - q(0.05)).toString().padStart(3)}\n`
  );
}
