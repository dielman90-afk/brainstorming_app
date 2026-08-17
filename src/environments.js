import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDojoEnvironment } from './dojo/index.js';
import { heightToMaps, scaleUV } from './dojo/materials.js';
import { mossMaterial, waterMaterial, updateWater } from './dojo/ground.js';
import {
  graniteMaterial,
  mossPatina,
  boxProjectUV,
  weatheredWoodMaterial,
  weatheredStoneGeometry,
} from './dojo/stonework.js';
import {
  leafAtlas,
  foliageMaterial,
  cardCluster,
  applyFoliageMaterial,
  updateFoliage,
  blobGeometry,
  branchInto,
} from './dojo/foliage.js';
import { buildSkyEnvironment } from './dojo/skylight.js';
import { applyQuality } from './dojo/quality.js';

// Fünf umschaltbare VR-Umgebungen, komplett prozedural (keine externen Assets):
//   🏝 Himmelsinsel – Low-Poly-Insel mit Bäumen, Fluss/Wasserfall und Wolken
//   🌌 Nachthimmel  – Sternenfeld, Mond und rötlicher Mars-Untergrund
//   🪷 Zen-Garten   – ruhige Kies-/Steinlandschaft
//   ⬜ Konstrukt    – nahtloser, komplett weißer Void („Matrix"-Ladeprogramm)
//   ⛩ Konstrukt-Dojo – der Trainingsraum aus demselben Film (src/dojo/)
//
// **Die Module unter `src/dojo/` sind nicht nur fürs Dojo.** `materials.js`,
// `ground.js`, `stonework.js` und `foliage.js` sind generisch, und seit dieser
// Runde importieren der Zen-Garten, die Himmelsinsel und der Nachthimmel sie
// ebenfalls: Normal- und Rauheitskarten, Granit mit Moospatina, Blattkarten mit
// Wind und Transluzenz. Der Ordnername ist damit ein leichter Fehlname; der
// Kommentar oben in `dojo/materials.js` hält fest, warum trotzdem nichts
// verschoben wird.
//
// Der Anlass ist eine Messung, keine Stilfrage: Vor dieser Runde hatten die drei
// Umgebungen zusammen **240 Materialien und keine einzige Normal- oder
// Rauheitskarte**. Genau das ist der Unterschied, der sie neben dem Dojo wie
// Spielzeug aussehen ließ – nicht die Polygonzahl.
//
// Das Dojo selbst bleibt der Ort mit echten Schatten und eigener
// Environment-Map. Es liegt in eigenen Dateien unter `src/dojo/` – diese hier
// hat schon 2600 Zeilen.
//
// Das frühere „🌐 Studio" (heller Verlauf mit weichem Boden) ist entfernt: Es war
// vom Konstrukt kaum zu unterscheiden – beides eine helle, leere Kuppel – und
// verlängerte den Durchlauf des 🌐-Buttons ohne erkennbaren Unterschied.
// Jede Umgebung: { id, name, background, group, update?(time) }
// Keine Umgebung besitzt ein Boden-Raster.

// Deterministisches Rauschen auf Positionsbasis – Nahtvertices (gleiche Position)
// verschieben sich identisch, es entstehen keine Risse im Mesh.
function hashNoise(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

const TAU = Math.PI * 2;

// Kürzester Winkelabstand, damit Formmerkmale (Landzunge, Bucht, Höhenrücken)
// über die 0/2π-Naht hinweg stetig bleiben.
function angDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Glockenkurve – weiche, lokal begrenzte Formmerkmale ohne harte Kanten.
function gauss(d, s) {
  const t = d / s;
  return Math.exp(-t * t);
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Himmelskuppel mit vertikalem Farbverlauf (von innen sichtbar)
function makeDome(topColor, horizonColor, bottomColor = horizonColor, radius = 44) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(topColor) },
      horizonColor: { value: new THREE.Color(horizonColor) },
      bottomColor: { value: new THREE.Color(bottomColor) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vPos;
      void main() {
        float h = normalize(vPos).y;
        vec3 col = h > 0.0
          ? mix(horizonColor, topColor, pow(h, 0.8))
          : mix(horizonColor, bottomColor, pow(-h, 0.8));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), material);
  dome.renderOrder = -1; // zuerst zeichnen, damit Sterne/Sprites darüber liegen
  return dome;
}

function makeGlowTexture(inner, mid = inner, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, mid);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// --- Gefälschter Kontaktschatten (Blob-Shadow) statt teurer Shadow-Maps ---
// Eine geteilte dunkle Radial-Textur + geteilte Plane-Geometrie erden Objekte
// nahezu kostenlos. Nur Skalierung/Position pro Instanz.
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
const _shadowGeo = new THREE.PlaneGeometry(1, 1);
function makeBlobShadow(radius = 0.5, opacity = 1, y = 0.012) {
  const mesh = new THREE.Mesh(
    _shadowGeo,
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    })
  );
  mesh.name = 'blob-shadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.position.y = y;
  mesh.renderOrder = 1; // knapp über dem opaken Boden
  return mesh;
}

// Weiche Vertex-Färbung (gebackenes AO / Mottling) auf eine Geometrie legen.
// tint(x,y,z) → Faktor (multipliziert die Materialfarbe pro Vertex).
function bakeVertexShade(geometry, tint) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = tint(pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Vertices bunt einfärben (feste Farbe) – für zusammengesetzte Geometrien (Pilze).
function paintVertices(geometry, hex) {
  const c = new THREE.Color(hex);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Vertices radial verschieben (organische Kanten). smooth=true behält die
// Indizierung, damit die Wandflächen glatt statt facettiert schattiert werden.
function displaceRadial(geometry, amount, yAmount = 0, smooth = false) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const n = 1 + (hashNoise(x, y, z) - 0.5) * amount;
    pos.setX(i, x * n);
    pos.setZ(i, z * n);
    if (yAmount) pos.setY(i, y + (hashNoise(z, x, y) - 0.5) * yAmount);
  }
  if (smooth) {
    geometry.computeVertexNormals();
    return geometry;
  }
  const nonIndexed = geometry.toNonIndexed();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

// --- Geometrie-Eimer: viele kleine Teile → EIN Mesh --------------------------
//
// Der Engpass der Umgebung sind nicht Dreiecke (Budget 350 000, belegt ~30 000),
// sondern Draw-Calls (Budget 120, im Ausgangsstand 112 belegt). Alles, was sich
// nicht bewegt, wandert deshalb in einen Eimer und wird einmal gezeichnet.
// Farbe kommt über Vertex-Farben, damit ein Material für viele Töne reicht.
class GeoBucket {
  constructor() {
    this.parts = [];
  }

  // geo wird verbraucht (nicht kopiert). color: Hex, THREE.Color oder
  // Funktion (x, y, z) → Hex/THREE.Color.
  add(geo, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const fixed = typeof color === 'function' ? null : c.set(color);
    for (let i = 0; i < pos.count; i++) {
      const v = fixed ?? c.set(color(pos.getX(i), pos.getY(i), pos.getZ(i)));
      colors[i * 3] = v.r;
      colors[i * 3 + 1] = v.g;
      colors[i * 3 + 2] = v.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Zusatzattribute (z.B. Tangenten) verhindern das Verschmelzen.
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    }
    this.parts.push(g);
    return this;
  }

  mesh(material, name) {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    const m = new THREE.Mesh(merged, material);
    if (name) m.name = name;
    return m;
  }
}

// --- Kronen aus vielen kleinen Schöpfen -------------------------------------
//
// **Der Fehler, den dieser Bauer verhindert, steht seit Runde 6 als Kommentar
// in exterior.js – und ich habe ihn trotzdem wiederholt.** Dort heißt es:
//
//   „Drei kleine Schöpfe je Zweigende statt eines großen. Mit 0,34–0,60 m
//    Radius war jeder Schopf eine glatte Blase; zusammen ergaben sie einen
//    Blumenkohl. Eine aufgelöste Kronensilhouette entsteht aus **Anzahl**,
//    nicht aus Rauschen auf einer großen Kugel."
//
// Der erste Anlauf dieser Runde hat jeder Sakura-Krone **einen** Hüllkörper mit
// bis zu 0,9 m Radius gegeben und ein paar Blattkarten davorgehängt. Aus zwei
// Metern war das ein glatter rosa Ballon mit aufgeklebten Fetzen – genau die
// Beschreibung oben, nur eine Umgebung weiter.
//
// Das Rezept, das im Dojo-Garten funktioniert und hier übernommen wird:
//
//   * Schopfradius 0,15–0,32 m, **drei bis vier** je Ansatzpunkt statt einem
//   * der Hüllkörper ist Masse und Verdecker, nicht die Krone: dunkel, klein
//   * die Karten sitzen bei 1,12× darüber und machen Kontur und Silhouette
//   * `blobGeometry` statt `IcosahedronGeometry`: verrauscht und zusammengeführt,
//     also weich schattiert statt facettiert
//
// @param ansaetze  [[x, y, z, radius], …] – die groben Kronenpositionen
// @returns {{ blobs: THREE.InstancedMesh, karten: THREE.InstancedMesh }}
function baueKrone({
  ansaetze,
  seed,
  kartenMaterial,
  kind,
  farben,
  kartenFarben,
  cardScale,
  // Wie weit die Kartenschale über dem Hüllkörper liegt. Zu wenig, und der
  // Hüllkörper bildet die Silhouette; zu viel, und die Karten schweben.
  schale = 1.2,
  // Wie weit der Hüllkörper **innerhalb** der Kartenschale sitzt. Er ist
  // Verdecker, nicht Silhouette: Wer ihn auf 1,0 lässt, sieht ihn.
  kern = 0.88,
  dichte = 70,
}) {
  const r = mulberry32(seed);
  const schoepfe = [];
  for (const [ax, ay, az, ar] of ansaetze) {
    // Anzahl aus dem Radius: Ein großer Ansatz bekommt mehr Schöpfe, nicht
    // größere. Genau das ist der Unterschied zwischen Krone und Blumenkohl.
    //
    // **Streuung und Schopfgröße hängen zusammen.** Der erste Anlauf streute
    // über ±0,75·ar und machte Schöpfe von 0,30–0,52·ar – die Krone wurde
    // dadurch löchrig *und* kleiner als der Ansatz, und auf der Insel
    // schrumpften die Bäume auf grüne Punkte. Streuung und Größe zusammen
    // müssen rund `ar` ergeben, damit die Krone die Ausdehnung behält, die die
    // Ansatzliste beschreibt: 0,55 + 0,62 ≈ 1,17.
    // **Weniger Schöpfe je Ansatz, seit die Ansätze an Astspitzen sitzen.**
    //
    // Mit `branchInto()` hat ein Laubbaum statt zwei Kronenansätzen jetzt zwölf
    // bis vierundzwanzig – die Streuung leisten die Zweige. Bei unverändert
    // fünf Schöpfen je Ansatz sprang die Insel von 80.052 auf 240.016 Dreiecke,
    // also weit über das mobile Limit. Gemessen mit stufen.mjs.
    const n = Math.max(2, Math.round(ar * 9));
    for (let k = 0; k < n; k++) {
      schoepfe.push({
        x: ax + (r() - 0.5) * ar * 1.1,
        y: ay + (r() - 0.45) * ar * 0.8,
        z: az + (r() - 0.5) * ar * 1.1,
        s: ar * (0.42 + r() * 0.2),
        ton: Math.floor(r() * farben.length),
        dreh: [r() * 0.6, r() * Math.PI * 2, r() * 0.6],
      });
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const setze = (mesh, faktor, palette) => {
    schoepfe.forEach((c, i) => {
      const s = c.s * faktor;
      q.setFromEuler(new THREE.Euler(...c.dreh));
      m.compose(
        new THREE.Vector3(c.x, c.y, c.z),
        q,
        new THREE.Vector3(s * 1.25, s, s * 1.15)
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(palette[c.ton % palette.length]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.userData.fullCount = schoepfe.length;
  };

  const blobs = new THREE.InstancedMesh(
    // **Detailstufe 0, nicht 1.** Ein Hüllkörper ist Verdecker hinter dichten
    // Karten; seine Facetten sieht niemand, seine Dreiecke zahlt man trotzdem.
    // Stufe 1 sind 80 Dreiecke je Schopf, Stufe 0 sind 20 – bei rund 220
    // Schöpfen auf der Insel ein Unterschied von 13.000 Dreiecken für nichts.
    // Gemessen mit inselkosten.mjs.
    blobGeometry(0, seed ^ 0x51, 0.72),
    // Lambert statt Standard: Der Hüllkörper soll dunkle Masse sein, kein
    // Material mit Glanzlicht. Er spart damit auch den PBR-Pfad im Shader.
    new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false }),
    schoepfe.length
  );
  setze(blobs, kern, farben);

  const karten = new THREE.InstancedMesh(
    cardCluster({ count: dichte, radius: 1, seed: seed ^ 0x2f71, kind, cardScale }),
    kartenMaterial,
    schoepfe.length
  );
  applyFoliageMaterial(karten, kartenMaterial);
  setze(karten, schale, kartenFarben);

  return { blobs, karten };
}

// Materialien der Inselbäume, einmal für alle.
//
// Vorher legte **jeder Baum** zwei eigene an (Stamm und Laub), obwohl sie sich
// nur in einem von zwei Grüntönen unterschieden. Bei dreißig Bäumen über
// Haupt- und Mini-Inseln sind das sechzig Materialien für zwei Farben.
//
// `laubMat` heißt bewusst nicht mehr `foliageMaterial`: So hieß hier eine
// lokale Variable, und seit dieser Datei die gleichnamige Funktion aus
// `dojo/foliage.js` importiert, hätte der eine den anderen verdeckt.
let _inselHolz = null;
let _inselLaub = null;
let _inselKarten = null;
let _inselNadeln = null;
function inselBaumMaterialien() {
  if (!_inselHolz) {
    _inselHolz = weatheredWoodMaterial({ tone: 0x8f6a48, vertexColors: false });
    _inselLaub = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
      vertexColors: true,
    });
    _inselNadeln = foliageMaterial({
      atlas: leafAtlas('nadel'),
      // Nadeln sind steif und wachsig: wenig Wind, wenig Transluzenz. Eine
      // Konifere im Gegenlicht leuchtet **nicht** – das ist der halbe
      // Unterschied zu einem Laubbaum.
      translucency: 0.35,
      transColor: 0x9cc47a,
      windStrength: 0.03,
      roughness: 0.7,
      color: 0xbfe3a8,
    });
    _inselKarten = foliageMaterial({
      atlas: leafAtlas('azalea'),
      // Aufgehellt auf das Inselgrün. Der Azaleen-Atlas ist für den schattigen
      // Dojo-Garten gezeichnet; unverändert standen seine Blätter als dunkle
      // Flecken vor den hellen Kronen, statt sie aufzulösen.
      // Kräftig aufgehellt. Der Azaleen-Atlas ist mit Grundton [56 | 92 | 48]
      // für den schattigen Dojo-Garten gezeichnet; die Insel ist eine helle
      // Cartoon-Landschaft, und unverändert standen die Karten als dunkle
      // Flecken auf den Kronen statt sie aufzulösen.
      color: 0xe8ffd0,
      translucency: 0.95,
      transColor: 0xdcf7b0,
      windStrength: 0.06,
    });
  }
  return { holz: _inselHolz, laub: _inselLaub, karten: _inselKarten, nadeln: _inselNadeln };
}

function makeTree(rand) {
  const tree = new THREE.Group();
  const trunkHeight = 0.5 + rand() * 0.5;
  const { holz, laub: laubMat, karten, nadeln } = inselBaumMaterialien();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, trunkHeight, 8), holz);
  trunk.position.y = trunkHeight / 2;
  tree.add(trunk);

  // Krone nach demselben Rezept wie im Zen-Garten: viele kleine Schöpfe, der
  // Hüllkörper als Verdecker darunter. Der erste Anlauf dieser Runde hatte hier
  // einen glatten Ball von 0,36 m Radius mit ein paar Karten davor – aus zwei
  // Metern ein grüner Luftballon mit Aufklebern.
  const hell = rand() > 0.5;
  const ansaetze = [];
  const nadelbaum = rand() > 0.45;

  if (nadelbaum) {
    // **Die gestapelten Kegel sind entfallen.**
    //
    // Sie waren die Silhouette *und* die Oberfläche zugleich: drei glatte
    // Trichter übereinander, an denen jede Karte als Aufkleber saß. Eine
    // Konifere hat keine glatte Mantelfläche, sie hat Etagen aus Zweigen mit
    // Lücken dazwischen, durch die man den Stamm sieht.
    //
    // Jetzt ist der Baum eine **Reihe von Ansätzen mit abnehmendem Radius** –
    // dieselbe Bauweise wie beim Laubbaum, nur als Kegel angeordnet statt als
    // Kugel. Die Silhouette entsteht aus den Schöpfen, nicht aus einem Trichter.
    // **Der Etagenabstand folgt dem Radius, nicht einem festen Schritt.**
    //
    // Vorher lagen die Etagen in gleichen Abständen von 0,29 übereinander,
    // während ihr Radius nach oben von 0,46 auf 0,13 fiel. Oben standen die
    // Schöpfe dadurch weiter auseinander als sie groß waren: Im Bild schwebte
    // die oberste Etage als abgetrennter dunkler Klecks 1,6 m über der
    // Baumspitze. Per Strahl nachgewiesen – der Treffer war `island-laub` bei
    // y = 7,3, die Spitze darunter bei 5,7.
    //
    // Jetzt wächst y um den Radius der jeweiligen Etage. Damit überlappen zwei
    // aufeinanderfolgende Etagen zwangsläufig, egal wie schnell der Radius
    // abnimmt.
    let ey = trunkHeight + 0.1;
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const radius = 0.46 * (1 - t * 0.78);
      ansaetze.push([(rand() - 0.5) * 0.05, ey, (rand() - 0.5) * 0.05, radius]);
      // 0,95 statt 1,0: eine Spur enger als der Radius, damit die Etagen sich
      // sicher schneiden statt sich nur zu berühren.
      ey += radius * 0.95;
    }
  } else {
    // **Laubbaum mit echtem Astwerk.**
    //
    // Vorher: zwei Kronenansätze über einem nackten Kegelstumpf. Der Stamm
    // endete abrupt, es gab keinen Übergang zur Krone, und die Krone war eine
    // Masse auf einem Stab. Der Dojo-Garten hat denselben Fehler schon einmal
    // gehabt, und der Kommentar dort sagt, warum es keine Farbfrage ist:
    //
    //   „Ein Baum wird nicht durch seine Krone glaubwürdig, sondern durch die
    //    Zweige, die man **durch** sie sieht."
    //
    // `branchInto()` verzweigt rekursiv über drei Ebenen. Die Laubschöpfe
    // sitzen auf den **Zweigenden**, nicht als Kugel über allem – dadurch löst
    // sich die Silhouette auf und man sieht Äste durch die Krone.
    const teile = [];
    const oben = new THREE.Vector3(0, trunkHeight, 0);
    const nb = 3 + Math.floor(rand() * 2);
    for (let k = 0; k < nb; k++) {
      const az = (k / nb) * Math.PI * 2 + rand() * 0.9;
      const dir = new THREE.Vector3(
        Math.cos(az) * 0.6,
        0.74,
        Math.sin(az) * 0.6
      ).normalize();
      branchInto(teile, oben, dir, 0.34 + rand() * 0.14, 0.035, 2, rand);
    }
    const astGeos = teile.map((t) => t.geo);
    const aeste = new THREE.Mesh(mergeGeometries(astGeos, false), holz);
    aeste.name = 'island-aeste';
    tree.add(aeste);
    for (const t of teile) {
      if (t.depth > 0) continue;
      ansaetze.push([t.tip.x, t.tip.y, t.tip.z, 0.17 + rand() * 0.06]);
    }
  }

  const grundton = nadelbaum
    // Sehr dunkel und entsättigt: Der Hüllkörper einer Konifere ist der
      // Schatten **zwischen** den Zweigen, nicht eine zweite Grünfläche. Mit
      // 0x24503a blitzte er als flacher türkiser Fleck durch die Nadeln.
      ? [0x16281c, 0x1c3324, 0x101f16]
    : // Auch beim Laubbaum ist der Hüllkörper der Schatten **zwischen** den
      // Blättern. Die alten Werte waren die Kronenfarbe von früher, als er die
      // Krone *war* – heller als die Karten davor, also blitzte er als
      // hellgrüner Fleck durch. Derselbe Fehler wie beim Nadelbaum.
      hell
      ? [0x1f3f26, 0x27492d, 0x1a3521]
      : [0x27482e, 0x2f5436, 0x203e27];
  const krone = baueKrone({
    ansaetze,
    seed: 0x1de4 + Math.floor(rand() * 512),
    kartenMaterial: nadelbaum ? nadeln : karten,
    kind: nadelbaum ? 'nadel' : 'azalea',
    // Nadelschöpfe stehen dichter und kleiner als Laubschöpfe.
    cardScale: nadelbaum ? 0.95 : 0.85,
    // Auch die Kartendichte sinkt: Viele kleine Schöpfe brauchen jeder für
    // sich weniger Karten als wenige große, weil sie sich gegenseitig füllen.
    dichte: nadelbaum ? 74 : 64,
    farben: grundton,
    kartenFarben: nadelbaum
      ? [0xd8f0c0, 0xc6e4ae, 0xe4ffd0]
      : [0xdcf5b8, 0xcbeaa4, 0xe6ffc8],
  });
  krone.blobs.name = 'island-krone';
  krone.karten.name = 'island-laub';
  tree.add(krone.blobs, krone.karten);

  return tree;
}

// Zufällig, aber reproduzierbar aus einer Palette wählen.
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// ---------------------------------------------------------------------------
// Formbeschreibung einer schwebenden Insel
// ---------------------------------------------------------------------------
//
// Grundriss, Oberflächenhöhe und Flankenprofil stecken in EINER analytischen
// Beschreibung. Geometrie und Objektplatzierung benutzen dieselben Funktionen –
// dadurch kann nichts schweben und nichts im Boden stecken.
//
// Wichtige Einschränkung: Die Fortbewegung (locomotion.js) kennt kein Gelände,
// der Nutzer läuft immer auf y = 0. Die begehbare Innenfläche bleibt deshalb
// bewusst eben; die Höhenentwicklung setzt erst außerhalb davon ein und geht in
// den felsigen Randwall über, der ohnehin nicht zum Betreten einlädt.
const ISLAND_TOP_Y = -0.02; // Höhe der ebenen Grasfläche (Bestand beibehalten)
const ISLAND_FLAT_R = 0.58; // bis hierhin (Anteil des Radius) bleibt es eben

