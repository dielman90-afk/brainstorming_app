import * as THREE from 'three';

// Materialsatz für das Konstrukt-Dojo.
//
// **Der Ordnername `dojo/` ist seit dieser Runde ein leichter Fehlname.** Diese
// Datei und ihre Nachbarn `foliage.js`, `ground.js`, `stonework.js` und
// `skylight.js` sind generisch; der Zen-Garten, die Himmelsinsel und der
// Nachthimmel in `environments.js` importieren sie inzwischen ebenfalls. Nur
// `layout.js`, `architecture.js`, `props.js`, `exterior.js`, `atmosphere.js`
// und `index.js` gehören wirklich dem Dojo.
//
// Verschoben wird trotzdem nichts: Ein neuer Ordner bedeutet vierzig geänderte
// Importpfade in Dateien, an denen sonst niemand etwas zu tun hätte, und jede
// davon ist eine Gelegenheit für einen Tippfehler, den erst die laufende Seite
// zeigt. Ein Kommentar kostet nichts und sagt dasselbe.
//
// Der Rest der App ist bewusst flach schattiertes Low-Poly: keine Normal-Maps,
// keine Rauheitskarten, überall die Standardrauheit. Genau das ist der Grund,
// warum die vorhandenen Umgebungen wie Spielzeug aussehen und nicht wie ein
// Raum. Ein Dojo lebt von Materialität – Holz gegen Papier gegen Stahl gegen
// Reisstroh – und die entsteht erst, wenn Licht auf jeder Fläche anders bricht.
//
// Das Verfahren ist dasselbe wie bei `leatherMaps` in environments.js: ein
// Höhenfeld zeichnen, per Sobel in eine Normal-Map umrechnen, optional eine
// Rauheitskarte aus derselben Höhe ableiten. Hier ist es einmal
// verallgemeinert, damit acht Materialien es teilen statt es acht Mal zu
// wiederholen.
//
// **Texturbudget.** Jede Textur ist eine eigene GPU-Ladung, und auf der Quest
// zählt das. Deshalb: Farbkarte nur, wo die Farbe wirklich variiert
// (Holz, Tatami, Papier), Normal-Map nur, wo die Oberfläche Relief hat, und
// sonst **skalare** Werte. Lack und Eisen kommen ganz ohne eigene Textur aus –
// ihre Wirkung steckt in Rauheit und Metallgrad, nicht in einem Muster.
//
// **Startzeit.** Alle Umgebungen werden beim Modulstart eifrig gebaut
// (main.js:98). Der Kommentar bei environments.js:1969 hält fest, was hier auf
// dem Spiel steht: eine einzige 256er-Kachel mit 190 Voronoi-Zellen kostete
// einmal eine halbe Sekunde Startzeit, weil die Suche pro Pixel über alle
// Zellen lief. Jede Karte hier ist deshalb memoisiert, höchstens 512 px groß
// und vermeidet Schleifen über Zellenlisten pro Pixel.

