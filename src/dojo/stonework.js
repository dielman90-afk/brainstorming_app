import * as THREE from 'three';
import { EXTERIOR, sunDirection } from './layout.js';

// 🪨 Stein und Außenholz mit Verwitterung.
//
// **Der Befund.** Alles Steinerne im Garten lief auf `MeshLambertMaterial` mit
// *einer* Farbe: Laterne, Becken, Trittsteine, Kantensteine. Ein Kritiker hat
// das „Kunststoff gegossen" genannt und die Trittsteine „achteckige Prismen mit
// lotrechten Flanken". Beides ist wörtlich richtig – ein `CylinderGeometry(0.5,
// 0.44, 0.12, 7)` *ist* ein siebeneckiges Prisma, und ein Lambert-Material ohne
// Karte hat keine Oberfläche, nur eine Farbe.
//
// Drei Dinge fehlen, und sie sind unabhängig voneinander:
//
//   1. **Mikrorelief** – Granitkorn, Absplitterungen, Rauheitsstreuung. Ohne das
//      bricht das Licht auf einer Steinfläche exakt so wie auf lackiertem Blech.
//   2. **Makroform** – die Silhouette. Kein Stein, der seit Jahrzehnten draußen
//      steht, hat lotrechte Flanken und eine Kante mit 90°.
//   3. **Ungleichmäßigkeit** – Moos in den Fugen, auf den Nordseiten, in der
//      unteren Zone. Ein gleichmäßig grauer Zylinder ist frisch aus der Fabrik.
//
// Hier steht für jedes davon genau eine Funktion: `graniteMaterial` (1),
// `weatheredStoneGeometry` (2), `mossPatina` (3). Dazu `weatheredWoodMaterial`
// für Bambusrohr und Stämme, die dasselbe Problem als Holz haben.
//
// **Zeichenlast.** Der Garten hängt an wenigen verschmolzenen Netzen und drei
// Instanzen. Deshalb erzeugt keine dieser Funktionen ein Material pro Objekt:
// `graniteMaterial` und `weatheredWoodMaterial` sind **memoisiert** (Schlüssel
// aus Ton und Vertexfarben-Schalter), Farbunterschiede laufen wie in props.js
// über Vertexfarben. Zwei Steine mit verschiedenem Ton kosten hier null
// zusätzliche Draw-Calls.
//
// **Startzeit.** Beide Kartensätze zusammen sind ein einziger Posten, der beim
// ersten Zugriff anfällt und danach nie wieder. Keine Karte über 512 px,
// gemessen mit `scratchpad/stonework.mjs`.

// --- Übernommen aus materials.js --------------------------------------------
//
// `heightToMaps`, `pfbm`, `pvalue`, `grainAt` und die Permutationstabelle sind
// in materials.js **nicht exportiert** (dort alles `function …` ohne `export`),
// und materials.js gehört gerade jemand anderem. Der Block hier ist deshalb eine
// wortgleiche Kopie und keine zweite Lösung desselben Problems: Sobald
// materials.js `export function heightToMaps` schreibt, ersetzt ein `import`
// diesen ganzen Abschnitt ersatzlos. Die Begründungen stehen dort ausführlich;
// die zwei, die man beim Anfassen kennen muss, stehen hier verkürzt:
//
//   * **Periodisch.** Nicht-periodisches Rauschen erzeugt auf einer gekachelten
//     Fläche ein sichtbares Nahtgitter. Die Gitterindizes laufen deshalb modulo
//     einer Periode, die sich mit jeder Oktave verdoppelt.
//   * **Billig.** `Math.sin` pro Gitterpunkt kostete gemessene 814 ms für zwei
//     512er-Kacheln. Eine Permutationstabelle macht daraus zwei Feldzugriffe.
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 0x9e3779b9;
  for (let i = 255; i > 0; i--) {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x85ebca6b) + 0x165667b1) | 0;
    const j = (seed >>> 8) % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  return p;
})();

function hash2(xi, yi, seed) {
  return PERM[(PERM[(xi + seed) & 255] + yi) & 255] / 255;
}

function grainAt(x, y, seed) {
  return hash2(x & 255, y & 255, seed);
}

function pvalue(u, v, period, seed) {
  const xi = Math.floor(u);
  const yi = Math.floor(v);
  const xf = u - xi;
  const yf = v - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
}

