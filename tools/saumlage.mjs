// **Sitzt der Himmelssaum am Rand oder mitten im Laub?**
//
//   node tools/saumlage.mjs <bild.png> <x0> <y0> <x1> <y1>
//
// Ein Fresnel-Saum gehoert an die Silhouette: dorthin, wo eine Flaeche
// wegkippt und der Himmel dahinter steht. Auf einer **Blattkarte** — einer
// ebenen Flaeche mit konstanter Normale — wird er dagegen zur Flaechenfarbe,
// und dann sitzt er irgendwo im Volumen.
//
// Der Pruefer: „3,05 Prozent der Laubpixel mit B ueber R+30, davon 2,48
// Prozentpunkte vollstaendig von Laub umschlossen."
//
// Gemessen wird genau das: der Anteil der Saumpixel und davon der Anteil, der
// **keinen** Nachbarn ausserhalb des Laubs hat. Ein Saum am Rand hat immer
// Himmel neben sich; einer im Innern nie.
import fs from 'node:fs';
import { PNG } from 'pngjs';
const [f, x0, y0, x1, y1] = process.argv.slice(2);
const p = PNG.sync.read(fs.readFileSync(f));
const at = (x, y) => {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
};
const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// Laub ist dunkel und gruenlastig; Himmel ist hell und blaulastig.
const istLaub = (x, y) => {
  const c = at(x, y);
  return !(c[2] > c[0] + 18 && L(c) > 120);
};
let laub = 0;
let saum = 0;
let innen = 0;
for (let y = +y0 + 1; y <= +y1 - 1; y++) {
  for (let x = +x0 + 1; x <= +x1 - 1; x++) {
    if (!istLaub(x, y)) continue;
    laub++;
    const c = at(x, y);
    if (!(c[2] > c[0] + 30)) continue;
    saum++;
    let offen = false;
    for (let dy = -1; dy <= 1 && !offen; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!istLaub(x + dx, y + dy)) {
          offen = true;
          break;
        }
      }
    if (!offen) innen++;
  }
}
// Der Silhouettensprung im selben Kasten: mittlerer Helligkeitsunterschied
// ueber jede waagerechte Grenze Laub/Himmel, dazu die Zahl der Grenzstuecke.
// Beides gehoert zusammen — ein Saum, der Karten im Innern aufhellt, laesst
// die Kontur in mehr und schwaechere Stuecke zerfallen.
let summe = 0;
let kanten = 0;
for (let y = +y0; y <= +y1; y++) {
  for (let x = +x0; x < +x1; x++) {
    if (istLaub(x, y) !== istLaub(x + 1, y)) {
      summe += Math.abs(L(at(x, y)) - L(at(x + 1, y)));
      kanten++;
    }
  }
}
console.log(
  `${f.split('/').slice(-2).join('/').padEnd(24)} Laubpixel ${String(laub).padStart(6)}   Saum ${((saum * 100) / laub).toFixed(2).padStart(5)} %   davon innen liegend ${((innen * 100) / laub).toFixed(2).padStart(5)} Prozentpunkte   Silhouettensprung ${(summe / Math.max(1, kanten)).toFixed(1).padStart(5)} (${kanten} Kanten)`
);
