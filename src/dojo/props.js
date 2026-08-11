import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ROOM,
  RACK,
  MAKIWARA,
  TOKONOMA,
  WALL,
  FREE_RADIUS,
  insideFreeZone,
  sunDirection,
} from './layout.js';
import {
  steelMaterial,
  ironMaterial,
  lacquerMaterial,
  hinokiMaterial,
  ropeMaterial,
  washiMaterial,
  washiTexture,
  scaleUV,
} from './materials.js';
import { leafAtlas, cardCluster, foliageMaterial, applyFoliageMaterial } from './foliage.js';

// Deterministischer Zufall, damit das Gesteck bei jedem Laden dasselbe ist.
// Ein Ikebana, das sich bei jedem Start neu ordnet, ist kein Ikebana.
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Die Requisiten des Dojos: Waffenständer mit Katana, Makiwara, Kakemono,
// Zabuton, Weihrauchbrenner, Bokken.
//
// Diese Datei baut die Dinge, die den Raum *bewohnt* aussehen lassen. Die
// Architektur liefert den Kasten, die Atmosphäre das Licht – aber ob man einem
// Dojo glaubt, entscheidet sich an einer einzigen Frage: Sieht die Klinge aus
// wie eine Klinge? Deshalb steckt der Großteil der Geometrie hier in drei
// Katana und nicht in Möbeln.
//
// --- Drei Entwurfsentscheidungen, die den Rest erklären ----------------------
//
// **1. Alles hängt an einem gemeinsamen Klingenrückgrat.** Klinge, Habaki,
// Tsuba, Tsuka, Ito-Wicklung und Saya werden nicht einzeln modelliert und
// hinterher zusammengeschoben, sondern alle entlang *derselben* Kreisbogen-
// Funktion `spineAt()` aufgebaut. Der naive Weg – jedes Teil für sich, per Auge
// positioniert – bricht genau dort, wo es auffällt: Die Saya passt dann nicht
// zur Krümmung der Klinge, der Tsuka knickt am Tsuba ab. Ein Schwert ist ein
// **durchgehender Bogen**, und das muss die Datenstruktur abbilden.
//
// **2. Zusammengefasst wird nach Material, nicht nach Objekt.** Das Budget sind
// 30 Zeichenaufrufe (layout.js:127) – und jedes schattenwerfende Mesh zählt
// doppelt, weil die Shadow-Map ein zweiter Durchgang über dieselben Objekte
// ist. Ein Ständer aus dreizehn Einzelteilen wäre allein schon 26 Aufrufe.
// Deshalb sammeln alle Bauteile ihre Geometrie in nach Material geordnete
// Eimer und werden am Ende einmal zusammengeführt.
//
// **3. Farbunterschiede innerhalb eines Materials laufen über Vertexfarben.**
// Messing-Habaki, Eisen-Tsuba und Bronze-Weihrauchbrenner sind physikalisch
// dasselbe Material (Metall, rau, Normal-Map aus `steelMaps`), aber drei
// Farben. Drei Materialinstanzen wären drei Zeichenaufrufe; ein
// Farb-Attribut pro Vertex ist gratis. Nebeneffekt: Dieselbe Mechanik trägt
// das gebackene Kontakt-AO an den Bodenanschlüssen.

// --- Kleine Helfer, aus environments.js übernommen ---------------------------
//
// Bewusst kopiert statt importiert: environments.js exportiert sie nicht, und
// die Datei zu ändern ist nicht Teil dieser Aufgabe.

// Gefälschter Kontaktschatten. Original: environments.js:86-120.
let _shadowTexture = null;
function shadowTexture() {
  if (_shadowTexture) return _shadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.24)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _shadowTexture = new THREE.CanvasTexture(canvas);
  _shadowTexture.colorSpace = THREE.SRGBColorSpace;
  return _shadowTexture;
}

// Abgerundeter Quader. Original: environments.js:1929-1964, inklusive der
// Korrektur des Extrusions-Mittelpunkts (die Fase verschiebt ihn um `b`).
function roundedBox(width, height, depth, radius = 0.03, bevel = null) {
  const b = Math.min(bevel ?? radius * 0.6, depth / 2 - 0.001, radius);
  const r = Math.min(radius, width / 2 - 0.001, height / 2 - 0.001);
  const w = width / 2 - b;
  const h = height / 2 - b;
  const rr = Math.max(0.001, r - b);

  const shape = new THREE.Shape();
  shape.moveTo(-w + rr, -h);
  shape.lineTo(w - rr, -h);
  shape.quadraticCurveTo(w, -h, w, -h + rr);
  shape.lineTo(w, h - rr);
  shape.quadraticCurveTo(w, h, w - rr, h);
  shape.lineTo(-w + rr, h);
  shape.quadraticCurveTo(-w, h, -w, h - rr);
  shape.lineTo(-w, -h + rr);
  shape.quadraticCurveTo(-w, -h, -w + rr, -h);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - b * 2,
    bevelEnabled: true,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 4,
    steps: 1,
  });
  geometry.translate(0, 0, b - depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// --- Loft: 2D-Querschnitte entlang einer Kurve ------------------------------
//
// Das Arbeitspferd dieser Datei. Klinge, Saya, Tsuka, Ständerposten, Makiwara
// und Bokken sind alle dasselbe: eine Kontur, die sich entlang eines Weges
// verändert. `LatheGeometry` kann das nicht (nur Rotation um eine Achse),
// `TubeGeometry` auch nicht (nur ein *kreisrunder* Querschnitt konstanter
// Größe) – und genau Verjüngung und nicht-runder Querschnitt sind das, was eine
// Klinge von einem Stab unterscheidet.
//
// `rings` ist eine Liste gleich langer Punktlisten (Weltkoordinaten), `vs` die
// V-Texturkoordinate je Ring.
//
// `flat` steuert die Normalenberechnung und ist bei der Klinge der wichtigste
// Schalter der ganzen Datei: Mit gemittelten Normalen verschmieren Shinogi-Grat
// und Yokote zu einer weichen Wölbung und das Schwert liest sich als
// Buttermesser. Nicht-indiziert berechnet three eine Normale pro Dreieck – die
// Grate bleiben messerscharf, und längs der Klinge sind die Facettenwinkel bei
// 50 Ringen so klein, dass man sie nicht sieht.
function loft(rings, vs, opts = {}) {
  const {
    closed = true,
    flat = false,
    capStart = false,
    capEnd = false,
    swapUV = false,
    vScale = 1,
  } = opts;
  const M = rings[0].length;
  const N = rings.length;
  const cols = closed ? M + 1 : M; // Nahtspalte doppelt, damit U sauber bis 1 läuft

  // U aus der Bogenlänge des ersten Rings – bei einer stark asymmetrischen
  // Kontur (Klinge: lange Flanke, kurzer Mune) ist eine gleichmäßige Verteilung
  // über den Index falsch, die Textur würde an der Schneide gestaucht.
  const us = [0];
  let per = 0;
  for (let j = 1; j < M; j++) {
    per += rings[0][j].distanceTo(rings[0][j - 1]);
    us.push(per);
  }
  if (closed) {
    per += rings[0][0].distanceTo(rings[0][M - 1]);
    us.push(per);
  }
  for (let j = 0; j < us.length; j++) us[j] /= per || 1;

  const pos = new Float32Array(N * cols * 3);
  const uv = new Float32Array(N * cols * 2);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < cols; j++) {
      const p = rings[i][j % M];
      const k = (i * cols + j) * 3;
      pos[k] = p.x;
      pos[k + 1] = p.y;
      pos[k + 2] = p.z;
      const t = (i * cols + j) * 2;
      const u = us[j];
      const v = vs[i] * vScale;
      uv[t] = swapUV ? v : u;
      uv[t + 1] = swapUV ? u : v;
    }
  }

  const index = [];
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);

  // Deckel als Fächer um den Ringschwerpunkt. Nötig, weil ein offenes Loft von
  // innen sichtbar ist – bei der Saya-Spitze (Kojiri) fällt das sofort auf.
  const caps = [];
  const cap = (ring, flip) => {
    const c = new THREE.Vector3();
    for (const p of ring) c.add(p);
    c.multiplyScalar(1 / ring.length);
    const cp = [];
    const cuv = [];
    for (let j = 0; j < M; j++) {
      const a = ring[j];
      const b = ring[(j + 1) % M];
      if (flip) cp.push(c, b, a);
      else cp.push(c, a, b);
      cuv.push(0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    }
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(cp.length * 3);
    cp.forEach((p, i) => {
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    });
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cuv), 2));
    caps.push(g);
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[N - 1], false);

  if (flat) geometry = geometry.toNonIndexed();
  if (caps.length) {
    geometry = mergeGeometries([geometry.index ? geometry.toNonIndexed() : geometry, ...caps]);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// --- Materialeimer -----------------------------------------------------------
//
// `mergeGeometries` verlangt in allen Teilen **denselben** Attributsatz. Statt
// jedes Mal zu prüfen, welcher Eimer Vertexfarben braucht, bekommen alle
// welche – ein Float3 pro Vertex bei rund 30 000 Vertices ist billiger als eine
// zweite Materialinstanz, und die Einheitlichkeit spart die ganze Klasse von
// Fehlern, bei denen ein Teil ohne `color` das Merge fehlschlagen lässt.
function makeBucket(material) {
  material.vertexColors = true;
  return { material, geos: [] };
}

// Vertexfarbe setzen; `shade(x,y,z)` moduliert sie (gebackenes AO).
function tint(geometry, hex, shade = null) {
  const c = new THREE.Color(hex);
  const p = geometry.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const f = shade ? shade(p.getX(i), p.getY(i), p.getZ(i)) : 1;
    colors[i * 3] = c.r * f;
    colors[i * 3 + 1] = c.g * f;
    colors[i * 3 + 2] = c.b * f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Kontaktverdunkelung am Boden. Der Übergang Objekt→Boden ist die Stelle, an
// der prozedurale Szenen typischerweise „schweben" – der Blob-Schatten allein
// verdunkelt den Boden, nicht das Objekt.
const contactAO =
  (h = 0.16, floor = 0) =>
  (x, y) =>
    0.52 + 0.48 * Math.min(1, Math.max(0, (y - floor) / h));

// --- Klingen-Rückgrat --------------------------------------------------------
//
// Ein Katana ist ein Kreisbogen. `sori` (Krümmungstiefe) und `nagasa`
// (Klingenlänge, als Sehne gemessen) bestimmen den Radius:
//   R = c²/(8s) + s/2   – Sehne c, Stichhöhe s.
//
// **Krümmungsrichtung.** Der Mittelpunkt des Bogens liegt auf der Mune-Seite
// (Rücken), die Schneide ist also die *äußere*, konvexe Kurve – dieselbe
// Geometrie wie bei jedem anderen einschneidigen Krummschwert. Auf dem Ständer
// liegend (Schneide oben) wölbt sich das Schwert dadurch in der Mitte nach
// oben. Die Gegenrichtung (`uchizori`) gibt es, aber nur bei manchen Tanto.
//
// Lokales System: Klinge läuft nach +Y, Mune-Richtung +X, Dicke ±Z. Der
// Ursprung ist das Machi (Übergang Klinge→Angel), s ist die Bogenlänge ab dort;
// negatives s liegt im Griff, der die Krümmung nahtlos fortsetzt.
function spineAt(R, s) {
  const a = s / R;
  return {
    p: new THREE.Vector3(R * (1 - Math.cos(a)), R * Math.sin(a), 0),
    n: new THREE.Vector3(Math.cos(a), -Math.sin(a), 0), // quer, Richtung Mune
  };
}

// Punkt im Querschnitt: `across` ab der Schneide Richtung Mune, `thick` seitlich.
function sectionPoint(R, s, across, thick) {
  const { p, n } = spineAt(R, s);
  return new THREE.Vector3(p.x + n.x * across, p.y + n.y * across, thick);
}

// --- Katana ------------------------------------------------------------------

const KATANA = {
  nagasa: 0.7, // Klingenlänge (Sehne) – Vorgabe der Aufgabe
  sori: 0.019, // Krümmung, typisch 2–3 % der Länge
  tsuka: 0.265, // Grifflänge
  wMachi: 0.0315, // Klingenbreite am Griffansatz
  wYokote: 0.0225, // Breite an der Kissaki-Grenze
  hMachi: 0.0036, // halbe Klingendicke (Kasane/2)
  hYokote: 0.0024,
  kissaki: 0.032, // Länge der Spitze
};
const KATANA_R = (KATANA.nagasa * KATANA.nagasa) / (8 * KATANA.sori) + KATANA.sori / 2;

// Querschnitt der Klinge (Shinogi-Zukuri), beginnend an der **Schneide**.
//
// Der Startpunkt ist kein Zufall: `steelMaps()` legt den Hamon über U
// (materials.js:443) und ist an beiden U-Enden matt. Beginnt der Ring an der
// Schneide, landen U=0 und U=1 dort – der matte Streifen liegt also auf beiden
// Flanken entlang der Schneide, genau wo die gehärtete Zone sitzt.
function bladeSection(w, h) {
  return [
    [0, 0], // Ha – Schneide
    [0.7 * w, h], // Shinogi – dickste Linie
    [0.93 * w, 0.86 * h], // Mune-Schulter
    [w, 0], // Iori-Mune – Dachgrat des Rückens
    [0.93 * w, -0.86 * h],
    [0.7 * w, -h],
  ];
}

function buildBlade() {
  const { nagasa, wMachi, wYokote, hMachi, hYokote, kissaki } = KATANA;
  const R = KATANA_R;
  const yokote = nagasa - kissaki;
  const rings = [];
  const vs = [];
  const N = 54;
  for (let i = 0; i < N; i++) {
    const s = (i / (N - 1)) * nagasa;
    let w;
    let h;
    let base; // Verschiebung der Schneidenlinie – erzeugt die Fukura der Spitze
    if (s <= yokote) {
      const k = s / yokote;
      w = wMachi + (wYokote - wMachi) * k;
      h = hMachi + (hYokote - hMachi) * k;
      base = 0;
    } else {
      // Kissaki: Die Schneide schwingt zum Rücken hoch, die Breite läuft aus.
      const k = (s - yokote) / kissaki;
      const e = Math.sin((1 - k) * Math.PI * 0.5); // 1 → 0, mit runder Fukura
      w = wYokote * Math.max(0.02, e);
      h = hYokote * Math.max(0.06, e * 0.92 + 0.08);
      base = wYokote * (1 - e) * 0.92;
    }
    rings.push(bladeSection(w, h).map(([a, b]) => sectionPoint(R, s, base + a, b)));
    vs.push(s / 0.25); // V längs, damit die Schmiedezüge nicht gestaucht werden
  }
  return loft(rings, vs, { flat: true, capEnd: true });
}

// Habaki: Klingenzwinge aus Messing, sitzt satt auf dem Klingenansatz.
function buildHabaki() {
  const R = KATANA_R;
  const rings = [];
  const vs = [];
  const N = 5;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const s = -0.004 + k * 0.036;
    // Leicht keilförmig: unten dicker, damit es sich in der Koiguchi verklemmt.
    const g = 1.7 - 0.35 * k;
    const w = KATANA.wMachi + 0.0012 * g;
    const h = KATANA.hMachi + 0.0016 * g;
    rings.push(bladeSection(w, h).map(([a, b]) => sectionPoint(R, s, a - 0.0006 * g, b)));
    vs.push(k);
  }
  return loft(rings, vs, { capStart: true, capEnd: true });
}

// Tsuba: Stichblatt. Mokko-Form (vierlappig) mit Nakago-Ana und einer
// Kozuka-Hitsu-Ana. Als 2D-Silhouette gezeichnet und extrudiert – dasselbe
// Verfahren wie `makeKoiFin` (environments.js:1435), nur mit Löchern und
// Tiefe, die eine reine `ShapeGeometry` nicht hat.
function buildTsuba() {
  const shape = new THREE.Shape();
  const SEG = 40;
  for (let i = 0; i <= SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    const r = 0.0375 * (1 + 0.055 * Math.cos(4 * a + Math.PI / 4));
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  // Nakago-Ana: der Angelschlitz, geformt wie der Klingenquerschnitt.
  const slot = new THREE.Path();
  const w = KATANA.wMachi + 0.0026;
  const h = KATANA.hMachi + 0.0022;
  bladeSection(w, h).forEach(([a, b], i) => {
    const x = a - w / 2;
    if (i === 0) slot.moveTo(x, b);
    else slot.lineTo(x, b);
  });
  slot.closePath();
  shape.holes.push(slot);
  // Kozuka-Hitsu-Ana – das kleine Beimesserloch. Reine Silhouettenarbeit, aber
  // es ist das Detail, an dem ein Tsuba aufhört, eine Unterlegscheibe zu sein.
  const hitsu = new THREE.Path();
  hitsu.moveTo(0.0135, -0.0045);
  hitsu.quadraticCurveTo(0.0225, -0.0055, 0.0235, 0);
  hitsu.quadraticCurveTo(0.0225, 0.0055, 0.0135, 0.0045);
  hitsu.quadraticCurveTo(0.0105, 0, 0.0135, -0.0045);
  shape.holes.push(hitsu);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.0032,
    bevelEnabled: true,
    bevelSize: 0.0009,
    bevelThickness: 0.0009,
    bevelSegments: 2,
    curveSegments: 3,
    steps: 1,
  });
  geometry.translate(0, 0, -0.0025);
  // Die Scheibe steht quer zur Klinge: Extrusionsachse Z → Klingenachse Y.
  geometry.rotateX(-Math.PI / 2);
  // Der Schlitz ist um w/2 zur Schneide versetzt gezeichnet, also zurückschieben.
  geometry.translate(KATANA.wMachi / 2, 0, 0);
  return geometry;
}