// `u`/`v` in Gitterzellen, `period` die Zellzahl über eine Kachel. Die Spanne
// einer Koordinate über die Kachel muss ein **ganzzahliges Vielfaches** von
// `period` sein, sonst kachelt es nicht (so macht es steelMaps mit 2 × 64).
function pfbm(u, v, period, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += pvalue(u * freq, v * freq, period * freq, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function heightToMaps({ size = 256, repeat = [1, 1], strength = 2.2, height, roughness = null, anisotropy = 4 }) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) field[y * size + x] = height(x, y);
  }

  const wrap = (v) => (((v % size) + size) % size);
  const at = (x, y) => field[wrap(y) * size + wrap(x)];

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');
  const normalImage = normalCtx.createImageData(size, size);

  let roughCanvas = null;
  let roughImage = null;
  if (roughness) {
    roughCanvas = document.createElement('canvas');
    roughCanvas.width = roughCanvas.height = size;
    roughImage = roughCanvas.getContext('2d').createImageData(size, size);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const nx = -dx * strength;
      const ny = -dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      normalImage.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      normalImage.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      normalImage.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      normalImage.data[i + 3] = 255;
      if (roughImage) {
        const r = roughness(at(x, y), x, y);
        roughImage.data[i] = roughImage.data[i + 1] = roughImage.data[i + 2] = r;
        roughImage.data[i + 3] = 255;
      }
    }
  }
  normalCtx.putImageData(normalImage, 0, 0);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const maps = { normalMap };
  if (roughCanvas) {
    roughCanvas.getContext('2d').putImageData(roughImage, 0, 0);
    maps.roughnessMap = new THREE.CanvasTexture(roughCanvas);
  }
  for (const map of Object.values(maps)) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat[0], repeat[1]);
    map.anisotropy = anisotropy;
  }
  maps.field = field;
  return maps;
}

// --- Kleinkram ---------------------------------------------------------------

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

// Dreidimensionales Wertrauschen für die **Geometrie**. Hier ist Periodizität
// kein Thema – nichts wird gekachelt, jedes Objekt wird einmal abgetastet.
// Dieselbe Tabelle wie oben, damit kein zweiter Zufallsgenerator im Modul steht.
function hash3(xi, yi, zi, seed) {
  return PERM[(PERM[(PERM[(xi + seed) & 255] + yi) & 255] + zi) & 255] / 255;
}

function vnoise3(x, y, z, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const sz = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), sx);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), sx);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), sx);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

function fbm3(x, y, z, seed, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise3(x * f, y * f, z * f, seed + i * 37) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// --- Granit ------------------------------------------------------------------
//
// **Was einen Granit von einem grauen Zylinder unterscheidet**, ist nicht die
// Farbe, sondern dass das Licht auf jedem Quadratzentimeter anders bricht.
// Drei Größenordnungen übereinander:
//
//   * **Verwitterungsgrund** (8 Zellen je Kachel) – die flache Welligkeit, die
//     Regen und Frost in Jahrzehnten aus der Fläche holen. Sie trägt die großen
//     Helligkeitsunterschiede im Streiflicht.
//   * **Kristallkorn** (32 Zellen) – Feldspat und Quarz. Das ist die Textur, die
//     man aus einem Meter Abstand als „Stein" liest.
//   * **Pixelkorn** – die feinste Lage, damit die Fläche bei Nahsicht nicht in
//     glatte Rauschflächen zerfällt.
//
// Dazu **Absplitterungen**: flache Muscheln mit scharfer Kante, wie sie
// abplatzen, wenn Wasser in einer Kluft gefriert. Sie sitzen auf einem eigenen
// groben Zellgitter und kommen nur in gut einem Drittel der Zellen vor – ein
// Abplatzer alle paar Handbreit, nicht überall einer.
//
// **Warum ein eigenes Zellgitter statt Rauschen mit Schwelle**: Ein Abplatzer
// braucht eine *scharfe* Kante und einen *flachen* Grund. Aus geschwelltem fbm
// wird beides weich; aus einer Distanzfunktion mit `smoothstep(0.72, 1, d)`
// wird genau die Muschelform. Die neun abgesuchten Nachbarzellen kosten
// Feldzugriffe, keine Wurzeln – die Warnung aus environments.js (190 Zellen pro
// Pixel absuchen = halbe Sekunde Startzeit) gilt für **globale** Zellenlisten,
// nicht für ein lokales 3 × 3.
const CHIP_CELLS = 6;

// `ragged` bricht den Kreis auf: ohne das sind die Abplatzer perfekte runde
// Dellen und die Fläche sieht aus wie ein Golfball – so stand es nach dem ersten
// Durchgang im Bild. Zwei Eingriffe dagegen, beide ohne Wurzel oder Winkel:
// eine Zufallsmatrix je Zelle macht aus dem Kreis eine gedrehte Ellipse, und
// das Pixelkorn auf der Distanz macht den Rand ausgefranst statt gestanzt.
function chipAt(u, v, seed, x, y) {
  const xi = Math.floor(u);
  const yi = Math.floor(v);
  let best = 1;
  let depth = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox;
      const cy = yi + oy;
      // Der Hash kommt aus der **umgewickelten** Zelle, die Distanz aus der
      // echten – so sieht die Zelle links außerhalb der Kachel denselben
      // Abplatzer wie die Zelle rechts innen, und die Kachel schließt.
      const wx = ((cx % CHIP_CELLS) + CHIP_CELLS) % CHIP_CELLS;
      const wy = ((cy % CHIP_CELLS) + CHIP_CELLS) % CHIP_CELLS;
      if (hash2(wx, wy, seed) < 0.74) continue; // gut ein Viertel der Zellen
      const jx = cx + 0.2 + hash2(wx, wy, seed + 7) * 0.6;
      const jy = cy + 0.2 + hash2(wx, wy, seed + 13) * 0.6;
      const rad = 0.12 + hash2(wx, wy, seed + 29) * 0.16;
      let dx = u - jx;
      let dy = v - jy;
      const m0 = 0.6 + hash2(wx, wy, seed + 53) * 0.9;
      const m1 = hash2(wx, wy, seed + 59) * 0.8 - 0.4;
      const ex = dx * m0 + dy * m1;
      const ey = dy * (1.4 - m0 * 0.5) - dx * m1;
      const d = Math.hypot(ex, ey) / rad + (grainAt(x, y, 97) - 0.5) * 0.22;
      if (d < best) {
        best = d;
        depth = 0.5 + hash2(wx, wy, seed + 41) * 0.5;
      }
    }
  }
  if (best >= 1) return 0;
  return depth * (1 - smoothstep(0.68, 1, best));
}

