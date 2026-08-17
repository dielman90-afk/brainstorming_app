import * as THREE from 'three';
import { FILL, ROOM, SHOJI, SUN, sunDirection, WALL } from './layout.js';

// Licht und Atmosphäre des Konstrukt-Dojos.
//
// Die Reihenfolge in dieser Datei ist die Reihenfolge der Wichtigkeit:
//
// 1. **Environment-Map.** Ohne sie rendert jedes Metall und jeder Lack im Raum
//    schwarz – `MeshStandardMaterial` mit `metalness = 1` hat ohne Umgebung
//    nichts zu spiegeln, und die Diffusfarbe eines Metalls ist per Definition
//    null. Eine Klinge ohne IBL ist eine schwarze Silhouette. Das ist kein
//    Feinschliff, sondern die Voraussetzung dafür, dass materials.js überhaupt
//    funktioniert.
// 2. **Eine** gerichtete Sonne mit **einer** Schattenkarte. Alles andere ist
//    Füll- und Streulicht ohne Schatten.
// 3. Lichtschächte und Staub – Stimmung, kein Licht im technischen Sinn.
//
// Alle Maße kommen aus layout.js. Wenn hier eine Zahl steht, die dort auch
// stehen könnte, ist das ein Fehler.

// --- Zeichenbudget (layout.js: BUDGET.atmosphere = 20 Draws / 20 000 Dreiecke) -
//
// Gemessen: 5 Meshes, 74 Dreiecke.
//   1 Lichtschächte (6 Blenden, zu **einer** Geometrie verschmolzen)  48 Tri
//   1 Lichtpfützen auf dem Boden (6 Flächen, ebenfalls verschmolzen)  12 Tri
//   1 Blendenglühen an der Shoji-Front (6 Flächen)                    12 Tri
//   1 Staub (Points, keine Dreiecke)                                   0 Tri
// Dazu genau **eine** Schattenkarte mit 1024².
//
// Warum überall verschmolzene Geometrie statt sechs einzelner Meshes: Sechs
// Schächte wären sechs Draw-Calls, sechs Pfützen weitere sechs. Das wäre für
// sich noch im Budget, aber auf der Quest ist der Draw-Call der teure Teil, und
// die sechs Schächte teilen ohnehin ein Material – sie unterscheiden sich nur
// in ihrer Position, und die steckt in den Vertexdaten.