// Ovaler Griffquerschnitt (Tsuka). Nicht rund: Ein runder Griff verrät die
// Klingenlage nicht, und genau dafür ist der ovale Querschnitt da.
function tsukaSection(cx, rx, rz, n = 14) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, Math.sin(a) * rz]);
  }
  return pts;
}

// Samegawa-Kern des Griffs: Holz mit Rochenhaut überzogen, zwischen Fuchi und
// Kashira leicht bauchig (der Griff ist in der Mitte am schlanksten).
function buildTsukaCore() {
  const R = KATANA_R;
  const L = KATANA.tsuka;
  const rings = [];
  const vs = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const s = -0.008 - k * (L - 0.016);
    const waist = 1 - 0.09 * Math.sin(k * Math.PI); // Taille in der Mitte
    const taper = 1 - 0.07 * k;
    rings.push(
      tsukaSection(KATANA.wMachi / 2, 0.0185 * waist * taper, 0.0128 * waist * taper).map(
        ([a, b]) => sectionPoint(R, s, a, b)
      )
    );
    vs.push(k * 6);
  }
  return loft(rings, vs, { capStart: true, capEnd: true });
}

// Ito: die Rautenwicklung.
//
// Zwei flache Bänder laufen als gegenläufige Schrauben über den Griff und
// kreuzen sich auf Vorder- und Rückseite; dazwischen blitzt die Rochenhaut in
// Rauten durch. Der einfachere Weg – eine Textur mit Rautenmuster auf den
// zylindrischen Griff – wurde verworfen: Die Wicklung ist rund 3 mm dick, ihre
// Silhouette ist gezackt und sie wirft Schatten auf sich selbst. Genau das
// sieht man im VR-Nahbereich, und eine flache Textur sieht dort aus wie ein
// bedruckter Besenstiel.
//
// `over` moduliert den Radialversatz mit cos(2·Winkel): An den Kreuzungspunkten
// liegt Band A oben und Band B unten, dazwischen tauschen sie – das ist der
// Unterschied zwischen „geflochten" und „zwei Bänder, die sich durchdringen".
function buildItoWrap(dir, phase) {
  const R = KATANA_R;
  const L = KATANA.tsuka;
  const TURNS = 8.5;
  const SAMPLES = Math.round(TURNS * 22);
  const halfW = 0.0058;
  const rings = [];
  const vs = [];
  const prev = new THREE.Vector3();
  for (let i = 0; i <= SAMPLES; i++) {
    const k = i / SAMPLES;
    const s = -0.017 - k * (L - 0.036);
    const waist = 1 - 0.09 * Math.sin(k * Math.PI);
    const taper = 1 - 0.07 * k;
    const rx = 0.0185 * waist * taper;
    const rz = 0.0128 * waist * taper;
    const a = phase + dir * k * TURNS * Math.PI * 2;
    const over = 0.0016 * Math.cos(2 * a) * dir;
    const ox = Math.cos(a) * (rx + 0.0021 + over);
    const oz = Math.sin(a) * (rz + 0.0021 + over);
    const p = sectionPoint(R, s, KATANA.wMachi / 2 + ox, oz);

    // Tangente per Differenz, Flächennormale aus der Ellipsen-Ableitung – so
    // liegt das Band flach auf dem Griff statt schräg abzustehen.
    const t = i === 0 ? null : p.clone().sub(prev).normalize();
    prev.copy(p);
    if (!t) continue;
    const nrm = spineAt(R, s).n;
    const nx = (Math.cos(a) / rx) * 1;
    const nz = (Math.sin(a) / rz) * 1;
    const nlen = Math.hypot(nx, nz) || 1;
    const surf = new THREE.Vector3((nrm.x * nx) / nlen, (nrm.y * nx) / nlen, nz / nlen).normalize();
    const bi = new THREE.Vector3().crossVectors(t, surf).normalize().multiplyScalar(halfW);
    rings.push([p.clone().add(bi), p.clone().sub(bi)]);
    vs.push(k * TURNS * 3);
  }
  return loft(rings, vs, { closed: false, swapUV: true });
}

// Saya: die lackierte Scheide. Folgt demselben Bogen wie die Klinge, nur um die
// Wandstärke aufgeweitet und mit ovalem, zur Schneidenseite verjüngtem Profil.
function sayaSection(w, h) {
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // a = 0 zeigt zur Mune-Seite; zur Schneide hin wird das Profil schlanker.
    const pinch = 0.55 + 0.45 * ((Math.cos(a) + 1) / 2);
    pts.push([w / 2 + (Math.cos(a) * w) / 2, Math.sin(a) * h * pinch]);
  }
  return pts;
}

function buildSaya() {
  const R = KATANA_R;
  const rings = [];
  const vs = [];
  const N = 30;
  const L = KATANA.nagasa + 0.028;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const s = -0.004 + k * L;
    let scale = 1 - 0.1 * k;
    if (k < 0.035) scale *= 1.07; // Koiguchi – die verstärkte Mündung
    if (k > 0.985) scale *= 0.55; // Kojiri – die gerundete Spitze
    const w = (KATANA.wMachi + 0.008) * scale;
    const h = (KATANA.hMachi + 0.006) * scale;
    rings.push(sayaSection(w, h).map(([a, b]) => sectionPoint(R, s, a - 0.004 * scale, b)));
    vs.push(k * 8);
  }
  return loft(rings, vs, { capStart: true, capEnd: true });
}

// Unterseite des Schwertes, gemessen als Abstand vom Rückgrat (der
// Schneidenlinie) quer zur Klinge – also genau die Größe, die `sectionPoint()`
// als `across` erwartet.
//
// Auf dem Ständer zeigt die Schneide nach oben, das Schwert liegt folglich auf
// dem **Mune** auf. Und der ist nicht überall gleich weit von der Schneide
// entfernt: Die Klinge verjüngt sich von 31,5 mm am Machi auf 22,5 mm am
// Yokote. Wer ein Schwert „eine Klingenbreite über den Arm" legt, trifft
// deshalb höchstens *eine* der beiden Auflagen – die 9 mm Verjüngung sind ein
// Vielfaches des Spalts, den man noch als Berührung durchgehen lässt.
//
// Die beiden Funktionen spiegeln die Profile aus `buildBlade()` und
// `buildSaya()`; ändert sich dort die Kontur, müssen sie mit.
function bladeBack(s) {
  const { nagasa, wMachi, wYokote, kissaki } = KATANA;
  const yokote = nagasa - kissaki;
  if (s <= 0) return wMachi;
  if (s <= yokote) return wMachi + (wYokote - wMachi) * (s / yokote);
  const e = Math.sin((1 - (s - yokote) / kissaki) * Math.PI * 0.5);
  return wYokote * (Math.max(0.02, e) + (1 - e) * 0.92);
}