let _granite = null;
export function graniteMaps() {
  if (_granite) return _granite;
  const size = 512;

  const height = (x, y) => {
    const u = x / size;
    const v = y / size;
    const chip = chipAt(u * CHIP_CELLS, v * CHIP_CELLS, 5);
    // Drei bzw. zwei Oktaven, nicht vier: Bei 512 px kostete jede zusätzliche
    // Oktave gemessene 25–30 ms Startzeit, und weil die Frequenzbänder hier
    // ohnehin gestaffelt sind (8 → 32 → Pixel), füllt die nächste Lage die
    // Lücke, die die weggelassene Oktave hinterlässt.
    const base =
      pfbm(u * 8, v * 8, 8, 3, 101) * 0.55 +
      pfbm(u * 32, v * 32, 32, 2, 211) * 0.3 +
      grainAt(x, y, 71) * 0.15;
    return clamp01(base - chip * 0.8);
  };

  const maps = heightToMaps({
    size,
    // Grobes Korn: Die Karte deckt rund 40 cm Stein ab. Wer sie auf einer
    // größeren Fläche braucht, skaliert die UVs (materials.js:scaleUV) statt
    // die Textur zu klonen – ein Klon verdoppelt den Texturspeicher.
    repeat: [1, 1],
    strength: 2.4,
    height,
    // **Die Rauheitskarte ist hier kein Beiwerk.** Ein Stein im Regen wird an
    // den Hochpunkten glatt gewaschen und bleibt in den Vertiefungen stumpf,
    // weil dort Staub und Flechte sitzen. Genau dieser Gegensatz – ein
    // gerichteter, aber fleckiger Schimmer auf einer sonst matten Fläche – ist
    // das, was ein Auge als „nass gewesen" und damit als echt liest.
    // 190…236 sind 0,75…0,93: nie spiegelnd, aber deutlich gestreut.
    roughness: (h) => 236 - h * 46,
  });

  _granite = { normalMap: maps.normalMap, roughnessMap: maps.roughnessMap };
  return _granite;
}

// Materialinstanzen werden **geteilt**, nicht je Objekt erzeugt. Schlüssel ist
// das Paar (Ton, Vertexfarben) – mehr Varianten gibt es nicht, und Farbe
// gehört ohnehin in die Vertexfarben (siehe `mossPatina`).
const _stoneMats = new Map();

/**
 * Verwitterter Granit.
 *
 * **Achtung Vertexfarben.** Standard ist `vertexColors: true`, weil dieses
 * Projekt Farbunterschiede über Vertexfarben löst statt über Materialinstanzen
 * (props.js:makeBucket macht es genauso). Eine Geometrie **ohne**
 * `color`-Attribut rendert damit schwarz – WebGL liefert für ein fehlendes
 * Attribut (0,0,0). Jede Geometrie aus diesem Modul hat eins (siehe
 * `weatheredStoneGeometry` und `mossPatina`); fremde Geometrien schickt man
 * vorher durch `ensureVertexColors()` oder setzt `vertexColors: false`.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.tone]          Grundton. Bei `vertexColors: true`
 *   sinnvollerweise 0xffffff, weil der Ton dann im Attribut steckt.
 * @param {boolean} [opts.vertexColors]
 * @returns {THREE.MeshStandardMaterial} geteilte Instanz je Schlüssel
 */
