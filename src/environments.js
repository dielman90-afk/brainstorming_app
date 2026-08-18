import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDojoEnvironment } from './dojo/index.js';
import { heightToMaps, scaleUV } from './dojo/materials.js';
import { mossMaterial, waterMaterial, updateWater } from './dojo/ground.js';
import {
  graniteMaterial,
  cliffMaterial,
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
function makeDome(topColor, horizonColor, bottomColor = horizonColor, radius = 44, sun = null, clouds = null) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: { ...(sun ? { HAS_SUN: '' } : {}), ...(clouds ? { HAS_CLOUDS: '' } : {}) },
    uniforms: {
      cloudMap: { value: clouds ? clouds.map : null },
      cloudColor: { value: new THREE.Color(clouds ? clouds.color : 0xffffff) },
      cloudLit: { value: new THREE.Color(clouds ? clouds.lit : 0xffffff) },
      cloudStrength: { value: clouds ? (clouds.strength ?? 0.7) : 0 },
      cloudScale: { value: new THREE.Vector2(...(clouds?.scale ?? [3, 2.4])) },
      cloudBand: { value: new THREE.Vector4(...(clouds?.band ?? [0.02, 0.14, 0.34, 0.78])) },
      topColor: { value: new THREE.Color(topColor) },
      horizonColor: { value: new THREE.Color(horizonColor) },
      bottomColor: { value: new THREE.Color(bottomColor) },
      // Sonnenhof: Ohne ihn ist die Sonne eine aufgeklebte Scheibe und der
      // Himmel weiß nichts von ihr. Der Hof bindet beide aneinander und liefert
      // die Grundlage für das Gegenlicht.
      sunDir: { value: sun ? sun.dir.clone().normalize() : new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(sun ? sun.color : 0xffffff) },
      sunTight: { value: sun ? sun.tight : 60 },
      sunBroad: { value: sun ? sun.broad : 3 },
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
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      uniform float sunTight;
      uniform float sunBroad;
      uniform sampler2D cloudMap;
      uniform vec3 cloudColor;
      uniform vec3 cloudLit;
      uniform float cloudStrength;
      uniform vec2 cloudScale;
      uniform vec4 cloudBand;
      varying vec3 vPos;
      void main() {
        vec3 dir = normalize(vPos);
        float h = dir.y;
        vec3 col = h > 0.0
          ? mix(horizonColor, topColor, pow(h, 0.8))
          : mix(horizonColor, bottomColor, pow(-h, 0.8));
        #ifdef HAS_CLOUDS
          // **Schleierwolken, gerechnet in der Kuppel — kein Draw-Call.**
          //
          // Der Himmel war eine lineare Rampe: Neunzehn Proben über 380 Pixel
          // stiegen streng monoton mit gleicher Schrittweite, bei einem
          // Himmelanteil von rund 45 % des Bildes. Eine Rampe ist kein Himmel.
          //
          // Die Kachel läuft ganzzahlig um den Horizont (cloudScale.x ist eine
          // ganze Zahl mal dem Umlauf), sonst stünde an einer Stelle des
          // Himmels eine senkrechte Naht.
          {
            float az = atan(dir.z, dir.x) * 0.15915494;
            vec2 uvW = vec2(az * cloudScale.x, h * cloudScale.y);
            float n =
              texture2D(cloudMap, uvW).r * 0.62 +
              texture2D(cloudMap, uvW * 2.31 + vec2(0.37, 0.11)).r * 0.38;
            // Nur ein Band über dem Horizont: Zenitnah läuft die
            // Azimut-Abbildung in den Pol und würde die Kachel verraten.
            float band = smoothstep(cloudBand.x, cloudBand.y, h) *
                         (1.0 - smoothstep(cloudBand.z, cloudBand.w, h));
            float wolke = smoothstep(0.26, 0.72, n) * band * cloudStrength;
            #ifdef HAS_SUN
              float zurSonne = max(dot(dir, sunDir), 0.0);
            #else
              float zurSonne = 0.0;
            #endif
            col = mix(col, mix(cloudColor, cloudLit, pow(zurSonne, 2.2)), wolke);
          }
        #endif
        #ifdef HAS_SUN
          // Zwei Keulen: ein weiter, schwacher Hof über den halben Himmel und
          // ein enger, heller Kern direkt um die Sonne.
          float d = max(dot(dir, sunDir), 0.0);
          col += sunColor * (0.22 * pow(d, sunBroad) + 0.75 * pow(d, sunTight));
        #endif
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

// --- Fertige Meshes verschmelzen -------------------------------------------
//
// `GeoBucket` schreibt beim Hinzufügen die Scheitelfarben neu. Genau die tragen
// bei den Zen-Steinen aber die Unterschiede – Grundton, Moospatina, gebackenes
// Licht –, und die Objekte sind zum Zeitpunkt des Verschmelzens längst fertig
// gebaut und platziert. Diese Hilfe nimmt sie, wie sie sind: Weltmatrix in die
// Geometrie backen, Attribute angleichen, verschmelzen.
//
// Erst bauen, dann verschmelzen – und nicht umgekehrt – ist Absicht. Wer schon
// beim Bauen in einen Puffer schreibt, muss die Reihenfolge der Zufallszahlen
// mitdenken; `mulberry32` ist gesät, ein verschobener Aufruf verschiebt alles
// danach. So bleibt die Bildkomposition Zeichen für Zeichen dieselbe.
function backeMatrix(mesh) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  g.applyMatrix4(mesh.matrixWorld);
  return g;
}

// `mergeGeometries` verlangt in allen Teilen denselben Attributsatz.
function angleichen(g, brauchtFarbe) {
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (brauchtFarbe && !g.attributes.color) {
    g.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3)
    );
  }
  for (const key of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
  }
  if (!brauchtFarbe && g.attributes.color) g.deleteAttribute('color');
  return g;
}

// Objekte (einzelne Meshes oder ganze Gruppen) zu je **einem** Mesh pro
// vorkommendem Material. Rückgabe ist eine Liste, damit der Aufrufer sie ohne
// Fallunterscheidung mit `group.add(...)` einhängen kann.
function verschmelzeObjekte(objekte, name) {
  if (!objekte.length) return [];
  const halter = new THREE.Group();
  for (const o of objekte) halter.add(o);
  halter.updateMatrixWorld(true);
  const nachMaterial = new Map();
  halter.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (!nachMaterial.has(o.material)) nachMaterial.set(o.material, []);
    nachMaterial.get(o.material).push(o);
  });
  const raus = [];
  for (const [material, liste] of nachMaterial) {
    const geos = liste.map((m) => angleichen(backeMatrix(m), material.vertexColors === true));
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    for (const g of geos) g.dispose();
    mesh.name = raus.length ? `${name}-${raus.length}` : name;
    raus.push(mesh);
  }
  return raus;
}

// Alle Kontaktschatten einer Umgebung in **ein** Mesh.
//
// Sie sind sich bis auf Ort, Größe und Deckkraft gleich – nur legt
// `makeBlobShadow` je Schatten ein eigenes Material an, weil die Deckkraft dort
// steht. Scheitelfarben multiplizieren die Farbe, nicht die Deckkraft; der
// übliche Ausweg wäre eine alphaMap je Schatten und damit wieder ein Material
// je Schatten. three kennt aber einen zweiten Fall: Hat das Farbattribut
// **vier** Komponenten, setzt der Renderer `USE_COLOR_ALPHA`
// (WebGLPrograms, Feld `vertexAlphas`), und die vierte Komponente multipliziert
// die Deckkraft mit. Damit stehen dreizehn Schatten in einem Draw-Call.
let _schattenMaterial = null;
function verschmelzeSchatten(schatten, name = 'kontaktschatten') {
  if (!_schattenMaterial) {
    _schattenMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      vertexColors: true,
    });
  }
  const halter = new THREE.Group();
  for (const s of schatten) halter.add(s);
  halter.updateMatrixWorld(true);
  const geos = schatten.map((s) => {
    const g = angleichen(backeMatrix(s), false);
    const n = g.attributes.position.count;
    const farben = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      farben[i * 4] = 1;
      farben[i * 4 + 1] = 1;
      farben[i * 4 + 2] = 1;
      farben[i * 4 + 3] = s.material.opacity;
    }
    g.setAttribute('color', new THREE.BufferAttribute(farben, 4));
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), _schattenMaterial);
  for (const g of geos) g.dispose();
  mesh.name = name;
  mesh.renderOrder = 1; // knapp über dem opaken Boden, wie die Einzelschatten
  return mesh;
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
  for (const [ax, ay, az, ar, slice] of ansaetze) {
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
        slice: slice ?? 0,
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
      // `slice` verschiebt den Griff in die Palette. Werden die Schöpfe VIELER
      // Bäume in einem InstancedMesh gesammelt, bekäme sonst jeder Baum
      // dieselbe Mischung – die Unterscheidung „heller/dunkler Laubbaum" ginge
      // verloren. Mit dem Versatz zieht jeder Baum aus seinem eigenen Drittel.
      const idx = (c.slice ?? 0) + (c.ton % 3);
      mesh.setColorAt(i, new THREE.Color(palette[idx % palette.length]));
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
    // Der Himmelssaum kommt dazu, weil dieser Körper an vielen Stellen die
    // äußere Kontur gegen den Himmel bildet.
    addSkyRim(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false }), {
      strength: 0.5,
      power: 2.0,
    }),
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
    _inselNadeln = addSkyRim(foliageMaterial({
      atlas: leafAtlas('nadel'),
      // Nadeln sind steif und wachsig: wenig Wind, wenig Transluzenz. Eine
      // Konifere im Gegenlicht leuchtet **nicht** – das ist der halbe
      // Unterschied zu einem Laubbaum.
      translucency: 0.85,
      transColor: 0xc8e89a,
      windStrength: 0.03,
      roughness: 0.7,
      color: 0xbfe3a8,
      // Der Himmelssaum sitzt eng und schwach.
      //
      // Bei `strength 0.55, power 1.9` war er auf einer BLATTKARTE kein Saum
      // mehr: Eine Karte ist eine ebene Fläche mit konstanter Normale, der
      // Fresnel-Term wird darauf zur Flächenhelligkeit. Jede schräg stehende
      // Karte wurde damit fast weiß – gemessen lagen 18,4 % der Kronenpixel
      // über L=190. Das ist zweierlei Schaden: Die Astlage wird unlesbar, und
      // auf der Quest kriecht so ein Salz-und-Pfeffer-Muster bei jeder
      // Kopfbewegung. Derselbe Fehler wie seinerzeit am Fels, dieselbe
      // Korrektur: hoher Exponent, kleiner Betrag.
    }), { strength: 0.26, power: 4.2 });
    _inselKarten = addSkyRim(foliageMaterial({
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
    }), { strength: 0.24, power: 4.2 });
  }
  return { holz: _inselHolz, laub: _inselLaub, karten: _inselKarten, nadeln: _inselNadeln };
}

// Sammelbehälter für die Bäume EINER Insel.
//
// Warum nicht ein Baum = ein Objekt: Ein Baum besteht aus Stamm/Astwerk,
// Hüllkörpern und Blattkarten – als eigenes Objekt gebaut sind das drei
// Draw-Calls je Baum. Neun Bäume auf der Hauptinsel waren damit 27 Draw-Calls
// und die ganze Umgebung lag bei 129 von 120. Gemessen.
//
// Stämme und Äste wandern deshalb in einen Geometrie-Eimer, und die Schöpfe
// aller Bäume werden je Laubart in EIN InstancedMesh-Paar gesammelt. Aus 27
// werden fünf: Holz, Nadel-Hüllkörper, Nadel-Karten, Laub-Hüllkörper,
// Laub-Karten. Die Form der Bäume bleibt dabei unangetastet.
function makeTreeCollector() {
  return {
    holz: new GeoBucket(),
    nadel: [],
    laub: [],
    laubSlices: 0,
  };
}

// Baut die gesammelten Bäume zu wenigen Meshes zusammen.
function buildCollectedTrees(ctx, seed) {
  const { holz: holzMat, karten, nadeln } = inselBaumMaterialien();
  const meshes = [];
  const stamm = ctx.holz.mesh(holzMat, 'island-holz');
  if (stamm) meshes.push(stamm);

  if (ctx.nadel.length) {
    const k = baueKrone({
      ansaetze: ctx.nadel,
      seed: seed ^ 0x5a11,
      kartenMaterial: nadeln,
      kind: 'nadel',
      cardScale: 0.95,
      dichte: 74,
      farben: [0x2b4436, 0x33513e, 0x24392c],
      kartenFarben: [0xd8f0c0, 0xc6e4ae, 0xe4ffd0],
    });
    k.blobs.name = 'island-krone';
    k.karten.name = 'island-laub';
    meshes.push(k.blobs, k.karten);
  }

  if (ctx.laub.length) {
    const k = baueKrone({
      ansaetze: ctx.laub,
      seed: seed ^ 0x2c93,
      kartenMaterial: karten,
      kind: 'azalea',
      cardScale: 0.85,
      dichte: 64,
      // Zwei Drittel: dunkle und helle Laubbäume. Jeder Baum greift über
      // seinen `slice` in genau eines davon.
      farben: [0x3a5f42, 0x436b4a, 0x33553c, 0x35583c, 0x3d6544, 0x2f4f37],
      kartenFarben: [0xdcf5b8, 0xcbeaa4, 0xe6ffc8, 0xd3efb0, 0xc2e39c, 0xe0f8c0],
    });
    k.blobs.name = 'island-krone';
    k.karten.name = 'island-laub';
    meshes.push(k.blobs, k.karten);
  }
  return meshes;
}

// Ein Baum – Form unverändert aus PR #9, aber er baut keine eigenen Meshes
// mehr, sondern schreibt in den Sammelbehälter der Insel.
function addTree(rand, ctx, { x, y, z, scale = 1 }) {
  const yaw = rand() * TAU;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  // Baumlokale Koordinaten in Inselkoordinaten überführen.
  const place = (geo) => {
    geo.scale(scale, scale, scale);
    geo.rotateY(yaw);
    geo.translate(x, y, z);
    return geo;
  };
  const punkt = (px, py, pz) => [
    x + (px * cy + pz * sy) * scale,
    y + py * scale,
    z + (-px * sy + pz * cy) * scale,
  ];

  const trunkHeight = 0.5 + rand() * 0.5;
  ctx.holz.add(
    place(new THREE.CylinderGeometry(0.05, 0.09, trunkHeight, 8).translate(0, trunkHeight / 2, 0)),
    0xffffff
  );

  // Krone nach demselben Rezept wie im Zen-Garten: viele kleine Schöpfe, der
  // Hüllkörper als Verdecker darunter. Der erste Anlauf dieser Runde hatte hier
  // einen glatten Ball von 0,36 m Radius mit ein paar Karten davor – aus zwei
  // Metern ein grüner Luftballon mit Aufklebern.
  const hell = rand() > 0.5;
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
      const p = punkt((rand() - 0.5) * 0.05, ey, (rand() - 0.5) * 0.05);
      ctx.nadel.push([p[0], p[1], p[2], radius * scale, 0]);
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
    for (const t of teile) ctx.holz.add(place(t.geo), 0xffffff);
    // Heller oder dunkler Laubbaum: der Griff in die obere oder untere Hälfte
    // der gemeinsamen Palette.
    const slice = hell ? 3 : 0;
    for (const t of teile) {
      if (t.depth > 0) continue;
      const p = punkt(t.tip.x, t.tip.y, t.tip.z);
      ctx.laub.push([p[0], p[1], p[2], (0.17 + rand() * 0.06) * scale, slice]);
    }
  }
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
// Weltmaßstab der ganzen Insel-Gruppe. Steht auf Modulebene, weil auch das
// Schattenvolumen ihn braucht – und das wird gesetzt, bevor die Gruppe skaliert
// wird. Wer ihn ändert, bricht Fog-Distanzen, Locomotion und Kartenplatzierung.
const WORLD_SCALE = 4;
const ISLAND_FLAT_R = 0.58; // bis hierhin (Anteil des Radius) bleibt es eben