function sayaBack(s) {
  const L = KATANA.nagasa + 0.028;
  const k = Math.min(1, Math.max(0, (s + 0.004) / L));
  let scale = 1 - 0.1 * k;
  if (k < 0.035) scale *= 1.07; // Koiguchi, wie in buildSaya()
  return (KATANA.wMachi + 0.008) * scale - 0.004 * scale;
}

// Ein vollständiges Schwert in die Eimer legen.
//
// `matrix` setzt das lokale Schwertsystem in den Raum. Jedes Teil wird sofort
// transformiert – die Eimer sammeln ausschließlich Weltgeometrie, sonst müsste
// jedes Prop ein eigenes Mesh bleiben und das Zeichenbudget wäre weg.
function addKatana(B, matrix, { sheathed = false, itoColor = 0x211d26 } = {}) {
  const put = (bucket, geo, hex) => {
    geo.applyMatrix4(matrix);
    B[bucket].geos.push(tint(geo, hex));
  };

  if (!sheathed) {
    put('steel', buildBlade(), 0xd7dde2);
    put('metal', buildHabaki(), 0xb08d4a); // Messing
  } else {
    put('lacquer', buildSaya(), 0x120d0c);
    // Kurikata mit Sageo-Schlaufe: der Knebel, an dem die Schnur sitzt.
    const kuri = roundedBox(0.017, 0.012, 0.03, 0.004);
    kuri.rotateY(Math.PI / 2);
    const kp = sectionPoint(KATANA_R, 0.175, KATANA.wMachi / 2, 0.0135);
    kuri.translate(kp.x, kp.y, kp.z);
    put('lacquer', kuri, 0x1a1412);
  }

  put('metal', buildTsuba(), 0x3a3d42);
  put('core', buildTsukaCore(), 0xe3dccb); // Rochenhaut
  put('fibre', buildItoWrap(1, 0), itoColor);
  put('fibre', buildItoWrap(-1, Math.PI * 0.5), itoColor);

  // Fuchi (Zwinge am Tsuba-Ende) und Kashira (Knauf) schließen den Griff ab.
  const collar = (s, len, scale, hex) => {
    const R = KATANA_R;
    const rings = [];
    const vs = [];
    for (let i = 0; i < 3; i++) {
      const k = i / 2;
      const waist = 1 - 0.09 * Math.sin(Math.abs(s / KATANA.tsuka) * Math.PI);
      const r = scale * waist;
      rings.push(
        tsukaSection(KATANA.wMachi / 2, 0.0193 * r, 0.0136 * r).map(([a, b]) =>
          sectionPoint(R, s - k * len, a, b)
        )
      );
      vs.push(k);
    }
    put('metal', loft(rings, vs, { capStart: true, capEnd: true }), hex);
  };
  collar(-0.006, 0.016, 1.0, 0x3a3d42); // Fuchi
  collar(-KATANA.tsuka + 0.017, 0.017, 0.98, 0x3a3d42); // Kashira

  // Menuki: die kleinen Zierstücke unter der Wicklung. Zwei Beulen, mehr sieht
  // man auf einem Meter Abstand ohnehin nicht – aber ohne sie ist der Griff
  // eine Kachel und mit ihnen ein Griff.
  for (const side of [-1, 1]) {
    const g = new THREE.SphereGeometry(0.008, 8, 6);
    g.scale(1, 1.9, 0.45);
    const p = sectionPoint(
      KATANA_R,
      -KATANA.tsuka * (side > 0 ? 0.34 : 0.62),
      KATANA.wMachi / 2 + 0.0055 * 0,
      side * 0.0148
    );
    g.rotateX(-Math.PI / 2);
    g.translate(p.x, p.y, p.z);
    put('metal', g, 0x8d7a45);
  }
}

// Aufstellmatrix eines Schwertes: liegt waagerecht längs Z, Schneide oben,
// Tsuka nach +Z. `beta` kippt es um die eigene Querachse, damit die Sehne der
// Klinge waagerecht liegt statt der Tangente an der Angel – sonst hängt die
// Spitze sichtbar durch.
function swordMatrix(x, y, z, beta) {
  const q = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), beta));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
}

// --- Katana-Kake: der Waffenständer ------------------------------------------
//
// Drei Etagen, zwei Böcke, die Schwerter liegen längs der Westwand.
//
// **Die Auflage ist eine Kerbe, kein Regalbrett.** Vorher lag jedes Schwert auf
// einem flachen Arm mit einer Nase am äußeren Ende. Ein Schwert liegt damit
// *neben* etwas statt *in* etwas, und weil nichts es seitlich fasst, gibt es
// auch keine Stelle, an der man die Berührung sehen könnte. Jeder Arm bekommt
// deshalb zwei Wangen und dazwischen eine nach oben offene Kerbe: Die Klinge
// sinkt bis über die halbe Höhe hinein, Holz steht links und rechts davor. Das
// ist die Form, an der man auf einen Blick sieht, dass etwas getragen wird.
//
// TIERS sind ab hier die **Kerbengründe**, nicht mehr die Armmitten – auf
// dieser Höhe liegt der Mune auf.
const TIERS = [0.32, 0.51, 0.7];

// Mitte der Kerbe. Weil das Schwert genau in der Kerbe liegt, ist das zugleich
// seine x-Achse; zwei getrennte Zahlen dafür wären zwei Zahlen, die
// auseinanderlaufen können.
const ARM_X = RACK.x + 0.088;

// Halber Bockabstand. Nicht frei wählbar, sondern die Zahl, die entscheidet,
// *wo unter dem Schwert* die beiden Kerben sitzen: Bei den vorherigen 0,31 m
// lagen sie 0,62 m auseinander, das ist fast die ganze Klingenlänge – eine
// Auflage wäre im Griff gelandet, die andere in der Kissaki. 0,27 m rückt
// beide auf den tragenden Teil der Klinge und lässt vorn wie hinten Überstand.
const ARM_SPAN = 0.27;

// Bogenlänge, an der die spitzenseitige Kerbe trägt: gut 5 cm vor dem Yokote.
// Weiter vorn läge das Schwert auf der Spitze auf, und eine Kissaki trägt
// nichts – sie ist der dünnste und empfindlichste Teil der Klinge.
const S_TIP = 0.615;

// Maße der Gabel.
//
// `throat` muss die dickste Auflage fassen – das ist die Saya mit 15,3 mm, also
// bleiben knapp 2 mm Luft je Seite. `mouth` ist mehr als doppelt so weit: Die
// Kerbe ist oben offen und unten eng, und *diese Verjüngung* ist das, woran man
// eine Kerbe als Kerbe erkennt. `horn` bleibt bewusst unter der Klingenhöhe
// (23–35 mm über dem Kerbengrund) – ein Horn, das über die Klinge ragt, sieht
// aus wie eine Klemme, nicht wie eine Auflage.
//
// `z` ist die Armtiefe längs des Ständers und die einzige Zahl hier, die eine
// versteckte Fehlerquelle hat: Der Kerbengrund ist eben, die Klinge ist es
// nicht. Über 32 mm Armtiefe weicht der Bogen um 1,3 mm vom ebenen Grund ab –
// bei den 50 mm des ersten Versuchs waren es 2,2 mm, und die sah man.
const CRADLE = {
  z: 0.032,
  half: 0.03, // halbe Breite der Gabelplatte
  throat: 0.0095, // halbe lichte Weite am Kerbengrund
  mouth: 0.02, // halbe lichte Weite an den Hornspitzen
  horn: 0.019, // Hornhöhe über dem Kerbengrund
  base: 0.026, // Material unter dem Kerbengrund
};