export function graniteMaterial({ tone = 0xffffff, vertexColors = true } = {}) {
  const key = `${tone}|${vertexColors ? 1 : 0}`;
  const cached = _stoneMats.get(key);
  if (cached) return cached;
  const maps = graniteMaps();
  const material = new THREE.MeshStandardMaterial({
    color: tone,
    vertexColors,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1, // wird von der Karte moduliert
    metalness: 0,
    normalScale: new THREE.Vector2(1, 1),
  });
  // **Keine Environment-Map.** quality.js gibt sie nur Materialien mit
  // `needsEnv`, und Granit gewinnt bei Rauheit 0,8 praktisch nichts – die IBL
  // ist mit knapp 25 % der Frame-Zeit der teuerste Posten der Szene.
  _stoneMats.set(key, material);
  return material;
}

// --- Vergrautes Außenholz ----------------------------------------------------
//
// Bambusrohr und Ahornstämme stehen im Regen. Außenholz unterscheidet sich von
// Innenholz in drei Punkten, und alle drei stecken hier drin:
//
//   * Die weiche Frühholzlage wäscht aus, das Spätholz bleibt stehen – das
//     Relief ist **tiefer** als bei einem gewachsten Dielenbrett.
//   * Es reißt längs. Trockenrisse sind schmal, tief und laufen über die ganze
//     Länge, aber nicht durchgehend gleich tief.
//   * Es vergraut und wird stumpf: keine Rauheit unter 0,84 irgendwo auf der
//     Fläche.
//
// Die Maserung läuft in **V** (Kachelrichtung y), weil ein Zylinder in three
// seine Länge auf V legt und U um den Umfang. Deshalb hohe Frequenz in x,
// niedrige in y – genau umgekehrt zu hinokiMaps, das für Bretter mit U längs
// gebaut ist.
let _wood = null;
export function weatheredWoodMaps() {
  if (_wood) return _wood;
  const size = 256;

  const height = (x, y) => {
    const u = x / size;
    const v = y / size;
    // Maserung: Zellen 5× höher als breit → längsgestreckte Fasern.
    const grain = pfbm(u * 20, v * 4, 4, 3, 617);
    // Riss: eine langsam wandernde Linie, an der Schwelle zu einer schmalen
    // tiefen Kerbe zusammengezogen. Die Amplitude wandert der Länge nach, damit
    // der Riss auslauft statt als Nut durchzulaufen.
    const line = pfbm(u * 8, v * 2, 2, 2, 313);
    const fade = pfbm(u * 2, v * 8, 2, 2, 91);
    const crack = Math.pow(Math.max(0, 1 - Math.abs(line - 0.5) * 9), 3) * (0.35 + fade);
    const fibre = grainAt(x, y, 133) * 0.18;
    return clamp01(grain * 0.66 + fibre - crack * 0.7);
  };

  const maps = heightToMaps({
    size,
    // V dreimal über die Kachel: eine Stammlänge zeigt mehrere Maserungsbahnen
    // statt einer gedehnten. Feinere Anpassung je Objekt über scaleUV.
    repeat: [1, 3],
    strength: 2.0,
    height,
    // Rissgrund und ausgewaschenes Frühholz sind stumpf und saugend, die
    // stehengebliebene Spätholzkante glänzt ganz schwach. 214…244 = 0,84…0,96.
    roughness: (h) => 244 - h * 30,
  });

  _wood = { normalMap: maps.normalMap, roughnessMap: maps.roughnessMap };
  return _wood;
}

const _woodMats = new Map();

/**
 * Vergrautes Außenholz für Bambusrohr, Stämme und Äste.
 * Gleiche Vertexfarben-Regel wie bei `graniteMaterial`.
 */
