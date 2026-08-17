import * as THREE from 'three';
import * as MAT from './materials.js';

// Boden- und Wassermaterialien für den Garten.
//
// Anlass: Moos, Kies und der Wasserspiegel im Tsukubai waren
// `MeshLambertMaterial` mit einer reinen Farbtextur. Lambert kennt weder
// Normal-Map noch Rauheit noch Spiegelung – die drei Flächen konnten deshalb
// gar nichts anderes sein als bedrucktes Papier, egal wie gut die Farbtextur
// war. Bei geharktem Kies ist das besonders teuer erkauft: Die Harkrillen sind
// nur dann Rillen, wenn die tief stehende Sonne einen Schatten hineinwirft, und
// dafür braucht es Relief, nicht Farbe. Eine gemalte Rille bleibt aus jedem
// Winkel gleich hell und liest sich als Aufdruck.
//
// Verfahren wie in materials.js: Höhenfeld zeichnen, per Sobel in eine
// Normal-Map umrechnen, Farbe **aus demselben Höhenfeld** ableiten, damit
// Relief und Zeichnung deckungsgleich liegen.
//
// **Startzeit.** Alle Karten sind memoisiert, höchstens 512 px groß, und keine
// von ihnen läuft pro Pixel über eine Liste (der Kommentar bei materials.js:23
// hält fest, was das einmal gekostet hat). Der Kies zeichnet sein Höhenfeld
// deshalb mit Canvas-Strichen und liest es einmal zurück, statt für jedes Pixel
// zu prüfen, ob ein Stein in der Nähe liegt.

// --- Geteilte Bausteine aus materials.js -------------------------------------
//
// `heightToMaps`, das periodische Rauschen und `colorTexture` sind dort
// vorhanden, aber (noch) nicht exportiert – und materials.js gehört in dieser
// Runde jemand anderem, also wird dort nichts angefasst. Wenn die Exporte
// kommen, benutzt dieses Modul sie automatisch; bis dahin greift die
// Rückfallkopie am Dateiende. Sobald `export` vor `heightToMaps`, `pfbm`,
// `grainAt` und `colorTexture` steht, kann der ganze Block dort gelöscht werden.
const heightToMaps = MAT.heightToMaps ?? fallbackHeightToMaps;
const pfbm = MAT.pfbm ?? fallbackPfbm;
const grainAt = MAT.grainAt ?? fallbackGrainAt;
const colorTexture = MAT.colorTexture ?? fallbackColorTexture;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const byte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// --- Moos und Wiese ----------------------------------------------------------
//
// Die 110-m-Ebene kachelt achtzehnfach; eine Kachel ist also gut 6 m breit. Das
// ist der Grund für **zwei Maßstäbe** im selben Höhenfeld: Aus zwanzig Metern
// sieht man nur die groben Flecken – Moospolster gegen kahle Erde –, aus zwei
// Metern nur das feine Korn. Ein Maßstab allein versagt jeweils an der anderen
// Entfernung: nur grob wirkt aus der Nähe wie Filz, nur fein wirkt aus der
// Ferne wie gleichmäßiges Rauschen, also wieder wie Papier.
//
// Beide Maßstäbe kommen aus dem **periodischen** Rauschen. Bei achtzehnfacher
// Kachelung wäre nicht-periodisches Rauschen als Nahtgitter über den ganzen
// Boden sichtbar (materials.js:32).
const MOSS_SIZE = 512;
const MOSS_PATCHES = 10; // grobe Polsterflecken je Kachel (ganzzahlig!)
const MOSS_TUFTS = 30; // feines Polsterkorn je Kachel