function makeIslandShape(rand, { radius = 5, depth = 5, river = null } = {}) {
  const p0 = rand() * TAU;
  const p1 = rand() * TAU;
  const p2 = rand() * TAU;
  const headland = rand() * TAU; // eine weit vorspringende Landzunge
  const bay = headland + 2.0 + rand() * 1.2; // eine tiefe Bucht gegenüber
  const notch = headland + 0.9 + rand() * 0.6; // ein schmaler Einschnitt daneben
  const nx = rand() * 60;
  const nz = rand() * 60;
  const strataPhase = rand() * TAU;
  const strataTilt = rand() * TAU; // die Bänke liegen schräg, nicht waagerecht
  const strataRate = 4.2 + rand() * 2.6; // Bankdicke: je Insel anders
  const fracPhase = rand() * 40;
  const leanX = (rand() - 0.5) * 0.9; // der Felskeil hängt schief, nicht mittig
  const leanZ = (rand() - 0.5) * 0.9;
  const chimneyA = rand() * TAU; // eine durchgehende Kaminspalte
  const ledgeA = rand() * TAU; // ein überkragendes Felsgesims

  // EIN dominanter Kiel plus zwei bis drei kleinere Strebepfeiler. Ohne die
  // Größenstaffelung („eine Großform, zwei mittlere, viele kleine") endet die
  // Unterseite in einer Reihe gleich großer Zacken.
  const spurs = [
    {
      a: rand() * TAU,
      w: 0.62,
      amp: 0.30 + rand() * 0.12,
      at: 0.48,
      deeper: 0.42 + rand() * 0.20,
    },
  ];
  for (let i = 0, n = 2 + Math.floor(rand() * 2); i < n; i++) {
    spurs.push({
      a: rand() * TAU,
      w: 0.20 + rand() * 0.16,
      amp: 0.16 + rand() * 0.16,
      at: 0.30 + rand() * 0.34,
      deeper: 0.06 + rand() * 0.12,
    });
  }
  // Der Höhenrücken liegt dem Wasserfall gegenüber: Das Wasser braucht die
  // niedrige Seite, der Blick bekommt auf der anderen einen Abschluss.
  const ridgeA = river != null ? river + Math.PI : rand() * TAU;

  // Grundriss. Eine schwach gewellte Ellipse liest sich als schwarze Kontur
  // immer noch als Kartoffel – es braucht echte Konkavität. Deshalb greifen
  // Landzunge, Bucht und Einschnitt kräftig ein: der Radius schwankt zwischen
  // rund 0,6 und 1,3.
  const outline = (a) =>
    1 +
    0.090 * Math.sin(3 * a + p0) +
    0.055 * Math.sin(5 * a + p1) +
    0.028 * Math.sin(8 * a + p2) +
    0.30 * gauss(angDelta(a, headland), 0.30) -
    0.24 * gauss(angDelta(a, bay), 0.38) -
    0.17 * gauss(angDelta(a, notch), 0.19);

  // --- Flusslauf (nur Hauptinsel): eine Kurve, die Gelände UND Wasser teilen ---
  let riverCurve = null;
  let riverPts = null;
  if (river != null) {
    const er = radius * outline(river) - 0.32;
    riverCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 0, 0.2),
      new THREE.Vector3(Math.sin(river) * er * 0.34 + 0.5, 0, Math.cos(river) * er * 0.34 - 0.32),
      new THREE.Vector3(Math.sin(river) * er * 0.7 - 0.38, 0, Math.cos(river) * er * 0.7 + 0.42),
      new THREE.Vector3(Math.sin(river) * er, 0, Math.cos(river) * er),
    ]);
    riverPts = [];
    for (let i = 0; i <= 44; i++) {
      const p = riverCurve.getPoint(i / 44);
      riverPts.push(p.x, p.z);
    }
  }
  const riverDist = (x, z) => {
    if (!riverPts) return 99;
    let best = 1e9;
    for (let i = 0; i < riverPts.length; i += 2) {
      const dx = x - riverPts[i];
      const dz = z - riverPts[i + 1];
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  // Oberfläche: eben in der Mitte, nach außen ein weicher Wall, am Rand
  // abgerundet nach unten (die Grasnarbe legt sich über die Kante), plus die
  // eingeschnittene Flussrinne.
  const relief = (x, z) => {
    const a = Math.atan2(x, z);
    const R = radius * outline(a);
    const rr = Math.hypot(x, z) / R;
    const band = smoothstep(ISLAND_FLAT_R, 0.90, rr);
    const ridge = 0.60 * gauss(angDelta(a, ridgeA), 1.0) + 0.14;
    const rough = fbm2(x * 0.52 + nx, z * 0.52 + nz) * 0.62;
    let h = band * (ridge + rough);
    // Abrisskante statt Rundung: Die Grasnarbe endet in ungleichmäßigen Zungen
    // und Kerben, nicht als überall gleich dicker, rundgeschliffener Wulst.
    const tear = valueNoise2(Math.cos(a) * 13 + 5, Math.sin(a) * 13 + 9);
    const tear2 = valueNoise2(Math.cos(a) * 5.7 + 27, Math.sin(a) * 5.7 + 2);
    const fineTear = valueNoise2(Math.cos(a) * 27 + 11, Math.sin(a) * 27 + 33);
    h -= smoothstep(0.88, 1.0, rr) * (0.14 + 0.42 * tear * tear2);
    h -= smoothstep(0.955, 1.0, rr) * 0.16 * fineTear;
    h -= smoothstep(0.962, 1.0, rr) * (h + 0.06); // kurze, steile Traufkante
    h -= 0.09 * gauss(riverDist(x, z), 0.40); // Flussbett eingeschnitten
    return h;
  };
  const heightAt = (x, z) => ISLAND_TOP_Y + relief(x, z);
  const edgeY = (a) => heightAt(Math.sin(a) * radius * outline(a), Math.cos(a) * radius * outline(a));

  // --- Flanke: Erdschicht, dann geschichteter, zerklüfteter Fels ---
  const EARTH_END = 0.20; // mittlerer Anteil der Flanke, der Erdreich ist
  // Die Dicke der Erdschicht schwankt STARK: An manchen Stellen stößt der Fels
  // bis unter die Grasnarbe durch, an anderen läuft Erde tief in eine Spalte.
  // Eine überall gleich dicke Schicht ergibt eine umlaufend höhengleiche Kante –
  // der auffälligste Hinweis auf gestapelte Zylinder.
  const earthEndAt = (a) => {
    const broad = valueNoise2(Math.cos(a) * 2.1 + 17, Math.sin(a) * 2.1 + 5);
    const fine = valueNoise2(Math.cos(a) * 7.5 + 41, Math.sin(a) * 7.5 + 29);
    return EARTH_END * Math.max(0.48, 0.30 + 2.0 * broad * broad + 0.42 * (fine - 0.5));
  };

  // Wie weit die Grasnarbe an dieser Stelle über die Kante hängt. Stark
  // schwankend, damit Gras und Erde keine umlaufende Linie bilden.
  const drapeAt = (a) =>
    0.005 +
    0.030 *
      valueNoise2(Math.cos(a) * 3.1 + 31, Math.sin(a) * 3.1 + 7) *
      valueNoise2(Math.cos(a) * 9.5 + 3, Math.sin(a) * 9.5 + 19);

  // Schichtkoordinate: Der Abstand der Bänke schwankt, die Folge liegt schräg
  // im Raum UND ist pro Sektor verschoben. Ohne den Rauschterm laufen die Bänke
  // als saubere Ringe um die Insel – das verrät die Drehbank sofort.
  const strataCoord = (u, a) => {
    const sector = Math.floor((a / TAU) * SECTORS);
    const jump = valueNoise2(sector * 1.31 + 9, 3.7) - 0.5; // Versatz je Sektor
    const rate = strataRate * (0.72 + 0.62 * valueNoise2(sector * 2.17 + 5, 1.3));
    return (
      u * rate +
      0.42 * Math.sin(u * 7.3 + strataPhase) +
      0.95 * Math.cos(a + strataTilt) +
      1.9 * jump +
      1.6 * (valueNoise2(Math.cos(a) * 2.2 + fracPhase, Math.sin(a) * 2.2 + 7) - 0.5)
    );
  };

  // Grobe Felsplatten: Sektoren × Tiefenbänder werden blockweise radial
  // versetzt. Das erzeugt große, ebene Wandflächen mit scharfen Kanten –
  // Fels, statt einer gleichmäßig verrauschten Kartoffel.
  const SECTORS = 10 + Math.floor(rand() * 5);
  const slab = (t, a) =>
    valueNoise2(
      Math.floor((a / TAU) * SECTORS) * 1.73 + 3,
      Math.floor(t * 4.5) * 2.31 + fracPhase
    ) - 0.5;

  const spurAt = (u, a) => {
    let m = 0;
    for (const sp of spurs) {
      m += sp.amp * gauss(angDelta(a, sp.a), sp.w) * gauss(u - sp.at, 0.30);
    }
    return m;
  };

  const sideRadius = (t, a) => {
    const ee = earthEndAt(a);
    let rf;
    if (t < ee) {
      // Erdreich. Es ist im Nahbild die zweitgrößte Fläche und darf deshalb
      // keine glatte Zylinderwand sein: senkrechte Auswaschungsrillen, eine
      // grobe Krümelstruktur und kleine, blockweise vorspringende Simse geben
      // ihm eine eigene Oberflächenlesung neben dem facettierten Fels.
      const cc = Math.cos(a);
      const ss = Math.sin(a);
      const f = t / ee;
      const rill =
        0.075 * (valueNoise2(cc * 17 + 7, ss * 17 + 2) - 0.5) +
        0.045 * (valueNoise2(cc * 33 + 3, ss * 33 + 11) - 0.5);
      const crumb =
        0.05 *
        (valueNoise2(Math.floor((a / TAU) * 40) * 2.9 + 1, Math.floor(f * 7) * 3.7 + 6) - 0.5);
      rf = (1 - 0.075 * Math.pow(f, 0.6)) * (1 + (rill + crumb) * 2.0 * smoothstep(0, 0.25, f));
    } else {
      const u = (t - ee) / (1 - ee);
      // Kiel statt Kegel: breite Schulter, dann ein stumpf endender Keil.
      // Der Exponent hält die Masse unten zusammen – mit reinem (1-u) lief das
      // Ganze in eine Eiszapfen-Nadel aus.
      const taper = 0.94 * Math.pow(1 - Math.pow(u, 1.45), 0.58);
      // Bänke mit scharfer Oberkante und auslaufender Unterseite (Sägezahn,
      // geglättet) – so entstehen echte Simse statt einer Sinuswelle.
      const sv = strataCoord(u, a);
      const w = sv - Math.floor(sv);
      const shelf = Math.pow(1 - w, 2.2) - 0.32;
      // Überkragendes Gesims: An EINER Stelle steht der Fels weiter aus als die
      // Grasplatte darüber. Ohne so einen Undercut bleibt das Profil ein
      // umgekehrter Ziggurat, bei dem oben immer alles am breitesten ist.
      const ledge = 0.26 * gauss(angDelta(a, ledgeA), 0.44) * gauss(u - 0.13, 0.11);
      // Kaminspalte: eine senkrechte Rinne über die ganze Höhe
      const chimney = -0.20 * gauss(angDelta(a, chimneyA), 0.17) * smoothstep(0.0, 0.35, u);
      rf =
        taper *
        (1 + 0.115 * shelf * (1 - 0.30 * u)) *
        (1 + 0.105 * slab(t, a)) *
        (1 + spurAt(u, a) + ledge + chimney);
    }
    // Zerklüftung. Entscheidend ist nicht die Menge, sondern die VERTEILUNG:
    // Gleichmäßig über die ganze Wand gestreute Splitter derselben Größe lesen
    // sich aus mittlerer Entfernung als Rauschen, nicht als Fels. Deshalb liegt
    // eine Bruchzonen-Maske darüber – wenige zerklüftete Bereiche, dazwischen
    // große, ruhige Wandflächen, gegen die sich der Bruch abheben kann.
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rugged = smoothstep(
      0.34,
      0.68,
      valueNoise2(c * 1.5 + fracPhase, s * 1.5 + t * 1.1 + 4)
    );
    const frac =
      0.130 * (valueNoise2(c * 3.4 + fracPhase, s * 3.4 + 3) - 0.5) +
      0.055 * (valueNoise2(c * 9.0 + fracPhase, s * 9.0 + 21) - 0.5) +
      0.035 * (valueNoise2(c * 6.0 + t * 2.0, s * 6.0 + fracPhase) - 0.5);
    const amount = (0.22 + 1.45 * rugged) * (0.35 + 0.65 * Math.min(1, t * 2.2));
    return Math.max(0, rf * (1 + frac * 2 * amount));
  };

  // Tiefe entlang der Flanke. Nicht jede Seite reicht gleich weit hinunter:
  // Strebepfeiler ziehen ihren Sektor tiefer, dazu kommt eine Grundwelle.
  const sideDepth = (t, a) => {
    let extra = 0;
    for (const sp of spurs) extra += sp.deeper * gauss(angDelta(a, sp.a), sp.w * 1.5);
    const wave = 0.09 * (valueNoise2(Math.cos(a) * 2.6 + 5, Math.sin(a) * 2.6 + 13) - 0.5) * 2;
    return depth * (1 + extra + wave) * (Math.pow(t, 1.10) + 0.05 * Math.sin(t * 4.1 + a * 1.7) * t);
  };
  const leanAt = (t) => Math.pow(t, 1.9);

  return {
    radius,
    depth,
    outline,
    heightAt,
    edgeY,
    sideRadius,
    sideDepth,
    earthEndAt,
    leanX,
    leanZ,
    leanAt,
    drapeAt,
    slab,
    riverCurve,
    riverAngle: river,
    ridgeAngle: ridgeA,
    strataCoord,
  };
}

// ---------------------------------------------------------------------------
// Inselkörper als EIN Mesh mit drei Materialgruppen (Gras / Erde / Fels)
// ---------------------------------------------------------------------------
//
// Statt Zylinderplatte + Kegel darunter (harte Kante bei y ≈ 0, symmetrischer
// Trichter) entsteht ein durchgehendes Gitter: begehbare Fläche, Randwall,
// überrollende Traufkante, ausgefranste Erdschicht und darunter der
// geschichtete, zerklüftete, schief hängende Felskeil.
//
// Drei Materialgruppen statt einer, weil sich Gras, Erde und Fels nicht nur im
// Farbton unterscheiden sollen: Gras und Erde sind glatt schattiert und stumpf,
// der Fels ist facettiert (flatShading) und etwas glänzender. Die Zuordnung
// erfolgt pro Vierecksspalte, die Grenzen sind pro Winkel versetzt – dadurch
// gibt es keine umlaufende Trennlinie.
const ZONE_GRASS = 0;
const ZONE_EARTH = 1;
const ZONE_ROCK = 2;

function buildIslandBody(shape, { seg = 96, topRings = 18, sideRings = 36, detail = 1 } = {}) {
  const S = Math.max(24, Math.round(seg * detail));
  const TR = Math.max(6, Math.round(topRings * detail));
  const SR = Math.max(8, Math.round(sideRings * detail));
  const { radius, outline, heightAt, edgeY, sideRadius, sideDepth, earthEndAt } = shape;

  const rings = []; // rings[j] = { pos: Float64Array(S*3), zone(i) }
  const ringT = [];

  // --- Oberseite: Ringe von der Mitte nach außen, außen feiner aufgelöst ---
  for (let j = 0; j <= TR; j++) {
    const frac = 1 - Math.pow(1 - j / TR, 1.35);
    const pos = new Float64Array(S * 3);
    for (let i = 0; i < S; i++) {
      const a = (i / S) * TAU;
      const R = radius * outline(a) * frac;
      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;
      pos[i * 3] = x;
      pos[i * 3 + 1] = j === 0 ? heightAt(0, 0) : heightAt(x, z);
      pos[i * 3 + 2] = z;
    }
    rings.push(pos);
    ringT.push(-1); // Oberseite
  }

  // --- Flanke: Erdschicht + Fels bis zur Spitze ---
  for (let j = 1; j <= SR; j++) {
    const t = Math.pow(j / (SR + 1), 1.06);
    const pos = new Float64Array(S * 3);
    for (let i = 0; i < S; i++) {
      const a = (i / S) * TAU;
      const R = radius * outline(a) * sideRadius(t, a);
      const lean = shape.leanAt(t);
      pos[i * 3] = Math.sin(a) * R + shape.leanX * lean * radius * 0.5;
      pos[i * 3 + 1] = edgeY(a) - sideDepth(t, a);
      pos[i * 3 + 2] = Math.cos(a) * R + shape.leanZ * lean * radius * 0.5;
    }
    rings.push(pos);
    ringT.push(t);
  }

  // Spitze: ein einzelner, seitlich versetzter Punkt
  const tipLean = shape.leanAt(1);
  const tip = [
    shape.leanX * tipLean * radius * 0.5,
    edgeY(0) - sideDepth(1.02, 0),
    shape.leanZ * tipLean * radius * 0.5,
  ];

  // --- Glatte Normalen aus dem Gitter (der Fels überschreibt sie per flatShading) ---
  const RN = rings.length;
  const normals = rings.map(() => new Float64Array(S * 3));
  const get = (j, i) => {
    const r = rings[Math.max(0, Math.min(RN - 1, j))];
    const k = ((i % S) + S) % S;
    return [r[k * 3], r[k * 3 + 1], r[k * 3 + 2]];
  };
  for (let j = 0; j < RN; j++) {
    for (let i = 0; i < S; i++) {
      const [ax, ay, az] = get(j, i + 1);
      const [bx, by, bz] = get(j, i - 1);
      let [cx, cy, cz] = get(j + 1, i);
      const [dx, dy, dz] = get(j - 1, i);
      if (j === RN - 1) [cx, cy, cz] = tip;
      const u = [ax - bx, ay - by, az - bz];
      const v = [cx - dx, cy - dy, cz - dz];
      let nx = u[1] * v[2] - u[2] * v[1];
      let ny = u[2] * v[0] - u[0] * v[2];
      let nz = u[0] * v[1] - u[1] * v[0];
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-9) {
        // Der innerste Ring liegt komplett im Mittelpunkt – dort ist das
        // Kreuzprodukt null. Ohne diesen Zweig bleibt die Normale (0,0,0) und
        // die Fläche wird stockschwarz gerendert (ein Loch mitten im Gras).
        nx = 0;
        ny = -1;
        nz = 0;
      } else {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      // Ringe laufen von der Mitte nach außen und dann nach unten – das
      // Kreuzprodukt zeigt dabei nach innen, deshalb umgedreht.
      normals[j][i * 3] = -nx;
      normals[j][i * 3 + 1] = -ny;
      normals[j][i * 3 + 2] = -nz;
    }
  }

  // --- Dreiecke in drei Eimer (Gras / Erde / Fels) einsortieren ---
  const buckets = [
    { pos: [], nor: [], col: [] },
    { pos: [], nor: [], col: [] },
    { pos: [], nor: [], col: [] },
  ];
  const c = new THREE.Color();
  const push = (zone, j, i) => {
    const b = buckets[zone];
    const k = ((i % S) + S) % S;
    const isTip = j >= RN;
    const p = isTip ? tip : [rings[j][k * 3], rings[j][k * 3 + 1], rings[j][k * 3 + 2]];
    const n = isTip ? [0, -1, 0] : [normals[j][k * 3], normals[j][k * 3 + 1], normals[j][k * 3 + 2]];
    b.pos.push(p[0], p[1], p[2]);
    b.nor.push(n[0], n[1], n[2]);
    bodyColor(c, zone, shape, p, isTip ? 1 : Math.max(0, ringT[j]), (k / S) * TAU);
    b.col.push(c.r, c.g, c.b);
  };
  const quad = (zone, j, i) => {
    push(zone, j, i);
    push(zone, j + 1, i);
    push(zone, j + 1, i + 1);
    push(zone, j, i);
    push(zone, j + 1, i + 1);
    push(zone, j, i + 1);
  };

  for (let j = 0; j < RN - 1; j++) {
    for (let i = 0; i < S; i++) {
      const a = (i / S) * TAU;
      const t = ringT[j + 1];
      let zone;
      if (t < 0) zone = ZONE_GRASS;
      else if (t < earthEndAt(a)) zone = ZONE_EARTH;
      else zone = ZONE_ROCK;
      // Die MATERIALgrenze liegt bewusst fest und dicht unter der Kante: Eine
      // pro Viereck ausgefranste Grenze erzeugt eine Treppe aus rechten Winkeln
      // (ein sofort erkennbares Rasterartefakt). Der sichtbare, unregelmäßige
      // Übergang Gras → Erde entsteht stattdessen in der Vertex-Farbe und ist
      // dadurch stufenlos.
      if (zone === ZONE_EARTH && t < 0.010) zone = ZONE_GRASS;
      quad(zone, j, i);
    }
  }
  // Fächer auf die Spitze
  for (let i = 0; i < S; i++) {
    push(ZONE_ROCK, RN - 1, i);
    push(ZONE_ROCK, RN, i);
    push(ZONE_ROCK, RN - 1, i + 1);
  }

  const geo = new THREE.BufferGeometry();
  const total = buckets.reduce((s, b) => s + b.pos.length, 0);
  const pos = new Float32Array(total);
  const nor = new Float32Array(total);
  const col = new Float32Array(total);
  let write = 0;
  let offset = 0;
  const groups = [];
  for (let z = 0; z < 3; z++) {
    const b = buckets[z];
    pos.set(b.pos, write);
    nor.set(b.nor, write);
    col.set(b.col, write);
    const count = b.pos.length / 3;
    groups.push([offset, count, z]);
    write += b.pos.length;
    offset += count;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const [start, count, mat] of groups) geo.addGroup(start, count, mat);
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0,
      flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0,
      flatShading: true,
    }),
  ]);
  mesh.name = 'island-body';
  return mesh;
}

// Vertex-Farbe des Inselkörpers. Trägt die Materialtrennung mit: warmes,
// leicht entsättigtes Grün oben, erdiges Braun in der Abbruchkante, kühl
// gebrochener Fels darunter – mit Schichtbändern, Rissverdunklung und
// gebackenem AO nach unten.
const _tmpColor = new THREE.Color();