function makeIslandShape(rand, { radius = 5, depth = 5, river = null, detail = 1 } = {}) {
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
  // Bankdicke: je Insel anders – ABER an die Ringzahl der Flanke gekoppelt.
  //
  // Die Schichtbänke sind ein Sägezahn über die Flankenkoordinate; die Flanke
  // wird mit `sideRings * detail` Ringen abgetastet. Auf den Mini-Inseln
  // (detail 0,55, also 20 Ringe) trafen bis zu neun Bänke auf 20 Ringe – knapp
  // zwei Stützstellen je Bank. Der Sägezahn kann bei dieser Abtastung nicht
  // als Sims lesen, er kippt in eine Treppe aus gleich hohen, waagerechten
  // Absätzen um: genau die „gestapelten Regalbretter", die die Mini-Inseln wie
  // eine gedrehte Kiste aussehen ließen. Es war kein Formfehler, sondern
  // Unterabtastung. Vier bis fünf Ringe je Bank sind das Minimum; die
  // Obergrenze fällt mit der Detailstufe, was auch inhaltlich richtig ist –
  // was weiter weg steht, zeigt weniger, aber größere Formen.
  const flankenRinge = Math.max(8, Math.round(36 * detail));
  const rateMax = flankenRinge / 4.5 / 1.34;
  const strataRate = Math.min(4.2 + rand() * 2.6, rateMax);
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
    // Der Lauf endet GENAU auf der Abbruchkante.
    //
    // Vorher hörte er 0,32 Einheiten davor auf, während der Sturz 0,2 dahinter
    // begann – dazwischen lagen gut zwei Meter, auf denen das Wasser einfach
    // nicht da war. Genau das las sich als „hört im Nichts auf".
    const er = radius * outline(river);
    const dx = Math.sin(river);
    const dz = Math.cos(river);
    // Quer zur Laufrichtung, für die Mäander.
    const qx = dz;
    const qz = -dx;
    // Ein Bach mäandert, solange er Zeit hat, und läuft gerade, sobald es
    // steil wird. Die Auslenkung nimmt deshalb zur Kante hin auf null ab –
    // vorher schwang der letzte Abschnitt kurz vor dem Absturz noch einmal
    // seitlich aus, was kein Wasser tut.
    const punkt = (t, quer) =>
      new THREE.Vector3(dx * er * t + qx * quer, 0, dz * er * t + qz * quer);
    riverCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 0, 0.2),
      punkt(0.30, 0.62),
      punkt(0.58, -0.48),
      punkt(0.80, 0.18),
      punkt(1.0, 0),
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
    // Wo der Bach zur Kante läuft, ist KEIN Randwall.
    //
    // Der Wall stieg bisher rundherum, auch auf der Wasserfallseite, und die
    // Rinne schnitt weniger tief ein als er hoch war – das Wasser lief also
    // bergauf und verschwand hinter der eigenen Kante, statt zu stürzen. Ein
    // Abfluss schneidet sich seine Scharte; genau die fehlte.
    const korridor = river != null ? gauss(riverDist(x, z), 1.05) : 0;
    let h = band * (1 - 0.92 * korridor) * (ridge + rough);
    // Abrisskante statt Rundung: Die Grasnarbe endet in ungleichmäßigen Zungen
    // und Kerben, nicht als überall gleich dicker, rundgeschliffener Wulst.
    const tear = valueNoise2(Math.cos(a) * 13 + 5, Math.sin(a) * 13 + 9);
    const tear2 = valueNoise2(Math.cos(a) * 5.7 + 27, Math.sin(a) * 5.7 + 2);
    const fineTear = valueNoise2(Math.cos(a) * 27 + 11, Math.sin(a) * 27 + 33);
    h -= smoothstep(0.88, 1.0, rr) * (0.14 + 0.42 * tear * tear2);
    h -= smoothstep(0.955, 1.0, rr) * 0.16 * fineTear;
    // Die Grasnarbe endet als SCHNITTKANTE, nicht als Rundung.
    //
    // Vorher rollte die Oberfläche über die Kante und krümmte sich dabei nach
    // unten. Das hatte zwei Folgen: Die Narbe hatte keine sichtbare Dicke – sie
    // war eine Haube ohne Materialstärke –, und weil die abwärts gekrümmte
    // Fläche das Licht von unten auffängt, lief um die ganze Insel ein
    // gleichbreites helles Band. Beides ist an einer abgerissenen Landmasse
    // falsch: Dort steht eine Sodenplatte über, und darunter liegt es dunkel.
    //
    // Deshalb bleibt die Oberfläche bis zur Kante fast waagerecht und fällt
    // dann in einem kurzen, steilen Absatz ab. Die Dicke schwankt, damit keine
    // umlaufende Stufe entsteht.
    const sod = 0.055 + 0.075 * tear2;
    h -= smoothstep(0.983, 0.998, rr) * sod;
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
    0.004 +
    0.014 *
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
    riverDist,
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
  //
  // Die letzten drei Ringe liegen FEST bei 98,4 / 99,2 / 100 % – unabhängig von
  // der Detailstufe. Genau dort sitzt der Absatz der Grasnarbe, und mit der
  // reinen Potenzverteilung fiel er auf den Mini-Inseln (halbe Detailstufe) in
  // eine einzige Vierecksreihe: Die Narbe konnte dort gar keine Dicke zeigen,
  // gemessen 6 px Gras auf 70 px Fels. Drei Ringe kosten pro Insel 3 × seg
  // Vierecke – auf einem Dreiecksbudget, das zu weniger als der Hälfte belegt
  // ist, ist das nichts.
  const RAND_RINGE = [0.984, 0.992, 1.0];
  const TOP_RINGE = TR + RAND_RINGE.length;
  for (let j = 0; j <= TOP_RINGE; j++) {
    const frac =
      j <= TR
        ? (1 - Math.pow(1 - j / TR, 1.35)) * RAND_RINGE[0]
        : RAND_RINGE[j - TR - 1];
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
  // UVs für die Oberflächenkarten. Der Inselkörper hatte bisher gar keine – er
  // war deshalb im Nahbereich eine glatte Fläche: In der Bodennahaufnahme lag
  // ein Felsblock über 30 % der Bildfläche auf ±1 Tonwert konstant. Auf einer
  // Quest steht man 1–2 m davor, das ist die eigentliche Prüfdistanz.
  //
  // Boxprojektion statt einer Abwicklung: Die Insel ist eine geschlossene,
  // beliebig gekrümmte Form; jede Abwicklung liefe an der Spitze zusammen und
  // würde die Körnung dort auf ein Vielfaches strecken. Die Projektion gibt
  // jeder Fläche dieselbe Korngröße, Deckel wie Flanke.
  faceBoxUV(geo, 0.28 * WORLD_SCALE);
  for (const [start, count, mat] of groups) geo.addGroup(start, count, mat);
  geo.computeBoundingSphere();

  // Drei Materialien mit eigener Oberflächenlesung. Die Karten stammen aus dem
  // Materialsatz, den PR #9 mitgebracht hat – sie liefern Relief und Rauheit;
  // die Farbe kommt weiter aus den Scheitelfarben.
  //
  // Bei der Grasnarbe fliegt die FARBkarte des Mooses bewusst raus: Sie ist für
  // den dunklen, feuchten Dojo-Garten gezeichnet und ergäbe mit dem Inselgrün
  // multipliziert einen fast schwarzen, fleckigen Rasen. Gebraucht wird hier
  // die Halmstruktur, nicht der Farbton.
  // Die Grasnarbe bekommt KEINE Karte.
  //
  // Der erste Anlauf legte die Mooskarten aus dem Dojo-Satz darauf und kostete
  // dafuer den dreifachen Texturspeicher (9,17 auf 27,83 MB). Nachgemessen
  // aenderte sich am Bild nichts: Bildmittel 144,9 gegen 145,0, p50 identisch.
  // Auf einer mobilen Brille ist das ein schlechter Tausch. Die Variation der
  // Wiese kommt aus den Scheitelfarben - sie haengt an der Geometrie, ist damit
  // im richtigen Massstab und kostet nichts.
  const gras = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, [
    gras,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1.0,
      metalness: 0,
      flatShading: true,
    }),
    // Felswandkarte, NICHT die Granitkarte des Dojo-Gartens: Deren
    // Absplitterungen sind auf einer vierzig Meter hohen Flanke ein sichtbares
    // Raster gleicher Dellen. Begründung ausführlich bei cliffMaps().
    addSkyRim(cliffMaterial({ tone: 0xffffff, vertexColors: true }).clone(), {
      strength: 0.18,
      power: 4.0,
    }),
  ]);
  // cliffMaterial() liefert aus einem Cache; ohne clone() bekäme jede Insel
  // dasselbe Objekt, und der Saum des Felses läge auch auf dem Erdreich.
  mesh.material[2].flatShading = true;
  mesh.name = 'island-body';
  return mesh;
}

// Vertex-Farbe des Inselkörpers. Trägt die Materialtrennung mit: warmes,
// leicht entsättigtes Grün oben, erdiges Braun in der Abbruchkante, kühl
// gebrochener Fels darunter – mit Schichtbändern, Rissverdunklung und
// gebackenem AO nach unten.
const _tmpColor = new THREE.Color();

// --- Wind für Bodenbewuchs --------------------------------------------------
//
// Alle Materialien mit Wind teilen sich EINE Uhr. Sonst müsste die
// Animationsschleife jedes Material einzeln fortschreiben, und ein vergessenes
// bliebe stehen – der sichtbarste Fehler bei Vegetation überhaupt.
//
// Die Bewegung sitzt im Vertex-Shader und kostet damit nichts pro Bild auf der
// CPU. Sie greift nur oben: Der Faktor ist die Höhe über dem Objektursprung,
// ein Halm wird also am Boden gehalten und schwingt an der Spitze. Ohne das
// verrutscht der ganze Büschel und löst sich vom Boden.
const _windClock = { value: 0 };

function addWind(material, { strength = 0.06, speed = 1.4 } = {}) {
  const vorher = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (vorher) vorher.call(material, shader, renderer);
    shader.uniforms.windTime = _windClock;
    shader.uniforms.windStrength = { value: strength };
    shader.uniforms.windSpeed = { value: speed };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float windTime;
         uniform float windStrength;
         uniform float windSpeed;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // Weltposition der Instanz bestimmt die Phase – benachbarte Horste
           // schwingen dadurch leicht versetzt statt im Gleichtakt.
           #ifdef USE_INSTANCING
             vec3 wOrigin = instanceMatrix[3].xyz;
           #else
             vec3 wOrigin = vec3(0.0);
           #endif
           float phase = wOrigin.x * 0.7 + wOrigin.z * 0.5;
           float h = max(transformed.y, 0.0);
           // Zwei Frequenzen: eine tragende Böe und ein schnelleres Zittern.
           float sway =
             sin(windTime * windSpeed + phase) * 0.75 +
             sin(windTime * windSpeed * 2.7 + phase * 1.9) * 0.25;
           transformed.x += sway * windStrength * h;
           transformed.z += sway * windStrength * h * 0.45;
         }`
      );
  };
  const vorherKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () =>
    `${vorherKey ? vorherKey() : ''}|wind-${strength}-${speed}`;
  return material;
}

// --- Himmelssaum (Rim) auf jede Silhouette ---------------------------------
//
// Ein gerichtetes „Rim-Light" von hinten löst das Problem nicht: Es beleuchtet
// die RÜCKSEITE, und die sieht man nicht. Gemessen blieb die Baumkrone im
// Gegenlicht bei (0,13,2) – praktisch schwarz, genau wie vorher.
//
// Was hier wirkt, ist kein zweites Licht, sondern ein Materialeffekt: Wo eine
// Fläche vom Betrachter wegkippt (der Silhouettenrand), bekommt sie den
// Himmelston dazu. Das ist derselbe Fresnel-Gedanke wie beim Streulicht an
// einer Blattkante und kostet keinen Draw-Call, keine Textur und kein Licht –
// nur ein paar Zeilen im vorhandenen Shader.
function addSkyRim(material, { color = 0xbcdcf2, strength = 0.55, power = 2.6 } = {}) {
  const rim = new THREE.Color(color);
  // Vorhandene Shader-Eingriffe bleiben erhalten. Das Blattwerk aus PR #9
  // bringt eigene mit (Wind, Blattdurchsicht); sie einfach zu überschreiben
  // hieße, den halben Baum kaputtzumachen, um seine Kante zu retten.
  const vorher = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (vorher) vorher.call(material, shader, renderer);
    // Der Anker muss noch da sein – ein vorheriger Eingriff könnte ihn ersetzt
    // haben. Ohne diese Prüfung fiele der Saum still aus.
    if (!shader.fragmentShader.includes('#include <dithering_fragment>')) return;
    shader.uniforms.rimColor = { value: rim };
    shader.uniforms.rimStrength = { value: strength };
    shader.uniforms.rimPower = { value: power };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 rimColor;
         uniform float rimStrength;
         uniform float rimPower;`
      )
      .replace(
        '#include <dithering_fragment>',
        `{
           // Blickrichtung gegen die Normale. vViewPosition zeigt vom Fragment
           // zur Kamera; normal ist in Sichtkoordinaten.
           vec3 vDir = normalize(vViewPosition);
           float f = 1.0 - abs(dot(normalize(normal), vDir));
           gl_FragColor.rgb += rimColor * rimStrength * pow(f, rimPower);
         }
         #include <dithering_fragment>`
      );
    material.userData.shader = shader;
  };
  // Ohne eigenen Schlüssel hält three Varianten desselben Materials für
  // austauschbar und liefert das falsche Programm aus. Ein bereits gesetzter
  // Schlüssel wird ergänzt, nicht ersetzt.
  const vorherKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () =>
    `${vorherKey ? vorherKey() : ''}|skyrim-${strength}-${power}-${rim.getHex()}`;
  return material;
}