let _moss = null;
export function mossMaps() {
  if (_moss) return _moss;
  const size = MOSS_SIZE;

  // Die Polsterverteilung wird in der Höhenschleife **mitgeschrieben**, damit
  // die Farbschleife sie nicht ein zweites Mal rechnen muss. Dieselbe Zahl
  // entscheidet über Wölbung und über Grün-gegen-Erde – sonst läge das Grün
  // neben dem Polster statt darauf.
  const cushion = new Float32Array(size * size);

  const height = (x, y) => {
    const u = x / size;
    const v = y / size;
    const patch = pfbm(u * MOSS_PATCHES, v * MOSS_PATCHES, MOSS_PATCHES, 3, 601);
    const tuft = pfbm(u * MOSS_TUFTS, v * MOSS_TUFTS, MOSS_TUFTS, 2, 233);
    // Moos wächst nicht als Teppich, sondern als Polster mit kahlen Stellen
    // dazwischen. Die harte Schwelle erzeugt genau diese Kante: hier Polster,
    // dort blanke Erde, und der Übergang schmal.
    const c = smoothstep(0.44, 0.72, patch);
    cushion[y * size + x] = c;
    const speck = grainAt(x, y, 71);
    // Polster wölben sich auf, die Erde dazwischen bleibt flach und körnig.
    return c * (0.52 + tuft * 0.48) + (1 - c) * (0.06 + tuft * 0.14) + speck * 0.09;
  };

  const { normalMap, roughnessMap, field } = heightToMaps({
    size,
    repeat: [18, 18],
    // Zurückhaltend. Eine 110-m-Ebene sieht man fast nur streifend, und ein zu
    // kräftiges Relief flimmert dort, statt zu tragen.
    strength: 1.6,
    height,
    // Trockene Erde streut breiter als Moos; das Moos selbst hat eine winzige
    // Wachsschicht auf den Blättchen. Der Unterschied ist klein – die Karte
    // wird in der Brille ohnehin gegen einen Skalar getauscht (quality.js,
    // `dojo-exterior-ground` steht in LARGE_SURFACES).
    roughness: (h, x, y) => 250 - cushion[y * size + x] * 26 - h * 10,
    anisotropy: 8,
  });

  const map = colorTexture(
    size,
    (ctx, s) => {
      const image = ctx.createImageData(s, s);
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = y * s + x;
          const c = cushion[i];
          const h = field[i];
          // Hexwerte statt `Color.setHSL`: setHSL legt seine Argumente in
          // three 0.185 im **linearen** Arbeitsraum aus, nicht in sRGB. In
          // diesem Projekt ist damit schon zweimal alles zu hell geworden.
          // Diese Bytes gehen direkt in eine sRGB-Textur.
          const mossR = 74;
          const mossG = 98;
          const mossB = 52;
          const soilR = 88;
          const soilG = 76;
          const soilB = 58;
          // Zweiter grober Maßstab nur für die Farbe: alte, ausgetrocknete
          // Partien neben satten. Ohne das ist jedes Polster gleich grün und
          // die Fläche kippt aus zwanzig Metern wieder in einen Farbfleck.
          const dry = pfbm((x / s) * 3, (y / s) * 3, 3, 2, 907);
          const shade = 0.72 + h * 0.5;
          const r4 = i * 4;
          image.data[r4] = byte((soilR + (mossR - soilR) * c) * shade + dry * 22);
          image.data[r4 + 1] = byte((soilG + (mossG - soilG) * c) * shade + dry * 14);
          image.data[r4 + 2] = byte((soilB + (mossB - soilB) * c) * shade + dry * 8);
          image.data[r4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
    [18, 18]
  );
  map.anisotropy = 8;

  _moss = { map, normalMap, roughnessMap };
  return _moss;
}

/**
 * Moos/Wiese für die große Außenebene (`dojo-exterior-ground`).
 *
 * Bewusst **ohne** `needsEnv`: Moos hat keine nennenswerte Spiegelung, und die
 * IBL ist der teuerste Posten der ganzen Szene (quality.js:6). Die
 * Rauheitskarte darf bleiben – quality.js tauscht sie in XR selbst gegen einen
 * Skalar, weil der Mesh-Name in LARGE_SURFACES steht.
 */
export function mossMaterial() {
  const maps = mossMaps();
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1, // wird von der Karte moduliert
    metalness: 0,
    normalScale: new THREE.Vector2(0.85, 0.85),
  });
}