function bodyColor(out, zone, shape, p, t, a) {
  const [x, y, z] = p;
  const mott = valueNoise2(x * 1.7 + 40, z * 1.7 + 12);
  if (zone === ZONE_GRASS) {
    const R = shape.radius * shape.outline(a);
    const rr = Math.min(1, Math.hypot(x, z) / R);
    const high = smoothstep(0.05, 0.55, y - ISLAND_TOP_Y); // Wallrücken heller
    out.setHSL(
      0.268 - 0.022 * high + 0.016 * (mott - 0.5),
      0.40 + 0.10 * mott - 0.06 * high,
      0.34 + 0.10 * high + 0.05 * (mott - 0.5) - 0.07 * smoothstep(0.82, 1.0, rr)
    );
    // Zur Kante hin reißt die Narbe auf: Erde und Fels kommen durch. Ohne das
    // liegt das Gras als geschlossene, gleichmäßig dicke Zuckergussschicht auf
    // der Insel. Der Aufriss läuft über die Farbe – eine pro Viereck gesetzte
    // Materialgrenze ergäbe wieder eine Treppe aus rechten Winkeln.
    const bare = valueNoise2(Math.cos(a) * 5.5 + 61, Math.sin(a) * 5.5 + 13);
    const patch = valueNoise2(x * 1.1 + 7, z * 1.1 + 23);
    const wear = smoothstep(0.70, 0.99, rr) * smoothstep(0.42, 0.78, bare * 0.5 + patch * 0.5);
    if (wear > 0) {
      const soil = _tmpColor.setHSL(0.072, 0.30, 0.19 + 0.05 * (patch - 0.5));
      out.lerp(soil, Math.min(0.85, wear));
    }
    return out;
  }
  if (zone === ZONE_EARTH) {
    // Erdreich: oben feucht-dunkel unter der Grasnarbe, nach unten staubiger,
    // mit senkrechten Auswaschungsstreifen.
    const d = Math.min(1, t / 0.22);
    const streak = valueNoise2(Math.cos(a) * 16, Math.sin(a) * 16 + t * 2);
    const grit = valueNoise2(Math.cos(a) * 44 + 5, Math.sin(a) * 44 + t * 9);
    const humus = 1 - smoothstep(0, 0.35, d); // feuchter, dunkler Saum unter dem Gras
    out.setHSL(
      0.075 + 0.014 * (streak - 0.5) + 0.010 * humus,
      0.34 - 0.08 * d + 0.05 * humus,
      0.20 +
        0.055 * d +
        0.05 * (mott - 0.5) +
        0.045 * (streak - 0.5) +
        0.055 * (grit - 0.5) -
        0.055 * humus
    );
    // Die Grasnarbe hängt unterschiedlich weit über die Kante. Der Übergang
    // läuft über die Farbe (stufenlos) statt über die Materialgrenze (Treppe).
    const drape = shape.drapeAt(a);
    const g2e = smoothstep(drape * 0.30, drape * 1.15, t);
    if (g2e < 1) {
      const grass = _tmpColor.setHSL(0.272, 0.42, 0.30 + 0.05 * (mott - 0.5));
      out.lerp(grass, 1 - g2e);
    }
    return out;
  }
  // Fels: Schichtbänke (dieselbe Koordinate wie die Geometrie, damit Farbe und
  // Form zusammenfallen), senkrechte Risse und Verdunklung zur Spitze.
  const sv = shape.strataCoord(t, a);
  const w = sv - Math.floor(sv);
  const shelf = Math.pow(1 - w, 2.0); // 1 an der Oberkante einer Bank … 0 darunter
  const fissure = valueNoise2(Math.cos(a) * 11, Math.sin(a) * 11 + t * 3);
  const face = shape.slab(t, a); // -0.5 … 0.5, konstant je Felsplatte
  // Deutlich dunkler und kühler als das Erdreich darüber: Vorher lagen Fels und
  // Erde im gleichen Hellwert und im gleichen warmen Bereich – die Flanke las
  // sich als ein einziges beiges Volumen mit einer eingeritzten Linie.
  const depthShade = 1 - smoothstep(0.10, 1.0, t) * 0.62;
  out.setHSL(
    0.095 + 0.022 * shelf - 0.018 * face,
    0.045 + 0.045 * shelf + 0.025 * (mott - 0.5),
    (0.095 + 0.060 * shelf + 0.045 * (fissure - 0.5) + 0.070 * face + 0.025 * (mott - 0.5)) *
      depthShade +
      0.010
  );
  return out;
}

// --- Baum: liefert Geometrie in die Eimer, nicht eigene Meshes -------------
// Nadelbaum (gestapelte Kegel) oder Laubbaum (Icosaeder-Blobs); die Krone
// bekommt Vertex-Farben, damit ein Blattwerk-Material für alle Bäume reicht.
const CONIFER_GREENS = [0x2f7a46, 0x38874c, 0x2a6d43];
const BROADLEAF_GREENS = [0x4f9c56, 0x5cab60, 0x458f52];

function addTree(rand, trunkBucket, leafBucket, { x, y, z, scale = 1 }) {
  const trunkHeight = (0.55 + rand() * 0.55) * scale;
  const lean = (rand() - 0.5) * 0.16;
  const yaw = rand() * TAU;
  const place = (geo, dy, tilt = true) => {
    if (tilt) geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(lean));
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw));
    geo.translate(x + Math.sin(lean) * dy * 0.5, y + dy, z);
    return geo;
  };

  const trunk = new THREE.CylinderGeometry(0.045 * scale, 0.095 * scale, trunkHeight, 7, 2);
  displaceRadial(trunk, 0.12, 0, true);
  trunkBucket.add(place(trunk, trunkHeight / 2), (vx, vy) =>
    new THREE.Color().setHSL(0.075, 0.30, 0.20 + 0.07 * valueNoise2(vx * 9, vy * 9))
  );

  if (rand() > 0.45) {
    const layers = 3 + Math.floor(rand() * 2);
    const tone = pick(rand, CONIFER_GREENS);
    for (let i = 0; i < layers; i++) {
      const f = i / (layers - 1);
      const r = (0.52 - f * 0.30) * scale;
      const cone = new THREE.ConeGeometry(r, 0.66 * scale, 12);
      displaceRadial(cone, 0.22, 0.04, true);
      leafBucket.add(place(cone, trunkHeight + (0.12 + f * 0.98) * scale), (vx, vy, vz) => {
        const c = new THREE.Color(tone);
        // von unten dunkler, oben heller → Volumen statt flacher Kegel
        const up = smoothstep(0, 1, (vy - y) / (trunkHeight + scale));
        return c.multiplyScalar(0.72 + 0.5 * up + 0.12 * (valueNoise2(vx * 7, vz * 7) - 0.5));
      });
    }
  } else {
    const tone = pick(rand, BROADLEAF_GREENS);
    const blobs = 3 + Math.floor(rand() * 2);
    for (let i = 0; i < blobs; i++) {
      const s = (i === 0 ? 0.40 : 0.20 + rand() * 0.14) * scale;
      const blob = new THREE.IcosahedronGeometry(s, 1);
      displaceRadial(blob, 0.26, 0, true);
      const off =
        i === 0
          ? [0, 0.30 * scale, 0]
          : [(rand() - 0.5) * 0.62 * scale, (0.18 + rand() * 0.42) * scale, (rand() - 0.5) * 0.62 * scale];
      blob.scale(1, 0.86, 1);
      blob.translate(off[0], 0, off[2]);
      leafBucket.add(place(blob, trunkHeight + off[1]), (vx, vy, vz) => {
        const c = new THREE.Color(tone);
        const up = smoothstep(0, 1, (vy - y - trunkHeight) / (0.9 * scale) + 0.4);
        return c.multiplyScalar(0.68 + 0.55 * up + 0.14 * (valueNoise2(vx * 6, vz * 6) - 0.5));
      });
    }
  }
  return trunkHeight;
}

// Blumen und Grasbüschel auf der Hauptinsel (InstancedMesh = 2 Draw-Calls).
// Alle Instanzen sitzen auf der tatsächlichen Geländehöhe (shape.heightAt) und
// bleiben innerhalb des tatsächlichen, unrunden Umrisses.
function addGrassDecoration(group, rand, shape) {
  const flowerColors = [0xfff3b0, 0xffb3c1, 0xcdb4f6, 0xf8f9fa, 0xffd166];
  const flowers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.025, 0),
    new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, emissiveIntensity: 0.2 }),
    54
  );
  flowers.name = 'flowers';
  flowers.userData.fullCount = flowers.count;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const spot = (min, max) => {
    const angle = rand() * TAU;
    const r = shape.radius * shape.outline(angle) * (min + rand() * (max - min));
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    return [x, shape.heightAt(x, z), z];
  };
  for (let i = 0; i < flowers.count; i++) {
    const [x, y, z] = spot(0.18, 0.86);
    dummy.position.set(x, y + 0.03, z);
    dummy.scale.setScalar(0.8 + rand() * 0.7);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, color.setHex(flowerColors[Math.floor(rand() * flowerColors.length)]));
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  group.add(flowers);

  const tufts = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.024, 0.09, 6),
    new THREE.MeshStandardMaterial({ color: 0x4c9a4a, roughness: 0.9, metalness: 0 }),
    70
  );
  tufts.name = 'tufts';
  tufts.userData.fullCount = tufts.count;
  for (let i = 0; i < tufts.count; i++) {
    const [x, y, z] = spot(0.14, 0.9);
    dummy.position.set(x, y + 0.045, z);
    dummy.rotation.set((rand() - 0.5) * 0.4, rand() * Math.PI, (rand() - 0.5) * 0.4);
    dummy.scale.setScalar(0.8 + rand() * 0.8);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  group.add(tufts);
}

// Sanft animiertes Wasser: hellblaue Fläche mit fließenden Strähnen (Canvas-Textur,
// deren V-Offset über die Zeit scrollt).
function makeWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#8fd2f0');
  bg.addColorStop(1, '#5fb6e6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 64, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const x = 6 + Math.random() * 52;
    ctx.globalAlpha = 0.3 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, -10);
    for (let y = -10; y < 270; y += 20) {
      ctx.lineTo(x + Math.sin(y * 0.08) * 4, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Kleiner Fluss von der Inselmitte zur Kante + Wasserfall über den Rand.
// Ursprung: eine Quelle in der Mitte, aus der ein schmaler Bach zur Klippe läuft
// und dort als Partikelstrom in die Tiefe stürzt.
function makeWaterfall(rand, shape) {
  const group = new THREE.Group();
  group.name = 'waterfall';
  const angle = shape.riverAngle;
  const curve = shape.riverCurve;
  const end = curve.getPoint(1);
  const edgeX = end.x;
  const edgeZ = end.z;
  const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));

  const waterTex = makeWaterTexture();
  const waterMat = new THREE.MeshStandardMaterial({
    map: waterTex,
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.9,
  });

  // --- Quelle in der Inselmitte, in die eingeschnittene Rinne gelegt ---
  const springY = shape.heightAt(0.1, 0.2) + 0.035;
  const spring = new THREE.Mesh(new THREE.CircleGeometry(0.32, 24), waterMat);
  spring.rotation.x = -Math.PI / 2;
  spring.position.set(0.1, springY, 0.2);
  group.add(spring);
  // Steinkranz um die Quelle – ein verschmolzenes Mesh statt sieben Draw-Calls
  const springStones = new GeoBucket();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rand() * 0.4;
    const rr = 0.32 + rand() * 0.08;
    const sx = 0.1 + Math.cos(a) * rr;
    const sz = 0.2 + Math.sin(a) * rr;
    const g = boulderGeometry(rand, 0.08 + rand() * 0.06);
    g.translate(sx, shape.heightAt(sx, sz) + 0.03, sz);
    springStones.add(g, (vx, vy, vz) =>
      new THREE.Color().setHSL(0.094, 0.05, 0.125 + 0.07 * valueNoise2(vx * 6, vz * 6))
    );
  }
  const stones = springStones.mesh(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, flatShading: true }),
    'spring-stones'
  );
  if (stones) group.add(stones);

  // --- Flussbett als Band entlang der geteilten Kurve: Es folgt exakt der
  // Rinne, die auch ins Gelände eingeschnitten ist, und liegt knapp darüber. ---
  const SEG = 64;
  const up = new THREE.Vector3(0, 1, 0);
  const riverPos = [];
  const riverUv = [];
  const riverIdx = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const halfW = 0.14 + t * 0.34; // schmal an der Quelle, breiter zur Klippe
    const yl = shape.heightAt(p.x - side.x * halfW, p.z - side.z * halfW) + 0.03;
    const yr = shape.heightAt(p.x + side.x * halfW, p.z + side.z * halfW) + 0.03;
    const yc = Math.min(yl, yr);
    riverPos.push(
      p.x - side.x * halfW, yc, p.z - side.z * halfW,
      p.x + side.x * halfW, yc, p.z + side.z * halfW
    );
    const v = t * 8;
    riverUv.push(0, v, 1, v);
    if (i < SEG) {
      const a = i * 2;
      riverIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPos, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUv, 2));
  riverGeo.setIndex(riverIdx);
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(riverGeo, waterMat);
  group.add(river);

  // --- Auffangbecken an der Kante, kurz bevor das Wasser stürzt ---
  const edgeY = shape.heightAt(edgeX, edgeZ) + 0.03;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), waterMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(edgeX, edgeY, edgeZ);
  pond.scale.x = 1.4;
  group.add(pond);

  // --- Sturz: Partikelstrom über die Klippe ---
  const count = 150;
  const fallLength = 6;
  const positions = new Float32Array(count * 3);
  const meta = [];
  for (let i = 0; i < count; i++) {
    meta.push({
      speed: 1.7 + rand() * 0.9,
      offset: rand() * fallLength,
      side: (rand() - 0.5) * 0.7,
      jitter: (rand() - 0.5) * 0.1,
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const drops = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xdff2fc,
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  drops.frustumCulled = false;
  group.add(drops);

  // Feiner Sprühnebel am Fuß des Wasserfalls
  const mist = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,0.5)', 'rgba(220,240,255,0.2)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  // Fußpunkt des Sturzes: knapp außerhalb der tatsächlichen Abbruchkante
  const outR = shape.radius * shape.outline(angle) + 0.2;
  const outX = Math.sin(angle) * outR;
  const outZ = Math.cos(angle) * outR;
  mist.position.set(outX, edgeY - 1.4, outZ);
  mist.scale.set(2.4, 2.4, 1);
  group.add(mist);

  // Schaum an der Abbruchkante (pulsierendes weiches Glühen)
  const foam = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(235,248,255,0.5)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
      fog: false,
    })
  );
  foam.position.set(edgeX, edgeY + 0.02, edgeZ);
  foam.scale.set(1.3, 0.5, 1);
  group.add(foam);

  // Regenbogen im Sprühnebel: halber Ring, radial über Vertex-Farben eingefärbt
  const rainbowGeo = new THREE.RingGeometry(1.0, 1.42, 48, 6, 0, Math.PI);
  const rp = rainbowGeo.attributes.position;
  const rColors = new Float32Array(rp.count * 3);
  const rc = new THREE.Color();
  for (let i = 0; i < rp.count; i++) {
    const rr = Math.hypot(rp.getX(i), rp.getY(i));
    const t = THREE.MathUtils.clamp((rr - 1.0) / 0.42, 0, 1); // innen 0 … außen 1
    rc.setHSL((270 * (1 - t)) / 360, 0.9, 0.6); // violett innen → rot außen
    rColors[i * 3] = rc.r;
    rColors[i * 3 + 1] = rc.g;
    rColors[i * 3 + 2] = rc.b;
  }
  rainbowGeo.setAttribute('color', new THREE.BufferAttribute(rColors, 3));
  const rainbow = new THREE.Mesh(
    rainbowGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  rainbow.position.set(outX, edgeY - 1.6, outZ);
  rainbow.lookAt(0, edgeY - 0.6, 0); // zum Inselzentrum ausrichten
  group.add(rainbow);

  return {
    group,
    update(time) {
      waterTex.offset.y = -time * 0.35;
      foam.material.opacity = 0.65 + Math.sin(time * 4) * 0.2;
      rainbow.material.opacity = 0.38 + Math.sin(time * 0.7) * 0.08;
      const pos = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const m = meta[i];
        const fall = (m.offset + time * m.speed) % fallLength;
        pos.setXYZ(
          i,
          outX + tangent.x * m.side + m.jitter * Math.sin(time * 3 + i),
          edgeY - 0.05 - fall,
          outZ + tangent.z * m.side + m.jitter * Math.cos(time * 3 + i)
        );
      }
      pos.needsUpdate = true;
      mist.material.opacity = 0.45 + Math.sin(time * 2) * 0.1;
    },
  };
}

// Vögel: einfache Zwei-Flügel-Silhouetten, die in der Ferne kreisen
function makeBirds(rand) {
  const group = new THREE.Group();
  group.name = 'birds';
  const material = new THREE.MeshBasicMaterial({ color: 0x33404d, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const bird = new THREE.Group();
    const wings = [];
    for (const dir of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.09), material);
      wing.position.x = dir * 0.13;
      wing.rotation.x = -Math.PI / 2;
      pivot.add(wing);
      bird.add(pivot);
      wings.push({ pivot, dir });
    }
    bird.userData = {
      radius: 8 + rand() * 8,
      height: 3.5 + rand() * 3.5,
      speed: (0.12 + rand() * 0.1) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      wings,
    };
    group.add(bird);
    birds.push(bird);
  }
  return {
    group,
    update(time) {
      for (const bird of birds) {
        const d = bird.userData;
        const a = time * d.speed + d.phase;
        bird.position.set(
          Math.sin(a) * d.radius,
          d.height + Math.sin(time * 1.3 + d.phase) * 0.35,
          Math.cos(a) * d.radius
        );
        bird.rotation.y = a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        const flap = Math.sin(time * 9 + d.phase) * 0.55;
        for (const { pivot, dir } of d.wings) pivot.rotation.z = flap * dir;
      }
    },
  };
}

// Bunte Schmetterlinge, die nah über der Insel gaukeln (Vögel-Muster, kleiner
// und schneller flatternd).
function makeButterflies(rand) {
  const group = new THREE.Group();
  group.name = 'butterflies';
  const colors = [0xff7aa2, 0xffd166, 0x8ec7ff, 0xc4a2ff, 0xff9e6b];
  const items = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: colors[i % colors.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
    });
    const wings = [];
    for (const dir of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), mat);
      wing.position.x = dir * 0.05;
      wing.rotation.x = -Math.PI / 2;
      wing.scale.set(0.8, 1, 1.25);
      pivot.add(wing);
      b.add(pivot);
      wings.push({ pivot, dir });
    }
    b.userData = {
      radius: 2 + rand() * 4,
      height: 0.7 + rand() * 1.6,
      speed: (0.3 + rand() * 0.3) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * Math.PI * 2,
      bob: rand() * Math.PI * 2,
      wings,
    };
    group.add(b);
    items.push(b);
  }
  return {
    group,
    update(time) {
      for (const b of items) {
        const d = b.userData;
        const a = time * d.speed + d.phase;
        b.position.set(
          Math.sin(a) * d.radius,
          d.height + Math.sin(time * 1.6 + d.bob) * 0.5,
          Math.cos(a) * d.radius
        );
        b.rotation.y = a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
        const flap = Math.sin(time * 14 + d.phase) * 0.9 + 0.35;
        for (const { pivot, dir } of d.wings) pivot.rotation.z = flap * dir;
      }
    },
  };
}

// Volumetrisch wirkende Wolke: Cluster weicher Kugeln zu EINEM Mesh verschmolzen.
// Als echtes 3D-Objekt (kein Billboard-Sprite) dreht sie sich NICHT mit der
// Kopfbewegung – sie bleibt fest im Raum stehen.
const CLOUD_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 1,
  metalness: 0,
  flatShading: false,
});

function makeCloud(rand, size = 1) {
  const geos = [];
  const puffs = 5 + Math.floor(rand() * 4);
  for (let i = 0; i < puffs; i++) {
    const s = (0.7 + rand() * 1.0) * size;
    const g = new THREE.SphereGeometry(s, 12, 10);
    g.translate(
      (rand() - 0.5) * 3.4 * size,
      (rand() - 0.5) * 0.7 * size,
      (rand() - 0.5) * 1.8 * size
    );
    geos.push(g);
  }
  const merged = mergeGeometries(geos);
  const cloud = new THREE.Mesh(merged, CLOUD_MATERIAL);
  cloud.scale.y = 0.62; // flach drücken → Wolkenform
  return cloud;
}

// Hängende Ranken/Wurzeln unter dem Inselrand. Sie setzen jetzt an der
// tatsächlichen, unrunden Abbruchkante an (shape.outline/edgeY) statt an einem
// gedachten Kreis – vorher hingen sie teils in der Luft neben dem Fels.
// Hängende Wurzelvorhänge unter der Abbruchkante. Nicht gleichmäßig verteilt,
// sondern in Büscheln: Wurzeln wachsen dort, wo Erde ist, nicht alle 30 Grad.
function addVines(bucket, rand, shape, clusters) {
  // Ein Strang hängt senkrecht, die Felswand zieht sich nach unten aber ein.
  // Wird der Radius nur am Ansatzpunkt bestimmt, steht der untere Teil frei in
  // der Luft – als kurzer Stummel vor der Wand oder als Haarlinie vor dem
  // Himmel. Deshalb wird die Flanke über die GANZE Länge abgetastet und der
  // engste Radius genommen; und das Ende bleibt über der Felsunterkante.
  const strand = (a, t0, tEnd, thick) => {
    let minR = Infinity;
    for (let k = 0; k <= 6; k++) {
      const t = t0 + ((tEnd - t0) * k) / 6;
      minR = Math.min(minR, shape.sideRadius(t, a));
    }
    const rr = shape.radius * shape.outline(a) * (minR - 0.025);
    const x = Math.sin(a) * rr;
    const z = Math.cos(a) * rr;
    const top = shape.edgeY(a) - shape.sideDepth(t0, a);
    const len = shape.sideDepth(tEnd, a) - shape.sideDepth(t0, a);
    const g = new THREE.CylinderGeometry(thick, thick * 0.30, len, 5, 8);
    // Bogen und Verjüngung: Wurzeln hängen nicht kerzengerade, sondern folgen
    // erst der Wand und schwingen dann frei.
    const bendX = (rand() - 0.5) * 1.5;
    const bendZ = (rand() - 0.5) * 1.5;
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const f = 0.5 - p.getY(v) / len; // 0 oben … 1 unten
      // Kettenlinie: die Ranke schwingt aus und hängt am Ende deutlich seitlich
      // aus. Ohne Durchhang bleibt sie eine schnurgerade Haarlinie, die vor dem
      // Himmel wie ein Kratzer im Bild aussieht.
      const sag = f * f * (1.6 - 0.6 * f);
      p.setX(v, p.getX(v) + sag * bendX * len * 0.34 + Math.sin(f * 6) * thick * 0.8);
      p.setZ(v, p.getZ(v) + sag * bendZ * len * 0.34 + Math.cos(f * 7) * thick * 0.8);
    }
    g.computeVertexNormals();
    g.translate(0, -len / 2, 0);
    g.translate(x, top, z);
    bucket.add(g, (vx, vy) =>
      new THREE.Color().setHSL(
        0.085 + 0.035 * valueNoise2(vx * 3, vy * 3),
        0.22,
        0.075 + 0.075 * smoothstep(top - len, top, vy)
      )
    );
    // Der Ausschwung am unteren Ende ist sag(1) = 1.0, also bendX * len * 0.34.
    // Mit einem anderen Faktor säßen die Blattbüschel neben der Strangspitze.
    return { x, z, bottom: top - len, tipX: bendX * len * 0.34, tipZ: bendZ * len * 0.34 };
  };

  for (let c = 0; c < clusters; c++) {
    const base = (c / clusters) * TAU + (rand() - 0.5) * 0.7;
    const n = 3 + Math.floor(rand() * 4);
    // tEnd bleibt deutlich über der Felsunterkante (max 0.62 der Flanke) –
    // sonst endet der Strang frei im Himmel unter der Insel.
    const deepest = 0.30 + rand() * 0.32;
    for (let i = 0; i < n; i++) {
      const a = base + (rand() - 0.5) * 0.34;
      const t0 = 0.02 + rand() * 0.08;
      const tEnd = Math.min(0.62, t0 + deepest * (0.45 + rand() * 0.75));
      const end = strand(a, t0, tEnd, 0.020 + rand() * 0.022);
      // Jeder Strang endet in einem Blattbüschel. Ein glatt abgeschnittener
      // Zylinder vor dem Himmel liest sich als Kratzer im Bild.
      for (let k = 0, m = 2 + Math.floor(rand() * 3); k < m; k++) {
        const leaf = new THREE.IcosahedronGeometry(0.05 + rand() * 0.055, 0);
        leaf.scale(1.3, 0.5, 1.3);
        leaf.translate(
          end.x + end.tipX + (rand() - 0.5) * 0.13,
          end.bottom + rand() * 0.14,
          end.z + end.tipZ + (rand() - 0.5) * 0.13
        );
        bucket.add(leaf, pick(rand, [0x40693a, 0x4d7a3f, 0x35592f]));
      }
    }
  }
}