// --- Prozedurale Environment-Map ---------------------------------------------
//
// Eine Innenraum-Sonde: keine Himmelskuppel, sondern das, was ein spiegelnder
// Gegenstand mitten im Dojo tatsächlich sieht – im Osten den grellen, warmen
// Schlitz der Shoji-Front, unten dunkles warmes Holz, oben den neutralen,
// verschatteten Dachstuhl, ringsum stumpfen Putz.
//
// Warum nicht `RoomEnvironment` aus three/addons: Die ist ein neutrales
// Fotostudio mit Deckenleuchten – gleichmäßig, kühl, von oben. Genau der Look,
// den dieser Raum nicht haben soll. Der Glanzstreifen auf einer Klinge muss
// **quer** liegen und warm sein, weil die einzige echte Lichtquelle ein
// waagerechter Schlitz im Osten ist. Das ist der Unterschied zwischen „Metall"
// und „Metall in diesem Raum".
//
// Warum eine Kugel und kein Innenwürfel: Der PMREM-Generator faltet ohnehin über
// die Richtung; die Geometrie der Sonde ist egal, nur die Verteilung der
// Helligkeit über die Richtung zählt. Eine Kugel mit einem Richtungs-Shader ist
// die billigste Art, diese Verteilung exakt zu beschreiben – und sie lässt sich
// in einer Zeile ändern, ohne Wände zu verschieben.
const PROBE_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec3 n = normalize(vDir);
    float h = n.y;      // -1 Boden … +1 Dachstuhl
    float east = n.x;   // +1 Shoji-Front

    // Grundverlauf: warmes dunkles Holz unten, neutraler Dachstuhl oben.
    vec3 col = mix(vec3(0.085, 0.068, 0.050), vec3(0.185, 0.190, 0.205),
                   smoothstep(-0.9, 0.9, h));
    // Ein Band aus Kalkputz um den Horizont – die drei geschlossenen Wände.
    col = mix(col, vec3(0.150, 0.144, 0.130), 1.0 - smoothstep(0.02, 0.55, abs(h)));

    // Der Schlitz: waagerechtes Band im Osten, deutlich über 1.0, damit ein
    // Metall überhaupt ein Glanzlicht bekommt statt nur einer Aufhellung.
    //
    // **Schmaler als zuvor, gleich hell.** Er war 0,09 bis 0,44 hoch und 0,12
    // bis 0,70 breit – ein sehr großer Teil der Kugel bei Strahldichte 3,30.
    // Diffuses Licht ist der **Fluss** über die ganze Fläche, ein Glanzlicht
    // dagegen braucht nur Helligkeit an einer schmalen Stelle. Die weite
    // Ausdehnung hat deshalb vor allem den Raum geflutet: Gemessen war die
    // Sonde auf jeder Papierfläche der größte Posten, auf der Westfront
    // 93,3 von 238,6 Luminanzeinheiten – mehr als das Fünffache des
    // Eigenleuchtens, an dem ich zwei Runden lang gedreht habe.
    //
    // Die Innenseite der Westwand zeigt mit ihrer Normalen genau in diesen
    // Schlitz; sie war deshalb die hellste Fläche im Raum, ohne selbst zu
    // leuchten (Anteil Eigenleuchten dort: 0,5 %).
    //
    // Schmal und hell statt breit und hell: Das Glanzlicht auf einer Klinge
    // wird dadurch eher schärfer, der diffuse Fluss sinkt deutlich.
    float slotBand = 1.0 - smoothstep(0.04, 0.20, abs(h - 0.04));
    float slotSide = smoothstep(0.30, 0.78, east);
    col += vec3(3.30, 2.72, 1.90) * slotBand * slotSide;

    // Die Lichtpfütze auf dem Boden wirft warm zurück – der Grund, warum die
    // Unterseiten im Dojo nicht schwarz absaufen.
    col += vec3(0.62, 0.47, 0.29) * smoothstep(0.05, -0.6, h) * smoothstep(-0.35, 0.65, east);

    // Gegenüber (Westen, oben) bleibt es kühl. Das ist die Farbtrennung, die den
    // Raum als „von **einer** tiefen Sonne beleuchtet" lesbar macht.
    col += vec3(0.055, 0.078, 0.105) * smoothstep(0.0, 0.85, -east) * smoothstep(-0.35, 0.8, h);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Der PMREM-Durchlauf kostet ein paar Millisekunden und ein Rendertarget. Beides
// genau einmal – die Umgebung ist statisch (die Sonne bewegt sich nicht), also
// wäre jede Neuberechnung reine Verschwendung.
let _environment = null;
let _environmentRenderer = null;

function buildEnvironment(renderer) {
  if (_environment && _environmentRenderer === renderer) return _environment;

  const probe = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    // Kein Tone-Mapping, keine Farbraumwandlung: Der PMREM rendert in ein
    // lineares Half-Float-Target, und `envMap` erwartet lineare Werte. Was hier
    // steht, ist genau das, was das Material später zu spiegeln bekommt.
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: PROBE_FRAGMENT,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 20), material);
  probe.add(shell);

  const pmrem = new THREE.PMREMGenerator(renderer);
  // `sigma` > 0 verschmiert die Sonde leicht, bevor sie gefiltert wird. Der
  // Schlitz hat harte Kanten; ohne die Vorunschärfe zeichnet sich seine Kante in
  // den rauen Mips als Treppe ab.
  const target = pmrem.fromScene(probe, 0.03, 0.1, 30);
  pmrem.dispose();

  shell.geometry.dispose();
  material.dispose();

  _environment = target.texture;
  _environmentRenderer = renderer;
  return _environment;
}

// --- Geteilte Hilfsmittel ----------------------------------------------------

// Weicher radialer Fleck. Dasselbe Rezept wie `makeGlowTexture` in
// environments.js – dort ist es modulprivat, und environments.js soll für das
// Dojo nicht angefasst werden. 4 KB Textur gegen eine Abhängigkeit in die
// falsche Richtung ist der richtige Tausch.
let _glow = null;
function glowTexture() {
  if (_glow) return _glow;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,244,220,1)');
  g.addColorStop(0.35, 'rgba(255,226,178,0.42)');
  g.addColorStop(1, 'rgba(255,214,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _glow = new THREE.CanvasTexture(canvas);
  _glow.colorSpace = THREE.SRGBColorSpace;
  return _glow;
}