// --- Geharkter Kies ----------------------------------------------------------
//
// Die Harkrillen gehören in die **Normal-Map**. Das ist der ganze Punkt: Beim
// Karesansui besteht die Fläche aus nichts als Licht und Schatten in parallelen
// Rillen; malt man sie als dunkle Linien auf, bleiben sie aus jedem Winkel
// gleich und die Fläche liest sich als Tapete. Die Ringe um die Steine stehen
// deshalb ebenfalls im Höhenfeld, nicht nur in der Farbe.
//
// Die Kachel wird wie bisher **einmal in Weltkoordinaten** gezeichnet und nicht
// wiederholt (`repeat` bleibt 1) – die Ringe müssen ja über den Steinen liegen.
// Deshalb ist Nahtlosigkeit hier keine Anforderung.
//
// **Kosten.** Das Höhenfeld entsteht mit Canvas-Strichen und wird einmal
// zurückgelesen. Der naive Weg – pro Pixel über alle Steine laufen – wären bei
// 512² und zwölf Steinen 3,1 Mio. Abstandstests; genau diese Bauart hat in
// environments.js einmal eine halbe Sekunde Startzeit gekostet.
const GRAVEL_SIZE = 512;
const RIDGE_M = 0.115; // Weltabstand der Harkrillen in Metern
const GROOVE_M = 0.045; // Rillenbreite

let _gravel = null;
let _gravelKey = '';

/**
 * @param {Array<{x:number, z:number, scale:number[]}>} stones Trittsteine in
 *        Weltkoordinaten – dieselbe Liste, die `gravelTexture(stones, G)` bekam.
 * @param {{z0:number, z1:number, halfX:number}} gardenBounds `EXTERIOR.garden`
 */