// Hängende Ranken/Wurzeln unter dem Inselrand, zu EINEM Mesh verschmolzen.
// `shape` ist optional und nur die Verankerung, nicht die Form: Ohne sie hängen
// die Stränge an einem gedachten Kreis bei y = -0.3 – auf dem unrunden
// Inselkörper aus Paket 1 steckten sie damit im Fels. Mit `shape` setzen sie an
// der tatsächlichen Abbruchkante an; ihr Verlauf bleibt unverändert.
function makeVines(rand, radius, count, shape = null) {
  // **Vorher waren das gerade Spieße.**
  //
  // Ein Kegelstumpf, senkrecht nach unten, mit einem Ikosaeder-Knubbel am Ende.
  // Von unter der Insel sah man ein Dutzend grüner Antennen radial aus dem Fels
  // stehen – der auffälligste Fehler der ganzen Umgebung, weil die Unterseite
  // der Insel das ist, was man beim Anflug zuerst sieht.
  //
  // Eine hängende Ranke hat drei Eigenschaften, die alle drei gefehlt haben:
  // Sie **hängt** (also krümmt sie sich unter ihrem Gewicht), sie **schwingt**
  // nach außen weg statt lotrecht zu fallen, und sie trägt Blätter über ihre
  // **ganze Länge**, nicht eines am Ende.
  const strangGeos = [];
  const laubPunkte = [];
  const mitte = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.4;
    const len = 0.9 + rand() * 2.2;
    let rr;
    let ansatzY = -0.3;
    if (shape) {
      const t0 = 0.04 + rand() * 0.08;
      rr = shape.radius * shape.outline(a) * (shape.sideRadius(t0, a) - 0.02);
      ansatzY = shape.edgeY(a) - shape.sideDepth(t0, a);
    } else {
      rr = radius * (0.72 + rand() * 0.22);
    }
    const ax = Math.cos(a) * rr;
    const az = Math.sin(a) * rr;

    // Kettenlinie: Der Strang verlässt den Rand fast waagerecht nach außen und
    // richtet sich nach unten auf. Vier Stützpunkte reichen – CatmullRom macht
    // daraus eine Kurve ohne Knick, und mehr Punkte kosten nur Dreiecke.
    const drift = 0.18 + rand() * 0.3; // wie weit sie nach außen ausholt
    const seite = (rand() - 0.5) * 0.5; // seitlicher Versatz, damit keine zwei gleich hängen
    const kurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ax, ansatzY, az),
      new THREE.Vector3(
        ax * (1 + drift * 0.35),
        ansatzY - len * 0.22,
        az * (1 + drift * 0.35) + seite * 0.3
      ),
      new THREE.Vector3(
        ax * (1 + drift * 0.5),
        ansatzY - len * 0.62,
        az * (1 + drift * 0.5) + seite * 0.6
      ),
      new THREE.Vector3(
        ax * (1 + drift * 0.52),
        ansatzY - len,
        az * (1 + drift * 0.52) + seite * 0.72
      ),
    ]);

    // Zum Ende hin dünner. `TubeGeometry` kann das nicht von sich aus; die
    // Ringe werden deshalb einzeln auf ihren Kurvenpunkt zusammengezogen –
    // derselbe Kniff wie bei den Ikebana-Zweigen in props.js. Der Vertexindex
    // ist ringweise: i · (radial + 1) + j.
    const RINGE = 10;
    const RADIAL = 4;
    const rohr = new THREE.TubeGeometry(kurve, RINGE, 0.028, RADIAL, false);
    const pos = rohr.attributes.position;
    for (let ring = 0; ring <= RINGE; ring++) {
      const f = 1 - 0.75 * (ring / RINGE);
      kurve.getPointAt(ring / RINGE, mitte);
      for (let jj = 0; jj <= RADIAL; jj++) {
        const k = ring * (RADIAL + 1) + jj;
        pos.setXYZ(
          k,
          mitte.x + (pos.getX(k) - mitte.x) * f,
          mitte.y + (pos.getY(k) - mitte.y) * f,
          mitte.z + (pos.getZ(k) - mitte.z) * f
        );
      }
    }
    rohr.computeVertexNormals();
    strangGeos.push(rohr);

    // Blattbüschel entlang des Strangs, nach unten hin kleiner. Der oberste
    // sitzt bei 18 % – ganz am Ansatz wäre er im Fels.
    const bueschel = 6 + Math.floor(rand() * 4);
    for (let b = 0; b < bueschel; b++) {
      const t = 0.14 + (b / bueschel) * 0.82 + rand() * 0.05;
      kurve.getPointAt(Math.min(0.99, t), mitte);
      laubPunkte.push({
        p: mitte.clone(),
        s: (0.17 + rand() * 0.11) * (1 - t * 0.35),
        dreh: rand() * Math.PI * 2,
      });
    }
  }

  const gruppe = new THREE.Group();
  gruppe.name = 'island-ranken';

  const stiele = new THREE.Mesh(
    mergeGeometries(strangGeos),
    // Dunkel und holzig. Mit 0x5c7a42 stand der Strang als hellgrüner Stab vor
    // dem Himmel und war heller als das Laub, das an ihm hängt – im Bild das
    // Erste, was auffiel.
    new THREE.MeshStandardMaterial({ color: 0x46512f, roughness: 0.96, metalness: 0 })
  );
  stiele.name = 'island-ranken-stiele';
  gruppe.add(stiele);

  const { karten } = inselBaumMaterialien();
  const laub = new THREE.InstancedMesh(
    cardCluster({ count: 26, radius: 1, seed: 0x9a12, kind: 'azalea', cardScale: 0.9 }),
    karten,
    laubPunkte.length
  );
  applyFoliageMaterial(laub, karten);
  laub.name = 'island-ranken-laub';
  laub.userData.fullCount = laubPunkte.length;
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    laubPunkte.forEach((c, i) => {
      q.setFromEuler(new THREE.Euler(0, c.dreh, 0));
      // Nach unten gestreckt: Ein Rankenbüschel hängt, es sitzt nicht als Kugel
      // auf dem Strang.
      m.compose(c.p, q, new THREE.Vector3(c.s, c.s * 1.5, c.s));
      laub.setMatrixAt(i, m);
    });
    laub.instanceMatrix.needsUpdate = true;
  }
  gruppe.add(laub);
  return gruppe;
}

// Ein Findling: unregelmäßig verschobener Icosaeder, flach gelagert.
function boulderGeometry(rand, size) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const p = g.attributes.position;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v);
    const y = p.getY(v);
    const z = p.getZ(v);
    const f = 0.74 + hashNoise(x * 27, y * 27, z * 27) * 0.5;
    p.setXYZ(v, x * f, y * f * 0.72, z * f);
  }
  g.computeVertexNormals();
  g.rotateY(rand() * TAU);
  g.rotateX((rand() - 0.5) * 0.5);
  return g;
}

// Kontaktschatten als EIN verschmolzenes Mesh statt eines Draw-Calls je Objekt.
// Die Quads liegen auf der tatsächlichen Geländehöhe – auf dem Wall kippen sie
// nicht in den Hang, weil sie knapp darüber schweben und weich auslaufen.
function addContactShadow(bucket, shape, x, z, radius) {
  const g = new THREE.PlaneGeometry(radius * 2, radius * 2);
  g.rotateX(-Math.PI / 2);
  g.translate(x, shape.heightAt(x, z) + 0.012, z);
  bucket.add(g, 0xffffff);
}

// --- Vorübergehender Umschalter für den Bildvergleich der Vegetation --------
//
// Beim Zusammenführen von PR #9 mit der Paket-1-Arbeit treffen zwei Fassungen
// von Bäumen und Ranken aufeinander:
//   'pr9'    – Astwerk-Bäume mit Alpha-Karten-Laub und Kettenlinien-Ranken aus
//              PR #9, hier auf den neuen Inselkörper gesetzt
//   'paket1' – die verschmolzenen, draw-call-sparsamen Fassungen aus Paket 1
// Der Inselkörper (Fels, Erde, Terrain) ist in beiden Fällen der aus Paket 1.
// Sobald entschieden ist, welche Vegetation bleibt, fliegt der Umschalter
// zusammen mit der Verliererfassung raus.
const ISLAND_VEGETATION = 'paket1';

// Schwebende Insel: durchgehender Körper (Gras → Erde → geschichteter Fels),
// darauf Bäume, Findlinge und Kontaktschatten – alles in wenigen Meshes.
function buildIsland(
  rand,
  { radius = 5, depth = 5, trees = 3, rocks = 4, vines = 9, river = null, detail = 1 } = {}
) {
  const island = new THREE.Group();
  island.name = 'island';
  const shape = makeIslandShape(rand, { radius, depth, river });
  island.userData.shape = shape;

  island.add(buildIslandBody(shape, { detail }));

  const rootBucket = new GeoBucket();
  if (ISLAND_VEGETATION === 'pr9') {
    island.add(makeVines(rand, radius, vines + 4, shape));
  } else {
    addVines(rootBucket, rand, shape, vines);
  }

  const trunkBucket = new GeoBucket();
  const leafBucket = new GeoBucket();
  const stoneBucket = new GeoBucket();
  const shadowBucket = new GeoBucket();

  // Bäume: gehäuft am Höhenrücken, einzeln im offenen Feld – das staffelt den
  // Blick in Vorder-, Mittel- und Hintergrund, statt gleichmäßig zu streuen.
  for (let i = 0; i < trees; i++) {
    const clustered = i > 0 && rand() > 0.35;
    const angle = clustered ? shape.ridgeAngle + (rand() - 0.5) * 1.5 : rand() * TAU;
    const r = radius * (clustered ? 0.62 + rand() * 0.22 : 0.30 + rand() * 0.45);
    const tx = Math.sin(angle) * r;
    const tz = Math.cos(angle) * r;
    if (shape.riverCurve && Math.hypot(tx - 0.1, tz - 0.2) < 0.7) continue; // nicht in die Quelle
    const y = shape.heightAt(tx, tz);
    const scale = 0.85 + rand() * 0.5;
    if (ISLAND_VEGETATION === 'pr9') {
      const tree = makeTree(rand);
      tree.position.set(tx, y, tz);
      tree.rotation.y = rand() * TAU;
      tree.scale.setScalar(scale);
      island.add(tree);
    } else {
      addTree(rand, trunkBucket, leafBucket, { x: tx, y, z: tz, scale });
    }
    addContactShadow(shadowBucket, shape, tx, tz, 0.46 * scale);
  }

  // Felsknöchel am Kantensaum: teils versenkte Blöcke, die durch die Grasnarbe
  // stoßen. Sie lösen den durchgehenden grünen Wulst auf und verzahnen
  // Grasplatte und Fels – ohne sie liegt das Gras wie Glasur auf einer Torte.
  const knuckles = Math.round(rocks * 1.8);
  for (let i = 0; i < knuckles; i++) {
    const a = rand() * TAU;
    const rf = 0.92 + rand() * 0.12;
    const kx = Math.sin(a) * radius * shape.outline(a) * rf;
    const kz = Math.cos(a) * radius * shape.outline(a) * rf;
    const s = 0.11 + rand() * 0.20;
    const g = boulderGeometry(rand, s);
    g.scale(1.0 + rand() * 0.45, 0.55 + rand() * 0.45, 1.0 + rand() * 0.45);
    // Tief eingesenkt: nur die Kuppe schaut heraus, wie anstehendes Gestein
    const ky = shape.heightAt(kx, kz) - s * (0.15 + rand() * 0.3);
    g.translate(kx, ky, kz);
    // Der Fuß geht in Erdreich über: Ohne den Farbverlauf schneidet der Block
    // mit einer harten, geraden Linie durch die Wiese und wirkt wie eingeclippt.
    stoneBucket.add(g, (vx, vy, vz) => {
      const n = valueNoise2(vx * 4 + 13, vz * 4 + 2);
      const rock = new THREE.Color().setHSL(0.095, 0.045 + 0.02 * n, 0.115 + 0.055 * n);
      const soil = _tmpColor.setHSL(0.075, 0.28, 0.16 + 0.04 * n);
      // unten (nahe der Grasnarbe) erdig, oben blanker Fels
      return rock.lerp(soil, 0.55 * smoothstep(ky - s * 0.05, ky - s * 0.55, vy));
    });
  }

  // Findlinge: bevorzugt am Wall und an der Abbruchkante, wo sie die
  // Silhouette brechen.
  for (let i = 0; i < rocks; i++) {
    const s = 0.14 + rand() * 0.30;
    const angle = rand() * TAU;
    const r = radius * (rand() > 0.4 ? 0.66 + rand() * 0.26 : 0.30 + rand() * 0.3);
    const sx = Math.sin(angle) * r;
    const sz = Math.cos(angle) * r;
    const g = boulderGeometry(rand, s);
    g.translate(sx, shape.heightAt(sx, sz) + s * 0.30, sz);
    stoneBucket.add(g, (vx, vy, vz) => {
      const n = valueNoise2(vx * 5 + 3, vz * 5 + 9);
      return new THREE.Color().setHSL(0.094, 0.05 + 0.025 * n, 0.115 + 0.065 * n + 0.03 * vy);
    });
    addContactShadow(shadowBucket, shape, sx, sz, s * 1.7);
  }

  const roots = rootBucket.mesh(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    'island-vines'
  );
  if (roots) island.add(roots);

  const trunks = trunkBucket.mesh(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    'island-trunks'
  );
  if (trunks) island.add(trunks);

  const leaves = leafBucket.mesh(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    'island-leaves'
  );
  if (leaves) island.add(leaves);

  const stones = stoneBucket.mesh(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0, flatShading: true }),
    'island-stones'
  );
  if (stones) island.add(stones);

  const shadows = shadowBucket.mesh(
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
    'island-shadows'
  );
  if (shadows) {
    shadows.renderOrder = 1;
    island.add(shadows);
  }

  return island;
}

// Unterwuchs: instanzierte Büsche + Pilze (wenige Draw-Calls) auf der Hauptinsel.
function addUndergrowth(group, rand, shape) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const spot = (min, max) => {
    const angle = rand() * TAU;
    const r = shape.radius * shape.outline(angle) * (min + rand() * (max - min));
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    return [x, shape.heightAt(x, z), z];
  };

  const bushColors = [0x4f9a4a, 0x3e8e4f, 0x5fb069, 0x6cbb5c];
  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.16, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: false }),
    10
  );
  bushes.name = 'bushes';
  bushes.userData.fullCount = bushes.count;
  for (let i = 0; i < bushes.count; i++) {
    const [x, y, z] = spot(0.24, 0.88);
    dummy.position.set(x, y + 0.02, z);
    dummy.scale.set(0.7 + rand() * 0.9, 0.55 + rand() * 0.5, 0.7 + rand() * 0.9);
    dummy.rotation.y = rand() * Math.PI;
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    bushes.setColorAt(i, color.setHex(bushColors[Math.floor(rand() * bushColors.length)]));
  }
  bushes.instanceMatrix.needsUpdate = true;
  if (bushes.instanceColor) bushes.instanceColor.needsUpdate = true;
  group.add(bushes);

  // Pilz: verschmolzene Geometrie mit Vertex-Farben (weißer Stiel, roter Hut)
  const stem = new THREE.CylinderGeometry(0.02, 0.028, 0.09, 6);
  stem.translate(0, 0.045, 0);
  paintVertices(stem, 0xf1ebde);
  const cap = new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.7, 1);
  cap.translate(0, 0.09, 0);
  paintVertices(cap, 0xb0503c);
  const mushGeo = mergeGeometries([stem, cap]);
  const mushrooms = new THREE.InstancedMesh(
    mushGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true }),
    6
  );
  mushrooms.name = 'mushrooms';
  mushrooms.userData.fullCount = mushrooms.count;
  for (let i = 0; i < mushrooms.count; i++) {
    const [x, y, z] = spot(0.2, 0.9);
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(0.45 + rand() * 0.4);
    dummy.rotation.set(0, rand() * Math.PI, 0);
    dummy.updateMatrix();
    mushrooms.setMatrixAt(i, dummy.matrix);
  }
  mushrooms.instanceMatrix.needsUpdate = true;
  group.add(mushrooms);
}

function createIslandEnvironment() {
  const rand = mulberry32(20260718);
  const group = new THREE.Group();
  group.name = 'env-island';

  group.add(makeDome(0x3f83c9, 0xdceff7, 0xcfe8f7));

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,250,225,1)', 'rgba(255,238,180,0.55)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  sun.position.set(18, 24, -24);
  sun.scale.set(11, 11, 1);
  group.add(sun);

  group.add(new THREE.HemisphereLight(0xdcefff, 0x8f9b7a, 0.75));
  const sunlight = new THREE.DirectionalLight(0xfff2d9, 1.35);
  sunlight.position.set(10, 18, -8);
  group.add(sunlight);
  // Sanftes Fülllicht von unten, damit Wolken- und Inselunterseiten nicht absaufen
  const fill = new THREE.DirectionalLight(0xbfd4e8, 0.22);
  fill.position.set(-6, -10, 4);
  group.add(fill);

  // Warmes Rim-/Backlight zum Abheben der Silhouetten (billiger Realismus-Boost)
  const rim = new THREE.DirectionalLight(0xfff0d6, 0.42);
  rim.position.set(-14, 8, 18);
  group.add(rim);

  // Weiche Horizont-Dunstschicht für Tiefe
  const haze = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(226,240,250,0.55)', 'rgba(210,230,245,0.22)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
      fog: false,
    })
  );
  haze.position.set(0, 3, -30);
  haze.scale.set(90, 22, 1);
  group.add(haze);

  // Hauptinsel, auf der der Nutzer steht – mit Blumen, Gras, Fluss und Wasserfall
  const main = buildIsland(rand, {
    radius: 5,
    depth: 8.2,
    trees: 9,
    rocks: 9,
    vines: 9,
    river: 2.1,
  });
  group.add(main);
  const shape = main.userData.shape;
  addGrassDecoration(group, rand, shape);
  addUndergrowth(group, rand, shape);
  const waterfall = makeWaterfall(rand, shape);
  group.add(waterfall.group);
  const birds = makeBirds(rand);
  group.add(birds.group);
  const butterflies = makeButterflies(rand);
  group.add(butterflies.group);

  // Entfernte Mini-Inseln, die sanft auf und ab schweben
  const minis = [];
  const miniConfigs = [
    { angle: 0.6, dist: 14, y: -1.5, scale: 0.35 },
    { angle: 2.4, dist: 19, y: 2.0, scale: 0.5 },
    { angle: 3.9, dist: 23, y: -3.0, scale: 0.65 },
    { angle: 5.2, dist: 16, y: 3.5, scale: 0.3 },
    { angle: 1.5, dist: 26, y: -5.5, scale: 0.55 },
  ];
  miniConfigs.forEach((cfg, i) => {
    // Geringere Auflösung: Die Mini-Inseln stehen 14–26 m entfernt, dort fällt
    // die halbe Gitterdichte nicht auf, spart aber Dreiecke und Bauzeit.
    const mini = buildIsland(rand, { radius: 5, depth: 6.4, trees: 3, rocks: 2, vines: 5, detail: 0.55 });
    mini.scale.setScalar(cfg.scale);
    mini.position.set(Math.sin(cfg.angle) * cfg.dist, cfg.y, Math.cos(cfg.angle) * cfg.dist);
    mini.userData.baseY = cfg.y;
    mini.userData.phase = i * 1.7;
    group.add(mini);
    minis.push(mini);
  });

  // Wolken in mehreren Höhenschichten – auch UNTER den Inseln sichtbar.
  const clouds = [];
  const cloudLayers = [
    { count: 9, yMin: 5, yMax: 13, rMin: 15, rMax: 36, size: 1.2 }, // hoch am Himmel
    { count: 7, yMin: -2, yMax: 3.5, rMin: 16, rMax: 32, size: 1.0 }, // auf Augenhöhe
    { count: 9, yMin: -13, yMax: -4, rMin: 8, rMax: 28, size: 1.35 }, // tief unter den Inseln
  ];
  for (const layer of cloudLayers) {
    for (let i = 0; i < layer.count; i++) {
      const cloud = makeCloud(rand, layer.size);
      const a = rand() * Math.PI * 2;
      const r = layer.rMin + rand() * (layer.rMax - layer.rMin);
      const y = layer.yMin + rand() * (layer.yMax - layer.yMin);
      cloud.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      cloud.rotation.y = rand() * Math.PI * 2;
      cloud.userData.baseX = cloud.position.x;
      cloud.userData.baseZ = cloud.position.z;
      cloud.userData.speed = 0.1 + rand() * 0.22;
      cloud.userData.range = 26;
      clouds.push(cloud);
      group.add(cloud);
    }
  }

  // Weltmaßstab: Die Insel war als Diorama modelliert – Bäume nur rund 1,6 m
  // hoch, also auf Augenhöhe eines stehenden Nutzers, und die Hauptinsel gerade
  // 10 m breit. In VR fühlt man sich dadurch riesig. Die ganze Gruppe wird
  // deshalb hochskaliert; Bäume erreichen so gut 6 m, die Insel rund 40 m, und
  // die Komposition (Lichtrichtungen, Winkel, Silhouetten) bleibt exakt
  // erhalten, weil alles denselben Faktor bekommt.
  const WORLD_SCALE = 4;
  group.scale.setScalar(WORLD_SCALE);

  // Leichter Tiefennebel (fern), damit ferne Inseln/Wolken sanft ausblenden –
  // Karten in Reichweite bleiben unberührt. Die Distanzen sind Weltkoordinaten
  // und müssen den Maßstab mitgehen, sonst versinkt die Insel im Nebel.
  const fog = new THREE.Fog(0xcfe4f2, 18 * WORLD_SCALE, 46 * WORLD_SCALE);

  // Was in der Brille dünner wird. Das Laub zuerst – Alpha-Test und
  // Überzeichnung –, dann die Streudekoration: Blumen, Grasbüschel, Pilze und
  // Büsche sind zu Hunderten da und einzeln nicht zu vermissen. Die Wolken, der
  // Wasserfall und die Insel selbst bleiben; sie sind die Silhouette.
  const ISLAND_QUALITAET = {
    ausduennen: new Map([
      // Die beiden großen Posten. Gemessen (inselkosten.mjs, volle Stufe):
      // Kronenlaub 46.060 Dreiecke, Rankenlaub 28.764, Hüllkörper 17.360 –
      // zusammen zwei Drittel der Insel.
      ['island-laub', 0.5],
      ['island-ranken-laub', 0.45],
      ['island-krone', 0.6],
      ['flowers', 0.45],
      ['tufts', 0.45],
      ['bushes', 0.7],
      ['mushrooms', 0.6],
    ]),
  };

  return {
    id: 'island',
    name: '🏝 Himmelsinsel',
    background: new THREE.Color(0x9cc9e8),
    fog,
    group,
    setQuality(stufe) {
      applyQuality(group, null, stufe, ISLAND_QUALITAET);
      return null;
    },
    update(time) {
      for (const mini of minis) {
        mini.position.y = mini.userData.baseY + Math.sin(time * 0.4 + mini.userData.phase) * 0.5;
      }
      for (const cloud of clouds) {
        const range = cloud.userData.range;
        const x = cloud.userData.baseX + time * cloud.userData.speed;
        cloud.position.x = ((x + range) % (range * 2) + range * 2) % (range * 2) - range;
      }
      waterfall.update(time);
      birds.update(time);
      butterflies.update(time);
    },
  };
}