// --- Geometrie der Lichtschächte ---------------------------------------------
//
// Der ganze Sinn dieses Abschnitts: Die Schächte dürfen nicht „ungefähr" aus dem
// Fenster kommen. Sie werden aus **derselben** Blendenfläche und **derselben**
// Richtung gebaut, aus denen auch die Schatten entstehen (`sunDirection()`),
// also stehen Schacht, Schlagschatten und Lichtpfütze zwangsläufig
// deckungsgleich. Jede von Hand gedrehte Ersatzlösung wäre beim nächsten
// Verschieben der Sonne falsch.

const DIR = (() => {
  const [x, y, z] = sunDirection();
  return new THREE.Vector3(x, y, z);
})();

// Blende = die sechs Shoji-Felder. Zwischen den Feldern bleibt ein Spalt, damit
// sich die Schächte benachbarter Felder nicht überlappen: Additive Flächen, die
// aufeinanderliegen, wären an der Sprosse **heller** – genau verkehrt herum.
const PANEL_PITCH = (SHOJI.toZ - SHOJI.fromZ) / SHOJI.panels;
const MULLION = 0.1;
const HALF_W = (PANEL_PITCH - MULLION) / 2;
const HALF_H = (SHOJI.headY - SHOJI.sillY) / 2;
const MID_Y = (SHOJI.headY + SHOJI.sillY) / 2;
// Ein Hauch vor der Papierebene, damit der Schacht nicht mit der Shoji-Fläche
// um dieselbe Tiefe streitet.
const APERTURE_X = SHOJI.x - 0.02;

// Länge, bis die Oberkante des Strahls den Boden erreicht (plus etwas Reserve).
// Weiter zu ziehen wäre sinnlos: Alles darunter liegt hinter dem Fußboden und
// wird vom Tiefentest ohnehin verworfen – **das** ist auch der Grund, warum der
// Schacht am Boden sauber abgeschnitten aussieht, ohne dass hier geklippt wird.
const BEAM_LENGTH = ((SHOJI.headY - ROOM.floorY) / -DIR.y) * 1.06;

// Deckkraft der Lichtschächte. Siehe die ausführliche Begründung bei
// `shaftMaterial` in buildAtmosphere() – kurz: der einzige Regler, der linear
// in die additive Mischung eingeht, und damit der einzige, mit dem sich das
// Ausbrennen überhaupt steuern lässt.
//
// Gemessen mit weiss.mjs/dichte.mjs, geklemmte Bildpunkte im schlimmsten von
// vier Blicken und mittlere Helligkeit über alle vier:
//
//   1,00 → 10,54 %  (138,8)      0,40 → 1,53 %  (117,5)
//   0,70 →  6,61 %  (129,6)      0,38 → 0,73 %  (116,6)
//   0,55 →  4,90 %  (123,9)      0,36 → 0,52 %  (115,6)
//   0,45 →  3,61 %  (119,7)      0,34 → 0,46 %  (114,7)
//   0,35 →  0,50 %  (115,1)      0,30 → 0,16 %  (112,8)
//
// Der Knick liegt scharf zwischen 0,45 und 0,35: Dort fällt eine große
// zusammenhängende Fläche unter die Klemmgrenze. 0,34 ist der **größte** Wert,
// der noch unter 0,5 % bleibt – gesucht war nicht der dunkelste, sondern der
// hellste, der nicht mehr ausbrennt. Die mittlere Helligkeit sinkt dabei nur
// von 138,8 auf 114,7; der Raum bleibt warm, er wird nur nicht mehr weiß.
const SHAFT_DICHTE = 0.34;

function panelCenterZ(i) {
  return SHOJI.fromZ + (i + 0.5) * PANEL_PITCH;
}

// Punkt der Blende in Blendenkoordinaten (a quer, b hoch, jeweils −1…1),
// anschließend um `v * BEAM_LENGTH` in Sonnenrichtung geschoben.
function beamPoint(i, a, b, v) {
  return new THREE.Vector3(
    APERTURE_X + DIR.x * v * BEAM_LENGTH,
    MID_Y + b * HALF_H + DIR.y * v * BEAM_LENGTH,
    panelCenterZ(i) + a * HALF_W + DIR.z * v * BEAM_LENGTH
  );
}

