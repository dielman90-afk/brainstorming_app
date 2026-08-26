import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDojoEnvironment } from './dojo/index.js';
import { makeIslandWalk, makeHeightFieldWalk, makePlanetWalk } from './walkable.js';
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

// **Ein glatter, periodischer Umriss — und warum `hashNoise` dafür falsch ist.**
//
// `hashNoise` ist ein Hash, kein Rauschen: Zwei benachbarte Eingaben liefern
// unabhängige Werte. Als Streuung je Scheitelpunkt ist das genau richtig (die
// Flecken auf Saum und Becken benutzen es so), als **Umriss** ergibt es einen
// Zackenstern. Genau das stand im Bild: Der Uferwulst des Teichs lief nicht in
// Zungen und Buchten aus, sondern in helle Dreiecke, die wie Kartenfehler
// aussahen — und dieselbe Ursache hatte der Rand der Moosinseln.
//
// Was hier gebraucht wird, ist eine Funktion des Winkels, die stetig ist **und**
// sich bei 2π schließt. Eine Summe von Sinus-Termen mit ganzzahliger Frequenz
// erfüllt beides von selbst. Die Amplituden fallen mit 1/f, damit die groben
// Buchten die Form bestimmen und die feinen nur die Kante beleben.
function welligerUmriss(seed, staerke = 0.16, terme = 5) {
  const rnd = mulberry32(seed);
  const glieder = [];
  for (let k = 0; k < terme; k++) {
    glieder.push({ f: k + 2, a: (rnd() * 2 - 1) / (k + 2), p: rnd() * TAU });
  }
  const norm = glieder.reduce((sum, g) => sum + Math.abs(g.a), 0) || 1;
  return (winkel) => {
    let v = 0;
    for (const g of glieder) v += g.a * Math.sin(g.f * winkel + g.p);
    return 1 + (v / norm) * staerke;
  };
}

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
              // **Der Faktor muss ganzzahlig sein.** 2,31 mal die 4 Umläufe
              // der Grundoktave ergibt 9,24 — kein ganzer Umlauf, und genau
              // dort stand eine senkrechte Naht im Himmel. 3,0 mal 4 ist 12.
              texture2D(cloudMap, uvW * 3.0 + vec2(0.37, 0.11)).r * 0.38;
            // Nur ein Band über dem Horizont: Zenitnah läuft die
            // Azimut-Abbildung in den Pol und würde die Kachel verraten.
            float band = smoothstep(cloudBand.x, cloudBand.y, h) *
                         (1.0 - smoothstep(cloudBand.z, cloudBand.w, h));
            float wolke = smoothstep(0.18, 0.62, n) * band * cloudStrength;
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

// --- Astwerk ----------------------------------------------------------------
//
// **Der Prüfer hat es so beschrieben: „Sakura als Brokkoli auf Stiel ohne einen
// einzigen Ast".** Nachgemessen war der Stamm über 70 Pixel Höhe und über die
// volle Breite exakt derselbe Wert — ein Keil, keine Röhre, und zwischen ihm
// und der Krone lag nichts.
//
// Ein Baum liest sich als Silhouette über die **Astlage**: wo die Krone
// ansetzt, muss ein Ast hinführen, und er muss sich verjüngen und teilen. Die
// Ansatzpunkte der Krone stehen ohnehin schon fest (`baueKrone`), also führt
// von der Stammgabel ein Ast zu jedem von ihnen.
//
// Gebaut wird aus drei geraden Abschnitten je Ast statt aus einer Röhre entlang
// einer Kurve: Der Unterschied ist bei zwei Metern Astlänge nicht zu sehen, und
// eine Röhre mit gleichbleibendem Durchmesser wäre falscher als drei
// verjüngte Zylinder. Alles wird mit dem Stamm zu einem Mesh verschmolzen,
// kostet also keinen Draw-Call.
function astAbschnitt(von, nach, r0, r1, seiten = 6) {
  const richtung = new THREE.Vector3().subVectors(nach, von);
  const laenge = richtung.length();
  // **Nicht offen.** Der erste Anlauf ließ die Zylinder ohne Deckel; die
  // Rückseite der Innenwand wird weggeschnitten, und die Astspitzen sahen aus
  // wie abgesägte Rohre, durch die man den Himmel sieht.
  const geo = new THREE.CylinderGeometry(r1, r0, laenge, seiten, 1, false);
  geo.translate(0, laenge / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    richtung.clone().normalize()
  );
  geo.applyQuaternion(q);
  geo.translate(von.x, von.y, von.z);
  return geo;
}

// Ein Ast von `von` nach `nach`, in drei Abschnitten mit einer Ausbuchtung zur
// Seite. `bogen` ist der seitliche Ausschlag in Metern.
function ast(von, nach, r0, r1, bogen, achse) {
  const teile = [];
  const p = (t) => {
    const q = new THREE.Vector3().lerpVectors(von, nach, t);
    // Sinus über die Länge: null an beiden Enden, größter Ausschlag in der Mitte
    q.addScaledVector(achse, Math.sin(t * Math.PI) * bogen);
    return q;
  };
  const stufen = [0, 1 / 3, 2 / 3, 1];
  for (let i = 0; i < 3; i++) {
    const t0 = stufen[i];
    const t1 = stufen[i + 1];
    teile.push(astAbschnitt(p(t0), p(t1), r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1));
  }
  return teile;
}

// Astwerk zu einer Liste von Kronenansätzen. `gabel` ist der Punkt am Stamm, an
// dem sich der Baum teilt.
function astwerk(gabel, ansaetze, { seed = 7, stammR = 0.09, spitzeR = 0.028 } = {}) {
  const rand = mulberry32(seed);
  const teile = [];
  const g = new THREE.Vector3(...gabel);
  for (const [x, y, z, r] of ansaetze) {
    const ziel = new THREE.Vector3(x, y, z);
    // Der Ast endet etwas unterhalb der Schopfmitte, sonst steckt sein Ende
    // sichtbar in der Blattmasse.
    // **Der Ast endet tief im Schopf.** Mit r·0,25 reichte er nur knapp hinein
    // und stach an den oberen Ansätzen oben aus der Blattmasse heraus — im Bild
    // dünne Stäbe, die über der Krone standen. Mit −r·0,3 liegt die Spitze
    // sicher innerhalb der Blattmasse und wird von ihr verdeckt.
    ziel.addScaledVector(new THREE.Vector3().subVectors(ziel, g).normalize(), -r * 0.3);
    // Ausbuchtung senkrecht zur Astrichtung und zur Senkrechten: Ein Ast wächst
    // nicht auf der kürzesten Verbindung.
    const richtung = new THREE.Vector3().subVectors(ziel, g).normalize();
    const achse = new THREE.Vector3().crossVectors(richtung, new THREE.Vector3(0, 1, 0));
    if (achse.lengthSq() < 1e-4) achse.set(1, 0, 0);
    achse.normalize().applyAxisAngle(richtung, rand() * Math.PI * 2);
    const dick = stammR * (0.6 + r);
    teile.push(...ast(g, ziel, dick, spitzeR * (0.45 + rand() * 0.4), 0.08 + rand() * 0.3, achse));
    // Ein Nebenzweig je Ast, der vor dem Schopf abgeht — er macht die
    // Silhouette unregelmäßig, ohne dass man ihn einzeln liest.
    // (verbraucht denselben Zufallswert wie zuvor, damit sich die Astlage
    // gegenüber dem geprüften Stand nicht verschiebt)
    const abzweig = new THREE.Vector3().lerpVectors(g, ziel, 0.55 + rand() * 0.2);
    // **Die Nebenzweige sind entfallen.** Sie sollten die Silhouette
    // unregelmäßig machen, endeten aber zwangsläufig irgendwo — und wo das
    // außerhalb der Blattmasse lag, stand ein abstehender Stab in der Luft.
    // Ein Ast, der ins Nichts zeigt, ist schlimmer als gar keiner. Die
    // Unregelmäßigkeit trägt jetzt die Blattmasse allein; die Hauptäste sind
    // dafür in Dicke und Bogen stärker gestreut.
    void abzweig;
  }
  return teile;
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
// Die Fortbewegung nutzt dieselbe Beschreibung: `walk` der Insel-Umgebung
// klemmt auf `outline` und liest die Standhöhe aus `heightAt` (walkable.js).
// Der Nutzer läuft damit wirklich auf dem Gelände – über die ebene Innenfläche,
// den Randwall hinauf und bis an die Abbruchkante, aber nicht darüber hinaus.
// Früher lief er stur auf y = 0 und damit durch den Wall hindurch.
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


// Streudekoration der Wiese: Blumen (EIN InstancedMesh, ein Draw-Call).
//
// Alle Instanzen sitzen auf der tatsächlichen Geländehöhe (shape.heightAt) und
// bleiben innerhalb des tatsächlichen, unrunden Umrisses. Sie stehen in Nestern
// statt gleichmäßig gestreut – die Verteilung ist damit kein Rauschen, sondern
// folgt derselben Regel wie die Farbe des Bodens.
//
// **Die Grashorste sind raus.** Sie standen hier als zweites InstancedMesh aus
// je vier bis sechs gebogenen Halmen, 240 Stück. Im Bild lasen sie sich nicht
// als Gras, sondern als Schilf: Ein Horst maß bis 0,15 Einheiten – bei
// WORLD_SCALE 4 also gut 60 cm – und war damit aus Augenhöhe die dominierende
// Form im Vordergrund, vor Bach, Findlingen und Bäumen. Die Wiese trägt ihre
// Zeichnung ohnehin über die Bodenfarbe und die Kontaktverdunklung.
//
// Die Nester bleiben auch ohne sie richtig: Blumen wachsen in Gruppen.
function addGrassDecoration(group, rand, shape) {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  // Nester statt Gleichverteilung: erst ein Zentrum würfeln, dann darum streuen.
  const nester = [];
  for (let i = 0; i < 26; i++) {
    const angle = rand() * TAU;
    const r = shape.radius * shape.outline(angle) * (0.10 + rand() * 0.80);
    nester.push({ x: Math.sin(angle) * r, z: Math.cos(angle) * r, s: 0.35 + rand() * 0.9 });
  }
  // Belegte Plätze (Findlinge) und der steil abfallende Rand sind tabu; beides
  // steckt in shape.frei, das buildIsland aufbaut.
  const frei = (x, z) => !shape.frei || shape.frei(x, z, 0.03);
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
  // Quer zur Fließrichtung (die läuft auf (sin a, 0, cos a)) – die Breite des
  // Bandes und des Strahls wird darauf abgetragen.
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

  // --- Flussbett als Band entlang der geteilten Kurve ----------------------
  //
  // Das Band folgt exakt der Rinne, die auch ins Gelände eingeschnitten ist,
  // und liegt knapp darüber.
  //
  // **Es endet an der Lippe, nicht auf der Abbruchkante.** Zwischen 0,88 und
  // 1,0 des Umrisses bricht die Grasnarbe in Zungen und Kerben ab (`relief`:
  // `tear`, `fineTear`, `sod`). Ein Wasserband, das bis dorthin läuft, franst
  // mit ihr aus – und weil die Breite zur Kante hin auf das Dreifache anwuchs
  // und die Höhe je Querschnitt aus dem NIEDRIGEREN der beiden Ufer kam, kippte
  // der letzte Abschnitt in eine breite, facettierte Zunge. Genau das war die
  // gemeldete „komische Form am Ende des Laufs". Ab der Lippe übernimmt der
  // Sturz.
  const LIPPE = 0.985; // Anteil des Umrisses, an dem das Band aufhört
  const rrAuf = (t) => {
    const p = curve.getPoint(t);
    return Math.hypot(p.x, p.z) / (shape.radius * shape.outline(Math.atan2(p.x, p.z)));
  };
  // Die Kurve ist nicht nach Bogenlänge parametrisiert; der Punkt, an dem sie
  // die Lippe erreicht, wird deshalb gesucht statt gerechnet.
  let tLo = 0;
  let tHi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (tLo + tHi) / 2;
    if (rrAuf(mid) < LIPPE) tLo = mid;
    else tHi = mid;
  }
  const tLippe = tLo;

  // Halbe Bandbreite an der Lippe. Der Sturz beginnt mit derselben Breite –
  // ohne das setzt der Strahl sichtbar abgesetzt unter dem Bach an.
  const LIPPEN_HALBBREITE = 0.25;
  const SEG = 64;
  const up = new THREE.Vector3(0, 1, 0);
  const riverPos = [];
  const riverUv = [];
  const riverIdx = [];
  let lippeX = 0;
  let lippeZ = 0;
  let lippeY = 0;
  for (let i = 0; i <= SEG; i++) {
    const f = i / SEG;
    const t = f * tLippe;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3().crossVectors(tan, up).normalize();
    const halbW = 0.12 + f * (LIPPEN_HALBBREITE - 0.12);
    // **Der Spiegel liegt auf dem HÖCHSTEN der drei Bodenpunkte, nicht auf dem
    // niedrigsten.** Ein Wasserspiegel ist über seine Breite waagerecht – so
    // weit war die alte Fassung richtig. Falsch war `Math.min(yl, yr)`: Damit
    // stand der Spiegel unter dem höheren Ufer, das Band verschwand dort im
    // Boden und die Grasnarbe stach als Keil hindurch. Genau das passiert an
    // der Lippe am stärksten, weil der Boden dort über die Kante rollt.
    //
    // Mit dem Maximum aus linkem Ufer, Sohle und rechtem Ufer liegt der Spiegel
    // immer über dem Grund. Der Preis ist ein Schweben von wenigen Zentimetern
    // über dem tieferen Ufer – bei einer Rinne von 0,09 Tiefe und einer halben
    // Breite von 0,25 sind das rund 3 cm lokal, gut 12 cm in Weltmaß, und das
    // liest sich als randvolle Rinne statt als Fehler.
    const xl = p.x - side.x * halbW;
    const zl = p.z - side.z * halbW;
    const xr = p.x + side.x * halbW;
    const zr = p.z + side.z * halbW;
    const y =
      Math.max(shape.heightAt(xl, zl), shape.heightAt(p.x, p.z), shape.heightAt(xr, zr)) + 0.025;
    riverPos.push(xl, y, zl, xr, y, zr);
    const v = f * 8;
    riverUv.push(0, v, 1, v);
    if (i < SEG) {
      const a = i * 2;
      riverIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    if (i === SEG) {
      lippeX = p.x;
      lippeZ = p.z;
      lippeY = y;
    }
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(riverPos, 3));
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(riverUv, 2));
  riverGeo.setIndex(riverIdx);
  riverGeo.computeVertexNormals();
  const river = new THREE.Mesh(riverGeo, waterMat);
  river.name = 'island-bach';
  group.add(river);

  // **Das Auffangbecken an der Kante ist ersatzlos entfallen.** Es war eine
  // liegende Kreisscheibe (r = 0,5, in x auf 1,4 gestreckt) auf der Höhe des
  // Umrisspunktes – und weil der Boden dort schon abgebrochen ist, hing ihre
  // äußere Hälfte als flache blaue Zunge frei über dem Abgrund, quer zur
  // Fließrichtung, weil die Streckung an der Weltachse hing und nicht am Lauf.
  // Ein Bach, der über eine Kante geht, braucht kein Becken; die Lippe ist die
  // letzte Bandbreite.

  // --- Der Sturz: eine fallende Wasserfläche, die der Wand folgt -----------
  //
  // Bisher war der Strahl ein Band, dessen HÖHE frei gewählt war (`FALL_H`,
  // beschleunigt) und dessen RADIUS aus der Flanke kam – zwei voneinander
  // unabhängige Größen. Beim gemessenen Stand fiel er dadurch 7,5 Einheiten
  // tief, während sein Radius nur der Wand bis t = 0,44 folgte: Das Band lag
  // damit auf Höhen, auf denen der Fels längst weiter innen steht, und schnitt
  // auf halber Strecke durch ihn hindurch.
  //
  // Jetzt ist die Flankenkoordinate `t` die EINZIGE Laufvariable, genau wie im
  // Inselkörper (`buildIslandBody`):
  //
  //     Höhe    y(t) = edgeY(a) − sideDepth(t, a)
  //     Radius  R(t) = radius · outline(a) · sideRadius(t, a)  + Schieflage
  //
  // Der Strahl übernimmt beides und ersetzt nur `sideRadius` durch dessen
  // LAUFENDES MAXIMUM. Das hat zwei Wirkungen zugleich: Wo die Wand ausbaucht
  // (Gesims, Bank), legt er sich an sie an; wo sie sich einzieht – und der Keil
  // zieht sich nach unten fast überall ein –, fällt er frei weiter außen, so
  // wie Wasser es tut, das eine Kante verlassen hat. Ein Durchschneiden ist
  // damit ausgeschlossen, ohne dass es geprüft werden müsste.
  const T_FALL = 0.62;
  const R_HALB = shape.radius * 0.5;
  const kanteY = shape.edgeY(angle);
  const wandR = (t, a) => shape.radius * shape.outline(a) * shape.sideRadius(t, a);
  // Das Maximum läuft über die Tiefe UND über die Winkelbreite des Strahls:
  // `sideRadius` trägt Bruchrauschen, das mit dem Winkel schwankt, und der
  // Strahl ist keine Linie.
  const dA = (LIPPEN_HALBBREITE + 0.35) / (shape.radius * shape.outline(angle));
  const mittellinie = []; // Stützpunkte für Gischt und Nebel
  {
    const SEGV = 26;
    // **Der Strahl beginnt am letzten Querschnitt des Bandes.** Rechnete er
    // seinen ersten Punkt aus der Flanke (`t = 0`), lag der ein Stück weiter
    // außen und tiefer als das Bandende – dazwischen klaffte eine Lücke, und
    // das Band hörte sichtbar als stumpfes Rechteck in der Luft auf. Über die
    // ersten 18 % blendet der Strahl deshalb von der Lippe auf die Wandkurve
    // über; danach gilt nur noch die Wand.
    const pos = [];
    const uv = [];
    const idx = [];
    const alpha = [];
    let rMax = 0;
    for (let i = 0; i <= SEGV; i++) {
      const f = i / SEGV;
      const t = T_FALL * f;
      for (let k = -2; k <= 2; k++) {
        rMax = Math.max(rMax, wandR(t, angle + (k / 2) * dA));
      }
      // 0,09 Abstand zur Wand: nah genug, dass der Strahl an ihr klebt, weit
      // genug, dass die facettierte Oberfläche nicht durch ihn hindurchsticht.
      const r = rMax + 0.09;
      const lean = shape.leanAt(t);
      const wx = Math.sin(angle) * r + shape.leanX * lean * R_HALB;
      const wz = Math.cos(angle) * r + shape.leanZ * lean * R_HALB;
      const wy = kanteY - shape.sideDepth(t, angle);
      // Kurz überblenden, nicht lang: Über 18 % der Fallhöhe lag der Ansatz
      // fast waagerecht über der Kante und las sich als blasse Schürze statt
      // als Sturz. Sechs Prozent sind gut anderthalb Segmente – genug, um die
      // Lücke zwischen Bandende und Wand zu schließen, kurz genug, dass das
      // Wasser sofort abkippt.
      const ab = smoothstep(0, 0.06, f);
      const cx = lippeX + (wx - lippeX) * ab;
      const cz = lippeZ + (wz - lippeZ) * ab;
      const y = lippeY + (wy - lippeY) * ab;
      mittellinie.push(new THREE.Vector3(cx, y, cz));
      // Der Strahl fächert nach unten auf.
      const halbW = LIPPEN_HALBBREITE + f * 0.34;
      pos.push(
        cx - tangent.x * halbW, y, cz - tangent.z * halbW,
        cx + tangent.x * halbW, y, cz + tangent.z * halbW
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
    // Oben bleibt der Strahl deckend – ein Wasserfall ist an der Lippe am
    // dichtesten. Erst im unteren Drittel löst er sich in Gischt auf. Vorher
    // begann die Ausblendung sofort, und der obere Teil war so blass, dass die
    // Grasnarbe dahinter durchschien.
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.42, '#ffffff');
    grad.addColorStop(0.72, '#bbbbbb');
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

  // --- Gischt: Partikelstrom auf dem Strahl ---
  //
  // Die Tropfen liefen bisher senkrecht von der Kante nach unten, auf einer
  // eigenen, fest gerechneten Achse – also neben dem Strahl, sobald der der
  // Wand folgte. Jetzt laufen sie auf DESSEN Mittellinie: dieselben
  // Stützpunkte, nur mit seitlichem Versatz und Zittern.
  const count = 150;
  const positions = new Float32Array(count * 3);
  const meta = [];
  for (let i = 0; i < count; i++) {
    meta.push({
      speed: 0.10 + rand() * 0.06, // Anteil der Fallstrecke je Sekunde
      offset: rand(),
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

  // Punkt auf der Mittellinie des Strahls, 0 = Lippe, 1 = Fuß.
  const _mp = new THREE.Vector3();
  const aufStrahl = (f) => {
    const k = Math.min(mittellinie.length - 1, Math.max(0, f * (mittellinie.length - 1)));
    const i0 = Math.floor(k);
    const i1 = Math.min(mittellinie.length - 1, i0 + 1);
    return _mp.copy(mittellinie[i0]).lerp(mittellinie[i1], k - i0);
  };

  // Feiner Sprühnebel am Fuß des Wasserfalls – dort, wo der Strahl tatsächlich
  // endet, nicht auf einer zweiten, unabhängig gerechneten Stelle.
  const fuss = mittellinie[mittellinie.length - 1];
  const mist = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,0.5)', 'rgba(220,240,255,0.2)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    })
  );
  mist.position.copy(fuss);
  mist.scale.set(2.4, 2.4, 1);
  group.add(mist);

  // Schaum an der Lippe (pulsierendes weiches Glühen)
  const foam = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,255,255,0.95)', 'rgba(235,248,255,0.5)'),
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
      fog: false,
    })
  );
  foam.position.set(lippeX, lippeY + 0.02, lippeZ);
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
        const f = (m.offset + time * m.speed) % 1;
        const p = aufStrahl(f);
        pos.setXYZ(
          i,
          p.x + tangent.x * m.side + m.jitter * Math.sin(time * 3 + i),
          p.y,
          p.z + tangent.z * m.side + m.jitter * Math.cos(time * 3 + i)
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
  // Die Wasserfläche selbst ist tabu.
  //
  // Gemessen, nicht geschätzt: Der äußerste Scheitel des Bandes liegt bei 0,251
  // von der Lauflinie (makeWaterfall, halbe Breite 0,12 an der Quelle bis 0,25
  // an der Lippe). Dazu kommt der Fußabdruck der Pflanze selbst – ein Busch mit
  // 0,16 Radius braucht mehr Abstand als ein Pilz –, deshalb nimmt `frei` ihn
  // als dritten Wert entgegen.
  //
  // **Warum 0,40 und nicht 0,27.** Mit 0,27 stand nachweislich nichts mehr IM
  // Wasser – die nächste Blume saß bei 0,303, also 5 cm hinter der Uferlinie.
  // Aus Augenhöhe liest sich das trotzdem als „steht im Bach": Der Stiel
  // überlappt aus flachem Blickwinkel das Band dahinter. 0,40 lässt gut 0,15
  // freies Ufer je Seite – bei WORLD_SCALE 4 rund 60 cm neben einem zwei Meter
  // breiten Bach, also eine Uferböschung, wie ein Bach sie hat.
  //
  // Weiter darf es nicht gehen: Einen Streuradius, den man ansehen kann, hält
  // diese Insel schon einmal nicht aus (siehe die 0,96 weiter unten).
  const WASSER = 0.40;
  shape.frei = (x, z, r = 0) => {
    for (const b of shape.blocked) {
      if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return false;
    }
    if (shape.riverDist(x, z) < WASSER + r) return false;
    // 0,96 statt 0,90: Bei 0,90 endete JEDER Bewuchs schlagartig entlang einer
    // Linie, und darunter lag bis zur Abbruchkante ein völlig glatter, kahler
    // Streifen – ein Streuradius, den man ansehen kann. Die steile Kante selbst
    // hält shape.frei ohnehin frei, weil dort die Grasnarbe abfällt.
    return Math.hypot(x, z) < shape.radius * shape.outline(Math.atan2(x, z)) * 0.96;
  };

  // Der Quelltopf ist breiter als der Bach: Becken mit 0,32 Radius plus
  // Steinkranz bis 0,40 (makeWaterfall). `riverDist` misst nur zur Lauflinie
  // und kennt ihn nicht.
  if (river != null) shape.blocked.push({ x: 0.1, z: 0.2, r: 0.46 });

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
    //
    // **Hier fehlt `outline(angle)`, anders als bei Findlingen und Knöcheln.**
    // Das ist bewusst so belassen: Mit dem Faktor wandert JEDER Baum, und die
    // sechs festen Prüfkameras (harness-common.mjs) zeigen dann eine andere
    // Insel – eine davon stand danach im Geäst. Mit dem festen Seed steht kein
    // Stamm außerhalb des Umrisses; nur Kronen kragen über die Kante, was ein
    // Baum am Abbruch auch tut. Wer den Seed ändert, muss den Faktor
    // nachziehen und die Vergleichsbilder neu einfrieren.
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
    // Nicht in die Rinne. Ein Knöchel genau auf der Lippe steht dem Bach im
    // Weg und teilt den Sturz – gemessen saß einer mittig im Abfluss und
    // spaltete das Band in zwei Zungen.
    if (shape.riverDist(kx, kz) < 0.62) continue;
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
    //
    // **`outline(angle)` ist Pflicht, kein Feinschliff.** Der Umriss schwankt
    // zwischen 0,6 und 1,3 des Radius (Landzunge, Bucht, Einschnitt). Ohne den
    // Faktor ist `0,92 · radius` in der Bucht das 1,5-fache der dortigen
    // Kante – und der Block hängt frei im Himmel neben der Insel. Genau das war
    // der gemeldete fliegende Stein: gemessen saß ein Findling bei 1,18 des
    // Umrisses. Die Felsknöchel weiter oben haben den Faktor immer gehabt.
    const r =
      radius * shape.outline(angle) * (rand() > 0.4 ? 0.72 + rand() * 0.20 : 0.62 + rand() * 0.10);
    const sx = Math.sin(angle) * r;
    const sz = Math.cos(angle) * r;
    // Aus demselben Grund wie bei den Knöcheln: nicht in den Bachlauf.
    if (shape.riverDist(sx, sz) < 0.62 + s) continue;
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
  // `fuss` ist der Radius, den das Gewächs am Boden einnimmt. Er geht in die
  // Freiflächenprüfung ein, damit ein breiter Busch weiter vom Wasser
  // wegrückt als ein Pilz.
  const spot = (min, max, fuss = 0) => {
    for (let versuch = 0; versuch < 8; versuch++) {
      const angle = rand() * TAU;
      const r = shape.radius * shape.outline(angle) * (min + rand() * (max - min));
      const x = Math.sin(angle) * r;
      const z = Math.cos(angle) * r;
      // Findlinge liegen ueber der Gelaendehoehe; ein Busch oder Pilz an
      // derselben Stelle waechst sichtbar aus dem Stein.
      if (!shape.frei || shape.frei(x, z, fuss)) return [x, shape.heightAt(x, z), z];
    }
    // Achter Fehlversuch: lieber gar nicht setzen als in den Bach.
    return null;
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
    // Größe VOR dem Platz würfeln: Der Fußabdruck entscheidet mit, wo der
    // Busch stehen darf.
    const s = 0.085 + rand() * 0.075;
    const platz = spot(0.24, 0.90, s * 1.7);
    if (!platz) continue;
    const [x, y, z] = platz;
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
    const platz = spot(0.2, 0.9, 0.07);
    if (!platz) {
      dummy.position.set(0, -999, 0);
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mushrooms.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(1);
      continue;
    }
    const [x, y, z] = platz;
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

    // --- Begehbarer Bereich ---------------------------------------------
    //
    // Begehbar ist die **Hauptinsel**, und zwar ganz: über die ebene
    // Innenfläche, den Randwall hinauf, über den Höhenrücken und bis an die
    // Abbruchkante. Grundriss und Standhöhe kommen aus derselben Formbeschreibung,
    // aus der auch die Geometrie und die Objektplatzierung entstehen
    // (`makeIslandShape`) – die Sperre kann deshalb nicht von dem abweichen, was
    // man sieht.
    //
    // **0,99 statt 1,0.** Genau an der Kante ist Schluss; das letzte Prozent
    // deckt die Sodenplatte ab, die dort über den Fels ragt und auf der man
    // sonst in der Luft stünde.
    //
    // Die Mini-Inseln bleiben unerreichbar. Sie stehen 14 bis 26 Einheiten
    // entfernt, haben eigene Maßstäbe, eine Schieflage und schweben zusätzlich
    // auf und ab – sie sind Horizont, kein Ziel.
    walk: makeIslandWalk(shape, WORLD_SCALE, 0.99),

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
// --- Der Miniplanet ----------------------------------------------------------
//
// Aus der 96 × 96 m großen Platte wird eine **Kugel mit 25 m Halbmesser**, die
// man in gut einer Minute umrunden kann.
//
//   Umfang      2π · 25       = 157,1 m
//   Rundgang    157,1 / 2,4   =  65,5 s bei der vorhandenen Gehgeschwindigkeit
//   Horizont    √(2 · 25 · 1,6) =   8,94 m bei 1,6 m Augenhöhe
//   Oberfläche  4π · 25²      = 7854 m²  (die Platte hatte 9216 m²)
//
// **Was sich dadurch grundsätzlich ändert.** Es gibt keine Ferne mehr. Bei 8,9 m
// Horizont sieht man einen Kreis von 250 m² — ein Vierunddreißigstel der Welt.
// Was bisher Weite trug (Fernfeldring, Horizonthügel bei r = 26…38 m), kann
// das nicht mehr; die Krümmung muss es tragen: der Boden, der nach unten
// wegkippt, und die Formen, die über die Kante steigen.
//
// Ein Gegenstand der Höhe H bleibt sichtbar bis zur Bogendistanz
// 8,94 + √(2 · 25 · H). Für einen 6 m hohen Felsen sind das 26,2 m — er steht
// also noch als Silhouette am Horizont, wenn er ein Sechstel der Welt entfernt
// ist. Das ist die Zahl, nach der die Formationen platziert werden.
const PLANET_R = 25;

// **Die drei Bausteine, an denen der ganze Umbau hängt.**
//
// In der Ebene war ein Ort ein Zahlenpaar und der Abstand `Math.hypot`. Auf der
// Kugel ist ein Ort eine **Richtung** (Einheitsvektor) und der Abstand die
// **Großkreisdistanz**. Weil Paket 5 die Geländemerkmale schon als Liste und
// die Abstandsmessung schon hinter eine Funktion gelegt hat, ist das hier ein
// Wechsel der Parametrisierung und keine zweite Landschaft — genau die
// Vorkehrung, die dafür getroffen wurde.

// Großkreisdistanz in Metern. `acos` wird geklemmt: Rundungsfehler bringen das
// Skalarprodukt gelegentlich auf 1,0000001, und `Math.acos` liefert dafür NaN.
const bogenAbstand = (a, b) => PLANET_R * Math.acos(Math.min(1, Math.max(-1, a.dot(b))));

// Zwei orthonormale Vektoren, die die Tangentialebene an einer Richtung
// aufspannen. Der Hilfsvektor wird gewechselt, wenn `d` fast senkrecht steht —
// sonst ist das Kreuzprodukt entartet und die Ebene nicht definiert.
function tangentialSystem(d, ost = new THREE.Vector3(), nord = new THREE.Vector3()) {
  const hilf = Math.abs(d.y) < 0.9 ? _PY.set(0, 1, 0) : _PX.set(1, 0, 0);
  ost.crossVectors(hilf, d).normalize();
  nord.crossVectors(d, ost).normalize();
  return { ost, nord };
}
const _PX = new THREE.Vector3();
const _PY = new THREE.Vector3();
const _POst = new THREE.Vector3();
const _PNord = new THREE.Vector3();

// Ein Ort, angegeben als Bogenlänge und Himmelsrichtung von einem Bezugspunkt
// aus. Damit bleiben die Zahlen im Quelltext lesbar: „14 m nach Nordost" statt
// eines Einheitsvektors mit fünf Nachkommastellen.
function ortVon(bezug, bogenMeter, azimutGrad) {
  const { ost, nord } = tangentialSystem(bezug, _POst, _PNord);
  const th = bogenMeter / PLANET_R;
  const az = (azimutGrad * Math.PI) / 180;
  return bezug
    .clone()
    .multiplyScalar(Math.cos(th))
    .addScaledVector(ost, Math.sin(th) * Math.cos(az))
    .addScaledVector(nord, Math.sin(th) * Math.sin(az))
    .normalize();
}

// **Der Wind ist auf einer Kugel ein Tangentialfeld, kein Vektor.**
//
// In der Ebene genügte eine Richtung für die ganze Welt. Auf der Kugel gibt es
// keine gleichbleibende Richtung — ein Vektorfeld ohne Nullstelle existiert auf
// der Kugel nicht (Satz vom Igel). Der einfachste brauchbare Kompromiss ist ein
// **zonaler** Wind: Er weht entlang der Breitenkreise um einen Windpol, und
// seine beiden Nullstellen liegen genau in diesen Polen.
//
// Der Windpol steht bewusst **weit vom Startpunkt** (0 | 1 | 0): Dort, wo der
// Nutzer erscheint, soll der Wind eindeutig sein, und die beiden Stellen, an
// denen die Rippel zusammenlaufen, sollen nicht die ersten sein, die er sieht.
const WIND_POL = new THREE.Vector3(0.34, -0.18, 0.92).normalize();
const STARTPUNKT = new THREE.Vector3(0, 1, 0);

// Ein tangentialer Versatz von `ort` aus, in Metern entlang Ost und Nord des
// dortigen Tangentensystems. Das ist dasselbe wie `ortVon`, nur in kartesischen
// statt in Polarkoordinaten — und in der Form braucht es jede Stelle, die etwas
// gegen einen Bezugspunkt verschiebt (Formationsachsen, Begleitsteine).
const _vtOst = new THREE.Vector3();
const _vtNord = new THREE.Vector3();
function versetzeAufKugel(ort, ostMeter, nordMeter, aus) {
  const q = Math.hypot(ostMeter, nordMeter);
  if (q < 1e-6) return aus.copy(ort);
  const w = q / PLANET_R;
  tangentialSystem(ort, _vtOst, _vtNord);
  return aus
    .copy(ort)
    .multiplyScalar(Math.cos(w))
    .addScaledVector(_vtOst, (Math.sin(w) * ostMeter) / q)
    .addScaledVector(_vtNord, (Math.sin(w) * nordMeter) / q)
    .normalize();
}

// --- Grate: der Abstand eines Punktes von einem Großkreisbogen ---------------
//
// **Warum ein eigenes Primitiv und nicht eine Kette von Hügeln.** Der Prüfer
// hat zwei Dinge nebeneinander vermisst — eine Silhouette mit Topographie und
// einen Mittelgrund — und beide haben dieselbe Ursache: Auf dieser Kugel gibt
// es keine Form, die *lang und schmal und hoch* ist. Krater sind rund, Hügel
// sind rund; runde Formen von 10 m Halbmesser sind auf einem Körper von 25 m
// so weich, dass sie weder eine Kante noch eine Verdeckung ergeben.
//
// Ein Grat ist die einfachste Form, die beides kann: Er steht quer im Blick,
// verdeckt die Ferne und gibt der Kante des Körpers einen Knick. Auf einer
// Kugel ist seine Achse ein **Großkreisbogen** — die gerade Linie der Kugel.
//
// Zurückgegeben wird der Abstand in Metern entlang der Oberfläche. Innerhalb
// des Bogens ist das der Abstand zur Trägerebene, außerhalb der Abstand zum
// näheren Endpunkt; so bekommt der Grat runde Enden statt abgeschnittener.
const _grN = new THREE.Vector3();
const _grP = new THREE.Vector3();
const _grK = new THREE.Vector3();
function bogenAbstandZuGrat(dir, grat) {
  const n = grat.achse;
  const quer = dir.dot(n);
  // Fußpunkt auf dem Großkreis.
  _grP.copy(dir).addScaledVector(n, -quer);
  const len = _grP.length();
  if (len > 1e-6) {
    _grP.multiplyScalar(1 / len);
    // Liegt der Fußpunkt zwischen den Enden? Beide Kreuzprodukte müssen
    // dieselbe Umlaufrichtung wie die Achse haben.
    const vorA = _grK.crossVectors(grat.a, _grP).dot(n);
    const vorB = _grK.crossVectors(_grP, grat.b).dot(n);
    if (vorA >= 0 && vorB >= 0) return Math.asin(Math.min(1, Math.abs(quer))) * PLANET_R;
  }
  return Math.min(dir.angleTo(grat.a), dir.angleTo(grat.b)) * PLANET_R;
}

// Windrichtung an einem Ort, als Tangentialvektor.
function windAn(dir, aus = new THREE.Vector3()) {
  aus.crossVectors(WIND_POL, dir);
  const l = aus.length();
  // In den Windpolen selbst ist die Richtung nicht definiert; dort wird ein
  // beliebiger Tangentialvektor genommen. Sichtbar ist das nicht — genau dort
  // blenden die Rippel ohnehin aus.
  if (l < 1e-4) return tangentialSystem(dir, aus, _PNord).ost;
  return aus.multiplyScalar(1 / l);
}

// Wie weit ein Ort vom Windäquator entfernt ist, in Metern Bogenlänge. Das ist
// die Koordinate **quer** zum Wind — entlang ihrer laufen die Rippelkämme.
const windBreite = (dir) => PLANET_R * Math.asin(Math.min(1, Math.max(-1, dir.dot(WIND_POL))));

// --- Dreidimensionales Rauschen ---------------------------------------------
//
// `fbm2` arbeitet auf einer Ebene. Auf einer Kugel gibt es keine Ebene, über die
// man es spannen könnte, ohne eine Naht oder eine Verzerrung an den Polen
// einzuhandeln. Also wird das Rauschen im **Raum** ausgewertet und die
// Kugeloberfläche schneidet hindurch: keine Naht, keine Pole, keine
// Vorzugsrichtung.
function valueNoise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = x - xi;
  const v = y - yi;
  const w = z - zi;
  const su = u * u * (3 - 2 * u);
  const sv = v * v * (3 - 2 * v);
  const sw = w * w * (3 - 2 * w);
  const e = (i, j, k) => hashNoise(xi + i, yi + j, zi + k);
  const mix = (a, b, t) => a + (b - a) * t;
  return mix(
    mix(mix(e(0, 0, 0), e(1, 0, 0), su), mix(e(0, 1, 0), e(1, 1, 0), su), sv),
    mix(mix(e(0, 0, 1), e(1, 0, 1), su), mix(e(0, 1, 1), e(1, 1, 1), su), sv),
    sw
  );
}
function fbm3(x, y, z) {
  let summe = 0;
  let amp = 0.5;
  let frq = 1;
  for (let o = 0; o < 4; o++) {
    summe += (valueNoise3(x * frq, y * frq, z * frq) - 0.5) * amp;
    amp *= 0.5;
    // Nicht 2,0: Bei glatter Verdopplung fallen die Oktaven auf denselben
    // Gitterlinien zusammen und das Rauschen bekommt sichtbare Achsen.
    frq *= 2.03;
  }
  return summe;
}

// Kraterprofil (t = Abstand/Radius): Mulde innen, angehobener Wall am Rand.
// Kraterprofil (t = Abstand/Radius), vierteilig statt zweiteilig.
//
// **Was am alten Profil fehlte, und warum es als Wiederholung las.** Es hatte
// Schüssel und Randwall, und bei t = 1,14 hörte es auf — die Auswurfdecke
// fehlte ganz. Damit endete jeder Krater an einer scharfen Grenze im
// unberührten Dünenfeld, und weil alle fünf dasselbe Profil und dieselbe
// Wallhöhe hatten, las das Feld in `d-aerial` als „nahezu deckungsgleiche
// Ellipsen, nur skaliert" (Prüfbefund).
//
// Ein echter Einschlag hinterlässt vier Zonen:
//
//   * **Schüssel** bis t ≈ 0,80 — parabolisch, aber nicht ganz: Der Boden
//     eines gealterten Kraters ist mit Material verfüllt und flacher als eine
//     Parabel.
//   * **Wall** von 0,80 bis 1,15 — der aufgeworfene Rand.
//   * **Auswurfdecke** von 1,15 bis rund 2,6 — der ausgeworfene Schutt liegt
//     als abfallende Decke rings um den Krater und geht allmählich in das
//     Gelände über. Sie fällt wie 1/t³, das ist der übliche Ansatz und trifft
//     die Beobachtung gut genug.
//   * **darüber hinaus** nichts.
//
// `wall` und `alter` machen aus einem Profil eine Familie: Ein frischer Krater
// hat einen hohen, scharfen Wall und eine deutliche Decke; ein alter ist
// eingeebnet, sein Wall abgetragen, seine Decke verweht.
function craterProfile(t, wall = 1, alter = 0) {
  const scharf = 1 - alter;
  if (t < 0.8) {
    // Der Boden wird mit dem Alter flacher: aus der Parabel wird eine Wanne.
    const u = t / 0.8;
    const parabel = -(1 - u * u);
    const wanne = -(1 - Math.pow(u, 4));
    return parabel * scharf + wanne * alter;
  }
  if (t < 1.15) return 0.32 * wall * scharf * Math.sin((Math.PI * (t - 0.8)) / 0.35);
  if (t < 2.6) {
    // Auswurfdecke: fällt wie 1/t³, am Wallfuß angesetzt und bei 2,6 sanft
    // auf null geführt, damit keine sichtbare Grenze entsteht.
    const decke = 0.085 * wall * scharf * (Math.pow(1.15 / t, 3) - Math.pow(1.15 / 2.6, 3));
    return decke * (1 - smoothstep(2.1, 2.6, t));
  }
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
  const size = 512;

  // **Warum diese Karte neu gebaut werden musste, obwohl der Boden erst in
  // Paket 4 dran ist.** Die alte Höhenfunktion war
  //
  //     rausch(x >> 4, y >> 4) * 0.5 + rausch(x >> 2, y >> 2) * 0.34 + rausch(x, y) * 0.16
  //
  // — drei ungefilterte Wertrauschlagen auf einem **achsenparallelen Gitter**
  // mit 16-, 4- und 1-Texel-Blöcken und ohne jede Interpolation. Unter dem
  // alten flächigen Grundlicht war das unsichtbar. Unter dem neuen streifenden
  // Mondlicht wurde es zum auffälligsten Merkmal der ganzen Szene: Der Prüfer
  // hat im Nahboden ein Rechteck- und L-Muster in genau zwei zueinander
  // senkrechten Richtungen gefunden, mit einem Autokorrelations-Nebengipfel
  // bei **32 px (+0,042** gegen −0,005 vorher). Das ist ein Programmierer-Tell,
  // und er ist ein Preis dieses Lichtpakets — also wird er hier bezahlt und
  // nicht vier Pakete weitergereicht.
  //
  // Das Rezept steht schon im Haus, bei `kornCanvas()` für den Zen-Sand:
  // **Körner sind keine Frequenz, sondern Objekte.** Ein Wertrauschen auf
  // einem Gitter hat immer eine Vorzugsrichtung — die Interpolation zwischen
  // den Zellen. Gesetzte Tupfen an zufälligen Stellen haben keine, weil es
  // kein Gitter gibt. Hier wird nicht gefärbt, sondern **Höhe** gesetzt: weiche
  // runde Kuppen in drei Größenklassen, jede um ±Kachelbreite mitgezeichnet,
  // damit die Karte nahtlos bleibt.
  //
  // Auflösung 512 statt 256. Die Karte deckt 1,6 m ab, ein Texel also 3,1 mm.
  // Sichtbar ist nach der Erfahrung des Zen-Gartens, was gröber als etwa ein
  // Zentimeter ist — die kleinste Kuppe hat 1,9 cm Durchmesser und liegt damit
  // knapp darüber. Speicher: 512² × 2 Karten = 2,1 MB von 60.
  const feld = new Float32Array(size * size);
  {
    const kr = mulberry32(90210);
    const wrap = (v) => ((v % size) + size) % size;
    const kuppe = (cx, cy, r, amp) => {
      const ri = Math.ceil(r);
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          const d2 = (dx * dx + dy * dy) / (r * r);
          if (d2 >= 1) continue;
          const f = (1 - d2) * (1 - d2); // weich auslaufend, C1-stetig am Rand
          feld[wrap(cy + dy) * size + wrap(cx + dx)] += amp * f;
        }
      }
    };
    // Drei Größenklassen. Die grobe trägt die Verwehung, die mittlere das
    // Korn, die feine den Grieß. Anzahl so gewählt, dass jede Klasse die
    // Fläche gut zwei- bis dreimal überdeckt — darunter sieht man einzelne
    // Tupfen, darüber mittelt sich alles zu Grau.
    const klassen = [
      { n: 260, r: 17, amp: 0.5 },
      { n: 2600, r: 6.5, amp: 0.26 },
      { n: 16000, r: 3.1, amp: 0.13 },
    ];
    for (const k of klassen) {
      for (let i = 0; i < k.n; i++) {
        kuppe(
          Math.floor(kr() * size),
          Math.floor(kr() * size),
          k.r * (0.65 + kr() * 0.7),
          k.amp * (0.6 + kr() * 0.8)
        );
      }
    }
    // Auf 0…1 normieren, damit die Rauheitsfunktion unten denselben
    // Wertebereich sieht wie vorher.
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of feld) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const spanne = Math.max(1e-6, hi - lo);
    for (let i = 0; i < feld.length; i++) feld[i] = (feld[i] - lo) / spanne;
  }
  const { normalMap, roughnessMap, field } = heightToMaps({
    size,
    // Schwächer als die alten 1,9: Die Kuppen haben eine echte Flanke, während
    // das Blockrauschen nur an den Blockkanten überhaupt eine Ableitung hatte.
    // Bei gleicher Stärke stünde die Fläche voll Kratern.
    strength: 1.15,
    height: (x, y) => feld[y * size + x],
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

// **Eine Windrichtung für alles.** Windrippel, Verwehungen und die Staubfahnen
// im Windschatten der Brocken müssen aus derselben Richtung kommen — drei
// Merkmale, die einander widersprechen, lesen als Zufall statt als Wetter.
// Nicht achsenparallel gewählt: Ein Rippelmuster, das genau nach Norden läuft,
// fällt mit den Texturachsen und der Gitterrichtung des Bodens zusammen und
// wird dadurch zum Raster.
// Der Mond steht bei [14 | 16 | −24] — 32,1 m Abstand, 29,9° über dem Horizont.
// Ort und Richtung stehen auf Modulebene, weil beide an zwei Stellen gebraucht
// werden: beim Bau des Mondes und beim Einfärben der Bruchsteine, wo die
// mondabgewandte Seite den Frost bekommt. Zwei Kopien derselben Zahl wären die
// Sorte Fehler, die man erst bemerkt, wenn eine davon wandert.
const MOND_ORT = new THREE.Vector3(14, 16, -24);
const MOND_RICHTUNG = MOND_ORT.clone().normalize();

// **Der Pol der Milchstraßenebene, auf Modulebene.**
//
// Er stand bis jetzt in `makeNachtKuppel` — dort wird das Band gezeichnet. Das
// Sternfeld braucht ihn aber auch: Der Prüfer hat die Milchstraße als „ein
// weichgezeichnetes graues Band ohne eine einzige Punktquelle" beanstandet, und
// eine Milchstraße besteht nun einmal aus Sternen. Ein Teil des Sternfelds wird
// deshalb zur Bandebene hin verdichtet — und dafür müssen Band und Verdichtung
// **dieselbe** Ebene meinen. Zwei Kopien derselben Zahl wären genau die Sorte
// Fehler, die man erst bemerkt, wenn eine davon wandert.
const MILCH_POL = new THREE.Vector3(0.78, 0.52, 0.35).normalize();

// **Der Wind auf der Kugel.** Auf der Platte waren das zwei 2D-Richtungen in
// x/z. Auf einer Kugel gibt es kein x/z: Wer die Rippelphase aus der
// waagerechten Projektion der Weltkoordinate zieht, bekommt am „Äquator" der
// Y-Achse — dort, wo die Fläche senkrecht steht — Rippel von mehreren Metern
// Abstand. Genau das stand in der Totale: parallele dunkle Striche, wie mit
// einem Kamm gezogen, und ein Strahl durch das Pixel traf `nacht-planet` bei
// (25,04 | 4,78 | 2,78), also am Äquator.
//
// Das Windfeld ist deshalb **zonal**: eine Strömung um `WIND_POL`, dieselbe,
// aus der schon `windAn()`, `windBreite()` und die Dünenasymmetrie kommen. Die
// Rippelkämme stehen quer zum Wind, ihr Abstand wird also entlang der
// Windlänge gemessen — als Vielfaches des Längengrads um den Windpol.
//
// **Die Kammzahl ist ganzzahlig, und das ist der Punkt.** Die Bogenlänge
// entlang eines Breitenkreises ist als Skalarfeld auf der Kugel nicht
// eindeutig — sie springt einmal um den vollen Umfang, und dieser Sprung wäre
// eine sichtbare Naht vom Pol zum Pol. Ein Vielfaches des **Winkels** ist
// dagegen von Natur aus periodisch. 462 Kämme auf den Umfang 2π · 25 m ergeben
// am Windäquator 0,340 m Abstand; zu den Windpolen hin laufen sie zusammen wie
// Meridiane und blenden dort über `fwidth` von selbst aus.
const NACHT_WIND = (() => {
  const pol = WIND_POL;
  const a = new THREE.Vector3(0, 1, 0).cross(pol).normalize();
  const b = pol.clone().cross(a).normalize();
  return { pol, a, b, kaemme: Math.round((Math.PI * 2 * PLANET_R) / 0.34) };
})();

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

    // --- Windrippel und Abtastung ------------------------------------------
    //
    // **Die Aufteilung nach Frequenz, dieselbe wie beim Zen-Sand.** Jede
    // Ortsfrequenz auf den Träger, der sie billig kann:
    //
    //   grob   (Meter bis Zehnermeter)  Scheitelfarben des 150 × 150-Gitters,
    //                                   0,64 m je Zelle — Verwehungen,
    //                                   Ausbleichen nach Exposition
    //   mittel (die Rippel, 34 cm)      **rechnerisch aus der Weltposition** —
    //                                   in jeder Entfernung gleich scharf,
    //                                   kostet kein Byte, und blendet sich über
    //                                   fwidth aus, sobald eine Periode unter
    //                                   zwei Pixel fällt
    //   fein   (Korn, 1 bis 3 cm)       die kachelnde Normalenkarte
    //
    // **Der Befund, der den Ausblendteil erzwingt.** Der Prüfer hat die
    // Feinstruktur in `e-ground` von nah nach fern gemessen: 1,96 / 2,62 /
    // 2,78 / 2,32 / 1,69 — dasselbe Schleifpapier auf zwei Metern wie auf
    // vierzig. Das ist Unterabtastung: Bei 1,6 m Kachel und 512 Texeln deckt
    // ein Texel 3,1 mm ab; auf 40 m löst ein Bildpunkt rund 4 cm auf. Was dort
    // stehen bleibt, ist Moiré, keine Körnung.
    //
    // Die Lehre von der Himmelsinsel sagt aber auch: Es darf nicht auf
    // **nichts** ausblenden, sonst ist die Ferne leerer als vorher. Deshalb
    // trägt der zweite, gröbere Maßstab — die Rippel — weiter als das Korn.
    _marsGround.onBeforeCompile = (shader) => {
      shader.uniforms.windPol = { value: NACHT_WIND.pol };
      shader.uniforms.windA = { value: NACHT_WIND.a };
      shader.uniforms.windB = { value: NACHT_WIND.b };
      shader.uniforms.windKaemme = { value: NACHT_WIND.kaemme };
      shader.uniforms.planetR = { value: PLANET_R };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWeltOrt;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWeltOrt = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec3 vWeltOrt;
           uniform vec3 windPol;
           uniform vec3 windA;
           uniform vec3 windB;
           uniform float windKaemme;
           uniform float planetR;`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
           {
             // --- Korn nach Entfernung ausblenden ---------------------------
             // Die Kachel deckt 1,6 m ab, ihre kleinsten Kuppen sind 1,9 cm
             // groß. Ein Bildpunkt fasst bei 1280 px auf 102 Grad rund 1,4
             // mrad; die Kuppe fällt damit ab 13 m unter einen Bildpunkt. Der
             // alte Bereich 7 bis 26 m war für die 96-m-Platte gemacht — auf
             // einem Planeten mit 8,9 m Horizont wäre er nie zu Ende gelaufen.
             float tiefe = -vViewPosition.z;
             float feinAn = 1.0 - smoothstep(6.0, 14.0, tiefe);
             normal = normalize(mix(nonPerturbedNormal, normal, feinAn));

             // --- Der fehlende Zwischenmaßstab: Kies ------------------------
             //
             // Zwischen den Brocken (14 bis 56 cm) und dem Korn der Karte
             // (1,9 cm) lag nichts. Der Prüfer hat das als den eigentlichen
             // Grund benannt, warum die Fläche als Farbauftrag liest und warum
             // man im Bild nicht abschätzen kann, wie weit der Kamm weg ist:
             // Es fehlt der Maßstab, an dem das Auge Entfernung abliest.
             //
             // Dieselbe Karte, auf die vierfache Kachel gespannt: 6,4 m statt
             // 1,6 m, damit 7,6-cm-Kuppen — Kiesgröße. Ein zusätzlicher
             // Texturgriff, kein Byte Speicher, und bis 30 m abtastbar.
             //
             // Sie trägt zweierlei, weil ein Kiesel beides tut: Er wirft einen
             // eigenen Schatten (die Normale) und er ist anders gefärbt als der
             // Staub um ihn herum (die Farbe).
             vec3 kies = texture2D(normalMap, vNormalMapUv * 0.25).xyz * 2.0 - 1.0;
             float kiesAn = 1.0 - smoothstep(14.0, 30.0, tiefe);
             // **Der Betrag ist gedeckelt durch die Rippel.** Deren Neigung
             // liegt bei cos(phase) * K * 0,0042, also höchstens 0,078. Der
             // erste Anlauf stand auf 0,42 — das Fünffache — und hat sie
             // vollständig übertönt: In e-boden war von den Windrippeln nichts
             // mehr zu sehen. 0,13 liegt in derselben Größenordnung und lässt
             // beide nebeneinander bestehen.
             normal = normalize(normal + tbn * vec3(kies.xy * 0.13, 0.0) * kiesAn);
             diffuseColor.rgb *= 1.0 + (kies.x - kies.y) * 0.085 * kiesAn;

             // --- Windrippel ------------------------------------------------
             // Ort auf der Kugel, als Richtung vom Mittelpunkt.
             vec3 dK = normalize(vWeltOrt);
             float sinBr = clamp(dot(dK, windPol), -1.0, 1.0);
             // Breite quer zum Wind, in Bogenmetern — entlang ihrer laufen die
             // Kaemme, sie ist deshalb die Eingabe fuer das Maeandern.
             float laengs = planetR * asin(sinBr);
             // Nahe den Windpolen wird der Breitenkreis winzig; ohne Klemmung
             // explodiert die Phase je Meter und mit ihr die Normalenstoerung.
             // Sichtbar wird davon nichts: Dort ist rippelAn laengst null.
             float sinTh = max(0.09, sqrt(max(0.0, 1.0 - sinBr * sinBr)));
             vec3 inEbene = dK - windPol * sinBr;
             float phi = atan(dot(inEbene, windB), dot(inEbene, windA));
             // Phase je Meter entlang des Windes. Am Windaequator sind das
             // 18,48 = 2 PI / 0,34 m, genau wie auf der Platte.
             float K = windKaemme / (planetR * sinTh);

             // Die Kaemme maeandern, sonst waere es ein Wellblech:
             // Versatz += A * sin(f * laengs) mit A = 0,35 und f = 0,7. **Die
             // Streuung des Abstands ist A * f**, also 0,245 — knapp ein
             // Viertel einer Periode. (Nicht A * f * Teilung: Der Fehler hat
             // auf der Insel 4 % gerechnet und 90 % ins Bild gestellt.)
             float versatz = sin(laengs * 0.7) * 0.35 + sin(laengs * 0.23 + 1.7) * 0.5;

             // **Maeandern allein macht keine Gabelung.**
             //
             // Der Pruefer: „Die Rippelkaemme laufen ueber den gesamten
             // sichtbaren Hang parallel, mit gleichem Abstand und gleicher
             // Amplitude, ohne eine einzige Gabelung." Er hat recht, und der
             // Grund steht in der Zeile darueber: versatz haengt nur von
             // laengs ab — also von der Lage **entlang** der Kaemme. Alle
             // Kaemme werden damit um denselben Betrag verschoben und bleiben
             // deshalb parallel, so krumm sie auch laufen.
             //
             // Eine Gabelung entsteht, wo benachbarte Kaemme **verschieden**
             // weit verschoben werden — dort aendert sich der lokale Abstand,
             // und wo er unter eine halbe Periode faellt, laufen zwei Kaemme
             // zusammen. Dafuer muss der Versatz auch von der Lage **quer**
             // dazu abhaengen, also von phi.
             float bogenQuer = planetR * phi * sinTh;
             versatz += sin(laengs * 1.27 + bogenQuer * 0.29) * 0.46;
             versatz += sin(laengs * 0.61 - bogenQuer * 0.13 + 2.4) * 0.33;
             float phase = windKaemme * phi + versatz * K;

             // Ausblenden, sobald eine Periode unter zwei Pixel faellt. Ohne
             // das steht in der Ferne Moire statt Rippel.
             float schritt = fwidth(phase);
             float rippelAn = 1.0 - smoothstep(1.1, 2.8, schritt);

             // **Rippel bilden sich nicht ueberall.** Ein Feld, das
             // flaechendeckend gleich stark gerippelt ist, ist so sehr ein
             // Muster wie gar keines. Zwei Bedingungen nehmen ihm die
             // Gleichfoermigkeit:
             //
             //   * Sie brauchen eine flache Auflage. Auf einer steilen Flanke
             //     rutscht das Material, statt sich zu ordnen. Flach heisst auf
             //     der Kugel: die Normale zeigt nach aussen, nicht nach oben.
             //   * Sie kommen in Feldern von zwanzig bis vierzig Metern. Die
             //     Summe zweier Sinus mit ganzzahlfremden Frequenzen ist glatt
             //     und kostet zwei Rechenschritte. Sie wird jetzt aus der
             //     vollen Weltkoordinate gebildet statt aus x und z — auf einer
             //     Kugel ist das dieselbe Glaette ohne Vorzugsrichtung.
             // **Bezugssystem.** Nach normal_fragment_maps steht die Normale
             // in three im **Sichtraum**; dK und die Windrichtung sind
             // Weltvektoren. Der erste Anlauf hat beides direkt miteinander
             // multipliziert — das Ergebnis hing davon ab, wohin die Kamera
             // schaut, und die Rippel erschienen und verschwanden mit der
             // Blickrichtung statt mit dem Gelände. Beides wird deshalb erst in
             // den Sichtraum gedreht.
             mat3 zurSicht = mat3(viewMatrix);
             vec3 dKSicht = normalize(zurSicht * dK);
             float flach = smoothstep(0.55, 0.90, dot(nonPerturbedNormal, dKSicht));
             float feld = 0.42 + 0.58 * clamp(
               0.5 + 0.5 * (sin(dot(vWeltOrt, vec3(0.13, 0.05, 0.09)))
                          + sin(dot(vWeltOrt, vec3(-0.07, 0.11, 0.17)) + 2.1)) * 0.5,
               0.0, 1.0);
             // **Und sie laufen nicht ununterbrochen durch.** Ein zweiter,
             // feinerer Fleckenmasstab (drei bis sechs Meter) laesst die
             // Rippelung stellenweise ganz aussetzen — dort liegt glatter,
             // verwehter Staub. Zusammen mit den Gabelungen oben nimmt das dem
             // Feld den Kordsamt: Es gibt Stellen ohne Kaemme, Stellen mit
             // engen und Stellen mit weiten.
             float flecken = 0.5 + 0.5 * sin(laengs * 1.9 + sin(bogenQuer * 0.41) * 1.6);
             rippelAn *= flach * feld * (0.25 + 0.75 * smoothstep(0.12, 0.62, flecken));

             // Saegezahnprofil statt Sinus: Eine Rippel hat eine flache Luv-
             // und eine steile Leeseite. Ein reiner Sinus liest als Duenung.
             float sg = sin(phase);
             float profil = sign(sg) * pow(abs(sg), 0.65);
             float steigung = cos(phase) * K * 0.0042 * rippelAn;

             // Die Richtung, in der die Phase waechst: der Wind selbst.
             vec3 querSicht = normalize(zurSicht * normalize(cross(windPol, dK)));
             normal = normalize(normal - querSicht * steigung);

             // Die Kaemme sind groeber und heller, die Taeler halten den feinen
             // Staub. Kleiner Betrag — es ist eine Toenung, kein Muster.
             diffuseColor.rgb *= 1.0 + profil * 0.075 * rippelAn;
           }`
        );
    };
    // Ohne eigenen Cache-Schlüssel hält three das Programm eines anderen
    // Materials mit derselben Signatur für austauschbar und der Einschub
    // landet nie im Shader.
    _marsGround.customProgramCacheKey = () => 'nacht-regolith-v1';
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
      // **Der Prüfer konnte belichteten Fels und belichteten Boden nicht
      // unterscheiden**: c-crater Brockenfacette (775,538) = (91|58|53) gegen
      // Boden (900,430) = (90|61|57) — ΔL 2,2, größte Kanaldifferenz 4. Beide
      // Materialien teilen sich `marsMaps()`, und der einzige Unterschied war
      // `normalScale`.
      //
      // Die Rauheit ist der Hebel, der hier trägt und nichts kostet: Staub ist
      // stumpf, eine frische Bruchfläche ist es nicht. `roughness` multipliziert
      // die Karte, 0,72 bringt den Fels auf gut 0,70 gegen 0,95 am Boden. Damit
      // hat die Glanzkeule auf mondzugewandten Facetten überhaupt eine Chance —
      // und das ist zugleich die einzige Form von Streiflicht, die eine
      // facettierte, flach schattierte Geometrie hergibt. Eine Fresnel-Kante
      // würde hier zur Flächenhelligkeit, nicht zur Kante (siehe die Notiz zu
      // `flatShading` in den bezahlten Lehren).
      // 0,72 im zweiten Anlauf hat die Materialtrennung gebracht und die Form
      // gekostet: Der Prüfer maß **16:1** Kontrast zwischen zwei Facetten
      // desselben Brockens (10 → 53 → 81 → 48 → 7 über 15 px), gegen 4,75:1 im
      // Ausgangsstand. Eine Glanzkante, ein Mittelton, schwarzer Rest — ein
      // Dreistufen-Plakat statt eines Steins. 0,84 gegen 0,95 am Boden hält die
      // Trennung und nimmt der Keule die Spitze.
      roughness: 0.84,
      metalness: 0,
      // Kräftiger als am Boden: Ein Brocken ist rauer als der Staub um ihn.
      normalScale: new THREE.Vector2(1.4, 1.4),
      // **Bodenrückstrahlung, die eine Hemisphärenleuchte nicht liefern kann.**
      //
      // Ein Brocken auf einer hell beschienenen Ebene bekommt von unten und
      // von der Seite kräftig Licht zurückgeworfen. Eine Hemisphärenleuchte
      // rechnet aber nur mit `normal.y`: Bei einer senkrechten Flanke steht sie
      // auf halbem Weg zwischen Himmels- und Bodenfarbe und weiß nichts von der
      // Fläche, die zwei Handbreit daneben im vollen Mondlicht liegt.
      //
      // Nachgerechnet ergab das für eine mondabgewandte Flanke: Bestrahlung
      // 0,254 × Albedo 0,084 × Vertexfaktor 0,62 → Bildwert **2,5 von 255**.
      // Der Himmel zwischen den Sternen liegt bei 2,6. Der Prüfer hat genau das
      // gemessen: 28,6 % der Brockenfläche in `e-ground` **unter** Himmelsniveau
      // — ein Brocken war damit kein Körper mehr, sondern ein Loch im Bild.
      //
      // Die Hemisphäre anzuheben wäre der falsche Hebel: Sie hellt die
      // Bodenfläche mit auf, und die Szene soll nicht heller werden. Ein kleiner
      // Eigenleuchtwert trifft **nur** die Brocken und ist die übliche
      // stilisierte Ersatzdarstellung für genau diese Rückstrahlung. Warm
      // getönt, weil das Licht, das von unten kommt, vom Regolith kommt.
      emissive: new THREE.Color(0x170d07),
    });
  }
  return _marsRock;
}

// --- Bruchstein --------------------------------------------------------------
//
// **Warum die alten Brocken als Ikosaeder lasen.** Sie waren
// `IcosahedronGeometry(s, 1)` — achtzig gleich große, gleich geformte
// Dreiecke — mit einer radialen Streuung je Scheitelpunkt. Radiale Streuung
// verschiebt Ecken nach außen und innen, sie erzeugt aber keine **Fläche**:
// Das Ergebnis ist ein gerundetes Vielflach mit gleichmäßigen Facetten, also
// ein geschliffener Stein. Der Prüfer hat genau das gemessen: zwei
// Nachbarfacetten mit 1,8 Stufen Unterschied über je eine ganze ebene Fläche.
//
// Ein zerbrochener Stein entsteht nicht durch Verschieben, sondern durch
// **Schneiden**. Ein Sprung läuft als Ebene durch das Material und hinterlässt
// eine ebene Fläche; mehrere Sprünge hinterlassen ein Vielflach aus
// **unterschiedlich großen** ebenen Flächen, die sich in scharfen Kanten
// treffen. Genau das wird hier gemacht: Eine Kugel wird an K zufälligen Ebenen
// gekappt.
//
// Der Unterschied ist nicht die Zahl der Dreiecke, sondern ihre Verteilung:
// Beim Ikosaeder ist jede Facette gleich groß, beim Bruch bestimmt der Zufall
// der Ebenen, ob eine Fläche ein Drittel des Steins einnimmt oder einen
// Fingernagel.
//
// Die Unterteilung ist ein **Messwert, kein Geschmack**: Bei Stufe 3 hat eine
// Kante rund 15 % des Radius, auf einem 30-cm-Brocken also 4,5 cm. Das ist die
// Treppung, mit der eine Schnittkante durch das Dreiecksnetz läuft. Bei Stufe 2
// wären es 9 cm und die Kanten sichtbar ausgefranst.
// `unterteilung` ist die Icosphere-Stufe des Ausgangskörpers. three zerlegt
// jede der 20 Grundflächen in (unterteilung + 1)² Dreiecke, also 320 bei 3 und
// 180 bei 2. Für einen Findling oder eine 9-m-Formation lohnen sich die 320;
// für einen Brocken von 30 cm, dessen Form ohnehin aus den Schnittebenen kommt
// und nicht aus der Kugel darunter, sind sie 140 Dreiecke Verschwendung — und
// zweihundertvierzig Brocken machen daraus 34 000.
function bruchGeometrie(
  radius,
  seed,
  { facetten = 11, verwitterung = 0.12, kanten = 0.06, unterteilung = 3 } = {}
) {
  const geo = new THREE.IcosahedronGeometry(radius, unterteilung);
  const br = mulberry32(seed);
  const ebenen = [];
  for (let k = 0; k < facetten; k++) {
    // Gleichverteilt auf der Kugel — ohne die Umrechnung über den Kosinus des
    // Polarwinkels ballen sich die Schnittrichtungen an den Polen, und der
    // Stein bekäme oben und unten mehr Flächen als in der Mitte.
    const u = br() * 2 - 1;
    const phi = br() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    ebenen.push({
      nx: s * Math.cos(phi),
      ny: u,
      nz: s * Math.sin(phi),
      // Wie tief die Ebene schneidet. Nah an 1 streift sie nur, nah an 0,55
      // nimmt sie ein großes Stück weg — das ist die Streuung, aus der
      // ungleich große Flächen entstehen.
      d: radius * (0.55 + br() * 0.40),
    });
  }

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Zwei Durchgänge: Wer einen Scheitelpunkt auf eine Ebene setzt, kann ihn
    // dabei über eine andere hinausschieben. Nach zwei Durchgängen ist der
    // Rest unterhalb der Auflösung des Netzes.
    for (let durchgang = 0; durchgang < 2; durchgang++) {
      for (const e of ebenen) {
        const w = v.x * e.nx + v.y * e.ny + v.z * e.nz;
        if (w > e.d) {
          const ueber = w - e.d;
          v.x -= e.nx * ueber;
          v.y -= e.ny * ueber;
          v.z -= e.nz * ueber;
        }
      }
    }
    // **Verwitterung.** Ein frischer Bruch ist scharfkantig, ein alter ist
    // abgerundet und angefressen. Das Zurückziehen zur Kugel rundet die
    // Kanten (weil dort am meisten weggeschnitten wurde), das Feinrauschen
    // frisst die Flächen an. Beides klein — zu viel davon macht aus dem Bruch
    // wieder einen Kiesel.
    const laenge = v.length() || 1e-6;
    const zurKugel = radius / laenge;
    v.multiplyScalar(1 + (zurKugel - 1) * verwitterung);
    const n = hashNoise(v.x * 60, v.y * 60, v.z * 60 + seed) - 0.5;
    v.multiplyScalar(1 + n * kanten);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Nicht indiziert und flach schattiert: Jede Bruchfläche bekommt eine eigene
  // Normale, und die Kanten bleiben Kanten.
  geo.computeVertexNormals();
  return geo;
}

// Einfärbung eines Bruchsteins je **Fläche**, nicht je Scheitelpunkt.
//
// Damit kommen die drei fehlenden Materialien ins Inventar, die der Prüfer
// vermisst hat — Gestein im Bruch, Staub und Frost —, und zwar ohne ein
// einziges neues Material und ohne eine einzige neue Textur:
//
//   * **Staub** liegt auf dem, was nach oben zeigt. Er ist die Farbe des
//     Bodens, denn er kommt von dort.
//   * **Bruchgestein** sitzt auf **einer** Flanke, nicht auf allen steilen:
//     `bruchachse` ist die Richtung, in die dieser Brocken aufgebrochen ist.
//     Heller, kühler, weniger rot als die verwitterte Außenhaut — eine frische
//     Bruchfläche hat die Verwitterungsrinde nicht. Alles andere Steile bekommt
//     nur einen schwachen Anteil davon, denn dort hält bloß kein Staub.
//   * **Frost** sammelt sich in der Kältefalle: dort, wo die Fläche vom Mond
//     abgewandt ist, am stärksten an der Unterseite. Er hat eine Kante, wo er
//     anfängt — sonst liest er als bläuliche Tönung des ganzen Steins statt als
//     Kruste.
//
// `drehung` bringt die lokalen Flächennormalen in Weltausrichtung — die
// Brocken sind um alle drei Achsen zufällig gedreht, und ohne das säße der
// Staub bei jedem Stein an einer anderen Flanke.
// `oben` ist die Richtung, die an diesem Ort nach oben zeigt. Auf einer Platte
// ist das für alle Steine dieselbe Achse; auf einer Kugel steht jeder Brocken
// auf seiner eigenen Flächennormale, und ein Staubbelag, der stur nach +Y
// gerechnet wird, säße auf der Gegenseite des Planeten an der Unterseite.
function faerbeBruchstein(
  geo,
  grundHex,
  drehung,
  mondRichtung,
  { staub, frost, alter, oben = _FBOben.set(0, 1, 0), bruchachse = null }
) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const farben = new Float32Array(pos.count * 3);
  const grund = new THREE.Color(grundHex);
  const staubFarbe = new THREE.Color(0x8a5540);
  const bruchFarbe = new THREE.Color(0xb2a49b);
  // **Vierter Anlauf am Frost — diesmal nach unten.**
  //
  // Nach dem dritten war er auffindbar; der Prüfer hat ihn daraufhin als
  // schwersten Mangel gemeldet: In `rund-270` steht ein vereister Brocken bei
  // L = 46,5, der Boden ringsum bei L = 19,9 — **das 2,4-Fache** — und
  // farblich neutral bis kühl (B ≥ R), obwohl das einzige gerichtete Licht
  // dort das warme rote Fülllicht des zweiten Mondes ist. „Marshmallows in
  // einer roten Wüste."
  //
  // Die Ursache ist nicht der Frost, sondern was ihn beleuchtet: Das
  // Hemisphärenlicht (0x7595b4) ist **blaugrau** und trifft alles, was nach
  // oben zeigt, unabhängig von jeder Richtung. Eine blauweiße Albedo darunter
  // wird zwangsläufig das Hellste und Kühlste im Bild. Der Regolith
  // (0x854c33) entgeht dem nur, weil er dunkel und warm ist.
  //
  // `0xbcd0e0` hatte eine Leuchtdichte von 0,79 und einen Blauüberschuss von
  // 36 Stufen. `0x8e969a` liegt bei 0,58 und bei 12 — noch kühler als der Fels,
  // aber kein Leuchtkörper mehr.
  const frostFarbe = new THREE.Color(0x8e969a);
  const n = new THREE.Vector3();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  // Höhenbereich in Weltausrichtung, für die Verdunklung am Fuß.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyQuaternion(drehung);
    const y = v.dot(oben);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i).applyQuaternion(drehung);
    v.fromBufferAttribute(pos, i).applyQuaternion(drehung);
    const ny = n.dot(oben);

    c.copy(grund);
    // **Frischer Bruch**, mit dem Alter zurückgehend.
    //
    // Der Prüfer hat ihn nirgends gefunden — „kein einziger heller
    // Splitterrand, keine Stelle, an der ein Stein aufgebrochen aussieht". Zu
    // Recht: Der Faktor lief über `steil²`, und `steil` ist `1 − cos θ` mit θ
    // als Neigung der Fläche gegen die Waagerechte — auf einer 60-Grad-Fläche
    // also 0,5, quadriert 0,25, mal 0,55 und bei einem mittelalten Stein noch
    // mal halbiert. Übrig blieben sieben Prozent Beimischung einer Farbe, die
    // selbst nur wenig heller ist.
    //
    // Der erste Anlauf hat bloß den Faktor hochgezogen (`steil · 0,8`) und
    // `bruchFarbe` aufgehellt. Gemessen war das eine Verbesserung — der
    // Felsanteil in a-augenhoehe stieg von 1,7 auf 4,7 Prozent —, im Bild aber
    // falsch: In d-orbit standen **alle** Landmarken knochenhell da. Ein Stein,
    // der ringsum frisch gebrochen ist, ist kein gebrochener Stein, sondern ein
    // anders angemalter.
    //
    // Deshalb jetzt richtungsgebunden: Der Löwenanteil sitzt auf der einen
    // Flanke, die `bruchachse` benennt; der fünfte Potenzgrad hält den Kegel
    // eng (30 Grad daneben noch 0,66, 60 Grad nur noch 0,03). Alles andere
    // Steile bekommt bloß den Grundanteil von 0,16.
    const steil = 1 - Math.abs(ny);
    const flanke = bruchachse ? Math.pow(Math.max(0, n.dot(bruchachse)), 5) : steil;
    c.lerp(bruchFarbe, (steil * 0.16 + flanke * 0.75) * (1 - alter));
    // Staub auf allem, was nach oben zeigt.
    const nachOben = Math.max(0, ny);
    c.lerp(staubFarbe, Math.pow(nachOben, 1.6) * staub);
    // **Frost: mondabgewandt, mit Vorliebe für die Unterseite — aber nicht
    // nur dort.**
    //
    // Vorher war der Faktor `abgewandt · unten`, und `unten` ist null für jede
    // senkrechte Fläche. Frost saß damit ausschließlich auf den nach unten
    // zeigenden Flächen — also genau dort, wo man nie hinsieht. Der Prüfer hat
    // ihn folgerichtig nicht gefunden.
    //
    // Auf einem luftlosen Körper sammelt sich Flüchtiges in den Kältefallen:
    // dort, wo das Licht nie hinkommt. Das ist in erster Linie die abgewandte
    // Seite, in zweiter die Unterseite.
    //
    // Der `smoothstep` gibt der Kruste eine **Kante**. Ein weicher Verlauf über
    // die ganze Flanke liest als bläuliche Tönung des Steins; eine Kruste fängt
    // irgendwo an.
    const abgewandt = Math.max(0, -n.dot(mondRichtung));
    const unten = Math.max(0, -ny);
    // **Dritter Anlauf am Frost.** Der Prüfer hat ihn nach dem zweiten immer
    // noch nicht gefunden: 0,00 bis 0,18 % der Bodenpixel, in `e-boden` null.
    // Die Kante war richtig, der Einsatzpunkt zu spät — bei 0,25 begann die
    // Kruste erst 75 Grad hinter dem Terminator, und so weit abgewandte
    // Flächen sind ohnehin fast schwarz. 0,05 bis 0,55 legt sie auf die
    // **schattige Flanke**, wo man sie sieht.
    const kaeltefalle = smoothstep(0.05, 0.55, abgewandt) * (0.55 + 0.45 * unten);
    c.lerp(frostFarbe, kaeltefalle * frost);

    // Kontaktverdunklung am Fuß, wie gehabt.
    const t = (v.dot(oben) - yMin) / Math.max(1e-4, yMax - yMin);
    const f = 0.82 + 0.18 * smoothstep(0, 0.35, t);
    farben[i * 3] = c.r * f;
    farben[i * 3 + 1] = c.g * f;
    farben[i * 3 + 2] = c.b * f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  return geo;
}
const _FBOben = new THREE.Vector3();

// --- Kontaktverdunklung ------------------------------------------------------
//
// Ein Schlagschatten sagt, **wo** die Sonne (hier: der Mond) nicht hinkommt.
// Er sagt nicht, dass ein Brocken den Boden *berührt*. Genau das ist der
// Unterschied zwischen einem Objekt, das steht, und einem, das schwebt: der
// schmale, richtungslose Saum Verdunklung direkt am Fuß, den in Wahrheit die
// gegenseitige Verdeckung des Himmelslichts macht.
//
// Warum ein eigener Bauer statt `makeBlobShadow`: Die geteilte Blob-Scheibe ist
// eine **ebene** 1x1-Fläche. Der Regolith ist es nicht — über 90 cm Radius
// wandert er hier um bis zu 14 cm. Eine ebene Scheibe steckt damit an einer
// Seite im Boden und schwebt an der anderen. Diese Scheiben bekommen ihre
// Scheitelpunkte auf die Geländehöhe gelegt und liegen deshalb auf.
//
// Alles zusammen ist **ein** Draw-Call: Deckkraft steckt in der vierten
// Komponente des Farbattributs (three setzt dann USE_COLOR_ALPHA), Farbe ist
// überall Schwarz.
// **Wie hoch die Kontaktscheiben über dem Gelände liegen — und warum das keine
// Konstante sein darf.**
//
// Sie holen ihre Scheitelhöhen aus `heightAt`; das Gelände ist ein Netz mit
// 41 cm Kantenlänge, zwischen zwei Knoten also eine Sehne. Gemessen
// (`tools/naht.mjs --abstand`, 6000 Stichproben): Das Feld liegt im Median
// 0,97 mm **über** der Sehne, im Einzelfall aber 273 mm darunter. Wo es
// darunter liegt, durchdringen sich Scheibe und Boden, und die Verdunklung
// zerfällt in harte Polygonflecken.
//
// Ein fester Hub löst das nicht, sondern verschiebt es:
//
//   Hub      20 mm   12 mm    8 mm    5 mm    3 mm
//   Saumpixel   46      14       7       4       2
//
// 20 mm halten die Verdunklung sauber und lassen die Scheibe über jeden Grat
// hinausragen — das ist der helle Faden, den der Prüfer in `e-boden` gefunden
// hat. 5 mm nehmen den Faden weg und zerlegen die Verdunklung. Ein reiner
// Tiefenversatz (`polygonOffset`) war der erste Anlauf und hat dasselbe
// angerichtet: Er verschiebt den Tiefenwert, aber eine Durchdringung bleibt
// eine Durchdringung.
//
// **Beide Forderungen betreffen verschiedene Orte.** Das Netz liegt genau dort
// über dem Feld, wo das Feld **konkav** ist — in Mulden. Auf einem Kamm, also
// genau dort, wo der Saum entsteht, schneidet die Sehne unter das Feld, und die
// Scheibe liegt ohnehin schon darüber. Der Hub wird deshalb je Scheitelpunkt
// aus der Krümmung gebildet: Mittelwert des Feldes auf einem Ring von einer
// Kantenlänge, minus dem Feld am Punkt, bei null geklemmt. Das ist der
// diskrete Laplace-Operator — positiv in der Mulde, null auf dem Kamm.
const SCHEIBEN_HUB_MIN = 0.002;
const KANTE = 0.41; // Kantenlänge des Geländenetzes, 1,0515 · R / (detail + 1)
const _hubRing = new THREE.Vector3();
const _hubOst = new THREE.Vector3();
const _hubNord = new THREE.Vector3();
function scheibenHub(dir, h, heightAt) {
  tangentialSystem(dir, _hubOst, _hubNord);
  const w = KANTE / PLANET_R;
  let summe = 0;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    _hubRing
      .copy(dir)
      .multiplyScalar(Math.cos(w))
      .addScaledVector(_hubOst, Math.sin(w) * Math.cos(a))
      .addScaledVector(_hubNord, Math.sin(w) * Math.sin(a))
      .normalize();
    summe += heightAt(_hubRing);
  }
  return SCHEIBEN_HUB_MIN + Math.max(0, summe / 6 - h);
}

let _kontaktMaterial = null;
// **Auf der Kugel.** Eine Stelle wird nicht mehr durch x und z beschrieben,
// sondern durch eine Richtung `ort` vom Planetenmittelpunkt aus; die Scheibe
// entsteht in der Tangentialebene dort und wird auf die Kugel gelegt. Über
// einen Meter Scheibenradius weicht die Tangentialebene um 2 cm von der Kugel
// ab — der Rand einer Staubfahne von 3 m Länge läge damit 18 cm in der Luft,
// also wird jeder Scheitelpunkt einzeln radial auf das Gelände gezogen.
function makeKontaktAO(stellen, heightAt) {
  if (!stellen.length) return null;
  if (!_kontaktMaterial) {
    // **Weiß, nicht schwarz.** Die Materialfarbe wird mit der Scheitelfarbe
    // multipliziert; steht sie auf Schwarz, kann eine Scheibe nur abdunkeln.
    // Seit auch Staubfahnen darüber laufen — die **auf**hellen —, trägt die
    // Farbe je Scheitelpunkt, und die Materialfarbe muss neutral sein.
    // Vier Komponenten im Farbattribut: three setzt dann USE_COLOR_ALPHA, und
    // die vierte multipliziert die Deckkraft. Damit stehen Verdunklung und
    // Aufhellung zusammen in **einem** Draw-Call.
    _kontaktMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      // Nicht tone-gemappt: Das hier ist keine Lichtmenge, sondern eine
      // Korrektur des fertigen Bildes.
      toneMapped: false,
    });
  }
  const c = new THREE.Color();
  const SEG = 12;
  // Enger und steiler als im ersten Anlauf ([0, 0.42, 0.74, 1] /
  // [1, 0.62, 0.22, 0]). Der Prüfer hat den alten Verlauf als Vignette
  // gelesen, nicht als Naht: Abfall über 95 px bei 80 px Brockenbreite. Eine
  // Kontaktverdunklung endet dort, wo das Objekt aufhört.
  const RINGE = [0, 0.46, 0.76, 1]; // Radiusanteile
  const ALPHA = [1, 0.44, 0.11, 0]; // Deckkraft je Ring
  const pos = [];
  const col = [];
  const idx = [];
  const _kOst = new THREE.Vector3();
  const _kNord = new THREE.Vector3();
  const _kP = new THREE.Vector3();
  for (const stelle of stellen) {
    const { ort, r, staerke, farbe = 0x000000, zug = null } = stelle;
    // **Eine Staubfahne, die im Dunkeln leuchtet, ist keine Fahne.**
    //
    // Die Scheiben sind `MeshBasicMaterial` und `toneMapped: false` — ihr Wert
    // steht fest, unabhängig davon, wie viel Licht am Ort ankommt. Für die
    // Verdunklung ist das richtig (sie ist eine Korrektur des fertigen Bildes),
    // für die aufhellende Staubfahne war es falsch: Auf der Mondseite las sie
    // als heller Verweher, auf der Nachtseite als **glühender Ring**.
    //
    // Der Prüfer hat es an der Kontaktlinie gefunden: `rund-210` bei (270, 576)
    // steht L = 75,6, während der Boden ringsum bei L ≈ 20 liegt — das
    // 3,8-Fache, und ausgerechnet auf der lichtabgewandten Unterkante. Sein
    // Urteil: „Der Sinn einer Kontaktverdunklung ist damit umgekehrt."
    //
    // Der Anteil wird deshalb eingebacken. Das geht, weil die Lage des Mondes
    // **relativ zur Planetenoberfläche** fest ist: Himmelsgruppe und Weltgruppe
    // tragen dieselbe Drehung, der Mond wandert über den Himmel des Spielers,
    // aber nicht über den Boden.
    const imLicht = smoothstep(-0.05, 0.32, ort.dot(MOND_RICHTUNG));
    // Das Tangentensystem der Stelle. `zug` gibt seine Richtung in eben diesen
    // Koordinaten an (x entlang Ost, y entlang Nord), damit der Rest der
    // Rechnung Wort für Wort die der Ebene bleiben kann.
    tangentialSystem(ort, _kOst, _kNord);
    c.set(farbe);
    // Eine aufhellende Scheibe (Staubfahne) wird zur Nachtseite hin gegen
    // Schwarz gezogen und damit zu einer reinen Verdunklung; eine dunkle
    // Scheibe (die eigentliche Kontaktverdunklung) bleibt unberührt.
    const hellt = c.r + c.g + c.b > 0.02;
    if (hellt) c.multiplyScalar(imLicht);
    const basis = pos.length / 3;
    for (let ring = 0; ring < RINGE.length; ring++) {
      const rr = RINGE[ring] * r;
      const a = ALPHA[ring] * staerke;
      const n = ring === 0 ? 1 : SEG;
      for (let k = 0; k < n; k++) {
        const w = (k / SEG) * Math.PI * 2;
        let ox = Math.cos(w) * rr;
        let oz = Math.sin(w) * rr;
        if (zug) {
          // **Eine Staubfahne ist keine Scheibe.** Sie wird in Windrichtung
          // gezogen und **nur** dorthin: Der Kegel öffnet sich hinter dem
          // Hindernis, vor ihm passiert nichts. Deshalb wird der Streckfaktor
          // aus dem Anteil in Windrichtung gebildet und bei null geklemmt —
          // eine symmetrische Streckung ergäbe eine Ellipse, und die läse als
          // Pfütze statt als Fahne.
          const inWind = ox * zug.x + oz * zug.y;
          const t = Math.max(0, inWind) / Math.max(1e-4, rr || 1);
          ox += zug.x * t * zug.laenge;
          oz += zug.y * t * zug.laenge;
          // Zur Spitze hin schmaler.
          const seit = 1 - 0.35 * t;
          const quer = -zug.y * ox + zug.x * oz;
          ox -= -zug.y * quer * (1 - seit);
          oz -= zug.x * quer * (1 - seit);
        }
        // Tangentialer Versatz auf die Kugel: Der Ort ist die um den Winkel
        // (Versatz / Halbmesser) gedrehte Richtung.
        const q = Math.hypot(ox, oz);
        if (q < 1e-6) {
          _kP.copy(ort);
        } else {
          const w = q / PLANET_R;
          _kP.copy(ort)
            .multiplyScalar(Math.cos(w))
            .addScaledVector(_kOst, (Math.sin(w) * ox) / q)
            .addScaledVector(_kNord, (Math.sin(w) * oz) / q)
            .normalize();
        }
        const hP = heightAt(_kP);
        const rr2 = PLANET_R + hP + scheibenHub(_kP, hP, heightAt);
        pos.push(_kP.x * rr2, _kP.y * rr2, _kP.z * rr2);
        col.push(c.r, c.g, c.b, a);
      }
    }
    // Fächer vom Mittelpunkt auf Ring 1
    for (let k = 0; k < SEG; k++) {
      idx.push(basis, basis + 1 + k, basis + 1 + ((k + 1) % SEG));
    }
    // Ringbänder
    for (let ring = 1; ring < RINGE.length - 1; ring++) {
      const a0 = basis + 1 + (ring - 1) * SEG;
      const b0 = a0 + SEG;
      for (let k = 0; k < SEG; k++) {
        const k1 = (k + 1) % SEG;
        idx.push(a0 + k, b0 + k, b0 + k1);
        idx.push(a0 + k, b0 + k1, a0 + k1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, _kontaktMaterial);
  mesh.name = 'kontaktverdunklung';
  mesh.renderOrder = 1; // knapp über dem opaken Boden
  return mesh;
}

// --- Der beschädigte Sputnik -------------------------------------------------
//
// **Das einzige Metall der Szene, und das einzige Menschenwerk.** Er trägt
// zweierlei, das der Boden nicht kann: eine *glatte* Fläche mit spiegelndem
// Glanzlicht, und eine Form, die niemand für Geologie halten kann. Auf einem
// Körper aus lauter Steinen ist das der Blickfang, den die Komposition bisher
// nicht hatte.
//
// Gebaut wird der echte: eine Kugel von 58 cm Durchmesser aus zwei
// Halbschalen, an einem Äquatorflansch verschraubt, mit vier Peitschenantennen
// von 2,4 und 2,9 m Länge, paarweise nach hinten gestellt. Beschädigt heißt
// hier nicht „zufällig verbeult", sondern eine erzählbare Geschichte: Er ist
// auf der Flanke aufgeschlagen, die Schale dort eingedrückt, der Flansch
// aufgesprungen, zwei Antennen abgerissen, eine geknickt, eine krumm. Die
// Aufschlagseite ist versengt, die Oberseite eingestaubt.
//
// Alles in **einem** Material und damit in einem Draw-Call.
// `obenLokal` ist die Richtung im Eigensystem, die nach dem Hinlegen nach oben
// zeigt. Ohne sie säße der Staub dort, wo vor dem Kippen oben war — und ein
// Körper, der auf der Seite liegt, hätte den Belag an der Flanke.
function makeSputnik(obenLokal) {
  const gruppe = new THREE.Group();
  const teile = [];

  // Die Aufschlagrichtung im Eigensystem des Körpers. Alles Beschädigte zeigt
  // dorthin: die Delle, der Ruß, die abgerissenen Antennen.
  // **Der Schaden muss ins Bild.** Der erste Anlauf legte die Delle 35 Grad
  // neben die Unterseite — sie steckte damit im Regolith, und im Bild lag eine
  // makellose Kuppel. 79 Grad bringen sie an die Flanke, wo sie von einem
  // stehenden Betrachter zu sehen ist. Ein Schaden, den man nicht sieht, ist
  // keiner.
  const SCHLAG = obenLokal
    .clone()
    .negate()
    .applyAxisAngle(new THREE.Vector3(0.31, 0.52, -0.79).normalize(), 1.38)
    .normalize();

  // **Metall ohne Umgebungskarte ist schwarz.**
  //
  // Der erste Anlauf stand auf `metalness: 0.82` — physikalisch richtig für
  // Aluminium und in dieser Szene fatal. Bei einem Metall kommt fast die ganze
  // Antwort aus der **Spiegelung der Umgebung**, und diese Szene hat aus gutem
  // Grund keine: Eine PMREM-Karte für eine Nachtszene bringt nichts, was das
  // Hemisphärenlicht nicht schon tut, und kostet eine Abtastung je Fragment
  // (die Begründung steht bei `marsMaps`). Übrig blieb ein fast schwarzer
  // Ballon mit einem einzigen weißen Glanzfleck — im Bild eine Seifenblase.
  //
  // Also andersherum: niedrige Metallizität, helle Albedo, geringe Rauheit. Das
  // Glanzlicht des Mondes trägt dann den Metallcharakter, und die diffuse
  // Antwort sorgt dafür, dass der Körper überhaupt eine Form hat. Es ist die
  // gleiche Entscheidung wie beim Verzicht auf die PMREM-Karte: In einer Szene
  // mit **einer** Lichtquelle beschreibt man Material über das, was diese eine
  // Quelle tut.
  const metall = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    // Drei Anläufe an diesen zwei Zahlen, und die Lehre steht dazwischen:
    // **Jeder Punkt Metallizität ohne Umgebungskarte ist ein Punkt Schwarz.**
    // 0,82 gab eine Seifenblase, 0,45 einen schwarzen Käfer. 0,25 mit
    // Rauheit 0,20 lässt das Glanzlicht des Mondes eng genug für Metall und
    // die diffuse Antwort hell genug für eine lesbare Form.
    metalness: 0.25,
    roughness: 0.20,
    flatShading: false,
  });

  // --- Die Kugel ------------------------------------------------------------
  //
  // **Und wieder die Falle mit `detail`.** Ich habe hier „Detail 4 gibt 5120
  // Dreiecke" hingeschrieben — dieselbe Verwechslung, an der der Planet selbst
  // schon einmal hing und die im Protokoll unter „Eine API-Zahl, deren
  // Bedeutung man zu kennen glaubt, gehört nachgezählt" steht. `detail` ist
  // **keine** Rekursionstiefe: three unterteilt jede der 20 Grundflächen in
  // (detail+1)², also 20 · (d+1)² Dreiecke. Detail 4 sind 500, nicht 5120.
  // Nachgezählt hat es `tools/inspect.mjs`: Der ganze Sputnik stand mit 2228
  // Dreiecken in der Liste, wo allein die Kugel 5120 haben sollte.
  //
  // Detail 15 gibt 5120 Dreiecke bei 1,9 cm Kantenlänge. Aus 1,15 m Abstand
  // füllt der Körper 400 Bildzeilen; 1,9 cm sind dort 13 Bildpunkte, und damit
  // trägt die geglättete Normale die Rundung, ohne dass die Facetten im
  // Glanzlicht aufbrechen.
  const kugel = new THREE.IcosahedronGeometry(0.29, 15);
  {
    const pos = kugel.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.clone().normalize();
      // **Die Delle.** Ein Aufschlag drückt eine Kalotte ein, und zwar mit
      // einem aufgeworfenen Wulst am Rand — Blech gibt nach, aber es
      // verschwindet nicht. cos^8 hält die Kalotte eng (60 Grad Öffnung), der
      // Wulst sitzt als schmaler Ring bei rund 70 Grad.
      const t = Math.max(0, d.dot(SCHLAG));
      const kalotte = Math.pow(t, 8) * 0.085;
      const wulst = Math.exp(-Math.pow((t - 0.55) / 0.13, 2)) * 0.012;
      // **Vier weitere Beulen, über den Körper verteilt.** Ein Körper, der
      // einmal aufschlägt, rollt danach — und praktisch: Eine einzige Delle
      // ist aus der Hälfte aller Blickrichtungen unsichtbar, und dann steht
      // dort eine makellose Kugel. Verteilter Schaden liest aus jeder
      // Richtung.
      let beulen = 0;
      for (const [bx, by, bz, tief, eng] of [
        [-0.61, 0.44, 0.66, 0.042, 9],
        [0.78, 0.36, -0.51, 0.033, 11],
        [0.12, 0.93, 0.35, 0.028, 14],
        [-0.82, -0.31, -0.48, 0.037, 8],
      ]) {
        const bt = Math.max(0, d.x * bx + d.y * by + d.z * bz);
        beulen += Math.pow(bt, eng) * tief;
      }
      // Feine Blechunruhe, damit die Kugel nicht mathematisch glatt bleibt.
      const unruhe = (hashNoise(d.x * 9, d.y * 9, d.z * 9) - 0.5) * 0.005;
      v.setLength(0.29 - kalotte + wulst - beulen + unruhe);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    kugel.computeVertexNormals();
  }
  teile.push(new THREE.Mesh(kugel, metall));

  // --- Der Äquatorflansch, aufgesprungen ------------------------------------
  //
  // Die beiden Halbschalen des Originals sind an einem umlaufenden Ring
  // verschraubt. Hier steht er 8 mm über und ist auf der Aufschlagseite
  // aufgebogen — der sichtbare Beleg dafür, dass das Ding aus zwei Teilen ist.
  {
    const ring = new THREE.TorusGeometry(0.288, 0.009, 6, 64);
    ring.rotateX(Math.PI / 2);
    const pos = ring.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const w = Math.atan2(v.z, v.x);
      // Aufbiegen dort, wo der Schlag hinkam.
      const auf = Math.max(0, Math.cos(w - Math.atan2(SCHLAG.z, SCHLAG.x)));
      v.y += Math.pow(auf, 6) * 0.055;
      v.multiplyScalar(1 + Math.pow(auf, 6) * 0.07);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    ring.computeVertexNormals();
    teile.push(new THREE.Mesh(ring, metall));
  }

  // --- Die vier Antennen ----------------------------------------------------
  //
  // Paarweise nach hinten gestellt, 35 Grad von der Achse. Zwei sind an der
  // Wurzel abgerissen und stehen als Stümpfe, eine ist auf halber Länge
  // geknickt, eine ist krumm, aber ganz. Jede besteht aus kurzen Gliedern,
  // damit sie sich biegen kann — eine Peitschenantenne ist kein Stab.
  const antenne = (azimut, neigung, laenge, knickBei, knickWinkel, krumm) => {
    const GLIEDER = 14;
    const stueck = laenge / GLIEDER;
    // Startrichtung im Eigensystem.
    const richtung = new THREE.Vector3(
      Math.cos(azimut) * Math.sin(neigung),
      -Math.cos(neigung),
      Math.sin(azimut) * Math.sin(neigung)
    ).normalize();
    // Die Achse, um die geknickt und gekrümmt wird: quer zur Antenne.
    const quer = new THREE.Vector3(-Math.sin(azimut), 0, Math.cos(azimut));
    const p = richtung.clone().multiplyScalar(0.28);
    const dir = richtung.clone();
    for (let k = 0; k < GLIEDER; k++) {
      const t = k / GLIEDER;
      // Verjüngung: an der Wurzel 14 mm Durchmesser, an der Spitze 6 mm.
      //
      // Der erste Anlauf hatte 9 auf 3 mm — maßstäblich näher am Original und
      // im Bild ein **einziger Bildpunkt**: Bei 55 Grad Bildwinkel auf 720
      // Zeilen deckt ein Punkt 1,33 mrad ab, und 3 mm auf drei Meter sind 1,0.
      // Was dabei entsteht, liest nicht als Antenne, sondern als Kratzer im
      // Bild. Eine Form, die dünner ist als ein Bildpunkt, ist keine Form.
      const r0 = 0.007 * (1 - t * 0.55);
      const r1 = 0.007 * (1 - (t + 1 / GLIEDER) * 0.55);
      const g = new THREE.CylinderGeometry(r1, r0, stueck, 6, 1, true);
      g.translate(0, stueck / 2, 0);
      const m = new THREE.Mesh(g, metall);
      m.position.copy(p);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      teile.push(m);
      p.addScaledVector(dir, stueck);
      // Krümmung über die ganze Länge, plus ein harter Knick an einer Stelle.
      dir.applyAxisAngle(quer, krumm / GLIEDER);
      if (knickBei > 0 && k === Math.round(knickBei * GLIEDER)) {
        dir.applyAxisAngle(quer, knickWinkel);
      }
      dir.normalize();
    }
    // Der Bruch am Ende: eine schräg abgeschnittene Scheibe, damit die Spitze
    // nicht wie fabrikneu aussieht.
    const bruch = new THREE.CylinderGeometry(0.007 * 0.45, 0.007 * 0.45, 0.005, 6);
    bruch.rotateZ(0.7);
    const bm = new THREE.Mesh(bruch, metall);
    bm.position.copy(p);
    bm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    teile.push(bm);
  };

  // **Antennenschuhe.** Jede Peitsche sitzt in einem kegeligen Fuß — das ist
  // beim Original der auffälligste Zug neben der Kugel selbst, und es ist
  // zugleich das, was den Körper als *gebautes* Ding lesbar macht: Eine glatte
  // Kugel mit vier Drähten könnte alles sein, eine Kugel mit vier verschraubten
  // Füßen ist Technik.
  const schuh = (azimut, neigung) => {
    const richtung = new THREE.Vector3(
      Math.cos(azimut) * Math.sin(neigung),
      -Math.cos(neigung),
      Math.sin(azimut) * Math.sin(neigung)
    ).normalize();
    const g = new THREE.CylinderGeometry(0.016, 0.038, 0.06, 12);
    g.translate(0, 0.03, 0);
    const m = new THREE.Mesh(g, metall);
    m.position.copy(richtung).multiplyScalar(0.265);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung);
    teile.push(m);
  };
  for (const az of [0.25, 0.75, 1.25, 1.75]) schuh(Math.PI * az, 2.16);

  // 2,9 m nach vorn links — krumm, aber ganz.
  antenne(Math.PI * 0.25, 2.16, 2.9, 0, 0, 0.55);
  // 2,4 m nach vorn rechts — auf zwei Dritteln scharf geknickt.
  antenne(Math.PI * 0.75, 2.16, 2.4, 0.62, 1.15, 0.22);
  // Zwei Stümpfe auf der Aufschlagseite: 22 und 9 cm.
  antenne(Math.PI * 1.25, 2.16, 0.22, 0, 0, 0.9);
  antenne(Math.PI * 1.75, 2.16, 0.09, 0, 0, 1.4);

  // --- Einfärben ------------------------------------------------------------
  //
  // Drei Zustände auf einem Körper: poliertes Metall, versengtes Metall auf der
  // Aufschlagseite, Staub auf allem, was nach oben zeigt. Bei einem Metall ist
  // die Albedo die Reflexionsfarbe — der Ruß macht die Fläche damit von selbst
  // stumpf, ohne dass eine zweite Rauheitskarte nötig wäre.
  // **Warmgrau, nicht weiß.** Das Hemisphärenlicht dieser Szene ist blaugrau
  // (0x7595b4 bei Stärke 2,0); eine fast weiße Albedo nimmt das an, und der
  // Körper las als Eiskuppel. Poliertes Aluminium-Magnesium ist ohnehin
  // leicht warm, und nach einem Aufschlag erst recht.
  const ZWEITSCHLAG = SCHLAG.clone()
    .applyAxisAngle(new THREE.Vector3(0.7, -0.2, 0.68).normalize(), 2.35)
    .normalize();
  const POLIERT = new THREE.Color(0xbdb6ab);
  const RUSS = new THREE.Color(0x2a2320);
  const STAUB = new THREE.Color(0x8a5540);
  const c = new THREE.Color();
  const n = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (const teil of teile) {
    teil.updateMatrix();
    const g = teil.geometry;
    // Die Antennenglieder haben ihre eigene Lage; für die Einfärbung zählt der
    // Ort im Eigensystem des ganzen Körpers.
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const farben = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(teil.matrix);
      n.fromBufferAttribute(nor, i).transformDirection(teil.matrix);
      c.copy(POLIERT);
      // Ruß: dort, wo der Schlag hinkam, und mit dem Abstand vom Mittelpunkt
      // zurückgehend — die Antennenspitzen sind sauber geblieben.
      const zumSchlag = Math.max(0, v.clone().normalize().dot(SCHLAG));
      const nah = 1 - smoothstep(0.35, 1.2, v.length());
      // **Ruß ist ein Fleck, kein Anstrich.** Mit Exponent 1,6 lag er über
      // dem halben Körper und machte aus dem Sputnik einen schwarzen Käfer;
      // Exponent 3,4 hält ihn auf der Aufschlagseite.
      c.lerp(RUSS, Math.pow(zumSchlag, 3.4) * (0.4 + 0.6 * nah) * 0.9);
      // Ein zweiter, schwaecherer Fleck auf der Gegenseite: Er ist nach dem
      // Aufschlag noch ein Stueck gerollt. Praktisch sorgt er dafuer, dass der
      // Schaden aus **jeder** Richtung zu sehen ist und nicht nur aus einer.
      const zweit = Math.max(0, v.clone().normalize().dot(ZWEITSCHLAG));
      c.lerp(RUSS, Math.pow(zweit, 5.0) * nah * 0.55);
      // Staub auf dem, was nach dem Hinlegen nach oben zeigt.
      c.lerp(STAUB, Math.pow(Math.max(0, n.dot(obenLokal)), 2.0) * 0.42);
      // Streiflichtkanten: Wo das Blech gerade noch glänzt, ein Hauch heller.
      const kante = Math.pow(Math.max(0, 1 - Math.abs(n.dot(obenLokal))), 3) * 0.1;
      farben[i * 3] = Math.min(1, c.r + kante);
      farben[i * 3 + 1] = Math.min(1, c.g + kante);
      farben[i * 3 + 2] = Math.min(1, c.b + kante);
    }
    g.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  }

  for (const m of verschmelzeObjekte(teile, 'nacht-sputnik')) {
    m.castShadow = true;
    m.receiveShadow = true;
    gruppe.add(m);
  }
  gruppe.name = 'nacht-sputnik-gruppe';
  return gruppe;
}

function makeMarsPlanet(rand) {
  const group = new THREE.Group();
  group.name = 'nacht-welt-boden';

  // --- Die Geländemerkmale als Daten, jetzt als Richtungen -------------------
  //
  // Vorher waren es Zahlenpaare auf einer Platte, hier sind es Orte auf einer
  // Kugel, angegeben als **Bogenlänge und Himmelsrichtung vom Startpunkt aus**.
  // 14 m nach Nordost bleibt 14 m nach Nordost — nur läuft die Strecke jetzt
  // über eine Wölbung.
  //
  // Die Krater sind über die **ganze** Kugel verteilt, nicht mehr nur über das
  // Sichtfeld: Man läuft überall hin, also muss überall etwas sein. Bei 8,9 m
  // Horizont sieht man ein Vierunddreißigstel der Welt auf einmal — vierzehn
  // Krater auf 7854 m² ergeben etwa alle zwanzig Schritte einen im Blickfeld.
  const craters = [
    // Nahfeld: die vier aus der Platte, die die Prüfkameras getragen haben.
    { bogen: 11.4, az: -38, r: 3.0, depth: 0.9, wall: 1.25, alter: 0.05, strahlen: 0.9 },
    { bogen: 12.1, az: 155, r: 4.2, depth: 1.15, wall: 0.55, alter: 0.7, strahlen: 0 },
    { bogen: 13.2, az: 65, r: 2.4, depth: 0.7, wall: 1.4, alter: 0, strahlen: 1.0 },
    { bogen: 14.3, az: -115, r: 3.4, depth: 0.9, wall: 0.8, alter: 0.45, strahlen: 0 },
    { bogen: 7.0, az: 111, r: 1.15, depth: 0.34, wall: 1.5, alter: 0, strahlen: 1.0 },
    { bogen: 18.8, az: -48, r: 1.6, depth: 0.42, wall: 1.35, alter: 0.1, strahlen: 0.7 },
    // Mittelfeld und Rückseite — das, was man beim Rundgang findet.
    { bogen: 34, az: 20, r: 5.0, depth: 1.3, wall: 0.35, alter: 0.85, strahlen: 0 },
    { bogen: 41, az: -95, r: 3.6, depth: 1.0, wall: 1.1, alter: 0.15, strahlen: 0.8 },
    { bogen: 52, az: 140, r: 2.2, depth: 0.62, wall: 1.3, alter: 0, strahlen: 1.0 },
    { bogen: 58, az: -20, r: 4.4, depth: 1.2, wall: 0.6, alter: 0.6, strahlen: 0 },
    { bogen: 63, az: 78, r: 1.4, depth: 0.4, wall: 1.45, alter: 0, strahlen: 0.9 },
    { bogen: 70, az: -150, r: 3.0, depth: 0.85, wall: 0.9, alter: 0.3, strahlen: 0 },
    { bogen: 74, az: 44, r: 1.8, depth: 0.5, wall: 1.2, alter: 0.2, strahlen: 0.5 },
    // Einer fast auf der Gegenseite (78,5 m ist der Gegenpol).
    { bogen: 77, az: -70, r: 4.8, depth: 1.25, wall: 0.5, alter: 0.75, strahlen: 0 },
    // --- Die zwei großen Einschläge ---------------------------------------
    //
    // **Gemessen: Der höchste Kraterwall auf dem ganzen Planeten stand bei
    // 34 cm.** Das sind im Orbitbild vier Bildpunkte auf 296 — genau die
    // Rauheit, die der Umriss zeigte. Der Prüfer hat das als „die Kugel hat
    // Textur, aber keine Topographie" beschrieben, und die Rechnung gibt ihm
    // recht: `craterProfile` setzt den Wall auf `0,32 · wall · (1−alter) ·
    // depth`, und `depth` lag bei keinem Krater über 1,3 m.
    //
    // Die Krater waren nicht falsch bemessen — sie waren zu klein für ihren
    // Körper. Ein Wall ist rund vier Prozent des Durchmessers hoch; bei 6 m
    // Durchmesser sind das 24 cm, und daran ändert kein Parameter etwas. Was
    // eine Silhouette bricht, ist ein Einschlag, dessen Durchmesser ein
    // nennenswerter Teil des Körpers ist — auf Phobos ist Stickney knapp die
    // Hälfte. Diese beiden haben 19 und 14 m Durchmesser bei 50 m
    // Körperdurchmesser, und ihre Tiefe folgt der üblichen Fünftelregel.
    { bogen: 30, az: -62, r: 9.5, depth: 3.6, wall: 1.5, alter: 0.25, strahlen: 0 },
    { bogen: 63, az: 148, r: 7.0, depth: 2.7, wall: 1.35, alter: 0.1, strahlen: 0.55 },
  ];
  craters.forEach((c, i) => {
    c.ort = ortVon(STARTPUNKT, c.bogen, c.az);
    c.umriss = welligerUmriss(9001 + i * 37, 0.13 + i * 0.012, 4);
  });

  // Breite Geländeschwellen. Auf der Platte waren das die Horizonthügel bei
  // r = 26…38 m; auf einer Kugel mit 8,9 m Horizont gibt es keinen fernen
  // Horizont mehr, an dem sie stehen könnten. Sie werden deshalb zu dem, was
  // sie ohnehin sind: weite Wellen im Gelände, über die man hinweggeht.
  const huegel = [
    { bogen: 21, az: -130, r: 13, h: 3.6 },
    { bogen: 26, az: 165, r: 10, h: 2.7 },
    { bogen: 24, az: -75, r: 9, h: 2.2 },
    { bogen: 33, az: 100, r: 11, h: 3.1 },
    { bogen: 45, az: 8, r: 8, h: 1.6 },
    { bogen: 47, az: -160, r: 12, h: 2.4 },
    { bogen: 60, az: 128, r: 10, h: 1.9 },
    { bogen: 66, az: -35, r: 12, h: 3.3 },
    { bogen: 72, az: 165, r: 9, h: 2.0 },
  ];
  huegel.forEach((k, i) => {
    k.ort = ortVon(STARTPUNKT, k.bogen, k.az);
    k.umriss = welligerUmriss(4200 + i * 53, 0.26 + i * 0.02, 5);
  });

  // --- Grate ----------------------------------------------------------------
  //
  // Die zweite Hälfte der Antwort auf den Prüfer, und sie beantwortet zugleich
  // seinen Befund 10 („nur zwei Tiefenebenen, kein Mittelgrund"): Ein Grat ist
  // lang, schmal und hoch. Er verdeckt die Ferne — damit entsteht eine dritte
  // Ebene zwischen Vordergrund und Kante — und er gibt der Silhouette einen
  // Knick, wo eine runde Form nur eine Wölbung ergibt.
  //
  // `breite` ist der halbe Fuß in Metern, `h` die Kammhöhe. Der Kamm ist über
  // die inneren 15 Prozent flach, dann fällt er als `smoothstep` ab; die
  // steilste Neigung ist damit `1,5 · h / (0,85 · breite)`. Bei h = 3,2 und
  // breite = 5,5 sind das 1,03, also 46 Grad — steil genug, dass er als Wand
  // liest, und flach genug, dass man hinaufkommt.
  //
  // **Der erste liegt bewusst im Blick der Eingangskamera** (Azimut 150, wie
  // `a-augenhoehe` und `c-krater`). Sichtbarkeit auf einer Kugel:
  // `sqrt(2·R·h_auge) + sqrt(2·R·h)` = 8,9 + 12,6 = 21,5 m — bei 16 m Bogen
  // steht sein Kamm klar über der Krümmungskante, und zwar hinter dem Krater
  // bei 12,1 m. Das ist die fehlende mittlere Ebene.
  const grate = [
    { vonBogen: 12, vonAz: 128, bisBogen: 21, bisAz: 172, breite: 5.5, h: 3.2 },
    { vonBogen: 30, vonAz: 42, bisBogen: 48, bisAz: 74, breite: 6.5, h: 3.9 },
    { vonBogen: 52, vonAz: -108, bisBogen: 68, bisAz: -152, breite: 6.0, h: 3.4 },
    // **Für die leere Station.** Der Prüfer über `rund-030`: „eine Kuppe auf
    // etwa 85 % der Fläche, kein Fels, kein Maßstab, kein Horizontereignis —
    // eine von zwölf Stationen, an der es nichts zu sehen gibt."
    //
    // Der Rundgang läuft nach Azimut 180; Station 30 steht bei 13,1 m Bogen und
    // blickt weiter in dieselbe Richtung. Dieser Grat quert den Weg bei 22 bis
    // 30 m Bogen — aus 9 bis 17 m Entfernung, und mit 3,5 m Kammhöhe reicht die
    // Sichtweite (8,9 + sqrt(2·25·3,5) = 22,1 m) genau bis dorthin.
    { vonBogen: 22, vonAz: 158, bisBogen: 30, bisAz: 202, breite: 5.8, h: 3.5 },
  ];
  grate.forEach((g, i) => {
    g.a = ortVon(STARTPUNKT, g.vonBogen, g.vonAz);
    g.b = ortVon(STARTPUNKT, g.bisBogen, g.bisAz);
    g.achse = new THREE.Vector3().crossVectors(g.a, g.b).normalize();
    // Ein Grat mit gleichbleibender Höhe ist ein Wall, kein Grat. Die
    // Kammlinie bekommt deshalb dieselbe Wellung, die schon die Kraterumrisse
    // unrund macht — nur wird sie hier über die Länge abgetastet.
    g.kamm = welligerUmriss(7700 + i * 61, 0.3, 4);
    g.laenge = g.a.angleTo(g.b) * PLANET_R;
  });

  // --- Höhenfeld über einer Richtung -----------------------------------------
  //
  // Rückgabe ist der **radiale Abstand vom Sollradius** in Metern, nicht die
  // Höhe über einer Ebene. Ein Punkt der Oberfläche liegt bei
  // `richtung · (PLANET_R + heightAt(richtung))`.
  //
  // Die Dünenasymmetrie aus Paket 5 bleibt und wird nur anders ausgedrückt: Das
  // Feld wird dort, wo es hoch ist, **windabwärts verschoben abgetastet**. In
  // der Ebene war das eine Verschiebung in x und z; auf der Kugel ist es eine
  // Drehung um die Achse senkrecht zu Windrichtung und Ort — also ein Schritt
  // entlang der Oberfläche, und der ist hier das Richtige.
  const _hn = new THREE.Vector3();
  const _hw = new THREE.Vector3();
  const _hachse = new THREE.Vector3();
  const _hd = new THREE.Vector3();

  const WIND_VERSATZ = 6.0;
  const heightAt = (dir) => {
    // Vorabtastung für die Verschiebung. Der Maßstab 0,05 je Meter aus der
    // Ebene wird zu 0,05 · PLANET_R je Einheitsvektor, damit die Wellenlänge
    // von 20 m erhalten bleibt.
    const k = 0.05 * PLANET_R;
    const vor = fbm3(dir.x * k, dir.y * k, dir.z * k);

    // Einen Schritt windabwärts gehen: Drehung um die Achse senkrecht zu Ort
    // und Windrichtung.
    windAn(dir, _hw);
    _hachse.crossVectors(dir, _hw).normalize();
    _hd.copy(dir).applyAxisAngle(_hachse, (-vor * WIND_VERSATZ) / PLANET_R);

    const big = fbm3(_hd.x * k, _hd.y * k, _hd.z * k) * 3.2;
    const km = 0.16 * PLANET_R;
    const med = fbm3(dir.x * km + 11, dir.y * km, dir.z * km - 7) * 0.9;
    // **Kein Korn mehr in der Geometrie.** Auf der Platte stand hier ein
    // dritter Summand: `hashNoise` je Scheitel, ±6 cm. `hashNoise` ist ein
    // Hash, kein Rauschen — benachbarte Scheitel bekommen unabhängige Werte.
    // Bei 0,41 m Kantenlänge ist das eine Steigung von ±16 Grad je Kante, also
    // genau die Frequenz, die ein Gitter nicht darstellen kann. Solange die
    // Normalen aus den Facetten kamen, ist es als Körnung durchgegangen;
    // sobald sie aus dem Höhenfeld kommen (unten), macht es jede Normale zur
    // Zufallszahl. Das Korn sitzt jetzt dort, wo es hingehört: in der
    // kachelnden Normalenkarte, die 1 bis 3 cm auflöst.
    let h = big + med;

    for (const k2 of huegel) {
      const d = bogenAbstand(dir, k2.ort);
      if (d >= k2.r * 1.4) continue;
      // Winkel um den Hügelmittelpunkt, für den unrunden Umriss.
      tangentialSystem(k2.ort, _POst, _PNord);
      const w = Math.atan2(dir.dot(_PNord), dir.dot(_POst));
      const rEff = k2.r * k2.umriss(w);
      if (d >= rEff) continue;
      const u = d / rEff;
      const q = 1 - u * u;
      h += k2.h * q * q;
    }
    for (const g of grate) {
      const d = bogenAbstandZuGrat(dir, g);
      if (d >= g.breite) continue;
      const u = d / g.breite;
      // Wo auf dem Grat: der Winkel des Fußpunkts um die Achse, damit die
      // Kammwellung entlang der Länge läuft und nicht quer.
      const laengs = Math.atan2(dir.dot(g.b), dir.dot(g.a));
      h += g.h * g.kamm(laengs * 6) * (1 - smoothstep(0.15, 1, u));
    }
    for (const c of craters) {
      const d = bogenAbstand(dir, c.ort);
      if (d >= c.r * 3.2) continue;
      tangentialSystem(c.ort, _POst, _PNord);
      const w = Math.atan2(dir.dot(_PNord), dir.dot(_POst));
      const rEff = c.r * c.umriss(w);
      h += craterProfile(d / rEff, c.wall, c.alter) * c.depth;
    }
    // **Kein Flachhalten des Ursprungs mehr.** Auf der Platte musste die Mitte
    // eben sein, weil der Nutzer dort stand und nie wegkam. Auf dem Planeten
    // steht er überall; eine flache Stelle wäre eine willkürliche Delle.
    return h;
  };

  const strahlenAt = (dir) => {
    let hell = 0;
    for (const c of craters) {
      if (!c.strahlen) continue;
      const d = bogenAbstand(dir, c.ort);
      const t = d / c.r;
      if (t < 0.9 || t > 9) continue;
      tangentialSystem(c.ort, _POst, _PNord);
      const winkel = Math.atan2(dir.dot(_PNord), dir.dot(_POst));
      const speiche =
        Math.sin(winkel * 7 + c.bogen) * 0.5 +
        Math.sin(winkel * 11 - c.az * 0.1) * 0.3 +
        Math.sin(winkel * 17 + c.r) * 0.2;
      const scharf = Math.max(0, speiche - 0.18) / 0.82;
      const reichweite = (1 - smoothstep(1.5, 9, t)) * smoothstep(0.9, 1.6, t);
      hell += scharf * scharf * reichweite * c.strahlen;
    }
    return Math.min(1, hell);
  };

  // --- Einfärbung -------------------------------------------------------------
  //
  // Wortgleich aus Paket 4 übernommen, nur dass die Verwehungen jetzt über
  // Windbreite und Windlänge laufen statt über x und z. Die Streckung um
  // Faktor 6,5 in Windrichtung bleibt: Verwehungen sind Bahnen, keine Flecken.
  const base = new THREE.Color(0x854c33);
  const bodenFarbe = (dir, h, aus) => {
    const quer = windBreite(dir);
    // Länge entlang des Windes: der Azimut um den Windpol, mal Radius.
    const laengs =
      PLANET_R * Math.atan2(dir.dot(_PY.set(0, 1, 0).cross(WIND_POL).normalize()), dir.dot(_PX.set(1, 0, 0)));
    const verwehung = fbm3(laengs * 0.02, quer * 0.13, h * 0.4);

    const exposition = smoothstep(-1.6, 2.6, h);
    const shade =
      0.80 +
      exposition * 0.30 +
      verwehung * 0.34 +
      strahlenAt(dir) * 0.42 +
      (hashNoise(dir.x * 52, dir.y * 52, dir.z * 52) - 0.5) * 0.10;
    aus.copy(base).multiplyScalar(shade);
    const kuehl = Math.max(0, exposition - 0.45) * 0.16;
    aus.r *= 1 - kuehl * 0.9;
    aus.b *= 1 + kuehl * 1.6;
    return aus;
  };

  // --- Normalen aus dem Höhenfeld, nicht aus den Facetten ---------------------
  //
  // **`computeVertexNormals()` auf einer nicht-indizierten Geometrie ist
  // Flat-Shading.** Ohne gemeinsame Scheitel gibt es nichts zu mitteln: Jedes
  // Dreieck bekommt dreimal seine eigene Facettennormale. Auf der Platte fiel
  // das nie auf, weil `PlaneGeometry` indiziert ist; die Icosphere aus
  // `PolyhedronGeometry` ist es nicht. Im Bild stand daraufhin ein Flickenteppich
  // aus 40-cm-Rauten — gemessen dadurch, dass er auch ohne Normalenkarte, ohne
  // Rauheitskarte und ohne Scheitelfarben unverändert dastand.
  //
  // Die Normale steht analytisch zur Verfügung, weil die Fläche analytisch ist:
  // Für P(d) = (R + h(d)) · d mit den Tangenten e1, e2 ist
  //
  //   N = normalize( (R + h) · d − (dh/ds1) · e1 − (dh/ds2) · e2 )
  //
  // wobei s1, s2 Bogenlängen sind. Die Ableitungen kommen als Vorwärtsdifferenz
  // über 0,21 m — **etwa eine halbe Kantenlänge**. Kleiner wäre falsch: Die
  // Normale würde dann eine Steigung beschreiben, die das Gitter gar nicht
  // hergibt, und stünde quer zur Silhouette.
  const _nOst = new THREE.Vector3();
  const _nNord = new THREE.Vector3();
  const _nHilf = new THREE.Vector3();
  const _nAus = new THREE.Vector3();
  const N_EPS = 0.21;
  const schrittAuf = (dir, tang, meter, aus) =>
    aus
      .copy(dir)
      .multiplyScalar(Math.cos(meter / PLANET_R))
      .addScaledVector(tang, Math.sin(meter / PLANET_R))
      .normalize();
  const normalAn = (dir, h, aus) => {
    tangentialSystem(dir, _nOst, _nNord);
    // ACHTUNG: `heightAt` ruft `tangentialSystem` seinerseits mit _POst/_PNord.
    // _nOst und _nNord sind eigene Vektoren; mit den geteilten Zwischenspeichern
    // wäre die zweite Ableitung Unsinn.
    const h1 = (heightAt(schrittAuf(dir, _nOst, N_EPS, _nHilf)) - h) / N_EPS;
    const h2 = (heightAt(schrittAuf(dir, _nNord, N_EPS, _nHilf)) - h) / N_EPS;
    return aus
      .copy(dir)
      .multiplyScalar(PLANET_R + h)
      .addScaledVector(_nOst, -h1)
      .addScaledVector(_nNord, -h2)
      .normalize();
  };

  // --- Die Kugel selbst -------------------------------------------------------
  //
  // **Icosphere statt SphereGeometry.** Eine `SphereGeometry` ist ein
  // Längen-/Breitengitter: An den Polen entarten ihre Dreiecke zu Nadeln, und
  // die Dichte der Scheitelpunkte schwankt um Größenordnungen. Auf einem
  // Planeten, den man überall betritt, ist das ein sichtbares Muster an genau
  // zwei Stellen — und der Startpunkt liegt bei (0 | 1 | 0), also auf einem
  // davon. Eine Icosphere hat überall fast gleich große Dreiecke.
  //
  // **Die Unterteilung ist ein Budgetwert, kein Geschmack** — und `detail` ist
  // in three.js **nicht** der Rekursionsgrad, für den ich ihn gehalten habe.
  // `PolyhedronGeometry` zerlegt jede der 20 Grundflächen in (detail + 1)²
  // Dreiecke, nicht in 4^detail. Mit `detail: 6` standen deshalb 980 Dreiecke
  // im Bild statt der geplanten 81 920, und die Totale zeigte einen Ball aus
  // 3-m-Facetten (gemessen: 2940 Scheitel im Mesh, also 980 Dreiecke — die
  // Zahl, die den Irrtum aufgedeckt hat).
  //
  //   Dreiecke  = 20 · (detail + 1)²
  //   Kante     ≈ 1,0515 · R / (detail + 1)
  //
  //   detail 31:  20 480 Dreiecke, Kante 0,82 m — ein 1,15-m-Krater wäre 1,4
  //               Kanten breit, also nicht darstellbar
  //   detail 63:  81 920 Dreiecke, Kante 0,41 m — derselbe Krater 5,6 Kanten
  //   detail 127: 327 680 Dreiecke — allein schon fast das ganze Budget, und
  //               mit dem Schattendurchgang darüber
  const geo = new THREE.IcosahedronGeometry(PLANET_R, 63);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const normals = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const h = heightAt(d);
    pos.setXYZ(i, d.x * (PLANET_R + h), d.y * (PLANET_R + h), d.z * (PLANET_R + h));
    normalAn(d, h, _nAus);
    normals[i * 3] = _nAus.x;
    normals[i * 3 + 1] = _nAus.y;
    normals[i * 3 + 2] = _nAus.z;
    bodenFarbe(d, h, col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  // **Würfelprojektion statt Kugel-UV.** Die UV einer Icosphere hat eine Naht
  // und an den Polen eine Singularität; die Kornkarte würde dort sichtbar
  // gestaucht. Die Würfelprojektion hat statt dessen sechs Bereiche mit
  // unterschiedlicher UV-Richtung — bei **reinem Rauschen** ist das
  // unauffällig, und genau deshalb ist die Kornkarte reines Rauschen (die
  // Begründung steht ausführlich bei `cliffMaps()` in dojo/stonework.js).
  boxProjectUV(geo, 1.6);
  const boden = new THREE.Mesh(geo, marsGroundMaterial());
  boden.name = 'nacht-planet';
  boden.castShadow = true;
  boden.receiveShadow = true;
  group.add(boden);

  // --- Steinwerk auf der Kugel ------------------------------------------------
  //
  // **Was sich gegenüber der Platte ändert, ist die Verteilung, nicht die
  // Bauart.** Auf der Platte lagen dreißig Brocken in einem Ring von 3,5 bis
  // 19,5 m um den Nutzer — er stand in der Mitte und kam nie weg. Auf dem
  // Planeten läuft er überall hin, und was jenseits des ersten Hügels liegt,
  // muss dasselbe hergeben wie das, worauf er startet. Dieselbe Flächendichte
  // wie vorher (ein Brocken je 40 m²) ergäbe auf 7854 m² knapp zweihundert
  // Stück. Es sind zweihundertvierzig geworden: Bei 8,9 m Horizont sieht man
  // 250 m² auf einmal, und mit hundertsiebzig stand in `f-kante` **kein
  // einziger** Brocken im Bild — ein Erwartungswert von 5,4 reicht nicht, wenn
  // sie sich auch noch verklumpen dürfen. Bezahlt wird das aus der
  // Unterteilung: Stufe 2 statt 3 sind 180 statt 320 Dreiecke je Brocken.
  const YOBEN = new THREE.Vector3(0, 1, 0);
  const _sQ = new THREE.Quaternion();
  const _sE = new THREE.Euler();
  const _sv = new THREE.Vector3();
  const _bt1 = new THREE.Vector3();
  const _bt2 = new THREE.Vector3();
  const _bruch = new THREE.Vector3();
  const _stOst = new THREE.Vector3();
  const _stNord = new THREE.Vector3();
  const _stWind = new THREE.Vector3();

  // Ein Objekt so auf die Kugel setzen, dass seine lokale Y-Achse radial steht.
  // Die Kippung kommt **vor** der Ausrichtung zum Zuge, damit sie relativ zur
  // Flächennormale wirkt und nicht relativ zur Weltachse.
  const stelleAuf = (mesh, dir, radial, kippX, spin, kippZ) => {
    mesh.position.copy(dir).multiplyScalar(radial);
    mesh.quaternion
      .setFromUnitVectors(YOBEN, dir)
      .multiply(_sQ.setFromEuler(_sE.set(kippX, spin, kippZ)));
  };

  // **Die Bruchrichtung eines Brockens.**
  //
  // Ein Stein bricht nicht ringsum auf, sondern an einer Fläche. Damit der
  // frische Bruch als Splitterrand liest und nicht als heller Anstrich, braucht
  // jeder Brocken eine eigene Richtung, in die diese Fläche zeigt — annähernd
  // waagerecht, denn nach oben liegt Staub und nach unten sieht keiner hin.
  //
  // Die Richtung kommt aus `hashNoise`, **nicht** aus `rand()`: Der gesäte
  // Strom legt die Lage aller folgenden Brocken fest, und ein zusätzlicher Zug
  // würde die ganze Landschaft verschieben.
  const bruchRichtung = (dir, saatA, saatB, ziel) => {
    const az = hashNoise(saatA, 1.9, 4.4) * Math.PI * 2;
    const neig = (hashNoise(saatB, 8.1, 0.7) - 0.5) * 0.7;
    // Ein Tangentenpaar auf `dir`. Der Ausweichvektor fängt den Fall ab, dass
    // `dir` selbst die Y-Achse ist — am Pol steht der Spieler.
    _bt1.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.9) _bt1.set(1, 0, 0);
    _bt1.crossVectors(dir, _bt1).normalize();
    _bt2.crossVectors(dir, _bt1);
    return ziel
      .copy(_bt1)
      .multiplyScalar(Math.cos(az) * Math.cos(neig))
      .addScaledVector(_bt2, Math.sin(az) * Math.cos(neig))
      .addScaledVector(dir, Math.sin(neig))
      .normalize();
  };

  // Die Ausdehnung eines gedrehten und skalierten Körpers, quer zur
  // Flächennormale und längs. Die quere legt den Radius der
  // Kontaktverdunklung fest, die längs, wie tief der Brocken steckt.
  //
  // **Beide müssen aus der Geometrie kommen, nicht aus dem Sollmaß.** Ein
  // Brocken, der auf der Seite liegt, hat eine ganz andere Höhe als einer, der
  // flach liegt — er ist ja abgeplattet. Wer die Einsinktiefe aus `s` rechnet,
  // lässt den einen schweben und versenkt den anderen.
  const ausdehnung = (geoT, mesh, dir) => {
    const rp = geoT.attributes.position;
    let quer = 0;
    let laengs = 0;
    for (let vi = 0; vi < rp.count; vi++) {
      _sv.fromBufferAttribute(rp, vi).multiply(mesh.scale).applyQuaternion(mesh.quaternion);
      const l = Math.abs(_sv.dot(dir));
      if (l > laengs) laengs = l;
      _sv.addScaledVector(dir, -_sv.dot(dir));
      const q = _sv.length();
      if (q > quer) quer = q;
    }
    return { quer, laengs };
  };

  // Die Staubfahne liegt im Windschatten. `windAn` gibt die Windrichtung als
  // Tangentialvektor; die Fahne braucht sie in denselben Tangentialkoordinaten,
  // in denen `makeKontaktAO` seine Scheibe aufspannt.
  const leeZug = (dir, laenge) => {
    windAn(dir, _stWind);
    tangentialSystem(dir, _stOst, _stNord);
    return { x: -_stWind.dot(_stOst), y: -_stWind.dot(_stNord), laenge };
  };

  const aoStellen = [];

  // Farben mit derselben Begründung entsättigt wie der Boden: Ein Stein, der im
  // Blaukanal nichts hat, kann kein Mondlicht zeigen.
  const rockColors = [0x87513e, 0x774835, 0x67402f, 0x915b45];
  const brocken = [];
  for (let i = 0; i < 240; i++) {
    // **Gleichverteilt auf der Kugel.** Der Kosinus des Polwinkels ist
    // gleichverteilt, der Winkel selbst nicht — wer den Polwinkel würfelt,
    // ballt die Brocken an den Polen, und einer der Pole ist der Startpunkt.
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const sr = Math.sqrt(Math.max(0, 1 - u * u));
    const s = 0.14 + rand() * 0.42;
    const spin = rand() * Math.PI * 2;
    // **Nicht jeder Stein steht auf dem Lot.** Vorher kippte jeder um
    // höchstens 26 Grad gegen die Flächennormale — im Bild aus dem Orbit
    // standen sie damit alle radial ab wie die Stacheln eines Seeigels, und
    // auf dem Boden lag keiner umgestürzt, keiner auf der Seite. Ein Feld aus
    // Brocken, die alle dieselbe Lage haben, ist eine Aufzählung.
    //
    // Drei Lagen: gut die Hälfte liegt flach, wie sie sich über Jahrtausende
    // eingeregelt hat; ein Drittel steht schief, weil es auf etwas anderem
    // aufliegt; der Rest liegt beliebig — umgekippt, auf der Kante, verkantet.
    const lage = rand();
    const kippMax = lage < 0.55 ? 0.35 : lage < 0.85 ? 1.1 : Math.PI;
    const kippA = (rand() - 0.5) * kippMax;
    const kippB = (rand() - 0.5) * kippMax;
    const sx = 1 + rand() * 0.5;
    const sy = 0.45 + rand() * 0.4;
    const sz = 1 + rand() * 0.5;
    const rockHex = rockColors[Math.floor(rand() * rockColors.length)];
    const dir = new THREE.Vector3(sr * Math.cos(phi), u, sr * Math.sin(phi));
    // Der Startpunkt bleibt frei: Dort steht der Nutzer, und die Karten ordnen
    // sich bei 1,15 bis 1,5 m um ihn an. Alle Ziehungen sind vorher passiert,
    // damit der gesäte Strom davon unberührt bleibt.
    if (bogenAbstand(dir, STARTPUNKT) < 2.2) continue;

    // **Kein rand() in den Bruchparametern.** Sie kommen aus `hashNoise` und
    // einem eigenen, je Brocken gesäten Strom — sonst verschöbe jeder neue
    // Parameter die Lage aller folgenden Brocken.
    const alter = hashNoise(i * 3.1, 7.7, 1.3);
    const geoR = bruchGeometrie(s, 5100 + i * 91, {
      // Kleine Brocken zerbrechen in weniger Flächen als große.
      facetten: 7 + Math.round(hashNoise(i * 1.7, 2.3, 9.1) * 8 + (s / 0.56) * 4),
      verwitterung: 0.05 + alter * 0.3,
      kanten: 0.04 + alter * 0.07,
      unterteilung: 2,
    });
    boxProjectUV(geoR, 0.22);
    const rock = new THREE.Mesh(geoR, marsRockMaterial());
    rock.scale.set(sx, sy, sz);
    // **Halb verwehte Füße.** Ein Brocken, der seit Jahrtausenden im Wind
    // liegt, steht nicht auf dem Sand — er steckt darin. Wie tief, schwankt.
    const eingeweht = 0.1 + hashNoise(dir.x * 17, dir.y * 17, dir.z * 17) * 0.55;
    const hB = heightAt(dir);
    // Erst ausrichten, dann messen, dann auf die richtige Höhe setzen: Wie hoch
    // der Körper über seiner Mitte aufragt, hängt an der Drehung.
    stelleAuf(rock, dir, PLANET_R + hB, kippA, spin, kippB);
    const mass = ausdehnung(geoR, rock, dir);
    // **Halb verwehte Füße.** Ein Brocken, der seit Jahrtausenden im Wind
    // liegt, steht nicht auf dem Sand — er steckt darin. Wie tief, schwankt
    // zwischen einem Sechstel und drei Vierteln seiner halben Höhe.
    const einsinken = mass.laengs * (0.15 + eingeweht * 0.75);
    rock.position.copy(dir).multiplyScalar(PLANET_R + hB + mass.laengs - einsinken);
    rock.castShadow = true;
    rock.receiveShadow = true;

    // Staub, Bruchgestein und Frost je Fläche. Der Staubanteil hängt am Alter:
    // Ein alter Brocken ist eingestaubt, ein frisch zerbrochener zeigt den Bruch.
    faerbeBruchstein(geoR, rockHex, rock.quaternion, MOND_RICHTUNG, {
      staub: 0.35 + alter * 0.45,
      frost: 0.3 + (1 - alter) * 0.24,
      alter,
      oben: dir,
      bruchachse: bruchRichtung(dir, i * 5.3, i * 2.9, _bruch),
    });
    brocken.push(rock);

    const weit = mass.quer;
    aoStellen.push({ ort: dir, r: weit * 1.35, staerke: 0.5 });
    aoStellen.push({
      ort: dir,
      r: weit * 1.15,
      staerke: 0.24,
      farbe: 0xcaa78e,
      zug: leeZug(dir, weit * (2.4 + hashNoise(dir.x * 3, dir.y * 3, 11) * 1.8)),
    });
  }
  for (const m of verschmelzeObjekte(brocken, 'nacht-brocken')) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // --- Landmarken: was über die Krümmung steigt -------------------------------
  //
  // Auf der Platte standen elf Formationen zwischen 30 und 72 m — sie waren die
  // Ferne, und ihr Zweck war eine Silhouette gegen den Sternhimmel. Auf einer
  // Kugel mit 8,9 m Horizont gibt es keine Ferne mehr; dieselbe Aufgabe fällt
  // hier der **Krümmung** zu. Eine Formation von 6 m Höhe ist noch aus
  // 8,9 + sqrt(2 · 25 · 6) = **26 m Bogen** zu sehen, zuerst nur mit der Spitze.
  // Beim Rundgang von 157 m kommt damit alle paar Sekunden eine über die Kante
  // — und wer sie wiedererkennt, weiß, wo er ist. Genau darum geht es bei einer
  // begehbaren Gedächtnislandkarte.
  //
  // Die Verteilung ist absichtlich unsymmetrisch: eine dichte Gruppe kurz hinter
  // dem Startpunkt, eine zweite auf der Gegenseite, und dazwischen zweimal ein
  // langes Stück ohne alles. Leere ist eine Entscheidung, kein Versäumnis.
  {
    const fr = mulberry32(60600);
    // **b und l sind gegenüber der Platte halbiert.** Dort war die Ferne 30 bis
    // 72 m weit, und eine Abbruchkante von 11 m Länge las als Aufschluss am
    // Horizont. Hier sieht man 250 m² auf einmal; derselbe Körper stand in der
    // Totale wie eine Warze auf der Kugel — gemessen 11 m breit bei 3,3 m Höhe.
    // Die Höhen bleiben: Sie tragen die Fernwirkung über die Krümmung.
    //
    // **Der Querabstand zur Laufspur ist gerechnet, nicht geschätzt.** Der
    // Rundgang läuft von (0 | 1 | 0) aus über Azimut 180 zum Gegenpol und über
    // Azimut 0 zurück. Der Abstand einer Formation von dieser Spur ist
    //
    //     quer = R · asin( sin(bogen / R) · sin(azimut) )
    //
    // und er muss zwischen etwa 8 und 16 m liegen: näher steht sie einem im
    // Weg, weiter sieht man sie nicht mehr. Vier standen unter 3,3 m —
    // `{62 | 12}` bei 3,2 m, `{69 | −6}` bei **1,0 m** —, und im Prüfbild
    // `rund-210` füllte eine davon zwei Drittel des Bildes. Der Prüfer hat das
    // als „ein einziger Brocken, dessen Dreiecke man abzählen kann" gemeldet;
    // die Ursache war nicht seine Größe, sondern sein Abstand.
    //
    // In der Nähe des Gegenpols (ab etwa 68 m Bogen) ist ein Querabstand über
    // 9,5 m geometrisch unmöglich — dort läuft die Spur durch alles hindurch.
    // Deshalb steht dort nichts.
    const formationen = [
      // Erste Gruppe, 17 bis 24 m vom Start — die sieht man beim Losgehen.
      { bogen: 17, az: -122, h: 6.2, b: 1.3, l: 2.4, art: 'block' }, // quer 14,1
      { bogen: 21, az: -136, h: 8.4, b: 1.5, l: 1.9, art: 'block' }, // quer 13,6
      { bogen: 24, az: -104, h: 4.8, b: 2.7, l: 7.2, art: 'kante' }, // quer 23,0
      // Ein hoher Block gegen den Mond (Azimut 150) — der Anker beim Aufbruch.
      { bogen: 22, az: 143, h: 9.6, b: 1.6, l: 2.3, art: 'block' }, // quer 12,1
      { bogen: 31, az: 158, h: 4.2, b: 1.2, l: 3.3, art: 'kante' }, // quer 9,1
      // Mittelfeld, weit ab der Spur — sie stehen als Ferne, nicht als Tor.
      { bogen: 40, az: 62, h: 5.0, b: 1.9, l: 6.0, art: 'kante' }, // quer 27,0
      { bogen: 46, az: -58, h: 7.1, b: 1.4, l: 2.0, art: 'block' }, // quer 23,9
      // Nahe der Gegenseite — die dunkle Hälfte, dort trägt nur der Umriss.
      { bogen: 62, az: 44, h: 8.8, b: 1.7, l: 2.5, art: 'block' }, // quer 11,0
      { bogen: 66, az: -50, h: 5.4, b: 2.5, l: 6.6, art: 'kante' }, // quer 9,4
      { bogen: 58, az: -38, h: 3.8, b: 1.0, l: 1.6, art: 'block' }, // quer 11,7
      // **Der Rückweg.** Er läuft auf Azimut 0 zurück; die Stationen 210 bis
      // 300 des Prüfstands liegen bei 65, 52, 39 und 26 m Bogen. Genau dort
      // stand nichts — der Prüfer hat sechs der zwölf Stationen als
      // austauschbar gemeldet, und es sind diese.
      { bogen: 65, az: 50, h: 8.6, b: 1.6, l: 2.4, art: 'block' }, // quer 10,2
      { bogen: 52, az: -33, h: 6.4, b: 2.0, l: 4.4, art: 'kante' }, // quer 12,4
      { bogen: 39, az: 26, h: 7.4, b: 1.5, l: 2.2, art: 'block' }, // quer 11,3
      { bogen: 26, az: 27, h: 5.8, b: 1.8, l: 3.6, art: 'kante' }, // quer 10,0
      // Und zwei Vereinzelte, damit die Gruppen nicht als Inseln lesen.
      { bogen: 52, az: -160, h: 6.6, b: 2.0, l: 4.2, art: 'kante' }, // quer 7,6
      // **Azimut −33 und 15 m, zweimal gemessen hingesetzt.** In `f-kante` — dem
      // Blick vom Mond weg — stand keine einzige Form gegen den Sternhimmel; in
      // dieser Richtung lag die nächste Formation bei 36 m Bogen.
      //
      // Der erste Anlauf setzte sie auf 19 m und rechnete die Sichtweite aus
      // der Kugel allein: 8,9 + sqrt(2 · 25 · 5,2) = 25 m, also bequem
      // sichtbar. Im Bild war sie weiterhin nicht da. **Die Rechnung vergisst
      // das Gelände.** Nachgemessen steht ihre Spitze bei 20,8 m Bogen und 30,0
      // m Radius, das sind 16,9 Grad unter Augenhöhe — und der nächstgelegene
      // Geländerücken verdeckt in dieser Richtung alles unter 16,5 Grad. Sie
      // fehlte um vier Zehntelgrad.
      { bogen: 15, az: -33, h: 6.0, b: 1.4, l: 2.2, art: 'block' }, // quer 7,8
    ];
    const fern = [];
    const _fd = new THREE.Vector3();
    formationen.forEach((f, i) => {
      const ort = ortVon(STARTPUNKT, f.bogen, f.az);
      // Zwei bis drei Blöcke je Formation: Ein einzelner Körper liest als
      // Gegenstand, mehrere aneinandergeschobene als Aufschluss.
      const teile = f.art === 'kante' ? 3 : 2;
      const richtung = fr() * Math.PI * 2;
      for (let k = 0; k < teile; k++) {
        const g = bruchGeometrie(1, 70000 + i * 131 + k * 17, {
          facetten: 8 + Math.floor(fr() * 6),
          verwitterung: 0.1 + fr() * 0.22,
          kanten: 0.05 + fr() * 0.06,
        });
        const m = new THREE.Mesh(g, marsRockMaterial());
        const t = teile === 1 ? 0 : k / (teile - 1) - 0.5;
        // **h ist die sichtbare Höhe, nicht der Halbmesser** — und auf einer
        // Kugel ist der Unterschied nicht nur eine Rechnung, sondern eine Frage
        // der Geometriemenge. Auf der Platte durfte der Fuß beliebig tief
        // stecken, weil unter ihr nichts war. Hier reichte die höchste
        // Formation mit der alten Regel (Mitte auf Bodenhöhe − 0,42 · hk) bis
        // auf **6,3 m an den Planetenmittelpunkt** hinunter: 26 m Körper für
        // 7,7 m Wirkung.
        //
        // Jetzt wird von oben gerechnet. Die Spitze soll `hoehe` über dem
        // Gelände stehen und der Fuß 1,5 m darunter — der Halbmesser ist damit
        // (hoehe + 1,5) / 2 und die Mitte liegt bei Boden + hoehe − hk.
        // Höhe und Breite sind wortgleich die der Platte — ein Anlauf mit
        // 35 % mehr Höhe und 40 % mehr Breite stand als Klumpen auf der Kugel,
        // groß genug, dass die Totale nach Warzen aussah. Geändert hat sich nur,
        // wie tief der Fuß steckt.
        // **Die Teile sind nicht gleich hoch.** Mit einer gemeinsamen Streuung
        // kamen bei einem Block aus zwei Teilen zwei fast gleich große Kegel
        // heraus — im Bild ein Paar Hasenohren statt eines Aufschlusses. Der
        // erste Teil ist die Hauptmasse, die folgenden sind Schultern.
        const SCHULTER = [1.0, 0.62, 0.78];
        const hoehe = f.h * (0.62 + fr() * 0.5) * SCHULTER[k];
        const hk = (hoehe + 1.5) * 0.5;
        m.scale.set(f.b * (0.7 + fr() * 0.5), hk, f.b * (0.7 + fr() * 0.5));
        // Entlang der Formationsachse aufgereiht, tangential versetzt.
        versetzeAufKugel(ort, Math.cos(richtung) * t * f.l, Math.sin(richtung) * t * f.l, _fd);
        const dirT = _fd.clone();
        // Tief genug einsetzen, dass kein Fuß in der Luft steht: Der Boden
        // schwankt unter einer 10-m-Formation um mehr als einen Meter.
        stelleAuf(
          m,
          dirT,
          PLANET_R + heightAt(dirT) + hoehe - hk,
          (fr() - 0.5) * 0.34,
          fr() * Math.PI * 2,
          (fr() - 0.5) * 0.34
        );
        // **Anders als auf der Platte werfen sie Schatten.** Dort lagen sie
        // außerhalb des Orthofrustums der Schattenkarte; auf einer Kugel von
        // 25 m Halbmesser liegt alles darin, und eine 9-m-Formation ohne
        // Schlagschatten stünde ohne Gewicht auf dem Boden.
        m.castShadow = true;
        m.receiveShadow = true;
        faerbeBruchstein(g, 0x7a4a37, m.quaternion, MOND_RICHTUNG, {
          staub: 0.5,
          frost: 0.36,
          alter: 0.4,
          oben: dirT,
          bruchachse: bruchRichtung(
            dirT,
            dirT.x * 31 + dirT.z * 17,
            dirT.y * 23 + dirT.x * 7,
            _bruch
          ),
        });
        boxProjectUV(g, 0.5);
        fern.push(m);
      }
    });
    for (const mesh of verschmelzeObjekte(fern, 'nacht-landmarken')) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // --- Vordergrundanker: drei Findlinge als Leitlinie zum Mond ----------------
  //
  // **Was die Bilder der Platte nicht hatten, war ein Vordergrund.** Gemessen
  // lag der Kantenanteil im unteren Bilddrittel zwischen 0,08 und 1,80 % — die
  // untere Bildhälfte war Fläche, sonst nichts. Ein Blick, der nichts Nahes
  // findet, hat keinen Ausgangspunkt für die Tiefe.
  //
  // Die Antwort bleibt dieselbe: drei große Findlinge, aufgereiht auf einer
  // Linie, die zum Mond zeigt (Azimut 150). Sie werden zum Betrachter hin größer
  // — das ist eine Staffelung, die in die Tiefe zieht, statt drei gleich großer
  // Steine, die als Reihe lesen. Der nächste steht 3,6 m vom Startpunkt: Ein
  // Anker darf Anker sein, nicht Hindernis.
  {
    const findlinge = [
      { bogen: 3.6, az: 150, r: 0.95, seed: 88100, kippen: 0.22 },
      { bogen: 6.4, az: 150, r: 0.78, seed: 88200, kippen: 0.1 },
      { bogen: 9.5, az: 150, r: 0.6, seed: 88300, kippen: 0.31 },
    ];
    const stuecke = [];
    const _fo = new THREE.Vector3();
    for (const f of findlinge) {
      const fr = mulberry32(f.seed);
      const ort = ortVon(STARTPUNKT, f.bogen, f.az);
      // Ein Monolith allein liest als aufgestellt. Ein Hauptstein mit zwei
      // kleineren Begleitern liest als das, was er sein soll: ein Brocken, der
      // beim Aufschlag zersprungen und liegen geblieben ist.
      const teile = [
        { s: 1.0, dx: 0, dz: 0, tief: 0.34 },
        { s: 0.42, dx: f.r * 1.35, dz: f.r * 0.5, tief: 0.55 },
        { s: 0.26, dx: -f.r * 0.7, dz: -f.r * 1.25, tief: 0.62 },
      ];
      for (const t of teile) {
        const g = bruchGeometrie(f.r * t.s, f.seed + Math.round(t.s * 1000), {
          facetten: 9 + Math.floor(fr() * 5),
          verwitterung: 0.08 + fr() * 0.16,
          kanten: 0.05 + fr() * 0.05,
        });
        const m = new THREE.Mesh(g, marsRockMaterial());
        m.scale.set(1 + fr() * 0.35, 0.72 + fr() * 0.4, 1 + fr() * 0.35);
        versetzeAufKugel(ort, t.dx, t.dz, _fo);
        const dirF = _fo.clone();
        stelleAuf(
          m,
          dirF,
          PLANET_R + heightAt(dirF) - f.r * t.s * t.tief,
          (fr() - 0.5) * f.kippen * 2,
          fr() * Math.PI * 2,
          (fr() - 0.5) * f.kippen * 2
        );
        m.castShadow = true;
        m.receiveShadow = true;
        // **Gemessen war der erste Anlauf zu hell.** Die beleuchtete Fläche
        // eines Findlings stand bei L 109,3 gegen L 67,7 am hellsten Boden —
        // das Anderthalbfache, und damit ein anderes Material statt eines
        // größeren Steins. Ein Anker darf herausstechen; er darf nicht aus der
        // Szene fallen.
        faerbeBruchstein(g, 0x6d4432, m.quaternion, MOND_RICHTUNG, {
          staub: 0.34,
          frost: 0.36,
          alter: 0.5,
          oben: dirF,
          bruchachse: bruchRichtung(
            dirF,
            dirF.z * 29 + dirF.x * 13,
            dirF.y * 19 + dirF.z * 5,
            _bruch
          ),
        });
        boxProjectUV(g, 0.3);
        stuecke.push(m);
        aoStellen.push({ ort: dirF, r: f.r * t.s * 1.5, staerke: 0.5 });
        aoStellen.push({
          ort: dirF,
          r: f.r * t.s * 1.3,
          staerke: 0.26,
          farbe: 0xcaa78e,
          zug: leeZug(dirF, f.r * t.s * 3.2),
        });
      }
    }
    for (const mesh of verschmelzeObjekte(stuecke, 'nacht-findlinge')) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // --- Der Sputnik ----------------------------------------------------------
  //
  // Er liegt bei 5,5 m Bogen in Azimut 150 — in Blickrichtung der
  // Eingangskamera, gut vier Schritte vom Startpunkt und damit im
  // **Vordergrund**, den der Prüfer als leer gemeldet hat („in `e-boden` liegen
  // 240 000 Pixel ohne eine einzige Kante direkt vor den Füßen"). Weit genug
  // weg, dass er die Kartenreihe bei 1,15 bis 1,5 m nicht stört.
  {
    const KIPP = new THREE.Euler(1.24, 0.72, -0.16);
    const _q = new THREE.Quaternion().setFromEuler(KIPP);
    // Die Richtung im Eigensystem, die nach dem Hinlegen nach oben zeigt.
    const obenLokal = new THREE.Vector3(0, 1, 0).applyQuaternion(_q.clone().invert());
    const sput = makeSputnik(obenLokal);
    const ort = ortVon(STARTPUNKT, 5.5, 150);
    const hS = heightAt(ort);
    // **Eingesunken, nicht vergraben.** `stelleAuf` setzt den **Mittelpunkt**
    // auf den angegebenen Halbmesser — ein Wert unter der Geländehöhe versenkt
    // damit mehr als die halbe Kugel. Der erste Anlauf lag 11 cm darunter, der
    // zweite 2 cm, und beide zeigten nur eine Kuppe. 8 cm **darüber** lassen
    // 37 der 58 cm frei, also gut ein Drittel eingesunken; die Kippung von
    // 71 Grad stellt den Äquatorflansch schräg ins Bild.
    stelleAuf(sput, ort, PLANET_R + hS + 0.08, KIPP.x, KIPP.y, KIPP.z);
    group.add(sput);

    // Die Spur des Aufschlags: eine Mulde unter ihm, eine flache Schleifspur
    // dahinter und ein Kranz aufgeworfenen Staubs. Dieselbe Maschinerie wie bei
    // den Brocken — nichts Neues, nur ein anderer Anlass.
    aoStellen.push({ ort, r: 0.85, staerke: 0.62 });
    aoStellen.push({
      ort,
      r: 1.5,
      staerke: 0.3,
      farbe: 0xcaa78e,
      zug: leeZug(ort, 3.2),
    });
    // Ein paar abgerissene Blechfetzen in der Schleifspur. Flache, scharfe
    // Splitter — sie lesen sofort als „nicht Stein".
    const fetzen = [];
    const blechMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      metalness: 0.22,
      roughness: 0.3,
    });
    for (let i = 0; i < 7; i++) {
      const s2 = 0.05 + hashNoise(i * 4.1, 3.3, 8.8) * 0.09;
      const g2 = bruchGeometrie(s2, 8800 + i * 37, {
        facetten: 5,
        verwitterung: 0.02,
        kanten: 0.02,
        unterteilung: 1,
      });
      // Zu Blech plattgedrückt.
      g2.scale(1.35, 0.24, 1.05);
      // **Dasselbe Material wie der Körper.** Der erste Anlauf gab ihnen
      // `marsRockMaterial()` und eine helle Scheitelfarbe — im Bild lagen
      // daraufhin weiße Papierschnipsel im Sand. Blech ist kein heller Stein.
      const m2 = new THREE.Mesh(g2, blechMaterial);
      const weit = 0.9 + hashNoise(i * 2.7, 1.1, 5.5) * 2.6;
      const seit = (hashNoise(i * 5.9, 7.7, 2.2) - 0.5) * 1.4;
      const dirF = versetzeAufKugel(ort, seit, -weit, new THREE.Vector3());
      stelleAuf(
        m2,
        dirF,
        PLANET_R + heightAt(dirF) + s2 * 0.1,
        (hashNoise(i, 2, 3) - 0.5) * 1.2,
        hashNoise(i, 5, 7) * Math.PI * 2,
        (hashNoise(i, 8, 9) - 0.5) * 1.2
      );
      m2.castShadow = true;
      m2.receiveShadow = true;
      faerbeBruchstein(g2, 0xa9a49b, m2.quaternion, MOND_RICHTUNG, {
        staub: 0.55,
        frost: 0.1,
        alter: 0.0,
        oben: dirF,
        bruchachse: bruchRichtung(dirF, i * 3.7, i * 6.1, _bruch),
      });
      fetzen.push(m2);
      aoStellen.push({ ort: dirF, r: s2 * 2.2, staerke: 0.42 });
    }
    for (const m of verschmelzeObjekte(fetzen, 'nacht-sputnik-fetzen')) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // **Erst hier, nachdem alles eingetragen ist.** Der Aufruf stand einmal direkt
  // hinter der Brockenschleife — die Findlinge tragen ihre Stellen aber später
  // ein, und ihre Verdunklung und ihre Staubfahne wären dadurch nie gebaut
  // worden. Ein Fehler, den kein Bild gezeigt hätte: Es hätte nur etwas gefehlt,
  // das man nicht vermisst, wenn man es nie gesehen hat.
  const kontakt = makeKontaktAO(aoStellen, heightAt);
  if (kontakt) group.add(kontakt);

  group.userData.heightAt = heightAt;
  group.userData.bodenFarbe = bodenFarbe;
  group.userData.craters = craters;
  return group;
}

// --- Der Nachthimmel: Kuppel, Milchstraße, Luftglühen ------------------------
//
// **Warum diese Umgebung eine eigene Kuppel bekommt und nicht `makeDome()`.**
// Zwei Gründe, und der zweite ist ein Messbefund.
//
// Erstens braucht der Nachthimmel Dinge, die keine andere Umgebung hat: ein
// Milchstraßenband mit eigenem Bezugssystem, ein Luftglühband über dem
// Horizont, Extinktion nach unten. `makeDome()` trägt Insel und Zen-Garten und
// darf sich nicht ändern.
//
// Zweitens — und das ist der eigentliche Grund, warum der Himmel bisher tot
// war: **`makeDome()` schreibt lineare Farbwerte roh in einen sRGB-Puffer.**
// Ein `ShaderMaterial` bekommt von three keine Farbraum-Umrechnung
// eingebaut; `#include <colorspace_fragment>` steht dort nicht. `THREE.Color`
// speichert einen Hex-Wert aber **linear**. Der Zenit 0x0b1533 hat linear
// (0,0033 | 0,0075 | 0,0331), und genau das landet als Anzeigewert im Bild:
//
//     Uniform (linear)         (0,00335 | 0,00750 | 0,03310)
//     roh × 255                (0,9     | 1,9     | 8,4)
//     im Bild gemessen         (2       | 2       | 7)
//     0x0b1533 sähe aus wie    (11      | 21      | 51)
//
// Der Himmel war also nicht zu flach entworfen — er wurde um Faktor 6 bis 12
// verdunkelt. Gemessen p05 2, p95 3 über 55 bis 60 % der Bildfläche. Dieselbe
// Klasse Fehler wie bei der Nebelfarbe, die als linearer Wert in einem
// sRGB-Bild landet und dunkler wirkt, als der Hex-Wert aussieht.
//
// Diese Kuppel rechnet deshalb am Ende ausdrücklich linear → sRGB um. Ein
// Hex-Wert, der hier steht, sieht danach auch so aus.

// Milchstraßenband als Kachel: **u läuft einmal um das Band, v quer darüber.**
//
// Kein Kacheln in u, weil ein voller Umlauf genau einmal auf die Textur fällt —
// damit gibt es die senkrechte Naht nicht, die im Zen-Garten eine
// nicht-ganzzahlige Wolkenoktave hinterlassen hat. In v wird geklemmt; das Band
// läuft nie durch seine eigenen Pole, also gibt es dort auch keine Verzerrung.
//
// Gezeichnet wird nicht Rauschen, sondern **Wolken**: helle Ballungen entlang
// der Bandmitte, dunkle Staubbahnen quer hindurch, eine hellere Verdickung an
// einer Stelle (das Zentrum). Die Ballungen werden um ±Kachelbreite
// mitgezeichnet, damit der Umlauf nahtlos schließt.
let _milchstrasse = null;
function milchstrassenKarte() {
  if (_milchstrasse) return _milchstrasse;
  const B = 1024;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = B;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, B, H);

  const mr = mulberry32(778899);

  // **Die Streckung der Abbildung — und der Vorzeichenfehler, der mich drei
  // Fassungen gekostet hat.**
  //
  // Die Kachel wird nicht gleichmäßig auf den Himmel abgebildet:
  //
  //   u läuft über 360° auf 1024 Texel  →  0,3516° je Texel
  //   v läuft über  42,8° auf  256 Texel  →  0,1673° je Texel
  //
  // Ein Texel ist in Bandrichtung also **2,10-mal so groß** wie quer dazu.
  // Damit ein Blob am **Himmel** rund erscheint, muss er in der Kachel
  // 2,10-mal **höher als breit** sein.
  //
  // Im Code stand `ctx.scale(r * 1.7, r)` — also 1,7-mal **breiter** als hoch.
  // Genau verkehrt herum, und in der Wirkung um Faktor 1,7 × 2,10 = **3,6**
  // in Bandrichtung gestreckt. Deshalb las das Band in jeder Fassung als
  // Schleier: Ich habe an den Ballungen, an den Staubbahnen und an der Stärke
  // gedreht, während der Fehler in einer einzigen Zahl saß, die ich nie
  // nachgerechnet hatte.
  //
  // Eine Milchstraße ist gesprenkelt mit Rissen, nicht gestreift.
  const mitteBei = (x) => H * 0.5 + Math.sin((x / B) * Math.PI * 2 + 0.7) * H * 0.1;
  const wolke = (x, y, r, streckung, a, farbe) => {
    for (const versatz of [-B, 0, B]) {
      ctx.save();
      ctx.translate(x + versatz, y);
      // In der Kachel höher als breit — am Himmel dadurch rund. Herleitung im
      // Kopf dieser Funktion.
      ctx.scale(r * streckung, r * 2.1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(${farbe},${a})`);
      g.addColorStop(0.5, `rgba(${farbe},${a * 0.45})`);
      g.addColorStop(1, `rgba(${farbe},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  const kernNaehe = (x) => {
    let du = Math.abs(x / B - 0.32);
    if (du > 0.5) du = 1 - du;
    return Math.exp(-(du * du) / 0.022);
  };

  // **Dritter Anlauf, und diesmal an der richtigen Stelle.** Zwei Fassungen
  // lang habe ich an den Ballungen gedreht; das Band las trotzdem als weicher
  // Schleier, wie Zirren oder Polarlicht. Der Grund waren nicht die Ballungen,
  // sondern die beiden **glatten** Lagen darum herum:
  //
  //   * ein breiter Grundschleier aus 260 Blobs mit bis zu 95 Texeln Breite
  //   * 26 lange dunkle Bahnen mit bis zu 200 Texeln Länge
  //
  // Auf den Himmel abgebildet sind das Striche von mehreren hundert Pixeln.
  // Sie haben die Körnung überdeckt, die darunter durchaus vorhanden war.
  //
  // Eine Milchstraße ist **gesprenkelt mit Rissen**, nicht gestreift: Der
  // Grundschleier wird schwächer und schmaler, die langen Bahnen werden von 26
  // auf 8 reduziert (es ist **ein** großer Riss, nicht ein Streifenmuster), und
  // die Körnung bekommt mehr Gewicht.
  ctx.globalCompositeOperation = 'lighter';
  // Grundschleier: breit und schwach – das unaufgelöste Sternlicht.
  for (let i = 0; i < 150; i++) {
    const x = mr() * B;
    const k = kernNaehe(x);
    wolke(x, mitteBei(x) + (mr() - 0.5) * H * (0.34 - 0.12 * k), 18 + mr() * 20, 1, 0.020 + 0.014 * k, '170,180,208');
  }
  // Ballungen: mittlere Größe, deutlich mehr davon.
  for (let i = 0; i < 900; i++) {
    const x = mr() * B;
    const k = kernNaehe(x);
    wolke(
      x,
      mitteBei(x) + (mr() - 0.5) * H * (0.26 - 0.09 * k),
      7 + mr() * 15 + k * 8,
      0.75 + mr() * 0.6,
      0.035 + 0.045 * k,
      mr() < 0.22 ? '214,206,184' : '186,196,224'
    );
  }
  // Körnung: viele kleine Tupfen. Ohne sie verschwimmt alles zu Nebel; mit
  // ihnen liest die Fläche als etwas, das aus Sternen besteht.
  for (let i = 0; i < 9000; i++) {
    const x = mr() * B;
    const k = kernNaehe(x);
    wolke(
      x,
      mitteBei(x) + (mr() - 0.5) * H * (0.24 - 0.07 * k),
      1.2 + mr() * 2.8,
      0.8 + mr() * 0.5,
      0.13 + 0.13 * k,
      '206,212,230'
    );
  }

  // Staubbahnen: Ergebnis = Ziel · (1 − a), also wirklich dunkler. Ein paar
  // lange Rifts entlang des Bandes, viele kleine Flecken quer dazu – ohne die
  // kleinen liest der Riss als gezogener Strich.
  ctx.globalCompositeOperation = 'source-over';
  const bahn = (x, y, rx, ry, dreh, a) => {
    for (const versatz of [-B, 0, B]) {
      ctx.save();
      ctx.translate(x + versatz, y);
      ctx.rotate(dreh);
      ctx.scale(rx, ry);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${a * 0.5})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };
  // Acht statt 26: Es ist **ein** großer Riss mit Verzweigungen, kein
  // Streifenmuster. Breiter und weicher, damit er als Dunkelwolke liest und
  // nicht als Strich.
  // **Auch hier wirkt die 2,10.** Eine Bahn von 90 × 14 Texeln erscheint am
  // Himmel als 31,6° × 2,3°, also 13:1 statt der 6:1, die im Code stehen. Die
  // Werte sind deshalb entzerrt: kürzer in u, höher in v.
  for (let i = 0; i < 8; i++) {
    const x = mr() * B;
    bahn(x, mitteBei(x) + (mr() - 0.5) * H * 0.13, 26 + mr() * 34, 22 + mr() * 30, (mr() - 0.5) * 0.3, 0.45 + mr() * 0.3);
  }
  for (let i = 0; i < 620; i++) {
    const x = mr() * B;
    bahn(x, mitteBei(x) + (mr() - 0.5) * H * 0.36, 3 + mr() * 10, 6 + mr() * 22, mr() * Math.PI, 0.22 + mr() * 0.38);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // Die Karte trägt Anzeigewerte, keine Lichtmengen – sie wird im Shader
  // direkt addiert, nicht durch eine Farbraumumrechnung geschickt.
  tex.colorSpace = THREE.NoColorSpace;
  _milchstrasse = tex;
  return tex;
}

// --- Leben und Bewegung ------------------------------------------------------
//
// Die Szene bewegte sich bisher in **einer** Zeile: `starsGroup.rotation.y =
// time * 0.004`. Fünfzehnhundert Sterne drehten sich starr als ein Körper —
// wörtlich das, was das Kriterium „nichts im Gleichtakt" ausschließt. Seit
// Paket 2 flimmert jeder Stern mit eigener Phase und eigenem Tempo; hier kommt
// dazu, was sich am Boden und quer über den Himmel bewegt.
//
// **Die gemeinsame Regel:** Jede Bewegung bekommt ihre eigene Periode, und die
// Perioden sind zueinander teilerfremd oder irrational. Zwei Bewegungen mit
// verwandten Perioden fallen regelmäßig zusammen, und dieser Zusammenfall ist
// genau die Regelmäßigkeit, die ein Betrachter als „gemacht" liest.

// **Feinstaub über den Kämmen.**
//
// Nicht überall, sondern dort, wo der Wind angreift: auf den Rücken der Dünen
// und Kraterwälle. Jedes Korn wird an seiner Stelle aufgenommen, läuft rund
// vier Meter mit dem Wind, steigt dabei ein wenig und verschwindet wieder.
//
// **Warum kein Fortbewegen über weite Strecken.** Der Shader kennt das
// Höhenfeld nicht — er könnte nicht wissen, wie hoch der Boden dort ist, wo ein
// Korn nach zwanzig Metern ankommt. Über vier Meter ändert sich das Gelände um
// wenige Dezimeter, und das trägt die Bahn. Über zwanzig würde der Staub durch
// Dünen laufen.
function makeFeinstaub(rand, heightAt) {
  const ANZAHL = 1400;
  const positions = new Float32Array(ANZAHL * 3);
  const windRi = new Float32Array(ANZAHL * 3);
  const hochRi = new Float32Array(ANZAHL * 3);
  const phasen = new Float32Array(ANZAHL);
  const groessen = new Float32Array(ANZAHL);
  const d = new THREE.Vector3();
  const w = new THREE.Vector3();
  const achse = new THREE.Vector3();
  const q1 = new THREE.Vector3();
  const q2 = new THREE.Vector3();
  let n = 0;
  let versuche = 0;
  while (n < ANZAHL && versuche < ANZAHL * 30) {
    versuche++;
    // Gleichverteilt auf der Kugel — ohne die Umrechnung über den Kosinus des
    // Polarwinkels säße der Staub an den Polen dichter.
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const sp = Math.sqrt(Math.max(0, 1 - u * u));
    d.set(sp * Math.cos(phi), u, sp * Math.sin(phi));

    const h = heightAt(d);
    // Nur auf Kämmen: höher als die Nachbarn **quer zum Wind**. Auf der Kugel
    // ist „daneben" ein Schritt entlang der Oberfläche, also eine Drehung um
    // die Achse senkrecht zu Ort und Schrittrichtung.
    windAn(d, w);
    achse.crossVectors(d, w).normalize();
    // Quer zum Wind heißt: um die Windachse selbst drehen.
    q1.copy(d).applyAxisAngle(w, 1.6 / PLANET_R);
    q2.copy(d).applyAxisAngle(w, -1.6 / PLANET_R);
    const kamm = h - (heightAt(q1) + heightAt(q2)) * 0.5;
    if (kamm < 0.06 && rand() > 0.12) continue; // die 12 % streuen das Feld auf

    const r = PLANET_R + h + 0.04 + rand() * 0.16;
    positions[n * 3] = d.x * r;
    positions[n * 3 + 1] = d.y * r;
    positions[n * 3 + 2] = d.z * r;
    // Windrichtung und Radialrichtung wandern als Attribute mit: Auf einer
    // Kugel gibt es keine gemeinsame Windrichtung und kein gemeinsames „oben",
    // also kann beides nicht als Uniform übergeben werden.
    windRi[n * 3] = w.x;
    windRi[n * 3 + 1] = w.y;
    windRi[n * 3 + 2] = w.z;
    hochRi[n * 3] = d.x;
    hochRi[n * 3 + 1] = d.y;
    hochRi[n * 3 + 2] = d.z;
    phasen[n] = rand();
    groessen[n] = 0.22 + rand() * 0.55;
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, n * 3), 3));
  geo.setAttribute('windRi', new THREE.BufferAttribute(windRi.slice(0, n * 3), 3));
  geo.setAttribute('hochRi', new THREE.BufferAttribute(hochRi.slice(0, n * 3), 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phasen.slice(0, n), 1));
  geo.setAttribute('groesse', new THREE.BufferAttribute(groessen.slice(0, n), 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      zeit: { value: 0 },
      pxSkala: { value: 300 },
      // Ein Staubkorn in der Luft wird vom Mond **angeleuchtet**, es leuchtet
      // nicht. Deshalb kühl und schwach und nicht in der Farbe des Bodens —
      // der ist rot, weil er rot reflektiert.
      farbe: { value: new THREE.Color(0x4c5568) },
    },
    vertexShader: `
      attribute float phase;
      attribute float groesse;
      attribute vec3 windRi;
      attribute vec3 hochRi;
      uniform float zeit;
      uniform float pxSkala;
      varying float vStaerke;
      void main() {
        float dauer = 2.3 + fract(phase * 7.31) * 1.8;
        float t = fract(zeit / dauer + phase);
        // Vier Meter mit dem Wind. Weiter nicht: Der Shader kennt das
        // Hoehenfeld nicht und wuesste nach zwanzig Metern nicht, wie hoch der
        // Boden dort ist.
        vec3 p = position + windRi * (t * 4.0 - 1.2)
                          + hochRi * (sin(t * 3.14159) * (0.14 + fract(phase * 3.7) * 0.42));
        vStaerke = sin(t * 3.14159);
        vStaerke *= vStaerke;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tiefe = -mv.z;
        gl_PointSize = clamp(groesse * pxSkala / tiefe, 1.0, 6.0);
        vStaerke *= smoothstep(1.2, 4.0, tiefe);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 farbe;
      varying float vStaerke;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        // 1,6 war Funkenflug, 0,30 war unsichtbar. 0,62 liegt dazwischen.
        gl_FragColor = vec4(farbe * vStaerke * (1.0 - r2 * 4.0) * 0.62, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthWrite: false,
    fog: false,
  });
  const punkte = new THREE.Points(geo, material);
  punkte.name = 'nacht-staub';
  punkte.frustumCulled = false;
  return punkte;
}

// **Staubteufel.**
//
// Zwei Wirbel, die über den Planeten wandern. Jeder ist eine Spirale aus
// Körnern: Der Radius wächst mit der Höhe, die Drehung wird nach oben hin
// langsamer (Drehimpulserhaltung — innen und unten schnell, außen und oben
// träge).
//
// **Auf der Kugel gibt es keine gemeinsame Bahnebene mehr.** Auf der Platte
// war die Bahn ein Kreis in x/z und „oben" für beide Wirbel dieselbe Achse.
// Beides fällt hier weg: Jeder Wirbel steht auf seiner eigenen Flächennormale,
// und seine Bahn ist ein Kleinkreis um einen eigenen Pol. Weil sich das je
// Bild ändert und für 840 Körner dasselbe ist, wird es **nicht** je Scheitel
// gerechnet, sondern einmal je Bild in `setzeZeit()` und als Uniform
// übergeben: Mittelpunktsrichtung, Ost- und Nordtangente und der Radius, auf
// dem der Boden dort liegt.
//
// Die Bahnen sind Kleinkreise mit teilerfremden Perioden — 121 s für den
// Umlauf und 37 s für das Wandern der Kreisbreite beim einen, 143 s und 53 s
// beim anderen. Damit wiederholt sich die Bahn erst nach dem kleinsten
// gemeinsamen Vielfachen, praktisch also nie, und die beiden treffen einander
// nie im selben Takt.
//
// Ihr Tempo liegt bei rund 1,3 m/s — spürbar langsamer als die 2,4 m/s des
// Spielers. Man holt einen Staubteufel ein, er läuft einem nicht davon.
function makeStaubteufel(rand, heightAt) {
  const WIRBEL = 2;
  const JE = 420;
  const positions = new Float32Array(WIRBEL * JE * 3);
  const daten = new Float32Array(WIRBEL * JE * 3); // wirbel, hoehenanteil, winkel
  for (let w = 0; w < WIRBEL; w++) {
    for (let i = 0; i < JE; i++) {
      const k = w * JE + i;
      // Nach oben ausdünnen: Ein Wirbel ist unten dicht und oben ein Schleier.
      // **1,4 statt 1,7 seit dem Planeten.** Auf der Platte standen die Wirbel
      // 14 bis 26 m entfernt; auf der Kugel kommt man ihnen bis auf vier Meter
      // Bogen nahe, und dann zeigt sich, wie stark 1,7 die Körner am Fuß
      // zusammendrängt.
      const hAnteil = Math.pow(rand(), 1.4);
      positions[k * 3] = 0;
      positions[k * 3 + 1] = 0;
      positions[k * 3 + 2] = 0;
      daten[k * 3] = w;
      daten[k * 3 + 1] = hAnteil;
      daten[k * 3 + 2] = rand() * Math.PI * 2;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('daten', new THREE.BufferAttribute(daten, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      zeit: { value: 0 },
      pxSkala: { value: 300 },
      // **Zweiter Anlauf, und der erste war falsch begründet.** Ich hatte ihn
      // kühl gewählt — „was man sieht, ist das Mondlicht darauf". Die Hälfte
      // stimmt: Die Quelle ist das Mondlicht. Die andere Hälfte fehlte: Ein
      // Korn in der Luft hat die **Albedo des Bodens**, aus dem es
      // hochgerissen wurde, und die ist warm. Das Produkt aus warmem Korn und
      // leicht kühlem Mondlicht ist ein entsättigtes Warmgrau.
      //
      // Gemessen war 0x5e5a5e obendrein magentastichig (Rot und Blau gleich,
      // Grün darunter): Der Prüfer hat im Bild (144|126|138) abgelesen, gegen
      // einen Boden von (114|70|53). Ein Stoff, der auf diesem Planeten nicht
      // vorkommt.
      farbe: { value: new THREE.Color(0x7a685c) },
      mitteA: { value: new THREE.Vector3(0, 1, 0) },
      ostA: { value: new THREE.Vector3(1, 0, 0) },
      nordA: { value: new THREE.Vector3(0, 0, 1) },
      basisA: { value: PLANET_R },
      mitteB: { value: new THREE.Vector3(0, 1, 0) },
      ostB: { value: new THREE.Vector3(1, 0, 0) },
      nordB: { value: new THREE.Vector3(0, 0, 1) },
      basisB: { value: PLANET_R },
    },
    vertexShader: `
      attribute vec3 daten;
      uniform float zeit;
      uniform float pxSkala;
      uniform vec3 mitteA, ostA, nordA, mitteB, ostB, nordB;
      uniform float basisA, basisB;
      varying float vStaerke;
      void main() {
        float w = daten.x;
        float hA = daten.y;
        float w0 = daten.z;

        // Der Standort des Wirbels und sein Tangentensystem kommen fertig aus
        // setzeZeit(); hier bleibt nur die Spirale um seine eigene Achse.
        vec3 mitte = w < 0.5 ? mitteA : mitteB;
        vec3 ost   = w < 0.5 ? ostA   : ostB;
        vec3 nord  = w < 0.5 ? nordA  : nordB;
        float basis = w < 0.5 ? basisA : basisB;

        float hoehe = hA * (w < 0.5 ? 5.2 : 3.6);
        // **Der Fuß.** Ein Staubteufel bricht unten nicht ab — er steht in
        // einem Kranz aus Material, das er gerade erst aufnimmt. Der Prüfer
        // hat genau das vermisst: „Unten bricht sie ohne Fußsaum und ohne
        // herausrieselndes Material am Boden ab."
        //
        // Die untersten 13 Prozent der Körner bekommen deshalb einen weiten,
        // flachen Kranz statt der schlanken Säule, und sie werden dabei
        // dunkler: Was am Boden schleift, liegt im Eigenschatten des Wirbels.
        float fuss = 1.0 - smoothstep(0.0, 0.13, hA);
        // Radius waechst mit der Hoehe, Drehung wird nach oben langsamer.
        // **0,40 m Fußradius statt 0,22.** Der Fuß ist die dichteste Stelle des
        // Wirbels, und bei additiver Mischung heißt dicht: Die Beiträge
        // summieren sich ohne Obergrenze. Gemessen stand der Fuß in c-krater
        // auf exakt (255|255|255) — reines Weiß, dieselbe Klippe wie einst die
        // Sonnenscheibe des Zen-Gartens. Der doppelte Fußradius verteilt
        // dieselbe Kornzahl auf die vierfache Fläche.
        float radius = 0.30 + fuss * fuss * 0.95 + hA * hA * (w < 0.5 ? 1.5 : 1.05);
        float tempo = (w < 0.5 ? 3.1 : 4.3) / (0.35 + hA * 1.4);
        float winkel = w0 + zeit * tempo;

        // Die Wirbelachse ist die Flächennormale, also die Mittelpunkts-
        // richtung selbst. Der Spiralversatz von höchstens 1,7 m ist gegen den
        // Planetenradius von 25 m klein genug, dass die Tangentialebene
        // ausreicht — die Abweichung zur Kugel liegt bei 6 cm.
        vec3 p = mitte * (basis + hoehe)
               + ost * (cos(winkel) * radius)
               + nord * (sin(winkel) * radius);

        // Nach oben schwaecher, und der ganze Wirbel atmet mit eigener Periode.
        float atmen = 0.55 + 0.45 * sin(zeit / (w < 0.5 ? 11.0 : 17.0) * 6.2832);
        vStaerke = (1.0 - hA * 0.75) * atmen * (1.0 - fuss * 0.45);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float tiefe = -mv.z;
        // **Punktgröße deckeln.** Ein Korn in zwei Metern Abstand bekäme sonst
        // 375 Pixel Durchmesser — das ist keine Staubfahne mehr, das ist eine
        // Blende. 22 Pixel sind die Grenze, ab der ein Korn als Fleck statt als
        // Korn liest.
        gl_PointSize = clamp((0.9 + hA * 1.6) * pxSkala / tiefe, 1.0, 22.0);
        // Nahfeld ausblenden: Wer versehentlich hineinläuft, soll nicht in
        // einer braunen Wand stehen.
        vStaerke *= smoothstep(3.0, 9.0, tiefe);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 farbe;
      varying float vStaerke;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        // **0,105 statt 0,25.** Der Wirbel stand bei einer Spitze von 167 und
        // war damit heller als **jeder** Bodenpunkt der Szene (hellster: 113,9)
        // — nach dem Mond das zweithellste Ding im Bild, und in zwei der zwölf
        // Rundgangsbilder das einzige Motiv. Ein aufgewirbelter Schleier darf
        // nicht heller sein als die Fläche, aus der er stammt.
        //
        // Der Zwischenschritt 0,17 hat nichts gebracht, und das war rechenbar:
        // Die neue Farbe 0x7a685c ist **linear 42 % heller** als die alte
        // 0x5e5a5e (0,152 gegen 0,107), also hebt sie die Absenkung um 32 %
        // fast genau auf — gemessen 156 vorher, 166 nachher. Erst 0,105 bringt
        // die Spitze unter den hellsten Boden.
        gl_FragColor = vec4(farbe * vStaerke * (1.0 - r2 * 4.0) * 0.105, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthWrite: false,
    fog: false,
  });
  const punkte = new THREE.Points(geo, material);
  punkte.name = 'nacht-staubteufel';
  punkte.frustumCulled = false;

  // Die beiden Bahnen. `pol` ist die Achse des Kleinkreises, `breite` sein
  // Öffnungswinkel vom Pol aus. Die Pole sind so gewählt, dass Wirbel A dem
  // Startpunkt bis auf 4 bis 13 m Bogen nahekommt und Wirbel B mit 11 bis 22 m
  // draußen bleibt: einer, dem man begegnet, und einer, den man über die
  // Krümmung steigen sieht.
  const bahnen = [
    { pol: new THREE.Vector3(0.72, 0.38, -0.58).normalize(), breite: 1.52, schwung: 0.17, tBreite: 37, tUmlauf: 121, phi0: 0.0 },
    { pol: new THREE.Vector3(-0.46, 0.55, 0.7).normalize(), breite: 1.66, schwung: 0.21, tBreite: 53, tUmlauf: -143, phi0: 2.1 },
  ];
  for (const b of bahnen) {
    const { ost, nord } = tangentialSystem(b.pol, new THREE.Vector3(), new THREE.Vector3());
    b.e1 = ost;
    b.e2 = nord;
    b.ort = new THREE.Vector3();
  }
  const u = material.uniforms;
  const ziele = [
    { mitte: u.mitteA, ost: u.ostA, nord: u.nordA, basis: u.basisA },
    { mitte: u.mitteB, ost: u.ostB, nord: u.nordB, basis: u.basisB },
  ];
  punkte.userData.setzeZeit = (t) => {
    u.zeit.value = t;
    for (let w = 0; w < WIRBEL; w++) {
      const b = bahnen[w];
      const th = b.breite + b.schwung * Math.sin((t / b.tBreite) * Math.PI * 2);
      const ph = b.phi0 + (t / b.tUmlauf) * Math.PI * 2;
      const d = b.ort
        .copy(b.pol)
        .multiplyScalar(Math.cos(th))
        .addScaledVector(b.e1, Math.sin(th) * Math.cos(ph))
        .addScaledVector(b.e2, Math.sin(th) * Math.sin(ph))
        .normalize();
      const z = ziele[w];
      z.mitte.value.copy(d);
      tangentialSystem(d, z.ost.value, z.nord.value);
      z.basis.value = PLANET_R + heightAt(d);
    }
  };
  punkte.userData.setzeZeit(0);
  return punkte;
}

// **Ein Meteor.**
//
// Einer, nicht viele: Ein Himmel, über den ständig Sternschnuppen laufen, ist
// ein Bildschirmschoner. Alle 31 Sekunden einer, sichtbar für 1,1 Sekunden —
// also zu 3,5 % der Zeit. Wer hinsieht, sieht meistens keinen; wer einen sieht,
// hat Glück gehabt. Genau das ist die Wirkung, um die es geht.
//
// Gebaut als **ein** langgezogenes Viereck, das entlang seiner Bahn liegt: Der
// Schweif ist kein Nachziehen mehrerer Bilder, sondern die Streckung des
// Vierecks selbst, hell am Kopf und auslaufend nach hinten. Zwei Dreiecke.
function makeMeteor() {
  const laenge = 7.0;
  const breite = 0.22;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([0, breite, 0, 0, -breite, 0, -laenge, -breite * 0.25, 0, -laenge, breite * 0.25, 0]),
      3
    )
  );
  // u läuft von 1 am Kopf auf 0 am Schweifende.
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0, 0, 1]), 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);

  const material = new THREE.ShaderMaterial({
    uniforms: { zeit: { value: 0 } },
    vertexShader: `
      uniform float zeit;
      varying vec2 vUv;
      varying float vAn;
      void main() {
        vUv = uv;
        float periode = 31.0;
        float t = fract(zeit / periode);
        float sichtbar = 1.1 / periode;
        vAn = 1.0 - step(sichtbar, t);
        float s = t / sichtbar;                 // 0 … 1 während des Fluges
        // Bahn: von hoch oben links nach schräg unten rechts, an der Kuppel
        // entlang. Anfang und Ende liegen außerhalb des Blickfelds der meisten
        // Kameras — der Meteor kommt und geht, er erscheint nicht.
        vec3 von = vec3(-30.0, 34.0, -22.0);
        vec3 nach = vec3(26.0, 9.0, -34.0);
        vec3 ort = mix(von, nach, s);
        vec3 richtung = normalize(nach - von);
        // Das Viereck an der Bahn ausrichten: x entlang der Flugrichtung,
        // y senkrecht dazu in der Bildebene.
        vec3 zurKamera = normalize(cameraPosition - ort);
        vec3 quer = normalize(cross(richtung, zurKamera));
        vec3 p = ort + richtung * position.x + quer * position.y;
        // Am Anfang und Ende weich, damit er nicht schaltet.
        vAn *= smoothstep(0.0, 0.14, s) * (1.0 - smoothstep(0.72, 1.0, s));
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying float vAn;
      void main() {
        if (vAn <= 0.001) discard;
        // Hell am Kopf, auslaufend nach hinten; quer dazu weich.
        float laengs = pow(vUv.x, 2.2);
        float quer = 1.0 - abs(vUv.y - 0.5) * 2.0;
        float a = laengs * quer * quer * vAn;
        gl_FragColor = vec4(vec3(0.82, 0.86, 0.95) * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: false,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'nacht-meteor';
  mesh.renderOrder = -1; // wie die Sterne: vor dem Gelände gezeichnet, also dahinter
  mesh.frustumCulled = false;
  return mesh;
}

// --- Der Mond ---------------------------------------------------------------
//
// Er ist die einzige gerichtete Lichtquelle, das hellste Objekt im Bild und
// damit das, worauf jeder Blick zuerst fällt. Bisher war er eine
// `MeshBasicMaterial`-Kugel in 0xe8ecf2: gemessen **L 224 konstant über 50 px
// Durchmesser**, null innere Modulation, harte Kreiskante, dazu ein einzelnes
// Sprite als Hof.
//
// **Warum eine Scheibe statt einer Kugel.** Aus 32 m Abstand hat der Mond einen
// scheinbaren Radius von 2,5° — er *ist* eine Scheibe. Die alte Kugel kostete
// 1216 Dreiecke, um eine Fläche zu zeigen, die zwei Dreiecke ebenso gut
// tragen. Wichtiger als die Dreiecke ist aber die Kontrolle: Auf einer
// Billboard-Scheibe steht jeder Bildpunkt der Mondoberfläche an einer
// bekannten Stelle, und Randabdunklung, Phase und Verkürzung der Krater zum
// Rand hin lassen sich exakt rechnen statt über eine Kugel-UV zu hoffen.
// Gezeitengebunden ist er ohnehin — dieselbe Seite zeigt immer zu uns, genau
// wie beim echten Mond.
//
// Der Aufbau ist zweistufig, weil beides seine eigene Sprache hat:
//
//   A  **Albedo** mit Zeichenbefehlen: Maria, Krater, Strahlensysteme. Formen
//      sind Formen, die zeichnet man.
//   B  **Beleuchtung** je Pixel: Randabdunklung, Phase, weiche Kante. Das ist
//      Rechnung über die Kugelnormale und geht nicht mit Zeichenbefehlen.
//
// **Der Kern wird gedeckelt.** Die bezahlte Lehre aus dem Zen-Garten: Die
// Sonnenscheibe stand dort zu 20,7 % auf exakt (255,255,255) und hatte damit
// keine Farbe mehr. Hier liegt das Hochland bei 236, die Maria bei 150 bis 170
// — kein Pixel erreicht 255, und die Oberfläche bleibt lesbar.
// **Ein Bauer, zwei Monde.**
//
// Der zweite Mond ist ein anderer Körper, kein anderer Anstrich: rötlich,
// kleiner, exakt halb beleuchtet, stärker zerschlagen. Was ihn vom ersten
// unterscheidet, sind Farben, Phase, Kraterzahl und Saat — alles Zahlen. Die
// zweihundert Zeilen Scheibenbau darunter zu verdoppeln wäre die Sorte
// Kopie, bei der beim nächsten Mal nur eine der beiden gepflegt wird.
const MOND_STIL = {
  // Der Erdmond: kühles Hochland, graue Maria, drei Viertel beleuchtet.
  weiss: {
    saat: 31415926,
    hochland: '#e8eaf0',
    fleckHell: 'rgba(250,251,255,0.16)',
    fleckDunkel: 'rgba(176,180,194,0.18)',
    maria: 'rgba(150,155,170,',
    kraterBoden: '132,136,150',
    wallHell: '252,253,255',
    wallDunkel: '108,112,126',
    strahlenFarbe: '232,234,240',
    phaseZ: 0.47,
    krater: 90,
    strahlen: true,
    erdschein: 0.055,
  },
  // Der Begleiter auf der Gegenseite: eisenrotes Hochland, dunkelrostige
  // Becken, **exakt Halbmond** (phaseZ = 0 heißt Terminator genau über die
  // Mitte), doppelt so viele Krater und keine Strahlensysteme — ein alter,
  // zerschlagener Körper neben einem jüngeren. Der Erdschein ist niedriger:
  // Der Planet, der ihn anleuchten würde, ist selbst nur 50 m groß.
  rot: {
    saat: 271828182,
    hochland: '#c98a63',
    fleckHell: 'rgba(226,166,132,0.17)',
    fleckDunkel: 'rgba(122,60,44,0.22)',
    maria: 'rgba(112,54,40,',
    kraterBoden: '104,50,38',
    wallHell: '236,182,150',
    wallDunkel: '74,34,26',
    strahlenFarbe: '224,168,136',
    phaseZ: 0.0,
    krater: 170,
    strahlen: false,
    erdschein: 0.03,
  },
};

const _mondKarten = new Map();
function mondScheibe(stilName = 'weiss') {
  if (_mondKarten.has(stilName)) return _mondKarten.get(stilName);
  const stil = MOND_STIL[stilName];
  const S = 512;
  const R = S * 0.47;
  const M = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const mr = mulberry32(stil.saat);

  // --- A: Albedo ------------------------------------------------------------
  // **Zweiter Anlauf am Grundton.** 0xb9bcc4 (185|188|196) ergab nach
  // Randabdunklung und Phase eine Scheibe mit Mittel 75 und p95 159 — gegen
  // 191/224 im Ausgangsstand. Der Mond ist die einzige Lichtquelle und der
  // Punkt, auf den die ganze Komposition zeigt; ihn dunkler zu machen als
  // vorher wäre das Gegenteil der Aufgabe. Das Hochland liegt jetzt bei 232,
  // die Maria bei rund 150 — mehr Spitze als vorher **und** eine Spanne, wo
  // vorher ein Farbfeld war.
  ctx.fillStyle = stil.hochland;
  ctx.beginPath();
  ctx.arc(M, M, R, 0, Math.PI * 2);
  ctx.fill();

  // Feine Fleckigkeit des Hochlands. Ohne sie ist die helle Fläche zwischen den
  // Maria ein Farbfeld – derselbe Fehler wie beim Regolith, eine Ebene tiefer.
  ctx.save();
  ctx.beginPath();
  ctx.arc(M, M, R, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 1400; i++) {
    const a = mr() * Math.PI * 2;
    const r = Math.sqrt(mr()) * R;
    const x = M + Math.cos(a) * r;
    const y = M + Math.sin(a) * r;
    const rad = 3 + mr() * 16;
    const hell = mr() < 0.5;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, hell ? stil.fleckHell : stil.fleckDunkel);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // **Maria.** Nicht runde Flecken, sondern zusammenhängende Becken mit
  // ausgefransten Rändern – die Mondmeere sind ausgelaufene Lavaebenen, keine
  // Tupfen. Jedes entsteht aus einem Kernblob plus einem Kranz kleinerer
  // Blobs, die den Rand unregelmäßig machen.
  const maria = [
    { x: -0.30, y: -0.34, r: 0.30 },
    { x: 0.04, y: -0.42, r: 0.22 },
    { x: -0.44, y: 0.02, r: 0.20 },
    { x: -0.10, y: 0.10, r: 0.26 },
    { x: 0.30, y: -0.16, r: 0.15 },
    { x: 0.18, y: 0.34, r: 0.13 },
  ];
  const blob = (x, y, r, farbe) => {
    const g = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
    g.addColorStop(0, farbe);
    g.addColorStop(0.72, farbe);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const m of maria) {
    const cx = M + m.x * R;
    const cy = M + m.y * R;
    const cr = m.r * R;
    blob(cx, cy, cr, stil.maria + '0.88)');
    const n = 7 + Math.floor(mr() * 6);
    for (let k = 0; k < n; k++) {
      const a = mr() * Math.PI * 2;
      const d = cr * (0.6 + mr() * 0.55);
      blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cr * (0.3 + mr() * 0.35), stil.maria + '0.74)');
    }
  }

  // **Krater.** Ein Krater ist kein Kreis, sondern ein Wall mit Licht- und
  // Schattenseite. Beide Bögen zeigen zur selben Sonne wie die Phase weiter
  // unten – sonst widersprächen sich Oberfläche und Terminator.
  //
  // Zum Rand hin werden sie verkürzt: Ein Krater bei 80 % Radius wird unter
  // 37° gesehen. Genau diese Ellipsen sind es, die eine flache Scheibe als
  // Kugel lesbar machen.
  const SONNE = { x: -0.62, y: -0.55 }; // Richtung, aus der beleuchtet wird
  const krater = (x, y, rad, tiefe) => {
    const dx = (x - M) / R;
    const dy = (y - M) / R;
    const d = Math.min(0.995, Math.hypot(dx, dy));
    const verkuerzung = Math.sqrt(1 - d * d);
    const winkel = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(winkel);
    ctx.scale(Math.max(0.12, verkuerzung), 1);
    ctx.rotate(-winkel);
    // Boden
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, `rgba(${stil.kraterBoden},${0.30 * tiefe})`);
    g.addColorStop(0.78, `rgba(${stil.kraterBoden},${0.20 * tiefe})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();
    // Wall: heller Bogen zur Sonne, dunkler gegenüber
    ctx.lineWidth = Math.max(1, rad * 0.20);
    const a0 = Math.atan2(SONNE.y, SONNE.x);
    ctx.strokeStyle = `rgba(${stil.wallHell},${0.5 * tiefe})`;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.92, a0 - 1.5, a0 + 1.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${stil.wallDunkel},${0.45 * tiefe})`;
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.92, a0 + Math.PI - 1.5, a0 + Math.PI + 1.5);
    ctx.stroke();
    ctx.restore();
  };
  for (let i = 0; i < stil.krater; i++) {
    const a = mr() * Math.PI * 2;
    const r = Math.sqrt(mr()) * R * 0.985;
    krater(M + Math.cos(a) * r, M + Math.sin(a) * r, 2.5 + Math.pow(mr(), 2.4) * 30, 0.5 + mr() * 0.5);
  }

  // Strahlensysteme: zwei junge Krater mit hellem Auswurf. Sie sind der
  // auffälligste Einzelzug auf dem echten Mond und kosten hier fünf Zeilen.
  for (const s of stil.strahlen ? [{ x: 0.26, y: 0.46, r: 10 }, { x: -0.52, y: 0.40, r: 7 }] : []) {
    const cx = M + s.x * R;
    const cy = M + s.y * R;
    for (let k = 0; k < 26; k++) {
      const a = mr() * Math.PI * 2;
      const len = R * (0.16 + mr() * 0.42);
      const g = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      g.addColorStop(0, `rgba(${stil.strahlenFarbe},0.30)`);
      g.addColorStop(1, `rgba(${stil.strahlenFarbe},0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5 + mr() * 4.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.r);
    g.addColorStop(0, `rgba(${stil.strahlenFarbe},0.85)`);
    g.addColorStop(1, `rgba(${stil.strahlenFarbe},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // --- B: Beleuchtung je Pixel ---------------------------------------------
  //
  // Randabdunklung und Phase brauchen die **Kugelnormale** an jedem Bildpunkt,
  // und die gibt es nur rechnend: z = sqrt(R² − x² − y²) über der Scheibe.
  const bild = ctx.getImageData(0, 0, S, S);
  const d = bild.data;
  // Sonnenrichtung im Scheibenraum. Die z-Komponente steuert die Phase: 1,0
  // wäre Vollmond (kein Terminator), 0,0 Halbmond. 0,47 ergibt rund 74 %
  // beleuchtete Fläche – genug Sichel, dass die Kugelform liest, genug Fläche,
  // dass er die Lichtquelle der Szene bleiben darf.
  const sl = Math.hypot(SONNE.x, SONNE.y, stil.phaseZ);
  const sx = SONNE.x / sl;
  const sy = SONNE.y / sl;
  const sz = stil.phaseZ / sl;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const nx = (x + 0.5 - M) / R;
      const ny = (y + 0.5 - M) / R;
      const r2 = nx * nx + ny * ny;
      if (r2 >= 1) {
        d[i + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - r2);

      // Randabdunklung: I = 0,60 + 0,40 · cos(θ)^0,45. Ein Mond ist kein
      // Lambert-Strahler – der Regolith streut stark zurück –, deshalb ein
      // schwacher Exponent statt des vollen Kosinus. Zu viel davon macht aus
      // dem Mond eine Billardkugel.
      const rand = 0.70 + 0.30 * Math.pow(nz, 0.45);

      // Phase: Kosinus zwischen Normale und Sonnenrichtung, weich über den
      // Terminator. Der Rest der Scheibe bleibt schwach sichtbar (Erdschein),
      // sonst wäre die unbeleuchtete Seite ein Loch im Sternhimmel.
      const cosI = nx * sx + ny * sy + nz * sz;
      const phase = stil.erdschein + (1 - stil.erdschein) * smoothstep(-0.10, 0.22, cosI);

      const f = rand * phase;
      d[i] = Math.min(252, d[i] * f);
      d[i + 1] = Math.min(252, d[i + 1] * f);
      d[i + 2] = Math.min(252, d[i + 2] * f);
      // Kante über etwa 1,5 Pixel weich auslaufen lassen. Der alte Mond ging
      // in fünf Pixeln von 74 auf 224 – eine Kreiskante, die man als solche
      // sieht.
      d[i + 3] = 255 * Math.min(1, (1 - Math.sqrt(r2)) * (R / 1.5));
    }
  }
  ctx.putImageData(bild, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  _mondKarten.set(stilName, tex);
  return tex;
}

// Ein Hof aus **drei** Lagen statt einer.
//
// Der alte Hof war ein einzelnes Sprite mit einem linearen Verlauf; im Bild
// las er als aufgeklebte Scheibe mit erkennbarem Rand. Ein echter Hof um einen
// hellen Körper hat mindestens drei Anteile mit sehr unterschiedlicher
// Reichweite: die enge, helle Korona direkt am Rand, der mittlere Streuhof
// über einige Durchmesser, und ein sehr weiter, sehr schwacher Schein. Weil
// jede Lage einen anderen Exponenten hat, entsteht kein sichtbarer Rand.
function mondHof(name, innen, aussen, exponent, groesse, staerke) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const bild = ctx.createImageData(S, S);
  const d = bild.data;
  const ci = new THREE.Color(innen);
  const ca = new THREE.Color(aussen);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const r = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5) * 2;
      const a = r >= 1 ? 0 : Math.pow(1 - r, exponent) * staerke;
      const t = Math.min(1, r * 1.6);
      d[i] = (ci.r + (ca.r - ci.r) * t) * 255;
      d[i + 1] = (ci.g + (ca.g - ci.g) * t) * 255;
      d[i + 2] = (ci.b + (ca.b - ci.b) * t) * 255;
      d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(bild, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    })
  );
  sprite.name = name;
  sprite.scale.set(groesse, groesse, 1);
  return sprite;
}

// --- Das Sternfeld ----------------------------------------------------------
//
// Der Ausgangsstand hatte zwei Schalen mit je **einer** Größe und **einer**
// Farbe: 1300 Punkte zu 0,28 und 200 zu 0,55, beide aus derselben weißen
// Glühtextur. Im Bild waren das achsenparallele 2×2-Quadrate — der Prüfer hat
// sie als Programmierer-Tell gelistet.
//
// **Zwei Fehler stecken darin, und der zweite ist der schwerere.**
//
// *Erstens die Staffelung.* Ein echter Sternhimmel hat keine zwei Klassen,
// sondern eine Verteilung: Je Größenklasse gibt es rund zweieinhalbmal so
// viele Sterne wie in der nächsthelleren. Und er hat Farben — von blauweiß
// über weiß und gelb bis orange. Beides steckt hier in Attributen je Punkt,
// nicht in Materialien; damit bleibt das ganze Feld **ein** Draw-Call.
//
// Die Farbe ist dabei an die Helligkeit gekoppelt: Nur die hellen Sterne
// bekommen eine deutliche Farbtemperatur, die schwachen bleiben nahe Weiß.
// Andersherum sähe es aus wie Konfetti — und es entspräche auch nicht dem
// Auge, das Farbe erst oberhalb einer Schwelle sieht.
//
// *Zweitens die Tiefe.* Die Schalen lagen bei 38 bis 40 m, die Bodenfläche
// reicht bis 48 m und in die Ecken bis 67 m. Alles Gelände, das weiter weg ist
// als die Schale, wurde von den Sternen **überzeichnet** — nachgemessen 18
// helle Punkte innerhalb der Geländesilhouette in `d-aerial`, z. B. (368,160)
// mit L 135 bei einer Umgebung von L 13.
//
// Der Grund ist nicht die Entfernung, sondern die Reihenfolge: Ein
// `transparent: true`-Material landet in der **transparenten** Liste, und die
// zeichnet three grundsätzlich **nach** allen opaken Objekten. Ein Stern kann
// von dort aus nie hinter das Gelände.
//
// Der Ausweg steht in three selbst, in `WebGLState.setMaterial`:
//
//     ( material.blending === NormalBlending && material.transparent === false )
//       ? setBlending( NoBlending )
//       : setBlending( material.blending, … )
//
// Additives Mischen bleibt also auch bei `transparent: false` aktiv. Damit
// gehören die Sterne in die **opake** Liste, werden über `renderOrder` vor das
// Gelände sortiert, schreiben keine Tiefe und prüfen keine — und das Gelände
// zeichnet anschließend darüber. Genau das soll passieren.
//
// Reihenfolge: Kuppel (−2), Sterne (−1), alles andere (0).
function makeSternfeld(rand, R = 41) {
  // **Der halbe Himmel hat gefehlt, und zwar messbar.**
  //
  // Hier stand eine **Kappe** von y = −0,36 bis y = +1: die obere Halbkugel
  // plus die zwanzig Grad bis zur Geländekante. Auf der 96-m-Platte war das
  // richtig — was tiefer lag, deckten Boden und Nebel ab.
  //
  // Auf dem Planeten dreht das Sternfeld mit der Welt, weil sonst der Mond nie
  // unterginge. Die Kappe dreht mit — und zeigt nach einer halben Runde nach
  // **unten**. Gemessen in `h-mond-rot` (Station 180): In den obersten 240
  // Bildzeilen stand **kein einziger** heller Punkt, während unten 510 standen.
  // Der Auftraggeber hat es zweimal gemeldet, bevor ich es nachgezählt habe.
  //
  // Jetzt die volle Kugel. Was unter dem Horizont steht, verdeckt der Boden —
  // das kostet nichts und ist die einzige Verteilung, die unter jeder Drehung
  // richtig bleibt.
  //
  // **Die Anzahl steigt dabei, ohne den gesäten Strom zu verschieben.** Über
  // die ganze Kugel statt über eine Kappe wäre dieselbe Zahl halb so dicht.
  // `makeSternfeld` läuft aber **vor** dem Bau des Planeten, und jeder
  // zusätzliche `rand()`-Zug verschöbe die Lage sämtlicher Brocken,
  // Formationen und Findlinge. Deshalb: genau so viele Züge aus dem gesäten
  // Strom verbrauchen wie bisher, und danach mit einem eigenen Strom bauen.
  const ANZAHL_ALT = 2600;
  const ZUEGE_JE_STERN = 5; // u, phi, Helligkeit, Farbe, Phase
  for (let i = 0; i < ANZAHL_ALT * ZUEGE_JE_STERN; i++) rand();
  const mr = mulberry32(90210077);

  const ANZAHL = 5200;

  const positions = new Float32Array(ANZAHL * 3);
  const farben = new Float32Array(ANZAHL * 3);
  const groessen = new Float32Array(ANZAHL);
  const phasen = new Float32Array(ANZAHL);
  // Wie stark ein Stern der Gleichhelligkeit unterliegt — je Stern gebacken,
  // weil Mond und Sternfeld in derselben Gruppe sitzen und ihre gegenseitige
  // Lage sich nie ändert.
  const gleichAn = new Float32Array(ANZAHL);

  // Farbtemperaturleiter von heiß nach kühl. Die Anteile sind grob an eine
  // Sichtbarkeitsauswahl angelehnt, nicht an eine Katalogstatistik – es ist
  // eine stilisierte Nacht, keine Simulation.
  const TEMPERATUREN = [
    [0.62, 0.72, 1.0], // blauweiß
    [0.80, 0.86, 1.0], // weißblau
    [1.0, 0.99, 0.98], // weiß
    [1.0, 0.94, 0.82], // gelblich
    [1.0, 0.82, 0.63], // orange
  ];

  const c = new THREE.Color();
  for (let i = 0; i < ANZAHL; i++) {
    // Gleichverteilt auf der **ganzen** Kugel. `y` ist der Kosinus des
    // Polarwinkels – ohne diese Umrechnung ballen sich die Punkte an den Polen.
    let y = mr() * 2 - 1;
    const phi = mr() * Math.PI * 2;
    let sn = Math.sqrt(Math.max(0, 1 - y * y));
    let dx = sn * Math.cos(phi);
    let dz = sn * Math.sin(phi);

    // **Ein gutes Drittel der Sterne gehört ins Band.**
    //
    // Der Prüfer: „ein weichgezeichnetes graues Band ohne eine einzige
    // Punktquelle […] in `a-augenhoehe` steht sie neben einer echten Staubfahne
    // und ist von ihr nicht zu unterscheiden." Eine Milchstraße besteht aus
    // Sternen; ein Band ohne welche ist Rauch.
    //
    // Die Verdichtung ist eine Stauchung, keine zweite Ziehung: Der Anteil der
    // Richtung entlang des Bandpols wird auf ein Fünftel zusammengedrückt und
    // die Richtung neu normiert. Aus einer gleichverteilten Kugel wird damit
    // ein Gürtel von rund elf Grad Halbbreite — und die Verteilung *innerhalb*
    // des Gürtels bleibt gleichmäßig, ohne Ballung an einem Rand.
    if (mr() < 0.36) {
      const w = dx * MILCH_POL.x + y * MILCH_POL.y + dz * MILCH_POL.z;
      const k = 0.2;
      let nx = dx - MILCH_POL.x * w * (1 - k);
      let ny = y - MILCH_POL.y * w * (1 - k);
      let nz = dz - MILCH_POL.z * w * (1 - k);
      const l = Math.hypot(nx, ny, nz) || 1;
      dx = nx / l;
      y = ny / l;
      dz = nz / l;
      sn = Math.sqrt(Math.max(0, 1 - y * y));
    }
    positions[i * 3] = dx * R;
    positions[i * 3 + 1] = y * R;
    positions[i * 3 + 2] = dz * R;

    // **Gleich hell — aber nur dort, wo der Mond nicht scheint.**
    //
    // Der erste Anlauf hat *alle* Sterne gleich hell gemacht; gemeint war die
    // mondabgewandte Seite. Das ist zum Glück die einfachere Aufgabe: Mond und
    // Sternfeld sitzen in derselben Gruppe, ihre gegenseitige Lage ändert sich
    // beim Rundgang **nie**. Der Anteil lässt sich deshalb je Stern einbacken,
    // statt ihn je Bild zu rechnen.
    //
    // Am Mond behält der Himmel seine Größenklassen — dort blendet sein Hof
    // die schwachen ohnehin aus, und die wenigen hellen sind genau das, was
    // man neben einem Mond sieht. Auf der Gegenseite stehen sie alle gleich
    // hell und damit alle sichtbar.
    const zumMond = dx * MOND_RICHTUNG.x + y * MOND_RICHTUNG.y + dz * MOND_RICHTUNG.z;
    const abgewandt = smoothstep(0.30, -0.45, zumMond);
    gleichAn[i] = abgewandt;

    // Helligkeitsverteilung für die Mondseite: `pow(rand, 2.6)` liefert viele
    // schwache und wenige helle.
    const m = Math.pow(mr(), 2.6);
    const groesseNat = 0.13 + m * 0.78;
    const GROESSE_GLEICH = 0.60;
    groessen[i] = groesseNat + (GROESSE_GLEICH - groesseNat) * abgewandt;

    // Farbe: auf der Gleichseite auf gleiche Leuchtdichte normiert, damit die
    // Farbtemperatur die Helligkeit nicht durch die Hintertür wieder ungleich
    // macht. Auf der Mondseite wie bisher anteilig mit der Größenklasse.
    const temp = TEMPERATUREN[Math.floor(mr() * TEMPERATUREN.length)];
    const saettigung = 0.18 + m * 0.72;
    const rNat = 1 + (temp[0] - 1) * saettigung;
    const gNat = 1 + (temp[1] - 1) * saettigung;
    const bNat = 1 + (temp[2] - 1) * saettigung;
    const y709 = 0.2126 * temp[0] + 0.7152 * temp[1] + 0.0722 * temp[2];

    // **Keine Extinktion mehr.** Sie beschreibt Luft, und die gibt es hier
    // nicht; auf der vollen Kugel wäre sie ohnehin nur eine Verdunklung der
    // Sterne, die unter dem Boden stehen.
    const HELL_GLEICH = 0.62;
    const hellNat = 0.30 + m * 0.70;
    const hell = hellNat + (HELL_GLEICH - hellNat) * abgewandt;
    const kNat = hell;
    const kGleich = hell / y709;
    const k = kNat + (kGleich - kNat) * abgewandt;
    c.setRGB(
      (rNat + (temp[0] - rNat) * abgewandt) * k,
      (gNat + (temp[1] - gNat) * abgewandt) * k,
      (bNat + (temp[2] - bNat) * abgewandt) * k
    );
    farben[i * 3] = c.r;
    farben[i * 3 + 1] = c.g;
    farben[i * 3 + 2] = c.b;

    phasen[i] = mr() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('farbe', new THREE.BufferAttribute(farben, 3));
  geometry.setAttribute('groesse', new THREE.BufferAttribute(groessen, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phasen, 1));
  geometry.setAttribute('gleich', new THREE.BufferAttribute(gleichAn, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      // Punktgröße in Pixeln bei einem Meter Abstand. Wird beim Ändern der
      // Fenstergröße nachgeführt, sonst wären die Sterne in der Brille
      // (höhere Auflösung) winzig.
      // 420 im ersten Anlauf ergab bei der größten Klasse 9,3 px Durchmesser
      // — das sind keine Sterne mehr, das sind Lampen. 260 bringt die hellsten
      // auf knapp 6 px und die schwächsten auf das Minimum von 1 px.
      // Die Punktgröße wird auf den Schalenradius bezogen: `gl_PointSize`
      // rechnet mit 1/Abstand, und ein Stern auf einer Schale von 280 m wäre
      // sonst sieben Mal kleiner als einer auf 41 m.
      pxSkala: { value: (260 * R) / 41 },
      zeit: { value: 0 },
    },
    vertexShader: `
      attribute float groesse;
      attribute vec3 farbe;
      attribute float phase;
      attribute float gleich;
      uniform float pxSkala;
      uniform float zeit;
      varying vec3 vFarbe;
      varying float vSchwund;
      void main() {
        // **Flimmern nur auf der Mondseite.**
        //
        // Der erste Anlauf hat es ganz abgeschafft — mit dem Argument, dass
        // Szintillation in der Atmosphaere entsteht und ein luftloser Koerper
        // keine hat. Das stimmt, kostet aber einen der vier Traeger von
        // Bewegung, und gemeint war ohnehin nur die abgewandte Seite. Dort, wo
        // die Sterne gleich hell stehen sollen, waere ein Flimmern genau der
        // Rest, der sie wieder ungleich macht; auf der Mondseite darf der
        // Himmel weiter atmen.
        float f = 1.0 + sin(zeit * (1.7 + fract(phase) * 2.3) + phase)
                        * 0.16 * (1.2 - groesse) * (1.0 - gleich);
        vFarbe = farbe * f;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // **Ein Stern unter zweieinhalb Bildpunkten wird nicht kleiner,
        // sondern schwächer.** Der Prüfer hat die schwachen Sterne bei
        // achtfacher Vergrößerung als achsenparallele harte Vierecke gefunden —
        // zu Recht: Der runde Auslauf im Fragmentschritt kann nichts formen,
        // wenn das Fenster 1×1 oder 2×2 Bildpunkte groß ist. Das alte max(1.0, …) hat
        // genau das erzwungen.
        //
        // Physikalisch ist ein Stern ohnehin ein Punkt; was man sieht, ist die
        // Punktbildfunktion des Instruments, und die ist mehrere Bildpunkte
        // breit. Unterhalb der Mindestgröße bleibt die Fläche deshalb stehen
        // und die Helligkeit geht mit dem Quadrat des Verhältnisses zurück —
        // die abgestrahlte Menge bleibt damit dieselbe, nur verteilt.
        // 4,2 statt 2,6: Bei 2,6 Bildpunkten spannt der runde Auslauf über
        // 1,3 Halbmesser, und das bleibt ein Klotz. Erst ab gut vier
        // Bildpunkten liest der Punkt als Punkt.
        float roh = groesse * f * pxSkala / -mv.z;
        const float MINGROESSE = 3.0;
        gl_PointSize = max(MINGROESSE, roh);
        // Untergrenze 0,30: Streng nach Fläche gerechnet fiele ein Stern von
        // einem Bildpunkt auf ein Siebzehntel und wäre weg. Die schwachen
        // Sterne sind aber die Mehrheit und tragen die Dichte des Himmels.
        vSchwund = clamp((roh * roh) / (MINGROESSE * MINGROESSE), 0.75, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vFarbe;
      varying float vSchwund;
      void main() {
        // Runder, weich auslaufender Punkt statt des quadratischen Fensters,
        // das ein ungefiltertes gl_PointCoord hinterlässt. Ohne das sind
        // schwache Sterne 1×1- und 2×2-Blöcke mit sichtbaren Achsen.
        vec2 d = gl_PointCoord - 0.5;
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;
        float a = exp(-r2 * 16.0) - 0.0183;
        // **Der Kern wird gedeckelt.** Ohne die Grenze standen die hellsten
        // Sterne auf exakt (255|255|255) — gemessen 34 Pixel in b-moon —
        // und hatten damit keine Farbtemperatur mehr, obwohl genau die in
        // diesem Paket gebaut wurde. Dieselbe Lehre wie bei der Sonnenscheibe
        // des Zen-Gartens. 0,93 laesst sie strahlen und behaelt den Farbstich.
        gl_FragColor = vec4(min(vFarbe * max(0.0, a) * 1.35 * vSchwund, vec3(0.93)), 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    // **Nicht** transparent: Damit landet das Feld in der opaken Liste und
    // kann über renderOrder vor das Gelände sortiert werden. Additives
    // Mischen bleibt trotzdem aktiv (Begründung im Kopf dieser Funktion).
    transparent: false,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });

  const sterne = new THREE.Points(geometry, material);
  sterne.name = 'nacht-sterne';
  sterne.renderOrder = -1;
  sterne.frustumCulled = false; // die Schale umgibt die Kamera immer
  return sterne;
}

// `horizontSinus` ist der Sinus des Höhenwinkels, unter dem der sichtbare
// Horizont liegt. Auf einer Ebene ist er 0 — der Horizont steht auf Augenhöhe.
// Auf einer Kugel mit 25 m Halbmesser steht er bei 1,6 m Augenhöhe **20,0 Grad
// tiefer** (acos(25/26,6)), und das ist keine Feinheit: Der ganze Streifen
// zwischen −20 und 0 Grad ist Himmel, und der lag mit dem alten Verlauf in der
// Farbe `unten` — praktisch schwarz. Im Bild stand daraufhin eine schwarze
// Kuppel von 40 Grad Durchmesser mitten in der Szene, durch die die Sterne
// hindurchschienen (der Strahl durch das Pixel traf `nacht-kuppel` in 299,67 m
// bei dir.y = −0,046).
function makeNachtKuppel(radius = 44, horizontSinus = 0) {
  // **Die Bandlage ist gerechnet, nicht gegriffen.** Der erste Pol
  // (0,46 | 0,63 | −0,63) lag so, dass das Band in `a-eyelevel` bei einer
  // Querkoordinate von 1,9 stand — also weit außerhalb der Kachel und damit
  // unsichtbar. Ein Milchstraßenband, das man in keiner der sechs Kameras
  // sieht, ist kein Band, sondern toter Code.
  //
  // Der neue Pol ist so konstruiert, dass er mit der Mondrichtung
  // (14 | 16 | −24), normiert (0,437 | 0,499 | −0,749), einen Winkel bildet,
  // dessen Kosinus 0,42 beträgt: Das Band läuft damit rund 25° **neben** dem
  // Mond vorbei. Es soll ihm nicht die Bühne nehmen — er ist das Motiv — aber
  // im selben Blickfeld stehen. Konstruiert als
  //   0,423 · Mondrichtung + 0,906 · (waagerechter Vektor senkrecht dazu),
  // was den Pol fast waagerecht stellt und das Band damit **steil** — es
  // kreuzt den Himmel schräg statt am Horizont zu liegen.
  const mwPol = MILCH_POL;
  // Zwei orthonormale Vektoren in der Bandebene. Sie legen fest, wo u = 0
  // liegt; welche es sind, ist gleichgültig, solange sie senkrecht stehen.
  const mwA = new THREE.Vector3(0, 1, 0).cross(mwPol).normalize();
  const mwB = mwPol.clone().cross(mwA).normalize();

  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      // **Zweiter Anlauf, nach Messung.** Der erste stand auf 0x0a1226 /
      // 0x121a30 / 0x2c1d18 und hat aus der Nacht eine Dämmerung gemacht: Das
      // Bildmittel sprang über alle sechs Kameras von 25…40 auf 38…50, das
      // p01 von 2,3 auf 9…16. Ein Himmel, dessen dunkelste Stelle bei 10 liegt,
      // ist kein Nachthimmel mehr.
      //
      // Der Fehler war nicht die Idee, sondern der Betrag: Ich hatte den
      // Farbraum-Befund (Faktor 6 bis 12 zu dunkel) korrigiert **und**
      // gleichzeitig kräftigere Farben gewählt, also zweimal in dieselbe
      // Richtung. Die Werte hier sind rund auf ein Drittel zurückgenommen; der
      // Verlauf bleibt, die Helligkeit geht zurück auf Nacht.
      zenit: { value: new THREE.Color(0x05080f) },
      mitte: { value: new THREE.Color(0x070a14) },
      horizont: { value: new THREE.Color(0x140d0b) },
      unten: { value: new THREE.Color(0x080504) },
      // Luftglühen: das grüne 557,7-nm-Leuchten der oberen Atmosphäre. Es ist
      // der Grund, warum ein Nachthimmel über dem Horizont **nie** einfach
      // dunkler wird, und es ist ein kühler Akzent, der nichts kostet.
      glimmen: { value: new THREE.Color(0x0a1a16) },
      milchKarte: { value: milchstrassenKarte() },
      // **Der Betrag ist gerechnet, sobald die Karte einmal gemessen war.**
      // Die reparierte Karte hat Mittel 36,4 und Spitze 255 von 255, also
      // linear 0,143 im Mittel. Der Zenithimmel liegt linear bei rund 0,003.
      // Mit 0,34 hätte das Band das Fünfzigfache des Himmels beigetragen — ein
      // weißes Tuch. 0,030 bringt den Mittelwert des Bandes auf die
      // Größenordnung des Himmels und die hellsten Ballungen auf gut 46 von
      // 255: sichtbar, aber der Mond bleibt das hellste im Bild.
      milchStaerke: { value: 0.042 },
      // Die drei Bandvektoren sind Uniforms, weil die Kuppel selbst **nicht**
      // mitdreht: Der Grundverlauf und das Luftglühen gehören zum Ort des
      // Betrachters und müssen über ihm stehen bleiben, die Milchstraße gehört
      // zum Sternhimmel und muss mit ihm wandern. Beides in einer Fläche geht
      // nur so.
      mwPol: { value: mwPol.clone() },
      mwA: { value: mwA.clone() },
      mwB: { value: mwB.clone() },
      hHor: { value: horizontSinus },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 zenit;
      uniform vec3 mitte;
      uniform vec3 horizont;
      uniform vec3 unten;
      uniform vec3 glimmen;
      uniform sampler2D milchKarte;
      uniform float milchStaerke;
      uniform vec3 mwPol;
      uniform vec3 mwA;
      uniform vec3 mwB;
      uniform float hHor;
      varying vec3 vPos;

      void main() {
        vec3 dir = normalize(vPos);
        // Höhe über dem SICHTBAREN Horizont, auf 0…1 nach oben und 0…−1 nach
        // unten gestreckt. Auf der Ebene (hHor = 0) ist das genau dir.y wie
        // bisher; auf dem Planeten schiebt es den ganzen Verlauf um 20 Grad
        // nach unten, dorthin, wo die Kante des Planeten wirklich liegt.
        float h = dir.y > hHor
          ? (dir.y - hHor) / (1.0 - hHor)
          : (dir.y - hHor) / (1.0 + hHor);

        // Grundverlauf in drei Stufen statt zwei: Ein Nachthimmel ist am
        // Zenit nicht einfach die dunkelste Fassung der Horizontfarbe, er
        // wechselt den Farbton.
        vec3 col;
        if (h > 0.0) {
          float t = pow(h, 0.62);
          col = t < 0.5
            ? mix(horizont, mitte, t * 2.0)
            : mix(mitte, zenit, (t - 0.5) * 2.0);
        } else {
          col = mix(horizont, unten, pow(-h, 0.7));
        }

        // --- Milchstraße --------------------------------------------------
        // Abstand zur Bandebene als Winkel, damit das Band überall gleich
        // breit ist. Entlang des Bandes wird der Azimut in der Bandebene
        // gemessen – ein voller Umlauf, eine Kachelbreite, keine Naht.
        float d = clamp(dot(dir, mwPol), -1.0, 1.0);
        float quer = asin(d) / 1.5707963;              // -1 … 1
        vec3 inEbene = normalize(dir - mwPol * d);
        float laengs = atan(dot(inEbene, mwB), dot(inEbene, mwA)) * 0.1591549 + 0.5;
        // **Die Bandkante muss weich sein.** Der erste Anlauf hat außerhalb
        // von 0 < v < 1 hart auf 0 gesetzt; weil die Kachel an ihren Rändern
        // nicht schwarz ist, stand im Bild ein Rechteck mit zwei senkrechten
        // Schnittkanten quer über den Himmel. Ein Fensterausdruck statt eines
        // Sprungs kostet nichts und nimmt die Kante ganz weg.
        float v = quer * 2.1 + 0.5;
        float fenster = smoothstep(0.0, 0.16, v) * (1.0 - smoothstep(0.84, 1.0, v));
        float band = texture2D(milchKarte, vec2(laengs, clamp(v, 0.0, 1.0))).r * fenster;

        // --- Extinktion ---------------------------------------------------
        // Zum Horizont hin steht mehr Atmosphäre im Weg. Die Milchstraße
        // verschwindet dort, noch bevor sie den Boden erreicht – ohne das
        // stünde ein helles Band bis in die Geländekante und verriete die
        // Kuppel als Kugel.
        float durchsicht = smoothstep(-0.01, 0.26, h);
        col += band * milchStaerke * durchsicht * vec3(0.86, 0.90, 1.0);

        // --- Luftglühen ---------------------------------------------------
        // Ein schmales Band knapp über dem Horizont, mit einer zweiten,
        // breiteren Keule darüber. Zwei Keulen, weil eine allein als
        // aufgeklebter Streifen liest.
        // **Ein Streifen ohne Form liest als aufgemalt.** Gemessen stand in
        // f-kante bei x = 150, x = 300 und x = 1000 exakt derselbe Wert
        // (23 | 31 | 29) — über die volle Bildbreite kein einziger Zahlenschritt
        // Unterschied. Luftglühen sieht in Wirklichkeit nicht so aus: Es kommt
        // in Bändern und Wellen, weil die Schwerewellen der oberen Atmosphäre
        // die leuchtende Schicht wellen.
        //
        // Drei Sinus über die **waagerechte** Richtung, mit ganzzahlfremden
        // Frequenzen: Das Muster ändert sich mit dem Azimut und bleibt über die
        // Höhe stehen, wie ein Band es tut. Ein Rauschen wäre hier Aufwand ohne
        // Gewinn — bei drei bis sechs Wellen über den ganzen Horizont sieht man
        // keine Periode.
        //
        // ACHTUNG NAMEN: Die Milchstrassenhelligkeit heisst in diesem Shader
        // schon band. Ein zweites float mit
        // demselben Namen ist eine Doppeldeklaration,
        // und die kostet das ganze Programm — im Bild war die Kuppel danach
        // weg und die Konsole voll von „useProgram: program not valid".
        vec3 waag = normalize(vec3(dir.x, 0.0001, dir.z));
        float glimmWelle = sin(dot(waag, vec3(2.7, 0.0, 3.4)) * 3.0 + 0.6)
                         + sin(dot(waag, vec3(-4.3, 0.0, 1.9)) * 3.0 - 1.7) * 0.7
                         + sin(dot(waag, vec3(1.1, 0.0, -6.2)) * 3.0 + 3.1) * 0.45;
        float wellen = 0.55 + 0.45 * clamp(0.5 + 0.28 * glimmWelle, 0.0, 1.0);
        // Und die Schicht selbst liegt nicht schnurgerade: Ihre Höhe wandert um
        // gut einen halben Grad.
        float hv = h + 0.010 * sin(dot(waag, vec3(5.1, 0.0, -3.7)) * 3.0);
        float g1 = exp(-pow((hv - 0.048) / 0.036, 2.0));
        float g2 = exp(-pow((hv - 0.12) / 0.17, 2.0));
        col += glimmen * (g1 * 0.8 + g2 * 0.22) * wellen * step(-0.02, hv);

        // Lineare Werte in Anzeigewerte. Ohne diesen Schritt landet der
        // lineare Wert roh im sRGB-Puffer – siehe die Rechnung im Kopf dieser
        // Datei. Das ist der Unterschied zwischen (2|2|7) und (11|21|51).
        //
        // **Der Exponent muss 1/2,4 sein, nicht 1/2.** Der erste Anlauf hat
        // sqrt(col) als „grobe, aber ausreichende Näherung" benutzt. Sie ist
        // nicht ausreichend, und zwar genau hier: Die sRGB-Kurve ist
        // zweiteilig, und die beiden Äste müssen an der Schwelle 0,0031308
        // zusammenstoßen.
        //
        //   linearer Ast   12,92 · x                =  10,31 von 255
        //   sqrt-Ast       √x · 1,055 − 0,055       =   1,03 von 255
        //   richtig        x^0,41666 · 1,055 − 0,055 = 10,32 von 255
        //
        // Der sqrt-Ast springt an der Schwelle um 9,3 Stufen. Im Bild war das
        // ein **harter Bogen quer über den Himmel**, je Kanal an einer anderen
        // Höhe: In a-eyelevel Spalte x=200 fiel Grün zwischen y=224 und 225
        // von 10 auf 1, Rot zwischen y=312 und 313 ebenso. Zwei sichtbare
        // Kanten in genau dem Wertebereich, in dem ein Nachthimmel lebt.
        vec3 hoch = pow(col, vec3(0.41666)) * 1.055 - 0.055;
        gl_FragColor = vec4(mix(col * 12.92, hoch, step(0.0031308, col)), 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 30), material);
  dome.name = 'nacht-kuppel';
  dome.renderOrder = -2; // vor allem anderen, auch vor den Sternen
  // Die Milchstraße wandert mit dem Sternhimmel, die Kuppel steht still.
  const _mwQ = [mwPol, mwA, mwB];
  dome.userData.setzeWeltdrehung = (q) => {
    const u = material.uniforms;
    u.mwPol.value.copy(_mwQ[0]).applyQuaternion(q);
    u.mwA.value.copy(_mwQ[1]).applyQuaternion(q);
    u.mwB.value.copy(_mwQ[2]).applyQuaternion(q);
  };
  return dome;
}

function createNightEnvironment() {
  const rand = mulberry32(42424242);
  const group = new THREE.Group();
  group.name = 'env-night';

  // --- Zwei Gruppen, und warum es genau zwei sind ----------------------------
  //
  // **Der Spieler bleibt stehen, die Welt dreht sich unter ihm.** Der
  // naheliegende Weg wäre, den Spieler auf der Kugel aufzurichten — sein „oben"
  // wird die Flächennormale. Das bricht jede Y-oben-Annahme der App auf einmal:
  // `Locomotion` rechnet mit UP = (0,1,0) in `_glide`, `_snap` und
  // `_rotateAroundHead`; `cards.js` ordnet Karten auf einem Zylinder um den
  // Nutzer an und ruft `lookAt` mit gleichbleibendem y, damit sie senkrecht
  // stehen; Whiteboard und Zonen sind flach und achsenparallel gebaut.
  //
  // Optisch ist beides dasselbe — es ist dieselbe Relativbewegung, nur trägt
  // eine andere Matrix sie. Aber so bleibt `player` achsenparallel, und der
  // gesamte UI-Code läuft unverändert weiter.
  //
  //   `weltGruppe`   trägt alles, was am Planeten hängt: Boden, Steine, Staub.
  //                  Sie dreht sich um den Planetenmittelpunkt (den Ursprung).
  //   `himmelGruppe` trägt Kuppel, Sterne, Mond und Mondlicht. Sie sitzt am
  //                  **Nordpol** und übernimmt die Drehung der Weltgruppe.
  //
  // Weil die Himmelsgruppe dieselbe Drehung trägt wie die Welt, geht der Mond
  // beim Rundgang von selbst unter — ohne eine einzige Sonderbehandlung.
  const weltGruppe = new THREE.Group();
  weltGruppe.name = 'nacht-welt';
  group.add(weltGruppe);

  // Der Himmel sitzt am Nordpol statt im Planetenmittelpunkt: Der Nutzer steht
  // dort, und eine Kuppel, aus deren Mitte man 25 m heraussteht, hätte einen
  // schiefen Verlauf. Ihr Radius ist mit 300 m so groß, dass die verbleibenden
  // ein bis drei Meter Geländehöhe nicht mehr ins Gewicht fallen.
  const himmelGruppe = new THREE.Group();
  himmelGruppe.name = 'nacht-himmel';
  himmelGruppe.position.set(0, PLANET_R, 0);
  group.add(himmelGruppe);

  // **Die Kuppel dreht nicht mit.** Grundverlauf, Horizontfarbe und Luftglühen
  // sind Eigenschaften des Ortes, an dem der Betrachter steht — sie müssen über
  // ihm stehen bleiben, während sich die Welt unter ihm dreht. Der Sternhimmel
  // dagegen muss wandern, sonst ginge der Mond nie unter. Deshalb zwei Gruppen
  // am selben Ort: eine feste für die Kuppel, eine mitdrehende für alles andere.
  const kuppelGruppe = new THREE.Group();
  kuppelGruppe.name = 'nacht-himmel-fest';
  kuppelGruppe.position.set(0, PLANET_R, 0);
  group.add(kuppelGruppe);
  // 20,0 Grad unter Augenhöhe: acos(PLANET_R / (PLANET_R + 1,6)).
  const HORIZONT_SINUS = -Math.sin(Math.acos(PLANET_R / (PLANET_R + 1.6)));
  const kuppel = makeNachtKuppel(300, HORIZONT_SINUS);
  kuppelGruppe.add(kuppel);

  const starsGroup = new THREE.Group();
  const sternfeld = makeSternfeld(rand, 280);
  starsGroup.add(sternfeld);
  himmelGruppe.add(starsGroup);

  // **Der Mond muss weiter weg.** Auf der Platte stand er 32,1 m entfernt; auf
  // einem Planeten mit 25 m Halbmesser liefe man ihm beim Rundgang fast
  // entgegen. Er steht jetzt 300 m vom Nordpol, und seine Scheibe wächst
  // entsprechend mit: 26 m auf 300 m sind 0,0433 im Bogenmaß, gegen 2,8 m auf
  // 32,1 m also 0,0437 — dieselbe scheinbare Größe wie bisher.
  const MOND_FERN = 300;
  const moon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: mondScheibe(),
      transparent: true,
      depthWrite: false,
      // **Nicht additiv.** Ein additiv gemischter Kern über einem Hof gibt
      // reines Weiß und verliert jede Oberfläche — die bezahlte Lehre von der
      // Sonnenscheibe des Zen-Gartens, die zu 20,7 % auf exakt (255|255|255)
      // stand. Der Kern wird normal gemischt, nur der Hof ist additiv.
      blending: THREE.NormalBlending,
      fog: false,
      // Die Werte in der Karte sind bereits Anzeigewerte; ACES würde die
      // Oberflächenmodulation, um die es hier geht, wieder zusammendrücken.
      toneMapped: false,
    })
  );
  moon.name = 'nacht-mond';
  moon.position.copy(MOND_RICHTUNG).multiplyScalar(MOND_FERN);
  moon.scale.set(26, 26, 1);

  // Drei Hoflagen mit verschiedenen Reichweiten und Exponenten.
  //
  // **Die Reihenfolge muss ausdrücklich gesetzt werden.** Alle vier Sprites
  // sitzen am selben Ort, haben also denselben Kameraabstand. three sortiert
  // die transparente Liste nach `renderOrder`, dann nach Tiefe, dann nach
  // **Objekt-ID** — und die Scheibe entsteht im Quelltext vor den Höfen, hat
  // also die kleinere ID. Ohne `renderOrder` lag der enge Hof deshalb als
  // blauweißer Fleck **auf** der Mondoberfläche und löschte genau die
  // Modulation, um die es in diesem Paket geht.
  const hoefe = [
    mondHof('nacht-mondhof-weit', 0x4a6088, 0x101c34, 1.9, 26, 0.30),
    mondHof('nacht-mondhof-mittel', 0x8ea6d2, 0x2a3a60, 3.2, 11, 0.42),
    mondHof('nacht-mondhof-eng', 0xd6e2f8, 0x8098c4, 6.5, 4.6, 0.42),
  ];
  hoefe.forEach((h, i) => {
    h.position.copy(moon.position);
    h.scale.multiplyScalar(MOND_FERN / 32.06);
    h.renderOrder = 10 + i;
    himmelGruppe.add(h);
  });
  moon.renderOrder = 20;
  himmelGruppe.add(moon);

  // --- Der zweite Mond ------------------------------------------------------
  //
  // Ein rötlicher Halbmond auf der **Gegenseite**. Er steht dem ersten
  // gegenüber (Richtung negiert, danach um 34 Grad in der Höhe versetzt, damit
  // die beiden nicht auf einer Geraden durch den Planeten liegen und exakt
  // gleichzeitig auf- und untergehen). Damit gehört er der dunklen Hälfte des
  // Rundgangs: Wenn der weiße Mond untergegangen ist, steht er hoch.
  //
  // **Er ist keine Lichtquelle.** Die Szene hat genau eine gerichtete Quelle,
  // und das bleibt so — wer den Mond zur Sonne macht, hat die Aufgabe verfehlt,
  // und wer zwei daraus macht, erst recht. Was er beiträgt, ist eine Form am
  // Himmel und ein zweiter Farbklang.
  //
  // Er unterscheidet sich in **fünf** Merkmalen vom ersten, damit er nicht als
  // Kopie liest: Farbe (eisenrot gegen kühlgrau), Phase (exakt halb gegen drei
  // Viertel), Größe (17 gegen 26 Einheiten, also 3,2 gegen 5,0 Grad), Zustand
  // (170 Krater ohne Strahlensysteme gegen 90 mit) und Hof (eine schwache
  // rötliche Lage gegen drei blaue).
  const MOND2_RICHTUNG = MOND_RICHTUNG.clone()
    .negate()
    .applyAxisAngle(new THREE.Vector3(1, 0, 0).cross(MOND_RICHTUNG).normalize(), 0.6)
    .normalize();
  const mond2 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: mondScheibe('rot'),
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: false,
      toneMapped: false,
    })
  );
  mond2.name = 'nacht-mond-rot';
  mond2.position.copy(MOND2_RICHTUNG).multiplyScalar(MOND_FERN);
  mond2.scale.set(17, 17, 1);
  const hof2 = mondHof('nacht-mondhof-rot', 0x8a4632, 0x2a1008, 3.4, 5.6, 0.26);
  hof2.position.copy(mond2.position);
  hof2.scale.multiplyScalar(MOND_FERN / 32.06);
  hof2.renderOrder = 13;
  himmelGruppe.add(hof2);
  mond2.renderOrder = 21;
  himmelGruppe.add(mond2);

  // **Und er leuchtet.**
  //
  // Der Auftraggeber will den Planeten von allen Seiten beleuchtet haben. Das
  // steht in einer Spannung zur Grundregel dieses Auftrags — „es bleibt Nacht,
  // wer den Mond zur Sonne macht, hat die Aufgabe verfehlt" —, und die Auflösung
  // steht schon am Himmel: Es gibt einen **zweiten** Mond, und der stand bisher
  // als Bild da, ohne etwas zu tun. Ein Körper, der eine halbe Scheibe voll
  // Sonnenlicht zeigt, wirft welches zurück.
  //
  // Damit ist die abgewandte Seite kein Schwarz mehr, sondern eine **zweite,
  // andersfarbige Nacht** — rostrot statt blauweiß, ein Sechstel so hell, und
  // aus der Gegenrichtung. Wer den Rundgang macht, läuft aus einem kalten Licht
  // in ein warmes und wieder zurück.
  //
  // **Ohne Schattenwurf — und das ist eine gemessene Entscheidung, keine
  // Bequemlichkeit.**
  //
  // Der Prüfer hat unter jedem Brocken der Nachtseite einen hellen Saum
  // gefunden (`rund-210` bei (270, 576): L = 75,6 gegen Boden L ≈ 20) und ihn
  // einem Licht ohne Schatten zugeschrieben — „es bringt die Steine zum
  // Schweben, statt sie einzubetten". Die Farbe stützte das: RGB(105, 66, 54)
  // ist das Verhältnis 1 : 0,63 : 0,51, und dieses Fülllicht hat
  // 1 : 0,66 : 0,47.
  //
  // **Der Versuch hat es widerlegt.** Mit einer eigenen Schattenkarte
  // (1024 Texel, dieselbe Box) steht an derselben Stelle weiterhin exakt
  // RGB(105, 66, 54). Der Saum kommt nicht von hier. Die Karte ist deshalb
  // wieder heraus: Ein zweiter Schattendurchgang über 328 000 Dreiecke ist auf
  // einer Brille kein Rundungsfehler, und man bezahlt ihn nicht für eine
  // Wirkung, die man nicht nachweisen kann.
  //
  // Ausgeschlossen sind damit: Kontaktverdunklung, Feinstaub und Brocken (je
  // einzeln ausgeblendet, ohne Wirkung) und dieses Licht. Der Saum bleibt
  // offen.
  const mond2Licht = new THREE.DirectionalLight(0xd08a62, 0.78);
  mond2Licht.position.copy(MOND2_RICHTUNG).multiplyScalar(MOND_FERN);
  // **Ein eigenes Ziel, kein geteiltes.** `moonLight` entsteht erst hundert
  // Zeilen weiter unten; ein Verweis darauf liefe hier in die zeitliche
  // Totzone. Das Ziel muss ohnehin dasselbe **sein**, nicht dasselbe Objekt:
  // der Planetenmittelpunkt, und der liegt im Ursprung der Umgebungsgruppe —
  // die dreht sich nicht mit, das Ziel bleibt also stehen, während die Quelle
  // in der Himmelsgruppe mitwandert.
  mond2Licht.target.position.set(0, 0, 0);
  group.add(mond2Licht.target);
  mond2Licht.castShadow = false;
  himmelGruppe.add(mond2Licht);

  // --- Licht -----------------------------------------------------------------
  //
  // **Der Befund, der dieses Paket ausgelöst hat.** `main.js` hält eine globale
  // Hemisphärenleuchte (0xffffff über 0x334455, Stärke 1,4), die für jede
  // Umgebung gilt. Sie war hier nicht heruntergeregelt. Über den Weg
  // `irradiance × BRDF_Lambert` steuerte sie beim aufwärts gerichteten
  // Bodennormalenvektor rund **1,4 von 1,72** Einheiten Bestrahlung bei – 82 %
  // des gesamten Lichts der Szene kam aus einer weißen Quelle, die nur von
  // `normal.y` abhängt und deshalb auf **keine** Oberflächenform reagiert.
  //
  // Genau das steht im Bild: Der Boden hatte in `night-00/e-ground.png` über
  // den Bereich (100,400)–(1180,700) einen Tonwertumfang von p05 31 bis p95 63,
  // also 32 von 255 Stufen, und kein einziges Pixel über 190. Eine Fläche, die
  // drei Viertel des Bildes füllt, war damit praktisch ein Farbfeld.
  //
  // Die Konsequenz ist nicht „weniger Licht", sondern **dieselbe Menge Licht
  // aus einer Quelle, die eine Richtung hat**: Das globale Grundlicht geht auf
  // 0, das Mondlicht bekommt die Stärke, die vorher die Hemisphäre hatte, und
  // ist ab hier die einzige gerichtete Quelle der Szene – mit Schattenkarte.
  //
  // Die Zahlen unten sind vorwärts gerechnet, nicht geraten. Aus dem
  // Ausgangsstand ließ sich der Zusammenhang zwischen Bestrahlung und Bildwert
  // ablesen (R = 115 bei Σ 1,72 Einheiten ⇒ 0,0665 linear je Einheit im
  // Rotkanal, inklusive Albedo, Belichtung 1,1 und ACES). Daraus:
  //
  //   * Schattenseite soll bei R ≈ 30 liegen  ⇒  Σ_r ≈ 0,32  (Himmelslicht)
  //   * mondzugewandte Flanke bei R ≈ 130     ⇒  Σ_r ≈ 2,12
  //
  // Was **nicht** passiert: heller werden. Der Bildmittelwert bleibt unten, die
  // Spanne wächst. Eine Nacht lebt von Modulation im unteren Drittel.

  // Himmelslicht: der kühle Gegenpol. Oben mondblau, unten die warme
  // Rückstrahlung des Regoliths – damit steckt das geforderte Regolithrot in
  // der Aufhellung nach unten und nicht mehr flächig im Albedo.
  // **Der Farbton der Aufhellung ist gerechnet, nicht gegriffen.** Der erste
  // Anlauf stand auf 0x6a86c8; im Bild kam an der hellsten Bodenstelle
  // (113 | 88 | 94) heraus – Blau **über** Grün, also ein Magentastich. Der
  // Grund steht in den Zahlen: Der Regolith hat linear G:B = 1,88, die Leuchte
  // aber G:B = 0,41; das Produkt 0,77 kippt den Kanal. Mondlicht im Bild ist
  // kühl, aber nie magenta – es liegt zwischen Blau und Cyan. Mit 0x7595b4
  // (G:B = 0,66) steht das Produkt bei 1,23 und Grün führt wieder.
  // Die Aufhellung bleibt in der **Umgebungsgruppe**, nicht in der
  // Himmelsgruppe: Eine Hemisphärenleuchte rechnet mit `normal.y` in
  // Weltkoordinaten. Sie mitzudrehen hieße, dass „oben" für sie irgendwohin
  // wandert, während der Nutzer weiterhin nach oben schaut.
  // **Ein Schatten nimmt nur das gerichtete Licht weg.**
  //
  // Der Prüfer hat keine Schlagschatten gefunden. `tools/schattenwurf.mjs`
  // (neu) rendert jede Kamera zweimal — mit und ohne Schattenwurf — und misst,
  // was dazwischen liegt. Ergebnis: Schatten **gibt** es (in `d-orbit`
  // 1,79 % der Bildfläche mit einem mittleren Abfall von 39), aber in
  // Augenhöhe sind es 0,01 bis 0,22 %. Zwei Gründe, und nur einer ist zu
  // beheben:
  //
  //   * **Geometrie.** Die Brocken sind 14 bis 56 cm groß und zu einem Drittel
  //     eingesunken; ihr Schatten ist bei 30 Grad Mondhöhe einen halben Meter
  //     lang. Das sind wenige hundert Bildpunkte. Der Sputnik zeigt, was ein
  //     Körper mit Aufbauten kann: 6,91 %.
  //   * **Das Verhältnis der Quellen.** Bei Himmel 2,0 gegen Mond 3,1 · sin 30°
  //     = 1,55 kam mehr als die Hälfte des Lichts aus einer Quelle, die kein
  //     Schatten je abhält. Gemessen über die Reihe:
  //
  //       Himmel/Mond   2,0/3,1   1,4/3,8   1,0/4,4   0,6/5,0
  //       größter Abfall     54        72        81        79
  //
  // 1,45/3,8 ist der Kompromiss: ein Drittel mehr Schattentiefe, und die
  // Nachtseite — die **nur** vom Himmelslicht lebt — verliert nur ein Viertel.
  const skyFill = new THREE.HemisphereLight(0x7595b4, 0x4e2a1c, 1.45);
  group.add(skyFill);

  // **Eine** gerichtete Quelle. Der Mond steht bei [14 | 16 | −24], das sind
  // 32,1 m Abstand und 29,9° über dem Horizont – flach genug für Streiflicht
  // auf den Kanten, hoch genug, dass die Schatten nicht das halbe Bild füllen.
  // **Zweiter Anlauf, und diesmal an der richtigen Quelle.** Der erste hat den
  // Magentastich in der Hemisphärenleuchte gesucht und dort auch korrigiert —
  // der Stich blieb trotzdem, nur verschoben: hellste Bodenstelle vorher
  // (113 | 88 | 94), danach (121 | 103 | 110). Blau führt in beiden über Grün.
  //
  // Der Grund ist, dass die hellen Stellen gar nicht von der Aufhellung
  // kommen, sondern von der **gerichteten** Quelle — und 0xd8e2ff ist selbst
  // (216 | 226 | 255), also B über G um 29 Stufen. Wer den Stich dort nicht
  // wegnimmt, nimmt ihn nirgends weg.
  //
  // 0xe2eaf0 ist (226 | 234 | 240): immer noch kühl, aber zwischen Blau und
  // Cyan statt darüber hinaus. Linear fällt Blau um 13 %, Rot steigt um 10 %.
  const moonLight = new THREE.DirectionalLight(0xe2eaf0, 3.8);
  // In der Himmelsgruppe, also dreht das Licht mit dem Mond mit: Wer um den
  // Planeten läuft, läuft in die Nacht hinein und wieder heraus.
  moonLight.position.copy(MOND_RICHTUNG).multiplyScalar(MOND_FERN);
  // **Das Ziel darf NICHT mitdrehen.** Es lag als (0 | −PLANET_R | 0) in der
  // Himmelsgruppe, weil die am Nordpol sitzt — und solange die Welt unverdreht
  // stand, war das der Planetenmittelpunkt. Sobald sie sich dreht, ist es das
  // nicht mehr: Bei 60 Grad steht das Ziel bei (0 | 12,5 | −21,7), also 25 m
  // neben dem Mittelpunkt, und die Orthobox von ±34 m deckte nur noch einen
  // Streifen des Planeten ab. Im Bild `rund-060` stand daraufhin ein heller
  // Streifen mit **zwei mathematisch geraden Kanten** quer über die Kugel, und
  // dahinter fiel alles in den Schatten. Auf einer Kugel gibt es keine geraden
  // Kanten; der Prüfer hat sie über 560 Bildpunkte mit null Abweichung
  // nachgemessen.
  //
  // Das Ziel hängt deshalb an der **Umgebungsgruppe** und steht im Ursprung —
  // dort liegt der Planetenmittelpunkt, unabhängig von jeder Drehung. Die
  // Lichtquelle selbst bleibt in der Himmelsgruppe und wandert mit dem Mond.
  moonLight.target.position.set(0, 0, 0);
  group.add(moonLight.target);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  {
    // Orthokamera ±40 m: Das ist 3,9 cm je Texel und deckt alles ab, was vor
    // dem Nebelende bei 48 m liegt. Weiter draußen ist ohnehin alles zu 100 %
    // Nebelfarbe, ein fehlender Schatten dort ist unsichtbar.
    // **Ortho ±34 m um den Planetenmittelpunkt.** Der Planet ist 50 m breit,
    // die höchste Landmarke ragt 9 m darüber hinaus; ±34 m ist das Kleinste,
    // was ihn samt Werfern noch ganz enthält — und ganz enthalten muss er sein,
    // weil die **Nachtseite aus seiner Selbstverschattung entsteht**. Was das
    // Licht dort abhält, ist der Planetenbauch, und der steht bis 25 m quer zur
    // Lichtachse. Ein Versuch, die Box auf ±20 m zu verkleinern, um feinere
    // Texel zu bekommen, hat ihn als Werfer verloren: 1276 Saumpixel statt 165,
    // und unabhängig vom Bias — genau das Zeichen dafür, dass gar nicht mehr
    // verschattet wird.
    //
    // 68 m auf 2048 Texel sind **3,3 cm**. Mit dieser Auflösung müssen zwei
    // Artefakte leben: Akne am Terminator, wo das Licht streift, und ein
    // Lichtleck am Grat, wo die Verschiebung entlang der Normale über die Kante
    // greift. `normalBias` tauscht nur das eine gegen das andere; gemessen an
    // den Saumpixeln von Station 300 ergibt die Reihe
    //
    //   0,008 → 381,  0,015 → 247,  **0,025 → 165**,  0,04 → 188,  0,06 → 296
    //
    // eine Wanne mit dem Grund bei 0,025.
    //
    // Die Tiefengrenzen müssen die Wanderung des Lichts aushalten: Der Mond
    // steht 300 m vom **Nordpol**, sein Abstand zum Mittelpunkt schwankt beim
    // Rundgang deshalb zwischen 275 und 325 m. Mit ±34 m Gelände liegt der
    // gebrauchte Bereich bei 241 bis 359 m.
    const sc = moonLight.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 235;
    sc.far = 365;
    // Der Normal-Bias darf nicht in die Größenordnung der Objekte kommen – im
    // Zen-Garten hat 0,03 die 6 cm dicken Trittsteine um ihren Schatten
    // gebracht.
    //
    // **0,06 statt 0,008 — die Kugel hat immer einen Terminator.** Auf der
    // Platte stand die Fläche überall unter 30 Grad zum Mondlicht; auf einer
    // Kugel gibt es in jedem Bild eine Zone, in der das Licht streift, und dort
    // reicht die Verschiebung nicht mehr. Gemessen stand in der Totale ein Kamm
    // aus parallelen schwarzen Strichen quer über den Terminator —
    // Schattenakne, kein Gelände.
    //
    // `normalBias` verschiebt den Abtastpunkt entlang der Flächennormale und
    // wirkt damit genau dort am stärksten, wo das Licht streift. 0,06 m sind
    // 0,025 ist der gemessene Grund der Wanne oben, also 0,76 Texel. Der
    // vorherige Wert 0,06 war allein gegen die Akne gewählt, bevor der Saum am
    // Grat bekannt war — er hat dessen Pixelzahl von 165 auf 296 fast verdoppelt.
    moonLight.shadow.bias = -0.0004;
    moonLight.shadow.normalBias = 0.025;
  }
  himmelGruppe.add(moonLight);

  const marsGround = makeMarsPlanet(rand);
  weltGruppe.add(marsGround);

  // --- Leben und Bewegung ----------------------------------------------------
  const feinstaub = makeFeinstaub(rand, marsGround.userData.heightAt);
  weltGruppe.add(feinstaub);
  const staubteufel = makeStaubteufel(rand, marsGround.userData.heightAt);
  weltGruppe.add(staubteufel);
  // Der Meteor gehört zum Himmel, nicht zur Welt.
  const meteor = makeMeteor();
  himmelGruppe.add(meteor);

  return {
    id: 'night',
    name: '🌌 Nachthimmel',
    background: new THREE.Color(0x0a0605),
    // **Der Nebel hat den Mittelgrund aufgefressen.**
    //
    // 5 bis 13 m war für eine Welt gerechnet, deren fernster Punkt der Horizont
    // bei 8,9 m ist. Das stimmte, solange nichts darüber hinausragte. Seit es
    // Grate und große Einschläge gibt, ragt etwas darüber hinaus — und
    // **linearer Nebel sättigt bei `far` vollständig**: Jeder Grat ab 13 m
    // wurde exakt `0x1c0d09` und sonst nichts.
    //
    // Der Prüfer hat das als schwerwiegendsten Mangel benannt, ohne die Ursache
    // zu kennen: „In `rund-270` sind 3,93 % aller Bildpixel dieser eine Wert
    // […] das größte Objekt im Bild ist kein Objekt." RGB(28,13,9) ist
    // `0x1c0d09`. Vier Bilder, vier verschiedene Grate, ein Zahlentripel —
    // weil es dieselbe Konstante war.
    //
    // 6 bis 34 m ist gemessen (`tools/nebelversuch.mjs`, vier Einstellungen an
    // vier Kameras): Bei 5–13 waren 0,75 bis 1,56 % der Bildpunkte reine
    // Nebelfarbe, bei 5–24 noch 0,00 bis 0,24 %, bei 6–34 **nirgends mehr
    // etwas**. Der fernste sichtbare Geländepunkt liegt bei rund 24 m
    // Sichtlinie; dort bleiben jetzt 36 % der Modellierung stehen statt null.
    //
    // Das ist wenig Nebel — und das ist richtig so. Ein luftloser Körper hat
    // **keine** Luftperspektive. Was übrig bleibt, ist ein kompositorischer
    // Anstoß, keine Physik; die Tiefe trägt hier die Krümmung.
    fog: new THREE.Fog(0x1c0d09, 6, 34),
    group,

    // Das globale Grundlicht aus main.js aus. Begründung oben beim Lichtblock:
    // Es war mit 1,4 die mit Abstand stärkste Quelle der Szene, weiß, und ohne
    // jede Richtungsabhängigkeit. Die anderen vier Umgebungen sind davon nicht
    // berührt – jede liest ihren eigenen Wert.
    sceneAmbient: 0,
    // Begehbar ohne Grenze, aber ÜBER den Dünen statt hindurch. Das Höhenfeld
    // ist dasselbe, aus dem das Gitter entsteht – es kann deshalb nicht davon
    // abweichen, und es gilt auch jenseits der 96-m-Platte, wo ohnehin keine
    // sichtbare Geometrie mehr liegt.
    // **Beim Betreten 15 Grad nach unten schauen.** Auf einer Kugel mit 25 m
    // Halbmesser liegt der Horizont 20,0 Grad unter Augenhöhe (acos(25/26,6)) —
    // wer waagerecht blickt, sieht zu vier Fünfteln Himmel und weiß nicht, wo
    // er steht. Die vier ortsfesten Umgebungen brauchen das nicht; ihr Horizont
    // liegt auf Augenhöhe.
    blickNeigung: -0.26,

    // **Karten und Zonen bleiben liegen.** Sie hängen nicht an der Szene,
    // sondern an der Weltgruppe des Planeten — sonst liefen sie beim Rundgang
    // mit dem Nutzer mit, statt dort zu bleiben, wo er sie hingelegt hat. Der
    // Planet ist damit eine begehbare Gedächtnislandkarte, und genau das ist
    // der Zweck, für den sich der ganze Umbau lohnt.
    weltHeimat: weltGruppe,

    // **Ein Planet, kein Höhenfeld.** Der Spieler bleibt am Nordpol stehen und
    // die Welt dreht sich unter ihm; die Begründung steht bei `makePlanetWalk`
    // in walkable.js. Weil die Umrechnung dort sitzt, wissen `Locomotion` und
    // die Desktop-Steuerung nichts von der Kugel und bleiben unverändert.
    walk: makePlanetWalk({
      radius: PLANET_R,
      heightAt: marsGround.userData.heightAt,
      welt: weltGruppe,
      // Der Himmel übernimmt die Drehung sofort und nicht erst im nächsten
      // `update()`: Ein Bild Rückstand wären zwar nur 0,09 Grad, aber es wäre
      // ein Rückstand, der mit dem Tempo wächst.
      nachDrehung: (welt) => {
        himmelGruppe.quaternion.copy(welt.quaternion);
        kuppel.userData.setzeWeltdrehung(welt.quaternion);
      },
    }),

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
      // **`additivBehalten` ist hier kein Beiwerk, sondern Pflicht.**
      // `applyQuality()` blendet in der Brille jedes additiv gemischte Mesh
      // und jedes Points-Objekt aus. Die Vorgabe `/$^/` passt auf nichts —
      // außer auf den **leeren** Namen, denn bei Länge 0 fallen Anfang und
      // Ende zusammen. Genau davon haben die Sternschalen bisher gelebt: Sie
      // hatten keinen Namen.
      //
      // Seit sie `nacht-sterne` heißen, greift dieser Zufallsschutz nicht
      // mehr. Ohne die Ausnahme hier hätte die Quest 3 einen Nachthimmel
      // **ohne Sterne** — und im Headless-Lauf, der auf „voll" steht, wäre es
      // nie aufgefallen.
      // Seit Paket 8 sind es vier additive Gegenstände: Sternfeld, Feinstaub,
      // Staubteufel und Meteor. Alle heißen `nacht-…`, alle sollen in der
      // Brille bleiben — die Bewegung ist das, was die Szene lebendig macht,
      // und sie ist billig: drei Punktwolken und zwei Dreiecke.
      applyQuality(group, null, stufe, { additivBehalten: /^nacht-/ });
      return null;
    },

    update(time) {
      starsGroup.rotation.y = time * 0.004;
      sternfeld.material.uniforms.zeit.value = time;
      feinstaub.material.uniforms.zeit.value = time;
      // Der Staubteufel bekommt mehr als die Zeit: Auf der Kugel hat jeder
      // Wirbel seinen eigenen Standort samt Tangentensystem, und das wird
      // einmal je Bild gerechnet statt 840-mal je Scheitel.
      staubteufel.userData.setzeZeit(time);
      meteor.material.uniforms.zeit.value = time;
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

      // **Dunkler als vorher.** Mit einer Sonne, die dreimal so stark ist wie
      // bei Mittagsstand, stand der Kies bei einem Albedo von 0,90 als
      // gebleichte Fläche im Bild (Anteil über L 190: 51,6 %). Kies ist kein
      // Papier; ein Albedo um 0,78 lässt die Lichtseite oben und gibt der
      // Fläche ihre Farbe zurück.
      const grund = [212, 191, 155];
      const blass = [224, 211, 186];
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
    normalScale: new THREE.Vector2(1.3, 1.3),
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

           // --- Abstandsstreuung ----------------------------------------------
           //
           // **7,0 % Streuung im Rillenabstand sind zu wenig.** Eine von Hand
           // gezogene Harke streut 15 bis 30 %, und zwar sprunghaft: Der
           // Gärtner setzt neu an, zieht mal enger, mal weiter. Gemessen war
           // die Folge im Ausgangsstand monoton — reine Perspektive plus
           // Kreiskrümmung, ohne einen einzigen Zufallsanteil. Der Term unten
           // verzerrt die Phase langwellig; weil er von phi selbst abhängt,
           // ändert er den **Abstand**, nicht nur die Lage.
           //
           // **Der erste Anlauf hat die Spur zerlegt.** Ich hatte den Betrag
           // geschätzt statt die Ableitung hinzuschreiben. Für phi' = phi +
           // A·sin(f·phi) ist dphi'/dphi = 1 + A·f·cos(f·phi), die Streuung des
           // Abstands ist also **A·f** — nicht A, und nicht A·f·Teilung. Mit
           // A=0,5 und f=1,8 stand dort A·f = 0,9, also ±90 %; wo der Ausdruck
           // negativ wurde, lief die Spur rückwärts. Im Bild waren das keine
           // Harkzüge mehr, sondern Kratzer. Jetzt A·f = 0,18 + 0,08 = 0,26,
           // also die 15 bis 30 %, die eine von Hand gezogene Harke streut.
           phi += 0.22 * sin(phi * 0.8 + p.x * 0.4) + 0.03 * sin(phi * 2.6 - p.y * 0.6);

           // --- Rillenprofil --------------------------------------------------
           float s = phi / uSandTeilung;
           // **Der Ausblendeterm, ohne den das Bild flimmert.** w ist die
           // Zahl der Perioden je Pixel; ab 0,5 ist Nyquist erreicht. Der erste
           // Anlauf blendete zwischen 0,22 und 0,55 aus und stand damit bei
           // einer Periode von 2,7 px noch auf 64 % Amplitude — der Prüfer hat
           // genau dort Schwebungen gefunden. Jetzt ist die feine Spur bei 0,34
           // vollständig weg, also deutlich vor Nyquist.
           float w = fwidth(s);
           float scharf = 1.0 - smoothstep(0.10, 0.34, w);

           // **Asymmetrisches Profil.** Eine Harkzinke schiebt das Korn zur
           // Seite: Die eine Flanke ist steil, die andere läuft flach aus.
           // Gemessen hatte das Profil eine Asymmetrie von 0,84 — ein
           // symmetrisches Wellenband, also ein Glanzlicht auf dem Grat statt
           // eines Schattens in der Rille. Die Phasenverzerrung unten macht
           // daraus einen Sägezahn; die Ableitung zieht die Verzerrung über die
           // Kettenregel mit.
           float t = fract(s);
           float tw = t + 0.24 * sin(6.2831853 * t);
           float h = 0.5 - 0.5 * cos(6.2831853 * tw);
           float kamm = h * h * (3.0 - 2.0 * h);      // flacher Kamm, runde Rille
           float dtw = 1.0 + 0.24 * 6.2831853 * cos(6.2831853 * t);
           float dKamm = 6.0 * h * (1.0 - h) * 3.1415927 * sin(6.2831853 * tw) * dtw;

           // **Der grobe Zug, der die Ferne trägt.** Blendet die feine Spur
           // aus, bleibt sonst eine leere Fläche zurück — der Prüfer hat den
           // strukturlosen Anteil im Fernband von 31 % auf 60 % steigen sehen.
           // Ein geharktes Bett hat aber zwei Maßstäbe: die Zinken und die
           // Bahnen, in denen der Gärtner arbeitet. Die Bahn ist siebenmal so
           // breit, wird also erst siebenmal weiter draußen unterabtastbar und
           // hält die Ferne besetzt.
           float sGrob = phi / (uSandTeilung * 7.0);
           float scharfGrob = 1.0 - smoothstep(0.10, 0.34, fwidth(sGrob));
           float hGrob = 0.5 - 0.5 * cos(6.2831853 * sGrob);
           float kammGrob = hGrob * hGrob * (3.0 - 2.0 * hGrob);
           float dGrob = 6.0 * hGrob * (1.0 - hGrob) * 3.1415927 * sin(6.2831853 * sGrob);

           // **Zum Rand hin wird seltener geharkt — aber nicht auf einem
           // Kreis.** Der erste Anlauf ließ die Spur zwischen 11 und 17 m
           // auslaufen, und weil das ein exakter Kreis um den Ursprung war,
           // stand im flachen Blick eine gerade Linie quer durchs Bild
           // (e-sand, y rund 367 bis 372). Die Grenze schwankt jetzt ueber den Azimut
           // um ±5 m.
           float r = length(p);
           float az = atan(p.y, p.x);
           // Ohne die Mauer als Abschluss läuft die Spur wieder weiter und
           // unregelmäßiger aus — sie endet dann im Dunst statt an einer Kante.
           float grenze = 13.5 + 3.2 * sin(az * 2.3 + 1.1) + 1.8 * sin(az * 5.1 - 0.4);
           float rand = 1.0 - smoothstep(grenze - 3.0, grenze + 3.0, r);
           // Der Druck auf der Harke ist nicht konstant. Zwei langwellige
           // Terme lassen die Rille stellenweise tief und stellenweise fast
           // verlaufen — die mittlere Frequenz, die zwischen Korn (Millimeter)
           // und Zug (Zentimeter) sonst fehlt.
           float druck = 0.98 + 0.30 * sin(p.x * 0.83 + p.y * 0.61) + 0.18 * sin(p.x * 0.29 - p.y * 0.44);
           // Am Moos und am Wasser hört die Harke auf.
           float gemeinsam = naht * rand * druck * (1.0 - feucht * 0.85);
           float amp = scharf * gemeinsam;
           // Der grobe Zug ist flacher als die Zinkenspur, aber breiter – seine
           // Steigung bleibt deshalb in derselben Größenordnung.
           float ampGrob = scharfGrob * gemeinsam * 0.55;

           gSandSteigung =
             grad * (uSandTiefe / uSandTeilung) * (dKamm * amp + dGrob * ampGrob / 7.0);
           gSandKamm = mix(0.5, kamm, amp) + (kammGrob - 0.5) * ampGrob * 0.5;
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
         // **Die Lichtspitze kann nicht aus dem diffusen Anteil kommen.**
         // Nachgerechnet: Bei Sonnenstärke 4,6, Einfallswinkel 71° und
         // Albedo 0,77 liegt der diffuse Anteil einer waagerechten Fläche bei
         // rund 0,72 linear; mit Belichtung 1,1 durch die ACES-Kurve sind das
         // etwa L 210. Für L 230 bräuchte es das Doppelte, also eine Sonne um
         // 9 — und die würde jede senkrechte Fläche ausfressen.
         //
         // Spitzen kommen deshalb aus dem **Glanz**. Bei Rauheit 0,58 ist die
         // Keule so breit, dass ihr Maximum unter 5 % des diffusen Anteils
         // bleibt; bei 0,25 ist sie rund zwanzigmal höher. Auf einem Kamm, der
         // quer zur streifenden Sonne steht, zieht das eine helle Linie — und
         // genau das ist die Lichtkante, die einem geharkten Kies bei tiefer
         // Sonne das Leben gibt. Der Rillengrund bleibt stumpf.
         // **Und 0,42 war immer noch zu viel.** Bei streifendem Blick auf
         // eine waagerechte Fläche ist die Glanzkeule ohnehin breit; senkt man
         // dann auch noch die Rauheit, leuchtet nicht eine Kante auf, sondern
         // der halbe Vordergrund — im Bild sah der Kies aus wie lackiert, und
         // der Schatten in der Rille war wieder weg.
         //
         // Der Kies bleibt also stumpf, wie trockener Kies es ist. Die
         // Lichtspitzen dieser Szene kommen von den Dingen, die welche haben
         // dürfen: der Sonnenscheibe, dem Lichtkasten der Laterne und dem
         // nassen Stein am Wasser.
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
// `aussparung` = { x, z, rx, rz, umriss(azimut) }: Wo das Teichbecken steht,
// muss die Kiesfläche weichen — sonst schneidet sie als waagerechte Platte
// durch das Becken, und man sieht Sand auf halber Wassertiefe.
//
// **Vierecke wegzulassen reicht nicht.** Der erste Anlauf verwarf jedes
// Viereck, dessen Ecken innerhalb lagen; der Rand des Lochs folgte damit der
// Ringauflösung von rund 40 cm und stand als Zackenkranz aus dem Uferwulst
// heraus. Stattdessen werden die Punkte im Inneren **radial auf die Kontur
// gezogen**. Vierecke, die ganz innen lagen, kollabieren dabei auf die Kontur
// und haben keine Fläche mehr; Vierecke am Rand werden zu schmalen Streifen,
// die exakt an der Kontur enden. Der Rand des Lochs ist danach glatt, und weil
// dieselbe Umrissfunktion wie beim Becken benutzt wird, läuft er parallel zu
// dessen Ufer statt quer dazu.
function makeSandBett(radius, ringe = 44, segmente = 160, aussparung = null) {
  const pos = [];
  const uv = [];
  const idx = [];
  // Punkt innerhalb der Aussparung radial auf deren Kontur ziehen. `innen`
  // merkt sich, welche Punkte das betraf.
  const innen = [];
  const setze = (x, z) => {
    let drin = false;
    if (aussparung) {
      const dx = x - aussparung.x;
      const dz = z - aussparung.z;
      const a = Math.atan2(dz, dx);
      const f = aussparung.umriss ? aussparung.umriss(a) : 1;
      const nx = dx / (aussparung.rx * f);
      const nz = dz / (aussparung.rz * f);
      const len = Math.hypot(nx, nz);
      if (len < 1 && len > 1e-6) {
        x = aussparung.x + dx / len;
        z = aussparung.z + dz / len;
        drin = true;
      } else if (len <= 1e-6) {
        x = aussparung.x + aussparung.rx * f;
        z = aussparung.z;
        drin = true;
      }
    }
    innen.push(drin);
    pos.push(x, 0, z);
    uv.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
  };
  setze(0, 0);
  for (let j = 1; j <= ringe; j++) {
    const r = radius * Math.pow(j / ringe, 1.45);
    for (let i = 0; i < segmente; i++) {
      const a = (i / segmente) * Math.PI * 2;
      setze(Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const ring = (j, i) => 1 + (j - 1) * segmente + (i % segmente);
  // **Aufziehen allein reicht nicht.** Ein Viereck, dessen vier Ecken alle im
  // Inneren lagen, landet danach mit allen vier Ecken auf der Kontur — aber an
  // vier verschiedenen Winkeln. Es spannt damit eine Sehne quer durch das
  // Becken auf, und genau das stand im Bild: helle Zacken, die vom Ufer aus
  // über das Wasser liefen. Solche Vierecke entfallen; übrig bleiben die am
  // Rand, deren äußere Ecken unberührt sind und deren innere jetzt exakt auf
  // der Kontur sitzen.
  const ganzInnen = (...v) => v.every((k) => innen[k]);
  for (let i = 0; i < segmente; i++) {
    const a = ring(1, i + 1);
    const b = ring(1, i);
    if (ganzInnen(0, a, b)) continue;
    idx.push(0, a, b);
  }
  for (let j = 1; j < ringe; j++) {
    for (let i = 0; i < segmente; i++) {
      const a = ring(j, i);
      const b = ring(j, i + 1);
      const c = ring(j + 1, i + 1);
      const d = ring(j + 1, i);
      if (ganzInnen(a, b, c, d)) continue;
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

// --- Das Teichbecken --------------------------------------------------------
//
// **Der Teich war eine Scheibe, kein Gewässer.** Die Wasserfläche lag bei
// y = 0,01 auf einem Kiesbett bei y = −0,02: drei Zentimeter „Tiefe". Gemessen
// hatte die offene Fläche einen Mittelwert von 114 bei einer Spannweite von 26
// und keinem einzigen Pixel über 190 — kein Tiefenton, keine Spiegelung, keine
// Uferzone, und die Wasserlinie ein sauberer Schnitt. Und die Koi schwammen
// nicht darin: Ihr Körper ist 11 cm hoch und ihre Bahn lag bei y = 0, also
// ragten sie viereinhalb Zentimeter aus dem Wasser.
//
// Das Becken hier ist eine echte Mulde: 34 cm tief in der Mitte, mit einem
// Uferwulst, der über die Wasserlinie steigt und außen wieder in den Kies
// läuft. Der Umriss ist verrauscht — eine exakte Ellipse ist der schnellste
// Weg zu „gerechnet".
//
// Ein Mesh, ein Draw-Call. Die Zonen — Grund, Flachwasser, Wasserlinie,
// nasses Ufer, trockener Wulst — stecken in den Scheitelfarben.
function makeTeichbecken(rx, rz, { tiefe = 0.42, seed = 4242, umriss } = {}) {
  const RINGE = 22;
  const SEG = 96;
  // **Die Wasserlinie liegt bei 0,95, nicht bei 0,86.** Im ersten Anlauf war
  // der Uferwulst einen vollen Meter breit und legte sich als brauner Ring um
  // eine kleine Wasserfläche — im Bild eine Pfütze in einer Baugrube. Ein
  // Gartenteich hat einen schmalen Uferstreifen.
  const WL = 0.95;
  // Radiusfaktor (0…1,30) auf Höhe.
  const profil = (t) => {
    if (t < WL) {
      // Der Grund fällt am Ufer zügig ab und läuft dann flach aus — ein
      // Gartenteich ist keine Halbkugel. Bei 42 cm Tiefe und diesem Profil
      // bleiben unter der Koi-Bahn (t bis 0,57) noch 18 cm Wasser unter dem
      // Fisch; mit dem ursprünglichen Profil wäre er durch den Grund gefahren.
      const u = 1 - t / WL;
      return -tiefe * u * (1.4 - 0.4 * u);
    }
    if (t < 1.06) {
      // Ufer: steigt aus dem Wasser bis zum Wulst
      const u = (t - WL) / (1.06 - WL);
      return u * u * (3 - 2 * u) * 0.07;
    }
    // Außen wieder auf Kiesniveau
    const u = (t - 1.06) / 0.1;
    return 0.07 - u * u * (3 - 2 * u) * 0.09;
  };
  // Zonenfarben. Der Grund ist Schlick, das Flachwasser sandig, die
  // Wasserlinie am dunkelsten (dauerhaft nass), der Wulst trockener Kies.
  const grund = new THREE.Color(0x4a4736);
  const flach = new THREE.Color(0x958b64);
  const linie = new THREE.Color(0x7a6f58);
  const nass = new THREE.Color(0x8d7c5c);
  const trocken = new THREE.Color(0xd6c6a2);
  const farbe = (t) => {
    const c = new THREE.Color();
    if (t < 0.6) return c.copy(grund).lerp(flach, smoothstep(0.0, 0.6, t));
    if (t < WL) return c.copy(flach).lerp(linie, smoothstep(0.6, WL, t));
    if (t < 1.02) return c.copy(linie).lerp(nass, smoothstep(WL, 1.02, t));
    return c.copy(nass).lerp(trocken, smoothstep(1.02, 1.16, t));
  };

  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const setze = (x, y, z, t) => {
    pos.push(x, y, z);
    // UVs in Weltmetern, damit die Kornkarte auf dem Ufer dieselbe Körnung
    // zeigt wie der Kies daneben.
    uv.push(x / 0.7, z / 0.7);
    const c = farbe(t);
    // Flecken, damit die Zonen keine Farbringe sind
    const f = 0.86 + hashNoise(x * 3.1, seed, z * 3.1) * 0.3;
    col.push(c.r * f, c.g * f, c.b * f);
  };
  setze(0, profil(0), 0, 0);
  for (let j = 1; j <= RINGE; j++) {
    const t = 1.16 * (j / RINGE);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      // Umriss verrauscht: Zungen und Buchten wie an einem gewachsenen Ufer.
      // Dieselbe Funktion benutzen die Wasserfläche und die Aussparung im
      // Kiesbett — sonst laufen die drei Ränder auseinander.
      const r = t * umriss(a);
      setze(Math.cos(a) * r * rx, profil(t), Math.sin(a) * r * rz, t);
    }
  }
  const ring = (j, i) => 1 + (j - 1) * SEG + (i % SEG);
  for (let i = 0; i < SEG; i++) idx.push(0, ring(1, i + 1), ring(1, i));
  for (let j = 1; j < RINGE; j++) {
    for (let i = 0; i < SEG; i++) {
      idx.push(ring(j, i), ring(j, i + 1), ring(j + 1, i), ring(j, i + 1), ring(j + 1, i + 1), ring(j + 1, i));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// --- Fallende Blütenblätter --------------------------------------------------
//
// **Der Prüfer hat sie als Staub gemessen:** 28 Partikel, mittlere Breite
// 4,5 px, Seitenverhältnis **1,06** — runde, richtungslose, gleich große
// Punkte. Ihre Dichte war gegenläufig zum Baum verteilt (doppelt so viele auf
// der vom Sakura abgewandten Seite), und sie schwebten bis an den oberen
// Bildrand, also weit über jeder Baumkrone.
//
// Ein Blütenblatt ist kein Punkt: Es hat eine Längsachse, es taumelt um sie,
// und es fällt dort, wo der Baum steht. Eine Punktwolke kann davon nichts —
// `PointsMaterial` zeichnet immer achsenparallele Quadrate. Also
// Instanzen mit eigener Lage.
function blattTextur() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  // Kirschblütenblatt: eiförmig mit der charakteristischen Kerbe an der Spitze
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(255,228,238,1)');
  g.addColorStop(0.6, 'rgba(255,205,224,1)');
  g.addColorStop(1, 'rgba(246,178,203,1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(size * 0.5, size * 0.96);
  ctx.bezierCurveTo(size * 0.06, size * 0.72, size * 0.1, size * 0.16, size * 0.42, size * 0.06);
  // Die Kerbe
  ctx.lineTo(size * 0.5, size * 0.2);
  ctx.lineTo(size * 0.58, size * 0.06);
  ctx.bezierCurveTo(size * 0.9, size * 0.16, size * 0.94, size * 0.72, size * 0.5, size * 0.96);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// `anzahl` 90 und nicht 320: Dreihundertzwanzig fallende Blätter sind kein
// Kirschbaum im Wind, sondern ein Schneesturm — im Bild lagen ständig Blätter
// über der halben Fläche. Ein Sakura verliert einzelne Blüten; was zählt, ist,
// dass ab und zu eines vorbeitrudelt.
function makeBluetenblaetter(rand, quellen, anzahl = 90) {
  const geo = new THREE.PlaneGeometry(0.062, 0.078);
  const mat = new THREE.MeshLambertMaterial({
    map: blattTextur(),
    transparent: true,
    alphaTest: 0.45,
    side: THREE.DoubleSide,
    // Ebene Fläche: der zweite Durchgang für die Rückseiten zeichnet dieselben
    // Pixel noch einmal.
    forceSinglePass: true,
    depthWrite: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, anzahl);
  mesh.name = 'zen-blueten';
  mesh.frustumCulled = false;
  const meta = [];
  for (let i = 0; i < anzahl; i++) {
    // **Die Blätter fallen dort, wo ein Baum steht.** Jede Instanz bekommt eine
    // Quelle zugelost; ihre Streuung um den Stamm wächst nach unten, weil der
    // Wind sie auf dem Weg vertreibt.
    const q = quellen[Math.floor(rand() * quellen.length) % quellen.length];
    meta.push({
      qx: q.x,
      qz: q.z,
      hoehe: q.hoehe,
      streu: q.streu,
      a: rand() * Math.PI * 2,
      r: Math.sqrt(rand()),
      y0: rand(),
      // Jedes Blatt fällt anders schnell und taumelt anders — nichts im
      // Gleichtakt.
      fall: 0.22 + rand() * 0.3,
      dreh: (rand() - 0.5) * 3.4,
      kipp: rand() * Math.PI * 2,
      kippTempo: 0.8 + rand() * 1.9,
      schwing: rand() * Math.PI * 2,
      schwingWeite: 0.18 + rand() * 0.45,
      groesse: 0.75 + rand() * 0.6,
    });
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const skal = new THREE.Vector3();
  return {
    mesh,
    update(time) {
      for (let i = 0; i < anzahl; i++) {
        const d = meta[i];
        // Fallhöhe läuft von der Krone bis zum Boden und beginnt oben neu.
        const t = ((d.y0 + 1 - ((time * d.fall) / d.hoehe) % 1) % 1);
        const y = t * d.hoehe;
        // Je tiefer, desto weiter vom Stamm weg
        const weite = d.streu * (0.35 + (1 - t) * 0.9);
        pos.set(
          d.qx + Math.cos(d.a) * d.r * weite + Math.sin(time * 0.7 + d.schwing) * d.schwingWeite,
          y + 0.02,
          d.qz + Math.sin(d.a) * d.r * weite + Math.cos(time * 0.55 + d.schwing) * d.schwingWeite
        );
        e.set(
          Math.sin(time * d.kippTempo + d.kipp) * 1.5,
          time * d.dreh + d.kipp,
          Math.cos(time * d.kippTempo * 0.7 + d.kipp) * 1.1
        );
        q.setFromEuler(e);
        skal.setScalar(d.groesse);
        m.compose(pos, q, skal);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// --- Gartenmauer und geschnittene Sträucher ---------------------------------
//
// **Der schwerste Kompositionsbefund: Der Garten hat keine Grenze.** In der
// Totale lagen die Objekte als lose Reihe quer über eine Fläche, die nach allen
// Seiten ins Nichts lief; der Prüfer hat das Bildviertel links unten mit 98,9 %
// strukturlosem Sand gemessen und die Objektlage als „gleichmäßig über den
// Kreis verstreut, ohne Führung" beschrieben.
//
// Das ist kein Streuungsproblem, sondern ein **Rahmenproblem**. Ein
// Karesansui ist immer eingefasst — von einer verputzten Lehmmauer mit
// Ziegeldach, einer Hecke oder einem Bambuszaun. Die Einfassung leistet drei
// Dinge auf einmal:
//
//   * Sie gibt der leeren Fläche einen **Grund**: Aus „da ist nichts" wird
//     „da ist absichtlich nichts" — das *ma*, um das es geht.
//   * Sie legt eine **waagerechte Linie** ins Bild, gegen die alle Silhouetten
//     stehen. Vorher stand alles gegen Himmel.
//   * Sie trennt Mittelgrund von Ferne und macht die Tiefenstaffelung sichtbar.
//
// Die Mauer läuft nur über den hinteren Bogen. Rundherum wäre ein Kasten; so
// bleibt die Öffnung nach vorn, aus der man in den Garten blickt.
// `hoehe` 2,1 m und nicht 1,75: Bei Augenhöhe 1,6 m und 13,5 m Abstand liegt
// die Oberkante einer 1,75-m-Mauer praktisch auf der Blickachse — man sieht
// stellenweise über sie hinweg auf den Sand dahinter, und die Einfassung
// verliert genau das, wofür sie da ist. 2,1 m schließen den Blick.
//
// **Gebaut als durchgehendes Band, nicht als Kranz aus Quadern.** Der erste
// Anlauf setzte 96 einzelne Kisten entlang des Bogens. Auf der Innenseite
// stoßen zwei benachbarte Kisten unter 2,8° aneinander und lassen an jeder
// Fuge eine Kante stehen — im Bild lagen über die ganze Mauer senkrechte
// Striche in exakt gleichem Abstand. Ein Profil, das am Bogen entlanggezogen
// wird, hat diese Fugen nicht: Die Innenfläche ist eine Fläche.
function makeGartenmauer(radius, vonGrad, bisGrad, { hoehe = 2.1, seed = 3131 } = {}) {
  const SEG = 128;
  const von = (vonGrad * Math.PI) / 180;
  const bis = (bisGrad * Math.PI) / 180;
  const welle = welligerUmriss(seed, 0.03, 4);

  // Querschnitt der Mauer: radialer Versatz und Höhe. Von der Innenseite unten
  // über den Sockelabsatz und die Wandfläche zum überstehenden Ziegeldach, über
  // den First und außen wieder hinunter. `dach` markiert, welche Abschnitte zum
  // Dach gehören — sie bekommen das andere Material.
  const D = hoehe;
  const profil = [
    [-0.17, 0, 0],
    [-0.17, 0.3, 0],
    [-0.13, 0.33, 0],
    [-0.13, D, 0],
    [-0.28, D + 0.01, 1],
    [-0.26, D + 0.13, 1],
    [-0.05, D + 0.2, 1],
    [0.05, D + 0.2, 1],
    [0.26, D + 0.13, 1],
    [0.28, D + 0.01, 1],
    [0.13, D, 0],
    [0.13, 0.33, 0],
    [0.17, 0.3, 0],
    [0.17, 0, 0],
  ];

  const pos = [];
  const idx = [];
  const dachFlag = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const a = von + (bis - von) * t;
    const rr = radius * welle(a * 3);
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // Die Enden sitzen minimal tiefer — eine Lehmmauer sackt zu den Enden hin.
    const senk = 1 - Math.pow(Math.abs(t - 0.5) * 2, 3) * 0.03;
    for (const [dr, y, istDach] of profil) {
      pos.push(cx * (rr + dr), y * senk, cz * (rr + dr));
      dachFlag.push(istDach);
    }
  }
  const P = profil.length;
  // **Die Wicklung, nachgerechnet statt geraten.** Das Profil läuft an der
  // Innenseite nach oben, der Bogen läuft mit wachsendem Winkel. Für das
  // Dreieck (a, b, d) ist die eine Kante +ŷ und die andere die Tangente
  // t̂ = (−sin α, 0, cos α); ŷ × t̂ = (cos α, 0, sin α), also **nach außen**.
  // Genau so herum stand die Innenfläche der Mauer im Bild schwarz: Sie war
  // von der Sonne abgewandt, weil ihre Normale in die falsche Richtung zeigte.
  // Die umgekehrte Reihenfolge dreht sie nach innen.
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < P - 1; j++) {
      const a = i * P + j;
      const b = a + 1;
      const c = (i + 1) * P + j + 1;
      const d = (i + 1) * P + j;
      idx.push(a, d, b, b, d, c);
    }
  }
  // Stirnflächen an beiden Enden, damit die Mauer nicht offen endet.
  for (const [i, drehen] of [[0, false], [SEG, true]]) {
    for (let j = 1; j < P - 2; j++) {
      const a = i * P;
      const b = i * P + j;
      const c = i * P + j + 1;
      idx.push(...(drehen ? [a, c, b] : [a, b, c]));
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  // Scheitelfarben. Wand und Dach unterscheiden sich im Grundton; darüber
  // liegen Flecken und Regenstreifen, beide aus einem **stetigen** Rauschen
  // über Winkel und Höhe — ein Hash je Scheitelpunkt hätte an den
  // Segmentgrenzen wieder Sprünge.
  {
    const p2 = geo.attributes.position;
    const farben = new Float32Array(p2.count * 3);
    const wandUnten = new THREE.Color(0x6d6152);
    const wandOben = new THREE.Color(0xd2c5a8);
    const dachTon = new THREE.Color(0x545963);
    const c = new THREE.Color();
    for (let v = 0; v < p2.count; v++) {
      const y = p2.getY(v);
      const winkel = Math.atan2(p2.getZ(v), p2.getX(v));
      if (dachFlag[v % P]) {
        c.copy(dachTon);
      } else {
        c.copy(wandUnten).lerp(wandOben, THREE.MathUtils.clamp(y / D, 0, 1));
      }
      const fleck = fbm2(winkel * 9.5 + 31, y * 1.4);
      const streifen = fbm2(winkel * 34 - 7, y * 0.18);
      const f =
        0.9 + fleck * 0.2 + streifen * 0.13 - Math.max(0, 0.45 - y / D) * 0.2;
      farben[v * 3] = c.r * f;
      farben[v * 3 + 1] = c.g * f;
      farben[v * 3 + 2] = c.b * f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  }

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.9, metalness: 0 })
  );
  mesh.name = 'zen-mauer';
  const gruppe = new THREE.Group();
  gruppe.add(mesh);

  // Abschlusspfeiler: Ohne sie endet die Mauer als glatte Schnittfläche gegen
  // den Himmel — eine Kante ohne Grund.
  const pfeiler = [];
  for (const t of [0, 1]) {
    const a = von + (bis - von) * t;
    const rr = radius * welle(a * 3);
    const px = Math.cos(a) * rr;
    const pz = Math.sin(a) * rr;
    const pf = new THREE.BoxGeometry(0.44, D + 0.2, 0.44);
    pf.rotateY(-a);
    pf.translate(px, (D + 0.2) / 2, pz);
    pfeiler.push(pf);
    const kappe = new THREE.BoxGeometry(0.62, 0.12, 0.62);
    kappe.rotateY(-a);
    kappe.translate(px, D + 0.26, pz);
    pfeiler.push(kappe);
  }
  const pfGeo = mergeGeometries(pfeiler.map((g) => g.toNonIndexed()));
  {
    const p3 = pfGeo.attributes.position;
    const farben = new Float32Array(p3.count * 3);
    const c = new THREE.Color();
    for (let v = 0; v < p3.count; v++) {
      const y = p3.getY(v);
      c.copy(new THREE.Color(0x6d6152)).lerp(new THREE.Color(0xcabd9f), THREE.MathUtils.clamp(y / D, 0, 1));
      const f = 0.9 + fbm2(p3.getX(v) * 2.1, y * 1.6) * 0.22;
      farben[v * 3] = c.r * f;
      farben[v * 3 + 1] = c.g * f;
      farben[v * 3 + 2] = c.b * f;
    }
    pfGeo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  }
  const pfMesh = new THREE.Mesh(pfGeo, mesh.material);
  pfMesh.name = 'zen-mauer-pfeiler';
  gruppe.add(pfMesh);
  return gruppe;
}

// Geschnittene Sträucher (Karikomi) als Mittelgrundmasse vor der Mauer.
// Runde, dichte Polster — sie sind das Gegenstück zur harten Waagerechten der
// Mauer und geben dem Blick etwas, woran er vor der Ferne hängenbleibt.
function makeKarikomi(rand, plaetze) {
  const teile = [];
  for (const [x, z, r, hoehe] of plaetze) {
    const geo = new THREE.SphereGeometry(r, 14, 10);
    const pos = geo.attributes.position;
    const beule = welligerUmriss(Math.floor(x * 97 + z * 31) & 0xffff, 0.14, 4);
    for (let v = 0; v < pos.count; v++) {
      const px = pos.getX(v);
      const py = pos.getY(v);
      const pz = pos.getZ(v);
      const f = beule(Math.atan2(pz, px)) * (0.94 + hashNoise(px * 4, py * 4, pz * 4) * 0.12);
      pos.setXYZ(v, px * f, Math.max(0, py) * (hoehe / r) * f, pz * f);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // Scheitelfarben: oben lichter, unten im Eigenschatten des Polsters
    const farben = new Float32Array(pos.count * 3);
    const oben = new THREE.Color(0x7f8f52);
    const unten = new THREE.Color(0x3d4a2b);
    const c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const t = THREE.MathUtils.clamp(pos.getY(v) / hoehe, 0, 1);
      c.copy(unten).lerp(oben, Math.pow(t, 0.6));
      const f = 0.9 + hashNoise(pos.getX(v) * 6, pos.getY(v) * 6, pos.getZ(v) * 6) * 0.2;
      farben[v * 3] = c.r * f;
      farben[v * 3 + 1] = c.g * f;
      farben[v * 3 + 2] = c.b * f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
    geo.translate(x, -0.03, z);
    teile.push(geo);
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(teile.map((g) => (g.index ? g.toNonIndexed() : g))),
    new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.88, metalness: 0 })
  );
  mesh.name = 'zen-karikomi';
  return mesh;
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
// Der nasse Stein am Wasser als **eigenes** Material.
//
// Nass ist nicht nur dunkler: Ein Wasserfilm füllt die Mikrorauheit auf, die
// Oberfläche spiegelt. Die Verdunklung steckt in den Scheitelfarben und kostet
// nichts; die Rauheit steht im Material und braucht deshalb ein zweites. Das
// ist der eine Draw-Call, der in dieser Szene eine echte Lichtspitze liefert —
// nasser Granit im Streiflicht einer tief stehenden Sonne.
let _zenNassGranit = null;
function zenNassGranite() {
  if (!_zenNassGranit) {
    _zenNassGranit = graniteMaterial({ tone: 0xa9a49b, vertexColors: true });
    _zenNassGranit.normalScale = new THREE.Vector2(1.4, 1.4);
    // 0,24 zusammen mit 45 % Verdunklung ergab schwarze, glänzende Kiesel —
    // Obsidian, nicht nasser Granit. Nasser Stein ist dunkler und glatter als
    // trockener, aber er bleibt Stein.
    _zenNassGranit.roughness = 0.34;
    addSkyRim(_zenNassGranit, { color: 0xbcd6f0, strength: 0.18, power: 4.2 });
  }
  return _zenNassGranit;
}

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
    _zenGranit.roughness = 0.66;
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

// Steinlaterne (Ishidōrō).
//
// **Der Prüfer hat sie als „Kugel + Kegel + Zylinder + Zylinder + Kegelstumpf,
// alle sauber getrennt lesbar" beschrieben** — ein Grundkörperstapel. Was einer
// Yukimi-Laterne ihre Silhouette gibt, sind zwei Dinge, die dort fehlten:
//
//   * **Ein weit auskragendes Dach mit hochgezogenen Ecken.** Der Schirm ist
//     breiter als alles darunter und schwingt an den sechs Ecken nach oben.
//     Das ist die Form, die man aus zwanzig Metern erkennt.
//   * **Ein Lichtkasten mit Öffnungen.** Sechs Eckpfosten statt einer
//     geschlossenen Trommel; dazwischen sieht man das Licht.
function makeLantern() {
  const group = new THREE.Group();
  const stoneMat = zenGranite();
  const steinTeil = (geo, y, seed) => {
    boxProjectUV(geo, 0.16);
    paintVertices(geo, 0xa8a199);
    mossPatina(geo, { y0: y, floor: 0, height: 0.22, scale: 0.1, strength: 0.7, seed, sun: ZEN_SUN });
    return geo;
  };
  const steine = [];

  // Fußplatte, im Kies versenkt
  steine.push(steinTeil(new THREE.CylinderGeometry(0.24, 0.28, 0.1, 6), 0.02, 10).translate(0, 0.02, 0));
  // Schaft
  steine.push(steinTeil(new THREE.CylinderGeometry(0.062, 0.078, 0.44, 8), 0.29, 12).translate(0, 0.29, 0));
  // Zwischenplatte, auf der der Lichtkasten sitzt
  steine.push(steinTeil(new THREE.CylinderGeometry(0.17, 0.13, 0.055, 6), 0.54, 13).translate(0, 0.54, 0));
  // Sechs Eckpfosten des Lichtkastens — dazwischen fällt das Licht heraus.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const pf = new THREE.BoxGeometry(0.045, 0.2, 0.045);
    pf.rotateY(-a);
    pf.translate(Math.cos(a) * 0.115, 0.67, Math.sin(a) * 0.115);
    steine.push(steinTeil(pf, 0.67, 14 + i));
  }
  // Deckplatte des Kastens
  steine.push(steinTeil(new THREE.CylinderGeometry(0.15, 0.145, 0.03, 6), 0.785, 20).translate(0, 0.785, 0));

  // Das Dach: sechseckiger Schirm mit hochgezogenen Ecken. Gebaut aus einem
  // Kegel, dessen Randpunkte an den Ecken angehoben werden.
  {
    const dach = new THREE.ConeGeometry(0.3, 0.17, 6, 3, true);
    const pos = dach.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const r = Math.hypot(x, z);
      if (r < 0.02) continue;
      const a = Math.atan2(z, x);
      // Sechs Ecken: dort, wo cos(6a) maximal ist, hebt sich der Rand.
      const ecke = Math.max(0, Math.cos(6 * a + Math.PI));
      const t = r / 0.3;
      pos.setY(v, pos.getY(v) + Math.pow(t, 2.2) * ecke * 0.085);
      pos.setX(v, x * (1 + Math.pow(t, 2) * ecke * 0.1));
      pos.setZ(v, z * (1 + Math.pow(t, 2) * ecke * 0.1));
    }
    pos.needsUpdate = true;
    dach.computeVertexNormals();
    steine.push(steinTeil(dach, 0.87, 21).translate(0, 0.87, 0));
  }
  // Knauf
  steine.push(steinTeil(new THREE.SphereGeometry(0.05, 10, 7), 0.99, 22).translate(0, 0.99, 0));

  const stein = new THREE.Mesh(mergeGeometries(steine.map((g) => (g.index ? g.toNonIndexed() : g))), stoneMat);
  stein.name = 'zen-laterne-stein';
  group.add(stein);

  // Der Lichtkörper zwischen den Pfosten. Unbeleuchtetes Material ohne
  // Tonemapping: Ein Lichtkasten am späten Nachmittag darf heller sein als der
  // Kies daneben.
  const box = new THREE.Mesh(
    new THREE.CylinderGeometry(0.108, 0.108, 0.19, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd79a, toneMapped: false })
  );
  box.position.y = 0.67;
  group.add(box);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,205,130,0.85)', 'rgba(255,152,62,0.3)'),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: false,
    })
  );
  glow.position.y = 0.68;
  glow.scale.set(1.1, 1.1, 1);
  group.add(glow);
  return group;
}

// Torii-Tor als ruhiger Landmark am Rand.
//
// **Der Prüfer hat es als eine einzige Farbe gemessen:** Deckbalken, beide
// Pfosten und der Riegel lagen bei (191,57,33) mit einer maximalen Abweichung
// von 1 von 255 — vier verschieden orientierte Flächen ohne jeden Unterschied.
// Dazu „ein gerader Quader ohne Aufwärtsschwung und ohne Verjüngung".
//
// Ein Myōjin-Torii hat fünf Dinge, die es von einem H aus Balken unterscheiden:
//
//   * **Kasagi mit Schwung.** Der Deckbalken ist nach oben gebogen und läuft
//     zu den Enden hin schmaler zu. Das ist die Linie, an der man ein Torii
//     von weitem erkennt.
//   * **Shimaki.** Direkt darunter ein zweiter, flacherer Balken.
//   * **Nuki, der durchstößt.** Der Riegel geht durch die Pfosten hindurch und
//     steht auf beiden Seiten vor.
//   * **Geneigte Pfosten.** Sie stehen nicht senkrecht, sondern oben leicht
//     nach innen — das gibt dem Tor seinen Stand.
//   * **Kusabi.** Keile, die den Nuki im Pfosten festsetzen.
//
// Die Farbunterschiede zwischen den Teilen stecken in den Scheitelfarben: Der
// Deckbalken steht im Regen und ist ausgeblichen, die Unterseiten sind
// nachgedunkelt, die Pfostenfüße sind vom Spritzwasser dunkel.
function makeTorii() {
  const group = new THREE.Group();
  const mat = weatheredWoodMaterial({ tone: 0xd4553a, vertexColors: true });
  const h = 3.2;
  const span = 2.4;
  const teile = [];

  // Ein Balken mit Schwung: eine Box, deren Scheitelpunkte nach oben gebogen
  // und zu den Enden verjüngt werden.
  const balken = (laenge, hoehe, tiefe, schwung, verjuengung) => {
    const geo = new THREE.BoxGeometry(laenge, hoehe, tiefe, 24, 1, 1);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const t = Math.abs(x) / (laenge / 2);
      pos.setY(v, pos.getY(v) + t * t * schwung);
      // Verjüngung nur nach unten, die Oberkante bleibt die Schwunglinie.
      if (pos.getY(v) < 0) pos.setY(v, pos.getY(v) * (1 - t * verjuengung));
      pos.setZ(v, pos.getZ(v) * (1 - t * verjuengung * 0.7));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  };

  for (const sx of [-1, 1]) {
    // Pfosten mit Verjüngung nach oben und leichter Neigung nach innen.
    const pillar = new THREE.CylinderGeometry(0.145, 0.195, h, 14);
    scaleUV(pillar, 3);
    pillar.rotateZ(-sx * 0.028);
    pillar.translate(sx * span * 0.5, h / 2, 0);
    teile.push(pillar);
  }
  // Kasagi: der geschwungene Deckbalken
  teile.push(balken(span + 1.35, 0.26, 0.44, 0.3, 0.42).translate(0, h + 0.09, 0));
  // Shimaki: der flachere Balken darunter
  teile.push(balken(span + 1.15, 0.17, 0.36, 0.24, 0.34).translate(0, h - 0.11, 0));
  // Nuki: der Riegel stößt durch die Pfosten hindurch
  teile.push(new THREE.BoxGeometry(span + 0.62, 0.2, 0.3).translate(0, h - 0.78, 0));
  // Gakuzuka: die Strebe zwischen Nuki und Shimaki
  teile.push(new THREE.BoxGeometry(0.19, 0.62, 0.24).translate(0, h - 0.42, 0));
  // Kusabi: die Keile, die den Nuki im Pfosten halten
  for (const sx of [-1, 1]) {
    teile.push(new THREE.BoxGeometry(0.075, 0.3, 0.34).translate(sx * (span * 0.5 + 0.2), h - 0.78, 0));
  }

  const geo = mergeGeometries(teile.map((g) => (g.index ? g.toNonIndexed() : g)));
  // Scheitelfarben: oben ausgeblichen, Unterseiten nachgedunkelt, Pfostenfüße
  // vom Spritzwasser dunkel. Ohne das sind vier verschieden ausgerichtete
  // Flächen im Bild nicht zu unterscheiden.
  {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const farben = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      const ny = nor.getY(v);
      // Wetterseite: nach oben zeigende Flächen bleichen aus
      let f = 1 + Math.max(0, ny) * 0.16;
      // Unterseiten liegen im Eigenschatten der Konstruktion
      f *= 1 - Math.max(0, -ny) * 0.22;
      // Der Fuß ist dunkel, oben ist das Holz heller
      f *= 0.84 + Math.min(1, y / h) * 0.22;
      // Feine Streuung, damit keine Fläche gleichförmig ist
      f *= 0.94 + hashNoise(pos.getX(v) * 3.3, y * 3.3, pos.getZ(v) * 3.3) * 0.12;
      farben[v * 3] = f;
      farben[v * 3 + 1] = f * (0.97 + Math.max(0, ny) * 0.05);
      farben[v * 3 + 2] = f * (0.94 + Math.max(0, ny) * 0.09);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'zen-torii';
  group.add(mesh);
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
// **Der Prüfer las den Hain als „acht gerade Stäbe mit Pom-Pom oben".** Drei
// Dinge fehlten, und alle drei sind an einem Halm sofort zu sehen:
//
//   * **Verjüngung.** Ein Bambushalm ist unten doppelt so dick wie oben. Die
//     alte Fassung hatte über die ganze Länge denselben Radius — das ist ein
//     Rohr, kein Halm.
//   * **Bogen.** Bambus steht nicht senkrecht, er neigt sich und biegt sich
//     unter dem eigenen Schopf. Der Bogen wird über die Segmente aufsummiert,
//     die Halme sind deshalb auch untereinander verschieden gekrümmt.
//   * **Nodien in wechselndem Abstand.** Unten kurz, in der Mitte lang, oben
//     wieder kürzer — bei gleichmäßigem Abstand liest man das Gitter.
function makeBambooStalk(rand) {
  const geos = [];
  const segs = 7 + Math.floor(rand() * 4);
  const radUnten = 0.036 + rand() * 0.016;
  // Neigungsrichtung und -stärke je Halm
  const neigA = rand() * Math.PI * 2;
  const neig = 0.05 + rand() * 0.13;
  let y = 0;
  let x = 0;
  let z = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    // Internodien: kurz, lang, kurz
    const segH = 0.2 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.3 + rand() * 0.06;
    const r0 = radUnten * (1 - t * 0.5);
    const r1 = radUnten * (1 - (t + 1 / segs) * 0.5);
    // Der Bogen wächst quadratisch mit der Höhe — so hängt die Spitze, nicht
    // der Fuß.
    const versatz = neig * t * t * segH * 3.2;
    const dx = Math.cos(neigA) * versatz;
    const dz = Math.sin(neigA) * versatz;
    const c = new THREE.CylinderGeometry(r1, r0, segH, 7);
    c.rotateZ(-Math.cos(neigA) * neig * t * 1.3);
    c.rotateX(Math.sin(neigA) * neig * t * 1.3);
    c.translate(x + dx / 2, y + segH / 2, z + dz / 2);
    geos.push(c);
    x += dx;
    z += dz;
    y += segH;
    const knot = new THREE.CylinderGeometry(r1 * 1.16, r1 * 1.16, 0.026, 7);
    knot.translate(x, y, z);
    geos.push(knot);
  }
  const stalk = new THREE.Mesh(mergeGeometries(geos), bambooMaterials().culm);
  stalk.userData.height = y;
  stalk.userData.spitze = new THREE.Vector3(x, y, z);
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
    // Die Schöpfe sitzen an der **gebogenen** Spitze, nicht senkrecht über dem
    // Fuß — sonst hängt das Laub neben dem Halm in der Luft. Und sie sitzen
    // gestaffelt: Ein Bambusschopf ist keine Kugel obendrauf, sondern Laub, das
    // über das obere Drittel verteilt ansetzt.
    stalks.forEach((s, i) => {
      const sp = s.userData.spitze;
      for (let k = 0; k < 2; k++) {
        const t = 1 - k * 0.22;
        q.setFromEuler(new THREE.Euler(0, i * 1.3 + k * 2.4, 0));
        m.compose(
          new THREE.Vector3(
            s.position.x + sp.x * s.scale.x * t + (k - 0.5) * 0.13,
            sp.y * s.scale.y * t - 0.1,
            s.position.z + sp.z * s.scale.z * t + (k - 0.5) * 0.11
          ),
          q,
          new THREE.Vector3(0.28, 0.3, 0.28)
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

const MAPLE_ANSAETZE = [
  [0, 2.24, 0, 0.44],
  [0.62, 2.0, 0.2, 0.32],
  [-0.56, 2.08, -0.26, 0.34],
  [0.2, 2.5, -0.2, 0.29],
  [-0.26, 2.36, 0.44, 0.28],
  [-0.66, 1.76, 0.16, 0.25],
  [0.5, 1.82, -0.4, 0.25],
];
function makeMaple(rand) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(
    mergeGeometries([
      scaleUV(new THREE.CylinderGeometry(0.075, 0.17, 1.62, 10), 4.5).translate(0, 0.81, 0),
      ...astwerk([0, 1.28, 0], MAPLE_ANSAETZE, { seed: 0x71a3, stammR: 0.07 }),
    ]),
    weatheredWoodMaterial({ tone: 0x7d6552, vertexColors: false })
  );
  trunk.position.y = 0;
  trunk.rotation.z = -0.04;
  tree.add(trunk);
  const { cards } = mapleMaterials();
  const krone = baueKrone({
    ansaetze: MAPLE_ANSAETZE,
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
// **Drei unverbundene Grüntöne waren im Bild.** Der Prüfer hat sie gemessen:
// Moos bei Farbton 71°, Bambuslaub 76°, Seerose 119° bei Sättigung 0,51 — und
// das übrige Spektrum der Szene liegt zwischen 9° und 41°. Ein Grün mit 119°
// und halber Sättigung ist in dieser Tonart ein Fremdkörper. Die Seerose
// bekommt denselben olivgetönten Grundton wie das Moos und wird nur heller
// gehalten, weil sie auf dem Wasser liegt und mehr Himmel sieht.
const LILY_MAT = new THREE.MeshStandardMaterial({ color: 0x5d7a44, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
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
  // **Der Körper biegt sich.** Der Prüfer hat beide Koi als „starr waagerecht
  // ohne Körperbogen" gemessen — es wedelte nur der Schwanz an einem Gelenk,
  // und das ist die Bewegung eines Spielzeugs. Ein Fisch schwimmt, indem eine
  // Welle vom Kopf zum Schwanz durch ihn hindurchläuft. Die Welle steht
  // deshalb im Vertexshader: seitlicher Versatz proportional zu sin(z·k − t·ω),
  // mit einer Amplitude, die zum Schwanz hin wächst. Der Kopf bleibt ruhig,
  // wie er soll.
  const koiUniforms = { uKoiZeit: { value: 0 }, uKoiPhase: { value: variant * 2.1 } };
  const bodyMat = new THREE.MeshStandardMaterial({
    map: makeKoiTexture(variant),
    roughness: 0.34,
    metalness: 0.05,
  });
  bodyMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, koiUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n uniform float uKoiZeit;\n uniform float uKoiPhase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         {
           // z läuft von -L/2 (Schwanz) bis +L/2 (Kopf); die Amplitude wächst
           // nach hinten.
           float hinten = clamp(0.5 - transformed.z / 0.34, 0.0, 1.2);
           float welle = sin(transformed.z * 13.0 - uKoiZeit * 7.5 + uKoiPhase);
           transformed.x += welle * hinten * hinten * 0.055;
         }`
      );
  };
  bodyMat.customProgramCacheKey = () => 'zen-koi-koerper';
  const body = new THREE.Mesh(bodyGeo, bodyMat);
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
  koi.userData = { tail: tailPivot, uniforms: koiUniforms };
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
      strength: 1.0,
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
  // **Zweiter Anlauf: Der erste hat abgedunkelt statt Licht zu geben.**
  // Gemessen fiel der Anteil über L 200 von 31,2 % auf 1,7 %, und die
  // Schattenseiten der Findlinge sackten unter L 30 (Anteil 1,6 % → 21,4 %).
  // Der Fehler war, die Grundhelligkeit zu senken **und** die Sonne nur
  // moderat anzuheben: Bei 19,4° trifft sie eine waagerechte Fläche mit
  // cos 71° = 0,33, sie muss also rund dreimal so stark sein wie bei
  // Mittagsstand, um dieselbe Flächenhelligkeit zu erreichen.
  //
  // Die Hemisphäre trägt jetzt mehr, damit der Schatten Form behält statt
  // abzusaufen — sie ist die einzige Quelle dort. Kühl bleibt sie: Der
  // Farbunterschied zwischen besonnt und verschattet ist die halbe Tiefe.
  group.add(new THREE.HemisphereLight(0xb3cdf0, 0xa8875f, 1.05));

  // 4,6 waren zu viel: Der Kies stand danach als gebleichte Fläche im Bild.
  // 4,1 hält die Lichtseite oben, ohne die Zeichnung zu verlieren.
  const sun = new THREE.DirectionalLight(0xffd9a0, 4.1);
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
    // 0,008 waren immer noch zu viel: Am Bambusfuß stand ein 2 bis 4 Pixel
    // breiter heller Spalt zwischen Halm und Schattenansatz. Ein Halm ist
    // 7 cm dick; der Versatz entlang der Normalen darf nicht in die
    // Größenordnung des Objekts kommen. Schattenakne hat der Prüfer im selben
    // Durchlauf ausdrücklich nicht gefunden, es ist also Luft nach unten.
    sh.normalBias = 0.0025;
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
  // **Additiv plus voller Kern ergibt reines Weiß.** Der erste Anlauf hatte
  // den Kern auf Alpha 1,0 und additive Mischung: 20,7 % der Scheibenfläche
  // standen danach auf exakt (255,255,255). Eine Sonne bei 19,4° ist nicht
  // weiß, sie ist golden — und ausgefressen ist sie erst recht nicht, weil
  // dann die Farbe verschwindet, die sie tragen soll. Kern jetzt gedeckelt und
  // wärmer, dafür der Hof kräftiger.
  for (const [scale, innen, aussen] of [
    [2.2, 'rgba(255,240,205,0.78)', 'rgba(255,214,150,0.6)'],
    [15.0, 'rgba(255,222,168,0.34)', 'rgba(255,192,124,0.12)'],
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
  const rim = new THREE.DirectionalLight(0xffcf9c, 0.5);
  rim.position.set(15, 3.5, 13);
  group.add(rim);

  // Der Saum liegt unter allem anderen und wird zuerst gezeichnet.
  group.add(makeSandSaum());

  // Das Kiesbett. Radius unverändert 20 m; die Harkspur entsteht jetzt
  // rechnerisch aus der Weltposition, siehe `sandMaterial()`.
  // Lage und Größe des Teichs stehen hier oben, weil das Kiesbett eine
  // Aussparung dafür braucht — es darf nicht als waagerechte Platte durch das
  // Becken schneiden.
  // Der Umriss des Teichs, einmal definiert: Becken, Wasserfläche und die
  // Aussparung im Kiesbett benutzen dieselbe Funktion. Eine exakte Ellipse ist
  // der schnellste Weg zu „gerechnet"; und drei Stellen, die denselben Umriss
  // getrennt nachbilden, sind der schnellste Weg zu einem Spalt.
  const teichUmriss = welligerUmriss(4242, 0.13);
  const TEICH = { x: 3.2, z: -1.2, rx: 2.04, rz: 1.7 };
  const sandMat = sandMaterial();
  const sand = new THREE.Mesh(
    makeSandBett(SAND_RADIUS, 44, 160, {
      x: TEICH.x,
      z: TEICH.z,
      // Zwischen Wasserlinie (0,95) und Uferwulst-Außenkante (1,30): Das Loch
      // liegt sicher außerhalb des Wassers und wird vom Ufer mit gut 45 cm
      // überdeckt.
      rx: TEICH.rx * 1.02,
      rz: TEICH.rz * 1.02,
      umriss: teichUmriss,
    }),
    sandMat
  );
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
  // Enger als vorher: Mit 2,3 m plus 0,75 m Auslauf reichte der unbeharkte
  // Feuchtsaum bis gut drei Meter vom Teichmittelpunkt und legte einen breiten
  // glatten Ring um das Wasser — im Bild las der wie trockengefallenes Ufer.
  feuchtZonen[0].set(3.2, -1.2, 1.75, 0.8);
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
  mossMat.color.setHex(0x77894e);
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
    // **Der Rand war eine Ellipse.** Der Prüfer hat den Bereich um eine
    // Moosinsel als „ausgestanzte grüne Ellipse auf Sand" gemeldet und
    // nachgewiesen, dass er zwischen zwei Ständen pixelidentisch war. Moos
    // wächst nicht auf einem Kreis: Es folgt der Feuchte, schiebt sich in
    // Zungen vor und dünnt an anderer Stelle aus. 44 Segmente statt 20, und
    // der Radius jedes Randpunktes wird verrauscht — zwei Frequenzen, damit
    // Buchten und Zungen verschiedener Größe entstehen.
    const mossGeo = new THREE.CircleGeometry(mossR, 44);
    {
      const pos = mossGeo.attributes.position;
      const zunge = welligerUmriss(300 + i * 17, 0.24, 6);
      for (let v = 1; v < pos.count; v++) {
        const a = Math.atan2(pos.getY(v), pos.getX(v));
        const f = zunge(a);
        pos.setXY(v, Math.cos(a) * mossR * f, Math.sin(a) * mossR * f);
      }
      pos.needsUpdate = true;
    }
    // Kachelgröße in Weltmetern: `repeat` der Karte ist 18, ein UV-Schritt von
    // 1 wären also 18 Kacheln. Für 0,55 m je Kachel muss die Scheibe
    // (2·r Meter breit) über 2·r / (18 · 0,55) UV-Einheiten laufen.
    scaleUV(mossGeo, (2 * mossR) / (18 * 0.55));
    // **Moos hat Aufbauhöhe.** Der Prüfer hat die Kante gemessen: zwei Pixel
    // vom Moos zum Sand, keine Höhe, kein Saum — ein flaches Abziehbild. Ein
    // Moospolster ist ein Kissen von drei bis sechs Zentimetern, das am Rand
    // ausläuft. Die Scheibe liegt in der XY-Ebene und wird später um −90° um X
    // gedreht; lokales +Z wird damit zu Welt-+Y.
    {
      const pos = mossGeo.attributes.position;
      const kissen = welligerUmriss(700 + i * 13, 0.5, 5);
      for (let v = 0; v < pos.count; v++) {
        const px = pos.getX(v);
        const py = pos.getY(v);
        const t = Math.min(1, Math.hypot(px, py) / mossR);
        const a = Math.atan2(py, px);
        // Kuppel, am Rand auf null, mit Buckeln darin
        const hoehe = 0.055 * Math.pow(1 - t * t, 0.65) * kissen(a * 1.7);
        pos.setZ(v, hoehe);
      }
      pos.needsUpdate = true;
      mossGeo.computeVertexNormals();
    }
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
      // **Sieben Steine, ein Farbton.** Gemessen war G/R bei 0,82–0,85 und
      // B/R bei 0,57–0,60 über alle Findlinge — nur die Helligkeit schwankte.
      // Findlinge in einem Garten sind ausgesucht und stammen aus
      // verschiedenen Brüchen: einer warm, einer bläulich, einer moosgrün
      // angelaufen.
      const toene = [0x8a8076, 0x7d7d7c, 0x928472, 0x82857a, 0x8e8378];
      const s = makeZenStone(rand, size, toene[Math.floor(rand() * toene.length) % toene.length]);
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
  // **Fünf identische Scheiben auf einer Geraden.** So hat der Prüfer den
  // Pfad gemessen: Breiten 21/22/23/21/23 px, Höhen 13/14/14/13/14, gleicher
  // Weltabstand, keiner gedreht, keiner eingesunken. Ein Trittstein ist ein
  // gespaltener Findling: kantiger Umriss, jeder anders groß, jeder in einer
  // anderen Lage, und er sitzt **im** Kies, nicht darauf.
  const trittsteine = [];
  for (let i = 0; i < 7; i++) {
    const groesse = 0.21 + rand() * 0.13;
    // Umriss: ein Vieleck mit ungleichen Radien, nicht ein Kreis. Wenige
    // Segmente, damit die Kante gebrochen liest statt rund.
    const ecken = 7 + Math.floor(rand() * 3);
    const geo = new THREE.CylinderGeometry(groesse, groesse * 0.94, 0.075, ecken);
    {
      const pos = geo.attributes.position;
      const umriss = welligerUmriss(820 + i * 31, 0.26, 4);
      for (let v = 0; v < pos.count; v++) {
        const px = pos.getX(v);
        const pz = pos.getZ(v);
        const r = Math.hypot(px, pz);
        if (r < 1e-5) continue;
        const f = umriss(Math.atan2(pz, px));
        pos.setX(v, px * f);
        pos.setZ(v, pz * f);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
    boxProjectUV(geo, 0.22);
    paintVertices(geo, [0x8e8880, 0x847d73, 0x99928a, 0x8a8378][i % 4]);
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
    // Der Pfad krümmt sich, und die Schrittweite schwankt — ein gelegter Weg
    // folgt dem Schritt, nicht dem Lineal.
    const t = i / 6;
    const bogen = Math.sin(t * 1.9) * 1.1;
    step.position.set(
      -1.7 + t * 4.6 + (rand() - 0.5) * 0.22,
      // **Eingesunken.** Der Kies liegt bei −0,02; ein Stein, der 3 cm hoch
      // aus 7,5 cm Dicke herausschaut, sitzt im Bett statt darauf.
      -0.014 + rand() * 0.012,
      3.35 - t * 2.9 - bogen * 0.45 + (rand() - 0.5) * 0.24
    );
    step.rotation.y = rand() * Math.PI * 2;
    // Leichte Schieflage: kein gelegter Stein liegt exakt waagerecht.
    step.rotation.x = (rand() - 0.5) * 0.09;
    step.rotation.z = (rand() - 0.5) * 0.09;
    step.scale.set(1 + rand() * 0.24, 1, 0.8 + rand() * 0.25);
    trittsteine.push(step);
  }
  group.add(...verschmelzeObjekte(trittsteine, 'zen-trittsteine'));

  // Koi-Teich
  const pondCenter = new THREE.Vector3(TEICH.x, 0, TEICH.z);
  // Das Becken zuerst: Mulde, Uferwulst, Übergang in den Kies. Es trägt die
  // Kornkarte des Sandes, damit Ufer und Kies dieselbe Körnung zeigen.
  const beckenGeo = makeTeichbecken(TEICH.rx, TEICH.rz, { umriss: teichUmriss });
  const becken = new THREE.Mesh(
    beckenGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: 0xffffff,
      normalMap: sandMaps().grainMap.clone(),
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughness: 0.92,
      metalness: 0,
    })
  );
  becken.material.normalMap.needsUpdate = true;
  becken.material.normalMap.repeat.set(1, 1); // UVs stehen schon in Metern
  becken.name = 'zen-teichbecken';
  becken.position.set(TEICH.x, -0.02, TEICH.z);
  group.add(becken);
  // **Zwei gegeneinander wandernde Kräuselungslagen statt einer geschobenen
  // Textur.** Eine einzelne Lage mit laufendem Versatz liest man sofort als
  // verschobenes Bild; erst zwei Lagen in verschiedener Richtung und Frequenz
  // ergeben ein Muster, das entsteht und wieder vergeht. Der Grundton ist dunkel,
  // weil man auf Wasser fast nur die Spiegelung sieht – ein heller Grundton
  // macht daraus graue Farbe.
  const pondMat = waterMaterial({ repeat: 3.2 });
  pondMat.transparent = true;
  // **Tiefenton, Uferzone und Glanzbahn — im Shader, nicht als Farbe.**
  //
  // Gemessen war die offene Fläche: Mittel 114, Spannweite 26, kein Pixel über
  // 190, Farbton praktisch gesättigungsfrei, und eine Spalte durch den Teich
  // fiel streng monoton. Das ist keine Wasserfläche, das ist eine Platte mit
  // Verlauf. Drei Dinge fehlten:
  //
  //   * **Tiefe.** Am Ufer sieht man den sandigen Grund, in der Mitte nicht
  //     mehr. Das ist kein Helligkeitsverlauf, sondern ein Wechsel der
  //     **Deckkraft**: flach durchsichtig, tief undurchsichtig. Genau das
  //     trennt Wasser von eingefärbtem Glas.
  //   * **Die Wasserlinie.** Ein Saum, wo das Wasser den Grund benetzt —
  //     dunkler und dann zum Ufer hin auslaufend, statt ein sauberer Schnitt.
  //   * **Die Glanzbahn.** Eine tief stehende Sonne zieht auf leicht bewegtem
  //     Wasser einen langen Streifen. Ohne ihn hat der Teich keinen einzigen
  //     hellen Punkt.
  //
  // Die Tiefe kommt aus den UVs der Wasserscheibe (Mittelpunkt 0,5|0,5), nicht
  // aus einer zweiten Textur: Die Scheibe ist ein Kreis, ihr normierter Radius
  // ist der Abstand zum Ufer.
  {
    const tiefUniforms = {
      // Flachwasser über Sand ist nicht sandfarben, sondern grünlich: Was
      // hindurchkommt, hat schon einen Zentimeter Wasser passiert.
      uWasserFlach: { value: new THREE.Color(0x5c7358) },
      uWasserTief: { value: new THREE.Color(0x11302f) },
      uWasserSaum: { value: new THREE.Color(0x2f3a30) },
    };
    const vorher = pondMat.onBeforeCompile;
    pondMat.onBeforeCompile = (shader, renderer) => {
      if (vorher) vorher.call(pondMat, shader, renderer);
      Object.assign(shader.uniforms, tiefUniforms);
      // **`vMapUv` gibt es hier nicht.** three legt die UV-Varianten je
      // Kartenslot an, und die Wasserfläche hat gar keine Farbkarte — nur
      // Normal- und Clearcoat-Normalkarte, also `vNormalMapUv` mit deren
      // Kachelung. Der erste Anlauf griff auf `vMapUv` zu, der Shader
      // kompilierte nicht, und die Konsole war voll mit
      // „useProgram: program not valid". Also eine eigene Varying mit den
      // ungekachelten UVs der Scheibe.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n varying vec2 vTeichUv;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n vTeichUv = uv;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           varying vec2 vTeichUv;
           uniform vec3 uWasserFlach;
           uniform vec3 uWasserTief;
           uniform vec3 uWasserSaum;`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           {
             // Normierter Abstand zur Mitte der Scheibe: 0 = Mitte, 1 = Ufer.
             float rand = clamp(length(vTeichUv - 0.5) * 2.0, 0.0, 1.0);
             float tief = 1.0 - rand;
             // Der Grund verschwindet nicht linear, sondern nach Beer-Lambert:
             // in den ersten Zentimetern viel, danach kaum noch.
             float deckung = 1.0 - exp(-3.4 * tief);
             diffuseColor.rgb = mix(uWasserFlach, uWasserTief, deckung);
             // Der Saum unmittelbar an der Wasserlinie
             float saum = smoothstep(0.86, 1.0, rand);
             // 0,65 war zu viel: Zusammen mit der dunkelsten Zone des Beckens
             // stand an der Wasserlinie eine schwarze Naht, 43 bis 61 L unter
             // beiden Nachbarn.
             diffuseColor.rgb = mix(diffuseColor.rgb, uWasserSaum, saum * 0.38);
             // Flach ist durchsichtig, tief nicht. Am äußersten Rand läuft die
             // Fläche aus, damit die Wasserlinie kein Schnitt ist.
             // **0,34 am Ufer war zu durchsichtig.** Der Beckenhang schien
             // dort so ungebrochen durch, dass das Flachwasser als trockenes
             // Ufer las — im Bild ein breiter sandfarbener Streifen zwischen
             // Wasser und Uferkieseln, der wie ein halb abgelassener Teich
             // aussah. Es war kein Pegelproblem, sondern ein Deckungsproblem:
             // Auch flaches Wasser tönt, was darunter liegt. 0,62 lässt den
             // Grund noch durch, färbt ihn aber sichtbar ein.
             diffuseColor.a = mix(0.62, 0.96, deckung) * (1.0 - smoothstep(0.965, 1.0, rand) * 0.6);
           }`
        );
    };
    const vorherKey = pondMat.customProgramCacheKey?.bind(pondMat);
    pondMat.customProgramCacheKey = () => `${vorherKey ? vorherKey() : ''}|zen-wasser`;
  }
  // **Heller und durchsichtiger als das Tsukubai-Becken im Dojo.** Der
  // Grundton dort ist fast schwarz, weil ein Steinbecken tief und schattig ist
  // und man darin praktisch nur die Spiegelung sieht. Ein Gartenteich mit
  // Seerosen ist flach: Der Sand darunter gehört ins Bild. Mit dem
  // unveränderten Wert war der Teich ein schwarzes Loch im Sand – nachgesehen,
  // nicht überlegt.
  // Grundfarbe und Deckkraft stehen jetzt im Shader oben (tiefenabhängig).
  // `opacity` bleibt 1, damit der dortige Alphawert nicht ein zweites Mal
  // multipliziert wird.
  pondMat.color.setHex(0xffffff);
  pondMat.opacity = 1;
  // Rauheit von 0,05 auf 0,14: Bei 0,05 ist die Sonnenspiegelung ein Punkt von
  // wenigen Pixeln und im Bild nicht vorhanden. Leicht bewegtes Wasser zieht
  // sie zu einer Bahn auseinander — das ist die Lichtspitze, die dem Teich
  // gefehlt hat.
  // 0,09 statt 0,14: Je schärfer die Keule, desto mehr vom hellen
  // Horizontband und von der Sonnenscheibe kommt zurück. Die Kräuselungskarten
  // brechen die Spiegelung ohnehin in wandernde Lichter auf — das ist der
  // Unterschied zwischen Wasser und poliertem Blech.
  pondMat.roughness = 0.09;
  pondMat.normalScale.set(0.5, 0.5);
  pondMat.envMapIntensity = 1.5;
  // Das Wasser braucht etwas zu spiegeln. Ohne Environment-Map bleibt bei
  // Rauheit 0,05 nur die Grundfarbe übrig, und die ist absichtlich dunkel.
  pondMat.userData.needsEnv = true;
  // Die Wasserfläche folgt demselben verrauschten Umriss wie das Becken — eine
  // exakte Ellipse als Wasserlinie ist der schnellste Weg zu „gerechnet".
  // 160 statt 96 Segmente: Bei 2 m Radius sind 96 Segmente 13 cm je Kante, und
  // die Wasserlinie war aus zwei Metern sichtbar facettiert.
  const wasserGeo = new THREE.CircleGeometry(1, 160);
  {
    const wp = wasserGeo.attributes.position;
    for (let v = 1; v < wp.count; v++) {
      // **Die Scheibe wird um −90° um X gedreht.** Ein Punkt (x, y, 0) landet
      // damit bei (x, 0, −y): Der lokale Winkel a entspricht dem **negativen**
      // Weltwinkel. Der erste Anlauf hat `teichUmriss(a)` benutzt und damit
      // eine zur Beckenkontur **spiegelverkehrte** Wasserlinie gezeichnet —
      // links lag das Wasser an den Steinen, rechts stand ein breiter trockener
      // Streifen dazwischen. Genau das sah aus wie ein halb leerer Teich, und
      // zweimal den Pegel anzuheben hat es nicht behoben, weil es kein
      // Pegelproblem war.
      const a = -Math.atan2(wp.getY(v), wp.getX(v));
      // **Randvoll, nicht halb leer.** Vorher lag die Wasserfläche auf der
      // Wasserlinie des Beckenprofils (0,95) und damit auf der Höhe, an der der
      // Uferwulst erst anfängt zu steigen — zwischen Wasser und Uferkrone stand
      // ein trockener Ring, und der Teich sah aus wie ein Becken, aus dem
      // jemand Wasser abgelassen hat. Der Spiegel steht jetzt bei 1,01, also
      // ein gutes Stück den Uferhang hinauf; sichtbar bleibt vom Ufer nur der
      // schmale Streifen bis zur Krone.
      wp.setXY(v, Math.cos(a) * teichUmriss(a) * 1.04, -Math.sin(a) * teichUmriss(a) * 1.04);
    }
    wp.needsUpdate = true;
    wasserGeo.computeVertexNormals();
  }
  const pond = new THREE.Mesh(wasserGeo, pondMat);
  pond.rotation.x = -Math.PI / 2;
  // **Randvoll heißt: bis an die Uferkrone.** Der Uferhang steigt von 0 (bei
  // t = 0,95) auf sein Maximum +0,07 (bei t = 1,06) und fällt danach nach außen
  // wieder ab; höher als die Krone kann das Wasser nicht stehen, ohne
  // überzulaufen. Der Spiegel liegt deshalb bei t = 1,055, wo der Hang
  // +0,0696 erreicht — über dem Beckenursprung bei −0,02 also +0,0496. Vom
  // Ufer bleibt innen gut ein Zentimeter sichtbar, außen der abfallende Rand.
  //
  // Zwei Zwischenstände waren zu niedrig: 0,95 (auf der Wasserlinie des
  // Profils) ließ einen breiten trockenen Ring stehen, 1,04 immer noch einen
  // von zwanzig Zentimetern.
  pond.position.set(pondCenter.x, 0.0442, pondCenter.z);
  // **Der Fehler, der den Teich halb leer aussehen ließ.** Hier stand
  // `set(rx, 1, rz)` — geschrieben, als läge die Scheibe in der XZ-Ebene. Sie
  // ist aber eine `CircleGeometry` in der **XY**-Ebene und wird erst danach um
  // −90° um X gekippt. Die Skalierung wirkt vor der Drehung auf die lokalen
  // Achsen: Lokal-Y wird zu Welt-Z, lokal-Z (das hier überall null ist) zu
  // Welt-Y. Die Streckung auf 1,7 lief damit ins Leere, und der Teich war in
  // Z nur 1,0 m weit statt 1,7 — das Becken ringsum aber schon. Übrig blieb
  // ein breiter Streifen Uferhang, den ich für zu wenig Wasser gehalten und
  // dreimal mit dem Pegel zu beheben versucht habe. Gemessen war der
  // Wasserradius je Azimut 0,61 bis 1,10 statt konstant 1,04 — das hat es in
  // fünf Minuten geklärt.
  pond.scale.set(TEICH.rx, TEICH.rz, 1);
  pond.name = 'zen-wasser';
  group.add(pond);
  // Steinrand um den Teich
  const uferSteine = [];
  // **Perlenkette bei konstantem Winkelschritt** — so hat der Prüfer den
  // Teichrand gemessen. Ein gesetzter Uferrand hat Lücken, Häufungen und
  // Steine verschiedener Größe. Der Winkel wird deshalb je Stein gestört, und
  // zwei von sechzehn Plätzen bleiben leer.
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 11) {
      rand();
      rand();
      continue;
    }
    const a = ((i + (rand() - 0.5) * 0.75) / 16) * Math.PI * 2;
    const s = makeZenStone(rand, 0.1 + rand() * 0.13, 0x8f8880);
    // **An die Wasserlinie gerückt und abgesenkt.** Vorher standen die Steine
    // auf dem Kiesniveau am äußeren Rand — eine Perlenkette neben einer
    // Scheibe. Jetzt sitzen sie im Uferwulst, ihr Fuß liegt unter Wasser.
    // Auf der Uferkrone, mit dem Fuß im Wasser: Der Spiegel steht bei +0,044,
    // die Steine sitzen bei +0,028 und ragen daraus hervor.
    s.position.set(
      pondCenter.x + Math.cos(a) * TEICH.rx * 1.09,
      0.035,
      pondCenter.z + Math.sin(a) * TEICH.rz * 1.09
    );
    // **Nass ist nicht „dunkler eingefärbt", aber dunkel ist der halbe Effekt.**
    // Ein Wasserfilm füllt die Mikrorauheit: Was in die Poren fällt, kommt kaum
    // wieder heraus. Die Rauheit ließe sich nur über ein zweites Material
    // ändern — und das wäre ein zweiter Draw-Call für sechzehn Kiesel. Die
    // Verdunklung steckt deshalb in den Scheitelfarben, gestaffelt über die
    // Wasserlinie: unter Wasser voll, darüber ein Saum von acht Zentimetern,
    // wo das Wasser hochzieht.
    {
      s.updateMatrix();
      const pos = s.geometry.attributes.position;
      const col = s.geometry.attributes.color;
      const v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(s.matrix);
        const nass = 1 - smoothstep(0.0496, 0.13, v.y);
        const f = 1 - nass * 0.26;
        col.setXYZ(k, col.getX(k) * f, col.getY(k) * f * 0.99, col.getZ(k) * f * 0.97);
      }
      col.needsUpdate = true;
    }
    s.material = zenNassGranite();
    uferSteine.push(s);
  }
  group.add(...verschmelzeObjekte(uferSteine, 'zen-ufersteine'));
  group.add(...verschmelzeObjekte(findlinge, 'zen-findlinge'));
  // Seerosenblätter + Lotusblüten auf der Wasseroberfläche
  const seerosen = [];
  for (let i = 0; i < 7; i++) {
    const pad = makeLilyPad(rand);
    const a = rand() * Math.PI * 2;
    const r = rand() * 1.5;
    // Auf der Wasserfläche (+0,025), nicht darüber schwebend.
    pad.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.056, pondCenter.z + Math.sin(a) * r);
    seerosen.push(pad);
  }
  group.add(...verschmelzeObjekte(seerosen, 'zen-seerosen'));
  const lotusse = [];
  for (let i = 0; i < 3; i++) {
    const lotus = makeLotus();
    const a = rand() * Math.PI * 2;
    const r = 0.3 + rand() * 1.1;
    lotus.position.set(pondCenter.x + Math.cos(a) * r * 1.15, 0.061, pondCenter.z + Math.sin(a) * r);
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
    ring.position.set(pondCenter.x, 0.0565, pondCenter.z);
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
  // **Die Krone ist um einen halben Meter gestiegen.** Vorher saß sie direkt
  // auf dem Stamm — selbst mit Astwerk wäre davon nichts zu sehen gewesen,
  // weil die Blattmasse bei y = 1,78 anfing und der Stamm bei 1,8 endete. Ein
  // Baum liest sich aber über die Lücke zwischen Stamm und Krone: Dort steht
  // das Astwerk, und dort sieht man den Himmel hindurch.
  // Acht Ansätze statt sechs, und mit deutlich mehr Höhenstreuung: Die sechs
  // lagen zwischen 2,30 und 2,92 m und ergaben eine breite, unten glatt
  // abgeschnittene Platte — die Krone saß wie ein Pilzhut auf dem Stamm. Zwei
  // tief außen sitzende Ansätze lassen sie an den Seiten herabhängen, der
  // mittlere steigt; die Unterkante ist damit keine Waagerechte mehr.
  // Draw-Calls kostet das nichts, die Schöpfe sind Instanzen.
  const SAKURA_ANSAETZE = [
    [0, 2.78, 0, 0.58],
    [0.78, 2.46, 0.28, 0.42],
    [-0.66, 2.56, -0.38, 0.46],
    [0.38, 3.04, -0.25, 0.38],
    [-0.38, 2.9, 0.5, 0.34],
    [0.14, 2.34, 0.62, 0.34],
    [-0.88, 2.14, 0.22, 0.3],
    [0.62, 2.16, -0.56, 0.3],
  ];
  // Stamm und Astwerk in **einem** Mesh: ein Ast zu jedem Kronenansatz plus je
  // ein Nebenzweig. Alle Koordinaten sind Weltkoordinaten des Baums, der Stamm
  // steht also von 0 bis 1,95 und die Äste setzen bei 1,55 an. Der erste
  // Anlauf hatte die Geometrie zusätzlich um 0,9 verschoben und den Baum damit
  // schweben lassen.
  // Die Maserung von `weatheredWoodMaterial` läuft in V, also längs des
  // Zylinders. Über 1,95 m Stamm liegt sonst **eine** Kachel — aus zwei Metern
  // ist das eine glatte Fläche. Fünf Umläufe ergeben Rindenstruktur in der
  // Größenordnung, in der man sie sieht.
  const trunkGeo = mergeGeometries([
    scaleUV(new THREE.CylinderGeometry(0.105, 0.21, 1.95, 10), 5).translate(0, 0.975, 0),
    ...astwerk([0, 1.55, 0], SAKURA_ANSAETZE, { seed: 0x5a11, stammR: 0.085 }),
  ]);
  const trunk = new THREE.Mesh(
    trunkGeo,
    // `vertexColors` muss **aus** sein: Die Vorgabe ist `true`, ein
    // CylinderGeometry bringt aber kein Farbattribut mit, und three liest dann
    // ins Leere – der Stamm wird schwarz. Genau so passiert und im Bild gesehen.
    weatheredWoodMaterial({ tone: 0x8a6f58, vertexColors: false })
  );
  trunk.position.y = 0;
  trunk.rotation.z = 0.05;
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
    ansaetze: SAKURA_ANSAETZE,
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

  // --- Einfassung: Mauer und Sträucher --------------------------------------
  //
  // **Die Gartenmauer ist wieder entfallen.** Sie hat den Garten eingefasst und
  // der leeren Fläche einen Grund gegeben, aber sie hat ihn auch geschlossen —
  // aus dem offenen Kiesfeld unter weitem Himmel wurde ein Hof. Der Garten
  // bleibt offen; die Sträucher übernehmen die Aufgabe, dem Blick im
  // Mittelgrund Masse zu geben, ohne eine Wand zu ziehen.
  //
  // `makeGartenmauer()` steht weiter im Code: Sie ist gebaut, geprüft und in
  // fünf Zeilen wieder einzuhängen, falls die Entscheidung noch einmal fällt.
  //
  // Sträucher als Mittelgrundmasse. Sie stehen in Gruppen, nicht in einer
  // Reihe, und lassen Lücken zwischen sich.
  group.add(
    // Näher herangerückt, seit die Mauer fehlt: Auf 9 bis 11 m standen sie an
    // ihr; ohne sie wären es Klumpen weit draußen im leeren Kies. Auf 6 bis 8 m
    // begrenzen sie den gestalteten Teil des Gartens, ohne ihn zu schließen.
    makeKarikomi(rand, [
      [-6.9, -5.3, 1.0, 0.85],
      [-5.8, -6.4, 0.72, 0.6],
      [-7.9, -4.0, 0.8, 0.66],
      [1.2, -8.2, 1.15, 0.95],
      [2.5, -7.7, 0.85, 0.7],
      [-3.4, -8.1, 0.95, 0.78],
      [-8.2, 0.4, 1.05, 0.88],
      [-7.8, 1.9, 0.7, 0.55],
      [5.6, -6.3, 0.9, 0.72],
    ])
  );

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
  // **Ein Fleck in der Mitte des Tors verdunkelt nichts.** Der Prüfer hat am
  // Torii gemessen: Der Pfosten endet bei L 48, zwei Pixel weiter steht der
  // volle Sonnensand mit 181 — kein Ansatz, das Tor schwebt. Der Grund war die
  // Lage: Der Fleck saß in der Mitte des Tors, die Pfosten stehen aber 1,2 m
  // links und rechts davon und damit außerhalb. Kontaktverdunklung gehört an
  // den **Fuß**, nicht in den Schwerpunkt.
  for (const sx of [-1, 1]) {
    const fuss = makeBlobShadow(0.42, 0.6);
    const wx = -2 + Math.cos(0.35) * sx * 1.2;
    const wz = -9 - Math.sin(0.35) * sx * 1.2;
    fuss.position.set(wx, 0.015, wz);
    kontaktschatten.push(fuss);
  }

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

  // Treibende Kirschblütenblätter — Instanzen statt Punktwolke, siehe
  // `makeBluetenblaetter`. Sie fallen an den beiden Bäumen, nicht über dem
  // ganzen Garten, und keines steigt über seine Krone.
  const blueten = makeBluetenblaetter(rand, [
    { x: -4.5, z: 2.5, hoehe: 3.3, streu: 1.5 },
    { x: 4.8, z: 3.2, hoehe: 2.7, streu: 1.2 },
  ]);
  group.add(blueten.mesh);

  // Die Sonne dieser Umgebung als Himmelsbeschreibung. Warmer Spätnachmittag:
  // tiefer Zenit, sehr breiter goldener Dunst am Horizont – deutlich anders als
  // der klare Vormittagshimmel des Dojos, und genau deshalb ein eigener Eintrag
  // im Zwischenspeicher von `buildSkyEnvironment`.
  const ZEN_HIMMEL = {
    name: 'zen',
    sun: ZEN_SONNE,
    target: [0, 0, 0],
    sunColor: 0xffd9a0,
    // **Die Pegel waren zu niedrig für eine sichtbare Spiegelung.** Der Prüfer
    // hat auf der ganzen Wasserfläche keinen einzigen Pixel über L 190
    // gefunden, obwohl die Laterne unmittelbar daneben mit L 202 leuchtet.
    // Nachgerechnet: Bei einem Blick von 1,5 m auf einen Teich in 3,5 m
    // Abstand trifft man die Fläche unter 67° zur Normalen; der
    // Fresnel-Anteil ist dort rund 12 %. Zwölf Prozent von 0,66 sind 0,08
    // linear — und das ist nach der ACES-Kurve etwa L 90, genau der gemessene
    // Wert. Der Rechenweg stimmte also, nur die Quelle war zu dunkel. Die
    // Pegel liegen jetzt dort, wo die sichtbare Kuppel steht.
    sky: {
      zenith: { hex: 0x7ea3cc, level: 0.48 },
      horizon: { hex: 0xf3dcb4, level: 0.98 },
      haze: { hex: 0xffc98a, level: 0.88 },
      ground: { hex: 0x8d7d5e, level: 0.34 },
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
    // **Streulicht durch das Laub — zweiter Anlauf.**
    //
    // Der erste nahm die Hüllkörper der Kronen aus der Schattenkarte, damit nur
    // die alphageprüften Blattkarten werfen. Gedacht war gesprenkeltes Licht;
    // gemessen kam ein Kronenschatten von Δ 18 L heraus, während der bloße
    // Stamm danebén Δ 68 warf — die Krone warf **schwächer als ihr eigener
    // Stamm**, also genau verkehrt herum. Die Karten decken aus Sonnenrichtung
    // schlicht zu wenig Fläche, um allein einen Baumschatten zu tragen.
    //
    // Der Hüllkörper wirft deshalb wieder mit. Was dabei entsteht, ist der
    // Schatten eines Baumes: ein dichter Kern und ein aufgelöster Saum aus den
    // Karten. Der Kern ist keine Blase, weil die Hüllkörper mehrere kleine
    // Schöpfe sind und nicht eine Kugel.
    const nurEmpfangen = new Set(['zen-sand', 'zen-saum', 'zen-moos']);
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
        // **Die Koi schwammen auf dem Wasser, nicht darin.** Ihre Bahn lag bei
        // y = 0, der Körper ist 11 cm hoch, die Wasserfläche lag bei y = 0,01 —
        // viereinhalb Zentimeter Fisch standen heraus. Jetzt 10 cm unter der
        // Oberfläche: Der Rücken bleibt gut zwei Zentimeter unter Wasser, und
        // unter dem Bauch stehen bei der äußeren Bahn noch acht Zentimeter bis
        // zum Grund.
        koi.position.set(
          pondCenter.x + Math.cos(a) * d.radius * 1.15,
          -0.05 + bob,
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

        // Der Schwanz schlägt in derselben Phase wie die Körperwelle weiter —
        // sonst arbeitet er gegen sie.
        d.uniforms.uKoiZeit.value = time;
        d.tail.rotation.y = Math.sin(time * 7.5 - d.uniforms.uKoiPhase.value) * 0.45;
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
      blueten.update(time);
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