// --- Wertrauschen (value noise) + fBm für natürliches, weiches Gelände ---
function smoothstep(a, b, t) {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
function valueNoise2(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const tl = hashNoise(xi, zi, 0);
  const tr = hashNoise(xi + 1, zi, 0);
  const bl = hashNoise(xi, zi + 1, 0);
  const br = hashNoise(xi + 1, zi + 1, 0);
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return (tl * (1 - u) + tr * u) * (1 - v) + (bl * (1 - u) + br * u) * v;
}
function fbm2(x, z) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += (valueNoise2(x * freq, z * freq) - 0.5) * amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}
// Kraterprofil (t = Abstand/Radius): Mulde innen, angehobener Wall am Rand.
function craterProfile(t) {
  if (t < 0.82) return -(1 - (t / 0.82) ** 2); // Schüssel: -1 … 0
  if (t < 1.14) return 0.32 * Math.sin((Math.PI * (t - 0.82)) / 0.32); // Randwall
  return 0;
}

// Natürlicher, rötlicher Mars-Untergrund: sanft gewelltes Gelände mit
// Einschlagkratern, verstreuten Felsen und weichen Hügeln am Horizont.
// Keine kastenförmigen Strukturen, kein Raster.
// --- Regolith: Marsboden und Marsfels ---------------------------------------
//
// **Warum der Nachthimmel überhaupt Karten bekommt, obwohl er von Eigenleuchten
// lebt.** Sterne, Mond und Glühen sind unbeleuchtete Flächen und ändern sich
// hier nicht. Der Boden aber ist die eine große beleuchtete Fläche der Szene,
// und er hatte gar nichts: eine Farbe, Rauheit 1, fertig. Bei einem
// Mondlicht, das flach von der Seite kommt, ist genau das der Fall, in dem eine
// Normal-Map am meisten trägt – streifendes Licht auf feiner Körnung ist der
// ganze Unterschied zwischen Sand und Pappe.
//
// Kein Himmelslicht dazu: Eine PMREM-Karte für eine Nachtszene bringt nichts,
// was das Hemisphärenlicht nicht schon tut, und kostet eine Abtastung je
// Fragment.
let _marsMaps = null;
function marsMaps() {
  if (_marsMaps) return _marsMaps;
  const size = 256;
  // Regolith: feiner Staub mit eingestreuten Steinchen. Zwei Frequenzen, weil
  // eine allein entweder Grieß (nur hoch) oder Dünen (nur tief) ergibt.
  const rausch = (x, y, k) => {
    const s = Math.sin(x * 12.9898 + y * 78.233 + k * 3.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const { normalMap, roughnessMap, field } = heightToMaps({
    size,
    strength: 1.9,
    height: (x, y) => {
      const grob = rausch(x >> 4, y >> 4, 1) * 0.5;
      const mittel = rausch(x >> 2, y >> 2, 2) * 0.34;
      const fein = rausch(x, y, 3) * 0.16;
      return grob + mittel + fein;
    },
    // Staub ist stumpf, die freigewehten Steinchen etwas weniger. Die Streuung
    // ist klein, aber sie ist es, die eine Fläche vor dem Plastikeindruck
    // bewahrt.
    roughness: (h) => Math.max(0, Math.min(255, (0.97 - h * 0.14) * 255)),
    anisotropy: 8,
  });
  for (const t of [normalMap, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
  }
  _marsMaps = { normalMap, roughnessMap, field };
  return _marsMaps;
}

let _marsGround = null;
function marsGroundMaterial() {
  if (!_marsGround) {
    const m = marsMaps();
    _marsGround = new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 1, // wird von der Karte moduliert
      metalness: 0,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
  }
  return _marsGround;
}

let _marsRock = null;
function marsRockMaterial() {
  if (!_marsRock) {
    const m = marsMaps();
    _marsRock = new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: m.normalMap,
      roughnessMap: m.roughnessMap,
      roughness: 1,
      metalness: 0,
      // Kräftiger als am Boden: Ein Brocken ist rauer als der Staub um ihn.
      normalScale: new THREE.Vector2(1.4, 1.4),
    });
  }
  return _marsRock;
}

function makeMarsGround(rand) {
  const group = new THREE.Group();

  const craters = [
    { x: 9, z: -7, r: 3.0, depth: 0.9 },
    { x: -11, z: 5, r: 4.2, depth: 1.15 },
    { x: 5.5, z: 12, r: 2.4, depth: 0.7 },
    { x: -6, z: -13, r: 3.4, depth: 0.9 },
    { x: 15, z: 9, r: 5.0, depth: 1.3 },
  ];

  const heightAt = (x, z) => {
    const big = fbm2(x * 0.05, z * 0.05) * 3.2; // weite, rollende Dünen
    const med = fbm2(x * 0.16, z * 0.16) * 0.9; // mittlere Wellen
    const fine = (hashNoise(x * 1.7, z * 1.7, 7) - 0.5) * 0.12; // Körnung
    let h = big + med + fine;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 1.2) h += craterProfile(d / c.r) * c.depth;
    }
    // Zentrum flach halten, damit man eben steht
    return h * smoothstep(0.6, 4.5, Math.hypot(x, z));
  };

  // Dichtes Gitter (nicht CircleGeometry – die hat keine inneren Vertices)
  const SIZE = 96;
  const SEG = 150;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x9c4a2b);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i); // PlaneGeometry: y ist die zweite Ebenenachse
    const h = heightAt(x, z);
    pos.setZ(i, h);
    // Leichte Farbmodulation: Höhen heller (Staub), Mulden dunkler
    const shade = 0.82 + smoothstep(-2, 3, h) * 0.4 + (hashNoise(x * 2.1, z * 2.1, 9) - 0.5) * 0.12;
    col.copy(base).multiplyScalar(shade);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // **UVs in Weltmaßstab.** Eine PlaneGeometry legt ihre UVs einmal über die
  // ganze Fläche – hier über 96 Meter. Ohne diese Skalierung wäre die
  // Regolithkarte auf 96 m gestreckt und damit unsichtbar; derselbe Fehler wie
  // bei der Grasnarbe der Insel, dort erst im Bild aufgefallen.
  scaleUV(geo, SIZE / 1.6);
  const ground = new THREE.Mesh(geo, marsGroundMaterial());
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  group.add(ground);

  // Verstreute Felsbrocken (mehr Facetten = Stein statt Kristall, flach gelagert)
  const rockColors = [0x843d24, 0x6f331f, 0x5a281a, 0x92472b];
  for (let i = 0; i < 30; i++) {
    const a = rand() * Math.PI * 2;
    const r = 3.5 + rand() * 16;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const s = 0.14 + rand() * 0.42;
    const geoR = new THREE.IcosahedronGeometry(s, 1);
    // Unregelmäßig verschieben, damit es kein glatter Edelstein ist
    const rp = geoR.attributes.position;
    for (let v = 0; v < rp.count; v++) {
      const f = 0.78 + hashNoise(rp.getX(v) * 40, rp.getY(v) * 40, rp.getZ(v) * 40 + i) * 0.44;
      rp.setXYZ(v, rp.getX(v) * f, rp.getY(v) * f, rp.getZ(v) * f);
    }
    geoR.computeVertexNormals();
    // Ein Material für alle dreißig Brocken; die vier Rottöne stecken in den
    // Scheitelfarben. Kein Moos – auf dem Mars wächst nichts, und `mossPatina()`
    // wäre hier genau die Sorte gedankenloser Wiederverwendung, die man den
    // Werkzeugen später ansieht.
    boxProjectUV(geoR, 0.22);
    paintVertices(geoR, rockColors[Math.floor(rand() * rockColors.length)]);
    const rock = new THREE.Mesh(geoR, marsRockMaterial());
    rock.position.set(bx, heightAt(bx, bz) - 0.03 + s * 0.25, bz);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.scale.set(1 + rand() * 0.5, 0.45 + rand() * 0.4, 1 + rand() * 0.5);
    group.add(rock);
  }

  // Weiche, natürliche Hügel am Horizont (teilweise „vergrabene" Kuppeln) –
  // ersetzt die alten kastenförmigen Tafelberge.
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x7a3820, roughness: 1, metalness: 0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.6;
    const r = 26 + rand() * 12;
    const R = 5 + rand() * 6;
    const hGeo = new THREE.SphereGeometry(R, 20, 14);
    const hp = hGeo.attributes.position;
    for (let v = 0; v < hp.count; v++) {
      const f = 1 + (valueNoise2(hp.getX(v) * 0.3 + i * 10, hp.getZ(v) * 0.3) - 0.5) * 0.5;
      hp.setXYZ(v, hp.getX(v) * f, hp.getY(v), hp.getZ(v) * f);
    }
    hGeo.computeVertexNormals();
    const hill = new THREE.Mesh(hGeo, hillMat);
    const flat = 0.28 + rand() * 0.16;
    hill.scale.y = flat;
    // So weit eingraben, dass nur eine sanfte Kuppe herausschaut
    hill.position.set(Math.cos(a) * r, -R * flat * 0.62, Math.sin(a) * r);
    group.add(hill);
  }

  return group;
}

function createNightEnvironment() {
  const rand = mulberry32(42424242);
  const group = new THREE.Group();
  group.name = 'env-night';

  // Nachthimmel mit rötlich getöntem Mars-Horizont
  group.add(makeDome(0x0b1533, 0x2a1512, 0x160a08));

  const starTexture = makeGlowTexture('rgba(255,255,255,1)', 'rgba(210,225,255,0.6)', 64);
  const starsGroup = new THREE.Group();
  const shells = [
    { count: 1300, size: 0.28, opacity: 0.75 },
    { count: 200, size: 0.55, opacity: 1 },
  ];
  for (const shell of shells) {
    const positions = new Float32Array(shell.count * 3);
    for (let i = 0; i < shell.count; i++) {
      const u = rand() * 2 - 1;
      const phi = rand() * Math.PI * 2;
      const r = 38 + rand() * 2;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = s * Math.cos(phi) * r;
      positions[i * 3 + 1] = Math.max(0.05 * r, Math.abs(u) * r);
      positions[i * 3 + 2] = s * Math.sin(phi) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        map: starTexture,
        size: shell.size,
        transparent: true,
        opacity: shell.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
        fog: false,
      })
    );
    starsGroup.add(stars);
  }
  group.add(starsGroup);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(1.4, 32, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8ecf2, fog: false })
  );
  moon.position.set(14, 16, -24);
  group.add(moon);
  const moonGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(220,232,255,0.9)', 'rgba(180,200,255,0.35)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  moonGlow.position.copy(moon.position);
  moonGlow.scale.set(8, 8, 1);
  group.add(moonGlow);

  // Beleuchtung, damit der Mars-Untergrund plastisch (rötlich) erscheint
  group.add(new THREE.HemisphereLight(0x3a4a72, 0x2a120a, 0.7));
  const moonLight = new THREE.DirectionalLight(0xcdd9ff, 0.7);
  moonLight.position.copy(moon.position);
  group.add(moonLight);
  // Warmes, sehr schwaches Bodenlicht für die typische Marsröte
  const groundGlow = new THREE.DirectionalLight(0xff7a4d, 0.25);
  groundGlow.position.set(-8, 3, 6);
  group.add(groundGlow);

  group.add(makeMarsGround(rand));

  return {
    id: 'night',
    name: '🌌 Nachthimmel',
    background: new THREE.Color(0x0a0605),
    fog: new THREE.Fog(0x1c0d09, 22, 48),
    group,

    // **Hier gibt es bewusst nichts auszudünnen.** Der Nachthimmel hat keine
    // Blattkarten, keine additiven Lagen über Bildschirmgröße und keine
    // Instanzenwolke, deren Hälfte man nicht vermisst: Er besteht aus einer
    // Bodenfläche, dreißig Brocken und zwei Punktwolken. Die Sterne zu halbieren
    // spart ein paar tausend Punkte und nimmt der Szene ihr einziges Motiv.
    //
    // Der Aufruf steht trotzdem hier, und zwar mit leerer Konfiguration: Damit
    // greift der materialseitige Teil von applyQuality() – doppelseitige
    // Materialien werden in der Brille einseitig – und es ist an dieser Stelle
    // aktenkundig, dass die Prüfung stattgefunden hat und negativ ausfiel.
    setQuality(stufe) {
      applyQuality(group, null, stufe, {});
      return null;
    },

    update(time) {
      starsGroup.rotation.y = time * 0.004;
    },
  };
}

// --- Zen-Garten ---

// Sandfläche mit weichen, geharkten Wellenlinien (konzentrisch, organisch – kein Raster)
// **Die Harkspur war bisher aufgemalt und nicht vorhanden.**
//
// Eine Rille im Kies ist kein hellerer Strich, sie ist eine Vertiefung: Bei
// einer Sonne, die hier 20° über dem Horizont steht, hat sie eine beschienene
// und eine verschattete Flanke, und genau dieser Wechsel macht aus einer Fläche
// eine geharkte Fläche. Aufgemalt bleibt sie flach, egal wie gut die Farbe ist –
// das ist der Grund, warum der Boden aussah wie bedruckter Karton.
//
// Deshalb wird dieselbe Zeichnung zweimal verwendet: einmal als Farbe und
// einmal als **Höhenfeld**, aus dem `heightToMaps()` die Normal-Map rechnet.
// Beide aus derselben Quelle heißt: Relief und Farbe liegen deckungsgleich.
// Zwei getrennte Zeichnungen wären die einfachste Art, eine Rille zu bekommen,
// die man sieht, aber nicht dort, wo sie hell ist.
const SAND_CENTERS = [
  [512, 512],
  [250, 300],
  [780, 700],
  [720, 260],
];
let _sandMaps = null;
function sandMaps() {
  if (_sandMaps) return _sandMaps;
  const size = 1024;

  // --- Höhenfeld -------------------------------------------------------------
  const hc = document.createElement('canvas');
  hc.width = hc.height = size;
  const hx = hc.getContext('2d');
  hx.fillStyle = '#b0b0b0'; // Kammhöhe zwischen den Rillen
  hx.fillRect(0, 0, size, size);
  // Weichgezeichnet gestrichelt, damit der Sobel eine **Flanke** findet statt
  // einer Stufe. Eine harte Kante ergibt in der Normal-Map einen Grat, der
  // keinen Schatten wirft, sondern einen schwarzen Strich zeigt – derselbe
  // Fehler, der beim Kies des Dojos einen eigenen Weichzeichner nötig machte.
  hx.filter = 'blur(3px)';
  hx.strokeStyle = '#3c3c3c'; // Rillengrund
  hx.lineWidth = 5;
  for (const [cx, cy] of SAND_CENTERS) {
    for (let r = 22; r < 220; r += 22) {
      hx.beginPath();
      hx.arc(cx, cy, r, 0, Math.PI * 2);
      hx.stroke();
    }
  }
  hx.filter = 'none';
  const gezeichnet = hx.getImageData(0, 0, size, size).data;
  const rille = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) rille[i] = gezeichnet[i * 4] / 255;

  // Körnung: eine feste Rauschzelle statt weißem Rauschen je Pixel. Auf einer
  // 40-m-Fläche wäre Pixelrauschen nur Flimmern.
  const korn = (x, y) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };

  const { normalMap, field } = heightToMaps({
    size,
    strength: 2.4,
    height: (x, y) => rille[y * size + x] * 0.82 + korn(x >> 2, y >> 2) * 0.18,
    anisotropy: 8,
  });

  // --- Farbe, aus demselben Feld --------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const bild = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const h = field[i];
      // Warmer Sandton mit einem Verlauf über die Diagonale, wie zuvor. Der
      // Rillengrund sieht weniger Himmel und wird dadurch dunkler.
      const diag = (x + y) / (size * 2);
      const schatten = 0.66 + h * 0.5;
      const r4 = i * 4;
      bild.data[r4] = Math.min(255, (231 - diag * 11) * schatten);
      bild.data[r4 + 1] = Math.min(255, (212 - diag * 15) * schatten);
      bild.data[r4 + 2] = Math.min(255, (176 - diag * 20) * schatten);
      bild.data[r4 + 3] = 255;
    }
  }
  ctx.putImageData(bild, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
  }

  _sandMaps = { map, normalMap };
  return _sandMaps;
}

// Die Sonne des Zen-Gartens als Richtung, in die das Licht **läuft**.
// `sun.position` ist [−12 | 9 | −6], das Licht zielt auf den Ursprung. Nötig,
// weil `mossPatina()` sonst die Sonne des Dojos nähme und die Wetterseite jedes
// Steins auf der falschen Seite läge.
const ZEN_SUN = (() => {
  const d = [12, -9, 6];
  const len = Math.hypot(...d);
  return d.map((v) => v / len);
})();

// Ein Material für **alle** Zen-Steine.
//
// Vorher legte jeder Stein sein eigenes `MeshStandardMaterial` an – bei rund
// dreißig Steinen sind das dreißig Draw-Calls, die sich nicht zusammenfassen
// lassen. `graniteMaterial()` mit Scheitelfarben macht daraus einen: Die
// Unterschiede zwischen den Steinen stecken in den Farben ihrer Vertices, nicht
// in getrennten Materialien. Genau dafür ist `vertexColors` da.
let _zenGranit = null;
function zenGranite() {
  if (!_zenGranit) {
    _zenGranit = graniteMaterial({ tone: 0xb8b2a8, vertexColors: true });
    // Kräftiger als im Dojo. Dort steht der Stein im Streiflicht einer sehr
    // tiefen Sonne, das die Körnung von selbst herausarbeitet; hier steht die
    // Sonne 35° hoch, und mit der Vorgabe von 1,0 war auf dem Findling aus
    // einem Meter Abstand schlicht nichts zu sehen.
    _zenGranit.normalScale = new THREE.Vector2(2.2, 2.2);
  }
  return _zenGranit;
}

function makeZenStone(rand, size, color = 0x8b8680) {
  // **Der verzerrte Ikosaeder ist entfallen.** Er gab einen glatten, rundlichen
  // Kiesel mit zweiundvierzig gleich großen Facetten – aus einem Meter ein
  // Spielstein, kein Findling. `weatheredStoneGeometry()` ist genau dafür da
  // und steht seit Runde 6 im Werkzeugkasten: gerichtete Verwitterung,
  // zurückgenommene Kanten, ein Knickwinkel, ab dem eine Kante scharf bleibt,
  // und Würfelprojektion für die Körnung.
  const geo = weatheredStoneGeometry(new THREE.IcosahedronGeometry(size, 1), rand() * 1000, {
    amount: 0.26,
    frequency: 2.2,
    bevel: 0.3,
    // Feiner als die Vorgabe von 0,4 m: Diese Steine sind 0,3 bis 0,7 m groß,
    // eine Kachel von 40 cm liefe genau einmal über den ganzen Stein und wäre
    // damit von einer Farbfläche nicht zu unterscheiden.
    uv: 0.18,
  });
  // Grundfarbe als Scheitelfarbe, dann die Patina darüber. Beide schreiben in
  // dasselbe Attribut, deshalb die Reihenfolge.
  paintVertices(geo, color);
  mossPatina(geo, {
    y0: 0.12,
    floor: 0,
    height: Math.max(0.18, size * 0.9),
    scale: Math.max(0.18, size * 0.7),
    strength: 0.85,
    seed: Math.floor(rand() * 1000),
    sun: ZEN_SUN,
  });

  const stone = new THREE.Mesh(geo, zenGranite());
  stone.scale.y = 0.55 + rand() * 0.3;
  stone.rotation.set(rand(), rand() * Math.PI * 2, rand());
  return stone;
}

// Steinlaterne (Ishidōrō): gestapelte Steinelemente mit warmem Glimmen
function makeLantern() {
  const group = new THREE.Group();
  const stoneMat = zenGranite();
  // Ein Stein, der jahrzehntelang im Garten steht: Auf jedem Absatz sammelt
  // sich Wasser, und dort sitzt der Schmutzring, der aus gestapelten Zylindern
  // ein Stück macht. `mossPatina()` kennt diesen `ledge`-Fall.
  const steinTeil = (geo, y, seed) => {
    boxProjectUV(geo, 0.16);
    paintVertices(geo, 0xa8a199);
    mossPatina(geo, {
      y0: y,
      floor: 0,
      height: 0.22,
      scale: 0.1,
      strength: 0.7,
      seed,
      sun: ZEN_SUN,
    });
    return geo;
  };
  const base = new THREE.Mesh(
    steinTeil(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 8), 0.06, 11),
    stoneMat
  );
  base.position.y = 0.06;
  group.add(base);
  const post = new THREE.Mesh(
    steinTeil(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 8), 0.33, 12),
    stoneMat
  );
  post.position.y = 0.33;
  group.add(post);
  const platform = new THREE.Mesh(
    steinTeil(new THREE.CylinderGeometry(0.16, 0.14, 0.06, 8), 0.57, 13),
    stoneMat
  );
  platform.position.y = 0.57;
  group.add(platform);
  // Lichtkasten mit warmem Glimmen
  const box = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.18, 6),
    new THREE.MeshStandardMaterial({ color: 0xffcf8a, emissive: 0xff9e3d, emissiveIntensity: 0.9, roughness: 0.7 })
  );
  box.position.y = 0.69;
  group.add(box);
  const roof = new THREE.Mesh(
    steinTeil(new THREE.ConeGeometry(0.22, 0.16, 6), 0.86, 14),
    stoneMat
  );
  roof.position.y = 0.86;
  group.add(roof);
  const finial = new THREE.Mesh(
    steinTeil(new THREE.SphereGeometry(0.045, 8, 6), 0.96, 15),
    stoneMat
  );
  finial.position.y = 0.96;
  group.add(finial);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,200,120,0.9)', 'rgba(255,150,60,0.35)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  glow.position.y = 0.69;
  glow.scale.set(1.2, 1.2, 1);
  group.add(glow);
  return group;
}