// Kleiner Sammler für verschmolzene Vierecke mit eigenen Attributen.
function quadBuilder() {
  const position = [];
  const cross = [];
  const prof = [];
  const len = [];
  return {
    // Ecken gegen den Uhrzeigersinn; `side: DoubleSide` macht die Wicklung egal.
    push(corners) {
      const [p0, p1, p2, p3] = corners;
      for (const [p, c, pr, l] of [p0, p1, p2, p0, p2, p3]) {
        position.push(p.x, p.y, p.z);
        cross.push(c[0], c[1]);
        prof.push(pr);
        len.push(l);
      }
    },
    build() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geometry.setAttribute('aCross', new THREE.Float32BufferAttribute(cross, 2));
      geometry.setAttribute('aProf', new THREE.Float32BufferAttribute(prof, 1));
      geometry.setAttribute('aLen', new THREE.Float32BufferAttribute(len, 1));
      return geometry;
    },
  };
}

function buildShaftGeometry() {
  const b = quadBuilder();
  for (let i = 0; i < SHOJI.panels; i++) {
    // Vier Mantelflächen des Strahlprismas, keine Deckel. Jede Fläche trägt in
    // `aProf` ihre eigene Querkoordinate; daraus wird im Shader ein weicher
    // Verlauf quer über die Fläche. Zusammen mit additivem Blending summieren
    // sich Vorder- und Rückseite zu etwas, das wie ein Volumen aussieht.
    //
    // Warum kein echtes Volumen (Raymarching, Depth-Peeling, gekreuzte
    // Billboards): Raymarching ist auf der Quest pro Pixel unbezahlbar,
    // Depth-Peeling braucht einen zweiten Durchgang, und gekreuzte Billboards
    // ergeben einen runden Strahl – die Blende hier ist aber ein Rechteck mit
    // Sprossen, und genau dieses Rechteck ist das, was man wiedererkennt.
    for (const a of [-1, 1]) {
      b.push([
        [beamPoint(i, a, -1, 0), [a, -1], -1, 0],
        [beamPoint(i, a, 1, 0), [a, 1], 1, 0],
        [beamPoint(i, a, 1, 1), [a, 1], 1, 1],
        [beamPoint(i, a, -1, 1), [a, -1], -1, 1],
      ]);
    }
    for (const bb of [-1, 1]) {
      b.push([
        [beamPoint(i, -1, bb, 0), [-1, bb], -1, 0],
        [beamPoint(i, 1, bb, 0), [1, bb], 1, 0],
        [beamPoint(i, 1, bb, 1), [1, bb], 1, 1],
        [beamPoint(i, -1, bb, 1), [-1, bb], -1, 1],
      ]);
    }
  }
  return b.build();
}

// Die Lichtpfütze: dieselbe Blende, entlang derselben Richtung auf y = 0
// projiziert. Sie ist der sichtbare Beweis, dass die Schächte stimmen – wenn
// Pfütze und Schacht nicht zusammenfallen, sieht man es sofort.
const POOL_Y = ROOM.floorY + 0.02;

function buildPoolGeometry() {
  const b = quadBuilder();
  const inside = (p) => {
    // Anteile der Pfütze, die hinter einer Wand landen würden, werden auf den
    // Raum begrenzt. Verdeckt wären sie ohnehin (Tiefentest), aber sie kosteten
    // Füllrate für nichts.
    p.x = Math.min(Math.max(p.x, ROOM.minX + 0.06), ROOM.maxX - 0.06);
    p.z = Math.min(Math.max(p.z, ROOM.minZ + 0.06), ROOM.maxZ - 0.06);
    p.y = POOL_Y;
    return p;
  };
  for (let i = 0; i < SHOJI.panels; i++) {
    const corner = (a, bb) => {
      const p = beamPoint(i, a, bb, 0);
      // Laufweg bis zum Boden, in denselben Einheiten wie `aLen` beim Schacht –
      // dadurch laufen Rauschen und Sprossenunschärfe über die Kante zwischen
      // Schacht und Pfütze stetig weiter.
      const t = p.y / -DIR.y;
      const land = inside(p.clone().addScaledVector(DIR, t));
      return [land, [a, bb], a, t / BEAM_LENGTH];
    };
    b.push([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]);
  }
  return b.build();
}

// --- Shader der Schächte und Pfützen -----------------------------------------

