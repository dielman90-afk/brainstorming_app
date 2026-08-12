import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightToMaps } from './materials.js';

// 🍁 Laub – Atlas, Material und Kartenwolke.
//
// **Warum dieses Modul überhaupt existiert.**
//
// Das Laub im Garten war bisher entweder eine gekreuzte Ebene mit einer
// Alphakarte (`dojo-bamboo-laub`) oder ein glatter Körper (`dojo-garden-krone`).
// Beides scheitert an derselben Stelle, nur von zwei Seiten:
//
//   * Die Alphakarte war **dünn gestreut**. Wo Blätter enden, endet auch das
//     Alpha – und weil die äußersten Blätter bis an den Rand der Ebene reichten,
//     fiel die Alphakante mit der Rechteckkante zusammen. Man sah nicht Laub,
//     man sah ein Rechteck mit Löchern. Die Abhilfe ist nicht „mehr Blätter",
//     sondern eine **Dichteverteilung**: in der Mitte geschlossen, nach außen
//     in einzelne Blätter auslaufend, und nichts berührt den Zellrand.
//
//   * Der Körper war **flach beleuchtet**. Eine Kugel mit Blattfarbe ist eine
//     Kugel. Was ein Blatt als Blatt lesbar macht, ist nicht seine Silhouette,
//     sondern wie es Licht fängt: gewölbt, mit Mittelrippe, im Gegenlicht
//     durchscheinend.
//
// Dieses Modul liefert beide fehlenden Hälften und lässt den Körper bewusst
// stehen: Der Blob bleibt Masse und Verdecker, die Karten machen Kontur und
// Lichtspiel. Ein Kartenschopf allein hat keine Tiefe, ein Blob allein keine
// Kontur.
//
// **Die zwei Punkte, an denen es hängt** – in dieser Reihenfolge:
//   1. Transluzenz. Ein Blatt gegen die Sonne leuchtet. Das ist der einzige
//      Effekt, den man auf einem Standbild sofort erkennt.
//   2. Eine Normal-Map aus einem echten Höhenfeld. Ohne sie ist jede Karte
//      Pappe, egal wie gut die Alphaform ist.
//
// **Randbedingungen, die die Bauform bestimmen.** Kein Post-Processing (der
// EffectComposer verträgt sich hier nicht mit WebXR), also muss alles in den
// Materialshader. Keine externen Texturen, also alles prozedural. Eine einzige
// gerichtete Sonne (layout.js:SUN), also darf der Transluzenzterm sich auf
// `directionalLights[0]` beziehen statt über eine Schleife zu laufen.

// --- Deterministischer Zufall ------------------------------------------------
//
// Gleiches Verfahren wie in exterior.js: Ein Laub, das sich bei jedem Laden neu
// würfelt, macht jeden Screenshot-Vergleich wertlos.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// =============================================================================
//  1. Blatt-Atlas
// =============================================================================
//
// 512 px, aufgeteilt in **2 × 2 Zellen** zu je 256 px. Vier Varianten derselben
// Art in einer Textur: Der Kartenschopf greift je Karte eine zufällige Zelle,
// und damit wiederholt sich keine Karte sichtbar. Vier eigene Texturen wären
// vier GPU-Ladungen für dasselbe Bild – auf der Quest ist das die falsche Seite
// des Tauschs.
const ATLAS = 512;
const CELLS = 2; // je Achse
const CELL = ATLAS / CELLS; // 256

// Gezeichnet wird **nicht** auf Canvas, sondern analytisch in Typed Arrays.
//
// Der Grund ist die Normal-Map: Sie muss aus demselben Höhenfeld kommen wie die
// Alphaform, sonst liegen Wölbung und Blattkante gegeneinander versetzt und man
// sieht Relief, wo gar kein Blatt ist. Canvas kennt keine Höhe; ein zweiter
// Durchgang, der dieselben Formen noch einmal zeichnet, wäre die klassische
// Quelle für genau diesen Versatz. Analytisch rasterisiert fällt Deckung,
// Farbe und Höhe **in derselben Schleife** an und kann gar nicht auseinander
// laufen.

// Halbbreite als Anteil der Blattlänge, über die normierte Länge u ∈ [0,1].
// Die Formen sind der Punkt, an dem die vier Arten auseinandergehen – aus zehn
// Metern ist der Umriss das Einzige, was von einer Art übrig bleibt.
const SHAPES = {
  // Lanzettlich: schmal, breiteste Stelle bei rund einem Drittel, lange Spitze.
  bamboo: { w: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.58)), 0.8) * 0.082, max: 0.09 },
  // Ahornlappen: breit, gezähnt, mit einer Spitze. Fünf davon ergeben die Hand.
  maple: {
    w: (u) =>
      Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.72) *
      0.27 *
      (1 + 0.16 * Math.sin(u * Math.PI * 8.0)),
    max: 0.33,
  },
  // Verkehrt-eiförmig: kurz, stumpf, breiteste Stelle über der Mitte.
  azalea: { w: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 1.05)), 0.6) * 0.31, max: 0.33 },
  // Fiederblättchen: schmal-oval, an der Basis breit angesetzt.
  fern: { w: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.62) * 0.195, max: 0.21 },
  // **Kirschblüte, kein Blatt.** Fünf Kronblätter, jedes vorne eingekerbt – die
  // Kerbe ist das Erkennungsmerkmal von Prunus und der Grund, warum eine
  // Sakura-Krone selbst aus zehn Metern nicht wie ein rosa Ball aussieht. Der
  // Kosinusterm mit Periode 5 legt die fünf Lappen an, der zweite mit doppelter
  // Frequenz kerbt jede Spitze ein.
  sakura: {
    w: (u) =>
      Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.55) *
      0.3 *
      (1 + 0.22 * Math.cos(u * Math.PI * 5) - 0.1 * Math.cos(u * Math.PI * 10)),
    max: 0.36,
  },
  // Koniferennadel: sehr schmal, über fast die ganze Länge gleich breit, vorn
  // zugespitzt. Das ist der Unterschied zu jedem anderen Eintrag hier – ein
  // Laubblatt ist eine Fläche, eine Nadel ist ein Strich mit Dicke. Genau
  // deshalb sah der Nadelbaum mit dem Azaleen-Atlas falsch aus: breite,
  // rundliche Blätter auf einer Kegelsilhouette.
  nadel: { w: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.32)), 0.42) * 0.035, max: 0.04 },
  // Stiel / Rhachis: praktisch konstante Breite. Trägt keine Wölbung, aber sie
  // ist es, die aus fünf Lappen ein Ahornblatt macht statt fünf Streifen.
  stem: { w: (u) => 0.022 * (1 - 0.35 * u), max: 0.025 },
};