// Torii-Tor als ruhiger Landmark am Rand
function makeTorii() {
  const group = new THREE.Group();
  // Zinnoberrot bleibt – ein Torii ist rot –, aber jetzt auf gealtertem Holz:
  // Die Maserung läuft bei `weatheredWoodMaterial` in **V**, also längs eines
  // Zylinders, und genau so stehen die Pfosten. Die Farbe multipliziert die
  // Karte, der Rotton bleibt also erhalten und bekommt Struktur dazu.
  const mat = weatheredWoodMaterial({ tone: 0xd4553a, vertexColors: false });
  const h = 3.2;
  const span = 2.4;
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 12), mat);
    pillar.position.set(sx * span * 0.5, h / 2, 0);
    group.add(pillar);
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.1, 0.3, 0.42), mat);
  topBeam.position.y = h - 0.05;
  topBeam.rotation.z = 0.02;
  group.add(topBeam);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(span + 0.2, 0.22, 0.34), mat);
  lintel.position.y = h - 0.6;
  group.add(lintel);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.3), mat);
  ridge.position.y = h - 0.32;
  group.add(ridge);
  return group;
}

// Bambushalm (segmentierter Stiel), zu 1 Mesh verschmolzen.
//
// **Die drei Kegel als Blätter sind entfallen.** Ein Kegel ist ein Blatt nur
// aus dreißig Metern; aus zwei Metern ist er ein grüner Spieß, und der Hain
// steht mitten im Garten. An ihre Stelle treten Blattkarten aus dem
// Bambus-Atlas – dieselben, die im Dojo-Hain hängen –, mit Wind und
// Transluzenz. Das ist kein Zusatz, sondern ein Tausch: drei Kegel je Halm
// (72 Dreiecke) gegen eine Karteninstanz.
let _bambooMat = null;
let _bambooCards = null;
function bambooMaterials() {
  if (!_bambooMat) {
    _bambooMat = weatheredWoodMaterial({ tone: 0x9fbc63, vertexColors: false });
    _bambooCards = foliageMaterial({
      atlas: leafAtlas('bamboo'),
      // Aufgehellt. Der Bambusatlas hat Grundton [86 | 112 | 52] und ist für
      // den Schatten hinter einem Papierfenster gezeichnet; im offenen
      // Gartenlicht standen die Schöpfe als fast schwarze Klumpen über den
      // Halmen.
      color: 0xd8ecb0,
      translucency: 0.95,
      transColor: 0xd8f0a0,
      windStrength: 0.11,
    });
  }
  return { culm: _bambooMat, cards: _bambooCards };
}
function makeBambooStalk(rand) {
  const geos = [];
  const segs = 5 + Math.floor(rand() * 4);
  const rad = 0.035 + rand() * 0.02;
  let y = 0;
  for (let s = 0; s < segs; s++) {
    const segH = 0.34 + rand() * 0.14;
    const c = new THREE.CylinderGeometry(rad * 0.96, rad, segH, 7);
    c.translate(0, y + segH / 2, 0);
    geos.push(c);
    const knot = new THREE.CylinderGeometry(rad * 1.15, rad * 1.15, 0.03, 7);
    knot.translate(0, y + segH, 0);
    geos.push(knot);
    y += segH;
  }
  const stalk = new THREE.Mesh(mergeGeometries(geos), bambooMaterials().culm);
  stalk.userData.height = y;
  return stalk;
}

// Bambushain: mehrere Halme, die in update sanft wiegen.
function makeBambooGrove(rand, cx, cz) {
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  const stalks = [];
  for (let i = 0; i < 13; i++) {
    const stalk = makeBambooStalk(rand);
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.3;
    stalk.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    stalk.scale.setScalar(0.8 + rand() * 0.6);
    stalk.userData.phase = rand() * Math.PI * 2;
    stalk.userData.sway = 0.02 + rand() * 0.03;
    group.add(stalk);
    stalks.push(stalk);
  }
  // Laubschopf je Halm. Eine Instanz, ein Draw-Call für den ganzen Hain –
  // deshalb hängen die Schöpfe **nicht** an den einzelnen Halmen, sondern
  // stehen als eigene Instanzen an deren Positionen. Sie wiegen über den
  // Windterm des Materials mit, nicht über die Halmdrehung; das reicht, weil
  // ein Bambusschopf ohnehin stärker schwingt als sein Rohr.
  const { cards: laubMat } = bambooMaterials();
  // Zwei Schöpfe je Halm statt eines großen – dieselbe Begründung wie bei den
  // Kronen: Eine aufgelöste Silhouette entsteht aus Anzahl, nicht aus Größe.
  const schopf = new THREE.InstancedMesh(
    cardCluster({ count: 34, radius: 1, seed: 0xba3b, kind: 'bamboo', cardScale: 0.8 }),
    laubMat,
    stalks.length * 2
  );
  applyFoliageMaterial(schopf, laubMat);
  schopf.name = 'zen-bambus-laub';
  schopf.userData.fullCount = stalks.length * 2;
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    stalks.forEach((s, i) => {
      const hoehe = s.userData.height * s.scale.y;
      for (let k = 0; k < 2; k++) {
        q.setFromEuler(new THREE.Euler(0, i * 1.3 + k * 2.4, 0));
        m.compose(
          new THREE.Vector3(
            s.position.x + (k - 0.5) * 0.16,
            hoehe - 0.18 - k * 0.26,
            s.position.z + (k - 0.5) * 0.13
          ),
          q,
          new THREE.Vector3(0.3, 0.34, 0.3)
        );
        schopf.setMatrixAt(i * 2 + k, m);
      }
    });
    schopf.instanceMatrix.needsUpdate = true;
  }
  group.add(schopf);

  const shadow = makeBlobShadow(1.4, 0.4, 0.02);
  group.add(shadow);
  return {
    group,
    update(time) {
      for (const s of stalks) {
        s.rotation.z = Math.sin(time * 0.9 + s.userData.phase) * s.userData.sway;
        s.rotation.x = Math.cos(time * 0.7 + s.userData.phase) * s.userData.sway * 0.6;
      }
    },
  };
}

// Ahorn (Momiji) mit roter/oranger Krone als Farbkontrast.
// Das Blattmaterial der Ahornkronen, einmal für alle Bäume.
//
// Der zugehörige Hüllkörper-Werkstoff ist entfallen: Den legt `baueKrone()`
// selbst an, als Lambert-Material mit Instanzfarben. Vorher legte **jeder
// einzelne Blob** ein eigenes Standardmaterial an, nur um einen von vier
// Grüntönen zu bekommen.
let _mapleCards = null;
function mapleMaterials() {
  if (!_mapleCards) {
    _mapleCards = foliageMaterial({
      atlas: leafAtlas('maple'),
      // Ahornlaub im Herbst ist der Fall, für den der Transluzenzterm gebaut
      // ist – ein rotes Blatt gegen die Sonne leuchtet, statt dunkel zu werden.
      translucency: 0.85,
      transColor: 0xd98f45,
      windStrength: 0.07,
    });
  }
  return { cards: _mapleCards };
}

function makeMaple(rand) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 1.5, 8),
    weatheredWoodMaterial({ tone: 0x7d6552, vertexColors: false })
  );
  trunk.position.y = 0.75;
  trunk.rotation.z = -0.08;
  tree.add(trunk);
  const { cards } = mapleMaterials();
  const krone = baueKrone({
    ansaetze: [
      [0, 1.68, 0, 0.46],
      [0.5, 1.54, 0.15, 0.32],
      [-0.45, 1.6, -0.2, 0.34],
      [0.15, 1.92, -0.15, 0.3],
      [-0.2, 1.84, 0.35, 0.28],
    ],
    seed: 0x71a3 + Math.floor(rand() * 64),
    kartenMaterial: cards,
    kind: 'maple',
    cardScale: 0.85,
    // Heller als die Werte des Dojo-Gartens, aus denen sie stammen: Dort steht
    // der Ahorn im Schatten eines Vordachs, hier in der offenen
    // Nachmittagssonne. Unverändert übernommen war er ein brauner Klumpen.
    farben: [0x9c3f22, 0xb0512a, 0x8a3520],
    kartenFarben: [0xf2cfa8, 0xffdcb0, 0xe6bd98, 0xf8d4a4],
  });
  krone.blobs.name = 'zen-ahorn-blobs';
  krone.karten.name = 'zen-ahorn-karten';
  tree.add(krone.blobs, krone.karten);
  return tree;
}

// Seerosenblatt (flache Scheibe mit Kerbe) + optional Lotusblüte.
const LILY_MAT = new THREE.MeshStandardMaterial({ color: 0x3f8f4d, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
function makeLilyPad(rand) {
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.16 + rand() * 0.1, 20, 0.5, Math.PI * 1.85), LILY_MAT);
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = rand() * Math.PI * 2;
  return pad;
}
function makeLotus() {
  const g = new THREE.Group();
  const petalMat = new THREE.MeshStandardMaterial({ color: 0xff9dc2, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
  for (let ring = 0; ring < 2; ring++) {
    const n = ring === 0 ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.5;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), petalMat);
      petal.position.set(Math.cos(a) * (0.05 + ring * 0.04), 0.05 + ring * 0.03, Math.sin(a) * (0.05 + ring * 0.04));
      petal.rotation.set(Math.PI / 2 - (0.7 - ring * 0.3), 0, -a);
      g.add(petal);
    }
  }
  const center = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.6 })
  );
  center.position.y = 0.07;
  g.add(center);
  return g;
}

// --- Koi ---
//
// Die erste Fassung war eine flachgedrückte Kugel mit Kegeln als Flossen; im
// Wasser sah das aus wie ein Bonbon mit Zacken. Ein Koi liest sich über drei
// Dinge: eine spindelförmige Silhouette, die seitlich schmal und in der Höhe
// kräftig ist, weiche Flossen statt spitzer Kegel, und das gefleckte Muster.
// Das Muster kommt als Canvas-Textur – als Geometrie wären die Flecken teuer
// und würden trotzdem hart abgesetzt wirken.

