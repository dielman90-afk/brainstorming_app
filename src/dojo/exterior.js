import * as THREE from 'three';
import { EXTERIOR, ROOM, SUN } from './layout.js';

// 🎋 Die Welt vor den Fenstern.
//
// **Der Hain ist zuerst ein Schattenwerfer und erst danach eine Kulisse.**
//
// Durch Washi sieht man keine Landschaft, sondern Umrisse – und genau das ist
// das Bild, an dem man ein Dojo erkennt: der Schattenriss von Bambus auf dem
// Papier, der sich mit dem Sonnenstand über die Front zieht. Diese Wirkung ist
// hier praktisch gratis zu haben, weil beides schon existiert: **eine**
// gerichtete Sonne (layout.js:SUN) und ein Schattendurchgang, der ohnehin über
// die Szene läuft. Der Hain hängt sich nur hinein.
//
// Deshalb steht er nicht rundum, sondern als Streifen genau dort, wo er
// zwischen Sonne und Fenster steht (EXTERIOR.grove), plus einer zweiten Gruppe
// vor der Südfront, wo man durch offene Felder wirklich hinaussieht. Rundum
// wäre teurer und auf zwei Seiten wirkungslos.
//
// **Warum nichts davon begehbar ist.** Die Begrenzung in index.js leitet sich
// aus `ROOM` ab und bleibt unverändert. Der Spieler kommt nicht hinaus; die
// Außenwelt ist Bühnenbild und wird nie aus der Nähe gesehen. Das rechtfertigt
// die groben Mittel: sechseckige Halme, gekreuzte Blattflächen, eine gemalte
// Ferne. Aus vier Metern Abstand hinter einem Gitter ist der Unterschied zu
// echter Geometrie nicht zu sehen – die Zeichenlast dagegen schon.

// Deterministischer Zufall. Ein Hain, der sich bei jedem Laden anders stellt,
// macht jeden Screenshot-Vergleich wertlos – und Screenshot-Vergleiche sind das
// einzige Werkzeug, mit dem hier überhaupt beurteilt wird.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