const BEAM_VERTEX = /* glsl */ `
  attribute vec2 aCross;
  attribute float aProf;
  attribute float aLen;
  varying vec2 vCross;
  varying float vProf;
  varying float vLen;
  void main() {
    vCross = aCross;
    vProf = aProf;
    vLen = aLen;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Sprossenmuster und Dunst teilen sich beide Shader. `blur` wächst mit dem
// zurückgelegten Weg: Der Halbschatten einer Kante wird mit der Entfernung
// breiter, also verwaschen die Kumiko-Streifen nach hinten – ohne das wirken die
// Schächte wie projizierte Dias.
const BEAM_COMMON = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uDichte;
  varying vec2 vCross;
  varying float vProf;
  varying float vLen;

  float lattice(vec2 c, float blur) {
    float gu = abs(fract((c.x * 0.5 + 0.5) * ${SHOJI.lattice.cols}.0) - 0.5) * 2.0;
    float gv = abs(fract((c.y * 0.5 + 0.5) * ${SHOJI.lattice.rows}.0) - 0.5) * 2.0;
    float m = smoothstep(0.0, blur, gu) * smoothstep(0.0, blur, gv);
    return mix(0.42, 1.0, m);
  }

  // Langsam wandernder Dunst. Drei Sinusse statt echtem Rauschen: Der Schacht
  // ist eine große, sehr billige Fläche, und der Unterschied zu Value-Noise ist
  // bei dieser Frequenz nicht zu sehen – die Kosten pro Pixel sehr wohl.
  float haze(vec2 c, float v, float t) {
    float a = sin(v * 7.0 - t * 0.31 + c.x * 1.9);
    float b = cos(v * 4.3 - t * 0.17 + c.y * 2.7);
    float d = sin(v * 14.0 - t * 0.47 + c.y * 1.1 + c.x * 0.7);
    return clamp(0.66 + 0.24 * a * b + 0.10 * d, 0.0, 1.4);
  }
`;

const SHAFT_FRAGMENT = /* glsl */ `
  ${BEAM_COMMON}
  void main() {
    // Weiche Kante quer über die jeweilige Mantelfläche.
    float prof = 1.0 - pow(abs(vProf), 2.2);
    // Kein harter Anfang an der Blende, und nach hinten nimmt die Streuung ab.
    float head = smoothstep(0.0, 0.06, vLen);
    float tail = 1.0 - smoothstep(0.22, 1.0, vLen);
    float blur = 0.10 + vLen * 0.6;
    float a = prof * head * tail * lattice(vCross, blur) * haze(vCross, vLen, uTime);
    gl_FragColor = vec4(uColor * uIntensity, a * uDichte);
    #include <colorspace_fragment>
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  ${BEAM_COMMON}
  void main() {
    // Die Kante der Pfütze wird mit der Entfernung weicher – dieselbe Ursache
    // wie bei den Sprossen.
    float soft = 0.05 + vLen * 0.35;
    float edgeA = 1.0 - smoothstep(1.0 - soft, 1.0, abs(vCross.x));
    float edgeB = 1.0 - smoothstep(1.0 - soft * 0.6, 1.0, abs(vCross.y));
    float blur = 0.10 + vLen * 0.6;
    float fade = mix(1.0, 0.22, smoothstep(0.05, 0.95, vLen));
    float a = edgeA * edgeB * fade * lattice(vCross, blur) * haze(vCross, vLen, uTime);
    gl_FragColor = vec4(uColor * uIntensity, a * uDichte);
    #include <colorspace_fragment>
  }
`;