// Grundfarben (sRGB 0..255). Bewusst als Zahlentripel und nicht über
// `Color.setHSL()`: Dessen Argumente liegen in three 0.185 im **linearen**
// Arbeitsraum, und genau daran ist die Blattfarbe hier schon zweimal zu hell
// geraten. Ein Wert, den man in einem Farbwähler ablesen kann, kann das nicht.
const PALETTE = {
  bamboo: { base: [86, 112, 52], vary: [[74, 100, 44], [102, 128, 58], [120, 140, 66], [66, 92, 42]] },
  maple: { base: [150, 66, 36], vary: [[168, 74, 38], [186, 112, 44], [126, 52, 32], [198, 140, 56]] },
  azalea: { base: [56, 92, 48], vary: [[48, 84, 44], [68, 104, 52], [40, 72, 38], [84, 116, 60]] },
  fern: { base: [52, 84, 44], vary: [[44, 74, 38], [62, 96, 48], [36, 62, 32], [78, 106, 54]] },
  // Kirschblüte: sehr helles Rosa mit warmem Kern. Die Streuung ist bewusst
  // klein – eine Sakura blüht auf einmal, nicht in vier Tönen. Was sie lebendig
  // macht, ist der Verlauf **innerhalb** eines Blütenblatts (außen fast weiß,
  // zum Ansatz hin rosa), und der steckt in der Aderfunktion, nicht hier.
  sakura: {
    base: [242, 196, 214],
    vary: [[248, 214, 226], [236, 178, 202], [252, 230, 236], [230, 166, 194]],
  },
  // Kiefernnadeln: dunkel, blaustichig, geringe Streuung. Eine Konifere ist
  // einfarbiger als jeder Laubbaum – ihre Tiefe kommt aus der Verschattung
  // zwischen den Zweigen, nicht aus der Blattfarbe.
  nadel: {
    base: [44, 78, 54],
    vary: [[38, 70, 48], [52, 88, 60], [32, 62, 44], [60, 96, 66]],
  },
};

// Aderverlauf. Bei Bambus und Farn laufen die Adern **parallel** zur Blattachse
// (Einkeimblättrige bzw. Fiedernerven, die aus dieser Entfernung parallel
// wirken), bei Ahorn und Azalee **fiedrig** von der Mittelrippe schräg nach
// außen. Das ist kein Detail um seiner selbst willen: Die Aderrichtung
// bestimmt, in welche Richtung die Normal-Map das Licht bricht, und das sieht
// man auch dann, wenn man die Adern einzeln längst nicht mehr auflöst.
const VEINS = {
  bamboo: { mode: 'long', freq: 2.5 },
  maple: { mode: 'pinnate', freq: 7 },
  azalea: { mode: 'pinnate', freq: 6 },
  fern: { mode: 'long', freq: 2 },
  // Kronblätter haben feine, fächerförmige Adern vom Ansatz zur Kerbe –
  // fiedrig ist die nächstliegende der vorhandenen Betriebsarten, und bei
  // dieser Blattgröße ist der Unterschied nicht auflösbar.
  sakura: { mode: 'pinnate', freq: 5 },
  // Eine Nadel hat genau einen Mittelnerv. Bei dieser Breite ist mehr weder
  // sichtbar noch vorhanden.
  nadel: { mode: 'long', freq: 1 },
  stem: { mode: 'none', freq: 0 },
};

// --- Kosten: warum hier Tabellen statt Formeln stehen ------------------------
//
// Die Breitenfunktionen oben kosten je zwei `Math.pow` und einen `Math.sin`.
// Ausgewertet **pro Pixel** waren das gemessene 324 ms allein für den
// Bambusatlas – bei vier Arten die halbe Sekunde, die environments.js:1969 als
// abschreckendes Beispiel führt. Die Breite hängt aber nur von u ab, nicht von
// der Blattgröße: eine Tabelle je Form, einmal gefüllt, ersetzt alle
// Auswertungen. Dasselbe Motiv bei Rippe und Adern – eine Parabel bzw. eine
// geglättete Dreieckswelle sind von `exp` und `cos` an dieser Stelle nicht zu
// unterscheiden und kosten je zwei Multiplikationen.
const LUT_N = 512;
const _luts = {};
function widthLut(name) {
  let l = _luts[name];
  if (!l) {
    const f = SHAPES[name].w;
    l = new Float32Array(LUT_N + 1);
    for (let i = 0; i <= LUT_N; i++) l[i] = f(i / LUT_N);
    _luts[name] = l;
  }
  return l;
}

// Glatte Welle mit Periode 1, 0 bei ganzen Zahlen, 1 bei den Halben.
function wave(x) {
  let f = x - Math.floor(x);
  f = f < 0.5 ? f * 2 : 2 - f * 2;
  return f * f * (3 - 2 * f);
}

// Ein Blattblatt (Lamina oder Stiel) in die Puffer rastern.
//
// Über-Kompositum von hinten nach vorn: Die Liste ist nach `depth` sortiert,
// jedes Blatt überschreibt anteilig nach seiner Deckung. Damit stimmen Alpha,
// Farbe und Höhe automatisch überein – und überlappende Blätter erzeugen im
// Höhenfeld eine echte Stufe, aus der die Normal-Map eine sichtbare Blattkante
// macht. Genau diese Kanten sind es, die einen Schopf plastisch wirken lassen.
function rasterBlade(buf, b) {
  const { x, y, ang, len, curve, shape, thick, base, tint, vein } = b;
  const S = SHAPES[shape];
  const lut = widthLut(shape);
  const V = VEINS[vein] ?? VEINS.stem;
  const longVein = V.mode === 'long';
  const pinnate = V.mode === 'pinnate';
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);

  // Enge Hülle statt Kreis: die vier Ecken des gedrehten Rechtecks
  // [-wmax, wmax] × [0, len]. Spart gegenüber einer Kreisscheibe rund drei
  // Viertel der Pixeltests, und bei rund 500 Blättern je Art zählt das in der
  // Startzeit.
  const wmax = len * S.max + Math.abs(curve) * len + 2;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [lx, ly] of [
    [-wmax, -1],
    [wmax, -1],
    [-wmax, len + 1],
    [wmax, len + 1],
  ]) {
    const wx = x + lx * ca - ly * sa;
    const wy = y + lx * sa + ly * ca;
    if (wx < x0) x0 = wx;
    if (wx > x1) x1 = wx;
    if (wy < y0) y0 = wy;
    if (wy > y1) y1 = wy;
  }
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(ATLAS - 1, Math.ceil(x1));
  y1 = Math.min(ATLAS - 1, Math.ceil(y1));

  const [tr, tg, tb] = tint;

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px + 0.5 - x;
      const dy = py + 0.5 - y;
      // In Blattkoordinaten: ly läuft von 0 (Ansatz) bis len (Spitze).
      const lx = dx * ca + dy * sa;
      const ly = -dx * sa + dy * ca;
      if (ly < -1 || ly > len + 1) continue;
      const u = ly / len;
      // Krümmung: Die Mittelachse weicht quadratisch aus – ein Blatt, das
      // gerade wie ein Lineal steht, verrät sich sofort als generiert.
      const cx = curve * len * u * u;
      const d = lx - cx;
      const halfw = len * lut[u < 0 ? 0 : u > 1 ? LUT_N : (u * LUT_N) | 0];
      const ad = d < 0 ? -d : d;
      if (ad > halfw + 1) continue;

      // 1 px weiche Kante, plus saubere Enden an Ansatz und Spitze.
      let cov = clamp01(halfw - ad + 0.5);
      cov *= clamp01(ly + 0.5) * clamp01(len - ly + 0.5);
      if (cov <= 0.004) continue;

      const q = halfw > 0.001 ? d / halfw : 0;
      // Querschnitt: Ein Blatt ist eine Rinne, kein Blech.
      const q2 = q * q;
      const dome = Math.sqrt(q2 < 1 ? 1 - q2 : 0);
      // Mittelrippe – der schmale Grat, an dem das Streiflicht bricht.
      const rr = 1 - q2 * 26;
      const rib = rr > 0 ? rr * rr : 0;
      let vn = 0;
      if (longVein) vn = wave(q * V.freq);
      else if (pinnate) vn = wave(u * V.freq - (q < 0 ? -q : q) * 0.85);
      // Am Ansatz und an der Spitze läuft die Dicke aus.
      const fade = Math.min(1, u * 7) * Math.min(1, (1 - u) * 3.5);
      const hh = base + thick * fade * (0.52 * dome + 0.32 * rib + 0.16 * vn);

      // Eigenschattierung aus derselben Form. Die Normal-Map trägt die
      // Beleuchtung, aber ein Rest gebackener Zeichnung hält das Blatt auch
      // dann lesbar, wenn es flach im Licht steht.
      const shade = 0.80 + 0.22 * dome + 0.12 * rib - 0.10 * vn;

      const i = py * ATLAS + px;
      const inv = 1 - cov;
      buf.a[i] = buf.a[i] * inv + cov;
      buf.h[i] = buf.h[i] * inv + hh * cov;
      buf.r[i] = buf.r[i] * inv + tr * shade * cov;
      buf.g[i] = buf.g[i] * inv + tg * shade * cov;
      buf.b[i] = buf.b[i] * inv + tb * shade * cov;
    }
  }
}

