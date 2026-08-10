import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
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
  // Gedeckter als im ersten Anlauf: 0x9fae5c war Frühlingsgrün und ließ die
  // Halme wie lackierte Strohhalme aussehen.
  const base = new THREE.Color(0x77883f);
  const node = new THREE.Color(0x4e5a2a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / H;
    // Knotenabstand wächst nach oben, wie beim echten Halm.
    const k = Math.abs(Math.sin(Math.pow(y, 0.8) * Math.PI * 7.5));
    c.copy(base).lerp(node, Math.pow(1 - Math.min(1, k * 3), 3) * 0.9);
    // Nach oben etwas heller und gelblicher – Alter und Licht.
    c.lerp(new THREE.Color(0x9daa5e), y * 0.32);
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
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const r = rng(0x5eaf);

  // **Büschel statt Streuung, und weiche Kante.**
  //
  // Der erste Anlauf verteilte 90 Blattellipsen gleichmäßig über die Kachel.
  // Ergebnis: eine Fläche, deren Alphakante mit der Rechteckkante der Ebene
  // zusammenfiel – man sah das Billboard als Billboard. Bambusblätter wachsen
  // aber in **Büscheln an Zweigenden**, und ein Büschel ist in der Mitte dicht
  // und läuft nach außen aus. Genau diese Dichteverteilung ist es, die aus
  // zwei gekreuzten Rechtecken eine Pflanze macht.
  const bunch = (cx, cy, n, scale, base) => {
    for (let i = 0; i < n; i++) {
      // Länge nach außen abnehmend, Winkel gefächert nach unten
      const t = i / n;
      const a = -Math.PI / 2 + (r() - 0.5) * 2.4;
      const len = size * scale * (0.5 + r() * 0.55) * (1 - t * 0.35);
      const wid = Math.max(1.4, len * 0.075);
      const g = base + r() * 46;
      ctx.save();
      ctx.translate(cx + (r() - 0.5) * size * scale * 0.5, cy + (r() - 0.5) * size * scale * 0.5);
      ctx.rotate(a);
      ctx.fillStyle = `rgb(${Math.round(g * 0.52)},${Math.round(g)},${Math.round(g * 0.42)})`;
      // Lanzettliches Blatt: zwei Bögen zur Spitze, nicht eine Ellipse.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(wid, len * 0.45, 0, len);
      ctx.quadraticCurveTo(-wid, len * 0.45, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  };

  bunch(size * 0.5, size * 0.72, 46, 0.3, 108);
  bunch(size * 0.27, size * 0.55, 30, 0.24, 122);
  bunch(size * 0.73, size * 0.58, 30, 0.24, 96);
  bunch(size * 0.5, size * 0.36, 24, 0.2, 132);

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
  const h = 640;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // **Luftperspektive statt Silhouetten.**
  //
  // Der erste Anlauf zeichnete drei Reihen einzelner Bäume, von hinten nach
  // vorn dunkler. Das war als Beschreibung richtig und als Bild falsch: Aus
  // dreißig Metern liest man keine Baumkronen, man liest **Ebenen**. Und was
  // eine Ferne fern aussehen lässt, ist nicht ihre Zeichnung, sondern dass sie
  // mit dem Abstand ihren Kontrast verliert und zur Himmelsfarbe hin
  // ausbleicht. Die alte Kulisse hatte auf allen drei Ebenen denselben harten
  // Rand – deshalb sah sie aus wie ausgeschnittenes Papier.
  //
  // Jetzt vier Hügelzüge mit weicher Kante, jeder blasser und blauer als der
  // davor, dazwischen Dunstbänder. Gezeichnet wird nur noch die Kammlinie.
  const SKY_TOP = [126, 158, 184];
  const SKY_LOW = [214, 214, 200];
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `rgb(${SKY_TOP.join(',')})`);
  sky.addColorStop(0.62, '#c3ccca');
  sky.addColorStop(0.88, `rgb(${SKY_LOW.join(',')})`);
  sky.addColorStop(1, '#c6c6b4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Ein Hügelzug: eine Kammlinie aus überlagerten Sinuswellen, darunter voll
  // gefüllt. Mehrere Wellen unterschiedlicher Länge ergeben eine Linie, die
  // weder wie ein Sinus noch wie ein Zickzack aussieht – das ist der ganze
  // Trick an einer glaubwürdigen Bergsilhouette.
  const ridge = (baseY, amp, colour, blur, seed) => {
    const r = rng(seed);
    const ph = [r() * 9, r() * 9, r() * 9, r() * 9];
    ctx.save();
    ctx.filter = `blur(${blur}px)`;
    ctx.fillStyle = colour;
    // **Über den Rand hinaus zeichnen.** `ctx.filter = blur()` tastet außerhalb
    // der Leinwand als *durchsichtig* ab: An x = 0 und x = w entsteht dadurch
    // ein aufgehellter Streifen, und beim Kacheln treffen sich die beiden zu
    // einer hellen senkrechten Linie mitten in der Ferne. Genau die hat der
    // Kritiker als Tapetennaht gemeldet – und sie blieb, nachdem die
    // Frequenzen längst ganzzahlig waren, weil sie nie an den Frequenzen lag.
    //
    // Die Kammfunktion ist in u periodisch, lässt sich also gefahrlos über
    // beide Ränder hinaus fortsetzen; die Weichzeichnung bekommt damit auf
    // beiden Seiten echten Inhalt.
    const OVER = w * 0.12;
    ctx.beginPath();
    ctx.moveTo(-OVER, h);
    for (let x = -OVER; x <= w + OVER; x += 6) {
      const u = (x / w) * Math.PI * 2;
      // **Nur ganzzahlige Frequenzen.** 2,3 · 4,7 · 9,1 sahen als Kammlinie
      // besser aus, kachelten aber nicht: Die Textur läuft einmal um den
      // Zylinder, und wo u = 0 auf u = 1 trifft, sprang die Linie um mehrere
      // Pixel. Genau diese senkrechte Naht mitten im Bild hat die ganze Ferne
      // als Tapete verraten. Ganzzahlige Vielfache schließen sich exakt.
      const y =
        baseY -
        amp *
          (0.52 * Math.sin(u * 1 + ph[0]) +
            0.3 * Math.sin(u * 2 + ph[1]) +
            0.14 * Math.sin(u * 5 + ph[2]) +
            0.08 * Math.sin(u * 9 + ph[3]));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w + OVER, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // Von hinten nach vorn. Die Mischung zur Himmelsfarbe ist der Kern: Die
  // hinterste Kette liegt bei 78 % Himmel, die vorderste bei 12 %.
  // Kräftiger als im ersten Anlauf: Mit 0,78 Dunst auf einem ohnehin hellen
  // Grün war die hinterste Kette praktisch unsichtbar und die Ferne ein
  // gleichmäßiger heller Nebel ohne Staffelung.
  const base = [34, 52, 41];
  const layers = [
    [h * 0.42, h * 0.15, 0.66, 7],
    [h * 0.56, h * 0.13, 0.46, 5],
    [h * 0.7, h * 0.11, 0.26, 3.5],
    [h * 0.84, h * 0.09, 0.07, 2],
  ];
  layers.forEach(([y, amp, haze, blur], i) => {
    const c = base.map((v, k) => Math.round(v * (1 - haze) + SKY_LOW[k] * haze));
    ridge(y, amp, `rgb(${c.join(',')})`, blur, 0x1234 + i * 977);
    // Dunstband am Fuß jeder Kette – dadurch sitzen die Ketten nicht
    // aufeinander, sondern stehen hintereinander.
    const g = ctx.createLinearGradient(0, y - amp * 0.2, 0, y + h * 0.1);
    g.addColorStop(0, `rgba(${SKY_LOW.join(',')},0)`);
    g.addColorStop(1, `rgba(${SKY_LOW.join(',')},${0.34 - i * 0.07})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, y - amp * 0.2, w, h * 0.1 + amp);
  });

  // Bewaldeter Vordergrundsaum: dunkel, feingezackt, ohne Dunst. Er schließt
  // die Kulisse nach unten ab, wo sie auf die Wiese trifft.
  // Der Saum lag zuerst bei 90 % Höhe mit harter Oberkante – von innen las er
  // sich als grüne Mauer hinter dem Bambus. Tiefer und mit weicher Kante ist er
  // das, was er sein soll: der Waldrand, an dem die Wiese aufhört.
  const r = rng(0xbeef);
  ctx.save();
  ctx.filter = 'blur(2px)';
  ctx.fillStyle = 'rgb(52,66,52)';
  ctx.beginPath();
  ctx.moveTo(-70, h);
  const saum = [];
  for (let x = 0; x <= w; x += 11) saum.push(r());
  saum[saum.length - 1] = saum[0]; // schließt die Kachel
  // Dieselbe Überzeichnung wie oben: eine Kachelbreite links und rechts
  // fortgesetzt, damit die 2-px-Weichzeichnung nicht in den leeren Rand greift.
  for (let k = -6; k < saum.length + 6; k++) {
    const kk = ((k % (saum.length - 1)) + saum.length - 1) % (saum.length - 1);
    ctx.lineTo(k * 11, h * 0.955 - saum[kk] * h * 0.035);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

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
function blobGeometry(detail, seed, squash) {
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

// --- Der Garten vor dem Eingang ---------------------------------------------
//
// **Vier Zeichenaufrufe für einen ganzen Garten**, und das ist der eigentliche
// Entwurf hier. Laterne, Wasserbecken, Ahornstamm und Kiesbeeteinfassung sind
// verschiedene Dinge aus verschiedenem Material – aber alle sind statisch,
// undurchsichtig und rau. Sie werden deshalb zu **einem** Netz verschmolzen und
// unterscheiden sich nur in der Vertexfarbe. Dasselbe Verfahren wie bei den
// Requisiten drinnen (props.js), aus demselben Grund: Ein Garten aus zwölf
// Einzelobjekten wären zwölf Draw-Calls plus zwölf im Schattendurchgang.
//
// Trittsteine und Blattwerk bleiben Instanzen, weil sie das sind, wofür es
// Instanzen gibt: dieselbe Form, vielfach verteilt.
function gardenPieces(r) {
  const solids = []; // { geo, color }
  const push = (geo, color) => solids.push({ geo, color });

  const G = EXTERIOR.garden;
  const y0 = EXTERIOR.ground.y;
  const midZ = (G.z0 + G.z1) / 2;

  // Kiesbeet-Einfassung: vier flache Balken, die das geharkte Feld rahmen.
  // Ohne Kante zerläuft eine Kiesfläche zu einem hellen Fleck im Gras.
  const edge = 0.14;
  for (const [w, d, x, z] of [
    [G.halfX * 2, edge, 0, G.z0],
    [G.halfX * 2, edge, 0, G.z1],
    [edge, G.z1 - G.z0, -G.halfX, midZ],
    [edge, G.z1 - G.z0, G.halfX, midZ],
  ]) {
    push(new THREE.BoxGeometry(w, 0.12, d).translate(x, y0 + 0.06, z), 0x453f36);
  }

  // Kasuga-Laterne. Sechs Teile von unten nach oben – Sockel, Schaft,
  // Zwischenplatte, Feuerkorb, Dach, Knauf. Die Proportionen sind das, was eine
  // Steinlaterne von einem Stapel Zylinder unterscheidet: schlanker Schaft,
  // breit auskragendes Dach.
  // Auf die Türachse zugerückt. Im ersten Bau standen Laterne, Becken und Ahorn
  // so weit außen, dass durch den 2,5 m breiten Durchgang **nichts** davon zu
  // sehen war – ein Garten, den man nur auf Screenshots von außen findet, ist
  // kein Garten. Der Blick durch eine Tür ist ein enger Kegel; was wirken soll,
  // muss hinein.
  const lx = -1.85;
  const lz = G.z0 + 1.25;
  const lantern = [
    [new THREE.CylinderGeometry(0.3, 0.34, 0.14, 8), 0.07],
    [new THREE.CylinderGeometry(0.09, 0.11, 0.92, 8), 0.6],
    [new THREE.CylinderGeometry(0.27, 0.2, 0.11, 8), 1.115],
    [new THREE.CylinderGeometry(0.21, 0.23, 0.36, 6), 1.35],
    [new THREE.CylinderGeometry(0.06, 0.46, 0.26, 6), 1.66],
    [new THREE.SphereGeometry(0.085, 8, 6), 1.85],
  ];
  // Verwitterter Granit, nicht Gips. 0x9a978d war unter dieser Sonne strahlend
  // weiß – die Laterne sah aus wie aus Kunststoff gegossen und war der hellste
  // Gegenstand im ganzen Garten.
  for (const [geo, y] of lantern) push(geo.translate(lx, y0 + y, lz), 0x5f5d57);

  // Tsukubai: das niedrige Wasserbecken, an dem man sich die Hände wäscht.
  const bx = 1.9;
  const bz = G.z0 + 0.75;
  push(new THREE.CylinderGeometry(0.32, 0.36, 0.3, 10).translate(bx, y0 + 0.15, bz), 0x565349);
  // Wasserspiegel: eine Scheibe knapp unter der Beckenkante.
  push(new THREE.CylinderGeometry(0.26, 0.26, 0.01, 12).translate(bx, y0 + 0.29, bz), 0x39505a);
  // Bambusrohr, das darüber hängt.
  const spout = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6);
  spout.rotateX(Math.PI / 2);
  push(spout.translate(bx, y0 + 0.62, bz - 0.34), 0x8a8148);
  push(
    new THREE.CylinderGeometry(0.045, 0.05, 0.85, 6).translate(bx, y0 + 0.42, bz - 0.6),
    0x767041
  );

  // Ahorn: Stamm, zwei Äste und eine Krone aus fünf Körpern. Steht seitlich,
  // nicht in der Achse – ein Baum genau vor dem Eingang würde den Blick
  // zumachen, den er rahmen soll.
  const tx = -2.95;
  const tz = G.z1 - 0.5;
  const trunk = new THREE.CylinderGeometry(0.09, 0.17, 2.9, 7);
  trunk.rotateZ(-0.09);
  push(trunk.translate(tx, y0 + 1.45, tz), 0x5c4b3c);
  for (const [ang, len, tilt] of [
    [0.5, 1.25, 0.75],
    [-1.9, 1.05, 0.62],
  ]) {
    const br = new THREE.CylinderGeometry(0.035, 0.07, len, 6);
    br.rotateZ(tilt);
    br.rotateY(ang);
    push(br.translate(tx + Math.cos(ang) * 0.35, y0 + 2.35, tz + Math.sin(ang) * 0.35), 0x5c4b3c);
  }

  // Krone: fünf abgeplattete Körper, ineinandergeschoben. Ein Ahorn hat eine
  // **schirmförmige** Krone – breiter als hoch, unten flach. Fünf Kugeln
  // gleicher Größe wären ein Traubenbündel; die Staffelung nach außen und unten
  // ist das, was die Silhouette macht.
  //
  // Kleiner und deutlich gedeckter als im ersten Anlauf. Der war 1,35 m im
  // Radius und feuerorange – durch die Tür gesehen ein leuchtender Klecks, der
  // alles andere erschlug. Ein Herbstahorn ist tief karminrot bis braun; das
  // Feuerorange kommt aus Fotografien mit Gegenlicht, nicht aus dem Baum.
  for (const [dx, dy, dz, rad, sq, col] of [
    // Dritter Anlauf bei der Farbe. Auch 0x8d3324 war unter dieser Sonne noch
    // ein leuchtender Klecks – der Ahorn zog durch die Türöffnung mehr Blick auf
    // sich als alles andere im Garten zusammen. Ein Herbstahorn im Schatten
    // eines Hains ist tief weinrot bis rostbraun.
    [0, 0.55, 0, 0.88, 0.6, 0x571f14],
    [-0.62, 0.3, 0.2, 0.66, 0.55, 0x632918],
    [0.66, 0.34, -0.16, 0.6, 0.55, 0x481a11],
    [0.12, 0.22, 0.6, 0.56, 0.5, 0x6d3319],
    [-0.16, 0.9, -0.3, 0.5, 0.58, 0x7b4020],
  ]) {
    const crown = blobGeometry(2, 0x51 + Math.round(dx * 97 + dz * 13), sq);
    crown.scale(rad, rad, rad);
    push(crown.translate(tx + dx, y0 + 2.45 + dy, tz + dz), col);
  }

  return { solids, lantern: [lx, lz], maple: [tx, tz], basin: [bx, bz] };
}

// Geharkter Kies. Die Rillen sind eine Textur, keine Geometrie – aus zwei
// Metern Entfernung durch eine Türöffnung ist der Unterschied nicht zu sehen,
// und echte Rillen wären ein paar tausend Dreiecke für ein Streifenmuster.
function gravelTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Deutlich dunkler als der erste Anlauf (#c9c4b4). Ein Kiesbeet in der Sonne
  // wurde damit zur hellsten Fläche im ganzen Bild – heller als das Washi,
  // durch das die Sonne scheint. Ein Garten, der die Front überstrahlt, zieht
  // den Blick auf den Boden statt nach draußen.
  ctx.fillStyle = '#6f6a60';
  ctx.fillRect(0, 0, size, size);
  const r = rng(0x9a17);
  for (let i = 0; i < 5200; i++) {
    const g = 92 + r() * 40;
    ctx.fillStyle = `rgba(${g},${Math.round(g * 0.99)},${Math.round(g * 0.92)},0.55)`;
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  // Harkspuren als weiche Wellenlinien
  for (let i = 0; i < 16; i++) {
    const y = (i / 16) * size;
    ctx.strokeStyle = 'rgba(74,71,64,0.6)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      const yy = y + Math.sin((x / size) * Math.PI * 2 + i) * 2.4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  return tex;
}

function buildGarden(group, r) {
  const G = EXTERIOR.garden;
  const y0 = EXTERIOR.ground.y;

  // --- Kiesfläche ----------------------------------------------------------
  const gravelGeo = new THREE.PlaneGeometry(G.halfX * 2 - 0.1, G.z1 - G.z0 - 0.1);
  gravelGeo.rotateX(-Math.PI / 2);
  gravelGeo.translate(0, y0 + 0.055, (G.z0 + G.z1) / 2);
  const gravel = new THREE.Mesh(
    gravelGeo,
    new THREE.MeshLambertMaterial({ map: gravelTexture() })
  );
  gravel.name = 'dojo-garden-kies';
  gravel.receiveShadow = true;
  group.add(gravel);

  // --- Feste Teile, ein Netz ------------------------------------------------
  const { solids, lantern, maple } = gardenPieces(r);
  const tinted = solids.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const p = g.attributes.position;
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // Feine Streuung je Vertex: Ein Stein aus einer einzigen Farbe sieht aus
      // wie Plastik, und im Gegenlicht ist genau das der Unterschied.
      const f = 0.9 + ((i * 37) % 17) / 80;
      arr[i * 3] = c.r * f;
      arr[i * 3 + 1] = c.g * f;
      arr[i * 3 + 2] = c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  });
  const solid = new THREE.Mesh(
    mergeGeometries(tinted, false),
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  solid.name = 'dojo-garden-stein';
  solid.castShadow = true;
  solid.receiveShadow = true;
  group.add(solid);

  // --- Trittsteine und Findlinge -------------------------------------------
  //
  // Ein Weg, der vom Eingang zum Wasserbecken und weiter zur Laterne führt.
  // Trittsteine liegen nicht auf einer Linie – die leichte Versetzung ist das,
  // was sie als Weg lesbar macht statt als Fliesenreihe.
  const stoneGeo = new THREE.CylinderGeometry(0.5, 0.44, 0.12, 7);
  const stones = [];
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    stones.push({
      x: Math.sin(t * 2.6) * 1.9 + (r() - 0.5) * 0.22,
      y: y0 + 0.06,
      z: G.z0 - 0.5 + t * (G.z1 - G.z0 - 0.6),
      ry: r() * Math.PI,
      scale: [0.62 + r() * 0.2, 1, 0.5 + r() * 0.18],
    });
  }
  // Findlinge: dieselbe Form, deutlich größer und tiefer eingegraben.
  for (const [x, z, s] of [
    [lantern[0] + 1.0, lantern[1] + 0.45, 1.15],
    [-1.9, G.z1 - 0.5, 0.95],
    [maple[0] + 1.1, maple[1] - 0.7, 0.8],
  ]) {
    stones.push({ x, y: y0 + 0.08, z, ry: r() * Math.PI, scale: [s, 2.2 * s, s * 0.85] });
  }
  const stoneMesh = new THREE.InstancedMesh(
    stoneGeo,
    new THREE.MeshLambertMaterial({ color: 0x4f4c45 }),
    stones.length
  );
  stoneMesh.name = 'dojo-garden-trittsteine';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  stones.forEach((s, i) => {
    q.setFromEuler(new THREE.Euler(0, s.ry, 0));
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(...s.scale));
    stoneMesh.setMatrixAt(i, m);
  });
  stoneMesh.instanceMatrix.needsUpdate = true;
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  group.add(stoneMesh);

  // --- Formschnitt-Polster (Karikomi) --------------------------------------
  //
  // Die geschnittenen Azaleenpolster sind das, was einen japanischen Garten
  // von einem Beet unterscheidet: ruhige, geschlossene Kuppeln, in Gruppen
  // gesetzt, mit Zwischenraum. Nicht Streuung, sondern **Anordnung**.
  //
  // Deshalb liegen sie hier nicht zufällig verteilt, sondern in vier Gruppen
  // von je zwei bis vier Polstern, mit klarer Größenstaffelung innerhalb der
  // Gruppe. Zufälliges Verteilen war genau das, was vorher wie Unkraut aussah.
  // Vier gedeckte Grüntöne. Ein Formschnitt-Beet ist nicht einfarbig, aber die
  // Spannweite ist klein – große Farbunterschiede lesen sich als verschiedene
  // Pflanzen, nicht als ein Beet.
  const AZALEA = [0x1c3218, 0x24401d, 0x172c16, 0x2b4a22];
  const mounds = [];
  const clumps = [
    [-G.halfX - 1.1, G.z0 + 0.4, 4],
    [G.halfX + 1.0, G.z0 + 1.9, 3],
    [-1.9, G.z1 + 0.75, 3],
    [2.6, G.z1 + 0.95, 2],
    [G.halfX + 1.3, G.z1 - 0.4, 2],
  ];
  for (const [cx, cz, n] of clumps) {
    for (let k = 0; k < n; k++) {
      // Größte Kuppel in der Mitte, die kleineren daneben – eine Gruppe aus
      // gleich großen Kugeln liest sich als Eierkarton.
      const fall = 1 - k / (n + 0.6);
      const rad = (0.42 + r() * 0.3) * (0.55 + fall * 0.75);
      mounds.push({
        x: cx + (r() - 0.5) * 1.5,
        y: y0 + rad * 0.42,
        z: cz + (r() - 0.5) * 1.1,
        rad,
        ry: r() * Math.PI,
        // **Feste Farben statt setHSL.**
        //
        // Zweimal zu hell geraten, und beim zweiten Mal war die Ursache nicht
        // der Wert, sondern die Funktion: `Color.setHSL()` legt seine Argumente
        // standardmäßig im **linearen Arbeitsraum** aus, nicht in sRGB. Eine
        // Helligkeit von 0,10 wird damit zu sRGB 0,35 – aus dem dunklen
        // Azaleengrün wurde Wiesengrün, und zwar reproduzierbar, egal wie oft
        // ich die Zahl gesenkt habe.
        //
        // Hexwerte sind eindeutig sRGB und lassen diese Verwechslung nicht zu.
        col: new THREE.Color(AZALEA[Math.floor(r() * AZALEA.length)]),
      });
    }
  }
  const moundMesh = new THREE.InstancedMesh(
    blobGeometry(2, 0x7c3, 0.62),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    mounds.length
  );
  moundMesh.name = 'dojo-garden-polster';
  mounds.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, f.ry, 0));
    m.compose(
      new THREE.Vector3(f.x, f.y, f.z),
      q,
      new THREE.Vector3(f.rad * 1.25, f.rad, f.rad * 1.15)
    );
    moundMesh.setMatrixAt(i, m);
    moundMesh.setColorAt(i, f.col);
  });
  moundMesh.instanceMatrix.needsUpdate = true;
  if (moundMesh.instanceColor) moundMesh.instanceColor.needsUpdate = true;
  moundMesh.castShadow = true;
  moundMesh.receiveShadow = true;
  moundMesh.userData.fullCount = mounds.length;
  group.add(moundMesh);
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
    const bunches = 8 + Math.floor(r() * 5);
    for (let b = 0; b < bunches; b++) {
      const t = 0.68 + r() * 0.3;
      const size = 0.72 + r() * 0.7;
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
  // **Höher und tiefer angesetzt.** Der obere Rand des Mantels lag zuvor im
  // Blickfeld und zeichnete einen Bogen quer über den Himmel – man sah der
  // Kulisse an, dass sie ein Zylinder ist. Jetzt reicht sie weit über den
  // Horizont hinaus und beginnt deutlich unter dem Boden.
  const backGeo = new THREE.CylinderGeometry(radius, radius, height, 40, 1, true);
  backGeo.translate(0, height / 2 + EXTERIOR.ground.y - 9, (ROOM.minZ + ROOM.maxZ) / 2);
  const backdrop = new THREE.Mesh(
    backGeo,
    new THREE.MeshBasicMaterial({
      map: backdropTexture(),
      side: THREE.BackSide,
      fog: false,
    })
  );
  backdrop.name = 'dojo-backdrop';
  buildGarden(group, r);
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