export function weatheredWoodMaterial({ tone = 0xffffff, vertexColors = true } = {}) {
  const key = `${tone}|${vertexColors ? 1 : 0}`;
  const cached = _woodMats.get(key);
  if (cached) return cached;
  const maps = weatheredWoodMaps();
  const material = new THREE.MeshStandardMaterial({
    color: tone,
    vertexColors,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1,
    metalness: 0,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
  _woodMats.set(key, material);
  return material;
}

// --- Vertexfarben ------------------------------------------------------------

/**
 * Sorgt dafür, dass die Geometrie ein `color`-Attribut hat (weiß, falls keins
 * da war). Ohne das rendert ein Material mit `vertexColors: true` schwarz.
 */
export function ensureVertexColors(geometry) {
  const p = geometry.attributes.position;
  if (!geometry.attributes.color || geometry.attributes.color.count !== p.count) {
    const colors = new Float32Array(p.count * 3).fill(1);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  return geometry;
}

/**
 * Moos- und Schmutzpatina als **Modulation** der vorhandenen Vertexfarben.
 *
 * Das ist der Unterschied zwischen „grauer Zylinder" und „Stein, der lange dort
 * steht" – und er kostet keinen Draw-Call, keine Textur und kein zweites
 * Material, weil er ins `color`-Attribut geschrieben wird, das die verschmolzene
 * Gartengeometrie ohnehin trägt.
 *
 * **Wo Moos wächst**, ist keine Geschmacksfrage, sondern eine Feuchtigkeitsfrage.
 * Vier Terme, jeder für eine Beobachtung:
 *
 *   * `up` – nach oben zeigende Flächen halten Wasser. Senkrechte Flanken
 *     trocknen ab, Überhänge bleiben ganz sauber.
 *   * `ledge` – der **Rand** einer waagerechten Fläche, wo das Wasser stehen
 *     bleibt und der Dreck sich sammelt. Bei einer Kasuga-Laterne ist das der
 *     Ring auf jedem Absatz, und genau der macht die gestapelten Zylinder zu
 *     einem Stück, das jahrzehntelang dort stand.
 *   * `shelter` – Nordseite. Die Richtung kommt aus `sunDirection()`, damit sie
 *     mit der einen Sonne der Szene übereinstimmt statt von Hand geraten zu
 *     sein: was die Sonne trifft, trocknet.
 *   * `low` – die untere Zone. Spritzwasser vom Kies, Bodenfeuchte, Laub.
 *
 * Das Produkt läuft durch ein 3D-Rauschfeld, weil Moos in **Flecken** wächst
 * und nicht als Verlauf. Ohne diesen Faktor bekommt jeder Stein denselben
 * sauberen Gradienten und man sieht die Formel.
 *
 * @param {THREE.BufferGeometry} geometry  wird an Ort und Stelle geändert
 * @param {object} [options]
 * @param {number} [options.y0]        Welt-Y des Geometrieursprungs. Für eine
 *   instanzierte Geometrie (Trittsteine) nötig, weil ihre Vertices lokal um
 *   Null liegen und `low` sonst überall greift.
 * @param {number} [options.floor]     Welt-Y des Bodens.
 * @param {number} [options.height]    Höhe der unteren Zone in Metern.
 * @param {number} [options.strength]  0 = nichts, 1 = Standard.
 * @param {number} [options.color]     Moosfarbe als Hex (kein setHSL – dessen
 *   Argumente liegen im linearen Arbeitsraum und werden zu hell).
 * @param {number} [options.scale]     Fleckengröße in Metern.
 * @param {number} [options.seed]
 * @param {number[]} [options.sun]     Richtung, in die das Licht **läuft**, als
 *   Einheitsvektor. Ohne Angabe die Sonne des Dojos aus `layout.js`. Der
 *   Zen-Garten hat eine andere (sie steht bei [−12 | 9 | −6]); ohne diesen
 *   Parameter bekämen seine Steine ihre Wetterseite von einer Sonne, die dort
 *   gar nicht scheint – falsch, aber unauffällig genug, um jahrelang zu
 *   überleben.
 * @returns {THREE.BufferGeometry} dieselbe Geometrie
 */
export function mossPatina(geometry, options = {}) {
  const {
    y0 = 0,
    floor = EXTERIOR.ground.y,
    height = 0.45,
    strength = 1,
    color = 0x4e5c2e,
    scale = 0.55,
    seed = 3,
    sun = null,
  } = options;

  ensureVertexColors(geometry);
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const col = geometry.attributes.color;
  const bb = geometry.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const radMax = Math.max(1e-4, Math.hypot(bb.max.x - cx, bb.max.z - cz));

  // Richtung, in die das Licht **läuft**; besonnt ist, was ihr entgegensteht.
  const [sx, sy, sz] = sun ?? sunDirection();

  // Moosfaktor je Kanal. Auf den größten Kanal normiert und dann abgedunkelt:
  // multiplikativ angewandt verschiebt das den Ton ins Grüne **und** dunkelt
  // ab, ohne von der Grundfarbe des Steins unabhängig zu werden. `THREE.Color`
  // rechnet den Hex korrekt in den linearen Arbeitsraum um – derselbe Weg wie
  // props.js:tint.
  const c = new THREE.Color(color);
  const peak = Math.max(c.r, c.g, c.b, 1e-4);
  const DARK = 0.55;
  const fr = (c.r / peak) * DARK + (1 - DARK) * 0.35;
  const fg = (c.g / peak) * DARK + (1 - DARK) * 0.55;
  const fb = (c.b / peak) * DARK + (1 - DARK) * 0.3;

  const k = 1 / Math.max(scale, 1e-3);
  let maxMoss = 0;

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);

    const up = smoothstep(0.1, 0.7, ny);
    const rad = Math.hypot(px - cx, pz - cz) / radMax;
    const ledge = up * smoothstep(0.5, 1, rad);
    const lit = Math.max(0, -(nx * sx + ny * sy + nz * sz));
    const shelter = 1 - lit;
    const low = 1 - smoothstep(0, height, py + y0 - floor);
    const patch = fbm3(px * k, py * k * 0.7, pz * k, seed, 3);

    const drive = 0.42 * up + 0.3 * ledge + 0.3 * shelter + 0.55 * low - 0.32;
    const m = clamp01(strength * drive * (0.28 + 1.2 * patch));
    if (m > maxMoss) maxMoss = m;

    const mr = 1 + m * (fr - 1);
    const mg = 1 + m * (fg - 1);
    const mb = 1 + m * (fb - 1);
    col.setXYZ(i, col.getX(i) * mr, col.getY(i) * mg, col.getZ(i) * mb);
  }
  col.needsUpdate = true;
  geometry.userData.mossMax = maxMoss;
  return geometry;
}

// --- Verwitterte Steinform ---------------------------------------------------

// Ein Zylinder mit sieben Seiten und **einem** Höhensegment hat genau zwei
// Ringe. An so einer Geometrie kann keine Kantenrundung entstehen: Zieht man
// die beiden Ringe ein, verjüngt sich der ganze Körper, statt dass eine Schulter
// entsteht. Deshalb wird ein `CylinderGeometry` vorher nachgebaut – mit
// derselben Kontur, aber genug Ringen, damit die Rundung Platz hat.
//
// **Nur wenn es sicher ist.** `geometry.parameters` weiß nichts von einem
// nachträglichen `translate()` oder `rotateZ()`; ein Nachbau würde die
// Verschiebung verlieren und den Stein in den Boden setzen – und genau so baut
// exterior.js die Laterne (`geo.translate(lx, y0 + y, lz)` nach der Erzeugung).
//
// Geprüft wird deshalb gegen eine **frisch gebaute Vorlage** mit denselben
// Parametern: Stimmen alle drei Bounding-Box-Maße überein, unterscheidet sich
// die Geometrie höchstens um eine Verschiebung, und die steht als Differenz der
// Mittelpunkte da. Alles andere – Drehung um Z (Ahornstamm), Skalierung –
// verändert mindestens ein Maß und fällt auf den Klon zurück.
//
// **Warum nicht einfach die Mitte gegen den Ursprung prüfen**: Ein Zylinder mit
// *ungerader* Segmentzahl ist nicht punktsymmetrisch. Beim
// `CylinderGeometry(0.5, 0.44, 0.12, 7)` der Trittsteine liegt der
// Bounding-Box-Mittelpunkt bei x ≈ −0,024, nicht bei null – die erste Fassung
// dieser Prüfung hat deshalb *jeden* Trittstein durchgewinkt, ohne ihn zu
// verdichten, und die gemessene Auslenkung war exakt 0. Sichtbar wurde das nur,
// weil der Test die Vertexzahl mitgezählt hat.
function densified(base) {
  const p = base.parameters;
  if (base.type !== 'CylinderGeometry' || !p) return base.clone();
  const ref = new THREE.CylinderGeometry(
    p.radiusTop,
    p.radiusBottom,
    p.height,
    p.radialSegments,
    p.heightSegments,
    p.openEnded
  );
  ref.computeBoundingBox();
  base.computeBoundingBox();
  const rb = ref.boundingBox;
  const bb = base.boundingBox;
  const same = (a, b) => Math.abs(a - b) < 1e-4;
  const untransformed =
    same(bb.max.x - bb.min.x, rb.max.x - rb.min.x) &&
    same(bb.max.y - bb.min.y, rb.max.y - rb.min.y) &&
    same(bb.max.z - bb.min.z, rb.max.z - rb.min.z);
  ref.dispose();
  if (!untransformed) return base.clone();
  const dense = new THREE.CylinderGeometry(
    p.radiusTop,
    p.radiusBottom,
    p.height,
    Math.max(p.radialSegments, 16),
    Math.max(p.heightSegments, 3),
    p.openEnded
  );
  dense.translate(
    (bb.min.x + bb.max.x - rb.min.x - rb.max.x) / 2,
    (bb.min.y + bb.max.y - rb.min.y - rb.max.y) / 2,
    (bb.min.z + bb.max.z - rb.min.z - rb.max.z) / 2
  );
  return dense;
}

// Normalen über **Positionen** mitteln statt über Indizes.
//
// three's `computeVertexNormals()` mittelt nur innerhalb eines Vertex-Index. Ein
// `CylinderGeometry` hat aber an der UV-Naht und zwischen Mantel und Deckel
// doppelte Vertices auf derselben Position – dort mittelt es nicht, und man
// sieht einen Schattenstreifen längs der Naht. (`mergeVertices()` hilft hier
// nicht: Es führt nur zusammen, was in *allen* Attributen gleich ist, und die
// UVs sind an der Naht per Definition verschieden. Die UVs wegzuwerfen ist
// keine Option – ohne sie greift die Normal-Map nicht.)
//
// Deshalb sammelt diese Funktion die Flächennormalen je **Position** ein. Der
// Knickwinkel bleibt als Sicherung drin: Flächen, die mehr als `crease` von der
// eigenen Mittelung abweichen, zählen nicht mit, damit eine wirklich scharfe
// Kante nicht zu einem dunklen Schmier verwischt. Bei den runden Steinen hier
// steht er mit 100° so weit offen, dass alles zusammenfällt – ein Kiesel hat
// keine harten Kanten mehr, das ist der ganze Punkt.
function smoothNormalsByPosition(geometry, creaseDeg = 100) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vi = (t, k) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  const fn = new Float32Array(triCount * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const cv = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const cb = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, vi(t, 0));
    b.fromBufferAttribute(pos, vi(t, 1));
    cv.fromBufferAttribute(pos, vi(t, 2));
    cb.subVectors(cv, b);
    ab.subVectors(a, b);
    cb.cross(ab);
    const len = cb.length();
    if (len > 1e-12) cb.multiplyScalar(1 / len);
    fn[t * 3] = cb.x;
    fn[t * 3 + 1] = cb.y;
    fn[t * 3 + 2] = cb.z;
  }

  const own = new Array(pos.count);
  const buckets = new Map();
  const keyOf = (i) =>
    `${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`;
  const keys = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    own[i] = [];
    keys[i] = keyOf(i);
    if (!buckets.has(keys[i])) buckets.set(keys[i], []);
  }
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const i = vi(t, k);
      own[i].push(t);
      buckets.get(keys[i]).push(t);
    }
  }

  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (const t of own[i]) {
      ox += fn[t * 3];
      oy += fn[t * 3 + 1];
      oz += fn[t * 3 + 2];
    }
    let l = Math.hypot(ox, oy, oz) || 1;
    ox /= l;
    oy /= l;
    oz /= l;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const t of buckets.get(keys[i])) {
      const dx = fn[t * 3];
      const dy = fn[t * 3 + 1];
      const dz = fn[t * 3 + 2];
      if (dx * ox + dy * oy + dz * oz < cosCrease) continue;
      sx += dx;
      sy += dy;
      sz += dz;
    }
    l = Math.hypot(sx, sy, sz);
    if (l < 1e-9) {
      sx = ox;
      sy = oy;
      sz = oz;
      l = 1;
    }
    normals[i * 3] = sx / l;
    normals[i * 3 + 1] = sy / l;
    normals[i * 3 + 2] = sz / l;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return geometry;
}