// Kohaku (weiß mit roten Platten) bzw. Ogon (orange mit weißer Zeichnung).
function makeKoiTexture(variant) {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const base = variant === 0 ? '#f6f2ee' : '#e8873a';
  const spot = variant === 0 ? '#d8452a' : '#f7f3ec';
  const seed = variant === 0 ? 4711 : 1907;
  const rand = mulberry32(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Weiche, unregelmäßige Platten. Jede wird zusätzlich um ±w versetzt
  // gezeichnet, damit die Textur am Umfang nahtlos bleibt.
  const blob = (cx, cy, r) => {
    for (const dx of [-w, 0, w]) {
      ctx.beginPath();
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const rr = r * (0.68 + rand() * 0.5);
        const x = cx + dx + Math.cos(a) * rr * 1.35;
        const y = cy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  };
  ctx.fillStyle = spot;
  const plates = variant === 0 ? 5 : 4;
  for (let i = 0; i < plates; i++) {
    blob(30 + rand() * (w - 60), 20 + rand() * (h - 40), 16 + rand() * 20);
  }

  // Dunkler Rücken, heller Bauch: v läuft über den Umfang, oben liegt bei v≈0.25
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(20,14,10,0.22)');
  shade.addColorStop(0.45, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(255,255,255,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Flosse als flache, weiche Form. Die Punkte beschreiben die Silhouette in der
// XY-Ebene (x = nach hinten), gedreht liegt sie längs im Wasser.
function makeKoiFin(points, material) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    shape.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 10);
  geometry.rotateY(Math.PI / 2); // in die Längsebene des Fisches stellen
  return new THREE.Mesh(geometry, material);
}

function makeKoi(variant) {
  const koi = new THREE.Group();
  const L = 0.34; // Körperlänge

  // Spindelprofil: schlanker Kopf, kräftige Mitte, dünner Schwanzstiel.
  // y ist die Längsachse (Kopf +), x der Radius.
  const profile = [
    [0.004, -L / 2],
    [0.018, -L / 2 + 0.03],
    [0.032, -L / 2 + 0.07],
    [0.04, -L / 2 + 0.12],
    [0.046, -L / 2 + 0.17],
    [0.047, -L / 2 + 0.21],
    [0.043, -L / 2 + 0.26],
    [0.033, -L / 2 + 0.3],
    [0.02, -L / 2 + 0.33],
    [0.006, L / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const bodyGeo = new THREE.LatheGeometry(profile, 22);
  bodyGeo.rotateX(Math.PI / 2); // Längsachse von Y nach Z, Kopf nach +Z
  const body = new THREE.Mesh(
    bodyGeo,
    new THREE.MeshStandardMaterial({
      map: makeKoiTexture(variant),
      roughness: 0.34,
      metalness: 0.05,
    })
  );
  // Fische sind seitlich schmal und hochrückig – ohne das bliebe die Drehfigur
  // ein Schlauch.
  body.scale.set(0.6, 1.18, 1);
  koi.add(body);

  const finMat = new THREE.MeshStandardMaterial({
    color: variant === 0 ? 0xffe9dc : 0xffd9b4,
    roughness: 0.5,
    metalness: 0,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });

  // Schwanz mit eigenem Pivot (wedelt) – zweilappig, nicht spitz
  const tailPivot = new THREE.Group();
  tailPivot.position.z = -L / 2 + 0.01;
  const tail = makeKoiFin(
    [
      [0, 0], [0.05, 0.07], [0.12, 0.085], [0.13, 0.05],
      [0.07, 0.005], [0.13, -0.05], [0.12, -0.085], [0.05, -0.07],
    ],
    finMat
  );
  tailPivot.add(tail);
  koi.add(tailPivot);

  // Rückenflosse
  const dorsal = makeKoiFin(
    [[0, 0], [0.05, 0.045], [0.11, 0.05], [0.15, 0.01], [0.08, 0]],
    finMat
  );
  dorsal.position.set(0, 0.048, 0.03);
  koi.add(dorsal);

  // Afterflosse
  const anal = makeKoiFin([[0, 0], [0.04, -0.03], [0.08, -0.035], [0.1, -0.005]], finMat);
  anal.position.set(0, -0.042, -0.05);
  koi.add(anal);

  // Brustflossen, leicht nach hinten und unten gestellt
  for (const side of [-1, 1]) {
    const pec = makeKoiFin([[0, 0], [0.05, -0.02], [0.09, -0.045], [0.07, 0]], finMat);
    pec.position.set(side * 0.028, -0.012, 0.06);
    // Um die Längsachse gekippt, damit die Flosse seitlich absteht statt
    // senkrecht wie ein zweites Segel am Bauch zu stehen
    pec.rotation.z = side * 1.05;
    koi.add(pec);
  }

  // Augen
  const eyeGeo = new THREE.SphereGeometry(0.0085, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 0.25 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.024, 0.012, L / 2 - 0.055);
    koi.add(eye);
  }

  // Gieren (y) vor Nicken (x) auswerten – sonst kippt der Fisch beim Auf- und
  // Abtauchen je nach Kurs zusätzlich zur Seite.
  koi.rotation.order = 'YXZ';
  koi.userData = { tail: tailPivot };
  return koi;
}

function createZenEnvironment() {
  const rand = mulberry32(70707070);
  const group = new THREE.Group();
  group.name = 'env-zen';

  // Warme, ruhige Spätnachmittags-Kuppel
  group.add(makeDome(0x8fb6d8, 0xf6e3c6, 0xe4cba2));

  // Weiches, warmes Licht
  group.add(new THREE.HemisphereLight(0xffe9cf, 0xb8a888, 1.05));
  const sun = new THREE.DirectionalLight(0xffe0b3, 1.7);
  sun.position.set(-12, 9, -6);
  group.add(sun);
  const sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,240,210,1)', 'rgba(255,210,150,0.5)'),
      transparent: true,
      depthWrite: false,
      fog: false,
    })
  );
  sunSprite.position.set(-22, 10, -18);
  sunSprite.scale.set(9, 9, 1);
  group.add(sunSprite);

  // Warmes Rim-/Backlight zum Abheben der Silhouetten
  const rim = new THREE.DirectionalLight(0xffdcb0, 0.45);
  rim.position.set(16, 6, 14);
  group.add(rim);

  // Sandfläche (flach, geharkt) – jetzt mit echtem Relief in den Rillen.
  const sandK = sandMaps();
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(20, 72),
    new THREE.MeshStandardMaterial({
      map: sandK.map,
      normalMap: sandK.normalMap,
      // Trockener Kies ist stumpf. Keine Rauheitskarte: Die Streuung zwischen
      // Rillengrund und Kamm ist auf trockenem Sand klein, und das hier ist die
      // größte Fläche der Szene – eine Abtastung je Pixel für fast nichts.
      roughness: 0.95,
      metalness: 0,
    })
  );
  sand.name = 'zen-sand';
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.02;
  group.add(sand);

  // Moosinseln.
  //
  // **Zwei Fehler beim ersten Anlauf, beide erst im Bild sichtbar.**
  //
  // Erstens das Karomuster: `mossMaps()` setzt intern `repeat: [18, 18]`, und
  // eine CircleGeometry spannt ihre UVs einmal über die ganze Scheibe. Auf
  // einem Fleck von gut einem Meter lagen damit achtzehn Kacheln – aus zwei
  // Metern ein sauber sichtbares Raster. Die UVs werden deshalb so skaliert,
  // dass **eine** Kachel rund 55 cm bedeckt.
  //
  // Zweitens die Farbe: Die Farbkarte des Mooses ist dunkle, feuchte Erde mit
  // grünen Polstern – richtig für den schattigen Dojo-Garten, falsch neben
  // hellem Sand in der Nachmittagssonne. Wie bei der Insel bleibt das Relief
  // und geht die Farbkarte; das Grün kommt aus `color`.
  const mossMat = mossMaterial();
  mossMat.map = null;
  mossMat.color.setHex(0x7f9c55);
  mossMat.vertexColors = true;
  // Ohne Farbkarte **und** ohne Scheitelfarben ist die Scheibe gleichförmig
  // grün – dieselbe Falle wie beim Inselrasen, einen Absatz weiter unten
  // beschrieben und hier prompt wiederholt. Die Variation hängt jetzt an der
  // Geometrie: außen ausdünnend (Moos endet nicht an einer Kante) und mit
  // groben Flecken darin.
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2 + rand() * 7;
    const mossR = 0.5 + rand() * 0.8;
    const mossGeo = new THREE.CircleGeometry(mossR, 20);
    // Kachelgröße in Weltmetern: `repeat` der Karte ist 18, ein UV-Schritt von
    // 1 wären also 18 Kacheln. Für 0,55 m je Kachel muss die Scheibe
    // (2·r Meter breit) über 2·r / (18 · 0,55) UV-Einheiten laufen.
    scaleUV(mossGeo, (2 * mossR) / (18 * 0.55));
    bakeVertexShade(mossGeo, (x, y, z) => {
      const rand2 = Math.min(1, Math.hypot(x, z) / mossR);
      // Zum Rand hin heller und ausdünnend, dazu Flecken.
      const saum = 1 + rand2 * rand2 * 0.35;
      const fleck = 0.82 + hashNoise(x * 2.6, 0, z * 2.6) * 0.34;
      return saum * fleck;
    });
    const moss = new THREE.Mesh(mossGeo, mossMat);
    moss.rotation.x = -Math.PI / 2;
    moss.position.set(Math.cos(a) * r, -0.01, Math.sin(a) * r);
    moss.scale.set(1 + rand() * 0.6, 1, 0.7 + rand() * 0.5);
    group.add(moss);
  }

  // Stein-Arrangements (klassisch asymmetrische Gruppen)
  const stoneGroups = [
    { x: -3.5, z: -2.5, n: 3 },
    { x: 4, z: 1.5, n: 2 },
    { x: 1, z: -4.5, n: 3 },
  ];
  for (const sg of stoneGroups) {
    for (let i = 0; i < sg.n; i++) {
      const size = 0.28 + rand() * 0.45;
      const s = makeZenStone(rand, size, i === 0 ? 0x807a72 : 0x938c83);
      const px = sg.x + (rand() - 0.5) * 0.9;
      const pz = sg.z + (rand() - 0.5) * 0.9;
      s.position.set(px, 0.12 + rand() * 0.1, pz);
      group.add(s);
      const sh = makeBlobShadow(size * 1.5, 0.5);
      sh.position.set(px, 0.015, pz);
      group.add(sh);
    }
  }

  // Trittstein-Pfad. Ein Material für alle sechs, Unterschiede über die
  // Scheitelfarben; Moos sammelt sich am Rand, wo der Fuß nicht hintritt.
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12);
    boxProjectUV(geo, 0.22);
    paintVertices(geo, 0x8e8880);
    mossPatina(geo, {
      y0: 0.01,
      floor: 0,
      height: 0.05,
      scale: 0.14,
      // Schwächer als bei den Findlingen: Ein Trittstein wird betreten, auf
      // seiner Mitte wächst nichts. `up` würde genau dort am stärksten greifen,
      // deshalb bleibt die Stärke niedrig und das Moos steht im Rauschen am Rand.
      strength: 0.45,
      seed: 40 + i,
      sun: ZEN_SUN,
    });
    const step = new THREE.Mesh(geo, zenGranite());
    step.position.set(-1.5 + i * 0.85, 0.01, 3.2 - i * 0.5 + Math.sin(i) * 0.2);
    step.scale.set(1 + rand() * 0.2, 1, 0.85);
    group.add(step);
  }

  // Koi-Teich
  const pondCenter = new THREE.Vector3(3.2, 0, -1.2);
  // **Zwei gegeneinander wandernde Kräuselungslagen statt einer geschobenen
  // Textur.** Eine einzelne Lage mit laufendem Versatz liest man sofort als
  // verschobenes Bild; erst zwei Lagen in verschiedener Richtung und Frequenz
  // ergeben ein Muster, das entsteht und wieder vergeht. Der Grundton ist dunkel,
  // weil man auf Wasser fast nur die Spiegelung sieht – ein heller Grundton
  // macht daraus graue Farbe.
  const pondMat = waterMaterial({ repeat: 3.2 });
  pondMat.transparent = true;
  // **Heller und durchsichtiger als das Tsukubai-Becken im Dojo.** Der
  // Grundton dort ist fast schwarz, weil ein Steinbecken tief und schattig ist
  // und man darin praktisch nur die Spiegelung sieht. Ein Gartenteich mit
  // Seerosen ist flach: Der Sand darunter gehört ins Bild. Mit dem
  // unveränderten Wert war der Teich ein schwarzes Loch im Sand – nachgesehen,
  // nicht überlegt.
  pondMat.color.setHex(0x16363c);
  pondMat.opacity = 0.8;
  // Das Wasser braucht etwas zu spiegeln. Ohne Environment-Map bleibt bei
  // Rauheit 0,05 nur die Grundfarbe übrig, und die ist absichtlich dunkel.
  pondMat.userData.needsEnv = true;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), pondMat);
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(pondCenter.x, 0.01, pondCenter.z);
  pond.scale.set(1.2, 1, 1);
  group.add(pond);
  // Steinrand um den Teich
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const s = makeZenStone(rand, 0.12 + rand() * 0.08, 0x8f8880);
    s.position.set(pondCenter.x + Math.cos(a) * 2.0, 0.05, pondCenter.z + Math.sin(a) * 1.7);
    group.add(s);
  }
  // Seerosenblätter + Lotusblüten auf der Wasseroberfläche
  for (let i = 0; i < 7; i++) {
    const pad = makeLilyPad(rand);
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.5;
    pad.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.03, pondCenter.z + Math.sin(a) * r);
    group.add(pad);
  }
  for (let i = 0; i < 3; i++) {
    const lotus = makeLotus();
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 1.1;
    lotus.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.04, pondCenter.z + Math.sin(a) * r);
    group.add(lotus);
  }
  // Wasser-Ringe: wachsen & blenden aus (dort, wo Koi auftauchen)
  const ripples = [];
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 28), rippleMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.025;
    ring.userData = { phase: rand() * 1000, period: 3 + rand() * 2 };
    group.add(ring);
    ripples.push(ring);
  }
  // Zwei Koi ziehen ihre Bahnen im Teich
  const kois = [];
  for (let i = 0; i < 2; i++) {
    const koi = makeKoi(i);
    koi.userData.radius = 0.62 + i * 0.34;
    koi.userData.speed = (0.3 + rand() * 0.12) * (i % 2 ? 1 : -1);
    koi.userData.phase = rand() * 6.28;
    group.add(koi);
    kois.push(koi);
  }

  // Kirschblütenbaum (Sakura)
  //
  // **Der Hüllkörper bleibt, die Karten kommen dazu.** Die sechs
  // Ikosaeder-Blobs waren die ganze Krone – aus der Nähe sechs rosa Bälle. Sie
  // bleiben stehen, aber als *Silhouette*: Sie schließen die Krone, damit man
  // nicht hindurchsieht, und sind nach unten abgedunkelt, damit sie zwischen
  // den Karten als Tiefe lesen statt als Ball. Darüber liegt eine Instanz je
  // Blob mit echten Blütenkarten samt Wind und Transluzenz.
  const sakura = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 1.8, 8);
  const trunk = new THREE.Mesh(
    trunkGeo,
    // `vertexColors` muss **aus** sein: Die Vorgabe ist `true`, ein
    // CylinderGeometry bringt aber kein Farbattribut mit, und three liest dann
    // ins Leere – der Stamm wird schwarz. Genau so passiert und im Bild gesehen.
    weatheredWoodMaterial({ tone: 0x8a6f58, vertexColors: false })
  );
  trunk.position.y = 0.9;
  trunk.rotation.z = 0.12;
  sakura.add(trunk);
  // Krone aus vielen kleinen Schöpfen. Die sechs groben Ansatzpunkte bleiben –
  // sie sind die Form des Baums –, aber jeder wird jetzt in mehrere Schöpfe
  // aufgelöst statt als eine Blase zu stehen.
  const sakuraCards = foliageMaterial({
    atlas: leafAtlas('sakura'),
    // Kirschblüten im Gegenlicht sind der Lehrbuchfall für Transluzenz: Ein
    // Blütenblatt ist dünner als jedes Laubblatt und leuchtet regelrecht.
    translucency: 1.0,
    transColor: 0xffdfe9,
    windStrength: 0.085,
    roughness: 0.88,
  });
  const sakuraKrone = baueKrone({
    ansaetze: [
      [0, 2.05, 0, 0.62],
      [0.62, 1.88, 0.22, 0.44],
      [-0.52, 1.98, -0.3, 0.48],
      [0.3, 2.32, -0.2, 0.4],
      [-0.3, 2.24, 0.4, 0.36],
      [0.1, 1.78, 0.5, 0.34],
    ],
    seed: 0x5a4a,
    kartenMaterial: sakuraCards,
    kind: 'sakura',
    // Große Karten, damit sie sich überlappen und den Hüllkörper zudecken.
    cardScale: 0.85,
    // **Der Hüllkörper liegt in derselben Farbfamilie wie die Blüten, nur
    // dunkler.** Der erste Anlauf hatte ihn auf Pflaume gesetzt, weil „dunkel
    // gleich Tiefe" – das Ergebnis waren dunkle Pflaumen mit rosa Sprenkeln
    // darauf. Tiefe entsteht durch **Helligkeitsunterschied innerhalb einer
    // Farbe**, nicht durch eine zweite Farbe.
    farben: [0xc98fa6, 0xd6a0b4, 0xbc8398],
    kartenFarben: [0xffe4ee, 0xffd2e2, 0xf8c6d8],
  });
  sakuraKrone.blobs.name = 'zen-sakura-blobs';
  sakuraKrone.karten.name = 'zen-sakura-karten';
  sakura.add(sakuraKrone.blobs, sakuraKrone.karten);
  sakura.position.set(-4.5, 0, 2.5);
  group.add(sakura);
  const sakuraShadow = makeBlobShadow(1.3, 0.4);
  sakuraShadow.position.set(-4.4, 0.015, 2.5);
  group.add(sakuraShadow);

  // Ahorn (Momiji) als Farbkontrast gegenüber der Sakura
  const maple = makeMaple(rand);
  maple.position.set(4.8, 0, 3.2);
  group.add(maple);
  const mapleShadow = makeBlobShadow(1.0, 0.4);
  mapleShadow.position.set(4.8, 0.015, 3.2);
  group.add(mapleShadow);

  // Bambushain (wiegt in update)
  const bamboo = makeBambooGrove(rand, -6.5, -3.5);
  group.add(bamboo.group);

  // Steinlaterne + Torii (mit Kontaktschatten)
  const lantern = makeLantern();
  lantern.position.set(1.6, 0, -1.8);
  group.add(lantern);
  const lanternShadow = makeBlobShadow(0.4, 0.5);
  lanternShadow.position.set(1.6, 0.015, -1.8);
  group.add(lanternShadow);
  const torii = makeTorii();
  torii.position.set(-2, 0, -9);
  torii.rotation.y = 0.35;
  group.add(torii);
  const toriiShadow = makeBlobShadow(1.8, 0.35);
  toriiShadow.position.set(-2, 0.015, -9);
  toriiShadow.scale.x *= 2; // länglich unter dem Tor
  group.add(toriiShadow);

  // Warm glühende Staubpartikel im tiefen Sonnenlicht
  const DUST = 70;
  const dustPos = new Float32Array(DUST * 3);
  const dustMeta = [];
  for (let i = 0; i < DUST; i++) {
    dustMeta.push({ x: (rand() - 0.5) * 24, y: 0.3 + rand() * 3, z: (rand() - 0.5) * 24, sp: 0.1 + rand() * 0.2, ph: rand() * 6.28 });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,240,210,0.9)', 'rgba(255,220,170,0.4)', 32),
      color: 0xffe6c0,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    })
  );
  dust.frustumCulled = false;
  group.add(dust);

  // Zarter, tief liegender Bodennebel (langsam driftende Weichnebel-Sprites)
  const mistSprites = [];
  const mistMat = () =>
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,246,230,0.4)', 'rgba(250,235,210,0.16)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
      fog: false,
    });
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(mistMat());
    s.userData = { x: (rand() - 0.5) * 20, z: (rand() - 0.5) * 20, drift: (rand() - 0.5) * 0.15, ph: rand() * 6.28 };
    s.position.set(s.userData.x, 0.35, s.userData.z);
    s.scale.set(7 + rand() * 4, 2.2, 1);
    group.add(s);
    mistSprites.push(s);
  }

  // Treibende Kirschblütenblätter
  const PET = 120;
  const petalPos = new Float32Array(PET * 3);
  const petalMeta = [];
  for (let i = 0; i < PET; i++) {
    petalMeta.push({
      x: (rand() - 0.5) * 22,
      z: (rand() - 0.5) * 22,
      y0: rand() * 9,
      speed: 0.25 + rand() * 0.4,
      sway: rand() * 6.28,
      swayAmp: 0.25 + rand() * 0.5,
    });
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
  const petals = new THREE.Points(
    petalGeo,
    new THREE.PointsMaterial({
      map: makeGlowTexture('rgba(255,200,222,1)', 'rgba(255,175,205,0.7)', 48),
      color: 0xffd0e2,
      size: 0.14,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  petals.frustumCulled = false;
  group.add(petals);

  // Die Sonne dieser Umgebung als Himmelsbeschreibung. Warmer Spätnachmittag:
  // tiefer Zenit, sehr breiter goldener Dunst am Horizont – deutlich anders als
  // der klare Vormittagshimmel des Dojos, und genau deshalb ein eigener Eintrag
  // im Zwischenspeicher von `buildSkyEnvironment`.
  const ZEN_HIMMEL = {
    name: 'zen',
    sun: [-12, 9, -6],
    target: [0, 0, 0],
    sunColor: 0xffe0b3,
    sky: {
      zenith: { hex: 0x7ea3cc, level: 0.36 },
      horizon: { hex: 0xf3dcb4, level: 0.66 },
      haze: { hex: 0xffc98a, level: 0.58 },
      ground: { hex: 0x8d7d5e, level: 0.26 },
    },
  };
  let zenSky = null;

  // Die Kronen bleiben dichter als das Bodenlaub: Sie stehen auf Augenhöhe und
  // sind das, was man zuerst sieht. Der Bambusschopf verträgt am meisten – er
  // steht am weitesten weg und ist ohnehin ein Büschel.
  const ZEN_QUALITAET = {
    ausduennen: new Map([
      ['zen-sakura-karten', 0.65],
      ['zen-ahorn-karten', 0.65],
      ['zen-bambus-laub', 0.45],
    ]),
  };

  return {
    id: 'zen',
    name: '🪷 Zen-Garten',
    background: new THREE.Color(0xe9d3ae),
    fog: new THREE.Fog(0xecd9bb, 20, 46),
    group,

    // **Warum die Karte erst hier entsteht und nicht beim Bauen.** Der
    // PMREM-Generator braucht einen lebenden Renderer und rechnet auf der GPU;
    // alle Umgebungen werden aber beim Modulstart gebaut (main.js:98). Wäre der
    // Aufbau dort, zahlte ihn jeder Nutzer beim Laden, auch wer den Zen-Garten
    // nie aufruft. `main.js:116` ruft diesen Haken beim ersten Sichtbarwerden.
    ensureEnvironment(renderer) {
      if (!zenSky && renderer) {
        zenSky = buildSkyEnvironment(renderer, ZEN_HIMMEL);
        // Nur das Wasser bekommt die Karte, nicht die ganze Szene.
        //
        // `scene.environment` gälte für **jedes** Standardmaterial hier, und
        // three kompiliert den Envmap-Pfad dann in jeden Shader – auch in den
        // des 40-m-Sandes, der bei Rauheit 0,95 nichts davon hat. Gemessen war
        // die IBL im Dojo mit knapp 25 % der teuerste Posten der Frame-Zeit.
        // Der Teich ist die eine Fläche, die ohne Spiegelung nicht funktioniert.
        pondMat.envMap = zenSky;
        pondMat.needsUpdate = true;
      }
      return this.environment;
    },

    // Qualitätsstufen. Die Blattkarten sind hier das teuerste Neue: zwei
    // Dreiecke **und** ein Alpha-Test je Blatt, und der Alpha-Test verbietet
    // das frühe Verwerfen von Fragmenten. Ausgedünnt wird deshalb nur das Laub;
    // Sand, Steine und Wasser bleiben in jeder Stufe vollständig, weil sie den
    // Garten ausmachen und keine Überzeichnung erzeugen.
    setQuality(stufe) {
      applyQuality(group, null, stufe, ZEN_QUALITAET);
      return null;
    },

    update(time) {
      // Die beiden Kräuselungslagen wandern gegeneinander; updateWater() kennt
      // Richtung und Tempo, hier steht nur noch die Zeit.
      updateWater(pondMat, time);
      // **Ohne diesen Aufruf steht der Wind still.** `foliageMaterial()` legt
      // die Zeit in einem gemeinsamen Uniform-Satz ab; `updateFoliage()` ist
      // das Einzige, was ihn hochzählt. Im Dojo tut das exterior.js – wer die
      // Karten anderswo benutzt, muss es selbst tun, sonst hängen Blüten und
      // Blätter reglos in der Luft und sehen aus wie aufgeklebt.
      updateFoliage(time);
      bamboo.update(time);
      for (const koi of kois) {
        const d = koi.userData;
        const a = time * d.speed + d.phase;
        const bob = Math.sin(time * 2 + d.phase) * 0.01;
        koi.position.set(
          pondCenter.x + Math.cos(a) * d.radius * 1.15,
          bob,
          pondCenter.z + Math.sin(a) * d.radius
        );

        // Blickrichtung = Tangente der Bahn, nicht der Winkel auf ihr.
        //
        // Vorher stand hier ein fester Versatz von ±90°, und genau die 90° war
        // der Fehler: Die Fische zogen breitseits durch den Teich, Kopf zur
        // Beckenmitte. Die Bahn ist außerdem eine Ellipse (x ist um 1,15
        // gestreckt) – ihre Tangente lässt sich deshalb nicht als „Winkel plus
        // Konstante" ausdrücken, sie wird abgeleitet. Der Richtungssinn steckt
        // im Vorzeichen von speed: Ein Fisch zieht seine Runden im, der andere
        // gegen den Uhrzeigersinn.
        const dir = Math.sign(d.speed) || 1;
        const dx = -Math.sin(a) * d.radius * 1.15 * dir;
        const dz = Math.cos(a) * d.radius * dir;
        koi.rotation.y = Math.atan2(dx, dz); // Kopf zeigt nach +Z

        // Beim Auf- und Abtauchen die Nase mitnehmen – ein Fisch, der
        // waagerecht schwebend nach oben rutscht, wirkt wie an einem Faden
        // gezogen. Die Reihenfolge YXZ macht das zu Gieren-dann-Nicken statt zu
        // einer Mischung aus beidem.
        koi.rotation.x = -Math.cos(time * 2 + d.phase) * 0.09;
        // Leichte Schräglage in die Kurve, wie beim Abdrücken gegen das Wasser
        koi.rotation.z = -dir * 0.12;

        d.tail.rotation.y = Math.sin(time * 8 + d.phase) * 0.5; // Schwanzwedeln
      }
      // Wasser-Ringe: wachsen von klein → groß und blenden aus
      for (const ring of ripples) {
        const t = ((time + ring.userData.phase) % ring.userData.period) / ring.userData.period;
        const koi = kois[Math.floor(ring.userData.phase) % kois.length];
        if (t < 0.02) {
          ring.position.x = koi.position.x;
          ring.position.z = koi.position.z;
        }
        const s = 0.08 + t * 0.5;
        ring.scale.setScalar(s);
        ring.material.opacity = 0.35 * (1 - t);
      }
      // Staub sanft driften lassen
      const dp = dustGeo.attributes.position;
      for (let i = 0; i < DUST; i++) {
        const m = dustMeta[i];
        dp.setXYZ(
          i,
          m.x + Math.sin(time * 0.3 + m.ph) * 0.6,
          m.y + Math.sin(time * m.sp + m.ph) * 0.3,
          m.z + Math.cos(time * 0.25 + m.ph) * 0.6
        );
      }
      dp.needsUpdate = true;
      // Bodennebel driftet
      for (const s of mistSprites) {
        s.position.x = s.userData.x + Math.sin(time * 0.08 + s.userData.ph) * 3 * s.userData.drift * 6;
        s.material.opacity = 0.4 + Math.sin(time * 0.4 + s.userData.ph) * 0.12;
      }
      const H = 9;
      const p = petalGeo.attributes.position;
      for (let i = 0; i < PET; i++) {
        const m = petalMeta[i];
        const y = ((m.y0 - time * m.speed) % H + H) % H;
        p.setXYZ(
          i,
          m.x + Math.sin(time * 0.6 + m.sway) * m.swayAmp,
          y,
          m.z + Math.cos(time * 0.5 + m.sway) * m.swayAmp
        );
      }
      p.needsUpdate = true;
    },
  };
}

// --- Einrichtung des Konstrukts: zwei rote Ledersessel, Beistelltisch, Röhren-TV ---
//
// Nachgebaut nach der „This is the construct"-Szene: zwei rote Chesterfield-
// Sessel, leicht zueinander gedreht, dazwischen ein kleiner Tisch mit einem
// alten Fernseher. Alles prozedural – keine externen Modelle oder Texturen,
// damit die App weiterhin offline vollständig lädt.
//
// Der Realismus kommt hier nicht aus Polygonzahl, sondern aus vier Dingen:
// abgerundeten Kanten (Polster haben keine scharfen Ecken), einer Ledernarbung
// als Normal-Map, ungleichmäßigem Glanz und weichen Kontaktschatten. Im weißen
// Void fällt sonst sofort auf, dass Objekte „schweben".

// Abgerundeter Quader. Three bringt keinen mit; extrudiert wird eine
// abgerundete 2D-Form, die Fase rundet zusätzlich die Extrusionskanten ab.
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
    bevelSegments: 3,
    curveSegments: 6,
    steps: 1,
  });
  // ExtrudeGeometry reicht von z = -bevelThickness bis z = depth + bevelThickness,
  // ihre Mitte liegt also bei depth/2 - b und nicht bei depth/2. Wer das
  // übersieht, verschiebt jedes Teil um genau die Fasenbreite nach hinten – bei
  // den Polstern hier bis zu sieben Zentimeter, genug, dass Knöpfe und Rosetten
  // sichtbar vor dem Möbel in der Luft hängen.
  geometry.translate(0, 0, b - depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

// Ledernarbung als Normal-Map: unregelmäßige Zellen (Poren) plus feines
// Rauschen, per Sobel in Normalen umgerechnet. Ohne diese Struktur sieht rotes
// MeshStandardMaterial wie lackiertes Plastik aus.
// 128er-Kachel mit 60 Zellen: Die Suche nach den zwei nächsten Zellzentren
// läuft pro Pixel über alle Zellen, das wächst also mit Fläche × Zellzahl.
// Mit 256 px und 190 Zellen kostete allein diese Textur eine halbe Sekunde
// beim Start – bei 14-facher Kachelung ist die Narbung ohnehin so fein, dass
// die kleinere Kachel nicht zu unterscheiden ist.
let _leatherMaps = null;
function leatherMaps(size = 128) {
  if (_leatherMaps) return _leatherMaps;
  const rand = mulberry32(20221231);

  // Zellzentren für ein Voronoi-artiges Narbenmuster
  const cells = [];
  for (let i = 0; i < 60; i++) cells.push([rand() * size, rand() * size]);

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Abstand zu den zwei nächsten Zellen → Kanten zwischen den Poren
      let d1 = 1e9;
      let d2 = 1e9;
      for (const [cx, cy] of cells) {
        // gekachelt messen, damit die Textur nahtlos bleibt
        const dx = Math.min(Math.abs(x - cx), size - Math.abs(x - cx));
        const dy = Math.min(Math.abs(y - cy), size - Math.abs(y - cy));
        const d = dx * dx + dy * dy;
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
      const edge = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 5);
      const grain = hashNoise(x * 0.7, y * 0.7, 3.1) * 0.16;
      height[y * size + x] = edge * 0.84 + grain;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const rough = document.createElement('canvas');
  rough.width = rough.height = size;
  const roughData = rough.getContext('2d').createImageData(size, size);

  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const strength = 2.4;
      const nx = -dx * strength;
      const ny = -dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      image.data[i + 3] = 255;
      // Vertiefungen glänzen weniger als die erhabenen Narben. Der Grundwert
      // liegt hoch: Leder ist matt, ein glänzender Sessel liest sich als Lack.
      const r = 235 - at(x, y) * 55;
      roughData.data[i] = roughData.data[i + 1] = roughData.data[i + 2] = r;
      roughData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  rough.getContext('2d').putImageData(roughData, 0, 0);

  const normalMap = new THREE.CanvasTexture(canvas);
  const roughnessMap = new THREE.CanvasTexture(rough);
  for (const map of [normalMap, roughnessMap]) {
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    // Dicht kacheln: Bei wenigen Wiederholungen werden die Poren handtellergroß
    // und der Sessel sieht aus wie mit Reptilienhaut bezogen.
    map.repeat.set(14, 14);
    map.anisotropy = 4;
  }
  _leatherMaps = { normalMap, roughnessMap };
  return _leatherMaps;
}

// Holzmaserung für Beistelltisch und TV-Gehäuse
function makeWoodTexture(base, dark) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const y = (i / 70) * size + hashNoise(i, 1, 2) * 4;
    ctx.globalAlpha = 0.12 + hashNoise(i, 5, 9) * 0.3;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const wobble = Math.sin(x * 0.035 + i * 0.9) * 3 + hashNoise(x, i, 7) * 2;
      if (x === 0) ctx.moveTo(x, y + wobble);
      else ctx.lineTo(x, y + wobble);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Ein roter Chesterfield-Sessel: gepolsterter Korpus, gerollte Armlehnen,
// geknöpfte Rückenlehne, dunkle Füße. Der Sessel schaut nach +Z.
// Ohrensessel („Wingback Chesterfield") – die Sessel aus der Filmszene. Hohe,
// oben geschwungene Rückenlehne mit seitlichen Flügeln, dichte Rautenheftung,
// gerollte Armlehnen mit geschnitzter Holzrosette an der Stirn und gedrechselte
// Vorderbeine. Der Sessel schaut nach +Z.
function makeConstructArmchair() {
  const group = new THREE.Group();
  group.name = 'construct-armchair';
  const { normalMap, roughnessMap } = leatherMaps();

  // Gealtertes Oxblood, kein Signalrot: Das Leder im Film ist dunkel, matt und
  // sichtbar abgenutzt.
  const leather = new THREE.MeshStandardMaterial({
    color: 0x6f1c22,
    roughness: 0.72,
    metalness: 0.02,
    normalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap,
  });
  const leatherDark = leather.clone();
  leatherDark.color = new THREE.Color(0x4c1216);
  const wood = new THREE.MeshStandardMaterial({ color: 0x2b1a11, roughness: 0.42, metalness: 0.12 });

  const W = 0.88;        // Gesamtbreite
  const D = 0.84;        // Gesamttiefe
  const CHEEK = 0.17;    // Breite der Armlehnenwangen
  const BACK_T = 0.19;   // Tiefe der Rückenlehne
  const ARM_TOP = 0.63;
  const BACK_TOP = 1.16; // Ohrensessel: die Lehne reicht über den Kopf
  const BODY_TOP = 0.38;

  const frontZ0 = -D / 2 + BACK_T;
  const frontDepth = D / 2 - frontZ0;
  const frontZ = frontZ0 + frontDepth / 2;
  const cheekX = W / 2 - CHEEK / 2;
  const backZ = -D / 2 + BACK_T / 2;

  // Unterbau
  const base = new THREE.Mesh(roundedBox(W, 0.28, D, 0.05), leatherDark);
  base.position.set(0, 0.24, 0);
  group.add(base);

  // Rückenlehne, hoch und oben kräftig gerundet
  const backH = BACK_TOP - 0.34;
  const back = new THREE.Mesh(roundedBox(W, backH, BACK_T, 0.16), leather);
  back.position.set(0, 0.34 + backH / 2, backZ);
  back.rotation.x = 0.07;
  group.add(back);

  // Die „Ohren": Flügel, die oben seitlich aus der Lehne nach vorn stehen.
  // Ohne sie ist es kein Ohrensessel, sondern ein Clubsessel mit hoher Lehne.
  const WING_H = 0.52;
  const WING_D = 0.3;
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(roundedBox(0.13, WING_H, WING_D, 0.06), leather);
    wing.position.set(side * (W / 2 - 0.065), BACK_TOP - WING_H / 2 - 0.04, backZ + BACK_T / 2 + WING_D / 2 - 0.04);
    wing.rotation.y = -side * 0.2; // leicht nach innen gestellt
    group.add(wing);
  }

  for (const side of [-1, 1]) {
    // Wange
    const cheekH = ARM_TOP - CHEEK / 2 - 0.32;
    const cheek = new THREE.Mesh(roundedBox(CHEEK, cheekH, frontDepth, 0.05), leather);
    cheek.position.set(side * cheekX, 0.32 + cheekH / 2, frontZ);
    group.add(cheek);

    // Gerollte Armauflage
    const arm = new THREE.Mesh(roundedBox(CHEEK, CHEEK, frontDepth, CHEEK / 2, 0.06), leather);
    arm.position.set(side * cheekX, ARM_TOP - CHEEK / 2, frontZ);
    group.add(arm);

    // Geschnitzte Rosette an der Stirnseite – im Film ein dunkles Holzelement,
    // das die eingerollte Armlehne abschließt.
    const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 20), wood);
    rosette.rotateX(Math.PI / 2);
    rosette.position.set(side * cheekX, ARM_TOP - CHEEK / 2, D / 2 + 0.001);
    group.add(rosette);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), wood);
    boss.position.set(side * cheekX, ARM_TOP - CHEEK / 2, D / 2 + 0.012);
    group.add(boss);
  }

  // Sitzkissen
  const seatW = W - CHEEK * 2 + 0.02;
  const seat = new THREE.Mesh(roundedBox(seatW, 0.15, frontDepth - 0.05, 0.05), leather);
  seat.position.set(0, 0.38, frontZ + 0.015);
  group.add(seat);

  // Dichte Rautenknopfheftung über die ganze Lehne. Die erste Fassung hatte drei
  // Reihen à zwei bis drei Knöpfen – auf einer Lehne dieser Höhe wirkt das leer.
  const buttonGeo = new THREE.SphereGeometry(0.014, 10, 8);
  buttonGeo.scale(1, 1, 0.45);
  const buttons = [];
  const ROWS = 6;
  for (let row = 0; row < ROWS; row++) {
    const wide = row % 2 === 0;
    const count = wide ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const g = buttonGeo.clone();
      g.translate((i - (count - 1) / 2) * 0.165, 0.46 + row * 0.115, frontZ0 + 0.002);
      buttons.push(g);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(buttons), leatherDark));

  // Gedrechselte Vorderbeine (Lathe-Profil), hinten schlichte Stollen
  const profile = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.036, 0),
    new THREE.Vector2(0.033, 0.02),
    new THREE.Vector2(0.02, 0.045),
    new THREE.Vector2(0.031, 0.07),
    new THREE.Vector2(0.026, 0.1),
    new THREE.Vector2(0.033, 0.13),
    new THREE.Vector2(0.036, 0.16),
    new THREE.Vector2(0.0, 0.16),
  ];
  const turnedLeg = new THREE.LatheGeometry(profile, 14);
  const plainLeg = new THREE.CylinderGeometry(0.028, 0.024, 0.14, 10);
  for (const sx of [-1, 1]) {
    const front = new THREE.Mesh(turnedLeg, wood);
    front.position.set(sx * (W / 2 - 0.09), 0, D / 2 - 0.09);
    group.add(front);
    const rear = new THREE.Mesh(plainLeg, wood);
    rear.position.set(sx * (W / 2 - 0.09), 0.07, -D / 2 + 0.09);
    group.add(rear);
  }

  group.add(makeBlobShadow(0.6, 0.85, 0.006));
  return group;
}