export function gravelMaps(stones, gardenBounds) {
  const G = gardenBounds;
  const key = `${G.halfX}|${G.z0}|${G.z1}|${stones.length}|${stones[0]?.x ?? 0}`;
  if (_gravel && _gravelKey === key) return _gravel;

  const size = GRAVEL_SIZE;
  const w = G.halfX * 2;
  const d = G.z1 - G.z0;
  // Dieselbe Welt→Textur-Abbildung wie in `gravelTexture`, damit die Ringe
  // weiterhin über den Steinen liegen. Die Kachel ist quadratisch, das Beet
  // nicht – u und v haben also unterschiedliche Maßstäbe, und jede Länge muss
  // in der jeweils richtigen Achse umgerechnet werden.
  const pxU = size / w; // Pixel je Meter in u
  const pxV = size / d; // Pixel je Meter in v
  const toU = (x) => (x + G.halfX) * pxU;
  const toV = (z) => (z - G.z0) * pxV;

  // --- Höhenfeld zeichnen ----------------------------------------------------
  const hc = document.createElement('canvas');
  hc.width = hc.height = size;
  const hx = hc.getContext('2d');
  hx.fillStyle = '#a0a0a0'; // Kammhöhe zwischen den Rillen
  hx.fillRect(0, 0, size, size);
  hx.lineCap = 'round';
  hx.strokeStyle = '#2c2c2c'; // Rillengrund

  // Ringe um jeden Stein, von innen nach außen ausklingend. Als Weltkreise
  // gerechnet (ru/rv getrennt) – im Texturraum sind das Ellipsen, auf dem Boden
  // Kreise. Der alte Code nahm für beide Halbachsen denselben u-Maßstab, was
  // die Ringe auf dem Boden um Faktor 2,7 in z gezogen hat.
  const ringsOf = (st) => Math.max(st.scale[0], st.scale[2]) * 0.55;
  for (const st of stones) {
    const cu = toU(st.x);
    const cv = toV(st.z);
    const r0 = ringsOf(st);
    for (let k = 0; k < 5; k++) {
      const rad = r0 * (1.25 + k * 0.42);
      // Nach außen flacher auslaufend: die äußeren Ringe sind nur noch
      // angedeutet, sonst sieht die Fläche aus wie eine Zielscheibe.
      const depth = Math.round(44 + k * 26);
      hx.strokeStyle = `rgb(${depth},${depth},${depth})`;
      hx.lineWidth = GROOVE_M * pxV;
      hx.beginPath();
      hx.ellipse(cu, cv, rad * pxU, rad * pxV, 0, 0, Math.PI * 2);
      hx.stroke();
    }
  }

  // Parallele Bahnen dazwischen, unterbrochen wo ein Ring liegt. Die Prüfung
  // läuft über die Stützpunkte der Linie (34 Bahnen × 128 Punkte), nicht über
  // die Pixel.
  const gap = RIDGE_M * pxV;
  hx.lineWidth = GROOVE_M * pxV;
  hx.strokeStyle = 'rgb(58,58,58)';
  for (let v = gap * 0.5; v < size; v += gap) {
    hx.beginPath();
    let drawing = false;
    for (let u = 0; u <= size; u += 4) {
      // Leichter Schwung in der Bahn – eine mit der Hand gezogene Rille ist
      // nicht schnurgerade, und der Unterschied ist genau das, was sie von
      // Wellblech trennt.
      const yy = v + Math.sin((u / size) * Math.PI * 3) * 3;
      let blocked = false;
      for (const st of stones) {
        const du = (u - toU(st.x)) / pxU;
        const dv = (yy - toV(st.z)) / pxV;
        const rad = ringsOf(st) * 3.6;
        if (du * du + dv * dv < rad * rad) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        hx.moveTo(u, yy);
        drawing = true;
      } else hx.lineTo(u, yy);
    }
    hx.stroke();
  }

  const drawn = hx.getImageData(0, 0, size, size).data;
  let groove = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) groove[i] = drawn[i * 4] / 255;
  // Weichzeichnen, damit der Sobel eine **Flanke** findet statt einer Stufe.
  // Ohne das steht in der Normal-Map ein harter Grat und die Rille wirft
  // keinen Schatten, sondern zeigt einen schwarzen Strich.
  groove = boxBlur(groove, size, 2);

  const { normalMap, field } = heightToMaps({
    size,
    repeat: [1, 1],
    // Kräftig: die Rille ist das ganze Motiv. 2 cm tief bei 11 cm Abstand ist
    // realistisch geharkt, und bei einer Sonne auf 20° Höhe legt das einen
    // sichtbaren Schatten in jede Rille.
    strength: 3.4,
    height: (x, y) => {
      const g = groove[y * size + x];
      // Kieskörner obendrauf, ~4 px Zelle. Weißes Rauschen pro Pixel wäre bei
      // dieser Fläche nur Flimmern.
      const pebble = pfbm((x / size) * 128, (y / size) * 128, 128, 2, 313);
      return g * 0.82 + pebble * 0.18;
    },
    anisotropy: 8,
  });

  const map = colorTexture(size, (ctx, s) => {
    const image = ctx.createImageData(s, s);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;
        const h = field[i];
        // Zwei Beiträge: die Rille bekommt eine Verschattung (der Rillengrund
        // sieht weniger Himmel), das einzelne Korn seine eigene Helligkeit.
        const shade = 0.62 + h * 0.62;
        const grit = grainAt(x, y, 151) * 0.16 + 0.92;
        const r4 = i * 4;
        image.data[r4] = byte(122 * shade * grit);
        image.data[r4 + 1] = byte(117 * shade * grit);
        image.data[r4 + 2] = byte(105 * shade * grit);
        image.data[r4 + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  });

  // Nicht gekachelt: eine Kachel deckt das ganze Beet. ClampToEdge statt
  // Repeat, damit an den Beeträndern nichts von der Gegenseite hereinblutet.
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1, 1);
    t.anisotropy = 8;
  }

  _gravel = { map, normalMap };
  _gravelKey = key;
  return _gravel;
}

/**
 * Geharkter Kies. Signatur wie das bisherige `gravelTexture(stones, G)`.
 *
 * Keine Rauheitskarte: Die Streuung zwischen Rillengrund und Kamm ist auf
 * trockenem Kies klein, und `dojo-garden-kies` steht **nicht** in
 * LARGE_SURFACES – die Karte bliebe also auch in der Brille aktiv und würde
 * dort eine Abtastung pro Pixel kosten, für die es kaum etwas zu sehen gibt.
 */
