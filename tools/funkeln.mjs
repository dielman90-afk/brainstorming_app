// **Einzelne Bildpunkte, die aus dem Gelände herausleuchten.**
//
// Befund des Prüfers: „Sterne stehen auf dem Boden" — 366 farbneutrale
// Lichtpunkte auf rotem Regolith am Kamm von `rund-300`, mit Einzelnachweis:
// bei (600,397) steht (110,106,107) zwischen zwei Bodenpixeln (29,11,6).
//
// **Es sind keine Sterne.** Blendet man `nacht-planet` aus, verschwindet der
// helle Punkt; blendet man alle Punktwolken, Höfe, Monde und die Kuppel aus,
// bleibt er. Der Boden selbst leuchtet dort. Auch kein Glanzlicht: Mit
// `roughness = 1` und ohne Rauheitskarte steht der Wert unverändert bei
// (115,112,113). Was ihn zum Verschwinden bringt, ist zweierlei — das
// gerichtete Mondlicht (dann 17,8,5) und die Normalenkarte (dann 23,26,28).
//
// Es ist also **diffuses Licht auf einer normalengestörten Fläche bei
// streifendem Einfall**: Ein Bildpunkt, dessen gestörte Normale zufällig zum
// Mond zeigt, bekommt ein Vielfaches der Beleuchtung seiner Nachbarn, und weil
// das Mondlicht fast weiß ist, kippt die Farbe im oberen Ende der Tonkurve ins
// Neutrale. Im Standbild ist es Grieß; bei drehender Welt kriecht es.
//
// Gezählt wird, was ein Mensch als Fehler sieht: ein Bildpunkt, der **deutlich
// heller als alle vier Nachbarn** ist und dabei **farbneutral**, während seine
// Umgebung rot ist.
//
//   node tools/funkeln.mjs [--bilder <ordner>]

import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT } from './harness-common.mjs';

const argv = process.argv.slice(2);
const dir = path.resolve(ROOT, argv.includes('--bilder') ? argv[argv.indexOf('--bilder') + 1] : 'tools/shots/rundgang');

const zaehle = (p) => {
  const { width: w, height: h, data } = p;
  const at = (x, y) => (y * w + x) * 4;
  const L = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  let n = 0;
  let hellste = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = at(x, y);
      const l = L(i);
      if (l < 45) continue;
      // Farbneutral: Rot und Blau liegen dicht beieinander.
      if (Math.abs(data[i] - data[i + 2]) > 14) continue;
      // Deutlich heller als alle vier Nachbarn …
      const nb = [L(at(x - 1, y)), L(at(x + 1, y)), L(at(x, y - 1)), L(at(x, y + 1))];
      if (Math.max(...nb) > l - 25) continue;
      // … und die Nachbarn sind roter Boden, kein Himmel.
      let boden = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const j = at(x + dx, y + dy);
        if (data[j] - data[j + 2] > 6) boden++;
      }
      if (boden < 3) continue;
      n++;
      hellste = Math.max(hellste, l);
    }
  }
  return { n, hellste };
};

const dateien = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
let summe = 0;
console.log(`\n=== Funkeln im Gelände (${path.relative(ROOT, dir)}) ===`);
for (const f of dateien) {
  const r = zaehle(PNG.sync.read(fs.readFileSync(path.join(dir, f))));
  summe += r.n;
  console.log(`  ${f.padEnd(16)} ${String(r.n).padStart(4)} Punkte${r.n ? `, hellster L ${r.hellste.toFixed(0)}` : ''}`);
}
console.log(`\n  Summe über ${dateien.length} Bilder: ${summe}`);