// --- Bambushalm --------------------------------------------------------------
//
// Sechs Radialsegmente, weil ein Halm im Gegenlicht ohnehin nur als Silhouette
// wirkt und ein siebtes Segment nichts hinzufügt, aber vierzigmal bezahlt wird.
//
// Die **Knoten** sind das, was einen Bambus von einem Stab unterscheidet. Sie
// stecken nicht in der Silhouette (dafür wären sie zu klein), sondern als
// dunkle Ringe in den Vertexfarben – gratis, weil das Material ohnehin
// Vertexfarben liest, und sichtbar genau dann, wenn Licht seitlich einfällt.
function culmGeometry() {
  const H = 1; // Einheitshöhe, die Instanz skaliert
  const RINGS = 26;
  const geo = new THREE.CylinderGeometry(0.55, 1, H, 6, RINGS - 1, true);
  geo.translate(0, H / 2, 0); // Fuß auf y = 0, damit die Instanz auf dem Boden steht

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(0x9fae5c);
  const node = new THREE.Color(0x6d7a3a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / H;
    // Knotenabstand wächst nach oben, wie beim echten Halm.
    const k = Math.abs(Math.sin(Math.pow(y, 0.8) * Math.PI * 7.5));
    c.copy(base).lerp(node, Math.pow(1 - Math.min(1, k * 3), 3) * 0.9);
    // Nach oben etwas heller und gelblicher – Alter und Licht.
    c.lerp(new THREE.Color(0xc9cf7a), y * 0.35);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// --- Blattwerk ---------------------------------------------------------------
//
// Zwei gekreuzte Flächen mit einer Alphakarte. Der klassische Billboard-Trick,
// und hier der richtige: Echte Blätter wären fünfstellig viele Dreiecke für
// etwas, das man nur als bewegtes Grün hinter einem Gitter wahrnimmt.
//
// `alphaTest` statt `transparent`: Damit bleibt das Blattwerk im Tiefenpuffer
// und **wirft Schatten**. Mit `transparent` würde es weder das eine noch das
// andere zuverlässig tun, und der Schatten ist der ganze Zweck.
function leafTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const r = rng(0x5eaf);
  for (let i = 0; i < 90; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 12 + r() * 26;
    const wid = 2 + r() * 3.5;
    const a = (r() - 0.5) * 2.2 - Math.PI / 2;
    const g = 120 + r() * 70;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = `rgb(${Math.round(g * 0.55)},${Math.round(g)},${Math.round(g * 0.45)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, wid, len / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function leafGeometry() {
  const a = new THREE.PlaneGeometry(1, 1);
  const b = new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2);
  const geo = new THREE.BufferGeometry();
  const pos = [];
  const uv = [];
  const nrm = [];
  const idx = [];
  for (const src of [a, b]) {
    const off = pos.length / 3;
    const p = src.attributes.position;
    const u = src.attributes.uv;
    const n = src.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      uv.push(u.getX(i), u.getY(i));
      nrm.push(n.getX(i), n.getY(i), n.getZ(i));
    }
    for (let i = 0; i < src.index.count; i++) idx.push(src.index.getX(i) + off);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

// --- Ferne Baumlinie ---------------------------------------------------------
//
// Ein Zylindermantel von innen, mit gemaltem Himmel und zwei Silhouetten-
// schichten. Ein Draw-Call für alles, was hinter dem Hain liegt.
//
// `MeshBasicMaterial`: Die Ferne ist nicht beleuchtet und soll es nicht sein –
// sie ist ein Bild. Jede Beleuchtungsrechnung darauf wäre bezahlte Arbeit ohne
// sichtbares Ergebnis, und sie würde die Kulisse mit dem Innenraum
// mitdunkeln, was sie sofort als Tapete entlarvt.
function backdropTexture() {
  const w = 2048;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Himmel: unten dunstig warm (Sonne steht tief im Osten), oben kühl.
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#8fa9bd');
  sky.addColorStop(0.55, '#c8d2d2');
  sky.addColorStop(0.82, '#e6dfcb');
  sky.addColorStop(1, '#cfd2bd');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Drei Baumreihen, von hinten nach vorn dunkler und kleiner. Der
  // Tiefeneindruck einer Kulisse entsteht aus dem **Kontrastunterschied**
  // zwischen den Schichten, nicht aus ihrer Zeichnung – deshalb wird die
  // hinterste in Richtung Himmelsfarbe aufgehellt, statt sie nur zu verkleinern.
  //
  // Gezeichnet werden einzelne Bäume, keine Zickzacklinie. Der erste Anlauf war
  // ein Polygonzug mit gelegentlichen Spitzen; das ergab aus der Nähe eine
  // Reihe gleichschenkliger Dreiecke, die als Pappkulisse zu erkennen war.
  // Überlappende Einzelkronen sind kaum teurer und lesen sich als Wald.
  const treeLine = (colour, baseY, hMin, hMax, step, seed, firChance) => {
    const r = rng(seed);
    ctx.fillStyle = colour;
    for (let x = -step; x <= w + step; x += step * (0.55 + r() * 0.8)) {
      const th = hMin + r() * (hMax - hMin);
      const wd = th * (0.5 + r() * 0.35);
      const y = baseY + (r() - 0.5) * h * 0.03;
      ctx.beginPath();
      if (r() < firChance) {
        // Zeder/Kiefer: schmal und spitz, der Ausreißer nach oben.
        ctx.moveTo(x - wd * 0.42, y);
        ctx.lineTo(x, y - th * 1.45);
        ctx.lineTo(x + wd * 0.42, y);
      } else {
        // Laubkrone: eine Ellipse plus zwei versetzte Buckel, damit die
        // Oberkante nicht als Kreisbogen liest.
        ctx.ellipse(x, y - th * 0.52, wd * 0.5, th * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(x - wd * 0.3, y - th * 0.34, wd * 0.34, th * 0.4, 0, 0, Math.PI * 2);
        ctx.ellipse(x + wd * 0.32, y - th * 0.4, wd * 0.3, th * 0.44, 0, 0, Math.PI * 2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - wd * 0.03, y - th * 0.5, wd * 0.06, th * 0.5);
    }
    // Geschlossener Fuß, damit zwischen den Stämmen kein Himmel durchsteht.
    ctx.fillRect(0, baseY - 2, w, h - baseY + 2);
  };
  treeLine('rgba(150,168,166,0.9)', h * 0.66, h * 0.16, h * 0.3, 54, 0x1234, 0.25);
  treeLine('rgba(92,116,102,0.95)', h * 0.78, h * 0.14, h * 0.26, 38, 0x77aa, 0.3);
  treeLine('rgba(46,64,52,1)', h * 0.9, h * 0.1, h * 0.2, 26, 0xbeef, 0.2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// --- Boden -------------------------------------------------------------------
function groundTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4d5a3c';
  ctx.fillRect(0, 0, size, size);
  const r = rng(0x30ff);
  for (let i = 0; i < 2600; i++) {
    const x = r() * size;
    const y = r() * size;
    const g = 52 + r() * 58;
    ctx.fillStyle = `rgba(${Math.round(g * 0.72)},${Math.round(g)},${Math.round(g * 0.55)},0.5)`;
    ctx.fillRect(x, y, 1 + r() * 3, 1 + r() * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = 4;
  return tex;
}

export function buildExterior() {
  const group = new THREE.Group();
  group.name = 'dojo-exterior';

  // --- Boden ---------------------------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(EXTERIOR.ground.size, EXTERIOR.ground.size);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, EXTERIOR.ground.y, (ROOM.minZ + ROOM.maxZ) / 2);
  // **Lambert statt PBR – für die ganze Außenwelt.**
  //
  // Gemessen kostet die Außenwelt rund ein Fünftel der Frame-Zeit, und der
  // Boden allein etwa 12 % (p50, XR-Stufe). Er ist eine 110-m-Fläche, die durch
  // die Südfront den halben Bildausschnitt füllen kann – also viel Fläche mal
  // teurem Shader.
  //
  // Was PBR dort leistet, ist nichts: Moos hat keine nennenswerte Spiegelung,
  // keine Metallkomponente und keine Rauheitsvariation, die man aus vier Metern
  // Entfernung hinter einem Gitter unterscheiden könnte. Innen bleibt alles
  // beim Standardmaterial – dort liegt der Grund, warum der Raum überhaupt
  // materiell aussieht.
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshLambertMaterial({ map: groundTexture() })
  );
  ground.name = 'dojo-exterior-ground';
  ground.receiveShadow = true;
  group.add(ground);

  // --- Halme ---------------------------------------------------------------
  //
  // Zwei Gruppen, eine Instanz. Die Gruppe im Osten liefert die Schatten auf
  // dem Papier, die im Süden den Blick durch die Front.
  const culms = [];
  const r = rng(0xba3b0);
  for (const patch of [EXTERIOR.grove, EXTERIOR.south]) {
    for (let i = 0; i < patch.count; i++) {
      const x = patch.x0 + r() * (patch.x1 - patch.x0);
      const z = patch.z0 + r() * (patch.z1 - patch.z0);
      const height = 6.2 + r() * 4.6;
      // **Moso-Bambus, nicht Zierbambus.** Der erste Anlauf hatte 3–6 cm
      // Durchmesser; das ist botanisch nicht falsch, aber es ergab
      // Haarlinien vor dem Himmel und einen Schatten, der bei 1,17 cm je
      // Schattentexel auf zwei bis fünf Texel schrumpfte – also genau das, was
      // der weiche Schattenfilter wegmittelt. Moso hat 10–20 cm, und erst damit
      // wird der Schattenriss auf dem Papier eine Linie statt eines Hauchs.
      const radius = 0.055 + r() * 0.042;
      culms.push({
        x,
        z,
        height,
        radius,
        // Leichte Neigung. Ein senkrechter Hain sieht aus wie ein Zaun; die
        // Neigung ist das, was die Schatten auf dem Papier unregelmäßig macht,
        // und **darauf** kommt es an.
        tiltX: (r() - 0.5) * 0.16,
        tiltZ: (r() - 0.5) * 0.16,
        turn: r() * Math.PI,
      });
    }
  }

  // **Durchmischen, damit Ausdünnen gleichmäßig wirkt.**
  //
  // Die XR-Stufe zeichnet nur die ersten `count` Instanzen. In Baureihenfolge
  // stünden das die 46 Halme des Osthains und danach die 26 des Südhains –
  // ausgedünnt verschwände also zuerst der komplette Südhain, und der ist
  // genau der, durch den man von innen hinaussieht. Einmal deterministisch
  // gemischt trifft jede Kürzung beide Gruppen im selben Verhältnis.
  for (let i = culms.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = culms[i];
    culms[i] = culms[j];
    culms[j] = t;
  }

  const culmMesh = new THREE.InstancedMesh(
    culmGeometry(),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      // Von innen sieht man in den offenen Zylinder; ohne beidseitig wäre ein
      // Halm im Gegenlicht ein halber Halm.
      side: THREE.DoubleSide,
    }),
    culms.length
  );
  culmMesh.name = 'dojo-bamboo';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  culms.forEach((c, i) => {
    e.set(c.tiltX, c.turn, c.tiltZ);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(c.x, EXTERIOR.ground.y, c.z),
      q,
      new THREE.Vector3(c.radius, c.height, c.radius)
    );
    culmMesh.setMatrixAt(i, m);
  });
  culmMesh.instanceMatrix.needsUpdate = true;
  culmMesh.castShadow = true;
  culmMesh.receiveShadow = false;
  culmMesh.userData.fullCount = culms.length;
  group.add(culmMesh);

  // --- Blattwerk -----------------------------------------------------------
  // Kleiner und zahlreicher als im ersten Anlauf. Zwei bis drei Büschel von
  // über einem Meter Kantenlänge je Halm lasen sich als Laubbäume, nicht als
  // Bambus – die Silhouette eines Bambushains ist ein *Strichmuster* mit
  // Blattschöpfen obenauf, nicht eine geschlossene Krone.
  const leaves = [];
  for (const c of culms) {
    const bunches = 5 + Math.floor(r() * 4);
    for (let b = 0; b < bunches; b++) {
      const t = 0.68 + r() * 0.3;
      const size = 0.5 + r() * 0.55;
      leaves.push({
        x: c.x + (r() - 0.5) * 0.55,
        y: EXTERIOR.ground.y + c.height * t,
        z: c.z + (r() - 0.5) * 0.55,
        size,
        turn: r() * Math.PI,
      });
    }
  }
  const leafMesh = new THREE.InstancedMesh(
    leafGeometry(),
    new THREE.MeshLambertMaterial({
      map: leafTexture(),
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }),
    leaves.length
  );
  leafMesh.name = 'dojo-bamboo-laub';
  leaves.forEach((l, i) => {
    e.set(0, l.turn, 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(l.size, l.size, l.size));
    leafMesh.setMatrixAt(i, m);
  });
  leafMesh.instanceMatrix.needsUpdate = true;
  leafMesh.castShadow = true;
  leafMesh.receiveShadow = false;
  leafMesh.userData.fullCount = leaves.length;
  group.add(leafMesh);

  // --- Ferne ---------------------------------------------------------------
  const { radius, height } = EXTERIOR.backdrop;
  const backGeo = new THREE.CylinderGeometry(radius, radius, height, 40, 1, true);
  backGeo.translate(0, height / 2 + EXTERIOR.ground.y - 3, (ROOM.minZ + ROOM.maxZ) / 2);
  const backdrop = new THREE.Mesh(
    backGeo,
    new THREE.MeshBasicMaterial({
      map: backdropTexture(),
      side: THREE.BackSide,
      fog: false,
    })
  );
  backdrop.name = 'dojo-backdrop';
  // **Kein `renderOrder: -1` und kein `depthWrite: false`.**
  //
  // Der übliche Himmel-Trick – zuerst zeichnen, keine Tiefe schreiben – ist
  // hier der teuerste Weg: Die Kulisse füllt das ganze Bild, und alles andere
  // zeichnet danach darüber. Das ist volle Überzeichnung für eine Fläche, von
  // der man meist nur Streifen zwischen den Sprossen sieht.
  //
  // Mit normaler Tiefenschreibung sortiert three sie als undurchsichtiges
  // Objekt von vorn nach hinten ein: Wände, Dach und Hain werden vorher
  // gezeichnet, und die Kulisse fällt hinter ihnen im Tiefentest heraus, bevor
  // ihr Fragment-Shader läuft.
  group.add(backdrop);

  return {
    group,
    // Die Halme stehen still. Ein wiegender Bambus wäre schön, würde aber jeden
    // Frame die Instanzmatrizen neu schreiben und – schlimmer – die Schattenkarte
    // jedes Frame ungültig machen. Für eine Kulisse hinter Papier ist das ein
    // schlechter Tausch.
    update() {},
    // Für den Sonnenstand: Wo der Hain steht, muss auch das Schattenfrustum
    // hinreichen. `SUN.shadow.halfExtent` ist darauf ausgelegt; hier wird die
    // Annahme festgehalten, damit sie beim nächsten Verschieben auffällt.
    grovePeak: Math.max(
      Math.abs(EXTERIOR.grove.x1 - SUN.target[0]),
      Math.abs(EXTERIOR.south.z1 - SUN.target[2])
    ),
  };
}