export function gravelMaterial(stones, gardenBounds) {
  const maps = gravelMaps(stones, gardenBounds);
  return new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughness: 0.93,
    metalness: 0,
    normalScale: new THREE.Vector2(1, 1),
  });
}

// --- Wasserspiegel im Tsukubai ----------------------------------------------
//
// Zwei Kräuselungslagen, die **gegeneinander** wandern. Eine einzelne Lage mit
// laufendem Versatz sieht aus wie eine Textur, die verschoben wird – man liest
// sofort die gleichförmige Drift. Erst zwei Lagen in unterschiedlicher
// Richtung, unterschiedlichem Tempo und unterschiedlicher Frequenz erzeugen
// das Muster, das entsteht und wieder vergeht, statt zu wandern.
//
// Umgesetzt ohne eigenen Shader: `MeshPhysicalMaterial` hat mit
// `clearcoatNormalMap` bereits eine zweite, unabhängig transformierbare
// Normal-Map. Der Klarlack ist hier genau die richtige Metapher – ein
// Wasserfilm ist eine glatte Spiegelschicht über einem dunklen Grund.
//
// Zwei 128er-Karten statt einer 256er: Für die Interferenz braucht es zwei
// **verschiedene** Felder, und zwei kleine sind zusammen billiger als eine
// große.
const RIPPLE_SIZE = 128;

function rippleMap(seed, waves, cells, strength) {
  const { normalMap } = heightToMaps({
    size: RIPPLE_SIZE,
    strength,
    height: (x, y) => {
      const u = x / RIPPLE_SIZE;
      const v = y / RIPPLE_SIZE;
      // Ganzzahlige Wellenzahlen – sonst bricht die Welle an der Kachelgrenze
      // ab, und bei laufendem Versatz zöge die Naht sichtbar über die Fläche.
      let s = 0;
      for (const [fu, fv, a] of waves) {
        s += Math.sin((u * fu + v * fv) * Math.PI * 2) * a;
      }
      // Etwas Unordnung, damit es nicht nach Wellblech aussieht.
      return 0.5 + s * 0.5 + (pfbm(u * cells, v * cells, cells, 3, seed) - 0.5) * 0.5;
    },
  });
  return normalMap;
}

let _ripples = null;
function rippleMaps() {
  if (_ripples) return _ripples;
  _ripples = {
    a: rippleMap(17, [[3, 1, 0.5], [1, -2, 0.34]], 6, 1.1),
    b: rippleMap(83, [[-2, 3, 0.42], [4, 2, 0.26]], 9, 0.9),
  };
  return _ripples;
}

/**
 * Wasserspiegel im Steinbecken.
 *
 * `material.userData.setTime(t)` bzw. `updateWater(material, t)` je Bild
 * aufrufen – ohne das steht die Kräuselung still.
 */
export function waterMaterial({ repeat = 2.5 } = {}) {
  const { a, b } = rippleMaps();
  // Eigene Texturinstanzen je Material, weil Versatz und Wiederholung pro
  // Instanz liegen. Ein Klon teilt sich `image`, three legt aber trotzdem eine
  // eigene GPU-Ladung an – bei 128² ist das 64 KB und damit vertretbar.
  const n1 = a.clone();
  const n2 = b.clone();
  n1.needsUpdate = n2.needsUpdate = true;
  n1.repeat.set(repeat, repeat);
  n2.repeat.set(repeat * 0.68, repeat * 0.68);

  const material = new THREE.MeshPhysicalMaterial({
    // Wasser über dunklem Stein: Was man sieht, ist fast ausschließlich die
    // Spiegelung. Der Grundton muss deshalb sehr dunkel sein, sonst
    // überstrahlt die diffuse Komponente das Spiegelbild und der Spiegel wird
    // zu grauer Farbe.
    color: 0x0a1416,
    roughness: 0.05,
    metalness: 0,
    normalMap: n1,
    normalScale: new THREE.Vector2(0.3, 0.3),
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    clearcoatNormalMap: n2,
    clearcoatNormalScale: new THREE.Vector2(0.22, 0.22),
    envMapIntensity: 1.5,
  });
  // Ohne Environment-Map hat ein Spiegel nichts zu spiegeln und das Becken
  // rendert als schwarze Scheibe. quality.js weist sie den markierten
  // Materialien in XR einzeln zu.
  material.userData.needsEnv = true;
  material.userData.setTime = (t) => updateWater(material, t);
  return material;
}

