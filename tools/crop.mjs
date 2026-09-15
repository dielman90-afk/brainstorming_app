// Bildausschnitt vergrößern.
//
// Die Prüfbilder sind 1280x720. Ein Vogel am Himmel ist darin fünfzehn Pixel
// groß – ob seine Silhouette liest oder ob er ein schwarzer Strich ist, sieht
// man daran nicht. Dieses Werkzeug schneidet einen Bereich heraus und
// vergrößert ihn ohne Glättung, damit die tatsächlichen Pixel sichtbar bleiben.
//
//   node tools/crop.mjs <bild.png> <x> <y> <breite> <höhe> [zoom] [ziel.png]
//   node tools/crop.mjs <bild.png> --kasten <x0,y0,x1,y1> [zoom] [ziel.png]
//
// **`<x> <y>` ist die MITTE, nicht die Ecke.** Das stand hier nicht, und es hat
// mich in einer einzigen Sitzung fünfmal danebengreifen lassen: der Stamm vier
// Bildpunkte neben dem Kasten, die Wolken auf einer Gruppe, die sich gar nicht
// geändert hatte, die Krone zweihundert Bildpunkte daneben, ein Messband über
// eine Schattenkante, das in beiden Ständen „kein Uebergang" fand, und einmal
// beinahe der Befund „die Gegenlichtkamera zeigt nur Himmel". Jedes Mal habe
// ich den Fehler bei der Szene gesucht.
//
// `--kasten` nimmt deshalb direkt die Ausgabe von `knotenkasten.mjs`: vier
// Zahlen, obere linke und untere rechte Ecke, mit einem Rand von zehn Prozent.
// Wer eine Maske gemessen hat, soll sie nicht in Mittelpunkt und Breite
// umrechnen müssen.

import fs from 'node:fs';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const file = argv[0];
const src = PNG.sync.read(fs.readFileSync(file));
let cx;
let cy;
let W;
let H;
let Z;
let ziel;
if (argv[1] === '--kasten') {
  const [x0, y0, x1, y1] = argv[2].split(',').map(Number);
  const rand = Math.max(4, Math.round(Math.max(x1 - x0, y1 - y0) * 0.1));
  W = x1 - x0 + 1 + rand * 2;
  H = y1 - y0 + 1 + rand * 2;
  cx = Math.round((x0 + x1) / 2);
  cy = Math.round((y0 + y1) / 2);
  Z = +(argv[3] || 6);
  ziel = argv[4];
} else {
  cx = +argv[1];
  cy = +argv[2];
  W = +argv[3];
  H = +argv[4];
  Z = +(argv[5] || 6);
  ziel = argv[6];
}
const out = new PNG({ width: W * Z, height: H * Z });
for (let y = 0; y < H * Z; y++) {
  for (let x = 0; x < W * Z; x++) {
    const sx = Math.min(src.width - 1, Math.max(0, cx - (W >> 1) + Math.floor(x / Z)));
    const sy = Math.min(src.height - 1, Math.max(0, cy - (H >> 1) + Math.floor(y / Z)));
    const si = (sy * src.width + sx) * 4;
    const di = (y * out.width + x) * 4;
    out.data[di] = src.data[si];
    out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2];
    out.data[di + 3] = 255;
  }
}
fs.writeFileSync(ziel || 'crop.png', PNG.sync.write(out));