// Die Gabel eines Arms: eine U-Platte quer zum Schwert.
//
// Als Silhouette gezeichnet und extrudiert – dasselbe Verfahren wie beim Tsuba
// (`buildTsuba()`), und aus demselben Grund: Eine Kerbe *ist* eine Kontur. Aus
// Quadern zusammengesetzt bleibt sie ein Stapel Klötze; der Einlauf der Wange
// in den Kerbengrund, also genau die Linie, an der man die Auflage abliest,
// lässt sich damit gar nicht bauen.
function forkPlate() {
  const { half, throat, mouth, horn, base, z } = CRADLE;
  const r = 0.006;
  const s = new THREE.Shape();
  s.moveTo(-half, -base);
  s.lineTo(half, -base);
  s.lineTo(half, horn - r);
  s.quadraticCurveTo(half, horn, half - r, horn); // äußere Hornkuppe
  s.lineTo(mouth, horn);
  s.quadraticCurveTo(throat, horn * 0.5, throat, 0); // Flanke, unten einlaufend
  s.lineTo(-throat, 0); // Kerbengrund – hier liegt der Mune auf
  s.quadraticCurveTo(-throat, horn * 0.5, -mouth, horn);
  s.lineTo(-half + r, horn);
  s.quadraticCurveTo(-half, horn, -half, horn - r);
  s.closePath();

  // **`bevelOffset: -bevelSize` – und das ist keine Feinheit, sondern der
  // Unterschied zwischen „liegt auf" und „steckt im Holz".**
  //
  // `ExtrudeGeometry` verschiebt die Kontur nach *außen*: `scalePt2()` addiert
  // `bevelSize` entlang der Winkelhalbierenden, und der Rumpf sitzt bei
  // `bevelSize + bevelOffset`. Bei einer konvexen Form fällt das nicht auf – die
  // Platte wird 2 mm breiter. Bei einer **konkaven** Kerbe zieht dieselbe
  // Verschiebung den Grund nach oben und die Flanken zusammen. Gemessen an
  // genau dieser Kontur:
  //
  //   ohne Ausgleich   Kerbengrund y = 0.00220   lichte Weite = 0.01506
  //   mit Ausgleich    Kerbengrund y = 0.00000   lichte Weite = 0.01900
  //
  // Beides war falsch, und beides auf dieselbe Art: Die Klinge hätte 2,2 mm im
  // Holz gesteckt, und die Saya (15,3 mm) hätte sich in einer auf 15,06 mm
  // verengten Kerbe verkeilt, statt auf dem Grund aufzuliegen.
  //
  // Mit `bevelOffset = -bevelSize` liegt der Rumpf bei 0, also exakt auf der
  // gezeichneten Kontur, und die Fase läuft nach innen in die beiden
  // Deckflächen. `roundedBox()` löst dasselbe Problem oben durch Vorschrumpfen
  // der Kontur; hier geht das nicht, weil die Kerbe in die Gegenrichtung
  // wandert wie der Umriss.
  const b = 0.0022;
  const geometry = new THREE.ExtrudeGeometry(s, {
    depth: z - b * 2,
    bevelEnabled: true,
    bevelSize: b,
    bevelOffset: -b,
    bevelThickness: b,
    bevelSegments: 2,
    curveSegments: 5,
    steps: 1,
  });
  geometry.translate(0, 0, b - z / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// Ein Schwert in die beiden Kerben setzen.
//
// Zwei Auflagen, ein starrer Bogen: Damit das Schwert **beide** Kerben berührt
// – und genau das unterscheidet „liegt" von „schwebt daneben" –, muss der Mune
// an beiden Armen gleich hoch sein. Das ist *nicht* dieselbe Neigung, bei der
// die Sehne der Schneide waagerecht liegt, denn zwischen den Auflagen verjüngt
// sich die Klinge um 7 mm. Genau diese Verwechslung war der alte Fehler.
//
// Mit a = s/R und u = Abstand Rückgrat→Unterseite lauten Höhe und Lage der
// Auflagelinie im Weltsystem geschlossen (aus `spineAt()` und `swordMatrix()`):
//   y(a) = y0 − R·cos β + (R−u)·cos(a−β)
//   z(a) = z0 − R·sin β − (R−u)·sin(a−β)
// Gleiche Höhe an beiden Auflagen ergibt daraus direkt
//   tan β = (rG·cos aG − rT·cos aT) / (rT·sin aT − rG·sin aG).
// Wo die griffseitige Auflage liegt, hängt seinerseits von β ab; das zieht die
// Schleife nach. Bogenlänge und Sehne sind bei 5° Neigung fast dasselbe, sie
// steht nach drei Durchläufen (gemessen: ±0,01 mm).
function seatKatana(floorY, sheathed) {
  const R = KATANA_R;
  const under = sheathed ? sayaBack : bladeBack;
  const rTip = R - under(S_TIP);
  const aTip = S_TIP / R;
  let sGrip = S_TIP - 2 * ARM_SPAN;
  let beta = 0;
  let rGrip = R;
  let aGrip = 0;
  for (let i = 0; i < 8; i++) {
    rGrip = R - under(sGrip);
    aGrip = sGrip / R;
    beta = Math.atan2(
      rGrip * Math.cos(aGrip) - rTip * Math.cos(aTip),
      rTip * Math.sin(aTip) - rGrip * Math.sin(aGrip)
    );
    // Abstand der beiden Auflagepunkte in z, verglichen mit dem Bockabstand.
    sGrip += rTip * Math.sin(aTip - beta) - rGrip * Math.sin(aGrip - beta) - 2 * ARM_SPAN;
  }
  return swordMatrix(
    ARM_X,
    floorY + R * Math.cos(beta) - rGrip * Math.cos(aGrip - beta),
    RACK.z + ARM_SPAN + R * Math.sin(beta) + rGrip * Math.sin(aGrip - beta),
    beta
  );
}

function addRack(B) {
  const put = (bucket, geo, hex, shade) => B[bucket].geos.push(tint(geo, hex, shade));
  const ao = contactAO(0.2);
  const postZ = [RACK.z - ARM_SPAN, RACK.z + ARM_SPAN];

  for (const pz of postZ) {
    // Posten, nach oben leicht verjüngt – ein gleichmäßiger Klotz sieht
    // gesägt aus, ein verjüngter gehobelt.
    const rings = [];
    const vs = [];
    for (let i = 0; i < 6; i++) {
      const k = i / 5;
      const y = 0.026 + k * 0.75;
      const s = 1 - 0.16 * k;
      rings.push(
        roundedRect(0.052 * s, 0.078 * s, 0.012).map(
          ([a, b]) => new THREE.Vector3(RACK.x + a, y, pz + b)
        )
      );
      vs.push(k * 3);
    }
    put('wood', loft(rings, vs, { capStart: true, capEnd: true, swapUV: true }), 0xd8bb8e, ao);

    // Fuß mit Schwalbenschwanz-Anmutung
    const foot = roundedBox(0.23, 0.028, 0.13, 0.01);
    foot.translate(RACK.x + 0.03, 0.014, pz);
    put('wood', foot, 0xcbae83, ao);

    for (const y of TIERS) {
      // Gebackener Kontaktschatten der Kerbe. Eine Auflage ohne Schattenfuge
      // sitzt zwar richtig, sieht aber trotzdem aufgelegt aus: Wo Klinge und
      // Holz sich berühren, kommt kein Licht mehr hin, und dieser dunkle
      // Strich ist das, was das Auge als „Berührung" liest.
      const seat = (x, yy) => {
        const dy = Math.abs(yy - y) / 0.024;
        const dx = Math.max(0, Math.abs(x - ARM_X) - CRADLE.throat) / 0.03;
        return ao(x, yy) * (0.52 + 0.48 * Math.min(1, Math.max(dy, dx)));
      };

      // Konsole vom Posten bis unter die Gabel. Gleiche Tiefe wie die Gabel,
      // damit beide als *ein* Arm lesen und nicht als Platte auf einem Brett.
      const inner = RACK.x + 0.018;
      const outer = ARM_X - 0.012;
      const arm = roundedBox(outer - inner, CRADLE.base, CRADLE.z, 0.008);
      arm.translate((inner + outer) / 2, y - CRADLE.base / 2 - 0.002, pz);
      put('wood', arm, 0xd2b184, seat);

      const fork = forkPlate();
      fork.translate(ARM_X, y, pz);
      put('wood', fork, 0xd8bb8e, seat);
    }
  }
  // Untere Traverse zwischen den Böcken. Länge aus dem Bockabstand, damit sie
  // beim Verschieben der Böcke nicht in der Luft endet.
  const rail = roundedBox(0.05, 0.03, 2 * ARM_SPAN - 0.07, 0.01);
  rail.translate(RACK.x, 0.055, RACK.z);
  put('wood', rail, 0xc9a97d, ao);

  // Die Schwerter. Zwei blank, das unterste in der Saya – ein Ständer, auf dem
  // alles gleich aussieht, wirkt wie ein Ladenregal.
  //
  // Lage und Neigung kommen aus `seatKatana()`, nicht aus geschätzten Offsets:
  // Die Saya ist dicker als die blanke Klinge und verjüngt sich anders, sie
  // braucht deshalb eine andere Höhe *und* eine andere Neigung, um auf
  // derselben Kerbenform aufzuliegen.
  addKatana(B, seatKatana(TIERS[2], false), { itoColor: 0x211d26 });
  addKatana(B, seatKatana(TIERS[1], false), { itoColor: 0x2a2320 });
  addKatana(B, seatKatana(TIERS[0], true), { sheathed: true, itoColor: 0x1d2530 });
}

// Abgerundetes Rechteck als Punktliste (für Loft-Querschnitte).
function roundedRect(w, d, r, perCorner = 3) {
  const hw = w / 2 - r;
  const hd = d / 2 - r;
  const pts = [];
  const corners = [
    [hw, hd, 0],
    [-hw, hd, Math.PI / 2],
    [-hw, -hd, Math.PI],
    [hw, -hd, -Math.PI / 2],
  ];
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return pts;
}

// --- Makiwara ----------------------------------------------------------------
//
// Ein Makiwara ist **kein** Pfosten, sondern ein federndes Brett: unten dick,
// oben dünn, damit es beim Schlag nachgibt. Ein gleichmäßiger Rundpfosten wäre
// die einfachere Geometrie und sofort als falsch erkennbar – die Verjüngung
// *ist* das Objekt.
function addMakiwara(B) {
  const put = (bucket, geo, hex, shade) => B[bucket].geos.push(tint(geo, hex, shade));
  const { x, z } = MAKIWARA;
  const H = 1.6;
  const ao = contactAO(0.25);

  const rings = [];
  const vs = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    // Dicke fällt quadratisch – so biegt sich das Brett gleichmäßig.
    const thick = 0.048 - 0.03 * (k * k * 0.7 + k * 0.3);
    const width = 0.108 - 0.016 * k;
    rings.push(
      roundedRect(thick, width, Math.min(thick, 0.012), 2).map(
        ([a, b]) => new THREE.Vector3(x + a, k * H, z + b)
      )
    );
    vs.push(k * 8);
  }
  put('wood', loft(rings, vs, { capStart: true, capEnd: true, swapUV: true }), 0xb08d5c, ao);

  // Keilfuß: Das Brett steckt in einem Holzklotz im Boden.
  const base = roundedBox(0.3, 0.09, 0.24, 0.014);
  base.translate(x, 0.045, z);
  put('wood', base, 0x9c8055, contactAO(0.09));

  // Strohpolster (Wara) am Kopf, mit Seil umwickelt.
  const padBottom = 1.2;
  const padTop = 1.585;
  const padRings = [];
  const padVs = [];
  const P = 10;
  for (let i = 0; i < P; i++) {
    const k = i / (P - 1);
    const y = padBottom + k * (padTop - padBottom);
    // bauchig: in der Mitte am dicksten, oben und unten eingeschnürt
    const bulge = Math.sin(Math.min(1, k * 1.08) * Math.PI) * 0.5 + 0.62;
    const thick = 0.026 + 0.03 * bulge;
    const width = 0.098 + 0.028 * bulge;
    padRings.push(
      roundedRect(thick, width, Math.min(thick * 0.45, 0.016), 3).map(
        ([a, b]) => new THREE.Vector3(x + a, y, z + b)
      )
    );
    padVs.push(k * 5);
  }
  put(
    'fibre',
    loft(padRings, padVs, { capStart: true, capEnd: true }),
    0xcbb180,
    contactAO(1.4, 0.6)
  );

  // Seilwicklung: eine Schraubenlinie, die der abgerundeten Rechteckkontur des
  // Polsters folgt. `TubeGeometry` mit einem Kreisquerschnitt reicht hier, weil
  // ein Seil rund ist – die Kontur steckt im Pfad, nicht im Querschnitt.
  const TURNS = 17;
  const path = [];
  const steps = TURNS * 16;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const y = padBottom + 0.02 + k * (padTop - padBottom - 0.05);
    const kk = (y - padBottom) / (padTop - padBottom);
    const bulge = Math.sin(Math.min(1, kk * 1.08) * Math.PI) * 0.5 + 0.62;
    const rxx = (0.026 + 0.03 * bulge) / 2 + 0.007;
    const rzz = (0.098 + 0.028 * bulge) / 2 + 0.007;
    const a = k * TURNS * Math.PI * 2;
    // Superellipse: |cos|^0.55 rundet die Ecken, hält die Flanken aber flach.
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    path.push(
      new THREE.Vector3(
        x + Math.sign(ca) * Math.pow(Math.abs(ca), 0.55) * rxx,
        y,
        z + Math.sign(sa) * Math.pow(Math.abs(sa), 0.55) * rzz
      )
    );
  }
  const curve = new THREE.CatmullRomCurve3(path);
  const rope = new THREE.TubeGeometry(curve, steps, 0.0075, 5, false);
  scaleUV(rope, 1, 3);
  put('fibre', rope, 0x8f7748, contactAO(1.4, 0.6));
}

// --- Kakemono: das Hängerollbild --------------------------------------------
//
// Die Kalligrafie entsteht als Canvas-Textur. Der naheliegende Weg wäre
// `ctx.font` mit einem CJK-Zeichensatz – der ist im Headless-Chromium und auf
// der Quest aber nicht garantiert vorhanden, und ein fehlendes Glyph
// hinterlässt ein Kästchen mitten im Bild. Die Striche werden deshalb als
// Bezier-Bahnen mit Breitenprofil gezeichnet: garantiert vorhanden, und ein
// Pinselstrich hat ohnehin die Eigenschaft, die eine Schriftart nicht liefert –
// er wird zum Ende hin dünner und reißt auf.
const SCROLL = { w: 0.46, h: 1.4, top: 2.42 };

// Ein Pinselstrich: Catmull-Rom durch die Stützpunkte, Breite mitinterpoliert,
// als geschlossenes Polygon gefüllt.
function brushStroke(ctx, pts, widths, box) {
  const [bx, by, bw, bh] = box;
  const P = pts.map(([x, y]) => [bx + x * bw, by + y * bh]);
  const W = widths.map((w) => w * bw);
  const n = P.length;
  const at = (i) => P[Math.max(0, Math.min(n - 1, i))];
  const wat = (i) => W[Math.max(0, Math.min(W.length - 1, i))];
  const left = [];
  const right = [];
  const STEPS = 18;
  for (let seg = 0; seg < n - 1; seg++) {
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      const p0 = at(seg - 1);
      const p1 = at(seg);
      const p2 = at(seg + 1);
      const p3 = at(seg + 2);
      const cr = (a, b, c, d) =>
        0.5 *
        (2 * b +
          (-a + c) * t +
          (2 * a - 5 * b + 4 * c - d) * t * t +
          (-a + 3 * b - 3 * c + d) * t * t * t);
      const x = cr(p0[0], p1[0], p2[0], p3[0]);
      const y = cr(p0[1], p1[1], p2[1], p3[1]);
      // Ableitung numerisch – reicht für die Normalenrichtung.
      const e = 0.01;
      const t2 = Math.min(1, t + e);
      const cr2 = (a, b, c, d) =>
        0.5 *
        (2 * b +
          (-a + c) * t2 +
          (2 * a - 5 * b + 4 * c - d) * t2 * t2 +
          (-a + 3 * b - 3 * c + d) * t2 * t2 * t2);
      const dx = cr2(p0[0], p1[0], p2[0], p3[0]) - x;
      const dy = cr2(p0[1], p1[1], p2[1], p3[1]) - y;
      const len = Math.hypot(dx, dy) || 1;
      const gt = (seg + t) / (n - 1);
      const gi = gt * (W.length - 1);
      const w0 = wat(Math.floor(gi));
      const w1 = wat(Math.ceil(gi));
      const hw = (w0 + (w1 - w0) * (gi - Math.floor(gi))) / 2;
      left.push([x - (dy / len) * hw, y + (dx / len) * hw]);
      right.push([x + (dy / len) * hw, y - (dx / len) * hw]);
    }
  }
  ctx.beginPath();
  left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
  return { left, right };
}