/**
 * Die Kräuselung weiterdrehen. Gegenläufig und mit unterschiedlichem Tempo –
 * gleichläufig wäre es eine starre Verschiebung ohne Interferenz.
 */
export function updateWater(material, time) {
  const n1 = material.normalMap;
  const n2 = material.clearcoatNormalMap;
  if (n1) n1.offset.set(time * 0.014, time * 0.023);
  if (n2) n2.offset.set(-time * 0.019, time * 0.008);
}

// --- Nasser Stein am Becken --------------------------------------------------
//
// Nass ist nicht „dunkler eingefärbt". Ein Wasserfilm füllt die Mikrorauheit
// auf: Die Oberfläche wird glatt (spiegelt) und gleichzeitig dunkel (was in
// die Poren fällt, kommt kaum wieder heraus). Beides zusammen ergibt den
// Eindruck; eines allein sieht aus wie ein anderer Stein.
let _wetStone = null;
export function wetStoneMaps() {
  if (_wetStone) return _wetStone;
  const size = 256;
  const { normalMap, roughnessMap } = heightToMaps({
    size,
    strength: 1.4,
    height: (x, y) =>
      pfbm((x / size) * 10, (y / size) * 10, 10, 4, 511) * 0.75 + grainAt(x, y, 29) * 0.25,
    // Die Nässe liegt in Schlieren, nicht gleichmäßig: dort wo der Film steht,
    // ist die Rauheit sehr niedrig, an den abtrocknenden Rändern steigt sie.
    roughness: (h, x, y) => {
      const film = pfbm((x / size) * 4, (y / size) * 4, 4, 3, 733);
      return 28 + smoothstep(0.42, 0.75, film) * 150 + h * 30;
    },
  });
  _wetStone = { normalMap, roughnessMap };
  return _wetStone;
}

/**
 * Material für ein **eigenes** Netz aus den Steinen direkt am Becken
 * (Beckenkörper, Vorlegestein). Braucht UVs.
 *
 * Achtung, das ist die Einschränkung: Die Gartenkörper werden in exterior.js zu
 * **einem** Netz mit Vertexfarben verschmolzen und ihre UVs dabei gelöscht
 * (`g.deleteAttribute('uv')`). Dieses Material lässt sich also nur verwenden,
 * wenn der Beckenkörper aus der Verschmelzung herausgenommen wird – das ist
 * eine Änderung in exterior.js und gehört nicht mir. Für den Zustand *ohne*
 * diese Änderung gibt es `wetStoneOverlay()` weiter unten, das nur die
 * Verdunkelung liefert.
 */
export function wetStoneMaterial({ color = 0x33302a } = {}) {
  const maps = wetStoneMaps();
  const material = new THREE.MeshStandardMaterial({
    color,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1, // von der Karte moduliert
    metalness: 0,
    // Der Wasserfilm glättet die Mikrorauheit – die Struktur bleibt sichtbar,
    // aber flacher als am trockenen Stein.
    normalScale: new THREE.Vector2(0.45, 0.45),
    envMapIntensity: 1.2,
  });
  material.userData.needsEnv = true;
  return material;
}

/**
 * Verdunkelt die Vertexfarben eines bereits gebauten Netzes rund um das Becken.
 *
 * Greift auf `dojo-garden-stein`, also das verschmolzene Netz mit
 * Vertexfarben, ohne dass dort etwas umgebaut werden muss. Liefert nur die
 * Hälfte des Effekts – dunkler ja, glänzender nein, weil das Netz ein
 * `MeshLambertMaterial` ohne UVs trägt und ein Materialtausch die **ganze**
 * Gartenmasse glänzend machen würde. Für den vollen Effekt siehe
 * `wetStoneMaterial()`.
 *
 * @returns {number} Zahl der veränderten Vertices – null heißt: falsches Netz,
 *          falscher Mittelpunkt oder falscher Radius.
 */
