// Bildausschnitt vergrößern.
//
// Die Prüfbilder sind 1280x720. Ein Vogel am Himmel ist darin fünfzehn Pixel
// groß – ob seine Silhouette liest oder ob er ein schwarzer Strich ist, sieht
// man daran nicht. Dieses Werkzeug schneidet einen Bereich heraus und
// vergrößert ihn ohne Glättung, damit die tatsächlichen Pixel sichtbar bleiben.
//
//   node tools/crop.mjs <bild.png> <x> <y> <breite> <höhe> [zoom] [ziel.png]

import fs from 'node:fs';
import { PNG } from 'pngjs';

const [file, cx, cy, w, h, z, ziel] = process.argv.slice(2);
const src = PNG.sync.read(fs.readFileSync(file));
const W = +w;
const H = +h;
const Z = +(z || 6);
const out = new PNG({ width: W * Z, height: H * Z });
for (let y = 0; y < H * Z; y++) {
  for (let x = 0; x < W * Z; x++) {
    const sx = Math.min(src.width - 1, Math.max(0, +cx - (W >> 1) + Math.floor(x / Z)));
    const sy = Math.min(src.height - 1, Math.max(0, +cy - (H >> 1) + Math.floor(y / Z)));
    const si = (sy * src.width + sx) * 4;
    const di = (y * out.width + x) * 4;
    out.data[di] = src.data[si];
    out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2];
    out.data[di + 3] = 255;
  }
}
fs.writeFileSync(ziel || 'crop.png', PNG.sync.write(out));