// --- Rauschen: periodisch und billig ----------------------------------------
//
// Zwei Anforderungen, die environments.js' `hashNoise` beide nicht erfüllt.
//
// **Periodisch.** Eine Bodenfläche kachelt die Textur zwanzig Mal. Rauschen aus
// `sin(x*127.1 + …)` wiederholt sich nie, also stimmt die rechte Kante der
// Kachel nicht mit der linken überein und über den ganzen Boden zieht sich ein
// Gitter aus sichtbaren Nähten. Die Gitterindizes werden deshalb **modulo einer
// Periode** genommen; weil jede Oktave die Frequenz verdoppelt, verdoppelt sich
// die Periode mit, und die Summe kachelt auf jeder Ebene.
//
// **Billig.** `Math.sin` pro Gitterpunkt bedeutet bei vier Oktaven sechzehn
// Sinusaufrufe pro Pixel; über zwei 512er-Kacheln waren das gemessene 814 ms
// Startzeit – das Doppelte des gesamten Budgets. Eine vorberechnete
// Permutationstabelle macht daraus zwei Feldzugriffe.
const PERM = (() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates mit festem Startwert – dasselbe Muster bei jedem Laden.
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

// Feines Korn pro Pixel – Periode 256, teilt also jede Kachelgröße hier glatt.
function grainAt(x, y, seed) {
  return hash2(x & 255, y & 255, seed);
}

// Geglättetes Wertrauschen mit Gitterperiode.
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

// `u`/`v` in Gitterzellen, `period` die Zellzahl über eine Kachel (ganzzahlig).
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

// --- Höhenfeld → Normal-Map (+ optional Rauheitskarte) ----------------------
//
// `height(x, y)` liefert 0..1. Gemessen wird **gekachelt** (der Zugriff `at()`
// wickelt um die Ränder), damit die Kachel nahtlos bleibt – ohne das zeichnet
// sich an jeder Kachelgrenze eine harte Kante ab, und bei einer
// zwanzigfach gekachelten Dielenfläche sieht man nichts anderes mehr.
export function heightToMaps({
  size = 256,
  repeat = [1, 1],
  strength = 2.2,
  height,
  roughness = null,
  anisotropy = 4,
}) {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) field[y * size + x] = height(x, y);
  }
  // Das Höhenfeld wird zurückgegeben, damit die Farbkarte es **weiterverwenden**
  // kann statt dieselbe Funktion ein zweites Mal über alle Pixel zu rechnen.
  // Nebenbei erzwingt das, dass Farbe und Relief deckungsgleich liegen – sonst
  // sieht man die Maserung zweimal, leicht gegeneinander versetzt.

  const wrap = (v) => ((v % size) + size) % size;
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

// Farbkachel aus einer Zeichenfunktion. Immer sRGB und gekachelt – jede
// Farbtextur hier ist eine Materialoberfläche, keine Benutzeroberfläche.
function colorTexture(size, draw, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

// Kachelung über die UVs der Geometrie statt über `texture.repeat`.
//
// Warum nicht einfach die Textur klonen und `repeat` anders setzen: three legt
// pro `Texture`-Instanz eine eigene GPU-Ladung an, ein Klon verdoppelt also den
// Texturspeicher für dasselbe Bild. Die UVs zu skalieren ist gratis und der
// übliche Weg, dieselbe Diele auf einem 8-m-Boden und auf einem 10-cm-Balken
// im richtigen Maßstab zu zeigen.
export function scaleUV(geometry, su, sv = su, offsetU = 0, offsetV = 0) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su + offsetU, uv.getY(i) * sv + offsetV);
  }
  uv.needsUpdate = true;
  return geometry;
}