// Länge so kürzen, dass die Spitze innerhalb des Zellkreises bleibt.
//
// **Das ist die eigentliche Korrektur am alten Blattwerk.** Nicht die Zahl der
// Blätter war das Problem, sondern dass einzelne bis an den Kachelrand liefen
// und dort abgeschnitten wurden. Eine gerade Alphakante über die volle Breite
// der Ebene liest das Auge als Kante der Ebene – und ab da ist das Billboard
// ein Billboard. Innerhalb eines Kreises mit Rand kann das nicht passieren.
function fitLength(bx, by, ang, len, cx, cy, rmax) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let k = 0; k < 3; k++) {
    const tx = bx - len * sa;
    const ty = by + len * ca;
    const dist = Math.hypot(tx - cx, ty - cy);
    if (dist <= rmax) break;
    len *= rmax / dist;
  }
  return len;
}

// Eine Zelle bestücken. Gibt eine Blattliste zurück (noch unsortiert).
//
// Gemeinsame Regel für alle vier Arten: Die Ansatzpunkte werden mit
// `sqrt(rnd)` gezogen – das ergibt eine **flächengleiche** Verteilung in der
// Kreisscheibe, also gleichmäßige Dichte – und die Blattlänge nimmt nach außen
// ab. Zusammen mit der Kreisbegrenzung ergibt das den Verlauf, den ein Büschel
// hat: innen geschlossen, außen einzelne Blätter gegen den Himmel.
function cellBlades(kind, cx, cy, R, r) {
  const out = [];
  const pal = PALETTE[kind];
  const pick = () => pal.vary[Math.floor(r() * pal.vary.length)];
  const rmax = R - 5; // Sicherheitsrand: nichts berührt die Zellgrenze

  // Ein Blatt = ein oder mehrere Blattblätter, die sich eine Tiefe teilen.
  const leaf = (blades) => {
    const depth = r();
    for (let i = 0; i < blades.length; i++) out.push({ ...blades[i], depth: depth + i * 1e-4 });
  };

  if (kind === 'bamboo') {
    // Bambus wächst in Büscheln an Zweigenden, nicht einzeln.
    const bunches = 14;
    for (let k = 0; k < bunches; k++) {
      const rr = R * 0.50 * Math.sqrt(r());
      const aa = r() * TAU;
      const bx = cx + Math.cos(aa) * rr;
      const by = cy + Math.sin(aa) * rr;
      const dir = r() * TAU;
      const n = 17 + Math.floor(r() * 8);
      for (let i = 0; i < n; i++) {
        const ang = dir + (r() - 0.5) * 2.7;
        let len = R * (0.36 + r() * 0.30) * (1 - 0.28 * (rr / R));
        len = fitLength(bx, by, ang, len, cx, cy, rmax);
        leaf([
          {
            x: bx + (r() - 0.5) * R * 0.10,
            y: by + (r() - 0.5) * R * 0.10,
            ang,
            len,
            curve: (r() - 0.5) * 0.55,
            shape: 'bamboo',
            vein: 'bamboo',
            thick: 0.42 + r() * 0.16,
            base: r() * 0.20,
            tint: pick(),
          },
        ]);
      }
    }
  } else if (kind === 'maple') {
    // Handförmig gelappt: fünf Lappen aus einem Punkt, der mittlere am
    // längsten, dazu der Stiel. Ohne den Stiel liest man einen Stern.
    const LOBE_A = [-1.18, -0.60, 0, 0.60, 1.18];
    const LOBE_L = [0.58, 0.86, 1.0, 0.86, 0.58];
    for (let k = 0; k < 32; k++) {
      const rr = R * 0.58 * Math.sqrt(r());
      const aa = r() * TAU;
      const bx = cx + Math.cos(aa) * rr;
      const by = cy + Math.sin(aa) * rr;
      const dir = r() * TAU;
      const size = R * (0.30 + r() * 0.15) * (1 - 0.30 * (rr / R));
      const tint = pick();
      const thick = 0.40 + r() * 0.14;
      const base = r() * 0.20;
      const blades = [];
      for (let l = 0; l < 5; l++) {
        const ang = dir + LOBE_A[l] + (r() - 0.5) * 0.14;
        let len = size * LOBE_L[l] * (0.9 + r() * 0.2);
        len = fitLength(bx, by, ang, len, cx, cy, rmax);
        blades.push({
          x: bx,
          y: by,
          ang,
          len,
          curve: (r() - 0.5) * 0.22,
          shape: 'maple',
          vein: 'maple',
          thick,
          base,
          tint,
        });
      }
      blades.push({
        x: bx,
        y: by,
        ang: dir + Math.PI,
        len: fitLength(bx, by, dir + Math.PI, size * 0.42, cx, cy, rmax),
        curve: 0,
        shape: 'stem',
        vein: 'stem',
        thick: 0.30,
        base,
        tint: [tint[0] * 0.8, tint[1] * 0.85, tint[2] * 0.7],
      });
      leaf(blades);
    }
  } else if (kind === 'azalea') {
    // Klein, oval, sehr viele. Ein Karikomi-Polster ist eine geschlossene
    // Fläche aus Hunderten Blättchen – die Dichte *ist* die Art.
    for (let k = 0; k < 280; k++) {
      const rr = R * 0.64 * Math.sqrt(r());
      const aa = r() * TAU;
      const bx = cx + Math.cos(aa) * rr;
      const by = cy + Math.sin(aa) * rr;
      const ang = r() * TAU;
      let len = R * (0.13 + r() * 0.09) * (1 - 0.22 * (rr / R));
      len = fitLength(bx, by, ang, len, cx, cy, rmax);
      leaf([
        {
          x: bx,
          y: by,
          ang,
          len,
          curve: (r() - 0.5) * 0.3,
          shape: 'azalea',
          vein: 'azalea',
          thick: 0.44 + r() * 0.16,
          base: r() * 0.22,
          tint: pick(),
        },
      ]);
    }
  } else if (kind === 'sakura') {
    // **Blüten in Dolden, nicht einzeln verteilt.** Eine Kirsche blüht in
    // Büscheln von drei bis fünf Blüten an einem kurzen Stiel; gleichmäßig über
    // die Zelle gestreute Einzelblüten sehen aus wie Konfetti. Jede Blüte sind
    // fünf Kronblätter aus einem Punkt, dazu ein kurzer Stiel nach hinten.
    const DOLDEN = 24;
    for (let k = 0; k < DOLDEN; k++) {
      const rr = R * 0.6 * Math.sqrt(r());
      const aa = r() * TAU;
      const dx = cx + Math.cos(aa) * rr;
      const dy = cy + Math.sin(aa) * rr;
      const bluetenJeDolde = 3 + Math.floor(r() * 3);
      for (let m = 0; m < bluetenJeDolde; m++) {
        const off = R * 0.11 * Math.sqrt(r());
        const oa = r() * TAU;
        const bx = dx + Math.cos(oa) * off;
        const by = dy + Math.sin(oa) * off;
        const dir = r() * TAU;
        // Größe nachgemessen, nicht geschätzt: Mit 0,11…0,16 deckte die
        // Sakura-Zelle 23,7 % gegen 33,2 % beim Ahorn – die Karte war zu leer,
        // und übrig blieb der rosa Hüllkörper. Siehe atlas.mjs.
        const size = R * (0.145 + 0.06 * r()) * (1 - 0.25 * (rr / R));
        const tint = pick();
        const thick = 0.34 + r() * 0.12;
        const base = r() * 0.16;
        const blades = [];
        // Fünf Kronblätter, gleichmäßig im Kreis – bei einer Blüte ist die
        // Symmetrie das Motiv, anders als beim Ahornblatt, wo die Lappen
        // ungleich lang sind.
        for (let l = 0; l < 5; l++) {
          const ang = dir + (l / 5) * TAU + (r() - 0.5) * 0.1;
          blades.push({
            x: bx,
            y: by,
            ang,
            len: fitLength(bx, by, ang, size * (0.92 + r() * 0.16), cx, cy, rmax),
            curve: (r() - 0.5) * 0.16,
            shape: 'sakura',
            vein: 'sakura',
            thick,
            base,
            tint,
          });
        }
        leaf(blades);
      }
      // Ein kurzer Zweig unter jeder Dolde. Ohne ihn schweben die Büschel.
      const zweigWinkel = r() * TAU;
      leaf([
        {
          x: dx,
          y: dy,
          ang: zweigWinkel,
          len: fitLength(dx, dy, zweigWinkel, R * 0.16, cx, cy, rmax),
          curve: (r() - 0.5) * 0.2,
          shape: 'stem',
          vein: 'stem',
          thick: 0.3,
          base: 0.1,
          tint: [96, 66, 62],
        },
      ]);
    }
  } else if (kind === 'nadel') {
    // **Nadelzweige, nicht Einzelnadeln.** Eine Konifere setzt ihre Nadeln
    // dicht an kurzen Trieben; einzeln über die Zelle gestreut ergäben sie
    // Fussel. Die Bauart ist die des Farns – ein Trieb mit Anhängseln zu beiden
    // Seiten –, aber die Nadeln stehen **spitz nach vorn** statt quer, und es
    // sind viel mehr davon. Der Winkel ist das, woran man Konifere von Farn
    // unterscheidet, auch wenn man beides nicht einzeln auflöst.
    // Gemessen: Mit 20 Trieben deckte die Zelle 22,5 % gegen 33,2 % beim Ahorn –
    // eine Koniferenkrone daraus wäre drahtig statt dicht. Siehe atlas.mjs.
    const TRIEBE = 32;
    for (let k = 0; k < TRIEBE; k++) {
      const rr = R * 0.5 * Math.sqrt(r());
      const aa = r() * TAU;
      const bx = cx + Math.cos(aa) * rr;
      const by = cy + Math.sin(aa) * rr;
      const dir = r() * TAU;
      let tlen = R * (0.4 + r() * 0.26);
      tlen = fitLength(bx, by, dir, tlen, cx, cy, rmax);
      const curve = (r() - 0.5) * 0.3;
      const tint = pick();
      const blades = [
        {
          x: bx,
          y: by,
          ang: dir,
          len: tlen,
          curve,
          shape: 'stem',
          vein: 'stem',
          thick: 0.3,
          base: r() * 0.1,
          tint: [tint[0] * 0.7, tint[1] * 0.68, tint[2] * 0.6],
        },
      ];
      const N = 22;
      const ca = Math.cos(dir);
      const sa = Math.sin(dir);
      for (let j = 1; j <= N; j++) {
        const t = j / (N + 1);
        const lxc = curve * tlen * t * t;
        const lyc = t * tlen;
        const px = bx + lxc * ca - lyc * sa;
        const py = by + lxc * sa + lyc * ca;
        // Spitzer Anstellwinkel, zur Triebspitze hin noch spitzer: Die Nadeln
        // legen sich nach vorn an, statt rechtwinklig abzustehen.
        const offen = 0.72 - t * 0.3;
        const nlen = tlen * 0.34 * (1 - 0.35 * t) * Math.min(1, t * 6);
        for (const seite of [-1, 1]) {
          const ang = dir + seite * offen;
          blades.push({
            x: px,
            y: py,
            ang,
            len: fitLength(px, py, ang, nlen * (0.85 + r() * 0.3), cx, cy, rmax),
            curve: seite * 0.12,
            shape: 'nadel',
            vein: 'nadel',
            thick: 0.5 + r() * 0.14,
            base: r() * 0.1,
            tint: pick(),
          });
        }
      }
      leaf(blades);
    }
  } else {
    // Farn: Rhachis mit Fiederblättchen zu beiden Seiten, nach außen kürzer.
    for (let k = 0; k < 14; k++) {
      const rr = R * 0.42 * Math.sqrt(r());
      const aa = r() * TAU;
      const bx = cx + Math.cos(aa) * rr;
      const by = cy + Math.sin(aa) * rr;
      const dir = r() * TAU;
      let flen = R * (0.52 + r() * 0.26);
      flen = fitLength(bx, by, dir, flen, cx, cy, rmax);
      const curve = (r() - 0.5) * 0.5;
      const tint = pick();
      const blades = [
        {
          x: bx,
          y: by,
          ang: dir,
          len: flen,
          curve,
          shape: 'stem',
          vein: 'stem',
          thick: 0.34,
          base: r() * 0.14,
          tint: [tint[0] * 0.85, tint[1] * 0.9, tint[2] * 0.75],
        },
      ];
      const P = 16;
      const ca = Math.cos(dir);
      const sa = Math.sin(dir);
      for (let j = 1; j <= P; j++) {
        const t = j / (P + 1);
        // Punkt auf der gekrümmten Rhachis (dieselbe Formel wie im Raster).
        const lxc = curve * flen * t * t;
        const lyc = t * flen;
        const px = bx + lxc * ca - lyc * sa;
        const py = by + lxc * sa + lyc * ca;
        // Anstellwinkel wird zur Spitze hin spitzer – das ist die Form, an der
        // man einen Wedel von einer Feder unterscheidet.
        const open = 1.15 - t * 0.55;
        const plen = flen * 0.38 * (1 - 0.62 * Math.pow(t, 1.3)) * Math.min(1, t * 5);
        for (const side of [-1, 1]) {
          const ang = dir + side * open;
          blades.push({
            x: px,
            y: py,
            ang,
            len: fitLength(px, py, ang, plen * (0.85 + r() * 0.3), cx, cy, rmax),
            curve: side * 0.35,
            shape: 'fern',
            vein: 'fern',
            thick: 0.36 + r() * 0.12,
            base: 0.10 + r() * 0.12,
            tint: pick(),
          });
        }
      }
      leaf(blades);
    }
  }
  return out;
}

