// **Einen Mattenverband suchen, in dem sich nirgends vier Ecken treffen.**
//
//   node tools/mattenverband.mjs <spalten> <reihen> [maxHalbmatten] [Anlaeufe]
//
// Der Anlass ist Prüferbefund 12: Kreuzfugen im Mattenfeld. Das Feld war in
// Quadrate von 1,82 m mit je zwei Matten geteilt, und ein solches Quadrat hat,
// wie es auch gedreht ist, immer eine Mattenecke in jeder Quadratecke — an
// jedem inneren Quadratpunkt treffen sich also vier. Der Schachbrettverband
// kann das gar nicht lösen.
//
// Die Regel (祝儀敷き) lautet: keine vier Ecken in einem Punkt. Vier Ecken
// treffen sich im Gitterpunkt (x,z) genau dann, wenn die vier Zellen darum zu
// vier verschiedenen Matten gehören. Alles Weitere ist Rückwärtssuche.
//
// **Die Regel zu erfüllen genügt nicht.** Der erste beste Verband, den die
// Suche findet, hat 34 % Richtungswechsel und liest im Bild als gestreifte
// Bahn — schlechter als das Schachbrett, das er ersetzen sollte. Deshalb
// bewertet dieses Werkzeug und sucht viele Male:
//
//   Richtungswechsel  Anteil benachbarter Mattenpaare mit verschiedener Lage.
//                     Das ist es, was ein Mattenfeld von einem Teppich trennt.
//   Fuge              Längste Gitterlinie, über die keine Matte hinweggeht.
//   Halbmatten        Gehören dazu (半畳), aber acht sind schon viele.
//
// Gemessen für das Dojo-Feld:
//
//     Feld    Halbe   Wechsel   Fuge   Kreuzfugen
//     8 x 12  (Schachbrett)  61 %   12      15
//     8 x 12    0     keine Loesung
//     8 x 12    1     keine Loesung
//     8 x 12    2     35 %       8       0
//     8 x 10    0     27 %       8       0
//     9 x 12    8     59 %       6       0     <- gewaehlt
//
// Die Breite des Feldes ist damit ein **Messwert**: 8 x 12 kann die Regel
// nicht anständig erfüllen, 9 x 12 schon.

const [spaltenArg, reihenArg, halbArg, anlaeufeArg] = process.argv.slice(2);
const W = Number(spaltenArg ?? 9);
const H = Number(reihenArg ?? 12);
const MAX_HALB = Number(halbArg ?? 8);
const ANLAEUFE = Number(anlaeufeArg ?? 600);

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function suche(seed) {
  const r = rng(seed);
  const N = W * H;
  const zelle = new Int32Array(N).fill(-1);
  const matten = [];
  let halbe = MAX_HALB;
  let schritte = 0;

  const punktOk = (x, z) => {
    if (x <= 0 || z <= 0 || x >= W || z >= H) return true;
    const a = zelle[(z - 1) * W + x - 1];
    const b = zelle[(z - 1) * W + x];
    const c = zelle[z * W + x - 1];
    const d = zelle[z * W + x];
    if (a < 0 || b < 0 || c < 0 || d < 0) return true;
    return a === b || a === c || a === d || b === c || b === d || c === d;
  };

  const loese = (start) => {
    if (++schritte > 2e6) return false;
    let i = start;
    while (i < N && zelle[i] >= 0) i++;
    if (i >= N) return true;
    const x = i % W;
    const z = (i / W) | 0;
    const id = matten.length;
    const formen = r() < 0.5 ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]];
    if (halbe > 0) (r() < 0.15 ? formen.unshift : formen.push).call(formen, [0, 0]);
    for (const [dx, dz] of formen) {
      const x2 = x + dx;
      const z2 = z + dz;
      if (x2 >= W || z2 >= H) continue;
      const halb = dx + dz === 0;
      if (!halb && zelle[z2 * W + x2] >= 0) continue;
      if (halb) halbe--;
      zelle[i] = id;
      zelle[z2 * W + x2] = id;
      matten.push([x, z, dx, dz]);
      let ok = true;
      for (const [px, pz] of [
        [x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1],
        [x2, z2], [x2 + 1, z2], [x2, z2 + 1], [x2 + 1, z2 + 1],
      ]) {
        if (!punktOk(px, pz)) {
          ok = false;
          break;
        }
      }
      if (ok && loese(i + 1)) return true;
      matten.pop();
      zelle[i] = -1;
      zelle[z2 * W + x2] = -1;
      if (halb) halbe++;
    }
    return false;
  };

  return loese(0) ? { matten, zelle } : null;
}

function fuge(zelle) {
  let max = 0;
  for (let z = 1; z < H; z++) {
    let l = 0;
    for (let x = 0; x < W; x++) {
      l = zelle[(z - 1) * W + x] === zelle[z * W + x] ? 0 : l + 1;
      if (l > max) max = l;
    }
  }
  for (let x = 1; x < W; x++) {
    let l = 0;
    for (let z = 0; z < H; z++) {
      l = zelle[z * W + x - 1] === zelle[z * W + x] ? 0 : l + 1;
      if (l > max) max = l;
    }
  }
  return max;
}

function wechsel(zelle, matten) {
  const lage = matten.map(([, , dx]) => dx);
  let paare = 0;
  let anders = 0;
  const nb = (i, j) => {
    const a = zelle[i];
    const b = zelle[j];
    if (a === b) return;
    paare++;
    if (lage[a] !== lage[b]) anders++;
  };
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (x + 1 < W) nb(z * W + x, z * W + x + 1);
      if (z + 1 < H) nb(z * W + x, (z + 1) * W + x);
    }
  }
  return paare ? anders / paare : 0;
}

function kreuzfugen(zelle) {
  let n = 0;
  for (let z = 1; z < H; z++) {
    for (let x = 1; x < W; x++) {
      const a = zelle[(z - 1) * W + x - 1];
      const b = zelle[(z - 1) * W + x];
      const c = zelle[z * W + x - 1];
      const d = zelle[z * W + x];
      if (a !== b && a !== c && a !== d && b !== c && b !== d && c !== d) n++;
    }
  }
  return n;
}

let best = null;
let bestWert = Infinity;
for (let s = 1; s <= ANLAEUFE; s++) {
  const l = suche(s * 2654435761);
  if (!l) continue;
  const w = wechsel(l.zelle, l.matten);
  const f = fuge(l.zelle);
  const halbe = l.matten.filter((m) => m[2] + m[3] === 0).length;
  const wert = -100 * w + f + 2 * halbe;
  if (wert < bestWert) {
    bestWert = wert;
    best = { ...l, seed: s, w, f, halbe };
  }
}

if (!best) {
  process.stdout.write(`Keine Loesung fuer ${W} x ${H} mit bis zu ${MAX_HALB} Halbmatten\n`);
  process.exit(1);
}

process.stdout.write(
  `${W} x ${H}: ${best.matten.length} Matten (${best.halbe} halbe), ` +
    `Wechsel ${(best.w * 100).toFixed(0)} %, Fuge ${best.f}, ` +
    `Kreuzfugen ${kreuzfugen(best.zelle)}, Saat ${best.seed}\n\n`
);
for (let z = 0; z < H; z++) {
  let zeile = '';
  for (let x = 0; x < W; x++) zeile += (best.zelle[z * W + x] % 36).toString(36);
  process.stdout.write(zeile + '\n');
}
process.stdout.write('\n' + JSON.stringify(best.matten) + '\n');
