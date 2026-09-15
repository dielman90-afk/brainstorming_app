// **Wo klafft der Himmel mitten in der Insel?**
//
//   node tools/schwebeprobe.mjs <bild.png> [<mindestflaeche>]
//
// Der Pruefer meldet freischwebende Felsen an der Inselkante. „Freischwebend"
// ist eine Aussage ueber die Silhouette, und die laesst sich genau messen: Ein
// Block, der ueber die Kante hinausragt, laesst unter sich **Himmel** stehen —
// ein Loch, das rundum von Insel umschlossen ist.
//
// Gemessen wird deshalb der eingeschlossene Himmel: Der Himmel wird vom
// Bildrand her geflutet; was danach an Himmelsfarbe uebrig bleibt, liegt
// zwischen Inselteilen. Gemeldet werden Zahl, Flaeche und Lage der Loecher.
//
// Ein paar wenige kleine Loecher sind normal — zwischen zwei Blaettern steht
// Himmel, und das soll so sein. Der Befund sind die **grossen**: ein Loch von
// hunderten Bildpunkten unter einem Felsen ist die Luft, in der er schwebt.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const datei = process.argv[2];
const MIN = process.argv[3] ? Number(process.argv[3]) : 60;
const p = PNG.sync.read(fs.readFileSync(datei));
const W = p.width;
const H = p.height;

// Himmel: deutlich blau und hell. Die Wolken sind fast weiss und zaehlen mit,
// sonst waere jede Wolke hinter der Insel ein „Loch".
const istHimmel = (x, y) => {
  const i = (y * W + x) * 4;
  const r = p.data[i];
  const g = p.data[i + 1];
  const b = p.data[i + 2];
  return b > r + 18 && b > 120 && g > r;
};

const himmel = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) himmel[y * W + x] = istHimmel(x, y) ? 1 : 0;

// Flutung vom Rand
const erreicht = new Uint8Array(W * H);
const stapel = [];
const schiebe = (x, y) => {
  const k = y * W + x;
  if (himmel[k] && !erreicht[k]) {
    erreicht[k] = 1;
    stapel.push(k);
  }
};
for (let x = 0; x < W; x++) {
  schiebe(x, 0);
  schiebe(x, H - 1);
}
for (let y = 0; y < H; y++) {
  schiebe(0, y);
  schiebe(W - 1, y);
}
while (stapel.length) {
  const k = stapel.pop();
  const x = k % W;
  const y = (k / W) | 0;
  if (x > 0) schiebe(x - 1, y);
  if (x < W - 1) schiebe(x + 1, y);
  if (y > 0) schiebe(x, y - 1);
  if (y < H - 1) schiebe(x, y + 1);
}

// Was uebrig bleibt, in Komponenten zerlegen
const gesehen = new Uint8Array(W * H);
const loecher = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!himmel[k] || erreicht[k] || gesehen[k]) continue;
    let n = 0;
    let x0 = W;
    let x1 = -1;
    let y0 = H;
    let y1 = -1;
    const s = [k];
    gesehen[k] = 1;
    while (s.length) {
      const q = s.pop();
      const qx = q % W;
      const qy = (q / W) | 0;
      n++;
      if (qx < x0) x0 = qx;
      if (qx > x1) x1 = qx;
      if (qy < y0) y0 = qy;
      if (qy > y1) y1 = qy;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = qx + dx;
        const ny = qy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (himmel[nk] && !erreicht[nk] && !gesehen[nk]) {
          gesehen[nk] = 1;
          s.push(nk);
        }
      }
    }
    if (n >= MIN) loecher.push({ n, x0, y0, x1, y1 });
  }
}
loecher.sort((a, b) => b.n - a.n);
const summe = loecher.reduce((a, l) => a + l.n, 0);
process.stdout.write(
  `${datei}\n\neingeschlossener Himmel ab ${MIN} Bildpunkten: ` +
    `${loecher.length} Loecher, zusammen ${summe} Bildpunkte\n\n` +
    `${'Flaeche'.padStart(9)}   Kasten\n`
);
for (const l of loecher.slice(0, 12)) {
  process.stdout.write(`${String(l.n).padStart(9)}   ${l.x0},${l.y0},${l.x1},${l.y1}\n`);
}