const _atlases = new Map();

/**
 * Prozeduraler Blatt-Atlas.
 *
 * @param {'bamboo'|'maple'|'azalea'|'fern'} kind
 * @returns {{ map: THREE.Texture, normalMap: THREE.Texture,
 *             roughnessMap: THREE.Texture, cells: number, kind: string }}
 */
// --- Pflanzenkörper statt Papierschnipsel ------------------------------------
//
// Der erste Garten bestand aus gekreuzten Flächen mit einer Blatt-Alphakarte.
// Für den Bambus **hinter** einem Papierfenster ist das richtig – dort zählt
// nur die Silhouette. Für einen Garten, in den man aus vier Metern durch eine
// offene Tür sieht, ist es falsch, und zwar sichtbar: Man sah die rechteckigen
// Kanten der Ebenen, die harte Alphakante und dass sich beim Kopfdrehen nichts
// ändert. Der Nutzer hat es „Kraut und Rüben" genannt und hatte recht.
//
// Ein Formschnitt-Polster (Karikomi) ist ohnehin **keine** Wolke aus Blättern,
// sondern ein geschlossener Körper – das ist der Kern eines japanischen
// Gartens: geschnittene, ruhige Formen. Genau das lässt sich als Geometrie
// billiger und besser bauen als als Alphakarte: keine Überzeichnung, keine
// Alphakante, korrekt beleuchtet, aus jeder Richtung dieselbe Masse.
export function blobGeometry(detail, seed, squash) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const r = rng(seed);
  // Rauschen pro Vertex, aber **einmal je Richtung** – sonst reißen benachbarte
  // Dreiecke auf, weil Icosahedron-Geometrie doppelte Vertices an den Nähten
  // hat. Der Hash über die gerundete Richtung liefert beiden denselben Wert.
  const cache = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)}|${v.y.toFixed(3)}|${v.z.toFixed(3)}`;
    let n = cache.get(key);
    if (n === undefined) {
      // Wenig Rauschen, feine Unterteilung. Der erste Anlauf hatte 0,82–1,12
      // bei Detailstufe 1 – aus vier Metern waren das erkennbar facettierte
      // Klumpen. Ein geschnittenes Polster ist aber gerade **nicht** knubbelig;
      // es ist eine ruhige Kuppel mit leichter Unregelmäßigkeit.
      n = 0.93 + r() * 0.13;
      cache.set(key, n);
    }
    v.multiplyScalar(n);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.scale(1, squash, 1);
  // **Erst zusammenführen, dann Normalen rechnen.**
  //
  // `IcosahedronGeometry` ist **nicht indiziert** – jedes Dreieck hat eigene
  // Vertices. `computeVertexNormals()` liefert darauf zwangsläufig
  // Flächennormalen, also Flat-Shading, und genau deshalb sahen Ahornkrone und
  // Azaleenpolster wie geschliffene Edelsteine aus. Drei Runden Farbkorrektur
  // haben daran nichts geändert, weil es keine Farbfrage war.
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

export function leafAtlas(kind = 'maple') {
  if (!PALETTE[kind]) kind = 'maple';
  const cached = _atlases.get(kind);
  if (cached) return cached;

  const N = ATLAS * ATLAS;
  const pal = PALETTE[kind];
  const buf = {
    a: new Float32Array(N),
    h: new Float32Array(N),
    r: new Float32Array(N),
    g: new Float32Array(N),
    b: new Float32Array(N),
  };
  // Farbpuffer auf die Grundfarbe vorbelegen statt auf Schwarz. Halbdurch-
  // sichtige Randpixel mischen sonst gegen Schwarz und legen einen dunklen
  // Saum um jedes Blatt – bei `alphaTest` sieht man den als schmutzige Kante.
  buf.r.fill(pal.base[0]);
  buf.g.fill(pal.base[1]);
  buf.b.fill(pal.base[2]);

  const r = rng(0x1eaf ^ (kind.charCodeAt(0) * 7919) ^ (kind.length * 104729));
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      const blades = cellBlades(
        kind,
        cx * CELL + CELL / 2,
        cy * CELL + CELL / 2,
        CELL / 2,
        r
      );
      blades.sort((p, q) => p.depth - q.depth);
      for (const bl of blades) rasterBlade(buf, bl);
    }
  }

  // --- Farbkarte -------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(ATLAS, ATLAS);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    img.data[o] = Math.max(0, Math.min(255, buf.r[i]));
    img.data[o + 1] = Math.max(0, Math.min(255, buf.g[i]));
    img.data[o + 2] = Math.max(0, Math.min(255, buf.b[i]));
    // Alpha leicht gestaucht: Der 1-px-Antialiasrand landet damit über dem
    // `alphaTest`, statt als Fransensaum stehen zu bleiben. Ein Blattrand ist
    // scharf; die weiche Kante ist ein Rasterartefakt, kein Merkmal.
    img.data[o + 3] = Math.max(0, Math.min(255, Math.round(clamp01(buf.a[i] * 1.35) * 255)));
  }
  ctx.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 4;

  // --- Normal-Map aus dem Höhenfeld -----------------------------------------
  //
  // `heightToMaps` aus materials.js, nicht neu geschrieben: Es macht genau das
  // Richtige (Sobel über ein gekacheltes Höhenfeld) und ist die Stelle, an der
  // acht andere Materialien dieses Hauses ihr Relief herbekommen.
  //
  // `strength` ist mit 5,5 deutlich höher als bei Holz oder Putz, und das ist
  // Absicht: Dort steht die Karte für Struktur *auf* einer Fläche, hier für die
  // Wölbung des Objekts selbst. Ein Blatt ohne kräftige Normale bleibt ein
  // Rechteck mit einem Bild darauf – man erkennt es sofort daran, dass sich
  // beim Umlaufen nichts am Glanz ändert.
  const { normalMap, roughnessMap } = heightToMaps({
    size: ATLAS,
    strength: 5.5,
    height: (x, y) => buf.h[y * ATLAS + x],
    // Blattoberseiten sind wachsig, die Rinnen dazwischen matt und staubig.
    roughness: (h) => 226 - h * 92,
    anisotropy: 4,
  });
  for (const t of [normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }

  const atlas = { map, normalMap, roughnessMap, cells: CELLS, kind, size: ATLAS };
  _atlases.set(kind, atlas);
  return atlas;
}

// =============================================================================
//  2. Material: Transluzenz + Wind
// =============================================================================

// Alle erzeugten Uniform-Sätze. `updateFoliage(t)` versorgt sie in einem Zug –
// der Aufrufer soll sich nicht merken müssen, wie viele Materialien er gebaut
// hat, und ein vergessenes Material ist sonst ein Blatt, das als einziges still
// steht.
const _uniformSets = new Set();

/** Setzt `uTime` auf allen Laubmaterialien (Bild- **und** Schattenpass). */
export function updateFoliage(time) {
  for (const u of _uniformSets) u.uTime.value = time;
}

// --- Wind im Vertex-Shader ---------------------------------------------------
//
// Drei Dinge, ohne die der Wind nicht funktioniert:
//
// **Weltposition als Phase.** Ohne sie schwingt jedes Blatt der Szene im
// Gleichtakt – das liest sich als pulsierende Kulisse, nicht als Wind. Die
// Phase kommt aus der Weltposition, damit eine Böe sichtbar über den Garten
// *läuft*.
//
// **Steifigkeit je Vertex.** Ein Blatt sitzt am Stiel fest. Ohne
// Steifigkeitsattribut verschiebt sich die ganze Karte starr, und man sieht
// Rechtecke rutschen statt Blätter wippen. Das Attribut geht quadratisch ein:
// Der Übergang von fest zu beweglich verteilt sich damit über das Blatt statt
// linear vom Ansatz weg.
//
// **Zwei Frequenzen.** Eine langsame Böe trägt die Bewegung, ein schnelles
// Zittern trägt die Lebendigkeit. Nur die langsame wirkt wie Zeitlupe, nur die
// schnelle wie Rauschen.
//
// `aStiff` fehlt auf Geometrien, die es nicht mitbringen – WebGL liefert dann
// konstant 0, das Material bleibt also für fremde Geometrie einfach windstill
// statt zu brechen.
const WIND_PARS = /* glsl */ `
uniform float uTime;
uniform float uWind;
attribute float aStiff;
`;

const WIND_BODY = /* glsl */ `
{
  vec4 fWorld = modelMatrix *
  #ifdef USE_INSTANCING
    instanceMatrix *
  #endif
    vec4( transformed, 1.0 );
  float fPhase = fWorld.x * 0.63 + fWorld.z * 0.47 + fWorld.y * 0.19;
  float fSlow = sin( uTime * 0.62 + fPhase ) * 0.62
              + sin( uTime * 0.27 + fPhase * 0.41 + 1.7 ) * 0.38;
  float fFast = sin( uTime * 4.3 + fPhase * 2.7 ) * 0.55
              + sin( uTime * 7.1 + fPhase * 4.3 + 0.9 ) * 0.45;
  float fS = aStiff * aStiff;
  // Hauptrichtung der Böe, dazu eine Querkomponente und ein Heben – ein Blatt,
  // das nur hin und her fährt, sieht aus wie ein Scheibenwischer.
  transformed += vec3( 0.83, -0.10, 0.55 ) * ( fSlow * uWind * fS );
  transformed += vec3( -0.55, 0.0, 0.83 ) * ( fFast * uWind * 0.42 * fS );
  transformed.y += fFast * uWind * 0.30 * fS;
}
`;

function patchWind(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader =
    WIND_PARS +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n' + WIND_BODY
    );
}

// --- Transluzenz -------------------------------------------------------------
//
// Der auffälligste Einzelgewinn, und der Grund, warum das hier ein eigener
// Shader-Eingriff ist statt einer Materialeinstellung: `MeshStandardMaterial`
// kennt keinen Rückstreuterm. (`MeshPhysicalMaterial.transmission` täte es
// halbwegs, kostet aber einen zusätzlichen Renderdurchgang je Fläche und ist
// auf der Quest nicht bezahlbar – dieselbe Rechnung wie beim Washi.)
//
// **Einfügeort `<lights_fragment_end>`.** Dort stehen `geometryNormal`,
// `geometryViewDir` und `reflectedLight` bereit, und die Summe zu
// `outgoingLight` ist noch nicht gezogen. Der Kommentar bei
// materials.js:451 hält den teuer gelernten Fall fest, in dem ein Eingriff
// hinter dieser Summe sauber kompilierte und exakt nichts tat.
//
// **Warum `geometryNormal` und nicht die Normal-Map-Normale.** Beide wären
// vertretbar; die geometrische ist die ruhigere. Bei `DoubleSide` dreht three
// die Normale ohnehin zum Betrachter, `dot(-L, N) > 0` heißt also für beide
// Seiten dasselbe: Das Licht steht hinter dem Blatt.
//
// **Kein Schattenterm.** Naheliegend wäre, das Leuchten zu verschatten. Es
// wäre falsch: Eine Karte ohne Dicke steht in der eigenen Schattenkarte, und
// die im Gegenlicht liegende Seite ist genau die, die hinter sich selbst
// liegt. Der Schattentest würde also präzise dort dämpfen, wo der Effekt
// entsteht – derselbe Selbstverschattungsfall, der beim Washi drei Anläufe
// gekostet hat. Stattdessen begrenzt der Blickterm die Reichweite: Von der
// Sonne weg gedreht bleibt nur ein Sockel stehen.
const TRANS_BODY = /* glsl */ `
#if defined( RE_Direct ) && ( NUM_DIR_LIGHTS > 0 )
  {
    IncidentLight fLight;
    getDirectionalLightInfo( directionalLights[ 0 ], fLight );
    // fLight.direction zeigt zur Lichtquelle. Gegenlicht heißt: Die Normale
    // zeigt vom Licht weg.
    float fBack = max( 0.0, dot( -fLight.direction, geometryNormal ) );
    float fWrap = pow( fBack, uTransPower );
    // Blickabhängigkeit: Ein Blatt leuchtet am stärksten, wenn man in die
    // Sonne schaut. geometryViewDir zeigt zur Kamera.
    float fView = max( 0.0, dot( geometryViewDir, fLight.direction ) );
    float fGlow = fWrap * mix( 0.40, 1.0, fView * fView );
    vec3 fTint = mix( diffuseColor.rgb, uTransColor, 0.5 );
    reflectedLight.directDiffuse += fTint * fLight.color * ( fGlow * uTranslucency * RECIPROCAL_PI );
  }