// Die Konsole aus der Szene: ein AWA-„Radiola"-Fernseher im Art-déco-Gehäuse,
// der frei auf dem Boden steht. Die Schauseite trägt ein auf der Spitze
// stehendes Dreieck mit „DEEP IMAGE" und den Schriftzug „RADIOLA TELEVISION" –
// gemalt als Canvas-Textur, denn Schrift und Emblem als Geometrie nachzubauen
// kostet tausende Dreiecke für ein Detail, das ohnehin flach ist.
function makeRadiolaConsole() {
  const group = new THREE.Group();
  group.name = 'radiola-console';

  const W = 0.7;
  const H = 0.74;
  const D = 0.56;

  // Gealtertes Messing/Olivbronze mit Patina
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0x6a6851,
    roughness: 0.62,
    metalness: 0.45,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2a22, roughness: 0.5, metalness: 0.3 });
  // Der Rahmen um die Röhre bleibt bewusst stumpf: Mit Metallglanz spiegelt er
  // das Licht und wirkt wie eine überstrahlte Scheibe vor dem Bild.
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1a1916, roughness: 0.85, metalness: 0.02 });

  const body = new THREE.Mesh(roundedBox(W, H, D, 0.025), shellMat);
  body.position.set(0, H / 2, 0);
  group.add(body);

  // Deckel: nur eine angedeutete Kante, kein aufgesetzter Kasten. Als eigener
  // Block mit deutlichem Rücksprung sah er aus, als läge etwas obendrauf.
  const shoulder = new THREE.Mesh(roundedBox(W - 0.02, 0.05, D - 0.02, 0.02), shellMat);
  shoulder.position.set(0, H + 0.018, 0);
  group.add(shoulder);

  // Lamellenband unter der Schulter
  const slats = [];
  for (let i = 0; i < 23; i++) {
    const slat = new THREE.BoxGeometry(0.012, 0.05, 0.008);
    slat.translate(-0.25 + i * 0.0227, 0, 0);
    slats.push(slat);
  }
  const slatMesh = new THREE.Mesh(mergeGeometries(slats), darkMat);
  slatMesh.position.set(0, H - 0.07, D / 2 + 0.002);
  group.add(slatMesh);

  // --- Schauseite als gemalte Tafel ---
  const plate = document.createElement('canvas');
  plate.width = 512;
  plate.height = 560;
  const p = plate.getContext('2d');
  const PW = plate.width;
  const PH = plate.height;

  p.fillStyle = '#585640';
  p.fillRect(0, 0, PW, PH);
  // Patina: fleckige Aufhellungen und dunkle Schlieren
  for (let i = 0; i < 240; i++) {
    const x = hashNoise(i, 3, 1) * PW;
    const y = hashNoise(i, 9, 4) * PH;
    const r = 12 + hashNoise(i, 5, 7) * 60;
    const g = p.createRadialGradient(x, y, 0, x, y, r);
    const light = hashNoise(i, 2, 8) > 0.5;
    g.addColorStop(0, light ? 'rgba(160,158,128,0.16)' : 'rgba(38,36,26,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = g;
    p.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const ink = '#241f16';
  const light = '#c9c6a6';

  // AWA-Emblem oben
  p.strokeStyle = ink;
  p.lineWidth = 4;
  p.strokeRect(PW / 2 - 62, 44, 124, 46);
  p.fillStyle = ink;
  p.font = '700 34px "Space Grotesk", system-ui, sans-serif';
  p.textAlign = 'center';
  p.textBaseline = 'middle';
  p.fillText('AWA', PW / 2, 68);

  // Auf der Spitze stehendes Dreieck
  const cx = PW / 2;
  const top = 130;
  const half = 178;
  const bottom = 430;
  p.beginPath();
  p.moveTo(cx - half, top);
  p.lineTo(cx + half, top);
  p.lineTo(cx, bottom);
  p.closePath();
  p.lineWidth = 6;
  p.strokeStyle = ink;
  p.stroke();
  p.strokeStyle = light;
  p.lineWidth = 2;
  p.beginPath();
  p.moveTo(cx - half + 14, top + 12);
  p.lineTo(cx + half - 14, top + 12);
  p.lineTo(cx, bottom - 26);
  p.closePath();
  p.stroke();

  // „DEEP IMAGE" gesperrt in der oberen Dreieckshälfte
  p.fillStyle = ink;
  p.font = '600 30px "Space Grotesk", system-ui, sans-serif';
  p.save();
  p.translate(cx, top + 52);
  p.letterSpacing = '14px';
  p.fillText('DEEP', -104, 0);
  p.fillText('IMAGE', 104, 0);
  p.restore();

  // Rundes Emblem in der Dreiecksmitte
  const ex = cx;
  const ey = top + 155;
  const ring = p.createRadialGradient(ex, ey, 4, ex, ey, 46);
  ring.addColorStop(0, '#3a362a');
  ring.addColorStop(0.55, '#7d7a5e');
  ring.addColorStop(1, '#2e2b20');
  p.fillStyle = ring;
  p.beginPath();
  p.arc(ex, ey, 46, 0, Math.PI * 2);
  p.fill();
  p.strokeStyle = ink;
  p.lineWidth = 4;
  p.stroke();
  p.beginPath();
  p.arc(ex, ey, 17, 0, Math.PI * 2);
  p.fillStyle = '#1d1a13';
  p.fill();

  // „RADIOLA TELEVISION" unten
  p.fillStyle = ink;
  p.font = '600 27px "Space Grotesk", system-ui, sans-serif';
  p.save();
  p.letterSpacing = '9px';
  p.fillText('RADIOLA TELEVISION', cx, 470);
  p.restore();

  // Angedeutete Typenschild-Zeilen
  p.fillStyle = 'rgba(36,31,22,0.55)';
  for (let i = 0; i < 3; i++) {
    const w = 250 - i * 40;
    p.fillRect(cx - w / 2, 502 + i * 13, w, 4);
  }

  const plateTex = new THREE.CanvasTexture(plate);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  plateTex.anisotropy = 4;
  const plateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.07, H - 0.08),
    new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.62, metalness: 0.35 })
  );
  plateMesh.position.set(0, H / 2 - 0.005, D / 2 + 0.004);
  group.add(plateMesh);

  // --- Rückseite: die Bildröhre ---
  const SCREEN_W = 0.44;
  const SCREEN_H = 0.34;
  const screenGeo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H, 14, 12);
  {
    const pos = screenGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / (SCREEN_W / 2);
      const v = pos.getY(i) / (SCREEN_H / 2);
      pos.setZ(i, (1 - u * u) * (1 - v * v) * 0.018);
    }
    screenGeo.computeVertexNormals();
  }

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 224;
  screenCanvas.height = 168;
  const screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    screenGeo,
    new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false })
  );
  screen.position.set(0, H / 2 + 0.06, -D / 2 - 0.015);
  screen.rotation.y = Math.PI;
  group.add(screen);

  const bezel = new THREE.Mesh(roundedBox(SCREEN_W + 0.05, SCREEN_H + 0.05, 0.014, 0.03), bezelMat);
  bezel.position.set(0, H / 2 + 0.06, -D / 2 - 0.006);
  group.add(bezel);

  // Zwei Bedienknöpfe unter der Röhre
  const knobGeo = new THREE.CylinderGeometry(0.026, 0.03, 0.026, 16);
  knobGeo.rotateX(Math.PI / 2);
  for (const side of [-1, 1]) {
    const knob = new THREE.Mesh(knobGeo, darkMat);
    knob.position.set(side * 0.13, H / 2 - 0.24, -D / 2 - 0.012);
    group.add(knob);
  }

  // --- Bildinhalt ---
  //
  // Kein reines Schnee-Rauschen: Das liest sich als „kein Signal". Stattdessen
  // ein weiches, driftendes Graustufenbild mit Scanlines, Flimmern und einem
  // langsam durchlaufenden Bildstrich – der typische Eindruck einer alten
  // Übertragung. Neu gezeichnet wird bewusst nur ~12×/s: Der Canvas-Upload pro
  // Frame wäre auf der Quest teurer als das ganze Möbelstück.
  // willReadFrequently: Das Bildrauschen liest den Canvas per getImageData
  // zurück; ohne das Flag warnt Chromium bei jedem Bild.
  const ctx = screenCanvas.getContext('2d', { willReadFrequently: true });
  const { width: sw, height: sh } = screenCanvas;
  let lastDraw = -1;

  const drawScreen = (time) => {
    ctx.fillStyle = '#1c211e';
    ctx.fillRect(0, 0, sw, sh);

    // Gleichmäßige Grundhelligkeit über die ganze Röhre. Ohne sie leuchten nur
    // die Schwaden in der Mitte, und der Bildschirm wirkt wie ein heller Fleck
    // in einem schwarzen Loch statt wie eine ausgeleuchtete Bildfläche.
    const glow = ctx.createLinearGradient(0, 0, 0, sh);
    glow.addColorStop(0, 'rgba(148,154,148,0.34)');
    glow.addColorStop(0.5, 'rgba(122,128,122,0.3)');
    glow.addColorStop(1, 'rgba(92,98,92,0.32)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, sw, sh);

    for (let i = 0; i < 5; i++) {
      const t = time * (0.06 + i * 0.017) + i * 2.1;
      const x = sw * (0.5 + Math.sin(t) * 0.34);
      const y = sh * (0.5 + Math.cos(t * 0.8 + i) * 0.3);
      const r = sh * (0.52 + Math.sin(t * 1.7) * 0.12);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const level = 140 + i * 20;
      g.addColorStop(0, `rgba(${level},${level + 6},${level},0.62)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, sw, sh);
    }

    const grain = ctx.getImageData(0, 0, sw, sh);
    for (let i = 0; i < grain.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 42;
      grain.data[i] += n;
      grain.data[i + 1] += n;
      grain.data[i + 2] += n;
    }
    ctx.putImageData(grain, 0, 0);

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < sh; y += 3) ctx.fillRect(0, y, sw, 1);

    const bar = ((time * 42) % (sh + 60)) - 30;
    const barGrad = ctx.createLinearGradient(0, bar - 14, 0, bar + 14);
    barGrad.addColorStop(0, 'rgba(255,255,255,0)');
    barGrad.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    barGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, bar - 14, sw, 28);

    const vign = ctx.createRadialGradient(sw / 2, sh / 2, sh * 0.45, sw / 2, sh / 2, sh * 1.05);
    vign.addColorStop(0, 'rgba(0,0,0,0)');
    vign.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vign;
    ctx.fillRect(0, 0, sw, sh);

    screenTexture.needsUpdate = true;
  };
  drawScreen(0);

  const screenLight = new THREE.PointLight(0xdfe8e4, 0.5, 2.2, 2);
  screenLight.position.set(0, H / 2 + 0.06, -D / 2 - 0.25);
  group.add(screenLight);

  return {
    group,
    // Wie weit die Bildröhre vor der Gehäusemitte sitzt (in -Z). Die Sitzgruppe
    // richtet die Sessel danach aus – auf die Gehäusemitte gezielt schaut man
    // rund acht Grad am Bild vorbei.
    screenOffset: D / 2 + 0.015,
    update(time) {
      if (time - lastDraw < 0.08) return;
      lastDraw = time;
      drawScreen(time);
      screenLight.intensity = 0.42 + Math.sin(time * 7.3) * 0.06 + Math.random() * 0.05;
    },
  };
}

// Niedriger Ständer, auf dem die Konsole steht – im Standbild sind darunter
// vier dünne, nach außen gestellte Beine im Stil der Zeit zu sehen.
function makeConsoleStand(width, depth, height) {
  const group = new THREE.Group();
  group.name = 'console-stand';
  const wood = new THREE.MeshStandardMaterial({ color: 0x241610, roughness: 0.45, metalness: 0.15 });

  const top = new THREE.Mesh(roundedBox(width, 0.035, depth, 0.01), wood);
  top.position.set(0, height - 0.0175, 0);
  group.add(top);

  const legH = height - 0.035;
  const legGeo = new THREE.CylinderGeometry(0.014, 0.009, legH, 10);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(sx * (width / 2 - 0.05), legH / 2, sz * (depth / 2 - 0.05));
      // Nach außen gestellt: senkrechte Stäbe wirken an einem so niedrigen
      // Möbel wie ein Hocker, die Schrägstellung macht daraus einen Ständer.
      leg.rotation.z = -sx * 0.1;
      leg.rotation.x = sz * 0.1;
      group.add(leg);
    }
  }

  group.add(makeBlobShadow(0.42, 0.8, 0.006));
  return group;
}

// Die Sitzgruppe wie in der Szene – und diesmal als benutzbare Sitzordnung:
//
// Das Gerät steht VOR den Sesseln, nicht auf einer Linie mit ihnen, und die
// Sessel sind so gedreht, dass ihre Blickrichtung wirklich auf den Bildschirm
// zeigt. Der Drehwinkel wird deshalb nicht geschätzt, sondern aus den
// Positionen gerechnet: Wer darin sitzt, schaut fern.
//
// Damit zeigt die Bildröhre zu den Sesseln und das Emblem zum Betrachter –
// genau die Ansicht des Standbilds. Beides gleichzeitig geht nicht: Bildschirm
// und Schautafel liegen auf gegenüberliegenden Seiten des Gehäuses. Wer das
// laufende Bild sehen will, geht um die Gruppe herum; von vorn verrät es sich
// über den Lichtschein, den die Röhre auf die Sessel wirft.
function makeConstructLounge() {
  const group = new THREE.Group();
  group.name = 'construct-lounge';

  const CHAIR_X = 1.06;  // seitlicher Abstand der Sessel zur Mitte
  const CHAIR_Z = -0.88; // Sessel stehen hinten …
  const TV_Z = 0.78;     // … das Gerät davor
  const STAND_H = 0.3;

  const console3d = makeRadiolaConsole();

  // Blickrichtung eines Sessels ist +Z. Der Winkel ergibt sich aus dem Versatz
  // zur BILDRÖHRE, nicht zur Gehäusemitte – so bleibt die Ausrichtung korrekt,
  // wenn sich Abstände oder Gehäusetiefe ändern.
  const screenZ = TV_Z - console3d.screenOffset;
  const facing = Math.atan2(CHAIR_X, screenZ - CHAIR_Z);

  const left = makeConstructArmchair();
  left.position.set(-CHAIR_X, 0, CHAIR_Z);
  left.rotation.y = facing;
  group.add(left);

  const right = makeConstructArmchair();
  right.position.set(CHAIR_X, 0, CHAIR_Z);
  right.rotation.y = -facing;
  group.add(right);

  const stand = makeConsoleStand(0.66, 0.52, STAND_H);
  stand.position.set(0, 0, TV_Z);
  group.add(stand);

  console3d.group.position.set(0, STAND_H, TV_Z);
  // Ohne Drehung: Schautafel nach +Z (zum Betrachter), Bildröhre nach -Z (zu
  // den Sesseln).
  group.add(console3d.group);

  // Gemeinsamer, größerer Schatten unter der ganzen Gruppe – bindet die Möbel
  // zusammen, statt drei einzelne Flecken stehen zu lassen.
  const shade = makeBlobShadow(1.8, 0.24, 0.004);
  // Mittig unter der Gruppe – wandert mit, wenn die Sessel weiter nach hinten
  // rücken, sonst steht die Sitzgruppe halb neben ihrem eigenen Schatten.
  shade.position.z = (CHAIR_Z + TV_Z) / 2;
  group.add(shade);

  return { group, update: (time) => console3d.update(time) };
}

// ⬜ Konstrukt – der komplett weiße „Matrix"-Void: eine unendlich wirkende, nahtlose
// weiße Leere ohne sichtbaren Horizont. Kuppel und Boden teilen sich denselben Weißton,
// sodass keine Kante entsteht; ein hauchzarter, kühler Verlauf am Grund verhindert das
// desorientierende „Whiteout" und lässt die Karten räumlich verankert wirken.
function createMatrixEnvironment() {
  const group = new THREE.Group();
  group.name = 'env-matrix';

  // Umgebende Kuppel: reines Weiß oben, minimal kühleres Weiß am unteren Rand.
  group.add(makeDome(0xffffff, 0xeef1f4, 60));

  // Nahtloser Boden im selben Weißton wie der Kuppelgrund → unsichtbarer Horizont.
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshBasicMaterial({ color: 0xf3f5f8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  group.add(floor);

  // Sehr zarter Kontaktschatten unter dem Nutzer, damit „unten" spürbar bleibt,
  // ohne den weißen Gesamteindruck zu brechen.
  const contact = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshBasicMaterial({
      map: makeGlowTexture('rgba(120,130,145,0.18)', 'rgba(120,130,145,0.06)'),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -0.018;
  group.add(contact);

  // Gleichmäßiges, nahezu schattenfreies Licht: Karten sind überall gut lesbar.
  group.add(new THREE.HemisphereLight(0xffffff, 0xf0f2f5, 1.5));
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(2, 12, 6);
  group.add(fill);

  // Zusätzliches Licht schräg von vorn: Ohne eine klare Richtung bleiben die
  // Polster im rundum gleichen Licht flach und wirken wie eingefärbte Klötze.
  // Auf die Karten wirkt es kaum – deren Material ist von der Beleuchtung
  // ausgenommen (MeshBasicMaterial).
  const key = new THREE.DirectionalLight(0xfff6ec, 0.7);
  key.position.set(-3.5, 5, 5);
  group.add(key);
  const rim = new THREE.DirectionalLight(0xdce6f0, 0.35);
  rim.position.set(4, 2.5, -4.5);
  group.add(rim);

  // Die Sitzgruppe aus dem Film: zwei rote Sessel, Tisch und Röhrenfernseher.
  // Der Abstand ist kein Geschmackswert: Neue Karten landen im Halbkreis mit
  // 1,15 m Radius vor dem Nutzer. Die Sessel müssen dahinter bleiben, sonst
  // stehen sie mitten im Arbeitsbereich – mit ihrer Tiefe von 1,7 m ab Mitte
  // heißt das gut dreieinhalb Meter.
  const lounge = makeConstructLounge();
  lounge.group.position.set(0, 0, -3.9);
  group.add(lounge.group);

  return {
    id: 'matrix',
    name: '⬜ Konstrukt',
    background: new THREE.Color(0xffffff),
    group,
    update(time) {
      lounge.update(time);
    },
  };
}

export function createEnvironments(scene) {
  const environments = [
    createIslandEnvironment(),
    createNightEnvironment(),
    createZenEnvironment(),
    createMatrixEnvironment(),
    // **Angehängt, nicht eingeschoben.** Die Reihenfolge ist der Index, den
    // `cycleEnvironment` durchläuft und den die Testskripte hart verdrahtet
    // haben (Konstrukt = 3). Ein Einschub in der Mitte würde jedes davon still
    // auf die falsche Welt zeigen lassen.
    createDojoEnvironment(),
  ];
  for (const env of environments) {
    env.group.visible = false;
    scene.add(env.group);
  }
  return environments;
}