export function wetStoneOverlay(
  mesh,
  { center = [0, 0], radius = 0.62, waterY = 0, rise = 0.26, strength = 0.55 } = {}
) {
  const geometry = mesh?.geometry ?? mesh;
  const pos = geometry?.attributes?.position;
  const col = geometry?.attributes?.color;
  if (!pos || !col) return 0;
  const [cx, cz] = center;
  let touched = 0;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx;
    const dz = pos.getZ(i) - cz;
    const dist = Math.hypot(dx, dz);
    if (dist > radius) continue;
    // Innen voll nass, zum Rand hin auslaufend …
    const near = 1 - smoothstep(radius * 0.5, radius, dist);
    // … und nach oben abtrocknend: Der Wasserstand steht am Beckenrand, der
    // Sockel darunter bleibt feucht, alles darüber wird schnell trocken.
    const wet = 1 - smoothstep(waterY, waterY + rise, pos.getY(i));
    const w = near * wet * strength;
    if (w <= 0.002) continue;
    touched++;
    // Nasser Stein verliert Helligkeit und wird dabei etwas kühler – der
    // Rotanteil sinkt stärker als der Blauanteil.
    col.setXYZ(
      i,
      col.getX(i) * (1 - w),
      col.getY(i) * (1 - w * 0.94),
      col.getZ(i) * (1 - w * 0.86)
    );
  }
  if (touched) col.needsUpdate = true;
  return touched;
}

// Alle Karten einmal anfassen, damit die Kosten an einer bekannten Stelle
// anfallen und messbar sind. Der Kies braucht die Steinliste und wird deshalb
// nur gewärmt, wenn sie mitkommt.
export function warmUpGround(stones = null, gardenBounds = null) {
  mossMaps();
  rippleMaps();
  wetStoneMaps();
  if (stones && gardenBounds) gravelMaps(stones, gardenBounds);
}

// --- Separables Kastenfilter, umlaufend --------------------------------------
//
// Nur für das Kies-Höhenfeld. Zwei Durchgänge à O(n) statt eines Faltkerns:
// bei 512² und Radius 2 sind das rund 0,5 Mio. Additionen, nicht 6,5 Mio.
function boxBlur(src, size, radius) {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const n = radius * 2 + 1;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[row + ((x + k + size) % size)];
      tmp[row + x] = s / n;
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[((y + k + size) % size) * size + x];
      out[y * size + x] = s / n;
    }
  }
  return out;
}

// --- Rückfallkopie aus materials.js ------------------------------------------
//
// Wird nur benutzt, solange materials.js `heightToMaps`, `pfbm`, `grainAt` und
// `colorTexture` nicht exportiert. Identisches Verhalten – insbesondere die
// **Periodizität** des Rauschens, ohne die eine achtzehnfach gekachelte
// Bodenfläche ein Nahtgitter zeigt (die Begründung steht ausführlich in
// materials.js:30). Sobald die Exporte da sind, kann alles ab hier weg.
const FALLBACK_PERM = (() => {
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

function fallbackHash2(xi, yi, seed) {
  return FALLBACK_PERM[(FALLBACK_PERM[(xi + seed) & 255] + yi) & 255] / 255;
}

function fallbackGrainAt(x, y, seed) {
  return fallbackHash2(x & 255, y & 255, seed);
}

function fallbackPvalue(u, v, period, seed) {
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
  const a = fallbackHash2(x0, y0, seed);
  const b = fallbackHash2(x1, y0, seed);
  const c = fallbackHash2(x0, y1, seed);
  const dd = fallbackHash2(x1, y1, seed);
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + dd * sx * sy;
}

function fallbackPfbm(u, v, period, octaves = 4, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += fallbackPvalue(u * freq, v * freq, period * freq, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function fallbackHeightToMaps({
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

function fallbackColorTexture(size, draw, repeat = [1, 1]) {
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