let _scrollTexture = null;
function scrollTexture() {
  if (_scrollTexture) return _scrollTexture;
  const W = 384;
  const H = 1152;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Montierung (Hyoso): gedämpfte Seide, oben und unten breiter als seitlich.
  ctx.fillStyle = '#6f6247';
  ctx.fillRect(0, 0, W, H);
  // Seidenglanz: feine, senkrecht laufende Webstreifen.
  for (let x = 0; x < W; x += 2) {
    ctx.fillStyle = `rgba(255,245,220,${0.03 + 0.03 * ((x / 2) % 3 === 0 ? 1 : 0)})`;
    ctx.fillRect(x, 0, 1, H);
  }
  // Futai – die beiden Zierbänder, die vom oberen Stab herabhängen.
  ctx.fillStyle = 'rgba(48,40,28,0.55)';
  ctx.fillRect(112, 0, 22, 186);
  ctx.fillRect(250, 0, 22, 186);

  const inset = 26;
  const paperTop = 200;
  const paperBottom = 936;

  // Ichimonji: schmale, dunklere Bänder als Rahmen des Bildfelds.
  ctx.fillStyle = '#4a3f2c';
  ctx.fillRect(inset - 8, paperTop - 16, W - (inset - 8) * 2, 16);
  ctx.fillRect(inset - 8, paperBottom, W - (inset - 8) * 2, 16);

  // Bildfeld: dasselbe Washi wie die Shoji – so gehören Papierflächen im Raum
  // sichtbar zusammen, statt zufällig unterschiedlich zu sein.
  const washi = washiTexture().image;
  ctx.drawImage(washi, inset, paperTop, W - inset * 2, paperBottom - paperTop);
  ctx.fillStyle = 'rgba(238,231,213,0.55)';
  ctx.fillRect(inset, paperTop, W - inset * 2, paperBottom - paperTop);

  // Alterung: leichte Stockflecken, damit das Papier nicht neu wirkt.
  for (let i = 0; i < 26; i++) {
    const rx = inset + Math.random() * (W - inset * 2);
    const ry = paperTop + Math.random() * (paperBottom - paperTop);
    const r = 6 + Math.random() * 26;
    const g = ctx.createRadialGradient(rx, ry, 0, rx, ry, r);
    g.addColorStop(0, 'rgba(150,120,70,0.06)');
    g.addColorStop(1, 'rgba(150,120,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx - r, ry - r, r * 2, r * 2);
  }

  // --- Kalligrafie: Klinge -------------------------------------------------
  // Vorher stand hier das Zeichen fuer Herz/Geist. Zeichnerisch war das ein
  // Fehlgriff: eine grosse liegende Schale mit drei Punkten darueber ist exakt
  // die Anordnung, aus der das Auge ein Gesicht macht - zwei Augen und ein
  // Mund. Auf dem Rollbild in der Nische, also genau im Blickzentrum beim
  // Betreten, las es sich unfreiwillig als Smiley.
  //
  // Das Zeichen fuer Klinge hat nur zwei Striche, keine freistehenden Punkte
  // und damit keine Gesichtslesart. Fuer einen Schwertsaal ist es ausserdem das
  // passendere Zeichen. Komplexere Kandidaten waeren bei dieser Aufloesung zu
  // Matsch zerfallen.
  const box = [inset + 14, paperTop + 96, W - inset * 2 - 28, 470];
  ctx.fillStyle = 'rgba(24,20,24,0.94)';
  const strokes = [
    // Waagerechter Ansatz, dann der Haken nach unten links.
    {
      p: [
        [0.3, 0.15],
        [0.62, 0.17],
        [0.72, 0.3],
        [0.69, 0.55],
        [0.55, 0.74],
      ],
      w: [0.03, 0.052, 0.058, 0.046, 0.012],
    },
    // Der lange fallende Strich, zum Ende hin duenn auslaufend.
    {
      p: [
        [0.5, 0.13],
        [0.42, 0.4],
        [0.31, 0.66],
        [0.17, 0.87],
      ],
      w: [0.032, 0.056, 0.038, 0.008],
    },
  ];
  for (const s of strokes) brushStroke(ctx, s.p, s.w, box);

  // Kasure („fliegendes Weiß"): Der trockene Pinsel lässt am Ende des Zugs
  // Papier stehen. Ohne das sieht Tusche aus wie Vektorgrafik.
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const s = strokes[1];
    const t = 0.45 + Math.random() * 0.55;
    const idx = Math.min(s.p.length - 2, Math.floor(t * (s.p.length - 1)));
    const f = t * (s.p.length - 1) - idx;
    const x = box[0] + (s.p[idx][0] + (s.p[idx + 1][0] - s.p[idx][0]) * f) * box[2];
    const y = box[1] + (s.p[idx][1] + (s.p[idx + 1][1] - s.p[idx][1]) * f) * box[3];
    ctx.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.4})`;
    ctx.fillRect(
      x + (Math.random() - 0.5) * 26,
      y + (Math.random() - 0.5) * 20,
      1 + Math.random() * 5,
      1.2
    );
  }
  ctx.globalCompositeOperation = 'source-over';

  // Signatur (abstrahiert) und Hanko-Siegel
  ctx.fillStyle = 'rgba(30,26,28,0.8)';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(96, 700 + i * 22, 16 + (i % 2) * 10, 3);
    ctx.fillRect(100 + (i % 3) * 4, 704 + i * 22, 3, 12);
  }
  ctx.fillStyle = '#9c2a20';
  ctx.fillRect(88, 826, 44, 44);
  ctx.fillStyle = 'rgba(238,231,213,0.85)';
  for (let i = 0; i < 4; i++) ctx.fillRect(95, 834 + i * 9, 30 - (i % 2) * 12, 4);
  ctx.fillRect(95, 834, 4, 28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  _scrollTexture = texture;
  return texture;
}

// Das Rollbild bleibt eine eigene Gruppe: Es ist der einzige Teil außer dem
// Rauch, der sich bewegt, und Bewegtes lässt sich nicht in die statischen
// Sammel-Meshes einbacken.
function buildScroll() {
  const group = new THREE.Group();
  group.name = 'kakemono';
  // Tokonoma-Rückwand. Die Nische ist in die Nordwand eingelassen, ihr Boden
  // liegt bei TOKONOMA.floorY; die Rückwand liegt also um `depth` hinter der
  // Wandflucht. Das Bild hängt 2,5 cm davor.
  const zBack = WALL.north - TOKONOMA.depth + 0.025;

  const faceGeo = new THREE.PlaneGeometry(SCROLL.w, SCROLL.h, 1, 8);
  faceGeo.translate(0, -SCROLL.h / 2 - 0.012, 0);
  const faceMat = washiMaterial();
  faceMat.map = scrollTexture();
  faceMat.color = new THREE.Color(0xffffff);
  faceMat.side = THREE.FrontSide;
  faceMat.roughness = 0.92;
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.castShadow = true;
  face.receiveShadow = true;
  group.add(face);

  // Stäbe: oben ein dünner Hangstab, unten die schwere Rolle mit Knäufen –
  // deren Gewicht ist der Grund, warum ein Kakemono überhaupt glatt hängt.
  const rodGeos = [];
  const rod = new THREE.CylinderGeometry(0.0075, 0.0075, SCROLL.w + 0.02, 8);
  rod.rotateZ(Math.PI / 2);
  rodGeos.push(tint(rod, 0x4a3d2c));
  const roller = new THREE.CylinderGeometry(0.0145, 0.0145, SCROLL.w, 10);
  roller.rotateZ(Math.PI / 2);
  roller.translate(0, -SCROLL.h - 0.012, 0);
  rodGeos.push(tint(roller, 0x2a2018));
  for (const sx of [-1, 1]) {
    const knob = new THREE.CylinderGeometry(0.0195, 0.0185, 0.032, 10);
    knob.rotateZ(Math.PI / 2);
    knob.translate(sx * (SCROLL.w / 2 + 0.016), -SCROLL.h - 0.012, 0);
    rodGeos.push(tint(knob, 0x17120f));
    // Aufhängeschnur zum Haken
    const cord = new THREE.CylinderGeometry(0.0022, 0.0022, 0.17, 5);
    cord.translate(0, 0.085, 0);
    cord.rotateZ(sx * 0.5);
    cord.translate(sx * (SCROLL.w / 2 - 0.01), 0.002, 0);
    rodGeos.push(tint(cord, 0x2e2a26));
  }
  const rodMat = hinokiMaterial({ roughness: 0.7 });
  rodMat.vertexColors = true;
  const rods = new THREE.Mesh(
    mergeGeometries(rodGeos.map((g) => (g.index ? g.toNonIndexed() : g))),
    rodMat
  );
  rods.castShadow = true;
  group.add(rods);

  group.position.set(TOKONOMA.centerX, SCROLL.top, zBack);
  return group;
}

// --- Zabuton ------------------------------------------------------------------
function addZabuton(B, x, z, rot) {
  const put = (geo, hex, shade) => B.fabric.geos.push(tint(geo, hex, shade));
  const pad = roundedBox(0.56, 0.56, 0.085, 0.055, 0.035);
  pad.rotateX(-Math.PI / 2);
  scaleUV(pad, 9, 9);
  const m = new THREE.Matrix4().makeRotationY(rot);
  m.setPosition(x, 0.043, z);
  pad.applyMatrix4(m);
  put(pad, 0x3d4a63, contactAO(0.08));

  // Quaste in der Mitte – die Heftung, die das Kissen zusammenhält.
  const tuft = new THREE.SphereGeometry(0.017, 8, 6);
  tuft.scale(1, 0.5, 1);
  tuft.translate(x, 0.086, z);
  put(tuft, 0x2b3549);
}

// --- Koro: Weihrauchbrenner ---------------------------------------------------
//
// Gedrehtes Profil (LatheGeometry) wie die Stuhlbeine in environments.js:2200 –
// für alles, was auf der Drehbank oder Töpferscheibe entstanden ist, ist das
// die richtige und mit Abstand billigste Beschreibung.
function addCenser(B, x, y, z) {
  const put = (bucket, geo, hex, shade) => B[bucket].geos.push(tint(geo, hex, shade));
  const profile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.028, 0.0),
    new THREE.Vector2(0.042, 0.008),
    new THREE.Vector2(0.055, 0.03),
    new THREE.Vector2(0.058, 0.052),
    new THREE.Vector2(0.052, 0.062),
    new THREE.Vector2(0.056, 0.068), // ausgestellter Rand
    new THREE.Vector2(0.05, 0.07),
    new THREE.Vector2(0.048, 0.056), // Innenwand
    new THREE.Vector2(0.038, 0.03),
    new THREE.Vector2(0.0, 0.026),
  ];
  const bowl = new THREE.LatheGeometry(profile, 22);
  bowl.translate(x, y, z);
  put('metal', bowl, 0x6b5b3e, contactAO(0.05, y)); // patinierte Bronze

  // Drei Füße
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const foot = new THREE.SphereGeometry(0.012, 7, 5);
    foot.scale(0.8, 1.3, 0.8);
    foot.translate(x + Math.cos(a) * 0.038, y + 0.004, z + Math.sin(a) * 0.038);
    put('metal', foot, 0x5a4c34);
  }

  // Asche und ein glimmendes Räucherstäbchen
  const ash = new THREE.CylinderGeometry(0.042, 0.036, 0.012, 16);
  ash.translate(x, y + 0.034, z);
  put('core', ash, 0xb9b3a6);
  const stick = new THREE.CylinderGeometry(0.0016, 0.0016, 0.14, 5);
  stick.rotateZ(0.1);
  stick.translate(x + 0.006, y + 0.104, z);
  put('core', stick, 0x6b4a3a);
}

// --- Rauchfahne ---------------------------------------------------------------
//
// Zwei um 90° gekreuzte Bänder statt eines Billboards: Ein einzelnes Band
// verschwindet, sobald man seitlich daran vorbeigeht, und ein echtes Billboard
// müsste pro Frame zur Kamera gedreht werden – in VR mit zwei Augen ist das
// ohnehin nie für beide gleichzeitig richtig. Gekreuzt bleibt die Fahne aus
// jeder Richtung sichtbar und kostet trotzdem nur einen Zeichenaufruf.
const SMOKE_SEGMENTS = 34;

function smokeTexture() {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / (S - 1);
      const v = y / (S - 1);
      const across = 1 - Math.abs(u * 2 - 1);
      // Weich am Rand, unten dicht, oben ausgefranst und verweht.
      let a = Math.pow(across, 1.6) * Math.pow(1 - v, 1.1);
      a *= Math.min(1, v * 14); // direkt an der Glut noch dünn
      a *= 0.72 + 0.28 * Math.sin(v * 37 + u * 6);
      const i = (y * S + x) * 4;
      img.data[i] = 226;
      img.data[i + 1] = 222;
      img.data[i + 2] = 212;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildSmoke(origin) {
  const N = SMOKE_SEGMENTS;
  const verts = (N + 1) * 2 * 2; // zwei Bänder
  const geometry = new THREE.BufferGeometry();
  const pos = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const index = [];
  for (let strip = 0; strip < 2; strip++) {
    const off = strip * (N + 1) * 2;
    for (let i = 0; i <= N; i++) {
      const v = i / N;
      uv[(off + i * 2) * 2] = 0;
      uv[(off + i * 2) * 2 + 1] = v;
      uv[(off + i * 2 + 1) * 2] = 1;
      uv[(off + i * 2 + 1) * 2 + 1] = v;
      if (i < N) {
        const a = off + i * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(origin.x, origin.y + 0.45, origin.z),
    0.7
  );

  const material = new THREE.MeshBasicMaterial({
    map: smokeTexture(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'incense-smoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  // Die Bahn ist eine reine Funktion der Zeit – `update` bekommt absolute
  // Sekunden, kein Delta, es darf also keinen aufsummierten Zustand geben.
  // Der Phasenversatz `- h * 2.6` lässt die Wellen nach oben *wandern*, statt
  // die ganze Fahne im Gleichtakt hin- und herschwingen zu lassen.
  const update = (time) => {
    const p = geometry.attributes.position.array;
    for (let i = 0; i <= N; i++) {
      const h = i / N;
      const t = time * 0.55 - h * 2.6;
      const spread = 0.004 + h * h * 0.105;
      const dx = (Math.sin(t * 1.9) * 0.7 + Math.sin(t * 0.83 + 1.7) * 0.45) * spread;
      const dz = (Math.cos(t * 1.45 + 0.6) * 0.7 + Math.cos(t * 0.61) * 0.4) * spread;
      const y = origin.y + h * 0.86;
      const x = origin.x + dx;
      const z = origin.z + dz;
      const w = 0.0035 + h * 0.055;
      for (let strip = 0; strip < 2; strip++) {
        const off = (strip * (N + 1) + i) * 2 * 3;
        const ax = strip === 0 ? w : 0;
        const az = strip === 0 ? 0 : w;
        p[off] = x - ax;
        p[off + 1] = y;
        p[off + 2] = z - az;
        p[off + 3] = x + ax;
        p[off + 4] = y;
        p[off + 5] = z + az;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}

// --- Bokken -------------------------------------------------------------------
//
// Zwei Holzschwerter, an die Westwand gelehnt. Querschnitt wie ein Katana ohne
// Schliff: rund am Rücken, zur Schneidenseite abgeflacht.
function bokkenSection(w, h) {
  const pts = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const pinch = 0.5 + 0.5 * ((Math.cos(a) + 1) / 2);
    pts.push([w / 2 + (Math.cos(a) * w) / 2, Math.sin(a) * h * pinch]);
  }
  return pts;
}

function addBokken(B, matrix, hex) {
  const R = 4.2; // deutlich flacher gekrümmt als eine Klinge
  const L = 1.02;
  const rings = [];
  const vs = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const k = i / (N - 1);
    const s = -0.24 + k * L;
    let w = 0.031;
    let h = 0.021;
    if (s < 0) {
      // Griffteil: gleichmäßig, minimal dicker als der Klingenteil
      w = 0.03;
      h = 0.023;
    } else {
      const kk = s / (L - 0.24);
      w = 0.031 - 0.009 * kk;
      h = 0.021 - 0.005 * kk;
      if (kk > 0.94) {
        const e = (kk - 0.94) / 0.06;
        w *= 1 - e * 0.75;
        h *= 1 - e * 0.6;
      }
    }
    rings.push(bokkenSection(w, h).map(([a, b]) => sectionPoint(R, s, a, b)));
    vs.push(k * 6);
  }
  const geo = loft(rings, vs, { capStart: true, capEnd: true, swapUV: true });
  geo.applyMatrix4(matrix);
  B.wood.geos.push(tint(geo, hex, contactAO(0.3)));
}

// --- Buki-Kake: Ständer für Stangenwaffen ------------------------------------
//
// Der Anlass ist eine Nutzerfrage: „Was sollen die zwei Stäbe sein, die aus dem
// Boden ragen?" – und die Frage war berechtigt. Zwei Bokken lehnten frei an der
// Wand, ohne Halterung, ohne Bezug zueinander. Ein Gegenstand, der ohne Grund
// im Raum steht, liest sich als Fehler, egal wie gut er modelliert ist.
//
// Jetzt stehen sie in einem Ständer, zusammen mit dem, was in einem Waffensaal
// sonst noch dazugehört: Naginata, Yari, Bo und Jo. Der Ständer besteht aus
// einer Fußschwelle mit Mulden und einem Kopfriegel mit Löchern – genau die
// zwei Teile, an denen man sieht, dass etwas gehalten wird statt zu lehnen.
const POLE = { x: WALL.west + 0.34, z: -1.15, span: 1.22, headY: 1.42 };

function addPoleRack(B) {
  const put = (bucket, geo, hex, shade) => B[bucket].geos.push(tint(geo, hex, shade));
  const ao = contactAO(0.25);
  const slots = 6;
  const step = POLE.span / slots;
  const z0 = POLE.z - POLE.span / 2 + step / 2;

  // Zwei Pfosten
  for (const zz of [POLE.z - POLE.span / 2 - 0.05, POLE.z + POLE.span / 2 + 0.05]) {
    const post = roundedBox(0.09, POLE.headY + 0.12, 0.09, 0.012);
    post.translate(POLE.x, (POLE.headY + 0.12) / 2, zz);
    put('wood', post, 0xcbae83, ao);
  }
  // Fußschwelle und Kopfriegel
  const sill = roundedBox(0.17, 0.07, POLE.span + 0.22, 0.014);
  sill.translate(POLE.x, 0.035, POLE.z);
  put('wood', sill, 0xc2a279, ao);
  const head = roundedBox(0.13, 0.08, POLE.span + 0.22, 0.014);
  head.translate(POLE.x, POLE.headY, POLE.z);
  put('wood', head, 0xd2b184, ao);

  // Die Waffen. Jede ist ein Schaft plus höchstens ein Kopf; die Schäfte sind
  // schlichte verjüngte Zylinder, weil an einem zwei Meter langen Stab die
  // Silhouette alles ist und der Querschnitt nichts.
  const shaft = (z, len, rBase, rTop, hex, lean) => {
    const g = new THREE.CylinderGeometry(rTop, rBase, len, 8);
    g.rotateX(lean); // leichte Rückneigung gegen den Kopfriegel
    g.translate(POLE.x - Math.sin(lean) * len * 0.5, len / 2 + 0.06, z);
    put('wood', g, hex, ao);
    return len + 0.06;
  };

  const zs = Array.from({ length: slots }, (_, i) => z0 + i * step);

  // 1 – Naginata: langer Schaft, gebogene Klinge obenauf.
  {
    const top = shaft(zs[0], 1.95, 0.021, 0.017, 0x8d6a44, -0.03);
    const R = 0.55;
    const rings = [];
    const vs = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const s = k * 0.42;
      // Breiter als im ersten Anlauf. 3,6 cm sind für eine Naginata-Klinge
      // nicht falsch, aber aus drei Metern Entfernung war sie ein Draht – und
      // eine Klinge, die man nicht als Klinge erkennt, ist keine.
      const w = 0.058 * (1 - 0.42 * k) * (k > 0.9 ? (1 - k) / 0.1 + 0.08 : 1);
      const h = 0.006 * (1 - 0.35 * k);
      rings.push(bladeSection(w, h).map(([a, b]) => sectionPoint(R, s, a, b)));
      vs.push(k * 2);
    }
    // **Keine Drehung.** Die Klinge entsteht über `sectionPoint()` bereits
    // entlang +Y – sie setzt den Schaft also von selbst fort. Der erste Anlauf
    // drehte sie um Z und dann um Y „damit sie richtig steht" und legte sie
    // damit waagerecht: eine Klinge, die zwei Meter über dem Boden quer in der
    // Luft schwebt. Dieselbe Verwechslung wie schon zweimal bei den Sprossen.
    const blade = loft(rings, vs, { flat: true, capEnd: true });
    blade.translate(POLE.x, top, zs[0]);
    put('steel', tint(blade, 0xd7dde2), 0xd7dde2);
    // Messingzwinge am Übergang
    const collar = new THREE.CylinderGeometry(0.026, 0.026, 0.07, 8);
    collar.translate(POLE.x, top - 0.02, zs[0]);
    put('metal', collar, 0xb08d4a);
  }

  // 2 – Yari: gerade Stichklinge, dreieckig im Querschnitt.
  {
    const top = shaft(zs[1], 2.05, 0.02, 0.016, 0x6f533a, -0.03);
    const head = new THREE.ConeGeometry(0.034, 0.36, 4);
    head.rotateY(Math.PI / 4);
    head.translate(POLE.x, top + 0.15, zs[1]);
    put('steel', tint(head, 0xd7dde2), 0xd7dde2);
    const collar = new THREE.CylinderGeometry(0.028, 0.03, 0.09, 8);
    collar.translate(POLE.x, top + 0.01, zs[1]);
    put('metal', collar, 0xb08d4a);
  }

  // 3 – Bo: sechs Fuß, gleichmäßig, ohne alles. Der Kontrast dazu ist der
  //     Punkt: Neben zwei Waffen mit Klinge liest sich der blanke Stab sofort
  //     als Übungswaffe.
  shaft(zs[2], 1.82, 0.019, 0.019, 0xb08a58, -0.02);
  // 4 – Jo: kürzer, heller.
  shaft(zs[3], 1.28, 0.0165, 0.0165, 0xc6a06a, -0.02);

  // 5 und 6 – die beiden Bokken, jetzt **im** Ständer statt daneben.
  //
  // Aufrecht heißt hier **gar keine Drehung**: `addBokken()` baut entlang +Y,
  // steht also von sich aus. Eine Drehung um X um 90 Grad – der erste Versuch –
  // legt es flach auf den Boden, und genau so lag es dann auch.
  for (const [i, zz] of [zs[4], zs[5]].entries()) {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      -0.03 + i * 0.015
    );
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(POLE.x - 0.012, 0.3, zz),
      q,
      new THREE.Vector3(1, 1, 1)
    );
    addBokken(B, m, i === 0 ? 0xc79a63 : 0xb2854f);
  }
}

// --- Wandbild an der Waffenwand ----------------------------------------------
//
// Ein Fusuma-artiges Tafelbild: Goldgrund, Kiefernast in Tusche, ferne Berge.
//
// **Gemalt statt modelliert.** Ein Bild ist ein Bild – es hier als Geometrie zu
// bauen wäre die teuerste denkbare Art, eine Fläche mit Farbe zu füllen. Die
// Tafel ist ein Brett mit einer prozeduralen Textur; was sie trägt, ist der
// dunkle Rahmen ringsum und die Tatsache, dass sie flach an der Wand sitzt
// statt zu schweben.
function paintingTexture() {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Goldgrund mit Blattgold-Kacheln – die feinen Fugen sind das, was echtes
  // Blattgold von einer gelben Fläche unterscheidet.
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  // Kräftiger als im ersten Anlauf. Blattgold in einem hellen Raum liest sich
  // sonst als cremefarbene Fläche – gemessen hat es dieselbe Helligkeit wie der
  // Putz daneben, und dann ist es kein Bild mehr, sondern ein heller Fleck.
  bg.addColorStop(0, '#b98a35');
  bg.addColorStop(0.42, '#d9ac59');
  bg.addColorStop(1, '#a97a2c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,86,30,0.35)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Ferne Berge in blasser Tusche
  ctx.fillStyle = 'rgba(74,88,86,0.62)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.quadraticCurveTo(w * 0.16, h * 0.34, w * 0.34, h * 0.6);
  ctx.quadraticCurveTo(w * 0.48, h * 0.42, w * 0.62, h * 0.62);
  ctx.lineTo(w, h * 0.66);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // Nebelband darüber, damit die Berge nicht auf dem Boden aufsitzen
  ctx.fillStyle = 'rgba(214,172,92,0.7)';
  ctx.fillRect(0, h * 0.6, w, h * 0.1);

  // Kiefer: Stamm von rechts hereinwachsend, drei Astebenen mit Nadelpolstern.
  const ink = (a) => `rgba(16,15,14,${a})`;
  ctx.strokeStyle = ink(0.92);
  ctx.lineCap = 'round';
  ctx.lineWidth = 21;
  ctx.beginPath();
  ctx.moveTo(w * 0.92, h * 1.02);
  ctx.bezierCurveTo(w * 0.86, h * 0.72, w * 0.8, h * 0.6, w * 0.66, h * 0.42);
  ctx.stroke();
  const branches = [
    [0.66, 0.42, 0.36, 0.3, 0.5],
    [0.74, 0.56, 0.5, 0.46, 0.42],
    [0.83, 0.72, 0.62, 0.66, 0.34],
  ];
  const r = (() => {
    let s = 0x51ce >>> 0;
    return () => {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
      return ((s >>> 8) & 0xffffff) / 0x1000000;
    };
  })();
  for (const [x0, y0, x1, y1, size] of branches) {
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(w * x0, h * y0);
    ctx.quadraticCurveTo(w * ((x0 + x1) / 2), h * (y1 - 0.08), w * x1, h * y1);
    ctx.stroke();
    // Nadelpolster: viele kurze Striche, radial – so zeichnet man Kiefer.
    for (let i = 0; i < 150; i++) {
      const t = 0.25 + r() * 0.8;
      const bx = w * (x0 + (x1 - x0) * t) + (r() - 0.5) * w * 0.09;
      const by = h * (y0 + (y1 - y0) * t) + (r() - 0.5) * h * 0.1;
      const a = r() * Math.PI * 2;
      const len = h * 0.02 * size * (0.6 + r() * 0.8);
      ctx.strokeStyle = ink(0.55 + r() * 0.42);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + Math.cos(a) * len, by + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  // Rotes Siegel unten links – das kleine Zeichen, an dem ein Bild als Bild
  // liest und nicht als Tapete.
  ctx.fillStyle = 'rgba(168,42,38,0.9)';
  ctx.fillRect(w * 0.07, h * 0.78, w * 0.035, h * 0.07);
  ctx.clearRect(w * 0.079, h * 0.795, w * 0.006, h * 0.04);
  ctx.clearRect(w * 0.075, h * 0.812, w * 0.02, h * 0.006);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- Vasen ---------------------------------------------------------------------
//
// Zwei Bodenvasen, die den Eingang flankieren. `LatheGeometry` ist hier genau
// das richtige Werkzeug – eine Vase *ist* ein rotiertes Profil, und das ist der
// eine Fall, in dem der Loft dieser Datei mehr Arbeit wäre als der Standardweg.
function vaseProfile(height) {
  // **Steuerpunkte statt Formel.** Der erste Anlauf hat das Profil aus einer
  // Sinuskurve mit drei Korrekturtermen gerechnet. Das Ergebnis war ein
  // Tropfen: kein Fuß, keine Schulter, kein Hals, kein Rand – und jede
  // Nachbesserung an einer Stelle verzog zwei andere.
  //
  // Eine Vase ist ein gezeichnetes Profil, und die Stellen, an denen sie
  // gelesen wird, sind benennbar: Standfläche, weitester Punkt (bei einer
  // japanischen Bodenvase tief, bei gut einem Drittel), die lange Einziehung
  // darüber, der engste Punkt am Hals und die ausgestellte Mündung.
  //
  // Erster Punkt auf Radius null: `LatheGeometry` setzt keinen Deckel, ein
  // Startradius > 0 ließe die Vase unten offen.
  const aussen = [
    [0.0, 0.0],
    // Flache Standfläche statt Spitze. Vorher lief das Profil unten auf einen
    // Punkt zu, und die Vase stand im Bild auf einer Nadel. Der Fuß ist mit
    // 0,42 fast die Hälfte des größten Durchmessers – bei 0,30 wirkte die Vase
    // im Bild kippelig, obwohl die Zahlen einer echten Bodenvase entsprachen.
    // Ein Gefäß darf schlank sein, aber es muss aussehen, als stünde es.
    [0.0, 0.42],
    [0.012, 0.435],
    [0.05, 0.5],
    [0.13, 0.63],
    [0.24, 0.78],
    [0.36, 0.88], // weitester Punkt, tief angesetzt
    [0.48, 0.86],
    [0.6, 0.76],
    [0.71, 0.6],
    [0.8, 0.45],
    [0.87, 0.355],
    [0.92, 0.325], // engster Punkt: der Hals
    [0.965, 0.35],
    [1.0, 0.42], // ausgestellte Mündung
  ];

  // Der Rumpf wird dicht abgetastet, damit die Fläche glatt schattiert.
  // `LatheGeometry` mittelt die Normalen entlang des Profils: viele Punkte
  // ergeben eine weiche Wölbung, wenige eine Kante. Genau das wird hier
  // ausgenutzt – der Rand darunter bleibt bewusst grob und bekommt dadurch
  // seine Kante.
  const kurve = new THREE.CatmullRomCurve3(
    aussen.map(([t, rr]) => new THREE.Vector3(rr, t, 0)),
    false,
    'catmullrom',
    0.5
  );
  const pts = kurve.getSpacedPoints(30).map((v) => new THREE.Vector2(v.x, v.y));

  // Rand und Innenwand. Ohne sie ist die Mündung ein Loch in einer Schale: Man
  // sieht bei rückseitenkulierten Flächen durch die Vase hindurch, und der
  // Rand hat keine Dicke. Der Innenboden sitzt dicht unter dem Hals – tiefer
  // sieht ohnehin niemand hinein, und jeder Punkt darunter wäre bezahlte
  // Geometrie im Dunkeln.
  for (const [t, rr] of [
    [1.002, 0.395],
    [0.975, 0.34],
    [0.94, 0.3],
    [0.9, 0.29],
    [0.86, 0.0],
  ]) {
    pts.push(new THREE.Vector2(rr, t));
  }

  // Maßstab: Eine Bodenvase von 78 cm Höhe ist rund 30 cm breit. Der weiteste
  // Punkt liegt bei 0,88 der Profilbreite, der Faktor folgt daraus.
  const rMax = height * 0.195;
  for (const v of pts) {
    v.x = Math.max(0, v.x) * rMax;
    v.y *= height;
  }
  return pts;
}

function vaseGeometry(height) {
  // 26 statt 14 Segmente. Eine glasierte Fläche zeigt jede Facette; bei
  // vierzehn sah der Bauch aus wie ein geschliffener Kristall.
  return new THREE.LatheGeometry(vaseProfile(height), 26);
}

// --- Ikebana -------------------------------------------------------------------
//
// Was vorher in den Vasen stand, waren drei gerade Zylinder in zufälligen
// Winkeln. Das liest sich als Antennen, und es ist das genaue Gegenteil dessen,
// was ein Gesteck ist: Ikebana ist Anordnung, nicht Streuung.
//
// Die klassische Dreiheit gibt die Proportionen vor – **shin** (Himmel, der
// längste Zweig), **soe** (Mensch, etwa drei Viertel davon) und **hikae**
// (Erde, gut die Hälfte). Alle drei gehen aus einem Punkt aus, neigen sich in
// dieselbe Halbebene und sind gebogen, nicht gerade. Diese drei Regeln machen
// den Unterschied; alles Weitere ist Zierde.
function ikebanaStems(x, z, baseY, height, seed) {
  const r = rng(seed);
  const stems = [];
  const leafSpots = [];

  // Grundrichtung des Gestecks: alle Zweige neigen sich in dieselbe Halbebene.
  // Ein Gesteck, das nach allen Seiten auseinandergeht, ist ein Strauß.
  const az = r() * Math.PI * 2;

  const teile = [
    // [Länge im Verhältnis zur Vase, Neigung, seitlicher Versatz, Krümmung]
    [1.45, 0.13, 0.0, 0.55],
    [1.05, 0.42, 0.55, 0.75],
    [0.62, 0.72, -0.5, 0.85],
  ];

  for (const [lenF, tilt, seit, bend] of teile) {
    const len = height * lenF;
    const a = az + seit;
    const dir = new THREE.Vector3(
      Math.sin(a) * Math.sin(tilt),
      Math.cos(tilt),
      Math.cos(a) * Math.sin(tilt)
    );
    // Seitliche Achse für die Krümmung: Der Zweig biegt sich quer zu seiner
    // eigenen Richtung, sonst wird aus der Biegung eine Verkürzung.
    const quer = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));

    const start = new THREE.Vector3(x, baseY + height * 0.86, z);
    const punkte = [];
    const N = 5;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = start.clone().addScaledVector(dir, len * t);
      // Krümmung als Sinusbogen: null am Ansatz, größte Auslenkung oben. Ein
      // Zweig, der schon im Hals abknickt, sieht geknickt aus statt gewachsen.
      p.addScaledVector(quer, Math.sin(t * Math.PI * 0.62) * len * bend * 0.28);
      p.y -= t * t * len * 0.12; // Eigengewicht
      punkte.push(p);
    }
    const kurve = new THREE.CatmullRomCurve3(punkte);
    stems.push(new THREE.TubeGeometry(kurve, 8, 0.0075, 4, false));

    // Laub sitzt im oberen Drittel, nicht über die ganze Länge – unten ist
    // Zweig, oben Blatt. Der kürzeste Zweig bleibt kahl; im Ikebana trägt
    // nicht jedes Element Laub, und der Kontrast ist beabsichtigt.
    if (lenF > 0.8) {
      for (const t of [0.72, 0.9]) {
        leafSpots.push({
          p: kurve.getPoint(t),
          s: 0.075 + r() * 0.045,
        });
      }
    }
  }
  return { stems, leafSpots };
}

// --- Blob-Schatten ------------------------------------------------------------
//
// `makeBlobShadow` legt pro Aufruf ein eigenes Material an; sechs Requisiten
// wären sechs zusätzliche Zeichenaufrufe für sechs identische Quads. Hier
// werden dieselben Quads vorab in Weltkoordinaten gelegt und zu **einem** Mesh
// verschmolzen – gleiche Optik, ein Aufruf.
//
// Der Versatz entlang der Sonnenrichtung ist kein Schönheitsfehler: Ein
// Kontaktschatten sitzt nicht symmetrisch unter dem Objekt, sondern im Fuß des
// echten Schlagschattens. Ohne den Versatz widersprechen sich Blob und
// Shadow-Map sichtbar.
function buildBlobShadows(spots) {
  const [sx, , sz] = sunDirection();
  const geos = [];
  for (const { x, z, r, y = 0.012, opacity = 1 } of spots) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.scale(r * 2, 1, r * 2);
    g.translate(x + sx * r * 0.18, y, z + sz * r * 0.18);
    // Deckkraft pro Fleck über die Vertexfarbe, damit ein Material reicht.
    const c = new Float32Array(g.attributes.position.count * 3).fill(opacity);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(geos),
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
      depthWrite: false,
      toneMapped: false,
    })
  );
  mesh.name = 'prop-contact-shadows';
  mesh.renderOrder = 1;
  return mesh;
}

// --- Zusammenbau --------------------------------------------------------------

export function buildProps() {
  const group = new THREE.Group();
  group.name = 'dojo-props';

  // Ein Eimer je Material. `core` ist Rochenhaut/Asche, `fibre` alles Faserige
  // (Stroh, Seil, Ito), `fabric` das Kissen.
  const steelMat = steelMaterial(0xffffff);
  const metalMat = ironMaterial(0xffffff);
  const lacquerMat = lacquerMaterial(0xffffff);
  const woodMat = hinokiMaterial({ roughness: 0.82 });
  const fibreMat = ropeMaterial(0xffffff);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    normalMap: fibreMat.normalMap,
    roughness: 0.78,
    metalness: 0,
  });
  const fabricMat = ropeMaterial(0xffffff);
  fabricMat.roughness = 0.98;

  const B = {
    steel: makeBucket(steelMat),
    metal: makeBucket(metalMat),
    lacquer: makeBucket(lacquerMat),
    wood: makeBucket(woodMat),
    fibre: makeBucket(fibreMat),
    core: makeBucket(coreMat),
    fabric: makeBucket(fabricMat),
  };

  addRack(B);
  addMakiwara(B);

  // Zabuton-Paar, zur Tokonoma hin ausgerichtet. Weit genug vom Ursprung, dass
  // die Ideenkarten frei bleiben.
  addZabuton(B, -0.72, -3.62, 0.06);
  addZabuton(B, 0.72, -3.62, -0.06);

  // Weihrauchbrenner auf dem erhöhten Nischenboden, neben dem Rollbild.
  const censer = { x: 0.74, y: TOKONOMA.floorY, z: WALL.north - TOKONOMA.depth + 0.24 };
  addCenser(B, censer.x, censer.y, censer.z);

  // Stangenwaffen-Ständer an der Westwand – er enthält auch die beiden Bokken,
  // die vorher frei an der Wand lehnten.
  addPoleRack(B);

  // Zwei Bodenvasen, die den Süd-Eingang flankieren. Weit genug auseinander,
  // dass sie den Durchgang rahmen statt ihn zu verengen.
  const vaseZ = ROOM.maxZ - 0.62;
  const vaseY = 0.055;
  const blattStellen = [];
  for (const [i, x] of [-1.62, 1.62].entries()) {
    const height = i === 0 ? 0.78 : 0.68;
    const g = vaseGeometry(height);
    g.translate(x, vaseY, vaseZ);
    // Seladon und Eisenglasur – zwei Vasen in derselben Farbe wären ein Paar
    // Kegel, zwei verschiedene sind zwei Vasen.
    // **Glasur statt Anstrich.** `contactAO` allein macht eine gleichmäßig
    // gefärbte Fläche mit einem dunklen Saum unten – im Bild las sich das als
    // lackiertes Plastik. Eine Keramikglasur ist nie gleichmäßig: Sie läuft
    // beim Brand nach unten, staut sich an der Schulter und über dem Fuß und
    // bleibt am Bauch am dünnsten, wo sie am hellsten wirkt. Das ist mit einer
    // Höhenfunktion je Vertex zu haben und kostet keine Textur.
    const glasur = (x, y, z) => {
      const t = Math.min(1, Math.max(0, (y - vaseY) / height));
      // Kontaktverdunkelung unten (wie bisher), heller Bauch, Stau am Hals.
      const kontakt = 0.52 + 0.48 * Math.min(1, t / 0.28);
      const bauch = 1 + 0.16 * Math.sin(Math.min(1, t / 0.55) * Math.PI);
      const hals = 1 - 0.14 * Math.min(1, Math.max(0, (t - 0.62) / 0.3));
      // Feine Streuung, damit die Fläche nicht wie gegossen wirkt. Über die
      // Weltposition statt über den Vertexindex – sonst läuft das Muster mit
      // der Segmentierung mit und man sieht die Drehachse.
      const korn = 1 + 0.035 * Math.sin(x * 47 + z * 31 + y * 23);
      return kontakt * bauch * hals * korn;
    };
    B.lacquer.geos.push(tint(g, i === 0 ? 0x4a5f56 : 0x33323a, glasur));

    const { stems, leafSpots } = ikebanaStems(x, vaseZ, vaseY, height, 0x51a7 + i * 977);
    for (const st of stems) B.wood.geos.push(tint(st, 0x53412e));
    blattStellen.push(...leafSpots);
  }

  // --- Laub im Gesteck ----------------------------------------------------
  //
  // Eigenes Netz, weil es das einzige Prop mit alpha-getesteter Blattkarte ist –
  // in einen Materialeimer gesteckt bräuchte der ganze Eimer den Alphatest, und
  // der verbietet das frühe Verwerfen von Fragmenten für Klingen, Lack und Holz
  // gleich mit.
  //
  // Kein Wind: Drinnen weht keiner. Dieselbe Karte wie draußen, aber
  // stillgestellt – ein Ahornzweig, der im geschlossenen Raum wippt, ist genau
  // die Sorte Detail, die eine Szene entlarvt statt sie zu tragen.
  if (blattStellen.length) {
    const material = foliageMaterial({
      atlas: leafAtlas('maple'),
      translucency: 0.55,
      windStrength: 0,
    });
    const geos = blattStellen.map(({ p, s }) => {
      const g = cardCluster({ count: 20, radius: 1, seed: 0x2f1, kind: 'maple', cardScale: 0.72 });
      g.scale(s, s, s);
      g.translate(p.x, p.y, p.z);
      return g;
    });
    const leaves = new THREE.Mesh(mergeGeometries(geos), material);
    applyFoliageMaterial(leaves, material);
    leaves.name = 'props-ikebana-laub';
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    group.add(leaves);
    for (const g of geos) g.dispose();
  }

  for (const key of Object.keys(B)) {
    const { material, geos } = B[key];
    if (!geos.length) continue;
    // Indizierte und nicht-indizierte Teile lassen sich nicht mischen –
    // vereinheitlichen, wie environments.js:628.
    const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `props-${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of geos) g.dispose();
  }

  // Wandbild an der Waffenwand. Eigenes Mesh, weil es als einziges Prop eine
  // Farbtextur trägt – in einen Materialeimer gesteckt bräuchte der ganze
  // Eimer sie.
  const artW = 2.6;
  const artH = 1.3;
  const artGeo = new THREE.PlaneGeometry(artW, artH);
  artGeo.rotateY(Math.PI / 2);
  artGeo.translate(WALL.west + 0.135, 1.02, 1.9);
  const painting = new THREE.Mesh(
    artGeo,
    new THREE.MeshStandardMaterial({ map: paintingTexture(), roughness: 0.86, metalness: 0.08 })
  );
  painting.name = 'dojo-wandbild';
  painting.receiveShadow = true;
  group.add(painting);

  // Rahmen ringsum, dunkles Holz – ohne ihn klebt die Tafel als Aufkleber an
  // der Wand statt davorzustehen.
  const frameGeos = [];
  for (const [w, h, dy, dz] of [
    [artW + 0.13, 0.065, artH / 2 + 0.03, 0],
    [artW + 0.13, 0.065, -artH / 2 - 0.03, 0],
    [0.065, artH + 0.19, 0, artW / 2 + 0.03],
    [0.065, artH + 0.19, 0, -artW / 2 - 0.03],
  ]) {
    frameGeos.push(
      new THREE.BoxGeometry(0.055, h, w).translate(WALL.west + 0.115, 1.02 + dy, 1.9 + dz)
    );
  }
  const artFrame = new THREE.Mesh(
    mergeGeometries(frameGeos, false),
    new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.7 })
  );
  artFrame.name = 'dojo-wandbild-rahmen';
  artFrame.castShadow = true;
  group.add(artFrame);

  const scroll = buildScroll();
  group.add(scroll);

  const smoke = buildSmoke(new THREE.Vector3(censer.x + 0.006, censer.y + 0.172, censer.z));
  group.add(smoke.mesh);

  group.add(
    buildBlobShadows([
      { x: RACK.x + 0.03, z: RACK.z, r: 0.42, opacity: 0.95 },
      { x: MAKIWARA.x, z: MAKIWARA.z, r: 0.26, opacity: 1 },
      { x: -0.72, z: -3.62, r: 0.36, opacity: 0.8 },
      { x: 0.72, z: -3.62, r: 0.36, opacity: 0.8 },
      { x: censer.x, z: censer.z, r: 0.1, y: TOKONOMA.floorY + 0.008, opacity: 1 },
      // Stangenständer statt der früheren zwei angelehnten Bokken.
      { x: POLE.x - 0.02, z: POLE.z, r: 0.5, opacity: 0.95 },
      // **Die beiden Vasen am Eingang.**
      //
      // Sie standen nachweislich auf der Diele (Boden bei y = 0,055, exakt
      // Dielenoberkante) – und sahen trotzdem aus, als schwebten sie. Ein
      // unabhängiger Kritiker hat es als „schwebt 70 cm über dem Boden"
      // gemeldet, und das ist die interessante Stelle: Nicht die Lage war
      // falsch, sondern es fehlte das **Kontaktzeichen**. Ohne dunkle Fuge am
      // Fuß liest das Auge keinen Bodenkontakt, egal wo das Objekt steht.
      { x: -1.62, z: ROOM.maxZ - 0.62, r: 0.26, opacity: 1 },
      { x: 1.62, z: ROOM.maxZ - 0.62, r: 0.23, opacity: 1 },
    ])
  );

  // Freizone-Prüfung. Lieber ein lauter Hinweis in der Konsole als Karten, die
  // in einem Kissen stecken (layout.js:37).
  if (typeof console !== 'undefined') {
    const anchors = [
      ['rack', RACK.x, RACK.z],
      ['makiwara', MAKIWARA.x, MAKIWARA.z],
      ['zabuton-l', -0.72, -3.62],
      ['zabuton-r', 0.72, -3.62],
      ['censer', censer.x, censer.z],
      ['bokken', WALL.west + 0.24, -1.78],
      ['kakemono', TOKONOMA.centerX, WALL.north - TOKONOMA.depth],
    ];
    for (const [name, x, z] of anchors) {
      if (insideFreeZone(x, z, 0.35)) {
        console.warn(
          `[dojo-props] "${name}" liegt bei r=${Math.hypot(x, z).toFixed(2)} m zu nah an der Freizone (${FREE_RADIUS} m).`
        );
      }
    }
  }

  const swaySeed = 0.0;
  return {
    group,
    update(time) {
      // Rollbild: Die Luft im Raum bewegt es kaum – zwei langsame,
      // gegeneinander laufende Schwingungen um die Aufhängung, Amplitude
      // wenige Millimeter am unteren Rand. Alles Größere sieht nach Windmaschine
      // aus, alles Kleinere sieht man nicht.
      scroll.rotation.z = Math.sin(time * 0.29 + swaySeed) * 0.0045;
      scroll.rotation.x = Math.sin(time * 0.221 + 1.1) * 0.0062 + 0.004;
      smoke.update(time);
    },
  };
}