/**
 * Würfelprojizierte UVs mit **weltmaßstäblicher** Texeldichte.
 *
 * Die UVs eines `CylinderGeometry` sind für einen Stein unbrauchbar: U läuft
 * einmal um den Umfang (bei einem Trittstein 3,1 m), V einmal über die Höhe
 * (0,12 m) – dieselbe Kachel wird also in der einen Richtung gestaucht und in
 * der anderen um das Fünfundzwanzigfache gedehnt. Das Granitkorn stünde als
 * Streifenmuster auf der Flanke.
 *
 * Deshalb wird pro Vertex auf die dominante Normalenachse projiziert und durch
 * `metersPerTile` geteilt. Damit hat jede Fläche jedes Steins dieselbe
 * Korngröße, egal wie groß oder wie flach er ist. Die Achswechsel erzeugen
 * Nähte – bei einem richtungslosen Rauschmuster sieht man sie nicht, und das
 * ist genau der Grund, warum man diesen Trick bei Fels benutzt und bei Holz
 * nicht.
 */
export function boxProjectUV(geometry, metersPerTile = 0.4) {
  const pos = geometry.attributes.position;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const nrm = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const s = 1 / Math.max(metersPerTile, 1e-3);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u * s;
    uv[i * 2 + 1] = v * s;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/**
 * Bricht eine Primitivform zu einem Stein auf.
 *
 * Zwei Eingriffe, in dieser Reihenfolge:
 *
 *   1. **Schulter einziehen.** Der Radius wird zu den Deckeln hin
 *      zurückgenommen (`bevel` über die Zone `bevelZone`). Damit endet die
 *      Flanke nicht mehr lotrecht in einer 90°-Kante, sondern läuft in eine
 *      Rundung aus – das ist der Unterschied, den der Kritiker mit „lotrechte
 *      Flanken" gemeint hat, und er sitzt in der **Silhouette**, wo keine
 *      Normal-Map hinkommt.
 *   2. **Rauschen.** Zwei Oktaven, ellipsoidisch nach außen. Die Amplitude
 *      skaliert je Achse mit der halben Objektgröße, damit eine flache
 *      Trittsteinscheibe im Grundriss ausbeult (dort ist Platz) und in der Dicke
 *      nur leicht wellt (dort ist keiner).
 *
 * **Verschoben wird je Position, nicht je Vertex.** Ein `CylinderGeometry` ist
 * zwar indiziert, hat aber trotzdem doppelte Vertices – an der UV-Naht und
 * zwischen Mantel und Deckel. Bekämen die verschiedene Auslenkungen, klaffte
 * der Stein längs der Naht auf. Ein Zwischenspeicher über die gerundete Position
 * gibt allen Kopien denselben Wert (dasselbe Muster wie `blobGeometry` in
 * exterior.js, dort für nicht-indizierte Icosaeder).
 *
 * Anschließend `smoothNormalsByPosition()` statt `computeVertexNormals()`, aus
 * demselben Grund: sonst steht die Naht als Schattenstreifen im Bild.
 *
 * @param {THREE.BufferGeometry} base  Vorlage; wird nicht verändert
 * @param {number} [seed]
 * @param {object} [options]
 * @param {number} [options.amount]     Auslenkung als Anteil der halben Größe
 * @param {number} [options.frequency]  Beulen je Durchmesser
 * @param {number} [options.bevel]      Kantenrücknahme (0…0,5)
 * @param {number} [options.bevelZone]  Höhenanteil, über den sie einläuft
 * @param {number} [options.crease]     Knickwinkel in Grad
 * @param {boolean}[options.densify]    Zylinder vorher feiner nachbauen
 * @param {number} [options.uv]         Meter je Texturkachel; 0 = UVs behalten
 * @returns {THREE.BufferGeometry} neue Geometrie mit Normalen und Vertexfarben
 */
export function weatheredStoneGeometry(base, seed = 1, options = {}) {
  const {
    amount = 0.16,
    frequency = 2.4,
    bevel = 0.24,
    bevelZone = 0.55,
    crease = 100,
    densify = true,
    uv = 0.4,
  } = options;

  const g = densify ? densified(base) : base.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cy = (bb.min.y + bb.max.y) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  const hx = Math.max((bb.max.x - bb.min.x) / 2, 1e-4);
  const hy = Math.max((bb.max.y - bb.min.y) / 2, 1e-4);
  const hz = Math.max((bb.max.z - bb.min.z) / 2, 1e-4);
  const size = Math.max(hx, hy, hz);
  // Bei einer flachen Scheibe ist `hy` winzig; die Oberseite bekäme dann fast
  // keine Welle. Für den vertikalen Anteil wird deshalb ein Mindestmaß
  // angesetzt – eine Trittsteinoberfläche ist nicht eben, auch wenn der Stein
  // flach ist.
  const hyAmp = Math.max(hy, size * 0.25);
  const f = frequency / (2 * size);

  const pos = g.attributes.position;
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const key = `${vx.toFixed(4)}|${vy.toFixed(4)}|${vz.toFixed(4)}`;
    let d = cache.get(key);
    if (d === undefined) {
      const ey = (vy - cy) / hy;
      const shoulder = smoothstep(1 - bevelZone, 1, Math.abs(ey));
      const k = 1 - bevel * Math.pow(shoulder, 1.6);
      let px = cx + (vx - cx) * k;
      let pz = cz + (vz - cz) * k;
      let py = vy;

      const n1 = fbm3(vx * f, vy * f, vz * f, seed, 3) - 0.5;
      const n2 = fbm3(vx * f * 2.7 + 17, vy * f * 2.7, vz * f * 2.7, seed + 9, 2) - 0.5;
      const a = (n1 + n2 * 0.45) * amount * 2;

      const ex = (px - cx) / hx;
      const ez = (pz - cz) / hz;
      const len = Math.hypot(ex, ey, ez) || 1;
      px += (ex / len) * hx * a;
      pz += (ez / len) * hz * a;
      py += (ey / len) * hyAmp * a;

      d = [px, py, pz];
      cache.set(key, d);
    }
    pos.setXYZ(i, d[0], d[1], d[2]);
  }
  pos.needsUpdate = true;

  smoothNormalsByPosition(g, crease);
  if (uv > 0) boxProjectUV(g, uv);
  ensureVertexColors(g);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/**
 * Beide Kartensätze einmal anfassen, damit die Startkosten an einer bekannten
 * Stelle anfallen und messbar sind – analog `warmUpMaterials()`.
 */
export function warmUpStonework() {
  graniteMaps();
  weatheredWoodMaps();
}
