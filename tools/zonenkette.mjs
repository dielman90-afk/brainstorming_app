// **Die Zonenkette des Dojos, ohne Browser.**
//
// `makeZonesWalk` (src/walkable.js) ist reine Rechnung, und die Frage, ob man
// durch die Südwand kommt, hängt nur an Zonen und Schrittweite — nicht an
// Bildern. Deshalb läuft diese Prüfung in Node, in Sekundenbruchteilen, und
// kann tun, was `tools/gehbereich.mjs` im Browser zu teuer ist: jede Stelle
// entlang der Wand und jede Schrittweite bis zum Deckel abfahren.
//
// Die Zonen werden aus src/dojo/index.js **gelesen**, nicht abgeschrieben —
// eine zweite Kopie hier wäre beim nächsten Umbau des Gartens still veraltet.
//
//   1. Durch die Tür: vom Raum nach Süden bis ins Kiesbeet.
//   2. An der Südwand: neben der Tür nach Süden drücken und dabei seitlich
//      entlangrutschen — die Wand muss halten.
//   3. Zurück: vom Kiesbeet durch die Tür in den Raum.
//
// Aufruf: node tools/zonenkette.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZonesWalk } from '../src/walkable.js';
import { EXTERIOR, SHOJI_SOUTH } from '../src/dojo/layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Der Deckel je Bild aus src/locomotion.js und updateDesktopMovement.
const DECKEL = 0.3;

const quelle = fs.readFileSync(path.join(ROOT, 'src/dojo/index.js'), 'utf8');
const treffer = quelle.match(/walk:\s*makeZonesWalk\(\s*(\[[\s\S]*?\n\s*\])\s*,/);
if (!treffer) throw new Error('Zonenliste in src/dojo/index.js nicht gefunden');
// Kommentare stehen mitten in der Liste; `Function` versteht sie, EXTERIOR
// wird als einziger Name hineingereicht.
const ZONEN = new Function('EXTERIOR', `return ${treffer[1]};`)(EXTERIOR);
const KIES_Y = EXTERIOR.ground.y + 0.045;
// Die lichte Türöffnung: zwei offene Felder in einem Raster von acht.
const feld = (SHOJI_SOUTH.to - SHOJI_SOUTH.from) / SHOJI_SOUTH.panels;
const TUER = {
  minX: SHOJI_SOUTH.from + feld * Math.min(...SHOJI_SOUTH.openPanels),
  maxX: SHOJI_SOUTH.from + feld * (Math.max(...SHOJI_SOUTH.openPanels) + 1),
};
const WAND_Z = SHOJI_SOUTH.z;

let fehler = 0;
const pruefe = (ok, text) => {
  if (!ok) fehler++;
  console.log(`  ${ok ? '✅' : '❌'} ${text}`);
};

// So, wie die Bildschleife es tut: Bewegung auf den letzten geklemmten Punkt,
// dann `limit`, dann `floorAt` am geklemmten Punkt.
function gehe(walk, start, schritte) {
  const p = { x: start.x, z: start.z };
  const out = { x: 0, z: 0 };
  walk.limit(p.x, p.z, out);
  p.x = out.x;
  p.z = out.z;
  const spur = [{ ...p, y: walk.floorAt(p.x, p.z) }];
  for (const [dx, dz] of schritte) {
    walk.limit(p.x + dx, p.z + dz, out);
    p.x = out.x;
    p.z = out.z;
    spur.push({ ...p, y: walk.floorAt(p.x, p.z) });
  }
  return spur;
}
const gerade = (dx, dz, n) => Array.from({ length: n }, () => [dx, dz]);

console.log(`Zonen: ${ZONEN.length}, Tür x ∈ [${TUER.minX}, ${TUER.maxX}], Wand bei z = ${WAND_Z}`);
const schrittweiten = [0.05, 0.1, 0.15, 0.2, 0.25, DECKEL];

console.log('\n=== 1. Durch die Tür ins Kiesbeet ===');
for (const s of schrittweiten) {
  const walk = makeZonesWalk(ZONEN);
  const spur = gehe(walk, { x: 0, z: 0 }, gerade(0, s, Math.ceil(14 / s)));
  const ende = spur[spur.length - 1];
  pruefe(ende.z > 11.5 && Math.abs(ende.y - KIES_Y) < 1e-9, `Schritt ${s.toFixed(2)} m: Ende z = ${ende.z.toFixed(2)} m, Boden ${ende.y.toFixed(3)} m`);
}

console.log('\n=== 2. An der Südwand neben der Tür ===');
// Jede Stelle neben der Öffnung, in 5-cm-Schritten bis an die Seitenwände.
// Gedrückt wird gerade nach Süden und schräg (30 und 60 Grad) **von der Tür
// weg** — so rutscht man an der Wand entlang. Zur Tür hin darf man natürlich
// hinaus; das prüft Teil 1. Gemessen wird der südlichste erreichte Punkt.
// Auch über dem Deckel: Der Handzug in der Brille trägt bis 0,64 m je Bild.
for (const s of [...schrittweiten, 0.5, 0.64]) {
  let schlimmste = { z: -Infinity };
  for (let x0 = -5.5; x0 <= 5.5001; x0 += 0.05) {
    if (x0 > TUER.minX - 0.05 && x0 < TUER.maxX + 0.05) continue;
    for (const grad of [0, 30, 60]) {
      const a = (grad * Math.PI) / 180;
      const walk = makeZonesWalk(ZONEN);
      const spur = gehe(walk, { x: x0, z: 6.5 }, gerade(Math.sign(x0) * Math.sin(a) * s, Math.cos(a) * s, 40));
      for (const p of spur) if (p.z > schlimmste.z) schlimmste = { ...p, x0, grad };
    }
  }
  pruefe(
    schlimmste.z < WAND_Z,
    `Schritt ${s.toFixed(2)} m: südlichster Punkt neben der Tür z = ${schlimmste.z.toFixed(2)} m` +
      ` (Start x = ${schlimmste.x0.toFixed(2)}, ${schlimmste.grad} Grad)`
  );
}

console.log('\n=== 3. Zurück vom Kiesbeet in den Raum ===');
for (const s of schrittweiten) {
  const walk = makeZonesWalk(ZONEN);
  gehe(walk, { x: 0, z: 0 }, gerade(0, 0.1, 120)); // erst hinaus
  const spur = gehe(walk, { x: 0, z: 11 }, gerade(0, -s, Math.ceil(12 / s)));
  const ende = spur[spur.length - 1];
  pruefe(ende.z < 0 && Math.abs(ende.y) < 1e-9, `Schritt ${s.toFixed(2)} m: Ende z = ${ende.z.toFixed(2)} m, Boden ${ende.y.toFixed(3)} m`);
}

console.log(fehler ? `\n❌ ${fehler} Abweichung(en)` : '\n✅ Kette und Wand halten');
process.exit(fehler ? 1 : 0);