#endif
`;

/**
 * Laubmaterial: Blattatlas + Transluzenz + Wind, inklusive Schattenpass.
 *
 * @param {object}  o
 * @param {object}  o.atlas          Rückgabe von `leafAtlas()`
 * @param {number}  o.color          Grundton (Hex, wird mit dem Atlas multipliziert)
 * @param {number}  o.translucency   Stärke des Gegenlichtleuchtens (0 = aus)
 * @param {number}  o.windStrength   Auslenkung in Objekteinheiten an der Blattspitze
 * @returns {THREE.MeshStandardMaterial}
 */
export function foliageMaterial({
  atlas,
  color = 0xffffff,
  translucency = 0.9,
  windStrength = 0.06,
  transColor = 0xd9e79c,
  transPower = 2.4,
  alphaTest = 0.42,
  roughness = 0.78,
  side = THREE.DoubleSide,
  normalScale = 1.15,
} = {}) {
  const sheet = atlas ?? leafAtlas('maple');

  // **Ein** Uniform-Satz für Bild- und Schattenmaterial. Zwei getrennte Sätze
  // wären der stille Weg, wie Schatten und Blatt auseinanderlaufen.
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: windStrength },
    uTranslucency: { value: translucency },
    uTransPower: { value: transPower },
    uTransColor: { value: new THREE.Color(transColor) },
  };

  const material = new THREE.MeshStandardMaterial({
    color,
    map: sheet.map,
    normalMap: sheet.normalMap,
    roughnessMap: sheet.roughnessMap ?? null,
    roughness,
    metalness: 0,
    // `alphaTest` statt `transparent`: Damit bleibt das Laub im Tiefenpuffer und
    // wirft Schatten. Mit `transparent` täte es weder das eine noch das andere
    // zuverlässig – und der Schatten ist die halbe Wirkung.
    alphaTest,
    side,
    normalScale: new THREE.Vector2(normalScale, normalScale),
  });

  material.onBeforeCompile = (shader) => {
    patchWind(shader, uniforms);
    shader.fragmentShader =
      `
