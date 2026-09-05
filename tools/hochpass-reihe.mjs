// Feinstruktur eines Bildes in mehreren waagerechten Baendern - fuer die Frage,
// ob das Korn mit der Entfernung abnimmt oder als Moire stehen bleibt.
//
//   node tools/hochpass-reihe.mjs <bild.png> [x0 x1 y-von y-bis schritt]
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0s, x1s, yVon, yBis, schritts] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const X0 = +(x0s ?? 200), X1 = +(x1s ?? 1080);
const L = (x, y) => { const i = (y*p.width+x)*4; return 0.2126*p.data[i]+0.7152*p.data[i+1]+0.0722*p.data[i+2]; };
const band = (y0, y1) => {
  let hp = 0, n = 0;
  for (let y = y0 + 2; y <= y1 - 2; y++) for (let x = X0 + 2; x <= X1 - 2; x++) {
    let s5 = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s5 += L(x + dx, y + dy);
    hp += Math.abs(L(x, y) - s5 / 25); n++;
  }
  return hp / n;
};
const werte = [];
for (let y = +(yBis ?? 700); y >= +(yVon ?? 430); y -= +(schritts ?? 60)) werte.push(band(y - 38, y).toFixed(3));
console.log(`${f.split('/').slice(-2).join('/').padEnd(26)} nah -> fern:  ${werte.join('  ')}`);