// --- Ganzzahl-Hash ------------------------------------------------------------
//
// Hier stand bis zuletzt der Coderegen: eine Wand aus fallenden Katakana auf der
// verschatteten Westseite, additiv aufgetragen. Er ist ersatzlos entfernt – die
// Fläche gehört jetzt der Fusuma-Wandmalerei, und zwei konkurrierende Motive auf
// derselben Wand wären eines zu viel.
//
// Ganzzahl-Hash. Muss deterministisch sein: Der Regen ist eine reine Funktion
// der absoluten Zeit, also darf zwischen zwei Zeichnungen nichts vom letzten
// Zustand abhängen (kein `Math.random`, kein Nachziehen mit Alpha-Rechteck).
function hashInt(a, b, c) {
  let h = Math.imul(a + 0x9e3779b1, 0x85ebca6b);
  h = Math.imul(h ^ (b + 0x165667b1), 0xc2b2ae35);
  h = Math.imul(h ^ (c + 0x27d4eb2f), 0x27d4eb2f);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// --- Staub -------------------------------------------------------------------
//
// Staub gibt es nur **in** den Schächten. Überall sonst wäre er unsichtbar (er
// leuchtet nicht, er streut Licht), und Punkte zu zeichnen, die man nicht sieht,
// ist die teuerste Art, nichts zu tun. Die Bahn läuft deshalb in
// Blendenkoordinaten: quer schaukeln, langsam sinken, leicht in den Raum
// treiben – und beim Verlassen des Strahls oben wieder eintreten.
// Schatten-Bias. Die Werte stammen aus der im Lichtblock unten beschriebenen
// Abstimmung: Der Tiefen-Bias bleibt klein, weil er bei der flach stehenden
// Sonne Peter-Panning erzeugt; die Arbeit macht der Normal-Bias.
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.045;

const DUST_COUNT = 200;

function buildDust() {
  const positions = new Float32Array(DUST_COUNT * 3);
  const motes = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    motes.push({
      panel: i % SHOJI.panels,
      a: hashInt(i, 1, 0) * 2 - 1,
      b: hashInt(i, 2, 0),
      v: 0.04 + hashInt(i, 3, 0) * 0.72,
      fall: 0.006 + hashInt(i, 4, 0) * 0.016,
      sway: hashInt(i, 5, 0) * 6.283,
      drift: 0.004 + hashInt(i, 6, 0) * 0.012,
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: glowTexture(),
      color: 0xffe7c2,
      size: 0.028,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
      fog: false,
    })
  );
  points.name = 'dojo-dust';
  // Pflicht: Die Positionen werden im Puffer bewegt, die Bounding-Sphere der
  // Geometrie bleibt aber die vom Aufbau. Ohne das verschwindet der Staub, sobald
  // die Kamera den ursprünglichen Kasten nicht mehr sieht.
  points.frustumCulled = false;

  const update = (time) => {
    const array = geometry.attributes.position.array;
    for (let i = 0; i < DUST_COUNT; i++) {
      const m = motes[i];
      // fract() statt Modulo-Zähler: reine Funktion der absoluten Zeit.
      const bb = (((m.b - time * m.fall) % 1) + 1) % 1;
      const b = bb * 2 - 1;
      const a = Math.max(-1, Math.min(1, m.a + 0.22 * Math.sin(time * 0.19 + m.sway)));
      const v = ((((m.v + time * m.drift) % 0.92) + 0.92) % 0.92) + 0.03;
      const o = i * 3;
      array[o] = APERTURE_X + DIR.x * v * BEAM_LENGTH;
      array[o + 1] = MID_Y + b * HALF_H + DIR.y * v * BEAM_LENGTH;
      array[o + 2] = panelCenterZ(m.panel) + a * HALF_W + DIR.z * v * BEAM_LENGTH;
    }
    geometry.attributes.position.needsUpdate = true;
  };
  update(0);

  return { points, update };
}

// --- Blendenglühen (gefälschtes Bloom) ---------------------------------------
//
// Kein `EffectComposer`: Der Composer rendert in eigene Targets und bricht in
// WebXR das Stereo-Rendering – three gibt die XR-Framebuffer nicht her. Das
// Überstrahlen der Fensterfront wird deshalb da erzeugt, wo es hingehört: als
// additive, weiche Fläche unmittelbar vor der Blende.
function buildBloom() {
  const positions = [];
  const uvs = [];
  const push = (i) => {
    const z = panelCenterZ(i);
    const hw = PANEL_PITCH * 0.62; // breiter als die Blende – das Licht „läuft über"
    const hh = HALF_H * 1.16;
    const x = SHOJI.x - 0.05;
    const corners = [
      [x, MID_Y - hh, z - hw],
      [x, MID_Y - hh, z + hw],
      [x, MID_Y + hh, z + hw],
      [x, MID_Y + hh, z - hw],
    ];
    const uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      positions.push(corners[k][0], corners[k][1], corners[k][2]);
      uvs.push(uv[k][0], uv[k][1]);
    }
  };
  for (let i = 0; i < SHOJI.panels; i++) push(i);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: SUN.color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0.14,
      side: THREE.DoubleSide,
      fog: false,
    })
  );
  mesh.name = 'dojo-shoji-bloom';
  mesh.renderOrder = 2;
  return mesh;
}