uniform float uTranslucency;
uniform float uTransPower;
uniform vec3 uTransColor;
` +
      shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n' + TRANS_BODY
      );
  };
  // Ohne eigenen Schlüssel teilt three das kompilierte Programm mit jedem
  // anderen Standardmaterial gleicher Konfiguration – das Laub bekäme dann
  // dessen Shader oder umgekehrt. Derselbe Fall wie beim Washi.
  material.customProgramCacheKey = () => 'dojo-foliage-v1';

  // --- Der Wind muss in den Schattenpass ------------------------------------
  //
  // Sonst steht der Schattenriss still, während das Blatt schwingt. Das ist
  // kein Detail: Der Schatten des Hains auf dem Papier ist das Bild, an dem man
  // dieses Dojo erkennt, und ein bewegtes Blatt mit stehendem Schatten liest
  // sich sofort als Fehler, auch wenn man ihn nicht benennen kann.
  //
  // Der Schattenpass benutzt **nicht** dieses Material, sondern ein eigenes
  // Tiefenmaterial. Es braucht denselben Vertexeingriff, dieselben Uniforms und
  // dieselbe Alphakarte mit demselben `alphaTest` – Letzteres, damit der
  // Schatten die Blattform hat und nicht die des Rechtecks.
  //
  // Kein eigenes `depthPacking`: Seit three die Schattenkarte als echte
  // Tiefentextur führt (WebGLShadowMap legt eine `DepthTexture` an), ist die
  // Farbausgabe des Tiefenmaterials bedeutungslos – wirksam sind nur die
  // Vertexposition und der `discard` aus dem `alphaTest`. Ein abweichender
  // Packmodus wäre eine stille Abweichung von threes eigenem Tiefenmaterial.
  const depthMaterial = new THREE.MeshDepthMaterial({
    map: sheet.map,
    alphaTest,
    side,
  });
  depthMaterial.onBeforeCompile = (shader) => patchWind(shader, uniforms);
  depthMaterial.customProgramCacheKey = () => 'dojo-foliage-depth-v1';

  // `customDepthMaterial` liest three von **Object3D**, nicht vom Material
  // (WebGLShadowMap.getDepthMaterial). Es hängt hier trotzdem am Material,
  // damit es mit ihm zusammenbleibt; `applyFoliageMaterial()` setzt beides an
  // die richtige Stelle. Wer das Material von Hand zuweist, muss
  // `mesh.customDepthMaterial = material.customDepthMaterial` mitschreiben.
  material.customDepthMaterial = depthMaterial;

  material.userData.needsEnv = true;
  material.userData.foliage = true;
  material.userData.uniforms = uniforms;
  material.userData.setTime = (t) => {
    uniforms.uTime.value = t;
  };
  material.userData.setWind = (w) => {
    uniforms.uWind.value = w;
  };

  _uniformSets.add(uniforms);
  return material;
}

/**
 * Material an ein Mesh hängen – inklusive Tiefenmaterial für den Schattenpass.
 * Der einzige Weg, bei dem der Schatten mitschwingt.
 */
export function applyFoliageMaterial(mesh, material) {
  mesh.material = material;
  if (material.customDepthMaterial) mesh.customDepthMaterial = material.customDepthMaterial;
  return mesh;
}

// =============================================================================
//  3. Kartenwolke
// =============================================================================

const _up = new THREE.Vector3(0, 1, 0);

/**
 * Geometrie aus vielen kleinen Blattkarten auf einer Kugelschale.
 *
 * Gedacht als **Hülle über einem dunklen Körper**: Der Blob (exterior.js:
 * `blobGeometry`) bleibt Masse und Verdecker, die Karten machen Kontur und
 * Lichtspiel. Nur Karten wären löchrig und würden von hinten durchscheinen,
 * nur ein Blob bleibt eine Kugel.
 *
 * @param {object} o
 * @param {number} o.count   Zahl der Karten
 * @param {number} o.radius  Radius der Schale (Objekteinheiten)
 * @param {number} o.seed    Startwert
 * @param {string} o.kind    Art – bestimmt Kartengröße und Neigungsstreuung
 * @returns {THREE.BufferGeometry} position, normal, uv, aStiff
 */
export function cardCluster({
  count = 96,
  radius = 0.5,
  seed = 1,
  kind = 'maple',
  hemisphere = false,
  squash = 0.82,
  cardScale = 1,
  cross = false,
  cells = CELLS,
} = {}) {
  const r = rng(seed);

  // Kartengröße relativ zum Schalenradius. Zu klein = die Karten schließen
  // nicht und man sieht durch die Krone auf den Blob; zu groß = man erkennt
  // einzelne Rechtecke. Azalee liegt tiefer, weil ihr Atlas selbst schon sehr
  // viele kleine Blätter zeigt.
  const SIZE =
    { bamboo: 0.95, maple: 0.86, azalea: 0.66, fern: 0.95, sakura: 0.72, nadel: 0.98 }[kind] ??
    0.85;
  // Neigung gegen die Schalennormale. Ohne sie stehen alle Karten tangential
  // zur Kugel und die Silhouette wird an ihrem Rand papierdünn.
  // Sakura steht bewusst hoch: Blütenbüschel sitzen an kurzen Trieben und
  // stehen von der Krone ab, statt ihr anzuliegen. Mit 0,6 lagen die Karten
  // tangential auf der Schale und ließen den Hüllkörper durchscheinen.
  const TILT =
    { bamboo: 1.05, maple: 0.85, azalea: 0.55, fern: 1.0, sakura: 0.95, nadel: 1.15 }[kind] ??
    0.8;

  const quads = count * (cross ? 2 : 1);
  const pos = new Float32Array(quads * 4 * 3);
  const nrm = new Float32Array(quads * 4 * 3);
  const uvs = new Float32Array(quads * 4 * 2);
  const stf = new Float32Array(quads * 4);
  const idx = quads * 4 > 65535 ? new Uint32Array(quads * 6) : new Uint16Array(quads * 6);

  const step = 1 / cells;
  // Halbes Texel Einzug: Ohne ihn zieht die Mip-Stufe Blätter der Nachbarzelle
  // in die Karte, und man bekommt Geisterblätter am Kartenrand – genau die
  // Sorte Fehler, die man erst in Bewegung und nur aus der Ferne sieht.
  const inset = 1.5 / ATLAS;

  const p = new THREE.Vector3();
  const shellN = new THREE.Vector3();
  const face = new THREE.Vector3();
  const grow = new THREE.Vector3();
  const right = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const nOut = new THREE.Vector3();

  let vi = 0; // Vertexzähler
  let ii = 0; // Indexzähler

  for (let c = 0; c < count; c++) {
    // Fibonacci-Verteilung mit Streuung: gleichmäßiger als reiner Zufall
    // (keine Klumpen, keine kahlen Stellen), ohne dass ein Muster sichtbar
    // wird.
    const k = c + 0.5;
    let cosT = 1 - (2 * k) / count;
    if (hemisphere) cosT = 1 - k / count; // obere Halbkugel
    cosT = Math.max(-1, Math.min(1, cosT + (r() - 0.5) * 0.18));
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = k * 2.39996323 + (r() - 0.5) * 0.6;

    // Schale, nicht Vollkugel: Blätter sitzen außen. `cbrt` sorgt dafür, dass
    // die wenigen inneren Karten gleichmäßig im Volumen liegen statt sich in
    // der Mitte zu häufen.
    const shell = 0.68 + 0.32 * Math.cbrt(r());
    const rr = radius * shell;
    p.set(Math.cos(phi) * sinT, cosT, Math.sin(phi) * sinT).multiplyScalar(rr);
    p.y *= squash;

    shellN.copy(p).normalize();
    if (shellN.lengthSq() < 0.5) shellN.set(0, 1, 0);

    // Kartenebene: Schalennormale, zufällig gekippt.
    face.copy(shellN);
    tmp.set(r() - 0.5, r() - 0.5, r() - 0.5);
    if (tmp.lengthSq() < 1e-6) tmp.set(1, 0, 0);
    tmp.cross(face).normalize();
    face.applyAxisAngle(tmp, (r() - 0.2) * TILT).normalize();

    // Wuchsrichtung in der Kartenebene: nach außen und nach unten – Laub
    // hängt. Der Anteil nach außen hält die Karten an der Schale, der nach
    // unten gibt der Krone Gewicht.
    grow
      .copy(shellN)
      .multiplyScalar(0.5)
      .addScaledVector(_up, -0.75)
      .addScaledVector(tmp, (r() - 0.5) * 0.9);
    grow.addScaledVector(face, -grow.dot(face)); // in die Ebene projizieren
    if (grow.lengthSq() < 1e-6) grow.copy(tmp);
    grow.normalize();
    right.crossVectors(grow, face).normalize();

    // Beleuchtungsnormale zur Schalennormale zurückgezogen. **Der billigste
    // große Gewinn an dieser Geometrie:** Beleuchtet man Karten mit ihrer
    // eigenen Flächennormale, sieht eine Krone aus wie ein Haufen Papier, weil
    // benachbarte Karten unabhängig hell und dunkel werden. Zieht man die
    // Normalen zur Kugel, liest sich dieselbe Geometrie als *Volumen* mit
    // Lichtseite und Schattenseite – der Trick, an dem man Kronen aus
    // aktuellen Spielen erkennt.
    nOut.copy(face).lerp(shellN, 0.65).normalize();

    const s = radius * SIZE * cardScale * (0.78 + r() * 0.44);
    // Ansatz leicht nach innen, damit die Karte die Schale nicht verlässt.
    const bx = p.x - grow.x * s * 0.16;
    const by = p.y - grow.y * s * 0.16;
    const bz = p.z - grow.z * s * 0.16;

    // Atlaszelle und Spiegelung – vier Zellen mal zwei Spiegelungen sind acht
    // sichtbar verschiedene Karten aus einer Textur.
    const cellX = Math.floor(r() * cells);
    const cellY = Math.floor(r() * cells);
    const flip = r() < 0.5;
    const u0 = cellX * step + inset;
    const u1 = (cellX + 1) * step - inset;
    const v0 = cellY * step + inset;
    const v1 = (cellY + 1) * step - inset;

    // Äußere Karten schwingen weiter als innere.
    const reach = 0.45 + 0.55 * shell;

    const planes = cross ? 2 : 1;
    for (let q = 0; q < planes; q++) {
      // Die zweite Ebene steht quer – nur wenn `cross` gesetzt ist.
      const rx = q === 0 ? right : tmp.copy(face).multiplyScalar(1);
      const fn = q === 0 ? nOut : right;
      for (let vy = 0; vy < 2; vy++) {
        for (let vx = 0; vx < 2; vx++) {
          const ox = (vx - 0.5) * s;
          const oy = vy * s;
          const o3 = vi * 3;
          pos[o3] = bx + rx.x * ox + grow.x * oy;
          pos[o3 + 1] = by + rx.y * ox + grow.y * oy;
          pos[o3 + 2] = bz + rx.z * ox + grow.z * oy;
          nrm[o3] = fn.x;
          nrm[o3 + 1] = fn.y;
          nrm[o3 + 2] = fn.z;
          const o2 = vi * 2;
          const fu = flip ? 1 - vx : vx;
          uvs[o2] = u0 + fu * (u1 - u0);
          uvs[o2 + 1] = v0 + vy * (v1 - v0);
          // **Steifigkeit.** 0 am Ansatz, 1 an der Spitze, mal der Reichweite
          // der Karte. Quadriert wird erst im Shader.
          stf[vi] = vy * reach;
          vi++;
        }
      }
      const b = vi - 4;
      idx[ii++] = b;
      idx[ii++] = b + 1;
      idx[ii++] = b + 2;
      idx[ii++] = b + 1;
      idx[ii++] = b + 3;
      idx[ii++] = b + 2;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aStiff', new THREE.BufferAttribute(stf, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  // Die Hülle muss den Wind mit einschließen. Ohne Aufschlag klappt die Krone
  // am Bildrand weg, sobald eine Böe sie über die berechnete Kugel hinausträgt
  // – das klassische Frustum-Popping bei Vertex-Animation.
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius *= 1.3;
  geo.computeBoundingBox();
  geo.userData.kind = kind;
  geo.userData.cards = count;
  return geo;
}

// Alle vier Atlanten einmal anfassen, damit die Startkosten an einer bekannten
// Stelle anfallen und messbar sind – gleiche Konvention wie
// `warmUpMaterials()` in materials.js.
export function warmUpFoliage() {
  for (const k of ['bamboo', 'maple', 'azalea', 'fern']) leafAtlas(k);
}