function bodyColor(out, zone, shape, p, t, a) {
  const [x, y, z] = p;
  const mott = valueNoise2(x * 1.7 + 40, z * 1.7 + 12);
  if (zone === ZONE_GRASS) {
    const R = shape.radius * shape.outline(a);
    const rr = Math.min(1, Math.hypot(x, z) / R);
    const high = smoothstep(0.05, 0.55, y - ISLAND_TOP_Y); // Wallrücken heller

    // --- Feuchte bestimmt die Farbe, nicht Zufall -------------------------
    //
    // Gemessen war die Wiese über rund 40 % der Bildfläche EINE Farbe: zehn
    // weit verteilte Punkte lagen zwischen 181,4 und 185,6, der Farbton auf
    // ±2 pro Kanal konstant. Ein Fleckenrauschen allein behebt das nicht – es
    // ergibt gesprenkelten Teppich. Was fehlt, ist ein Grund für die
    // Variation.
    //
    // Der Grund ist Wasser. Es sammelt sich in den Senken und am Bach, es
    // läuft vom Höhenrücken ab. Danach richtet sich alles: Moos in den
    // Mulden (dunkel, blaustichig, satt), ausgedörrtes Gras auf dem Rücken
    // (hell, gelblich, blass), Normalgrün dazwischen.
    const rel = y - ISLAND_TOP_Y; // Höhe über der ebenen Fläche
    const bach = 1 - smoothstep(0.15, 1.6, shape.riverDist(x, z));
    // Die begehbare Fläche ist bewusst EBEN. Feuchte aus der absoluten Höhe
    // abzuleiten ergibt dort deshalb überall denselben Wert – gemessen war der
    // Rot-Blau-Abstand über die ganze Wiese konstant 26–27, die Feuchte kam
    // ausschließlich als Helligkeit an. Sie braucht auf der Ebene eine eigene
    // Quelle: zusammenhängende Senken, in denen Wasser stehen bleibt.
    const mulde = smoothstep(0.42, 0.72, valueNoise2(x * 0.42 + 61, z * 0.42 + 17));
    const feucht = Math.min(1, Math.max(mulde * 0.85, bach) * (1 - smoothstep(0.1, 0.5, rel)));
    const trocken = smoothstep(0.12, 0.55, rel) * 0.7 + 0.5 * smoothstep(0.55, 0.25, valueNoise2(x * 0.5 + 3, z * 0.5 + 41));

    // Drei Ortsfrequenzen: breite Flächen, mittlere Flecken, feines Korn.
    const gross = fbm2(x * 0.34 + 11, z * 0.34 + 7);
    const mittel = valueNoise2(x * 1.15 + 3, z * 1.15 + 19) - 0.5;
    const fein = valueNoise2(x * 4.3 + 29, z * 4.3 + 5) - 0.5;
    const variation = gross * 1.15 + mittel * 0.45 + fein * 0.22;

    out.setHSL(
      // Moos zieht ins Blaugrüne, dürres Gras ins Gelbe. Die Ausschläge sind
      // bewusst groß: Bei der halben Stärke blieb der Rot-Blau-Abstand über
      // die ganze Wiese konstant, und die Feuchte war nur als Helligkeit da.
      0.268 + 0.072 * feucht - 0.098 * trocken + 0.024 * variation,
      0.40 + 0.24 * feucht - 0.20 * trocken + 0.10 * variation,
      0.34 - 0.13 * feucht + 0.12 * trocken + 0.115 * variation - 0.07 * smoothstep(0.82, 1.0, rr)
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
    // Wurzelfilz direkt unter der Narbe: dunkel, feucht, faserig. Er ist der
    // sichtbare Beleg dafuer, dass die Grasplatte Dicke hat – ohne ihn geht
    // Gruen ohne Zwischenschritt in Sandbraun ueber und die Narbe wirkt
    // aufgemalt.
    const wurzel = 1 - smoothstep(0, 0.16, d);
    const faser = valueNoise2(Math.cos(a) * 62 + 9, Math.sin(a) * 62 + t * 14);
    out.setHSL(
      0.075 + 0.014 * (streak - 0.5) + 0.020 * wurzel,
      0.34 - 0.08 * d + 0.10 * wurzel,
      0.20 +
        0.055 * d +
        0.05 * (mott - 0.5) +
        0.045 * (streak - 0.5) +
        0.055 * (grit - 0.5) -
        0.115 * wurzel +
        0.05 * wurzel * (faser - 0.5)
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
  const depthShade = 1 - smoothstep(0.10, 1.0, t) * 0.46;
  out.setHSL(
    0.095 + 0.022 * shelf - 0.018 * face,
    0.045 + 0.045 * shelf + 0.025 * (mott - 0.5),
    (0.095 + 0.060 * shelf + 0.045 * (fissure - 0.5) + 0.070 * face + 0.025 * (mott - 0.5)) *
      depthShade +
      0.010
  );
  return out;
}


// Blumen und Grasbüschel auf der Hauptinsel (InstancedMesh = 2 Draw-Calls).
// Alle Instanzen sitzen auf der tatsächlichen Geländehöhe (shape.heightAt) und
// bleiben innerhalb des tatsächlichen, unrunden Umrisses.
// Ein Grashorst: mehrere schmale, gebogene Halme aus einem Punkt.
//
// Vorher war jeder „Büschel" EIN Kegel. Aus zwei Metern liest sich das als
// grüner Zapfen, und weil alle gleich groß waren und gleichmäßig gestreut,
// entstand das Raster, das die Messlatte ausschließt. Ein Horst aus fünf
// Halmen kostet 60 Dreiecke statt 12 – bei einem Budget, das zur Hälfte frei
// ist, ist das der richtige Tausch.
function tuftGeometry(rand) {
  const halme = [];
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.075 + rand() * 0.075;
    const g = new THREE.CylinderGeometry(0.002, 0.011, h, 3, 3);
    const p = g.attributes.position;
    // Neigung nach außen, mit Krümmung: ein Halm steht nicht senkrecht.
    const a = (i / n) * TAU + rand() * 0.8;
    const lean = 0.35 + rand() * 0.5;
    for (let v = 0; v < p.count; v++) {
      const f = 0.5 + p.getY(v) / h; // 0 unten … 1 Spitze
      const bow = f * f * lean * h;
      p.setX(v, p.getX(v) + Math.cos(a) * bow);
      p.setZ(v, p.getZ(v) + Math.sin(a) * bow);
    }
    g.computeVertexNormals();
    g.translate(0, h / 2, 0);
    halme.push(g);
  }
  return mergeGeometries(halme);
}

// Streudekoration der Wiese: Grashorste und Blumen.
//
// Beides steht jetzt in Horsten und Nestern statt gleichmäßig gestreut, und
// beides richtet sich nach der Feuchte – Gras wächst dichter am Bach, Blumen
// auf den trockenen Rücken. Damit ist die Verteilung kein Rauschen mehr,
// sondern folgt derselben Regel wie die Farbe des Bodens.
function addGrassDecoration(group, rand, shape) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  // Kontaktverdunklung für die Horste. Bäume, Findlinge, Büsche und Pilze
  // hatten sie; die Grasbüschel als einzige nicht – und sie sind das, was im
  // Nahbild direkt vor dem Nutzer steht. Gemessen lag der Boden 15 px neben
  // einem Büschelfuß eine einzige Luminanzstufe unter der freien Fläche, der
  // Horst saß also mit haarscharfer Kante auf vollwertig hellem Gras. Alle
  // Verdunklungen zusammen sind EIN Draw-Call.
  const horstSchatten = new GeoBucket();

  // Nester statt Gleichverteilung: erst ein Zentrum würfeln, dann darum streuen.
  const nester = [];
  for (let i = 0; i < 26; i++) {
    const angle = rand() * TAU;
    const r = shape.radius * shape.outline(angle) * (0.10 + rand() * 0.80);
    nester.push({ x: Math.sin(angle) * r, z: Math.cos(angle) * r, s: 0.35 + rand() * 0.9 });
  }
  // Belegte Plätze (Findlinge) und der steil abfallende Rand sind tabu; beides
  // steckt in shape.frei, das buildIsland aufbaut.
  const frei = (x, z) => !shape.frei || shape.frei(x, z);
  // Gibt null zurueck, wenn der Platz belegt ist - der Aufrufer ueberspringt
  // die Instanz dann, statt sie irgendwohin zu setzen.
  const imNest = (nest) => {
    for (let versuch = 0; versuch < 6; versuch++) {
      const a = rand() * TAU;
      const d = Math.sqrt(rand()) * nest.s;
      const x = nest.x + Math.cos(a) * d;
      const z = nest.z + Math.sin(a) * d;
      if (frei(x, z)) return [x, shape.heightAt(x, z), z];
    }
    return null;
  };

  // --- Grashorste ---------------------------------------------------------
  const HORSTE = 240;
  const tufts = new THREE.InstancedMesh(
    tuftGeometry(rand),
    addWind(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 }), {
      strength: 0.055,
      speed: 1.35,
    }),
    HORSTE
  );
  tufts.name = 'tufts';
  tufts.userData.fullCount = HORSTE;
  tufts.castShadow = false;
  tufts.receiveShadow = true;
  const halmTon = [0x5c9a44, 0x6aa84f, 0x4e8b3c, 0x74ad57, 0x568f40];
  for (let i = 0; i < HORSTE; i++) {
    const nest = nester[Math.floor(rand() * nester.length)];
    const platz = imNest(nest);
    if (!platz) {
      dummy.position.set(0, -999, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(1);
      continue;
    }
    const [x, y, z] = platz;
    // Am Bach steht das Gras höher und satter.
    const nass = 1 - smoothstep(0, 1.6, shape.riverDist(x, z));
    dummy.position.set(x, y - 0.012, z);
    dummy.rotation.set((rand() - 0.5) * 0.22, rand() * TAU, (rand() - 0.5) * 0.22);
    dummy.scale.setScalar((0.6 + rand() * 0.9) * (1 + 0.45 * nass));
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    color.setHex(pick(rand, halmTon));
    if (nass > 0) color.offsetHSL(0.015 * nass, 0.10 * nass, -0.05 * nass);
    tufts.setColorAt(i, color);
    addContactShadow(horstSchatten, shape, x, z, 0.115 * dummy.scale.x, true);
  }
  tufts.instanceMatrix.needsUpdate = true;
  if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
  group.add(tufts);

  const horstSchattenMesh = horstSchatten.mesh(
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      // Schwächer als unter Büschen und Findlingen: Ein Grasbüschel verdeckt
      // wenig Himmel, und dreihundert kräftige Flecken würden die Wiese
      // scheckig machen.
      opacity: 0.32,
      depthWrite: false,
      toneMapped: false,
    }),
    'tuft-shade'
  );
  if (horstSchattenMesh) {
    horstSchattenMesh.renderOrder = 1;
    group.add(horstSchattenMesh);
  }

  // --- Blumen -------------------------------------------------------------
  //
  // Vorher waren es freischwebende Ikosaeder in Rosa, Violett, Gelb und Creme –
  // gesättigte Primärfarben nebeneinander, ohne Stiel, ohne Bezug zur Wiese.
  // Jetzt: kleine Dolden auf einem Halm, in nur zwei zur Palette passenden
  // Tönen, und in Nestern statt einzeln gestreut.
  const stiel = new THREE.CylinderGeometry(0.0025, 0.004, 0.055, 3);
  stiel.translate(0, 0.0275, 0);
  paintVertices(stiel, 0x5f8f45);
  const dolde = new THREE.IcosahedronGeometry(0.016, 0);
  dolde.scale(1, 0.75, 1);
  dolde.translate(0, 0.062, 0);
  paintVertices(dolde, 0xffffff);
  const blumeGeo = mergeGeometries([stiel, dolde].map((g) => (g.index ? g.toNonIndexed() : g)));

  const BLUMEN = 90;
  const flowers = new THREE.InstancedMesh(
    blumeGeo,
    addWind(
      new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, vertexColors: true }),
      { strength: 0.075, speed: 1.9 }
    ),
    BLUMEN
  );
  flowers.name = 'flowers';
  flowers.userData.fullCount = BLUMEN;
  flowers.receiveShadow = true;
  // Zwei Töne, beide aus der Umgebungspalette: ein warmes Cremegelb und ein
  // blasses Rosé. Kein Violett, kein Reinweiß.
  const bluetenTon = [0xf2e2a8, 0xead7b6, 0xe8c7bd, 0xf0e6c4];
  for (let i = 0; i < BLUMEN; i++) {
    const nest = nester[Math.floor(rand() * nester.length)];
    const platz = imNest(nest);
    if (!platz) {
      dummy.position.set(0, -999, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      flowers.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(1);
      continue;
    }
    const [x, y, z] = platz;
    dummy.position.set(x, y, z);
    dummy.rotation.set((rand() - 0.5) * 0.3, rand() * TAU, (rand() - 0.5) * 0.3);
    dummy.scale.setScalar(0.75 + rand() * 0.6);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, color.setHex(pick(rand, bluetenTon)));
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  group.add(flowers);
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

  // --- Der Sturz selbst: eine fallende Wasserfläche ------------------------
  //
  // Bisher bestand der „Wasserfall" nur aus 150 Punkten. Von außen betrachtet
  // war das eine dünne Reihe weißer Tupfen – und sie fielen dazu INNERHALB des
  // Felsens, weil sie senkrecht von der Kante starteten, während sich die Wand
  // darunter einzieht. Was fehlt, ist der Strahl.
  //
  // Er wird deshalb als Band gebaut, das der Wand folgt: An jedem Punkt der
  // Fallhöhe wird der tatsächliche Flankenradius abgetastet und das Band knapp
  // davor gesetzt. Es verbreitert sich nach unten (der Strahl fächert auf) und
  // wird durchsichtiger, bis es im Dunst verschwindet.
  {
    const FALL_H = 7.5;
    const SEGV = 22;
    const pos = [];
    const uv = [];
    const idx = [];
    const alpha = [];
    for (let i = 0; i <= SEGV; i++) {
      const f = i / SEGV;
      // Tiefe entlang der Flanke, dieselbe Parametrisierung wie der Fels.
      const t = Math.min(0.85, 0.02 + f * 0.42);
      const rf = shape.sideRadius(t, angle) + 0.035;
      const rr = shape.radius * shape.outline(angle) * rf;
      const cx = Math.sin(angle) * rr;
      const cz = Math.cos(angle) * rr;
      const y = edgeY - 0.02 - FALL_H * (f * 0.55 + f * f * 0.45); // beschleunigt
      const halfW = 0.17 + f * 0.17;
      pos.push(
        cx - tangent.x * halfW, y, cz - tangent.z * halfW,
        cx + tangent.x * halfW, y, cz + tangent.z * halfW
      );
      const v = f * 5;
      uv.push(0, v, 1, v);
      // Oben satt, unten aufgehellt – das ist HELLIGKEIT, nicht Deckkraft.
      const a = 0.85 + 0.25 * f;
      alpha.push(a, a);
      if (i < SEGV) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const fallGeo = new THREE.BufferGeometry();
    fallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    // Die Aufhellung nach unten steckt in den Scheitelfarben.
    //
    // Die AUSBLENDUNG darf dagegen nicht dort stehen: Scheitelfarben
    // multiplizieren die Farbe, nicht die Deckkraft – ein Wert gegen null
    // ergibt Schwarz statt Durchsichtigkeit, und der Strahl endete in einem
    // harten dunklen Rechteck. Dafür gibt es die Alpha-Karte unten.
    const cols = new Float32Array(alpha.length * 3);
    for (let i = 0; i < alpha.length; i++) {
      cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = alpha[i];
    }
    fallGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    fallGeo.setIndex(idx);
    fallGeo.computeVertexNormals();
    // Senkrechter Alphaverlauf: oben deckend, unten löst sich der Strahl in
    // Gischt auf. Eine 4x64-Karte reicht dafür.
    const fadeCanvas = document.createElement('canvas');
    fadeCanvas.width = 4;
    fadeCanvas.height = 64;
    const fc = fadeCanvas.getContext('2d');
    const grad = fc.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#cccccc');
    grad.addColorStop(1, '#000000');
    fc.fillStyle = grad;
    fc.fillRect(0, 0, 4, 64);
    const fadeTex = new THREE.CanvasTexture(fadeCanvas);
    fadeTex.wrapS = THREE.RepeatWrapping;
    fadeTex.wrapT = THREE.ClampToEdgeWrapping;
    // Die UV-Koordinate v läuft über den Strahl von 0 bis 5 (fünf Kacheln der
    // Wassertextur); die Alpha-Karte muss über dieselbe Strecke EINmal laufen.
    fadeTex.repeat.set(1, 1 / 5);

    const fall = new THREE.Mesh(
      fallGeo,
      new THREE.MeshStandardMaterial({
        map: waterTex,
        alphaMap: fadeTex,
        vertexColors: true,
        color: 0xffffff,
        roughness: 0.2,
        metalness: 0.05,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    fall.name = 'waterfall-sheet';
    group.add(fall);
  }

  // --- Gischt: Partikelstrom vor dem Strahl ---
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
  const outR = shape.radius * shape.outline(angle) * (shape.sideRadius(0.16, angle) + 0.06);
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

  return {
    group,
    update(time) {
      waterTex.offset.y = -time * 0.35;
      foam.material.opacity = 0.65 + Math.sin(time * 4) * 0.2;
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

// Flügelumriss.
//
// Vorher war ein Flügel ein PlaneGeometry – ein Rechteck. Am Himmel ergab das
// einen schwarzen Balken, und ein schwarzer Balken ist genau die Art von
// „das hat jemand hingerechnet", die die Messlatte ausschließt. Ein Vogelflügel
// von oben ist eine Sichel: die Vorderkante fast gerade, die Hinterkante nach
// innen gebogen, die Spitze ausgezogen. Fünf Dreiecke je Flügel genügen dafür.
//
// Der Umriss sitzt mit der Wurzel im Ursprung und zeigt nach +X; der zweite
// Flügel entsteht daraus durch Spiegeln (Skalierung x = -1), nicht durch eine
// zweite Geometrie.
function wingGeometry(len, chord) {
  // Der Umriss beginnt bei negativem x, greift also über die Körperachse
  // hinweg. Weil der zweite Flügel die Spiegelung des ersten ist, überlappen
  // sich die beiden Wurzeln in der Mitte und bilden dort einen Rumpf – ohne
  // das klafft zwischen den Flügeln eine Lücke, und das Tier zerfällt in zwei
  // Splitter.
  const punkte = [
    [-0.11, -0.09], [0.00, -0.42], [0.45, -0.46], [0.80, -0.30],
    [1.00, -0.05], [0.72, 0.16], [0.35, 0.34], [0.00, 0.42], [-0.11, 0.13],
  ];
  const pos = [];
  for (let i = 1; i < punkte.length - 1; i++) {
    for (const k of [0, i, i + 1]) {
      pos.push(punkte[k][0] * len, 0, punkte[k][1] * chord);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// --- Fliegendes Leben: Vögel und Schmetterlinge ----------------------------
//
// Beide waren zuvor je EIN Group-Objekt pro Tier mit zwei Flügel-Meshes darin:
// vier Vögel und fünf Falter kosteten zusammen achtzehn Draw-Calls für achtzehn
// Rechtecke. Jetzt sitzen alle Flügel einer Art in EINEM InstancedMesh, dessen
// Matrizen pro Bild neu gesetzt werden – zwei Draw-Calls statt achtzehn.
//
// Die Bewegung bleibt CPU-seitig, und das ist hier richtig: Es sind achtzehn
// Matrizen, kein Vertex-Strom, und die Flugbahn muss ohnehin je Tier bekannt
// sein.
function makeFlyers(rand, {
  count,
  wingGeo,
  material,
  name,
  radius,
  height,
  speed,
  flap,
  flapAmp = 0.85,
  dihedral = 0,
  bob,
  bobAmp = 0.45,
  bank = 0,
  spread = 0,
  spanX,
}) {
  const mesh = new THREE.InstancedMesh(wingGeo, material, count * 2);
  mesh.name = name;
  mesh.frustumCulled = false; // die Tiere wandern weit, die Hülle stimmt nie
  mesh.userData.fullCount = count * 2;
  const tiere = [];
  for (let i = 0; i < count; i++) {
    tiere.push({
      radius: radius[0] + rand() * (radius[1] - radius[0]),
      height: height[0] + rand() * (height[1] - height[0]),
      speed: (speed[0] + rand() * (speed[1] - speed[0])) * (rand() > 0.5 ? 1 : -1),
      phase: rand() * TAU,
      bob: rand() * TAU,
      // Zweite Schwingung, die aus dem Kreis eine Schleife macht.
      wob: rand() * TAU,
      // Eigener Kreismittelpunkt je Tier.
      //
      // Vorher kreisten alle um den Inselnullpunkt. Das hatte zwei Folgen:
      // Die Bahnen lagen konzentrisch ineinander – für sich schon verräterisch –
      // und die Flügel zeigen bei einer Kreisbahn immer radial, also genau in
      // die Blickachse einer Kamera, die zur Inselmitte schaut. Aus jedem Vogel
      // nahe der Bildmitte wurde dadurch ein senkrechter Strich statt einer
      // Silhouette.
      cx: (rand() - 0.5) * spread,
      cz: (rand() - 0.5) * spread,
    });
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  // Vorgehaltene Hilfsvektoren: update() laeuft zweiundsiebzig Mal je Sekunde
  // und darf dabei nichts anlegen, was der Sammler wieder einsammeln muss.
  const off = new THREE.Vector3();
  const vor = new THREE.Vector3();
  // Der zweite Flügel ist der erste, an der Körperachse gespiegelt.
  const scl = new THREE.Vector3(1, 1, 1);

  // Grundriss der Flugbahn.
  //
  // Ein reiner Kreis war messbar falsch, nicht nur langweilig: Bei einer
  // Kreisbahn steht die Spannweite immer radial zum Bahnmittelpunkt. Die
  // Bahnmittelpunkte liegen alle in der Nähe der Inselmitte, und die Kamera
  // schaut auf die Inselmitte – also zeigt JEDER Vogel, der in der Bildmitte
  // auftaucht, seine Flügel genau in die Blickachse und wird zum senkrechten
  // Strich. Zwei überlagerte Oberschwingungen machen daraus eine Schleife;
  // die Blickrichtung wird danach aus der tatsächlichen Bewegung abgeleitet,
  // nicht mehr aus dem Bahnwinkel.
  const bahn = (d, a, out) =>
    out.set(
      d.cx + Math.sin(a) * d.radius + Math.sin(2 * a + d.wob) * d.radius * 0.34,
      0,
      d.cz + Math.cos(a) * d.radius + Math.cos(3 * a + d.wob) * d.radius * 0.22
    );
  return {
    group: mesh,
    update(time) {
      for (let i = 0; i < tiere.length; i++) {
        const d = tiere[i];
        const a = time * d.speed + d.phase;
        bahn(d, a, p);
        p.y = d.height + Math.sin(time * bob + d.bob) * bobAmp;
        // Blickrichtung aus der Bahn ablesen statt aus dem Winkel rechnen.
        bahn(d, a + (d.speed > 0 ? 0.03 : -0.03), vor);
        const yaw = Math.atan2(vor.x - p.x, vor.z - p.z);
        // Schlagwinkel. Je Tier eine eigene Phase – sonst schlagen alle im
        // Gleichtakt, und genau das verbietet die Messlatte.
        const w = Math.sin(time * flap + d.phase * 2.3);
        // Schräglage in der Kurve: beide Flügel kippen um denselben Betrag in
        // dieselbe Richtung. Ohne sie kreist der Vogel brettflach.
        const lage = d.speed > 0 ? bank : -bank;
        for (let k = 0; k < 2; k++) {
          const dir = k === 0 ? -1 : 1;
          // V-Stellung plus Schlag. Der Sockel ist wichtiger als die Amplitude:
          // Ein segelnder Greifvogel hält die Flügel fast waagerecht in
          // leichtem V und schlägt nur gelegentlich. Mit großem Ausschlag steht
          // er im Standbild regelmäßig hochkant und wird zum senkrechten Strich.
          e.set(0, yaw, (dihedral + w * flapAmp) * dir + lage);
          q.setFromEuler(e);
          // Der Flügel sitzt seitlich am Körper; die Verschiebung muss die
          // Drehung mitmachen, sonst klappt er um seinen eigenen Mittelpunkt.
          off.set(dir * spanX, 0, 0).applyQuaternion(q).add(p);
          scl.x = dir;
          m.compose(off, q, scl);
          mesh.setMatrixAt(i * 2 + k, m);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Vögel: dunkle Silhouetten, die in der Ferne kreisen. Sie sind bewusst klein
// und dunkel – ein Vogel am Himmel ist eine Andeutung, kein Modell.
function makeBirds(rand) {
  // Spannweite 0,30 x Weltmaßstab vier = 1,2 m je Flügel, also gut zwei Meter
  // insgesamt – ein Greifvogel, und genau das soll es in dieser Höhe sein.
  return makeFlyers(rand, {
    count: 5,
    wingGeo: wingGeometry(0.30, 0.11),
    material: new THREE.MeshBasicMaterial({ color: 0x3a4753, side: THREE.DoubleSide }),
    name: 'birds',
    // Gemessen standen die Vögel bis zu sechzig Meter neben und zweiundzwanzig
    // Meter über der Insel – dort sind sie ein Punkt und tragen nichts bei.
    // Jetzt kreisen sie über der Insel statt daneben.
    radius: [4.5, 8.5],
    height: [3.0, 5.5],
    speed: [0.12, 0.22],
    spread: 9,
    flap: 5.0,
    flapAmp: 0.30,
    dihedral: 0.16,
    bob: 1.3,
    bobAmp: 0.45,
    bank: 0.20,
    spanX: 0,
  });
}

// Schmetterlinge nah über der Wiese.
//
// Sie waren 0,07 Einheiten groß – mal Weltmaßstab vier sind das
// Flügel von 35 cm, also Falter mit siebzig Zentimetern Spannweite. Dazu
// gesättigtes Rosa, Violett, Gelb und Hellblau, die als einzige Farben der
// Szene außerhalb der Palette standen. Beides ist korrigiert: Spannweite rund
// neun Zentimeter, Töne aus der Umgebungspalette.
function makeButterflies(rand) {
  // Runder, breiter Umriss statt der Vogelsichel – und mit der Wurzel im
  // Ursprung, damit die Spiegelung des zweiten Flügels greift.
  const wing = new THREE.CircleGeometry(0.011, 8);
  wing.rotateX(-Math.PI / 2);
  wing.scale(1.0, 1, 1.35);
  wing.translate(0.010, 0, 0);
  const flyer = makeFlyers(rand, {
    count: 7,
    wingGeo: wing,
    material: new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.75,
      metalness: 0,
    }),
    name: 'butterflies',
    // Ein Falter gaukelt kniehoch über der Wiese, nicht in Baumhöhe. Vorher
    // stand er bis 2,2 Einheiten hoch – mal vier sind das knapp neun Meter,
    // und damit stand er im Bild ÜBER dem Horizont.
    radius: [1.2, 3.2],
    // Knapp über der Grasnarbe. Vorher standen sie bis auf Augenhöhe und
    // darüber – dort sieht man sie gegen den Himmel, und ein cremefarbener
    // Fleck gegen Hellblau ist kein Falter, sondern ein Fussel auf der Linse.
    height: [0.05, 0.24],
    speed: [0.3, 0.6],
    spread: 7,
    flap: 13,
    flapAmp: 0.70,
    dihedral: 0.18,
    bob: 1.6,
    bobAmp: 0.07,
    spanX: 0.002,
  });
  // Töne aus der Umgebungspalette statt gesättigter Primärfarben.
  const toene = [0xf0e2b4, 0xe8d0a8, 0xdcc9b0, 0xefe6cf, 0xe6cbb2];
  const c = new THREE.Color();
  for (let i = 0; i < flyer.group.count; i++) {
    flyer.group.setColorAt(i, c.setHex(toene[Math.floor(i / 2) % toene.length]));
  }
  if (flyer.group.instanceColor) flyer.group.instanceColor.needsUpdate = true;
  return flyer;
}

// Volumetrisch wirkende Wolke: Cluster weicher Kugeln zu EINEM Mesh verschmolzen.
// Als echtes 3D-Objekt (kein Billboard-Sprite) dreht sie sich NICHT mit der
// Kopfbewegung – sie bleibt fest im Raum stehen.
// UNBELEUCHTET, mit Absicht.
//
// Vorher war das ein MeshStandardMaterial. Damit lag über den einbebackenen
// Scheitelfarben noch die volle Szenenbeleuchtung – einschließlich der starken
// Aufhellung von unten, die für den Inselkiel eingeführt wurde. Gemessen wurde
// dadurch die UNTERSEITE jeder Wolke als ihre hellste Fläche (5-backlight
// x=450: oben L=191, innen L=174, unten L=203; zwei weitere Bilder gleich).
// Die flache Haufenwolken-Unterkante war geometrisch da, wurde aber als
// Leuchtfläche gerendert und kippte damit genau die Lesart, für die sie gebaut
// war. Eine Wolke ist ohnehin kein Lambert-Körper – ihre Helligkeit kommt aus
// Streuung. Mit MeshBasicMaterial ist der Bake die ganze Wahrheit, und die
// Richtung kann nicht mehr von einem Licht überstimmt werden.
const CLOUD_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  vertexColors: true,
});

function makeCloud(rand, size = 1, sunDir = null) {
  // Form: wenige große Ballen, viele kleine Knospen.
  //
  // Vorher waren es fünf bis acht gleich große Kugeln – die Konstruktion war
  // als solche lesbar, weil jede einzelne Kugel groß genug war, um ihre
  // Rundung zu zeigen. Eine Haufenwolke entsteht aus ANZAHL: Ein paar Ballen
  // tragen die Masse, ein Dutzend Knospen brechen die Silhouette auf. Derselbe
  // Gedanke wie bei den Baumkronen.
  const geos = [];
  const ballen = 3 + Math.floor(rand() * 2);
  const knospen = 7 + Math.floor(rand() * 6);
  // Wolken sind breit und flach, nicht kugelig.
  const spanX = 3.6 * size;
  const spanZ = 2.0 * size;
  for (let i = 0; i < ballen + knospen; i++) {
    const gross = i < ballen;
    const s = (gross ? 0.85 + rand() * 0.55 : 0.30 + rand() * 0.32) * size;
    // Kleine Knospen brauchen keine 12x10 Segmente – sie sind auf dem Schirm
    // ein paar Pixel groß, kosten aber dieselben Dreiecke.
    const g = new THREE.SphereGeometry(s, gross ? 12 : 7, gross ? 10 : 6);
    // Knospen sitzen bevorzugt oben und außen auf den Ballen.
    const f = gross ? 0.55 : 1.0;
    g.translate(
      (rand() - 0.5) * spanX * f,
      (gross ? (rand() - 0.5) * 0.5 : (rand() - 0.15) * 0.85) * size,
      (rand() - 0.5) * spanZ * f
    );
    geos.push(g);
  }
  const merged = mergeGeometries(geos);

  // Flache Unterkante. Eine Haufenwolke schwimmt auf einer Höhe, an der der
  // Wasserdampf kondensiert – ihr Boden ist deshalb eine waagerechte Ebene,
  // ihr Oberteil aufgetürmt. Ohne das bleibt es ein Traubenhaufen.
  {
    const pp = merged.attributes.position;
    const basis = -0.34 * size;
    for (let i = 0; i < pp.count; i++) {
      const y = pp.getY(i);
      if (y < basis) pp.setY(i, basis + (y - basis) * 0.18);
    }
    merged.computeVertexNormals();
  }

  // Lichtrichtung in die Scheitelfarben backen.
  //
  // Gemessen war die Unterseite der Wolken HELLER als ihr Körper, und die
  // Gesamtmodulation lag unter 23 Luminanzstufen: Sie waren die größte Fläche
  // des Himmels und die einzige ohne jede Lichtinformation – in dem Bild, das
  // die Sonnenposition eindeutig benennt, standen sie 300 px neben der Scheibe
  // ohne Silberrand.
  //
  // Das Licht der Szene allein bringt das nicht in Ordnung: Die Aufhellung von
  // unten, die der Inselunterseite gilt, trifft die Wolken genauso und hebt
  // ausgerechnet ihre Schattenseite an. Deshalb steht die Richtung hier fest in
  // der Geometrie – eine Wolke ist ohnehin kein Lambert-Körper, ihre Helligkeit
  // kommt aus Streuung, nicht aus N·L.
  const dir = sunDir ? sunDir.clone().normalize() : new THREE.Vector3(0, 1, 0);
  const pos = merged.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, Math.abs(pos.getY(i)));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    // Wie stark diese Stelle der Sonne zugewandt ist (−1 … 1)
    const facing = (x * dir.x + y * dir.y + z * dir.z) / len;
    // Und wie weit oben sie liegt – Wolken sind unten grundsätzlich dichter.
    const up = maxY > 0 ? y / maxY : 0;
    // Grundhelligkeit: sonnenzugewandt heller, oben heller, Schattenseite tiefer.
    // Die Beträge gelten seit der Umstellung auf ein unbeleuchtetes Material
    // ALLEIN – vorher kam die Szenenbeleuchtung als Faktor obendrauf.
    //
    // Und sie müssen UNTER der Kompressionsschwelle des Tonemappers bleiben. Mit
    // Grundwert 0,92 lag schon der Körper der Wolke im flachen Ast der
    // ACES-Kurve; gemessen hatte eine nahe Wolke dadurch (242,242,241) mit
    // dreizehn Luminanzstufen Gesamtspanne – ein weißes Blatt Papier. Der Gipfel
    // ohne Silberrand liegt jetzt bei 1,14, der Schatten bei 0,34, und dazwischen
    // bleibt die Kurve steil genug, dass die Form sichtbar wird.
    let f = 0.62 + 0.34 * Math.max(0, facing) + 0.18 * up - 0.28 * Math.max(0, -facing);
    // SILBERRAND. Der schmale, sehr helle Saum genau dort, wo die Sonne die
    // Wolke streift, ist das Erkennungszeichen einer Haufenwolke im Gegenlicht –
    // und er fehlte vollständig. Er sitzt eng (hoher Exponent), damit er ein
    // Saum bleibt und nicht die halbe Wolke aufhellt.
    f += 1.00 * Math.pow(Math.max(0, facing), 7);
    // Die Schattenseite ist kühl, die Sonnenseite eine Spur warm.
    c.setRGB(f * (1 + 0.06 * facing), f * (1 + 0.015 * facing), f * (1 - 0.05 * facing));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const cloud = new THREE.Mesh(merged, CLOUD_MATERIAL);
  cloud.scale.y = 0.62; // flach drücken → Wolkenform
  return cloud;
}

// Hängende Ranken/Wurzeln unter dem Inselrand. Sie setzen jetzt an der
// tatsächlichen, unrunden Abbruchkante an (shape.outline/edgeY) statt an einem
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
      // Der Strang hängt senkrecht, die Felswand zieht sich nach unten aber
      // ein. Wird der Radius nur am Ansatzpunkt bestimmt, steht der untere Teil
      // frei in der Luft. Deshalb wird die Flanke über die ganze Stranglänge
      // abgetastet und der ENGSTE Radius genommen – derselbe Fehler war schon
      // einmal an den Wurzelvorhängen zu beheben.
      const tEnd = Math.min(0.7, t0 + len / Math.max(0.001, shape.depth));
      let engste = Infinity;
      for (let k = 0; k <= 6; k++) {
        engste = Math.min(engste, shape.sideRadius(t0 + ((tEnd - t0) * k) / 6, a));
      }
      rr = shape.radius * shape.outline(a) * (engste - 0.02);
      ansatzY = shape.edgeY(a) - shape.sideDepth(t0, a);
    } else {
      rr = radius * (0.72 + rand() * 0.22);
    }
    // ACHSENKONVENTION. Die gesamte Formbeschreibung rechnet x = sin(a),
    // z = cos(a). Dieser Bauer stammt aus PR #9 und rechnete x = cos(a),
    // z = sin(a) – der Strang wurde also an einem ANDEREN Winkel abgesetzt, als
    // der Radius bestimmt wurde. Auf einem Umriss, der zwischen 0,6 und 1,3
    // schwankt, sind das mehrere Meter neben der Wand. Das war die Ursache der
    // Ranken, die frei in der Luft hingen – nicht der Ausschwung, an dem ich
    // zweimal erfolglos gedreht habe.
    const ax = Math.sin(a) * rr;
    const az = Math.cos(a) * rr;

    // Kettenlinie: Der Strang verlässt den Rand fast waagerecht nach außen und
    // richtet sich nach unten auf. Vier Stützpunkte reichen – CatmullRom macht
    // daraus eine Kurve ohne Knick, und mehr Punkte kosten nur Dreiecke.
    // Wie weit die Ranke nach außen ausholt. Der Wert ist ein Faktor auf den
    // Ansatzradius – und genau deshalb muss er kleiner werden, sobald der
    // Ansatz auf der tatsächlichen Flanke sitzt statt bei 0,72–0,94 des
    // Radius: Dort bedeuten 50 % Ausschwung mehrere Meter neben der Insel, und
    // der Vorhang hing sichtbar frei im Himmel. Am Kreis-Ansatz landete
    // derselbe Wert noch ungefähr an der Kante.
    const drift = shape ? 0.04 + rand() * 0.07 : 0.18 + rand() * 0.3;
    // Seitlicher Versatz TANGENTIAL zur Wand, nicht entlang der Z-Achse.
    //
    // Vorher wurde er stur auf z addiert. An einem Ansatzpunkt, der zufällig
    // schon auf der Z-Achse lag, schob er den Strang damit in die Wand oder von
    // ihr weg statt an ihr entlang – und an allen anderen wirkte er
    // unterschiedlich stark. Übrig blieb ein Strang, der praktisch lotrecht
    // fiel: eine senkrechte Kette gleicher Kugeln, „wie eine grüne Raupe".
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const seite = (rand() - 0.5) * 0.34;
    // Zwei Auslenkungen mit verschiedenem Vorzeichen ergeben eine S-Krümmung
    // statt einer schrägen Geraden.
    const bauch = (rand() - 0.5) * 0.18;
    // Wer seitlich ausschert, muss zugleich nach AUSSEN. Der Ansatzradius liegt
    // bei `engste - 0,02`, also praktisch auf der Wand; eine reine
    // Seitwärtsbewegung an einer konvexen Flanke führt damit ins Gestein. Beim
    // ersten Versuch mit ±0,45 verschwand der halbe Strang im Fels und tauchte
    // weiter unten wieder auf.
    const raus = Math.abs(seite) * 0.75;
    const rx = Math.sin(a) * raus;
    const rz = Math.cos(a) * raus;
    const kurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ax, ansatzY, az),
      new THREE.Vector3(
        ax * (1 + drift * 0.35) + tx * (seite * 0.22 + bauch) + rx * 0.3,
        ansatzY - len * 0.22,
        az * (1 + drift * 0.35) + tz * (seite * 0.22 + bauch) + rz * 0.3
      ),
      new THREE.Vector3(
        ax * (1 + drift * 0.5) + tx * seite * 0.62 + rx * 0.75,
        ansatzY - len * 0.62,
        az * (1 + drift * 0.5) + tz * seite * 0.62 + rz * 0.75
      ),
      new THREE.Vector3(
        ax * (1 + drift * 0.52) + tx * seite + rx,
        ansatzY - len,
        az * (1 + drift * 0.52) + tz * seite + rz
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
    // Blattbüschel in UNGLEICHEN Abständen und mit ungleicher Größe.
    //
    // Vorher: `t = 0.14 + (b / bueschel) * 0.82` – ein festes Raster mit ±0,05
    // Wackeln. Gleich große Kugeln in gleichem Abstand auf einer Geraden sind
    // die Definition einer Perlenkette. Jetzt wächst t in zufälligen Schritten,
    // sodass sich Büschel stellenweise zu Trauben ballen und dazwischen ein
    // Stück nackter Strang sichtbar bleibt; dazu ein kleiner Querversatz, damit
    // sie nicht alle auf der Achse aufgefädelt sind.
    const bueschel = 6 + Math.floor(rand() * 4);
    let t = 0.12 + rand() * 0.08;
    for (let b = 0; b < bueschel && t < 0.99; b++) {
      kurve.getPointAt(Math.min(0.99, t), mitte);
      const quer = 0.045;
      laubPunkte.push({
        p: mitte
          .clone()
          .add(
            new THREE.Vector3(
              (rand() - 0.5) * quer,
              (rand() - 0.5) * quer * 0.5,
              (rand() - 0.5) * quer
            )
          ),
        // Größenspanne 0,09 … 0,30 statt 0,17 … 0,28: wenige große Polster,
        // viele kleine Blattgruppen.
        s: (0.09 + Math.pow(rand(), 1.8) * 0.21) * (1 - t * 0.35),
        dreh: rand() * Math.PI * 2,
      });
      t += 0.05 + Math.pow(rand(), 1.6) * 0.20;
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

// Boxprojektion je DREIECK statt je Vertex.
//
// `boxProjectUV()` wählt die Projektionsachse pro Vertex. Auf einer facettierten
// Form wählen die drei Ecken eines Dreiecks nahe einer Achsengrenze
// unterschiedlich – die UVs des Dreiecks stammen dann aus zwei verschiedenen
// Ebenen und die Textur wird darüber gestreckt. Sichtbar war das als Naht
// mitten auf einem einzelnen Findling: zwei Texeldichten auf demselben Stein.
//
// Hier entscheidet die Facettennormale, und alle drei Ecken bekommen dieselbe
// Ebene. Setzt eine nicht-indizierte Geometrie voraus.
function faceBoxUV(geometry, metersPerTile = 0.4) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const s = 1 / Math.max(metersPerTile, 1e-3);
  const ax = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    ax.set(
      pos.getX(f + 1) - pos.getX(f),
      pos.getY(f + 1) - pos.getY(f),
      pos.getZ(f + 1) - pos.getZ(f)
    );
    bx.set(
      pos.getX(f + 2) - pos.getX(f),
      pos.getY(f + 2) - pos.getY(f),
      pos.getZ(f + 2) - pos.getZ(f)
    );
    n.crossVectors(ax, bx);
    const nx = Math.abs(n.x);
    const ny = Math.abs(n.y);
    const nz = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const i = f + k;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let u;
      let v;
      if (ny >= nx && ny >= nz) {
        u = x;
        v = z;
      } else if (nx >= nz) {
        u = z;
        v = y;
      } else {
        u = x;
        v = y;
      }
      uv[i * 2] = u * s;
      uv[i * 2 + 1] = v * s;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Ein Findling: unregelmäßig verschobener Icosaeder, flach gelagert.
function boulderGeometry(rand, size, detail = 1) {
  const g = new THREE.IcosahedronGeometry(size, detail);
  const p = g.attributes.position;
  for (let v = 0; v < p.count; v++) {
    const x = p.getX(v);
    const y = p.getY(v);
    const z = p.getZ(v);
    // Zwei Ortsfrequenzen: eine grobe, die den Block kippt und staucht, und
    // eine feine für die Unregelmäßigkeit der Einzelfacette.
    const grob = hashNoise(x * 6, y * 6, z * 6) - 0.5;
    const fein = hashNoise(x * 27, y * 27, z * 27) - 0.5;
    const f = 1 + grob * 0.62 + fein * 0.30;
    p.setXYZ(v, x * f, y * f * 0.72, z * f);
  }
  g.computeVertexNormals();
  g.rotateY(rand() * TAU);
  g.rotateX((rand() - 0.5) * 0.5);
  // Eigene UVs: Die des Ikosaeders sind nach dem Verschieben verzerrt, und die
  // Granitkarte braucht überall dieselbe Korngröße.
  return faceBoxUV(g, 0.17 * WORLD_SCALE);
}

// Kontaktschatten als EIN verschmolzenes Mesh statt eines Draw-Calls je Objekt.
// Die Quads liegen auf der tatsächlichen Geländehöhe – auf dem Wall kippen sie
// nicht in den Hang, weil sie knapp darüber schweben und weich auslaufen.
function addContactShadow(bucket, shape, x, z, radius, tight = false) {
  const g = new THREE.PlaneGeometry(radius * (tight ? 1.25 : 2), radius * (tight ? 1.25 : 2));
  g.rotateX(-Math.PI / 2);
  g.translate(x, shape.heightAt(x, z) + 0.012, z);
  bucket.add(g, 0xffffff);
}

// Schwebende Insel: durchgehender Körper (Gras → Erde → geschichteter Fels),
// darauf Bäume, Findlinge und Kontaktschatten – alles in wenigen Meshes.
function buildIsland(
  rand,
  {
    radius = 5,
    depth = 5,
    trees = 3,
    rocks = 4,
    vines = 9,
    river = null,
    detail = 1,
    // Echte Schlagschatten nur auf der Hauptinsel; siehe Begruendung beim
    // Schattenvolumen in createIslandEnvironment().
    shadows = false,
  } = {}
) {
  const island = new THREE.Group();
  island.name = 'island';
  const shape = makeIslandShape(rand, { radius, depth, river, detail });
  island.userData.shape = shape;
  // Wo Findlinge liegen, darf kein Gras stehen. Die Streudekoration sitzt auf
  // der GELAENDEhoehe, die Bloecke liegen darueber - ein Horst an derselben
  // Stelle waechst sichtbar aus dem Stein heraus oder schwebt davor.
  shape.blocked = [];
  shape.frei = (x, z) => {
    for (const b of shape.blocked) {
      if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return false;
    }
    // 0,96 statt 0,90: Bei 0,90 endete JEDER Bewuchs schlagartig entlang einer
    // Linie, und darunter lag bis zur Abbruchkante ein völlig glatter, kahler
    // Streifen – ein Streuradius, den man ansehen kann. Die steile Kante selbst
    // hält shape.frei ohnehin frei, weil dort die Grasnarbe abfällt.
    return Math.hypot(x, z) < shape.radius * shape.outline(Math.atan2(x, z)) * 0.96;
  };

  island.add(buildIslandBody(shape, { detail }));

  island.add(makeVines(rand, radius, vines + 4, shape));

  const trees_ = makeTreeCollector();
  const stoneBucket = new GeoBucket();
  const shadowBucket = new GeoBucket();

  // Bäume: gehäuft am Höhenrücken, einzeln im offenen Feld – das staffelt den
  // Blick in Vorder-, Mittel- und Hintergrund, statt gleichmäßig zu streuen.
  for (let i = 0; i < trees; i++) {
    const clustered = i > 0 && rand() > 0.35;
    const angle = clustered ? shape.ridgeAngle + (rand() - 0.5) * 1.5 : rand() * TAU;
    // Die Inselmitte bleibt frei. Dort steht der Nutzer, und dort landen die
    // Karten im Halbkreis – ein Baum an dieser Stelle verstellt nicht nur die
    // Sicht, er steht mitten im Arbeitsbereich.
    const r = radius * (clustered ? 0.70 + rand() * 0.20 : 0.60 + rand() * 0.28);
    const tx = Math.sin(angle) * r;
    const tz = Math.cos(angle) * r;
    if (shape.riverCurve && Math.hypot(tx - 0.1, tz - 0.2) < 0.7) continue; // nicht in die Quelle
    const y = shape.heightAt(tx, tz);
    const scale = 0.85 + rand() * 0.5;
    addTree(rand, trees_, { x: tx, y, z: tz, scale });
    addContactShadow(shadowBucket, shape, tx, tz, 0.46 * scale, shadows);
  }
  for (const m of buildCollectedTrees(trees_, 0x1de4 ^ Math.floor(rand() * 4096))) {
    island.add(m);
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
    shape.blocked.push({ x: kx, z: kz, r: s * 1.7 });
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
    // ARBEITSBEREICH BLEIBT FREI. Bis ISLAND_FLAT_R (0,58 des Radius) ist die
    // Fläche bewusst eben: Dort steht der Nutzer, dort legt die App die Karten
    // im Halbkreis ab. Vorher landete gut jeder dritte Findling bei 0,30…0,60 –
    // also mitten darin. Im Prüfbild „Nahaufnahme Bodenvegetation" füllte ein
    // einzelner Block dadurch 69,8 % des Rahmens, und in der Anwendung stünde
    // er zwischen Nutzer und Karten.
    const r = radius * (rand() > 0.4 ? 0.72 + rand() * 0.20 : 0.62 + rand() * 0.10);
    const sx = Math.sin(angle) * r;
    const sz = Math.cos(angle) * r;
    shape.blocked.push({ x: sx, z: sz, r: s * 1.9 });
    const g = boulderGeometry(rand, s);
    g.translate(sx, shape.heightAt(sx, sz) + s * 0.30, sz);
    stoneBucket.add(g, (vx, vy, vz) => {
      const n = valueNoise2(vx * 5 + 3, vz * 5 + 9);
      return new THREE.Color().setHSL(0.094, 0.05 + 0.025 * n, 0.20 + 0.10 * n + 0.03 * vy);
    });
    addContactShadow(shadowBucket, shape, sx, sz, s * 1.7, shadows);
  }

  // Dieselbe Karte wie die Flanke. Vorher trug der Findling die Granitkarte mit
  // ihren Einschlüssen, die Wand aber nicht – zwei Gesteinsarten in einem Bild,
  // was der Prüfer zu Recht als LOD-Fehler gelesen hat.
  const steinMat = addSkyRim(cliffMaterial({ tone: 0xffffff, vertexColors: true }).clone(), {
    strength: 0.16,
    power: 3.8,
  });
  steinMat.flatShading = true;
  // Die Granitkarte traegt runde Einschluesse. Bei kleiner Kachel kehren sie
  // sichtbar wieder und lesen sich als Muster statt als Gestein; die Kachel ist
  // deshalb groesser und das Relief flacher.
  steinMat.normalScale = new THREE.Vector2(0.55, 0.55);
  const stones = stoneBucket.mesh(steinMat, 'island-stones');
  if (stones) island.add(stones);

  // Kontaktverdunklung. Beim Einführen der echten Schlagschatten habe ich sie
  // ganz entfernt, weil zwei Schatten je Objekt falsch wären – das war zu
  // grob gedacht: Ein Schlagschatten sagt, wo die Sonne NICHT hinkommt, eine
  // Kontaktverdunklung sagt, wo das Umgebungslicht nicht hinkommt. Ohne sie
  // sitzt jeder Busch, jeder Findling und jeder Grasbüschel mit einer
  // haarscharfen Kante auf vollwertig hellem Gras (gemessen: weniger als drei
  // Luminanzstufen Abweichung am Fuß).
  //
  // Wo echte Schatten fallen, wird sie deshalb nicht weggelassen, sondern eng
  // und schwach gehalten: ein kurzer Saum am Fuß statt eines Flecks daneben.
  const blob = shadowBucket.mesh(
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: shadows ? 0.34 : 0.55,
      depthWrite: false,
      toneMapped: false,
    }),
    'island-shadows'
  );
  if (blob) {
    blob.renderOrder = 1;
    island.add(blob);
  }
  if (shadows) {
    // Werfer und Empfänger. Das Gras empfängt, wirft aber nicht: Es ist die
    // Fläche, auf der die Schatten liegen, und ein Deckel, der sich selbst
    // beschattet, erzeugt bei streifendem Licht nur Schattenakne.
    island.traverse((o) => {
      if (!o.isMesh) return;
      if (o.name === 'island-body') {
        o.receiveShadow = true;
        o.castShadow = true;
      } else if (o.name === 'island-krone' || o.name === 'island-laub' || o.name === 'island-holz') {
        o.castShadow = true;
      } else if (o.name === 'island-stones') {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  return island;
}

// Unterwuchs: instanzierte Büsche + Pilze (wenige Draw-Calls) auf der Hauptinsel.
function addUndergrowth(group, rand, shape) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const shadowBucket = new GeoBucket();
  const spot = (min, max) => {
    for (let versuch = 0; versuch < 8; versuch++) {
      const angle = rand() * TAU;
      const r = shape.radius * shape.outline(angle) * (min + rand() * (max - min));
      const x = Math.sin(angle) * r;
      const z = Math.cos(angle) * r;
      // Findlinge liegen ueber der Gelaendehoehe; ein Busch oder Pilz an
      // derselben Stelle waechst sichtbar aus dem Stein.
      if (!shape.frei || shape.frei(x, z)) return [x, shape.heightAt(x, z), z];
    }
    return [0, shape.heightAt(0, 0), 0];
  };

  // --- Büsche ---------------------------------------------------------------
  //
  // Vorher: glatt schattierte Ikosaeder mit erkennbar sphärischer Silhouette –
  // grüne Halbkugeln, die sich vom Gras nur in der Sättigung unterschieden.
  // Ihr Grün hatte dazu einen auf null geklemmten Rotkanal und stand damit in
  // einer völlig anderen Farbfamilie als die Wiese.
  //
  // Jetzt tragen sie dasselbe Blattwerk wie die Bäume: dunkler Hüllkörper als
  // Verdecker, Blattkarten davor. Damit lösen sie sich in der Silhouette auf,
  // bewegen sich im selben Wind und gehören farblich zur selben Familie.
  const buschAnsaetze = [];
  const BUESCHE = 14;
  for (let i = 0; i < BUESCHE; i++) {
    const [x, y, z] = spot(0.24, 0.90);
    const s = 0.085 + rand() * 0.075;
    // Zwei bis drei Ansätze je Busch: ein Strauch ist kein Ball.
    const n = 2 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) {
      buschAnsaetze.push([
        x + (rand() - 0.5) * s * 1.7,
        y + s * (0.5 + rand() * 0.5),
        z + (rand() - 0.5) * s * 1.7,
        s * (0.72 + rand() * 0.4),
        rand() > 0.5 ? 3 : 0,
      ]);
    }
    addContactShadow(shadowBucket, shape, x, z, s * 1.5, true);
  }
  const busch = baueKrone({
    ansaetze: buschAnsaetze,
    seed: 0x6b21,
    kartenMaterial: inselBaumMaterialien().karten,
    kind: 'azalea',
    cardScale: 0.78,
    dichte: 82,
    kern: 0.52,
    schale: 1.35,
    farben: [0x3a5f42, 0x436b4a, 0x33553c, 0x35583c, 0x3d6544, 0x2f4f37],
    kartenFarben: [0xd2eaa8, 0xc3dd99, 0xdcf2b4, 0xcae4a0, 0xd8eeae, 0xbfd894],
  });
  busch.blobs.name = 'bushes';
  busch.karten.name = 'bush-leaves';
  busch.karten.receiveShadow = true;
  group.add(busch.blobs, busch.karten);

  // Kontaktverdunklung unter Büschen und Pilzen. Ohne sie sitzen sie mit einer
  // haarscharfen Kante auf vollwertig hellem Gras – gemessen lag die Abweichung
  // am Buschfuß unter drei Luminanzstufen. Alle zusammen ein Draw-Call.
  const shade = shadowBucket.mesh(
    new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.30,
      depthWrite: false,
      toneMapped: false,
    }),
    'undergrowth-shade'
  );
  if (shade) {
    shade.renderOrder = 1;
    group.add(shade);
  }

  // Pilz: verschmolzene Geometrie mit Vertex-Farben (weißer Stiel, roter Hut)
  const stem = new THREE.CylinderGeometry(0.02, 0.028, 0.09, 6);
  stem.translate(0, 0.045, 0);
  paintVertices(stem, 0xf1ebde);
  const cap = new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.7, 1);
  cap.translate(0, 0.09, 0);
  paintVertices(cap, 0x9d5a4a);
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

  // --- Lichtführung ---------------------------------------------------------
  //
  // Der Ausgangszustand hatte kein gerichtetes Licht im Wortsinn: Zwei
  // Hemisphärenlichter (das globale aus main.js mit 1,4 plus ein eigenes mit
  // 1,15) summierten sich auf mehr Umgebungslicht, als die Sonne mit 1,9
  // beisteuerte. Gemessen an den Bildern: die Baumkrone im Gegenlicht lag bei
  // (0,19,5) – absolut schwarz, ohne Rim –, die Sonne war eine flache Scheibe
  // ohne Hof, und der Felskiel wurde nach unten immer dunkler statt heller,
  // obwohl die Insel frei im hellen Himmel hängt.
  //
  // Deshalb wird hier nicht nachjustiert, sondern von vorne aufgebaut. Der
  // erste Schritt ist, das globale Hemisphärenlicht **inselintern**
  // zurückzunehmen. Das ist derselbe Kniff, den die Dojo-Umgebung schon
  // benutzt, und er wirkt nur, solange diese Gruppe sichtbar ist: three sammelt
  // Lichter unter unsichtbaren Elternteilen nicht ein. Karten, Whiteboard,
  // Zonen und Wrist-Menü sind davon nicht betroffen – die benutzen
  // ausnahmslos MeshBasicMaterial und werden gar nicht beleuchtet.
  const hemiKomp = new THREE.HemisphereLight(0xffffff, 0x334455, -1.4);
  hemiKomp.name = 'global-hemi-compensation';
  group.add(hemiKomp);

  // Sonnenstand. EINE Quelle für Sprite, Sonnenhof im Himmel, gerichtetes Licht
  // und Schattenrichtung – vorher stand die sichtbare Sonne bei (18, 24, -24)
  // und das Licht kam aus (10, 18, -8), die Schatten hätten also aus einer
  // anderen Richtung kommen müssen als das Leuchten am Himmel.
  const SUN_DIR = new THREE.Vector3(18, 24, -24).normalize();
  const sunPos = SUN_DIR.clone().multiplyScalar(38);

  group.add(
    makeDome(0x3d80c6, 0xdaeef8, 0xc8e4f6, 44, {
      dir: SUN_DIR,
      color: 0x4a3a1c,
      tight: 250,
      broad: 2.2,
    })
  );

  // Sonnenscheibe plus weiter Korona-Schleier. Zwei Sprites, weil ein einzelner
  // Verlauf entweder einen harten Kern oder einen weiten Hof ergibt, nie beides.
  const corona = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,244,214,0.55)', 'rgba(255,226,160,0.20)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  corona.position.copy(sunPos);
  corona.scale.set(30, 30, 1);
  group.add(corona);

  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      // Warmer Kern. Gemessen war die Scheibe über neunzig Pixel hinweg reines
      // (255,255,255) bei Sättigung null – die einzige Lichtquelle des Bildes
      // hatte keine Farbtemperatur.
      map: makeGlowTexture('rgba(255,247,222,1)', 'rgba(255,232,168,0.7)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    })
  );
  sun.position.copy(sunPos);
  sun.scale.set(9, 9, 1);
  group.add(sun);

  // Himmelslicht. Der „Boden" ist hier kein Boden: Unter der Insel liegt heller
  // Himmel, und genau daher kommt das Bounce-Fill, das der Unterseite gefehlt
  // hat. Deshalb ist der untere Ton kühl und keineswegs dunkel.
  const sky = new THREE.HemisphereLight(0xc6e2f4, 0xbcd6ea, 1.35);
  group.add(sky);

  // Sonne: die klar dominierende Quelle. Sie wirft als einzige Schatten.
  const sunlight = new THREE.DirectionalLight(0xfff1d4, 2.5);
  sunlight.position.copy(sunPos);
  group.add(sunlight);
  group.add(sunlight.target);

  // Rückwärtiges Streiflicht gegenüber der Sonne, kühl und schwach: Es zieht
  // eine helle Kante auf die sonnenabgewandte Seite und verhindert, dass
  // Silhouetten im Gegenlicht in eine tote schwarze Fläche kippen.
  const rim = new THREE.DirectionalLight(0xcfe6ff, 0.75);
  rim.position.set(-sunPos.x * 0.9, sunPos.y * 0.35, -sunPos.z * 0.9);
  group.add(rim);

  // Aufhellung von unten: Das Licht des Himmels unter der Insel. Ohne sie wird
  // der Kiel nach unten dunkler, obwohl dort nichts ist, was ihn beschatten
  // könnte.
  const bounce = new THREE.DirectionalLight(0xb6d4ee, 1.9);
  bounce.position.set(-8, -22, 6);
  group.add(bounce);
  // Zweite Aufhellung von unten aus einem anderen Winkel. Mit nur einer Quelle
  // fielen benachbarte Felsfacetten auf denselben Wert - die Unterseite hatte
  // zuletzt nur noch 10 Luminanzstufen Spannweite und war als Form unlesbar.
  const bounce2 = new THREE.DirectionalLight(0x9fc2e0, 0.85);
  bounce2.position.set(16, -18, -12);
  group.add(bounce2);

  // --- Schlagschatten -------------------------------------------------------
  //
  // In keinem der sechs Prüfbilder gab es einen einzigen. Das Gras unter jedem
  // Baum, jedem Findling und jedem Busch hatte exakt denselben Wert wie das
  // Gras daneben – deshalb *stand* nichts, alles *lag auf*.
  //
  // Das Schattenvolumen umfasst bewusst nur die Hauptinsel. Die Mini-Inseln
  // liegen bis zu 26 Einheiten entfernt; sie mit einzuschließen hieße, dieselbe
  // Kartenauflösung über die sechsfache Fläche zu strecken – aus scharfen
  // Baumschatten würden Flecken. Sie sind weit genug weg, dass ihr fehlender
  // Schlagschatten nicht auffällt.
  sunlight.castShadow = true;
  const sh = sunlight.shadow;
  sh.mapSize.set(1024, 1024);
  // Inselradius 5 lokal, Umriss bis 1,3 davon, mal WORLD_SCALE = 4.
  const HALF = 6.6 * WORLD_SCALE;
  sh.camera.left = -HALF;
  sh.camera.right = HALF;
  sh.camera.top = HALF;
  sh.camera.bottom = -HALF;
  // Die Lichtquelle steht 38 lokale Einheiten vom Ursprung entfernt, also 152
  // in Weltkoordinaten; die Insel reicht von dort aus grob 100 bis 200.
  sh.camera.near = 95;
  sh.camera.far = 215;
  // Normal-Bias statt großem Tiefen-Bias: Er verschiebt den Abtastpunkt entlang
  // der Normalen und erzeugt deshalb kein Peter-Panning (den sichtbaren Spalt
  // zwischen Objekt und Schattenansatz).
  sh.bias = -0.0006;
  sh.normalBias = 0.035;
  sh.camera.updateProjectionMatrix();

  // Hauptinsel, auf der der Nutzer steht – mit Blumen, Gras, Fluss und Wasserfall
  const main = buildIsland(rand, {
    radius: 5,
    depth: 8.2,
    trees: 9,
    shadows: true,
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
  // Tiefe je Insel verschieden. Vorher hatten alle fünf dasselbe Verhältnis
  // von Radius zu Tiefe (5 zu 6,4) – und weil die Hauptinsel bei 5 zu 8,2
  // liegt, waren die kleinen im Vergleich flache Scheiben. Fünf gleich
  // proportionierte Scheiben nebeneinander lesen sich als Serienteil.
  const miniConfigs = [
    { angle: 0.6, dist: 14, y: -1.5, scale: 0.35, depth: 8.8 },
    { angle: 2.4, dist: 19, y: 2.0, scale: 0.5, depth: 7.2 },
    { angle: 3.9, dist: 23, y: -3.0, scale: 0.65, depth: 9.6 },
    { angle: 5.2, dist: 16, y: 3.5, scale: 0.3, depth: 7.8 },
    { angle: 1.5, dist: 26, y: -5.5, scale: 0.55, depth: 8.4 },
  ];
  miniConfigs.forEach((cfg, i) => {
    // Geringere Auflösung: Die Mini-Inseln stehen 14–26 m entfernt, dort fällt
    // die halbe Gitterdichte nicht auf, spart aber Dreiecke und Bauzeit.
    const mini = buildIsland(rand, {
      radius: 5,
      depth: cfg.depth,
      trees: 3,
      rocks: 2,
      vines: 5,
      detail: 0.55,
    });
    mini.scale.setScalar(cfg.scale);
    mini.position.set(Math.sin(cfg.angle) * cfg.dist, cfg.y, Math.cos(cfg.angle) * cfg.dist);
    // SCHIEFLAGE. Fünf Inseln, deren Deckel alle exakt waagerecht liegen, sind
    // die auffälligste Regelmäßigkeit am Horizont – nichts, was frei im Raum
    // treibt, richtet sich von selbst nach der Weltachse aus. Der Betrag bleibt
    // klein genug, dass die Grasfläche als Grasfläche liest.
    mini.rotation.set((rand() - 0.5) * 0.30, rand() * TAU, (rand() - 0.5) * 0.30);
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
  // Kein Wolkenkörper darf in einer Mini-Insel stecken. Die mittlere Schicht
  // (y −2 … 3,5, Radius 16 … 32) überlappt die Inselplätze exakt, und in drei
  // von sechs Prüfbildern schnitt eine weiße Ellipse mit harter Kante durch
  // einen grünen Plateaurand. Das liest als Fehler, nicht als Gestaltung.
  const steckInInsel = (x, y, z) =>
    miniConfigs.some(
      (cfg) =>
        Math.abs(y - cfg.y) < 4.5 &&
        Math.hypot(x - Math.sin(cfg.angle) * cfg.dist, z - Math.cos(cfg.angle) * cfg.dist) <
          5.5 + 6 * cfg.scale
    );

  for (const layer of cloudLayers) {
    for (let i = 0; i < layer.count; i++) {
      const cloud = makeCloud(rand, layer.size, SUN_DIR);
      let a = 0;
      let r = 0;
      let y = 0;
      for (let versuch = 0; versuch < 14; versuch++) {
        a = rand() * Math.PI * 2;
        r = layer.rMin + rand() * (layer.rMax - layer.rMin);
        y = layer.yMin + rand() * (layer.yMax - layer.yMin);
        if (!steckInInsel(Math.cos(a) * r, y, Math.sin(a) * r)) break;
      }
      cloud.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      cloud.rotation.y = rand() * Math.PI * 2;
      // GRÖSSENSTAFFELUNG. Gemessen hatte der Himmel nach dem Wolkenumbau zehn
      // Ballen zwischen 1129 und 3672 Pixeln – Faktor 3,3, also praktisch alle
      // gleich groß. Der Stand davor hatte einen Faktor von 18. Die Struktur
      // INNERHALB der Wolke war besser geworden, die Verteilung ZWISCHEN den
      // Wolken schlechter: keine Heldenwolke, keine Schleier, nur Mittelmaß.
      // Dieselbe Regel wie überall sonst – eine Großform, zwei mittlere, viele
      // kleine.
      const rang = rand();
      if (rang > 0.86) {
        const k = 1.7 + rand() * 0.7;
        cloud.scale.set(k, k * 0.85, k);
      } else if (rang < 0.38) {
        const k = 0.5 + rand() * 0.35;
        cloud.scale.set(k * 2.0, k * 0.28, k * 1.5);
      } else {
        const k = 0.7 + rand() * 0.5;
        cloud.scale.set(k, k, k);
      }
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
  group.scale.setScalar(WORLD_SCALE);

  // Leichter Tiefennebel (fern), damit ferne Inseln/Wolken sanft ausblenden –
  // Karten in Reichweite bleiben unberührt. Die Distanzen sind Weltkoordinaten
  // und müssen den Maßstab mitgehen, sonst versinkt die Insel im Nebel.
  // Gemessen war die Tiefenstaffelung wirkungslos: Der nahe Findling lag bei
  // L=106,8, der Fels der fernen Mini-Insel bei L=105,0 – 1,8 Stufen Unterschied
  // über zig Meter. Der Grund war die Reichweite: Bei `near = 10 * WORLD_SCALE`
  // beginnt der Dunst erst 40 m vor der Kamera, und dort ist der interessante
  // Teil der Szene längst zu Ende. Die nahen Mini-Inseln stehen 48 m entfernt
  // und bekamen dadurch 6 % Dunst. Jetzt setzt er bei 20 m an; die Hauptinsel,
  // auf der der Nutzer steht und auf der die Karten liegen, bleibt mit unter
  // 25 m Abstand nahezu unberührt.
  //
  // Nachgemessen: Bei `far = 34 * WORLD_SCALE` blieb der Unterschied zwischen
  // nahem Findling und ferner Mini-Insel bei 2 Luminanzstufen. Der Grund ist
  // `vFogDepth = -mvPosition.z` – der Nebel rechnet mit der Tiefe ENTLANG der
  // Blickachse, nicht mit dem Abstand. Eine Insel, die 46° seitlich steht, hat
  // bei 82 m Abstand nur 57 m Tiefe und verliert damit ein Drittel des Dunstes.
  // Die Reichweite ist ein Kompromiss: Stärker gesetzt löste sich die
  // Hauptinsel in der Totale (Kamera 57 m entfernt) selbst in Milch auf.
  const fog = new THREE.Fog(0xb2d6ea, 6 * WORLD_SCALE, 32 * WORLD_SCALE);

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
    background: new THREE.Color(0x9fc6e2),
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
      _windClock.value = time;
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

// --- Das Sandbett -----------------------------------------------------------
//
// Der Kiesgarten ist mit 1256 m² die mit Abstand größte Fläche der Umgebung
// und füllt in vier der sechs Prüfansichten mehr als die Hälfte des Bildes.
// Was hier nicht trägt, trägt nirgends.
//
// **Warum die aufgemalte Harkspur weg musste.** Sie stand als Kreisbögen in
// einer 1024er-Karte, die einmal über die ganze Scheibe gespannt ist: ein
// Texel deckt 3,9 cm ab. Der Rillenabstand lag deshalb bei 86 cm — nicht weil
// das ein plausibler Abstand für eine Harke wäre (der liegt bei 20 bis 25 cm),
// sondern weil ein kleinerer in dieser Auflösung nicht mehr abtastbar gewesen
// wäre. Das Ergebnis las sich als Dünung, nicht als geharkter Kies. Dieselbe
// Auflösungsgrenze machte aus der Körnung, die in Vierergruppen von Texeln
// gewürfelt wurde, ein Karo von 15,6 cm Kantenlänge — im Bild als rechteckiges
// Muster sichtbar und damit ein Programmierer-Tell erster Güte.
//
// Eine höhere Auflösung ist nicht der Ausweg: Für 22-cm-Rillen mit einer
// brauchbaren Flanke bräuchte man rund 8000² Texel, also gut 350 MB. Das
// Budget für **alle** Texturen sind 60 MB.
//
// Deshalb ist die Aufgabe aufgeteilt, jede Frequenz auf den Träger, der sie
// billig kann:
//
//   * **grob** (Meter bis Zehnermeter) — eine 512er-Farbkarte über die ganze
//     Scheibe: Flecken aus gröberem und feinerem Kies, das Ausbleichen zum
//     Rand. 7,8 cm je Texel, aber es stehen nur tiefe Frequenzen darin, also
//     sieht man die Auflösung nicht.
//   * **mittel** (die Harkspur, 22 cm) — **rechnerisch im Shader**, aus der
//     Weltposition. Eine Rille ist damit in jeder Entfernung gleich scharf,
//     kostet kein Byte Speicher, und — der eigentliche Gewinn — sie kann sich
//     an `fwidth` ausblenden, sobald eine Periode auf weniger als zwei Pixel
//     fällt. Genau das ist die Unterabtastung, die auf der Insel drei
//     Durchläufe gekostet hat.
//   * **fein** (Korn, 1 bis 3 mm) — eine kachelnde 256er-Normal-Map mit
//     **reinem Rauschen**, 0,32 m je Kachel. Reines Rauschen wiederholt sich
//     unauffällig; die Begründung steht ausführlich bei `cliffMaps()` in
//     src/dojo/stonework.js.
//
// Speicher: 512² Farbe + 256² Korn = 1,4 + 0,35 MB gegen vorher zweimal 1024²
// = 11,2 MB.

const SAND_RADIUS = 20;

// Kachelnde Kornkarte: Körner **setzen**, nicht Rauschen rechnen.
//
// **Der erste Anlauf war ein Wertrauschen auf einem quadratischen Gitter**, und
// genau das sah man: In der Vergrößerung des Vordergrunds (e-sand, 6-fach bei
// 500|640) lag ein diagonales Karomuster über dem Sand — die Interpolation
// zwischen den Gitterzellen hat eine Vorzugsrichtung, und bei vier Pixeln je
// Zelle steht sie im Bild. Ein Rauschen, dem man das Gitter ansieht, ist
// derselbe Programmierer-Tell wie eine gekachelte Textur, der man die Kachel
// ansieht.
//
// Körner sind keine Frequenz, sondern Objekte. Sie werden deshalb einzeln
// gesetzt: runde Tupfen an zufälligen Stellen, jeder auch um ±Kachelbreite
// versetzt gezeichnet, damit die Karte nahtlos bleibt. Das Ergebnis hat keine
// Vorzugsrichtung, weil es kein Gitter gibt.
function kornCanvas(size, rand) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  const tupfen = (x, y, r, hell) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.round(128 + hell * 127);
    g.addColorStop(0, `rgba(${v},${v},${v},0.85)`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Alles, was näher als der eigene Radius am Rand liegt, wird zusätzlich auf
  // der Gegenseite gezeichnet – sonst reißt die Kachel an der Naht auf.
  const setze = (x, y, r, hell) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        if (Math.abs(x + dx - size / 2) > size / 2 + r) continue;
        if (Math.abs(y + dy - size / 2) > size / 2 + r) continue;
        tupfen(x + dx, y + dy, r, hell);
      }
    }
  };

  // Grobkorn: einzelne Kiesel, die aus der Fläche stehen.
  for (let i = 0; i < 220; i++) {
    setze(rand() * size, rand() * size, 3.5 + rand() * 5.5, 0.35 + rand() * 0.45);
  }
  // Feinkorn: die Masse. Deutlich mehr und deutlich kleiner.
  for (let i = 0; i < 2600; i++) {
    setze(rand() * size, rand() * size, 1.1 + rand() * 1.9, (rand() - 0.45) * 0.9);
  }
  return ctx.getImageData(0, 0, size, size).data;
}

let _sandMaps = null;
function sandMaps() {
  if (_sandMaps) return _sandMaps;

  // --- Farbe, grob (512², einmal über die 40-m-Scheibe) ---------------------
  const fSize = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = fSize;
  const ctx = canvas.getContext('2d');
  const bild = ctx.createImageData(fSize, fSize);
  for (let y = 0; y < fSize; y++) {
    for (let x = 0; x < fSize; x++) {
      const i = y * fSize + x;
      // Weltkoordinate dieses Texels, normiert auf den Scheibenradius
      const nx = (x / fSize) * 2 - 1;
      const nz = (y / fSize) * 2 - 1;
      const rad = Math.min(1, Math.hypot(nx, nz));

      // Flecken aus gröberem und feinerem Kies. Zwei Frequenzen: große Zonen
      // (der Kies wurde in Fuhren aufgeschüttet) und kleinere Wolken darin.
      const zone = fbm2(nx * 2.1 + 11, nz * 2.1 - 7);
      const wolke = fbm2(nx * 7.4 - 3, nz * 7.4 + 5);
      const fleck = 1 + zone * 0.16 + wolke * 0.075;

      // **Ausbleichen zum Rand.** Der Kies vor den Steingruppen wird täglich
      // geharkt und dabei umgewälzt, der Rand liegt jahrelang in der Sonne:
      // heller, blasser, eine Spur kühler. Der Verlauf setzt erst bei 55 % des
      // Radius ein, damit die Mitte satt bleibt.
      const bleich = smoothstep(0.55, 1.0, rad);
      // Dazu ein warmer Streiflichtverlauf über die Diagonale wie zuvor: Die
      // Sonne steht links hinten, die ihr zugewandte Hälfte ist wärmer.
      const diag = (nx - nz) * 0.5;

      const grund = [231, 212, 176];
      const blass = [236, 226, 205];
      const r4 = i * 4;
      for (let k = 0; k < 3; k++) {
        const basis = grund[k] * (1 - bleich) + blass[k] * bleich;
        const warm = 1 + diag * (k === 0 ? 0.035 : k === 1 ? 0.012 : -0.03);
        bild.data[r4 + k] = Math.max(0, Math.min(255, basis * fleck * warm));
      }
      bild.data[r4 + 3] = 255;
    }
  }
  ctx.putImageData(bild, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 4;

  // --- Korn, fein (256², kachelnd) ------------------------------------------
  //
  // 2600 feine Körner und 220 grobe Kiesel je Kachel von 32 cm. Das grobe
  // Korn ist das, was aus zwei Metern noch als Kies lesbar ist; das feine ist
  // die Masse dazwischen.
  const kSize = 256;
  const korn = kornCanvas(kSize, mulberry32(53177));
  const { normalMap: grainMap } = heightToMaps({
    size: kSize,
    strength: 1.5,
    anisotropy: 8,
    height: (x, y) => korn[(y * kSize + x) * 4] / 255,
  });
  grainMap.wrapS = grainMap.wrapT = THREE.RepeatWrapping;
  // **0,7 m je Kachel, nicht 0,32.** Mit der kleineren Kachel lag ein Texel bei
  // 1,25 mm und das Grobkorn bei 3 bis 9 mm — physikalisch richtig für Kies und
  // im Bild trotzdem nicht vorhanden: Aus drei Metern löst ein Pixel gut 3,7 mm
  // auf, die Karte wird also längst aus einer Mipmap-Stufe gelesen, in der das
  // Korn wegmittelt ist. Sichtbar ist auf diese Entfernung nur, was gröber als
  // etwa einen Zentimeter ist. Mit 0,7 m je Kachel liegt das Grobkorn bei 1 bis
  // 2,5 cm und steht im Bild.
  const kachelnProScheibe = (SAND_RADIUS * 2) / 0.7;
  grainMap.repeat.set(kachelnProScheibe, kachelnProScheibe);

  _sandMaps = { map, grainMap };
  return _sandMaps;
}

// Das Sandmaterial.
//
// Die Harkspur entsteht aus einem **Potentialfeld** φ(x,z): Die Rillen liegen
// dort, wo φ ein Vielfaches des Rillenabstands ist. Für gerade Züge ist φ der
// Abstand zu einer Geraden, für konzentrische Ringe der Abstand zu einem
// Mittelpunkt. Weil beides dieselbe Größe ist, lässt sich zwischen ihnen
// umschalten, indem man in der Nähe einer Insel deren Ringfeld nimmt und
// draußen das gerade — genau so, wie ein Gärtner harkt: ein Band von Ringen um
// jede Steingruppe, gerade Züge im offenen Feld, und dazwischen eine sichtbare
// Naht, wo die Züge aufeinandertreffen.
//
// Diese Naht ist kein Fehler, sondern das Kennzeichen einer gestalteten
// Fläche. Sie wird nur um ein paar Zentimeter geglättet, damit der
// Phasensprung nicht als Bruchkante steht.
function sandMaterial() {
  const k = sandMaps();
  const uniforms = {
    // xz Mittelpunkt, z Innenradius des Rings, w Breite des Ringbandes
    uSandRinge: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    // xz Mittelpunkt, z Radius, w Stärke – Feuchtezonen an Moos und Teich
    uSandFeucht: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
    uSandGerade: { value: new THREE.Vector2(Math.cos(0.42), Math.sin(0.42)) },
    uSandTeilung: { value: 0.225 },
    uSandTiefe: { value: 0.026 },
  };

  const material = new THREE.MeshStandardMaterial({
    map: k.map,
    normalMap: k.grainMap,
    // Das Korn ist eine Andeutung, kein Geröll.
    normalScale: new THREE.Vector2(1.15, 1.15),
    // Trockener Kies ist stumpf. Die Kämme sind eine Spur glatter als der
    // Rillengrund – das steht im Shader, eine eigene Rauheitskarte wäre eine
    // zweite Abtastung je Pixel auf der größten Fläche der Szene.
    roughness: 0.95,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n varying vec3 vSandWelt;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vSandWelt = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vSandWelt;
         uniform vec4 uSandRinge[4];
         uniform vec4 uSandFeucht[6];
         uniform vec2 uSandGerade;
         uniform float uSandTeilung;
         uniform float uSandTiefe;
         // Ergebnisse von sandRelief(): Steigung in Weltkoordinaten (x,z),
         // Kammhöhe 0…1 und Feuchte 0…1.
         vec2 gSandSteigung;
         float gSandKamm;
         float gSandFeucht;

         void sandRelief(vec2 p) {
           // --- Potentialfeld: gerade Züge, um die Inseln herum Ringe --------
           float phi = dot(p, uSandGerade);
           vec2 grad = uSandGerade;
           // **Eine Harke wird von Hand gezogen.** Perfekt parallele Geraden
           // und perfekte Kreise sind der sicherste Weg, eine Fläche als
           // gerechnet zu verraten. Zwei langwellige Terme verbiegen das
           // Potential um wenige Zentimeter – zu wenig, um als Welle zu lesen,
           // genug, damit keine zwei Züge deckungsgleich laufen. Der Beitrag
           // zur Steigung ist gegenüber dem Rillenprofil vernachlässigbar und
           // wird deshalb nicht mitgeführt.
           phi += 0.055 * sin(p.x * 0.41 + p.y * 0.27) + 0.028 * sin(p.x * 1.13 - p.y * 0.94);
           // Naht: wo ein Ringband endet, wird die Amplitude kurz
           // heruntergenommen statt die Phase springen zu lassen.
           float naht = 1.0;
           for (int i = 0; i < 4; i++) {
             vec2 d = p - uSandRinge[i].xy;
             float r = length(d) + 1e-4;
             float f = r - uSandRinge[i].z;
             if (f > 0.0 && f < uSandRinge[i].w) {
               phi = f;
               grad = d / r;
             }
             naht *= smoothstep(0.0, 0.09, abs(f - uSandRinge[i].w));
             // Innerhalb der Insel selbst wird nicht geharkt.
             naht *= smoothstep(-0.12, 0.02, f);
           }

           // --- Feuchte an Moos und Teich ------------------------------------
           float feucht = 0.0;
           for (int i = 0; i < 6; i++) {
             vec2 d = p - uSandFeucht[i].xy;
             feucht = max(
               feucht,
               uSandFeucht[i].w * (1.0 - smoothstep(uSandFeucht[i].z, uSandFeucht[i].z + 0.75, length(d)))
             );
           }
           gSandFeucht = feucht;

           // --- Rillenprofil --------------------------------------------------
           float s = phi / uSandTeilung;
           // **Der Ausblendeterm, ohne den das Bild flimmert.** Fällt eine
           // Periode unter etwa zwei Pixel, kann sie nicht mehr abgetastet
           // werden; stehen bleibt Moiré. Also wird die Rille dort flach.
           float w = fwidth(s);
           float scharf = 1.0 - smoothstep(0.22, 0.55, w);

           float h = 0.5 - 0.5 * cos(6.2831853 * s);
           float kamm = h * h * (3.0 - 2.0 * h);      // flacher Kamm, runde Rille
           float dKamm = 6.0 * h * (1.0 - h) * 3.1415927 * sin(6.2831853 * s);

           // Zum Rand hin wird seltener geharkt: Die Spur läuft aus.
           float rand = 1.0 - smoothstep(11.0, 17.0, length(p));
           // Der Druck auf der Harke ist nicht konstant. Zwei langwellige
           // Terme lassen die Rille stellenweise tief und stellenweise fast
           // verlaufen — die mittlere Frequenz, die zwischen Korn (Millimeter)
           // und Zug (Zentimeter) sonst fehlt.
           float druck = 0.98 + 0.30 * sin(p.x * 0.83 + p.y * 0.61) + 0.18 * sin(p.x * 0.29 - p.y * 0.44);
           // Am Moos und am Wasser hört die Harke auf.
           float amp = scharf * naht * rand * druck * (1.0 - feucht * 0.85);

           gSandSteigung = grad * (uSandTiefe / uSandTeilung) * dKamm * amp;
           gSandKamm = mix(0.5, kamm, amp);
         }`
      )
      .replace(
        '#include <map_fragment>',
        `sandRelief(vSandWelt.xz);
         #include <map_fragment>
         {
           // Der Rillengrund sieht weniger Himmel und liegt im Eigenschatten
           // der Flanke: dunkler und eine Spur kühler. Der Kamm bekommt die
           // Lichtspitze.
           diffuseColor.rgb *= mix(vec3(0.715, 0.71, 0.74), vec3(1.11, 1.10, 1.06), gSandKamm);
           // Feuchter Kies ist dunkler und gesättigter – das ist der Übergang
           // zum Moos und zum Teichufer.
           diffuseColor.rgb *= mix(vec3(1.0), vec3(0.63, 0.66, 0.55), gSandFeucht);
         }`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         // Der Kamm ist glattgestrichen, im Rillengrund liegt loses Korn.
         roughnessFactor *= mix(1.0, 0.86, gSandKamm);`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         // Die Steigung des Höhenfelds steht in Weltkoordinaten, \`normal\` an
         // dieser Stelle im Blickraum. viewMatrix gehört zum festen Vorspann
         // jedes three-Fragmentshaders.
         normal = normalize(normal - mat3(viewMatrix) * vec3(gSandSteigung.x, 0.0, gSandSteigung.y));`
      );
  };
  // Ohne eigenen Schlüssel teilt sich dieses Material ein kompiliertes Programm
  // mit jedem anderen MeshStandardMaterial gleicher Bauart – und bekäme dessen
  // Shader ohne die Harkspur.
  material.customProgramCacheKey = () => 'zen-sand';
  material.userData.sandUniforms = uniforms;
  return material;
}

// Das Bett selbst: eine Scheibe mit radialen Ringen.
//
// `CircleGeometry(20, 72)` hätte 72 Dreiecke und einen einzigen Mittelpunkt —
// für eine Fläche mit Nebel und Scheitelfarben zu grob, und ihr Rand wäre ein
// sichtbares 72-Eck. Die Ringe stehen außen weiter auseinander als innen: Wo
// man steht, zählt jeder Zentimeter, am Rand nimmt der Nebel ohnehin alles.
function makeSandBett(radius, ringe = 26, segmente = 128) {
  const pos = [];
  const uv = [];
  const idx = [];
  pos.push(0, 0, 0);
  uv.push(0.5, 0.5);
  for (let j = 1; j <= ringe; j++) {
    const r = radius * Math.pow(j / ringe, 1.45);
    for (let i = 0; i < segmente; i++) {
      const a = (i / segmente) * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      pos.push(x, 0, z);
      uv.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
    }
  }
  const ring = (j, i) => 1 + (j - 1) * segmente + (i % segmente);
  for (let i = 0; i < segmente; i++) idx.push(0, ring(1, i + 1), ring(1, i));
  for (let j = 1; j < ringe; j++) {
    for (let i = 0; i < segmente; i++) {
      const a = ring(j, i);
      const b = ring(j, i + 1);
      const c = ring(j + 1, i + 1);
      const d = ring(j + 1, i);
      idx.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Der Saum jenseits des Kiesbetts.
//
// **Das Kiesbett endet bei 20 m, und der Nebel fängt bei 20 m an.** Damit
// bekommt genau die Kante, an der die Welt aufhört, null Dunst und steht als
// scharfe Linie gegen den Himmel — in der Totale die auffälligste Schwäche des
// Bildes. Der Saum ändert weder den Kiesradius noch die Nebeldistanzen; er legt
// nur Grund dorthin, wo bisher Himmel war, und überlässt ihn dem Nebel.
function makeSandSaum() {
  const geo = new THREE.RingGeometry(SAND_RADIUS - 0.4, 52, 128, 8);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const farben = new Float32Array(pos.count * 3);
  const nah = new THREE.Color(0xd9cba9); // Kiesfarbe am Innenrand
  // **Kein Grün.** Der erste Anlauf ließ den Saum in stumpfes Grün laufen —
  // gedacht als Bewuchs außerhalb des Gartens, im Bild ein grüner Streifen
  // genau auf der Horizontlinie. Der Nebel dieser Umgebung ist warm; der Saum
  // muss ihm entgegenlaufen, nicht quer dazu.
  const fern = new THREE.Color(0xd8bc93);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    // Erst in stumpfes Grün (Bewuchs außerhalb des Gartens), dann in die
    // Nebelfarbe selbst – ab 46 m ist der Nebel gesättigt, dort darf keine
    // andere Farbe mehr durchkommen.
    c.copy(nah).lerp(fern, smoothstep(SAND_RADIUS, SAND_RADIUS + 12, r));
    // Flecken, damit der Ring kein Farbverlauf ist
    const f = 0.92 + hashNoise(pos.getX(i) * 0.14, 0, pos.getZ(i) * 0.14) * 0.16;
    farben[i * 3] = c.r * f;
    farben[i * 3 + 1] = c.g * f;
    farben[i * 3 + 2] = c.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, color: 0xffffff })
  );
  mesh.name = 'zen-saum';
  mesh.position.y = -0.06;
  return mesh;
}

// Kachelnde Schleierwolken-Karte.
//
// Gezeichnet statt gerechnet, und zwar als **gestreckte Tupfen**: Ein Zirrus
// ist ein in die Länge gezogener Fetzen, kein isotroper Fleck. Jeder Tupfen
// wird an den Rändern zusätzlich versetzt gezeichnet, damit die Kachel nahtlos
// bleibt — dieselbe Umlauftechnik wie bei der Kornkarte des Sandes.
let _wolkenKarte = null;
function wolkenKarte(size = 256) {
  if (_wolkenKarte) return _wolkenKarte;
  const rand = mulberry32(90210);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  const fetzen = (x, y, rx, ry, a) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rand() - 0.5) * 0.5);
    ctx.scale(rx, ry);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  ctx.globalCompositeOperation = 'lighter';
  // Drei Größenordnungen: Bänke, Fetzen darin, Fasern an ihren Rändern.
  for (const [n, rxMin, rxSpan, verh, alpha] of [
    [14, size * 0.16, size * 0.22, 0.16, 0.5],
    [46, size * 0.06, size * 0.1, 0.2, 0.34],
    [150, size * 0.015, size * 0.04, 0.28, 0.22],
  ]) {
    for (let i = 0; i < n; i++) {
      const rx = rxMin + rand() * rxSpan;
      const ry = rx * verh * (0.6 + rand() * 0.9);
      const x = rand() * size;
      const y = rand() * size;
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          if (Math.abs(x + dx - size / 2) > size / 2 + rx) continue;
          if (Math.abs(y + dy - size / 2) > size / 2 + ry) continue;
          fetzen(x + dx, y + dy, rx, ry, alpha);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  _wolkenKarte = t;
  return t;
}

// **Der Sonnenstand des Zen-Gartens, an einer Stelle.**
//
// Vorher stand er bei [−12 | 9 | −6], also 34° über dem Horizont. Das ist
// später Vormittag, nicht später Nachmittag: Bei 34° fällt das Licht so steil
// auf die waagerechte Kiesfläche, dass eine 1,3 cm tiefe Harkrille kaum eine
// verschattete Flanke bekommt, und die Schlagschatten sind kürzer als die
// Objekte breit sind. Jetzt 19,4° — Streiflicht über den Kies, Schatten fast
// dreimal so lang wie das Objekt hoch ist.
//
// Alles, was die Sonne braucht, liest hier: das Licht selbst, die
// Schattenkamera, die Sonnenscheibe am Himmel, die Himmelsbeschreibung für die
// Spiegelungskarte des Wassers — und `mossPatina()`, das sonst die Sonne des
// Dojos nähme und die Wetterseite jedes Steins auf die falsche Seite legte.
const ZEN_SONNE = [-14, 5.5, -7];
// Richtung, in die das Licht **läuft** (vom Stand zum Ursprung).
const ZEN_SUN = (() => {
  const len = Math.hypot(...ZEN_SONNE);
  return ZEN_SONNE.map((v) => -v / len);
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
    // **Lichtspitzen.** Mit Rauheit 1,0 hat kein Stein im ganzen Bildsatz einen
    // Glanzpunkt: gemessen lag der Anteil über L=230 bei 0,00 bis 0,02 %, und
    // der lag auf einem Partikel, nie auf einer Fläche. Ein Findling im
    // Streiflicht einer tief stehenden Sonne hat auf seinen oberen Rundungen
    // sehr wohl einen breiten, stumpfen Glanz. Der Wert skaliert die
    // Rauheitskarte, die Streuung zwischen matt und glatt bleibt also erhalten.
    _zenGranit.roughness = 0.76;
    // Ein schmaler Himmelssaum an der Silhouettenkante. Kleiner Betrag, hoher
    // Exponent: Auf einer flach schattierten Fläche wird ein weicher
    // Fresnel-Saum sonst zur **Flächen**helligkeit statt zur Kante, und alles
    // sieht bereift aus.
    addSkyRim(_zenGranit, { color: 0xbcd6f0, strength: 0.2, power: 4.2 });
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
  // Die fünf Steinteile stehen fest aufeinander – ein Mesh. Der Lichtkasten
  // bleibt eigenständig, er hat ein leuchtendes Material.
  const steine = [];
  const base = new THREE.Mesh(
    steinTeil(new THREE.CylinderGeometry(0.18, 0.22, 0.12, 8), 0.06, 11),
    stoneMat
  );
  base.position.y = 0.06;
  steine.push(base);
  const post = new THREE.Mesh(
    steinTeil(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 8), 0.33, 12),
    stoneMat
  );
  post.position.y = 0.33;
  steine.push(post);
  const platform = new THREE.Mesh(
    steinTeil(new THREE.CylinderGeometry(0.16, 0.14, 0.06, 8), 0.57, 13),
    stoneMat
  );
  platform.position.y = 0.57;
  steine.push(platform);
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
  steine.push(roof);
  const finial = new THREE.Mesh(
    steinTeil(new THREE.SphereGeometry(0.045, 8, 6), 0.96, 15),
    stoneMat
  );
  finial.position.y = 0.96;
  steine.push(finial);
  group.add(...verschmelzeObjekte(steine, 'zen-laterne-stein'));
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
  // Fünf Teile, ein Material, nichts davon bewegt sich gegeneinander: Das Tor
  // ist ein Stück Holzwerk und wird auch als eines gezeichnet.
  const teile = [];
  for (const sx of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, h, 12), mat);
    pillar.position.set(sx * span * 0.5, h / 2, 0);
    teile.push(pillar);
  }
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.1, 0.3, 0.42), mat);
  topBeam.position.y = h - 0.05;
  topBeam.rotation.z = 0.02;
  teile.push(topBeam);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(span + 0.2, 0.22, 0.34), mat);
  lintel.position.y = h - 0.6;
  teile.push(lintel);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.3), mat);
  ridge.position.y = h - 0.32;
  teile.push(ridge);
  group.add(...verschmelzeObjekte(teile, 'zen-torii'));
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

  // Der Kontaktschatten des Hains wird **nicht** hier eingehängt, sondern
  // zurückgegeben: Die Umgebung sammelt alle Schatten ein und zeichnet sie in
  // einem Draw-Call (siehe `verschmelzeSchatten`). Dafür muss er in
  // Weltkoordinaten stehen, nicht relativ zum Hain.
  const shadow = makeBlobShadow(0.8, 0.45, 0.02);
  shadow.position.set(cx, 0.02, cz);
  return {
    group,
    shadow,
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
// Blüten- und Kernmaterial der Lotusblüten **modulweit**, nicht je Blüte. Elf
// Kegel und eine Kugel je Blüte mal drei Blüten waren sechsunddreißig
// Draw-Calls für ein Detail von zehn Zentimetern; mit geteiltem Material lassen
// sich alle drei Blüten zu zwei Meshes verschmelzen.
const LOTUS_BLATT_MAT = new THREE.MeshStandardMaterial({ color: 0xff9dc2, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
const LOTUS_KERN_MAT = new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.6 });
function makeLilyPad(rand) {
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.16 + rand() * 0.1, 20, 0.5, Math.PI * 1.85), LILY_MAT);
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = rand() * Math.PI * 2;
  return pad;
}
function makeLotus() {
  const g = new THREE.Group();
  const petalMat = LOTUS_BLATT_MAT;
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
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), LOTUS_KERN_MAT);
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
    // **Durchsichtig plus doppelseitig kostet in three zwei Draw-Calls**, nicht
    // einen: `renderObject` zeichnet erst die Rück-, dann die Vorderseiten,
    // damit sich gekrümmte Hüllen richtig überlagern. Eine Flosse ist aber eine
    // ebene Fläche – sie überlagert sich nie mit sich selbst, die zweite
    // Zeichnung bringt kein Pixel Unterschied. Gemessen waren das zehn Flossen
    // mal zwei Fische mal zwei Durchgänge: zwanzig Calls für zehn Flächen.
    forceSinglePass: true,
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

  // Die vier festen Flossen bewegen sich nicht gegeneinander – nur der Schwanz
  // wedelt. Sie werden deshalb zu einem Mesh verschmolzen; vier Flächen von je
  // fünf Zentimetern rechtfertigen keine vier Draw-Calls.
  const flossen = [];

  // Rückenflosse
  const dorsal = makeKoiFin(
    [[0, 0], [0.05, 0.045], [0.11, 0.05], [0.15, 0.01], [0.08, 0]],
    finMat
  );
  dorsal.position.set(0, 0.048, 0.03);
  flossen.push(dorsal);

  // Afterflosse
  const anal = makeKoiFin([[0, 0], [0.04, -0.03], [0.08, -0.035], [0.1, -0.005]], finMat);
  anal.position.set(0, -0.042, -0.05);
  flossen.push(anal);

  // Brustflossen, leicht nach hinten und unten gestellt
  for (const side of [-1, 1]) {
    const pec = makeKoiFin([[0, 0], [0.05, -0.02], [0.09, -0.045], [0.07, 0]], finMat);
    pec.position.set(side * 0.028, -0.012, 0.06);
    // Um die Längsachse gekippt, damit die Flosse seitlich absteht statt
    // senkrecht wie ein zweites Segel am Bauch zu stehen
    pec.rotation.z = side * 1.05;
    flossen.push(pec);
  }
  koi.add(...verschmelzeObjekte(flossen, 'koi-flossen'));

  // Augen
  const eyeGeo = new THREE.SphereGeometry(0.0085, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x16110d, roughness: 0.25 });
  const augen = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.024, 0.012, L / 2 - 0.055);
    augen.push(eye);
  }
  koi.add(...verschmelzeObjekte(augen, 'koi-augen'));

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
  // Horizontfarbe **gleich** der Nebelfarbe und ein weiter Radius. Beides
  // gehört zusammen: Der Saum (siehe `makeSandSaum`) läuft bis dorthin, wo der
  // Nebel gesättigt ist; träfe dort ein anders getönter Himmel auf den Boden,
  // stünde die Horizontlinie wieder als Kante im Bild – nur eben in Creme
  // statt in Sand.
  group.add(
    makeDome(0x8fb6d8, 0xecd9bb, 0xe4cba2, 70, {
      dir: new THREE.Vector3(...ZEN_SONNE),
      // Der Hof wird **auf** die Himmelsfarbe addiert, ist also ein Zuschlag
      // und kein Farbton. Warm und zurückhaltend: Ein tief stehender Hof, der
      // den halben Himmel aufhellt, frisst die Tonwertstaffelung, die der
      // Nebel darunter aufbauen soll.
      color: 0x5a4020,
      tight: 220,
      broad: 2.4,
    },
    {
      map: wolkenKarte(),
      // Der Schatten der Wolke ist blaugrau, ihre besonnte Seite golden. Beides
      // gehört in die Tonart der Umgebung: warm mit kühlem Gegenpol.
      color: 0xc9bfc4,
      lit: 0xffe3b4,
      strength: 0.85,
      // Ganzzahliger Umlauf, sonst steht eine senkrechte Naht am Himmel.
      scale: [4, 3.1],
      // Kein Zirrus unter 3° und keiner über 45°: unten frisst ihn der Dunst,
      // oben verrät die Azimut-Abbildung die Kachel.
      band: [0.008, 0.055, 0.42, 0.92],
    })
  );

  // --- Licht ----------------------------------------------------------------
  //
  // **Der Garten hatte kein Licht, sondern Umgebungshelligkeit.** Gemessen: der
  // Sand direkt am Fuß eines Trittsteins 212,8, der Sand einen Meter daneben
  // 212,9 — ein Unterschied von 0,1 von 255. Jede Form war ausgeschnitten und
  // aufgeklebt, nichts hatte Gewicht.
  //
  // Drei Quellen sorgten dafür: die Grundleuchte der App mit 1,4, die eigene
  // Hemisphäre mit 1,05 und ein Gegenlicht mit 0,45 — zusammen fast das
  // Dreifache dessen, was die Sonne bei 34° auf einer waagerechten Fläche
  // beitrug. Die Grundleuchte steht jetzt auf 0,35 (`sceneAmbient` unten), die
  // eigene Hemisphäre trägt nur noch den Himmelsanteil, und die Sonne ist die
  // Hauptquelle.
  // **Der Himmel ist kühl, die Sonne ist warm.** Das ist der Kern eines
  // Spätnachmittags und zugleich der billigste Weg zu Tiefe: Die besonnte
  // Fläche und die verschattete unterscheiden sich dann nicht nur in der
  // Helligkeit, sondern im Farbton. Vorher war beides warm, und der Schatten
  // war schlicht ein dunklerer Sand. Die Bodenfarbe der Hemisphäre ist das
  // Rücklicht des Kieses und bleibt warm.
  group.add(new THREE.HemisphereLight(0xbcd2ee, 0xa8875f, 0.85));

  const sun = new THREE.DirectionalLight(0xffd9a0, 3.1);
  sun.position.set(...ZEN_SONNE);
  group.add(sun);

  // --- Schlagschatten -------------------------------------------------------
  //
  // Das Schattenvolumen umfasst 24 m im Quadrat um den Ursprung. Der gestaltete
  // Teil des Gartens liegt innerhalb von 10 m; der längste Schatten ist der des
  // Torii, der bei 19° Sonnenstand gut 9 m weit läuft. Außerhalb des Volumens
  // liefert threes Abfrage „beleuchtet", der Kies bleibt dort also hell — was
  // richtig ist, weil dort nichts steht.
  sun.castShadow = true;
  {
    const sh = sun.shadow;
    sh.mapSize.set(2048, 2048);
    const HALB = 12;
    sh.camera.left = -HALB;
    sh.camera.right = HALB;
    sh.camera.top = HALB;
    sh.camera.bottom = -HALB;
    // Die Quelle steht 16,6 m vom Ursprung; die Szene reicht von dort aus grob
    // 3 bis 33 m.
    sh.camera.near = 2.5;
    sh.camera.far = 34;
    // Normal-Bias statt großem Tiefen-Bias: Er verschiebt den Abtastpunkt
    // entlang der Normalen und erzeugt deshalb kein Peter-Panning – den
    // sichtbaren Spalt zwischen Objekt und Schattenansatz.
    sh.bias = -0.0004;
    // **0,03 war zu viel und hat die flachen Objekte um ihren Schatten
    // gebracht.** Der Normal-Bias verschiebt den Abtastpunkt entlang der
    // Normalen; auf dem Kies zeigt die nach oben. Ein Trittstein ist 6 cm dick
    // und steht 3 cm über dem Sand — bei 3 cm Versatz wird also über ihn
    // hinweg abgetastet, und er wirft nichts. Im Bild sah das aus wie ein
    // vergessener Schattenwerfer, war aber ein Zahlenwert.
    sh.normalBias = 0.008;
    sh.camera.updateProjectionMatrix();
  }

  // Die Sonnenscheibe. **`toneMapped: false` ist hier das Entscheidende:** Ohne
  // das läuft die Scheibe durch dieselbe ACES-Kurve wie alles andere und landet
  // im flachen Ast — gemessen war der Sonnenkern mit L=210,5 dunkler als der
  // Sand davor mit L=214,8. Eine Sonne, die dunkler ist als der Boden, ist
  // keine Lichtquelle, sondern ein Wattebausch. Additiv gemischt, damit sie den
  // Himmel aufhellt statt ihn zu überdecken.
  const sonnenRichtung = new THREE.Vector3(...ZEN_SONNE).normalize();
  // Zwei Sprites, weil ein einzelner Verlauf entweder einen harten Kern oder
  // einen weiten Hof ergibt, nie beides — dieselbe Aufteilung wie bei der
  // Insel. Der erste Anlauf hatte einen Verlauf mit Skalierung 11 auf 38 m
  // Abstand: 16° am Himmel, mit sichtbar hartem Rand. Das war keine Sonne,
  // sondern eine Scheibe.
  for (const [scale, innen, aussen] of [
    [1.9, 'rgba(255,253,246,1)', 'rgba(255,238,200,0.85)'],
    [13.0, 'rgba(255,228,178,0.30)', 'rgba(255,198,132,0.10)'],
  ]) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(innen, aussen),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        // **Ohne das läuft die Scheibe durch dieselbe ACES-Kurve wie alles
        // andere und landet im flachen Ast.** Gemessen war der Sonnenkern mit
        // L=210,5 dunkler als der Sand davor mit L=214,8 — eine Sonne, die
        // dunkler ist als der Boden, ist keine Lichtquelle.
        toneMapped: false,
        fog: false,
      })
    );
    sprite.position.copy(sonnenRichtung).multiplyScalar(38);
    sprite.scale.set(scale, scale, 1);
    group.add(sprite);
  }

  // Warmes Gegenlicht aus der Gegenrichtung, das die Silhouetten von der
  // Schattenseite her ablöst. Schwächer als zuvor: Es soll die Kante zeigen,
  // nicht die Fläche aufhellen.
  const rim = new THREE.DirectionalLight(0xffcf9c, 0.3);
  rim.position.set(15, 3.5, 13);
  group.add(rim);

  // Der Saum liegt unter allem anderen und wird zuerst gezeichnet.
  group.add(makeSandSaum());

  // Das Kiesbett. Radius unverändert 20 m; die Harkspur entsteht jetzt
  // rechnerisch aus der Weltposition, siehe `sandMaterial()`.
  const sandMat = sandMaterial();
  const sand = new THREE.Mesh(makeSandBett(SAND_RADIUS), sandMat);
  sand.name = 'zen-sand';
  sand.position.y = -0.02;
  group.add(sand);

  // Die Ringbänder der Harke. Um jede Steingruppe und um den Teich wird ein
  // Band von konzentrischen Zügen geharkt, außen laufen gerade Züge.
  // (x, z, Innenradius, Breite des Bandes)
  sandMat.userData.sandUniforms.uSandRinge.value[0].set(-3.5, -2.5, 1.15, 2.6);
  sandMat.userData.sandUniforms.uSandRinge.value[1].set(4.0, 1.5, 0.95, 2.1);
  sandMat.userData.sandUniforms.uSandRinge.value[2].set(1.0, -4.5, 1.1, 2.4);
  sandMat.userData.sandUniforms.uSandRinge.value[3].set(3.2, -1.2, 2.35, 3.1);
  const feuchtZonen = sandMat.userData.sandUniforms.uSandFeucht.value;
  // Der Teich ist die stärkste Feuchtequelle; das Ufer bleibt dunkel.
  feuchtZonen[0].set(3.2, -1.2, 2.3, 0.85);
  let feuchtIndex = 1;

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
  // Alle fünf Flecken tragen dasselbe Material und bewegen sich nicht – sie
  // werden nach dem Bauen zu einem Mesh verschmolzen. Gebaut wird trotzdem
  // einzeln, damit die Reihenfolge der Zufallszahlen unangetastet bleibt.
  const moosTeile = [];
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
    moosTeile.push(moss);
    // Der Sand am Moos ist feucht: dunkler, gesättigter, und die Harke hört
    // dort auf. Ohne diesen Übergang liegt das Moos wie ein aufgeklebter
    // grüner Fleck auf trockenem Kies.
    if (feuchtIndex < feuchtZonen.length) {
      feuchtZonen[feuchtIndex++].set(
        moss.position.x,
        moss.position.z,
        mossR * Math.max(moss.scale.x, moss.scale.z) * 0.9,
        0.7
      );
    }
  }
  group.add(...verschmelzeObjekte(moosTeile, 'zen-moos'));

  // Stein-Arrangements (klassisch asymmetrische Gruppen)
  const stoneGroups = [
    { x: -3.5, z: -2.5, n: 3 },
    { x: 4, z: 1.5, n: 2 },
    { x: 1, z: -4.5, n: 3 },
  ];
  // Zwei Sammler für den ganzen Garten: alles aus Zen-Granit in ein Mesh, alle
  // Kontaktschatten in ein zweites. Beide werden erst am Ende eingehängt.
  const findlinge = [];
  const kontaktschatten = [];
  for (const sg of stoneGroups) {
    for (let i = 0; i < sg.n; i++) {
      const size = 0.28 + rand() * 0.45;
      const s = makeZenStone(rand, size, i === 0 ? 0x807a72 : 0x938c83);
      const px = sg.x + (rand() - 0.5) * 0.9;
      const pz = sg.z + (rand() - 0.5) * 0.9;
      s.position.set(px, 0.12 + rand() * 0.1, pz);
      findlinge.push(s);
      // Enger als vor dem Schlagschatten: Der gefälschte Fleck ist jetzt
      // Kontaktverdunklung — die Verschattung des Himmelslichts unmittelbar am
      // Objekt —, nicht mehr der Ersatz für den Schatten selbst.
      const sh = makeBlobShadow(size * 0.95, 0.55);
      sh.position.set(px, 0.015, pz);
      kontaktschatten.push(sh);
    }
  }

  // Trittstein-Pfad. Ein Material für alle sechs, Unterschiede über die
  // Scheitelfarben; Moos sammelt sich am Rand, wo der Fuß nicht hintritt.
  const trittsteine = [];
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
    trittsteine.push(step);
  }
  group.add(...verschmelzeObjekte(trittsteine, 'zen-trittsteine'));

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
    // Derselbe Granit wie die Findlinge, also derselbe Sammler.
    findlinge.push(s);
  }
  group.add(...verschmelzeObjekte(findlinge, 'zen-findlinge'));
  // Seerosenblätter + Lotusblüten auf der Wasseroberfläche
  const seerosen = [];
  for (let i = 0; i < 7; i++) {
    const pad = makeLilyPad(rand);
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.5;
    pad.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.03, pondCenter.z + Math.sin(a) * r);
    seerosen.push(pad);
  }
  group.add(...verschmelzeObjekte(seerosen, 'zen-seerosen'));
  const lotusse = [];
  for (let i = 0; i < 3; i++) {
    const lotus = makeLotus();
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 1.1;
    lotus.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.04, pondCenter.z + Math.sin(a) * r);
    lotusse.push(lotus);
  }
  // Zwei Meshes: Blütenblätter und Kerne haben verschiedene Materialien.
  group.add(...verschmelzeObjekte(lotusse, 'zen-lotus'));
  // Wasser-Ringe: wachsen & blenden aus (dort, wo Koi auftauchen)
  const ripples = [];
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    // Wie bei den Koi-Flossen: Ein Ring ist eine ebene Fläche, der zweite
    // Durchgang für die Rückseiten zeichnet dieselben Pixel noch einmal.
    forceSinglePass: true,
  });
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 28), rippleMat.clone());
    ring.rotation.x = -Math.PI / 2;
    // **Die Ringe standen im Ursprung, nicht im Teich.** `update()` setzt ihre
    // Lage nur im ersten Fünfzigstel ihrer Periode neu; davor — und in jedem
    // eingefrorenen Bild, das nicht zufällig in dieses Fenster fällt — lagen
    // sie bei (0 | 0), also mitten auf dem Kies. Der Prüfer hat sie in
    // `c-torii` als „vier konzentrische Ellipsen konstanter Breite" gefunden,
    // durch die die Harkstreifen ungestört hindurchlaufen, und für ein zweites
    // aufgelegtes Muster gehalten. Es waren Wasserringe auf dem Sand.
    ring.position.set(pondCenter.x, 0.025, pondCenter.z);
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
  const sakuraShadow = makeBlobShadow(0.7, 0.5);
  sakuraShadow.position.set(-4.4, 0.015, 2.5);
  kontaktschatten.push(sakuraShadow);

  // Ahorn (Momiji) als Farbkontrast gegenüber der Sakura
  const maple = makeMaple(rand);
  maple.position.set(4.8, 0, 3.2);
  group.add(maple);
  const mapleShadow = makeBlobShadow(0.55, 0.5);
  mapleShadow.position.set(4.8, 0.015, 3.2);
  kontaktschatten.push(mapleShadow);

  // Bambushain (wiegt in update)
  const bamboo = makeBambooGrove(rand, -6.5, -3.5);
  group.add(bamboo.group);
  kontaktschatten.push(bamboo.shadow);

  // Steinlaterne + Torii (mit Kontaktschatten)
  const lantern = makeLantern();
  lantern.position.set(1.6, 0, -1.8);
  group.add(lantern);
  const lanternShadow = makeBlobShadow(0.26, 0.6);
  lanternShadow.position.set(1.6, 0.015, -1.8);
  kontaktschatten.push(lanternShadow);
  const torii = makeTorii();
  torii.position.set(-2, 0, -9);
  torii.rotation.y = 0.35;
  group.add(torii);
  const toriiShadow = makeBlobShadow(0.85, 0.45);
  toriiShadow.position.set(-2, 0.015, -9);
  toriiShadow.scale.x *= 2; // länglich unter dem Tor
  kontaktschatten.push(toriiShadow);

  // Dreizehn Kontaktschatten, ein Draw-Call. Sie liegen alle flach auf dem
  // Sand, tragen dieselbe Textur und unterscheiden sich nur in Größe, Ort und
  // Deckkraft – Letztere steckt jetzt in der vierten Komponente der
  // Scheitelfarbe statt in dreizehn Materialien.
  group.add(verschmelzeSchatten(kontaktschatten, 'zen-kontaktschatten'));

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
    sun: ZEN_SONNE,
    target: [0, 0, 0],
    sunColor: 0xffd9a0,
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

  // --- Wer wirft, wer empfängt ----------------------------------------------
  //
  // Einmal über den fertigen Baum statt an dreißig Stellen von Hand: Alles, was
  // ein Körper ist, wirft und empfängt. Ausgenommen sind die Flächen, die
  // keiner sind — Himmelskuppel, Kies, Saum, die gefälschten Kontaktschatten,
  // die Wasserfläche und alles, was Sprite oder Punktwolke ist. Der Kies und
  // der Saum empfangen selbstverständlich, sie werfen nur nicht.
  {
    // Der Kies, der Saum und das Moos liegen flach auf dem Boden – sie können
    // nichts beschatten außer sich selbst, kosten in der Schattenkarte aber
    // denselben Zeichenaufruf wie ein Baum.
    // **Streulicht durch das Laub.** Die Hüllkörper der Kronen sind
    // undurchsichtige Blasen; wirft die Krone mit ihnen, fällt ein
    // geschlossener dunkler Fleck auf den Kies. Wirft nur das Blattwerk — die
    // Karten mit Alpha-Test, für die `foliageMaterial()` ein eigenes
    // Tiefenmaterial mitbringt —, entsteht das gesprenkelte Licht unter einem
    // Baum. Die Hüllkörper bleiben sichtbar und verdecken weiterhin die
    // Durchsicht; sie stehen nur nicht mehr in der Schattenkarte.
    const nurEmpfangen = new Set([
      'zen-sand',
      'zen-saum',
      'zen-moos',
      'zen-sakura-blobs',
      'zen-ahorn-blobs',
    ]);
    const garnicht = new Set(['zen-kontaktschatten']);
    for (const kind of group.children) {
      kind.traverse((o) => {
        if (!o.isMesh) return;
        if (o.material?.isShaderMaterial) return; // Himmelskuppel
        if (garnicht.has(o.name)) return;
        o.receiveShadow = true;
        const durchsichtig = o.material?.transparent === true && o.material?.opacity < 0.9;
        o.castShadow = !nurEmpfangen.has(o.name) && o !== pond && !durchsichtig;
      });
    }
    // Die Wasserfläche empfängt, wirft aber nicht: Ein Teich, der einen Schatten
    // auf den Sand darunter wirft, ist ein Loch, kein Wasser.
    pond.castShadow = false;
  }

  return {
    id: 'zen',
    name: '🪷 Zen-Garten',
    background: new THREE.Color(0xe9d3ae),
    fog: new THREE.Fog(0xecd9bb, 20, 46),
    group,

    // **Die Grundleuchte der App wird für diese Umgebung heruntergenommen.**
    // Sie steht in main.js bei 1,4 und gilt für alles; hier lieferte sie gut
    // die Hälfte der Flächenhelligkeit, und weil eine Hemisphärenleuchte fast
    // nur von `normal.y` abhängt, reagierte dieser Anteil auf keine Form.
    // Der Zen-Garten bringt seinen Himmelsanteil selbst mit.
    sceneAmbient: 0.35,

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