// --- Aufbau ------------------------------------------------------------------

// Wie viel des globalen Hemisphärenlichts aus main.js:71 zurückgenommen wird.
//
// main.js fügt der Szene fest `HemisphereLight(0xffffff, 0x334455, 1.4)` hinzu.
// Das ist für die anderen Umgebungen richtig – sie haben gar kein anderes Licht
// – aber in einem Raum mit **einer** tiefen Sonne planiert es jeden Schatten:
// Bei 1.4 gleichmäßigem Umgebungslicht plus IBL bleibt zwischen Sonnenseite und
// Schattenseite kaum ein Unterschied, und der Raum sieht aus wie an einem
// bedeckten Tag fotografiert.
//
// Entfernen darf ich es nicht. Also steht hier ein zweites Hemisphärenlicht mit
// **denselben** Farben und negativer Intensität. Warum das gefahrlos ist: Die
// Bestrahlungsstärke eines Hemisphärenlichts ist linear in der Intensität, zwei
// Lichter mit gleichen Farben addieren sich also exakt zu einem einzigen mit
// 1.4 − COMPENSATION. Solange dieser Wert positiv bleibt, kann keine Fläche
// negatives Licht abbekommen; es entsteht kein einziges Pixel, das sich von
// einem einfachen `intensity = 0.4` unterscheiden ließe.
//
// Und es wirkt nur hier: three sammelt Lichter unter einem unsichtbaren Elternteil
// nicht ein (`projectObject` steigt bei `visible === false` gar nicht erst ab).
// Sobald das Dojo ausgeblendet ist, ist auch diese Rücknahme weg.
const GLOBAL_HEMI = { sky: 0xffffff, ground: 0x334455, intensity: 1.4 };
const COMPENSATION = 1.0;