// --- Hinoki (japanische Zypresse): Boden, Balken, Ständer -------------------
//
// Die Maserung läuft in U. Alles, was aus diesem Material gebaut wird, muss
// seine UVs so legen, dass U der Längsachse des Bretts folgt – quer laufende
// Maserung ist eines der Dinge, die ein Auge sofort als falsch liest, auch wenn
// es nicht benennen kann, warum.
let _hinoki = null;
export function hinokiMaps() {
  if (_hinoki) return _hinoki;
  const size = 512;
  const CELLS = 8; // Rauschzellen über die Kachel – muss ganzzahlig sein
  const RINGS = 11; // Jahresringe über die Kachel, ebenfalls ganzzahlig

  // Höhe: Poren entlang der Maserung, plus die weichen Jahresringe.
  //
  // Die Ringe laufen als Sinus über **ganze** Perioden je Kachel, sonst bricht
  // die Maserung an der Kachelgrenze ab. Das Wackeln, das die Ringe unregelmäßig
  // macht, kommt aus periodischem Rauschen und kachelt mit.
  const grain = (x, y) => {
    const wobble = pfbm((x / size) * CELLS, (y / size) * CELLS * 4, CELLS, 3, 11) - 0.5;
    const rings = Math.sin(((y / size) * RINGS + wobble * 0.35) * Math.PI * 2);
    // Schmale, harte Spätholzstreifen; das Frühholz dazwischen bleibt flach.
    const late = Math.pow(Math.max(0, rings), 6);
    const pores = grainAt(x, y, 57) * 0.22;
    return late * 0.7 + pores;
  };

  const { normalMap, roughnessMap, field } = heightToMaps({
    size,
    repeat: [1, 1],
    strength: 1.5,
    height: grain,
    // Spätholz ist dichter und nimmt weniger Öl an – es glänzt etwas mehr.
    // Der Grundwert bleibt hoch: ein Dojo-Boden ist gewachst, nicht lackiert.
    roughness: (h) => 224 - h * 70,
  });

  const map = colorTexture(size, (ctx, s) => {
    const image = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const h = field[y * s + x]; // dasselbe Relief, nicht neu gerechnet
        const blotch = pfbm((x / s) * CELLS, (y / s) * CELLS, CELLS, 3, 77);
        const shade = 1 - h * 0.34 - (blotch - 0.5) * 0.16;
        const i = (y * s + x) * 4;
        image.data[i] = Math.max(0, Math.min(255, 200 * shade));
        image.data[i + 1] = Math.max(0, Math.min(255, 165 * shade));
        image.data[i + 2] = Math.max(0, Math.min(255, 119 * shade));
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  _hinoki = { map, normalMap, roughnessMap };
  return _hinoki;
}

export function hinokiMaterial({
  color = 0xffffff,
  roughness = 1,
  uvScale = 1,
  side = THREE.FrontSide,
} = {}) {
  const maps = hinokiMaps();
  return new THREE.MeshStandardMaterial({
    color,
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness,
    metalness: 0,
    side,
    normalScale: new THREE.Vector2(uvScale, uvScale),
  });
}

// --- Tatami: Binsengeflecht mit dunklem Leinenrand ---------------------------
//
// Das Geflecht ist der Maßstabsgeber des ganzen Raums. Eine Matte ist
// 0,91 × 1,82 m, die Binsen laufen quer zur langen Seite, und aus einem Meter
// Abstand muss man die einzelnen Halme sehen können – tut man das nicht, wirkt
// der Boden wie grüner Filz und der Raum verliert seine Größe.
let _tatami = null;
export function tatamiMaps() {
  if (_tatami) return _tatami;
  const size = 512;
  const REEDS = 48; // Halme über die Kachel

  const CELLS = 4;
  // REEDS teilt die Kachelhöhe glatt, also schließt der letzte Halm sauber an
  // den ersten an.
  const weave = (x, y) => {
    const t = (y / size) * REEDS;
    const reed = Math.floor(t) % REEDS;
    const within = t - Math.floor(t);
    // Runder Querschnitt je Halm …
    const round = Math.sin(within * Math.PI);
    // … mit einer feinen Längsfaser darin und leichter Dickenstreuung.
    const fibre = grainAt(x, reed, 23) * 0.16;
    const vary = 0.85 + hash2(reed, 3, 9) * 0.3;
    return round * vary * 0.8 + fibre;
  };

  const { normalMap, field } = heightToMaps({
    size,
    strength: 2.0,
    height: weave,
  });

  const map = colorTexture(size, (ctx, s) => {
    const image = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const h = field[y * s + x];
        // Alte Tatami bleichen ungleichmäßig von Grün nach Strohgelb aus.
        const age = pfbm((x / s) * CELLS, (y / s) * CELLS, CELLS, 3, 313);
        const green = 0.35 + age * 0.5;
        const shade = 0.62 + h * 0.42;
        const i = (y * s + x) * 4;
        image.data[i] = Math.min(255, (196 - green * 34) * shade);
        image.data[i + 1] = Math.min(255, (186 - green * 8) * shade);
        image.data[i + 2] = Math.min(255, (128 - green * 40) * shade);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  _tatami = { map, normalMap };
  return _tatami;
}

export function tatamiMaterial() {
  const maps = tatamiMaps();
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    // Binsen sind matt und staubig. Ein Glanzlicht darauf zerstört den Eindruck
    // sofort, deshalb skalar und hoch statt einer eigenen Rauheitskarte.
    roughness: 0.92,
    metalness: 0,
  });
}

// --- Kalkputz: die großen ruhigen Wandflächen -------------------------------
//
// Fast strukturlos, aber eben nur fast. Eine völlig glatte Wand ist im
// Streiflicht als Fläche ohne Eigenschaft erkennbar; die minimale
// Kellenstruktur ist der Unterschied zwischen „Wand" und „graues Polygon".
let _plaster = null;
export function plasterMaps() {
  if (_plaster) return _plaster;
  const size = 256;
  const { normalMap } = heightToMaps({
    size,
    strength: 0.9,
    height: (x, y) =>
      pfbm((x / size) * 6, (y / size) * 6, 6, 4, 404) * 0.7 + grainAt(x, y, 13) * 0.1,
  });
  _plaster = { normalMap };
  return _plaster;
}

export function plasterMaterial(color = 0xb9b3a4) {
  return new THREE.MeshStandardMaterial({
    color,
    normalMap: plasterMaps().normalMap,
    roughness: 0.95,
    metalness: 0,
  });
}

// --- Kawara: die Dachziegel ---------------------------------------------------
//
// Das Dach war bis hierher eine einzige graublau eingefärbte Holzfläche. Von
// innen sieht man es nie, von außen ist es die **größte** Fläche des Gebäudes –
// aus dem Garten und erst recht von schräg oben ein schwarzes Stück Pappe.
//
// **Warum das Muster in beide Richtungen gleich aussieht.** Die UVs des Dachs
// kommen aus der Grundfläche (x/0,9 und z/0,9). Auf den beiden Längsflächen
// laufen die Ziegelreihen damit in V, auf den beiden Walmen in U – die Traufe
// zeigt dort in die andere Weltachse. Ein Muster mit nur einer Vorzugsrichtung
// stünde auf zwei der vier Flächen quer. Deshalb ein Raster: Deckziegelwülste
// **und** Reihenstufen in beiden Achsen. Das ist nicht die Bauweise eines
// echten Hongawara-Dachs, aber es ist die einzige Variante, die aus jeder
// Richtung als Ziegeldach liest, ohne für jede Fläche eigene UVs zu brauchen.
let _kawara = null;
export function kawaraMaps() {
  if (_kawara) return _kawara;
  const size = 256;
  const N = 3; // Ziegel je Kachel und Achse – 0,9 m / 3 = 30 cm, echtes Maß

  // Ein Ziegel: flache Pfanne mit einer Mulde, dazwischen der runde Wulst des
  // Deckziegels. `Math.sin(π·t)` gibt die Mulde, der Wulst sitzt auf der Fuge.
  const kachel = (x, y) => {
    const u = ((x / size) * N) % 1;
    const v = ((y / size) * N) % 1;
    // Wulst über der Fuge: schmal, hoch, in beiden Achsen.
    const wulstU = Math.exp(-Math.pow((u < 0.5 ? u : u - 1) / 0.11, 2));
    const wulstV = Math.exp(-Math.pow((v < 0.5 ? v : v - 1) / 0.11, 2));
    const wulst = Math.max(wulstU, wulstV) * 0.75;
    // Mulde der Pfanne dazwischen.
    const mulde = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * 0.28;
    // Jeder Ziegel liegt eine Spur anders – gebrannter Ton ist nie eben.
    const ix = Math.floor((x / size) * N);
    const iy = Math.floor((y / size) * N);
    const kipp = (hash2(ix, iy, 77) - 0.5) * 0.09;
    return wulst + mulde + kipp + grainAt(x, y, 41) * 0.05;
  };

  const { normalMap, roughnessMap, field } = heightToMaps({
    size,
    strength: 2.6,
    height: kachel,
    // Der First und die Wülste sind vom Regen blank gewaschen, die Mulden
    // halten Staub und Flechten – also glänzt oben, was unten stumpf ist.
    roughness: (h) => Math.max(0, Math.min(255, (0.86 - h * 0.26) * 255)),
  });

  const map = colorTexture(size, (ctx, s) => {
    const image = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const h = field[y * s + x];
        // Ibushi-gawara: geräucherter Ton, silbriggrau mit einem Blaustich, in
        // den Fugen fast schwarz.
        const fleck = pfbm((x / s) * 5, (y / s) * 5, 5, 3, 517);
        const hell = 0.52 + h * 0.55 + (fleck - 0.5) * 0.16;
        const i = (y * s + x) * 4;
        image.data[i] = Math.min(255, 96 * hell);
        image.data[i + 1] = Math.min(255, 102 * hell);
        image.data[i + 2] = Math.min(255, 110 * hell);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  _kawara = { map, normalMap, roughnessMap };
  return _kawara;
}

export function kawaraMaterial() {
  const maps = kawaraMaps();
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    // Gebrannter Ton, nicht glasiert: stumpf, aber nicht kreidig. Der Skalar
    // multipliziert die Karte, deshalb steht er auf 1.
    roughness: 1,
    metalness: 0,
  });
}

// --- Shoji-Papier ------------------------------------------------------------
//
// Washi ist **durchscheinend**, und das ist sein ganzer Charakter: Das
// Gegenlicht steht als weiches Leuchten in der Fläche, die Fasern zeichnen sich
// dagegen ab. Umgesetzt über `emissive` statt echter Transmission –
// `transmission` kostet auf mobiler Hardware einen zusätzlichen Renderdurchgang
// pro Fläche und ist auf der Quest nicht bezahlbar. Das Leuchten wird vom
// Lichtrig gesetzt, damit es zur Sonnenrichtung passt.
let _washi = null;
export function washiTexture() {
  if (_washi) return _washi;
  _washi = colorTexture(
    256,
    (ctx, s) => {
      const image = ctx.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          // Lange, flach liegende Fasern (Kozo) – stark in X gestreckt.
          const fibre = pfbm((x / s) * 2, (y / s) * 48, 2, 3, 88);
          const clump = pfbm((x / s) * 5, (y / s) * 5, 5, 2, 12);
          const v = 232 + fibre * 20 - clump * 12;
          const i = (y * s + x) * 4;
          image.data[i] = Math.min(255, v);
          image.data[i + 1] = Math.min(255, v - 3);
          image.data[i + 2] = Math.min(255, v - 12); // minimal warm
          image.data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
    [3, 3]
  );
  return _washi;
}

export function washiMaterial({
  emissive = 0x000000,
  emissiveIntensity = 0,
  shadowedEmissive = false,
  color = 0xd8d0be,
} = {}) {
  const material = new THREE.MeshStandardMaterial({
    map: washiTexture(),
    // **0xd8d0be statt 0x7d776a – die eigentliche Ursache der „toten" Fenster.**
    //
    // Der Putz im Raum hat 0xbdb6a6, das Papier hatte 0x7d776a: einen um ein
    // Drittel dunkleren Grundton. Auf den Schattenseiten, wo das Eigenleuchten
    // schwach ist, kam das Papier damit **dunkler** heraus als die Wand daneben
    // – und ein Fenster, das dunkler ist als der Putz ringsum, liest sich als
    // Brett, nicht als durchscheinende Membran.
    //
    // Echtes Washi hat eine Albedo um 0,75 bis 0,8 und ist heller als
    // Kalkputz. Das Eigenleuchten trägt jetzt nur noch den *Unterschied*
    // zwischen den Himmelsrichtungen, nicht mehr die Grundhelligkeit.
    color,
    emissive: new THREE.Color(emissive),
    emissiveIntensity,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  if (shadowedEmissive) shadowTheGlow(material);
  return material;
}

// **Das Eigenleuchten des Papiers in den Schatten stellen.**
//
// Ein Shoji leuchtet, weil Sonne *durch* das Papier fällt. Modelliert ist das
// als `emissive` – und genau daran scheitert der Bambushain: Eigenleuchten
// kennt keinen Schatten. Der Hain steht zwischen Sonne und Fenster, wirft
// seinen Schatten brav auf die Papierfläche, und man sieht nichts davon, weil
// die Fläche ohnehin von sich aus hell ist.
//
// Der reguläre Schattenterm hilft hier nicht: Er dämpft nur *direktes* Licht,
// und die Innenseite des Papiers ist von der Sonne abgewandt – ihr direkter
// Anteil ist ohnehin null. Es gibt also nichts, was der Schatten dämpfen
// könnte.
//
// Deshalb ein kleiner Eingriff in den Shader: `getShadowMask()` liefert genau
// die Zahl, die three sonst auf das direkte Licht anwendet (1 = besonnt,
// 0 = verschattet). Auf `totalEmissiveRadiance` angewandt hört das Papier
// genau dort auf zu leuchten, wo ein Halm davorsteht – was physikalisch die
// richtige Regel ist: Wo kein Licht ankommt, wird auch keins durchgelassen.
//
// Ein Rest bleibt stehen (`0.18`), damit ein verschatteter Streifen nicht in
// reines Schwarz kippt: Auch im Schatten trifft Himmelslicht auf das Papier.
function shadowTheGlow(material) {
  material.userData.shadowedEmissive = true;
  material.onBeforeCompile = (shader) => {
    // **Der Einfügeort war zweimal falsch, und beide Male anders.**
    //
    // Erst hing der Baustein an `<common>`: Compilerfehler, weil
    // `getShadowMask()` die Strukturen und Sampler aus
    // `<shadowmap_pars_fragment>` braucht und die weiter unten stehen.
    //
    // Dann stand die Anwendung vor `<opaque_fragment>` – das kompilierte
    // sauber und tat **nichts**. `outgoingLight` wird ein paar Zeilen vorher
    // aus `totalDiffuse + totalSpecular + totalEmissiveRadiance` gebildet; was
    // danach an `totalEmissiveRadiance` geschrieben wird, liest niemand mehr.
    // Aufgefallen ist das nur, weil eine Probe mit festem Faktor 0,15 die
    // gemessene Helligkeit der Papierfläche **exakt unverändert** ließ
    // (126,1 vorher wie nachher). Am Bild wäre es als „wirkt halt schwach"
    // durchgegangen.
    //
    // Richtiger Anker ist deshalb `<aomap_fragment>`: nach der Beleuchtung,
    // vor der Summe.
    //
    // **Und der dritte Fehler war die Maske selbst.** Mit `getShadowMask()`
    // wurde das Papier gleichmäßig dunkel – es verschattete **sich selbst**.
    // Das Washi wirft Schatten (bewusst, sonst schiene die Sonne durch die
    // Shoji, als stünde dort keine Wand), steht damit als Nulldicke-Fläche in
    // der Schattenkarte, und die Innenseite liegt genau dahinter. `normalBias`
    // macht es sogar schlimmer: Er versetzt die Abtastung entlang der Normalen,
    // und die zeigt hier **von der Sonne weg**.
    //
    // Also eine eigene Abfrage mit grobem Bias statt der Standardmaske.
    // −0,02 in Kartentiefe sind bei einem Frustum von 33,5 m rund 0,67 m: weit
    // genug, um die eigene Fläche zu überspringen, und weit weniger als der
    // Abstand zum nächsten Halm (mindestens 0,9 m vor der Front). Die Schleife
    // entfällt, weil dieser Raum per Konstruktion **eine** Sonne hat
    // (layout.js:SUN) – gäbe es eine zweite, wäre das hier nicht die einzige
    // Stelle, die anzupassen wäre.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
          totalEmissiveRadiance *= mix( 0.16, 1.0, getShadow(
            directionalShadowMap[ 0 ],
            directionalLightShadows[ 0 ].shadowMapSize,
            directionalLightShadows[ 0 ].shadowIntensity,
            -0.02,
            directionalLightShadows[ 0 ].shadowRadius,
            vDirectionalShadowCoord[ 0 ] ) );
        #endif`
    );
  };
  // Zwei Materialien mit demselben Schlüssel teilen sich ein kompiliertes
  // Programm. Ohne eigenen Schlüssel bekäme das gedämpfte Papier das Programm
  // des ungedämpften – oder umgekehrt, je nachdem, was zuerst kompiliert.
  material.customProgramCacheKey = () => 'washi-shadowed-emissive';
  return material;
}

// --- Geschmiedeter Stahl: Klingen -------------------------------------------
//
// Der Reiz einer Klinge ist ein **gerichtetes** Glanzlicht: Der Schmiedehammer
// hinterlässt feine Züge längs der Klinge, das Licht zieht sich daran zu einem
// Strich statt zu einem Punkt. Echte anisotrope Beleuchtung hat
// MeshStandardMaterial nicht – die Züge stehen deshalb in der Normal-Map, was
// bei streifendem Licht denselben Eindruck erzeugt.
let _steel = null;
export function steelMaps() {
  if (_steel) return _steel;
  const size = 256;
  const { normalMap, roughnessMap } = heightToMaps({
    size,
    repeat: [1, 4],
    strength: 0.55,
    // Sehr stark in X gestreckt = Züge längs der Klinge.
    height: (x, y) => pfbm((x / size) * 2, (y / size) * 64, 2, 3, 909),
    // Der Hamon: Die gehärtete Schneide ist matter als der polierte Rücken.
    // Läuft über X, weil die Klingen-UVs die Breite auf U legen.
    roughness: (h, x) => {
      const edge = 1 - Math.abs(x / size - 0.5) * 2; // 0 am Rand, 1 in der Mitte
      const hamon = Math.pow(Math.max(0, 1 - edge * 1.6), 2);
      return 26 + hamon * 92 + h * 22;
    },
  });
  _steel = { normalMap, roughnessMap };
  return _steel;
}

export function steelMaterial(color = 0xd7dde2) {
  const maps = steelMaps();
  return needsEnvironment(
    new THREE.MeshStandardMaterial({
      color,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      roughness: 1, // wird von der Karte moduliert
      metalness: 1,
      normalScale: new THREE.Vector2(0.35, 0.35),
    })
  );
}

// Eisenbeschläge (Tsuba, Nägel, Beschläge): dieselbe Struktur, aber dunkel,
// stumpf und weniger spiegelnd. Spart eine komplette Textur.
export function ironMaterial(color = 0x3a3d42) {
  return needsEnvironment(
    new THREE.MeshStandardMaterial({
      color,
      normalMap: steelMaps().normalMap,
      roughness: 0.62,
      metalness: 0.9,
      normalScale: new THREE.Vector2(0.8, 0.8),
    })
  );
}

// --- Urushi-Lack: Saya, Waffenständer, Bordüren ------------------------------
//
// Lack ist die einzige Fläche im Raum, die wirklich spiegelt – und genau deshalb
// ist er der Prüfstein für die Environment-Map. Ohne `scene.environment` sieht
// dieses Material aus wie schwarzer Kunststoff; mit ihr bekommt es die
// Raumreflexion, die es glaubwürdig macht. Keine eigene Textur: Lack ist
// spiegelglatt, jede Struktur darin wäre falsch.
export function lacquerMaterial(color = 0x140f0e) {
  return needsEnvironment(
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.12,
      metalness: 0.1,
    })
  );
}

// --- Reisstroh-Seil: Makiwara-Wicklung, Shimenawa ---------------------------
let _rope = null;
export function ropeMaps() {
  if (_rope) return _rope;
  const size = 256;
  const STRANDS = 14;
  const { normalMap } = heightToMaps({
    size,
    strength: 2.6,
    // Drei verdrillte Litzen: eine schräg laufende Sinuswelle, in sich gefasert.
    height: (x, y) => {
      const t = ((x * 0.35 + y) / size) * STRANDS;
      const within = t - Math.floor(t);
      const round = Math.sin(within * Math.PI);
      const fibre = grainAt(x, y, 44) * 0.25;
      return round * 0.75 + fibre;
    },
  });
  _rope = { normalMap };
  return _rope;
}

export function ropeMaterial(color = 0xbfa878) {
  return new THREE.MeshStandardMaterial({
    color,
    normalMap: ropeMaps().normalMap,
    roughness: 0.94,
    metalness: 0,
  });
}

// --- Wer braucht die Environment-Map? ---------------------------------------
//
// Gemessen ist die IBL-Abtastung der teuerste Posten der ganzen Umgebung:
// knapp 25 % der Frame-Zeit. `scene.environment` gilt aber fuer **alle**
// Standardmaterialien der Szene – three kompiliert den Envmap-Pfad in jeden
// Shader, auch in den des Bodens. `envMapIntensity = 0` spart nichts, der
// Shader tastet trotzdem ab.
//
// Boden, Tatami, Putz und Schalung sind rau und gewinnen fast nichts durch eine
// Spiegelung, tragen aber den Grossteil der Pixel. Klinge, Beschlag und Lack
// gewinnen alles – ohne Environment-Map rendern sie **schwarz**, weil ein
// Metall ohne etwas zu spiegeln keine diffuse Komponente hat.
//
// Deshalb werden genau diese drei markiert und bekommen die Karte spaeter
// einzeln zugewiesen, statt sie ueber die ganze Szene zu legen.
function needsEnvironment(material) {
  material.userData.needsEnv = true;
  return material;
}

// Alle Karten einmal anfassen, damit die Kosten an einer bekannten Stelle
// anfallen und `startup.mjs` sie messen kann.
export function warmUpMaterials() {
  hinokiMaps();
  tatamiMaps();
  plasterMaps();
  washiTexture();
  steelMaps();
  ropeMaps();
}