export function buildAtmosphere(renderer) {
  // Schatten global scharfschalten. Das ist eine Renderer-Einstellung und damit
  // für alle Umgebungen sichtbar – folgenlos, weil außer dem Dojo keine einzige
  // Umgebung `castShadow` oder `receiveShadow` setzt (nachgeprüft: kein Treffer
  // in src/). Ohne Werfer und ohne Empfänger rendert three keine Schattenkarte
  // und ändert kein Pixel.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const environment = buildEnvironment(renderer);

  const group = new THREE.Group();
  group.name = 'dojo-atmosphere';

  // --- Sonne ---------------------------------------------------------------
  const key = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  key.position.set(...SUN.position);
  key.target.position.set(...SUN.target);
  // Das Ziel braucht einen Platz im Graphen, sonst wird seine Weltmatrix nie
  // aktualisiert und das Licht zeigt auf den Ursprung.
  group.add(key.target);
  key.castShadow = true;

  const shadow = key.shadow;
  shadow.mapSize.set(SUN.shadow.mapSize, SUN.shadow.mapSize);
  shadow.camera.left = -SUN.shadow.halfExtent;
  shadow.camera.right = SUN.shadow.halfExtent;
  shadow.camera.top = SUN.shadow.halfExtent;
  shadow.camera.bottom = -SUN.shadow.halfExtent;
  shadow.camera.near = SUN.shadow.near;
  shadow.camera.far = SUN.shadow.far;
  // Tiefen-Bias gegen Schattenakne, Normal-Bias gegen dasselbe – aber an
  // verschiedenen Stellen. Der Normal-Bias verschiebt den Abtastpunkt **entlang
  // der Normalen** und ist deshalb bei streifendem Licht (und diese Sonne steht
  // 17° über dem Horizont) das wirksamere Mittel: Er kostet keinen Versatz in
  // Blickrichtung, verursacht also kein Peter-Panning. Der Tiefen-Bias bleibt
  // deshalb bewusst klein; layout.js schlägt −0.0012 vor, das ergab bei
  // 2 × 8.5 m / 1024 ≈ 17 mm Texelgröße einen sichtbaren Spalt zwischen Objekt
  // und Schattenansatz (≈ 0.0012 × 25.5 m Tiefenbereich ÷ tan 17° ≈ 10 cm).
  // Gemessen sauber: −0.0004 Tiefe, 0.045 Normale.
  shadow.bias = SHADOW_BIAS;
  shadow.normalBias = SHADOW_NORMAL_BIAS;
  // (Die beiden Konstanten stehen oben bei den übrigen Werten dieser Datei.)
  shadow.camera.updateProjectionMatrix();
  group.add(key);

  // --- Füll- und Streulicht -------------------------------------------------
  const compensation = new THREE.HemisphereLight(
    GLOBAL_HEMI.sky,
    GLOBAL_HEMI.ground,
    -COMPENSATION
  );
  compensation.name = 'global-hemi-compensation';
  group.add(compensation);

  const fill = new THREE.HemisphereLight(FILL.color, FILL.ground, FILL.intensity);
  fill.name = 'dojo-fill';
  group.add(fill);

  // --- Schächte, Pfützen, Staub, Regen, Glühen ------------------------------
  //
  // **Warum es hier zwei Regler gibt und nur einer linear wirkt.**
  //
  // Der Fragment-Shader hängt `<colorspace_fragment>` an: Was er schreibt, ist
  // schon sRGB-kodiert, und *darauf* mischt der additive Modus. Aus 0,02 linear
  // werden dabei 0,152 – die Kodierung hebt kleine Werte um das Siebenfache.
  // Ein Strahlprisma hat vier Mantelflächen bei `DoubleSide`, benachbarte
  // Paneele überlagern sich zusätzlich; sieben Lagen ergeben 1,07 und damit
  // reines Weiß. Gemessen war der Diagonalblick nach Südost zu **10,5 %
  // geklemmt** – das ist das „zu helle durchscheinende Licht".
  //
  // `uIntensity` ist als Regler dagegen fast wirkungslos: Halbieren senkt den
  // kodierten Wert nur um den Faktor 2^(1/2,4) ≈ 1,33. Man müsste durch fünf
  // teilen, um die Hälfte zu bekommen – dann wäre die Farbe tot.
  //
  // `uDichte` multipliziert stattdessen die **Deckkraft**, und die geht linear
  // in die additive Mischung ein: halbe Dichte, halber Beitrag, gleiche Farbe.
  // Der Wert ist nicht geschätzt, sondern aus einer Messreihe ausgewählt – sie
  // steht oben bei `SHAFT_DICHTE`.
  const shaftMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(SUN.color) },
      uIntensity: { value: 0.02 },
      uDichte: { value: SHAFT_DICHTE },
    },
    vertexShader: BEAM_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Tiefentest **an**: Nur so schneidet der Fußboden den Schacht dort ab, wo
    // das Licht auftrifft, und nur so verschwindet der Teil hinter der Nordwand.
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const shafts = new THREE.Mesh(buildShaftGeometry(), shaftMaterial);
  shafts.name = 'dojo-light-shafts';
  shafts.renderOrder = 3;
  group.add(shafts);

  const poolMaterial = shaftMaterial.clone();
  poolMaterial.fragmentShader = POOL_FRAGMENT;
  poolMaterial.uniforms.uIntensity.value = 0.03;
  // Die Pfütze bleibt bei voller Dichte. Sie liegt flach auf dem Boden, ein
  // Blick trifft sie genau einmal – sie kann sich nicht mit sich selbst
  // stapeln. Gemessen trug sie zum Ausbrennen des Nordblicks 0,0 Punkte bei
  // (Schächte allein: 10,0 von 106). Sie mitzudämpfen würde nur den Beweis
  // schwächen, dass die Schächte dort ankommen, wo das Licht hinfällt.
  poolMaterial.uniforms.uDichte.value = 1.0;
  const pools = new THREE.Mesh(buildPoolGeometry(), poolMaterial);
  pools.name = 'dojo-light-pools';
  pools.renderOrder = 2;
  group.add(pools);

  const bloom = buildBloom();
  group.add(bloom);

  const dust = buildDust();
  group.add(dust.points);

  return {
    group,
    environment,
    update(time) {
      shaftMaterial.uniforms.uTime.value = time;
      poolMaterial.uniforms.uTime.value = time;
      dust.update(time);
      // Sehr langsames Atmen der Blende – die Luft vor einem Fenster steht nie
      // ganz still. Größer als ein paar Prozent wird daraus ein Flackern.
      bloom.material.opacity = 0.14 + 0.012 * Math.sin(time * 0.27);
    },
  };
}
