import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { EXTERIOR, ROOM, SUN } from './layout.js';
import { gravelMaterial, waterMaterial, updateWater, wetStoneOverlay } from './ground.js';
import { graniteMaterial, boxProjectUV, mossPatina } from './stonework.js';
import {
  leafAtlas,
  cardCluster,
  foliageMaterial,
  applyFoliageMaterial,
  blobGeometry,
  branchInto,
  updateFoliage,
} from './foliage.js';

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
// --- Nichts von draußen gehört nach drinnen ----------------------------------
//
// Gemessen war es das hier: 66 von 699 Bambusschöpfen standen bis zu 2,6 m
// durch die Ostwand im Raum, dazu acht Polster und zwölf Kartenbüschel, die an
// der Südwand beginnen – die Seitenreihen der Bepflanzung setzen bei
// z = G.z0 − 1,4 an, und das ist genau die Wandebene.
//
// Am Bild findet man das kaum. Ein Blatt, das durch die Wand hereinsteht, sieht
// man nur, wenn man zufällig hinschaut, und ein Polster hinter der Südwand gar
// nicht – bis man daran vorbeigeht und es plötzlich im Raum steht.
//
// **Warum eine Prüfung und keine neuen Koordinaten.** Den Hain weiter nach
// Osten zu schieben hätte den Grund beseitigt, aus dem er dort steht: Er wirft
// die Schatten auf das Papier der Ostfront. Und neue Zahlen halten nur bis zur
// nächsten Änderung an einem Radius – die Schöpfe sind ja gerade erst größer
// geworden, und *das* hat den Fehler überhaupt erzeugt. Die Prüfung greift
// dagegen bei jeder künftigen Größenänderung von selbst.
//
// Der Abstand rechnet mit der **Ausdehnung** der Pflanze, nicht mit ihrem
// Mittelpunkt. Ein Schopf von zwei Metern Radius, dessen Mitte einen Meter vor
// der Wand sitzt, steht trotzdem im Raum.
const ROOM_KEEPOUT = 0.25;

function intrudesRoom(x, z, halfX, halfZ = halfX) {
  return (
    x + halfX > ROOM.minX - ROOM_KEEPOUT &&
    x - halfX < ROOM.maxX + ROOM_KEEPOUT &&
    z + halfZ > ROOM.minZ - ROOM_KEEPOUT &&
    z - halfZ < ROOM.maxZ + ROOM_KEEPOUT
  );
}

function culmGeometry() {
  const H = 1; // Einheitshöhe, die Instanz skaliert
  // Zehn statt 26 Ringe. Ein Halm ist eine gerade, leicht verjüngte Stange –
  // die Ringe tragen nur den Farbverlauf der Knoten, nicht die Silhouette.
  // Bei 108 Halmen sind das 20 000 Dreiecke Unterschied.
  const RINGS = 10;
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
// Die gemalte Blattkarte und die zwei gekreuzten Flächen, die hier standen,
// sind ersatzlos entfallen: Bambuslaub kommt jetzt aus dem Blattatlas in
// foliage.js und wird als Kartenbüschel gebaut. Der alte Weg war vier
// Dreiecke je Schopf und damit sehr billig, aber aus der Nähe sah man genau
// das – zwei Rechtecke mit einem grellgrünen Stern darauf.

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
  // **Scharfe Gipfel, runde Täler – Sinuswellen haben es genau andersherum.**
  //
  // Der erste Anlauf legte vier Sinuswellen übereinander. Das ergibt eine
  // glaubwürdige *Hügel*linie, und genau das war das Problem: weiche Kuppen und
  // spitze Einschnitte, also englische Downs. Ein japanischer Bergzug macht es
  // umgekehrt – steile Gipfel, breite bewaldete Flanken, V-Täler, die im Dunst
  // absaufen.
  //
  // Der übliche Weg dahin ist eine *ridged*-Funktion: `1 − |sin|` statt `sin`.
  // `|sin|` hat spitze Minima, die Umkehrung also spitze Maxima. Über fünf
  // Oktaven mit halbierter Amplitude wird daraus eine Kammlinie, die weder
  // periodisch noch zufällig aussieht. Der Rechenaufwand ist derselbe.
  //
  // Die Frequenzen bleiben **ganzzahlig** – die Textur läuft einmal um den
  // Zylinder, und eine gebrochene Frequenz springt bei u = 0 sichtbar. Das hat
  // in einer früheren Runde eine Tapetennaht mitten in der Ferne gekostet.
  const OKTAVEN = [1, 2, 3, 5, 9];
  const kamm = (u, ph) => {
    let v = 0;
    let amp = 1;
    let summe = 0;
    for (let o = 0; o < OKTAVEN.length; o++) {
      v += amp * (1 - Math.abs(Math.sin(u * OKTAVEN[o] + ph[o])));
      summe += amp;
      amp *= 0.52;
    }
    return v / summe;
  };

  const ridge = (baseY, amp, colour, blur, seed, zacken = 0, gipfelU = null) => {
    const r = rng(seed);
    const ph = [r() * 9, r() * 9, r() * 9, r() * 9, r() * 9];
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
          (kamm(u, ph) +
            // Ein beherrschender Gipfel je Kette. Ohne ihn ist die Linie
            // gleichmäßig unruhig, und gleichmäßige Unruhe liest sich als
            // Rauschen. Ein Bergzug hat einen höchsten Punkt.
            (gipfelU === null ? 0 : 0.85 * Math.exp(-(((u - gipfelU) / 0.42) ** 2))) +
            // Bewaldete Kante: Japanische Berge sind bis zum Grat bewaldet, die
            // Silhouette ist deshalb feinzackig und nicht glatt. Nur auf den
            // vorderen Ketten – hinten frisst der Dunst es ohnehin.
            zacken * (1 - Math.abs(Math.sin(u * 61 + ph[4]))));
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
  // Sechs Ketten statt vier. Die Staffelung trägt die Tiefe – das „Meer aus
  // Graten" ist die Gattung, nicht die einzelne Linie.
  const base = [34, 52, 41];
  // [Grundhöhe, Amplitude, Dunstanteil, Weichzeichnung, Zackenanteil, Gipfel]
  const layers = [
    [h * 0.34, h * 0.17, 0.72, 8, 0, 1.1],
    [h * 0.45, h * 0.15, 0.6, 6.5, 0, null],
    [h * 0.56, h * 0.13, 0.46, 5, 0, 4.3],
    [h * 0.66, h * 0.12, 0.32, 4, 0.05, null],
    [h * 0.76, h * 0.1, 0.19, 3, 0.07, 2.6],
    [h * 0.85, h * 0.085, 0.07, 2, 0.09, null],
  ];
  layers.forEach(([y, amp, haze, blur, zacken, gipfel], i) => {
    const c = base.map((v, k) => Math.round(v * (1 - haze) + SKY_LOW[k] * haze));
    ridge(y, amp, `rgb(${c.join(',')})`, blur, 0x1234 + i * 977, zacken, gipfel);
    // **Dunst in den Tälern, nicht am Fuß.**
    //
    // Vorher lag unter jeder Kette ein gleichmäßiges Band; die Ketten standen
    // damit hintereinander, aber jede blieb eine geschlossene Silhouette. Was
    // eine japanische Bergferne ausmacht, ist der Nebel, der die Einschnitte
    // füllt und die Grate stehen lässt.
    //
    // Erreicht wird das über die **Lage**: Das Band sitzt jetzt auf der
    // mittleren Kammhöhe statt darunter. Alles unterhalb – also die Täler –
    // verschwindet darin, die Gipfel ragen heraus.
    const bandMitte = y - amp * 0.35;
    const g = ctx.createLinearGradient(0, bandMitte - amp * 0.55, 0, bandMitte + amp * 1.5);
    g.addColorStop(0, `rgba(${SKY_LOW.join(',')},0)`);
    g.addColorStop(0.45, `rgba(${SKY_LOW.join(',')},${(0.44 - i * 0.055).toFixed(3)})`);
    g.addColorStop(1, `rgba(${SKY_LOW.join(',')},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, bandMitte - amp * 0.55, w, amp * 2.05);
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


// --- Der Garten vor dem Eingang ---------------------------------------------
//
// **Klein, dicht, und nach hinten zu.**
//
// Der erste Garten war eine Kiesfläche mit ein paar Gegenständen darauf und
// freiem Blick auf eine gemalte Ferne. Das hatte zwei Probleme, die sich
// gegenseitig verstärkten: Der Blick lief bis zum Horizont, also musste der
// Horizont überzeugen – und weil er das als Textur nie ganz kann, fiel der
// ganze Garten mit ihm.
//
// Ein japanischer Hofgarten (Tsuboniwa) löst das anders herum: Er ist **klein
// und geschlossen**. Was man sieht, endet nach fünf Metern in einer grünen
// Wand. Damit wandert das gesamte Qualitätsbudget von einer 90-m-Landschaft in
// einen 11 × 5 m großen Ausschnitt, den man aus vier Metern betrachtet – und
// genau dort ist Dichte bezahlbar.
//
// Drei Pflanzschichten schließen den Blick von unten nach oben:
//   1. Farne und Gräser am Boden, zwischen und vor den Steinen
//   2. eine Bank aus Formschnitt-Polstern, nach hinten größer werdend
//   3. Großsträucher und Baumkronen, die den oberen Bildrand füllen
// Dahinter erst der Bambushain. Der Horizont ist damit aus dem Türblick
// verschwunden, ohne dass er entfernt werden musste.
//
// **Zeichenlast.** Alles Feste – Laterne, Becken, Stämme, Äste, Einfassung –
// bleibt ein einziges verschmolzenes Netz mit Vertexfarben. Dazu drei
// Instanzen (Polster, Farne, Trittsteine) und zwei Flächen (Kies, Moos).

// Ein Farnwedel: fünf bis neun Blätter, fächerförmig aus einem Punkt, jedes
// nach außen gebogen. Als Geometrie und nicht als Alphakarte – bei einem
// Gegenstand, der einen halben Meter vor dem Betrachter steht, ist die
// Rechteckkante eines Billboards das Erste, was man sieht.
function frondGeometry(seed) {
  const r = rng(seed);
  const parts = [];
  const blades = 6 + Math.floor(r() * 4);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + r() * 0.4;
    const lean = 0.5 + r() * 0.5; // wie stark der Wedel nach außen kippt
    const len = 0.7 + r() * 0.5;
    const SEG = 5;
    const pos = [];
    const idx = [];
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      // Bogen: steigt an, kippt dann nach außen ab
      const y = Math.sin(t * 1.35) * len * (1 - lean * 0.45);
      const rad = t * len * lean;
      const half = 0.055 * (1 - t * 0.85) * (t < 0.12 ? t / 0.12 : 1);
      const cx = Math.cos(a) * rad;
      const cz = Math.sin(a) * rad;
      // Blattbreite quer zur Wuchsrichtung
      pos.push(cx - Math.sin(a) * half, y, cz + Math.cos(a) * half);
      pos.push(cx + Math.sin(a) * half, y, cz - Math.cos(a) * half);
      if (s > 0) {
        const o = (s - 1) * 2;
        idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  return merged;
}

function gardenPieces(r) {
  const solids = []; // { geo, color }
  const push = (geo, color) => solids.push({ geo, color });

  const G = EXTERIOR.garden;
  const y0 = EXTERIOR.ground.y;
  const midZ = (G.z0 + G.z1) / 2;

  // Kiesbeet-Einfassung: flache Kantensteine statt eines Rahmens aus Balken.
  // Der Balkenrahmen las sich als Wanne, die auf dem Rasen steht; eine Reihe
  // gesetzter Steine ist das, was ein Beet in einem japanischen Garten
  // tatsächlich begrenzt – und sie darf unregelmäßig sein.
  for (const [along, fixed, isX] of [
    [G.halfX, G.z0, true],
    [G.halfX, G.z1, true],
  ]) {
    for (let t = -along; t <= along; t += 0.42) {
      const w = 0.34 + r() * 0.2;
      const g = new THREE.BoxGeometry(w, 0.16 + r() * 0.07, 0.2 + r() * 0.08);
      g.rotateY((r() - 0.5) * 0.3);
      g.translate(isX ? t : fixed, y0 + 0.05, isX ? fixed : t);
      push(g, 0x4a463d);
    }
  }
  for (const side of [-1, 1]) {
    for (let z = G.z0; z <= G.z1; z += 0.42) {
      const g = new THREE.BoxGeometry(0.2 + r() * 0.08, 0.16 + r() * 0.07, 0.34 + r() * 0.2);
      g.rotateY((r() - 0.5) * 0.3);
      g.translate(side * G.halfX, y0 + 0.05, z);
      push(g, 0x4a463d);
    }
  }

  // Kasuga-Laterne.
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
  for (const [geo, y] of lantern) push(geo.translate(lx, y0 + y, lz), 0x5f5d57);

  // Tsukubai: das niedrige Wasserbecken.
  const bx = 1.9;
  const bz = G.z0 + 0.75;
  push(new THREE.CylinderGeometry(0.32, 0.36, 0.3, 10).translate(bx, y0 + 0.15, bz), 0x565349);
  // Die Wasserfläche steckte hier als dunkelgraue Scheibe im selben
  // verschmolzenen Netz wie der Stein. Sie ist jetzt ein eigenes Netz mit
  // eigenem Material (buildGarden), weil ein Spiegel nichts mit einem
  // Vertexfarben-Lambert gemeinsam hat.
  const spout = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6);
  spout.rotateX(Math.PI / 2);
  push(spout.translate(bx, y0 + 0.62, bz - 0.34), 0x8a8148);
  push(
    new THREE.CylinderGeometry(0.045, 0.05, 0.85, 6).translate(bx, y0 + 0.42, bz - 0.6),
    0x767041
  );

  // --- Bäume ---------------------------------------------------------------
  //
  // Zwei Ahorne statt eines, links und rechts versetzt, und beide mit echtem
  // Astwerk. Der eine Ahorn davor war eine geschlossene Kugel auf einem Stab –
  // aus der Tür ein roter Pilz. Ein Baum wird nicht durch seine Krone
  // glaubwürdig, sondern durch die Zweige, die man **durch** sie sieht.
  const crowns = [];
  for (const [tx, tz, h, tilt, hue] of [
    [-2.95, G.z1 - 0.35, 2.55, -0.08, 0],
    [3.15, G.z1 + 0.15, 2.15, 0.06, 1],
  ]) {
    const trunk = new THREE.CylinderGeometry(0.075, 0.15, h, 7);
    trunk.rotateZ(tilt);
    push(trunk.translate(tx, y0 + h / 2, tz), 0x4b3d31);

    const parts = [];
    const top = new THREE.Vector3(tx + Math.sin(tilt) * -h * 0.5, y0 + h, tz);
    const nb = 3;
    for (let k = 0; k < nb; k++) {
      const az = (k / nb) * Math.PI * 2 + r() * 0.9;
      const dir = new THREE.Vector3(Math.cos(az) * 0.62, 0.72, Math.sin(az) * 0.62).normalize();
      branchInto(parts, top, dir, 0.85 + r() * 0.3, 0.055, 2, r);
    }
    for (const b of parts) push(b.geo, 0x4b3d31);
    // Laubschöpfe sitzen auf den Zweigenden, nicht als eine Kugel über allem.
    for (const b of parts) {
      if (b.depth > 0) continue;
      crowns.push({ p: b.tip, hue });
    }
  }

  return { solids, crowns, lantern: [lx, lz], basin: [bx, bz] };
}

// Geharkter Kies – mit Ringen **um** die Steine.
//
// Im ersten Anlauf liefen die Rillen schnurgerade unter den Steinen durch. Das
// ist genau verkehrt: Beim Karesansui umströmt die Harkung jeden Stein, und
// diese Ringe sind der eigentliche Inhalt der Fläche. Gerade Linien darunter
// durchlaufen zu lassen macht daraus Wellblech – so hat es ein Kritiker auch
// genannt, und er hatte recht.
//
// Die Steinpositionen kommen deshalb **in** die Texturerzeugung hinein; die
// Kachel wird einmal in Weltkoordinaten gezeichnet und nicht wiederholt.
function gravelTexture(stones, G) {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6f6a60';
  ctx.fillRect(0, 0, size, size);
  const r = rng(0x9a17);
  for (let i = 0; i < 26000; i++) {
    const g = 92 + r() * 40;
    ctx.fillStyle = `rgba(${g},${Math.round(g * 0.99)},${Math.round(g * 0.9)},0.5)`;
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2.4, 1 + r() * 2);
  }

  // Welt → Textur
  const w = G.halfX * 2;
  const d = G.z1 - G.z0;
  const toU = (x) => ((x + G.halfX) / w) * size;
  const toV = (z) => ((z - G.z0) / d) * size;
  const scale = size / Math.max(w, d);

  ctx.lineCap = 'round';
  ctx.lineWidth = 3.2;

  // Ringe um jeden Stein, von innen nach außen ausklingend.
  for (const st of stones) {
    const cu = toU(st.x);
    const cv = toV(st.z);
    const r0 = Math.max(st.scale[0], st.scale[2]) * 0.55 * scale;
    for (let k = 0; k < 5; k++) {
      const rad = r0 * (1.25 + k * 0.42);
      ctx.strokeStyle = `rgba(74,71,64,${0.55 - k * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(cu, cv, rad, rad * 0.86, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Parallele Bahnen dazwischen – aber unterbrochen, wo ein Ring liegt.
  const gap = size / 34;
  for (let v = gap * 0.5; v < size; v += gap) {
    ctx.strokeStyle = 'rgba(74,71,64,0.5)';
    ctx.beginPath();
    let drawing = false;
    for (let u = 0; u <= size; u += 4) {
      const yy = v + Math.sin((u / size) * Math.PI * 3) * 3;
      const blocked = stones.some((st) => {
        const du = u - toU(st.x);
        const dv = yy - toV(st.z);
        const rad = Math.max(st.scale[0], st.scale[2]) * 0.55 * scale * 3.6;
        return du * du + dv * dv < rad * rad;
      });
      if (blocked) {
        drawing = false;
        continue;
      }
      if (!drawing) {
        ctx.moveTo(u, yy);
        drawing = true;
      } else ctx.lineTo(u, yy);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildGarden(group, r) {
  const G = EXTERIOR.garden;
  const y0 = EXTERIOR.ground.y;

  // --- Trittsteine zuerst: Die Kiestextur braucht ihre Lage ----------------
  const stoneGeo = new THREE.CylinderGeometry(0.5, 0.44, 0.12, 7);
  const stones = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    stones.push({
      x: Math.sin(t * 2.2 - 0.3) * 1.55 + (r() - 0.5) * 0.16,
      y: y0 + 0.055,
      z: G.z0 - 0.45 + t * (G.z1 - G.z0 - 1.1),
      ry: r() * Math.PI,
      scale: [0.6 + r() * 0.16, 1, 0.5 + r() * 0.14],
    });
  }
  for (const [x, z, s] of [
    [-1.05, G.z0 + 1.05, 1.05],
    [2.5, G.z1 - 0.75, 0.9],
    [-3.4, G.z0 + 0.4, 0.75],
  ]) {
    stones.push({
      x,
      y: y0 + 0.07,
      z,
      ry: r() * Math.PI,
      scale: [s, 2.1 * s, s * 0.85],
    });
  }

  // --- Kiesfläche ----------------------------------------------------------
  const gravelGeo = new THREE.PlaneGeometry(G.halfX * 2, G.z1 - G.z0);
  gravelGeo.rotateX(-Math.PI / 2);
  gravelGeo.translate(0, y0 + 0.045, (G.z0 + G.z1) / 2);
  // **Die Harkrillen gehören in die Normal-Map, nicht in die Farbe.**
  //
  // Beim Karesansui besteht die Fläche aus nichts als Licht und Schatten in
  // parallelen Rillen. Gemalt als dunkle Linien bleiben sie aus jedem Winkel
  // gleich, und die Fläche liest sich als Tapete – so stand sie hier. Mit
  // einem Höhenfeld wandert der Schatten mit der Sonne und die Rille
  // verschwindet, wenn man von der Lichtseite darauf schaut. Das ist der
  // Unterschied zwischen einer gemusterten Ebene und einer geharkten.
  //
  // Der Kies ist die einzige Fläche des Gartens, die diesen Aufwand verdient:
  // Sie liegt im Vordergrund, ist eben (eine Normal-Map hat also freies Feld)
  // und ihre gesamte Wirkung ist Streiflicht.
  const gravel = new THREE.Mesh(gravelGeo, gravelMaterial(stones, G));
  // **Abgedunkelt und gewärmt.** Karesansui-Kies ist hell – aber die Textur
  // kam mit dem Himmelslicht darüber als hellstes Ding im ganzen Bild heraus
  // und las sich als Beton, nicht als Stein. Der Faktor liegt am Material,
  // nicht in der Textur, damit die Karte selbst ihren Kontrastumfang behält:
  // Die Harkrillen leben von der Spanne zwischen Kamm und Grund, und die würde
  // ein dunkleres Grundbild mit wegdrücken.
  gravel.material.color.setHex(0xa79f90);
  gravel.name = 'dojo-garden-kies';
  gravel.receiveShadow = true;
  group.add(gravel);

  // --- Feste Teile, ein Netz ------------------------------------------------
  const { solids, crowns, basin } = gardenPieces(r);
  const tinted = solids.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(color);
    const p = g.attributes.position;
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      // Zwei Modulationen: feine Streuung je Vertex gegen den Plastikeindruck,
      // und eine Verdunkelung nach unten. Das gebackene Kontakt-AO ist das,
      // was einen Gegenstand auf den Boden stellt, statt ihn davorzusetzen –
      // die Vasen im Innenraum haben genau daran gefehlt.
      const f = 0.9 + ((i * 37) % 17) / 80;
      const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, (p.getY(i) - y0) / 0.35));
      arr[i * 3] = c.r * f * ao;
      arr[i * 3 + 1] = c.g * f * ao;
      arr[i * 3 + 2] = c.b * f * ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  });
  // **Granit statt Vertexfarben-Lambert.**
  //
  // Laterne, Becken, Bambusrohr und die Einfassungssteine waren facettierte
  // Flächen in einem Grauton – aus zwei Metern liest sich das als Karton. Was
  // einen Stein zum Stein macht, ist das Korn: eine Normal-Map, deren Licht bei
  // jeder Kopfdrehung anders steht.
  //
  // Die Textur braucht UVs, und die Bauteile haben keine (`deleteAttribute`
  // oben). `boxProjectUV` erzeugt sie über die dominante Normalenachse statt
  // über eine Zylinderabwicklung – bei einem Trittstein liefe U einmal um den
  // Umfang (3,1 m) und V über die Höhe (0,12 m), das Korn stünde also als
  // Streifen auf der Flanke. Die Achswechsel erzeugen Nähte, aber bei einem
  // richtungslosen Rauschmuster sieht man sie nicht; genau deshalb benutzt man
  // den Trick bei Fels und nicht bei Holz.
  const merged = mergeGeometries(tinted, false);
  // 0,18 m je Kachel, nicht 0,42. Bei der groben Einstellung lag über einer
  // Laterne von 40 cm nicht einmal eine ganze Kachel – das Korn war da, aber
  // als eine einzige weiche Beule statt als Korn.
  boxProjectUV(merged, 0.18);
  // Moos wächst am Fuß und in den Fugen, nicht als Verlauf über den ganzen
  // Stein. Es läuft deshalb durch ein Rauschfeld – ohne das bekommt jedes
  // Bauteil denselben sauberen Gradienten und man sieht die Formel.
  mossPatina(merged, { floor: y0, height: 0.4, strength: 0.85, scale: 0.5 });
  const solid = new THREE.Mesh(merged, graniteMaterial({ vertexColors: true }));
  // **Korn kräftiger stellen.** Mit dem Standardwert 1 war das Korn im Bild
  // vorhanden, aber nur als Ahnung – auf einer glatten Zylinderflanke wie dem
  // Laternenschaft braucht die Struktur mehr Ausschlag als auf einer bereits
  // unruhigen Fläche. Das Material ist je Ton eine geteilte Instanz; hier wird
  // die des Gartensteins verstellt, die Trittsteine haben ihre eigene.
  solid.material.normalScale.set(2.2, 2.2);
  solid.name = 'dojo-garden-stein';
  solid.castShadow = true;
  solid.receiveShadow = true;
  // **Nasser Sockel am Becken.**
  //
  // Nass ist nicht „dunkler eingefärbt". Ein Wasserfilm füllt die Mikrorauheit
  // auf: Die Oberfläche wird glatt und gleichzeitig dunkel, weil was in die
  // Poren fällt kaum wieder herauskommt. Hier wird nur der zweite Teil in die
  // Vertexfarben gerechnet – der erste bräuchte ein eigenes Material für ein
  // Bauteil von 30 cm, und das ist der Draw-Call nicht wert. Was zählt, ist
  // der Übergang: ein Becken, dessen Sockel genauso trocken aussieht wie die
  // Laterne daneben, steht nicht in Wasser, sondern daneben.
  wetStoneOverlay(solid, {
    center: basin,
    radius: 0.55,
    waterY: EXTERIOR.ground.y + 0.29,
    rise: 0.2,
    // 0,28 statt 0,5. Bei der halben Verdunkelung war der Sockel im Bild
    // nahezu schwarz – nasser Stein wird dunkler, nicht unsichtbar, und der
    // Rest des Gartens steht ohnehin schon im Schatten der Bepflanzung.
    strength: 0.28,
  });
  group.add(solid);

  // --- Wasserspiegel im Tsukubai --------------------------------------------
  //
  // Eigenes Netz, eigenes Material: Was man von Wasser sieht, ist fast
  // ausschließlich die Spiegelung, und die braucht einen sehr dunklen Grundton
  // und eine Environment-Map. Als graue Scheibe im verschmolzenen Steinnetz
  // war es eine Scheibe, kein Wasser.
  //
  // Zwei Kräuselungslagen, die gegeneinander wandern (ground.js). Eine einzelne
  // Lage mit laufendem Versatz liest man sofort als verschobene Textur; erst
  // die Interferenz zweier Lagen ergibt ein Muster, das entsteht und vergeht.
  // **Die Höhe ist der ganze Punkt.** Das Becken ist ein Zylinder von y0 bis
  // y0 + 0,30; die Scheibe lag bei y0 + 0,29, also einen Zentimeter **im**
  // Stein und damit unsichtbar. Aufgefallen ist das nie, weil sie bis eben im
  // selben verschmolzenen Netz steckte und dort ohnehin niemand nach ihr
  // gesucht hat. Jetzt steht sie 2 mm über der Kante – ein Tsukubai ist bis
  // fast zum Rand gefüllt.
  const waterGeo = new THREE.CircleGeometry(0.285, 20);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(basin[0], y0 + 0.302, basin[1]);
  const water = new THREE.Mesh(waterGeo, waterMaterial({ repeat: 2.5 }));
  water.name = 'dojo-garden-wasser';
  water.receiveShadow = true;
  group.add(water);

  // --- Trittsteine ----------------------------------------------------------
  // Trittsteine: dieselbe Behandlung. `y0` muss mit, weil die Geometrie einer
  // Instanz lokal um Null liegt – ohne die Angabe hielte `mossPatina` jeden
  // Vertex für bodennah und moost den ganzen Stein ein.
  boxProjectUV(stoneGeo, 0.16);
  mossPatina(stoneGeo, { y0: y0 + 0.06, floor: y0, height: 0.1, strength: 0.7, scale: 0.35 });
  const stoneMesh = new THREE.InstancedMesh(
    stoneGeo,
    // **0x4f4c45, nicht 0x9c968c.** `mossPatina` legt über `ensureVertexColors`
    // weiße Vertexfarben an, wo vorher keine waren – der Ton muss also
    // vollständig aus dem Material kommen. Mit dem hellen Wert kamen die
    // Trittsteine schneeweiß heraus, heller als der Kies, auf dem sie liegen.
    // Der Wert ist derselbe, den das Lambert-Material vorher hatte.
    graniteMaterial({ tone: 0x4f4c45, vertexColors: true }),
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

  // --- Die grüne Wand -------------------------------------------------------
  //
  // Zwei Bänder Polster hinter dem Beet, nach hinten größer und dichter, plus
  // die Ahornkronen darüber. Zusammen schließen sie den Blick aus der Tür so
  // weit, dass vom Horizont nichts mehr übrig bleibt – **das** ist der Zweck,
  // nicht die Zierde.
  // Fünf Töne mit erkennbarer Spanne. Fünf fast gleiche Grüns ergaben eine
  // Masse ohne Binnenzeichnung – aus der Tür ein Scherenschnitt. Ein
  // Strauchbestand hat besonnte und beschattete Partien, und **dieser**
  // Unterschied ist es, der eine Wand aus Grün als Pflanzung lesbar macht.
  // **Deutlich dunkler als vorher – und das ist keine Geschmacksfrage.**
  //
  // Der Hüllkörper ist nach dem Umbau nicht mehr die Pflanze, sondern ihr
  // Inneres: Was zwischen den Blattkarten durchscheint, ist die beschattete
  // Tiefe des Strauchs. Solange er in derselben Helligkeit wie besonntes Laub
  // stand, las sich jede Lücke als grün gestrichener Stein – genau der
  // Eindruck, den der Nutzer „Kraut und Rüben" genannt hat.
  //
  // In einem Spiel ist der Blob unter dem Laub immer nahezu schwarz. Die
  // Helligkeit kommt von den Karten davor, nicht von der Masse dahinter.
  // Der Wert dazwischen, und beide Enden sind gemessen: Bei 0x2f5325 (dem
  // Stand davor) las sich jede Lücke als grün gestrichener Stein, bei 0x0f1d0c
  // als Loch – ein Garten aus schwarzen Höhlen mit Laub davor. Was hier
  // gebraucht wird, ist beschattetes Laub, und das ist dunkel, aber nicht
  // farblos.
  const AZALEA = [0x1a2e14, 0x24401b, 0x141f0f, 0x2b4d1f, 0x1d3316, 0x365c26];
  // **Wie weit reicht ein Polster wirklich?**
  //
  // Der erste Anlauf hat mit rad·1,3 gerechnet – der Instanzskalierung. Die
  // Messung fand danach immer noch fünf Kartenbüschel im Raum: Die Karten
  // sitzen auf einer Schale, deren äußerste noch einmal ein halbes Kartenmaß
  // nach außen wächst, und die Hüllkugel ist zusätzlich um 30 % aufgeblasen,
  // damit der Wind sie nicht aus dem Sichtkörper trägt. Der Blob selbst ist
  // ebenfalls kein Einheitsradius, weil `blobGeometry` ihn verrauscht.
  //
  // Beide Zahlen stehen in den Geometrien. Sie dort abzulesen kostet zwei
  // Zeilen und hält, wenn jemand `cardScale` verstellt – geschätzte Faktoren
  // tun das nicht, und genau daran ist der erste Anlauf gescheitert.
  const moundGeo = blobGeometry(1, 0x7c3, 0.62);
  moundGeo.computeBoundingBox();
  const cardGeo = cardCluster({
    // **Zahl und Größe sind gemessen, nicht geschätzt.** Der erste Anlauf
    // hatte 104 Karten zu 0,44 – im Bild ergab das Flechten auf grünen
    // Steinen. Der Grund ist die Textur selbst: Eine Atlaszelle zeigt ein
    // Büschel mit viel Zwischenraum, also deckt eine Karte nur etwa ein
    // Drittel ihrer eigenen Fläche. Was rechnerisch 70 % Deckung war, waren
    // im Bild 25 %.
    count: 190,
    radius: 1,
    seed: 0x5107,
    kind: 'azalea',
    // 0,58 statt 0,44: Bei einem Polster von 0,8 m sind das Büschel von rund
    // 0,38 m – ein Zweigende, kein Einzelblatt. Einzelblätter zu bauen hieße,
    // das Zehnfache zu bezahlen für etwas, das man aus vier Metern nicht mehr
    // trennt.
    cardScale: 0.58,
    squash: 0.72,
  });
  const farGeo = cardCluster({
    count: 52,
    radius: 1,
    seed: 0x5108,
    kind: 'azalea',
    cardScale: 0.86,
    squash: 0.72,
  });
  const unitReach = Math.max(
    moundGeo.boundingBox.max.x,
    -moundGeo.boundingBox.min.x,
    moundGeo.boundingBox.max.z,
    -moundGeo.boundingBox.min.z,
    cardGeo.boundingSphere?.radius ?? 0,
    farGeo.boundingSphere?.radius ?? 0
  );
  // mal der größeren der beiden waagerechten Instanzskalierungen (X: 1,3).
  const MOUND_REACH = unitReach * 1.3;

  const mounds = [];
  const addMound = (x, z, rad, pal, squash = 1) => {
    if (intrudesRoom(x, z, rad * MOUND_REACH)) return;
    mounds.push({
      x,
      z,
      // Höhenstreuung zusätzlich zum Radius. Vorher war die Höhe fest an den
      // Radius gekoppelt, also war jedes Polster dieselbe Form in einer
      // anderen Größe – eine Reihe Kopien.
      y: y0 + rad * 0.4 * squash,
      rad,
      squash,
      ry: r() * Math.PI,
      col: new THREE.Color(pal[Math.floor(r() * pal.length)]),
    });
  };

  // **Drei Reihen, nach hinten höher – die eigentliche Aufgabe.**
  //
  // Zwei Reihen mit maximal 1,55 m Radius reichten nicht: Zwischen ihrer
  // Oberkante und den Baumkronen blieb im Türausschnitt ein blassgrauer
  // Streifen Ferne stehen, und genau den wollte der Nutzer weghaben.
  //
  // Die Höhe, die es braucht, ist ausrechenbar statt zu raten. Der Betrachter
  // steht bei y = 1,6 und z ≈ 4,4, der Türsturz bei y = 2,85 und z = 7,5. Die
  // Sichtlinie zum oberen Türrand steigt mit (2,85 − 1,6)/(7,5 − 4,4) = 0,40
  // je Meter. Bei z = 14 liegt sie damit auf 1,6 + 0,40 · 9,6 ≈ 5,4 m – **so
  // hoch** muss die hinterste Reihe reichen, um den Ausschnitt oben zu füllen.
  // Bambus (6–11 m) übernimmt das; die Sträucher schließen darunter.
  const back = (z, rad, squash) => {
    for (let x = -G.halfX - 3.2; x <= G.halfX + 3.2; x += 0.58) {
      addMound(x + (r() - 0.5) * 0.34, z + (r() - 0.5) * 0.6, rad(), AZALEA, squash());
    }
  };
  back(
    G.z1 + 0.55,
    () => 0.75 + r() * 0.45,
    () => 0.85 + r() * 0.4
  );
  back(
    G.z1 + 1.6,
    () => 1.1 + r() * 0.6,
    () => 0.95 + r() * 0.5
  );
  back(
    G.z1 + 2.9,
    () => 1.5 + r() * 0.75,
    () => 1.05 + r() * 0.6
  );
  // Vierte Reihe. Nach drei Reihen erreichten aus der Türachse noch 6 von 364
  // Strahlen die Kulisse – eine schmale Lücke, in der Sträucher schon zu tief
  // und Bambuslaub noch zu hoch war. Gemessen, nicht geschätzt: `skyline.mjs`.
  back(
    G.z1 + 4.3,
    () => 1.8 + r() * 0.9,
    () => 1.1 + r() * 0.65
  );

  // **Baumkulisse dahinter – gegen die hohen Sichtlinien.**
  //
  // Vier Strauchreihen haben von 6 entwischenden Strahlen genau einen gefangen.
  // Der Grund stand in der Messung: Die Lecks lagen bei y = 2,45…2,75 in der
  // Öffnung, also in Sichtlinien, die **nach oben** laufen. Aus Augenhöhe durch
  // den oberen Türbereich steigt der Blick um 0,32 m je Meter – bei z = 20 ist
  // er auf 6 m, bei z = 30 auf 9,8 m. Sträucher von zwei Metern erreichen das
  // nicht, egal wie viele Reihen man davorstellt.
  //
  // Also Massen in Baumhöhe: dieselbe Polstergeometrie, nur groß und weit
  // hinten. Aus dieser Entfernung ist eine Krone ohnehin eine Masse.
  //
  // **Eigene Instanz, gröber und mit Luftperspektive.**
  //
  // Zuerst hingen die Fernkronen im selben Netz wie die Sträucher davor. Zwei
  // Folgen, beide sichtbar: Sie bekamen dieselbe feine Unterteilung wie ein
  // Polster in zwei Metern Entfernung (die Dreieckszahl sprang von 150k auf
  // 260k), und sie bekamen dieselben satten Grüns – aus der Tür las sich die
  // Ferne dadurch als **Wand aus Blasen** direkt hinter dem Garten.
  //
  // Beides behebt dieselbe Trennung: eigene Geometrie in Detailstufe 1 statt 2,
  // und eine Farbe, die mit dem Abstand zur Dunstfarbe hin ausbleicht. Genau
  // das macht die gemalte Kulisse dahinter auch – jetzt tut es die Geometrie
  // davor ebenso, und der Übergang zwischen beiden verschwindet.
  //
  // Vier Ringe und eng gesetzt. Nach drei Ringen entwischten noch genau drei
  // Strahlen, alle in **einer** Spalte (x = −0,52) – das war keine zu niedrige
  // Wand, sondern eine Lücke zwischen zwei Kronen. Gegen Lücken hilft Dichte,
  // nicht Höhe; der Abstand ging deshalb von 3,4 auf 2,2 m herunter, und damit
  // steht die Messung bei null.
  const HAZE = new THREE.Color(0x93a8a4);
  const CANOPY = [0x1b2f18, 0x24401d, 0x172a15, 0x2c4a20];
  const canopy = [];
  for (let ring = 0; ring < 4; ring++) {
    const z = G.z1 + 7 + ring * 4.5;
    const haze = 0.16 + ring * 0.13;
    for (let x = -24; x <= 24; x += 2.2) {
      const rad = 2.6 + r() * 1.9;
      const cx = x + (r() - 0.5) * 2.6;
      const cz = z + (r() - 0.5) * 2.4;
      if (intrudesRoom(cx, cz, rad * MOUND_REACH)) continue;
      canopy.push({
        x: cx,
        z: cz,
        y: y0 + rad * 0.75 + r() * 1.6,
        rad,
        squash: 1.25 + r() * 0.5,
        ry: r() * Math.PI,
        col: new THREE.Color(CANOPY[Math.floor(r() * CANOPY.length)]).lerp(HAZE, haze),
      });
    }
  }

  // Seitenwände, ebenfalls dreilagig und deutlich breiter als der
  // Türausschnitt: Der schräge Blick zeigte den Horizontstreifen breiter als
  // der frontale, die Wand muss also seitlich über die Öffnung hinausgehen.
  for (const side of [-1, 1]) {
    for (let z = G.z0 - 1.4; z <= G.z1 + 2.2; z += 0.6) {
      addMound(side * (G.halfX + 0.55 + r() * 0.5), z, 0.5 + r() * 0.45, AZALEA, 0.9 + r() * 0.4);
      if (r() < 0.7) {
        addMound(side * (G.halfX + 1.6 + r() * 0.7), z, 0.85 + r() * 0.5, AZALEA, 1 + r() * 0.5);
      }
      if (r() < 0.5) {
        addMound(side * (G.halfX + 2.9 + r() * 0.9), z, 1.2 + r() * 0.6, AZALEA, 1.05 + r() * 0.5);
      }
    }
  }
  // Ein paar niedrige Polster **im** Beet, als Übergang zum Kies.
  for (const [x, z] of [
    [-3.9, G.z0 + 0.55],
    [-3.35, G.z0 + 1.25],
    [3.6, G.z0 + 1.9],
    [4.2, G.z1 - 1.2],
    [-4.4, G.z1 - 0.9],
  ]) {
    addMound(x, z, 0.34 + r() * 0.2, AZALEA);
  }

  const moundMesh = new THREE.InstancedMesh(
    // Detailstufe 1 statt 2. Vor der `mergeVertices()`-Korrektur brauchte es
    // die feinere Unterteilung gegen die Facetten – seit die Normalen stimmen,
    // ist eine Kuppel auch mit 80 Dreiecken rund. Das spart bei rund 170
    // Polstern über 40 000 Dreiecke, ohne dass man einen Unterschied sieht.
    moundGeo,
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    mounds.length
  );
  moundMesh.name = 'dojo-garden-polster';
  mounds.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, f.ry, 0));
    m.compose(
      new THREE.Vector3(f.x, f.y, f.z),
      q,
      new THREE.Vector3(f.rad * 1.3, f.rad * f.squash, f.rad * 1.15)
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

  // --- Blattkarten über die vorderen Polster --------------------------------
  //
  // **Hüllkörper plus Karten.** Der Blob bleibt, was er kann: Masse, Verdecker,
  // Schattenwerfer. Er ist der Grund, warum durch die Tür kein Horizont zu
  // sehen ist, und das gibt man nicht auf. Was ihm fehlt, ist alles andere –
  // eine Silhouette, die nicht rund ist, Licht, das durch ein Blatt fällt,
  // Bewegung. Genau das legen die Karten darüber.
  //
  // Ein früherer Anlauf hatte die Karten *statt* der Blobs; das Ergebnis waren
  // Papierschnipsel, und ich habe daraus den falschen Schluss gezogen und auf
  // massive Körper umgestellt. Der Fehler lag nicht in der Technik – jedes
  // aktuelle Spiel macht Laub aus alpha-getesteten Karten –, sondern darin,
  // dass ein Blob allein oder Karten allein je die Hälfte des Problems lösen.
  //
  // **Nur die vorderen Polster.** Karten sind teuer (zwei Dreiecke und ein
  // Alpha-Test je Blatt) und lohnen sich nur, solange man ein einzelnes Blatt
  // überhaupt auflösen kann. Die hinteren Reihen und die Fernkronen bleiben
  // Masse – das ist keine Sparmaßnahme, sondern die Detailstufe, die ein Spiel
  // an derselben Stelle auch fährt.
  //
  // Der Farbton kommt als **Aufhellung** auf den Atlas, nicht als Grundfarbe:
  // Die Blattfarbe steckt schon in der Textur, ein zweites sattes Grün darüber
  // ergäbe schwarzes Laub. Die Spanne bleibt trotzdem erhalten, damit die
  // Pflanzung besonnte und beschattete Partien behält.
  // Nicht heller als nötig: Ein Satz nahezu weißer Faktoren hat den Atlas
  // ausgebleicht – die Blätter wurden kreidig und die Binnenzeichnung der
  // Textur verschwand. Ein Multiplikator soll aufhellen, nicht entfärben.
  const CARD_TINT = [0xc2d3a2, 0xdae5c0, 0xa4ba8a, 0xe6ecd2, 0xb3c797, 0xcedcb2];
  const azaleaCards = foliageMaterial({
    atlas: leafAtlas('azalea'),
    // Der niedrigste Wert im Garten, und zwar aus dem Aufbau heraus:
    // Transluzenz gehört ans **Einzelblatt**. Ein Azaleenpolster zeigt keines –
    // durch zwanzig Blätter hintereinander kommt kein Licht. Bei 0,85 sah der
    // Strauchwall im Gegenlicht aus wie beleuchtetes Papier.
    translucency: 0.5,
    windStrength: 0.055,
  });
  {
    // **Alle Polster, nicht nur die vorderen.** Die Filterung auf die vordere
    // Reihe war als Detailstufe gedacht, hat aber genau das Gegenteil
    // bewirkt: Die „grüne Wand" hinten ist die größte Fläche im Türausschnitt,
    // und sie stand als einzige noch unbelegt da. Die Karten skalieren mit dem
    // Polster mit – hinten werden daraus gröbere Büschel, und aus zehn Metern
    // ist das genau die richtige Auflösung.
    // Hintere Polster mit einem Viertel der Karten. Mit einer Belegung für
    // alle standen 68 000 Dreiecke in **einem** Netz – mehr als der halbe
    // Zuwachs dieser Runde, und der größte Teil davon in Reihen, die zehn
    // Meter entfernt hinter vier anderen stehen. Die Detailstufe ist hier
    // keine Sparmaßnahme, sondern die Stelle, an der man sie nicht sieht.
    for (const [name, geo, list] of [
      ['dojo-garden-blattkarten', cardGeo, mounds.filter((f) => f.z <= G.z1 + 2.0)],
      ['dojo-garden-blattkarten-fern', farGeo, mounds.filter((f) => f.z > G.z1 + 2.0)],
    ]) {
      if (!list.length) continue;
      const cards = new THREE.InstancedMesh(geo, azaleaCards, list.length);
      applyFoliageMaterial(cards, azaleaCards);
      cards.name = name;
      list.forEach((f, i) => {
        q.setFromEuler(new THREE.Euler(0, f.ry, 0));
        m.compose(
          new THREE.Vector3(f.x, f.y, f.z),
          q,
          new THREE.Vector3(f.rad * 1.3, f.rad * f.squash, f.rad * 1.15)
        );
        cards.setMatrixAt(i, m);
        cards.setColorAt(i, new THREE.Color(CARD_TINT[Math.floor(r() * CARD_TINT.length)]));
      });
      cards.instanceMatrix.needsUpdate = true;
      if (cards.instanceColor) cards.instanceColor.needsUpdate = true;
      cards.castShadow = true;
      cards.receiveShadow = true;
      cards.userData.fullCount = list.length;
      group.add(cards);
    }
  }

  const canopyMesh = new THREE.InstancedMesh(
    blobGeometry(1, 0x5d2, 0.7),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    canopy.length
  );
  canopyMesh.name = 'dojo-garden-fernkronen';
  canopy.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, f.ry, 0));
    m.compose(
      new THREE.Vector3(f.x, f.y, f.z),
      q,
      new THREE.Vector3(f.rad * 1.3, f.rad * f.squash, f.rad * 1.15)
    );
    canopyMesh.setMatrixAt(i, m);
    canopyMesh.setColorAt(i, f.col);
  });
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
  // Wirft keinen Schatten: Die Kronen stehen 20–35 m hinter dem Gebäude, ihr
  // Schatten fiele weit außerhalb des Schattenfrustums – der Durchgang würde
  // bezahlt und nichts dafür geliefert.
  canopyMesh.castShadow = false;
  canopyMesh.receiveShadow = false;
  canopyMesh.userData.fullCount = canopy.length;
  group.add(canopyMesh);

  // --- Ahornlaub ------------------------------------------------------------
  //
  // Ein Schopf je Zweigende statt einer Kugel über dem Baum. Dieselbe
  // Blob-Geometrie, aber klein und vielfach – die Krone bekommt dadurch eine
  // aufgelöste Silhouette und Löcher, durch die man Zweige sieht.
  const MAPLE = [
    [0x6e2a1a, 0x7d3520, 0x8c4526],
    [0x8a5a24, 0x9a6b2c, 0x7a4a20],
  ];
  // **Drei kleine Schöpfe je Zweigende statt eines großen.**
  //
  // Mit 0,34–0,60 m Radius war jeder Schopf eine glatte Blase; zusammen ergaben
  // sie einen Blumenkohl. Eine aufgelöste Kronensilhouette entsteht aus
  // **Anzahl**, nicht aus Rauschen auf einer großen Kugel – halb so groß und
  // dreimal so viele kosten dieselbe Fläche und sehen völlig anders aus.
  const puffs = [];
  for (const c of crowns) {
    for (let k = 0; k < 3; k++) {
      puffs.push({
        p: c.p
          .clone()
          .add(new THREE.Vector3((r() - 0.5) * 0.42, (r() - 0.4) * 0.34, (r() - 0.5) * 0.42)),
        hue: c.hue,
        s: 0.17 + r() * 0.17,
      });
    }
  }
  const crownMesh = new THREE.InstancedMesh(
    blobGeometry(1, 0x2f7, 0.72),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    puffs.length
  );
  crownMesh.name = 'dojo-garden-krone';
  puffs.forEach((c, i) => {
    const s = c.s;
    q.setFromEuler(new THREE.Euler(r() * 0.6, r() * Math.PI, r() * 0.6));
    m.compose(c.p, q, new THREE.Vector3(s * 1.25, s, s * 1.15));
    crownMesh.setMatrixAt(i, m);
    const pal = MAPLE[c.hue];
    crownMesh.setColorAt(i, new THREE.Color(pal[Math.floor(r() * pal.length)]));
  });
  crownMesh.instanceMatrix.needsUpdate = true;
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  crownMesh.castShadow = true;
  crownMesh.userData.fullCount = puffs.length;
  group.add(crownMesh);

  // Und dieselben Schöpfe noch einmal als Karten. Die beiden Ahorne stehen
  // **in der Türachse** – sie sind das, was man beim Blick nach draußen zuerst
  // und am größten sieht. Wenn irgendwo im Garten ein einzelnes Blatt
  // auflösbar ist, dann hier, und wenn irgendwo Gegenlicht durch ein Blatt
  // fällt, dann durch diese Kronen: Die Sonne steht im Osten hinter ihnen.
  const mapleCards = foliageMaterial({
    atlas: leafAtlas('maple'),
    // Ahornlaub im Herbst ist der Fall, für den der Transluzenzterm gebaut ist –
    // ein rotes Blatt gegen die Sonne leuchtet, statt dunkel zu werden.
    translucency: 0.8,
    transColor: 0xd98f45,
    windStrength: 0.075,
  });
  const crownCards = new THREE.InstancedMesh(
    cardCluster({
      count: 46,
      radius: 1,
      seed: 0x2f71,
      kind: 'maple',
      cardScale: 0.62,
    }),
    mapleCards,
    puffs.length
  );
  applyFoliageMaterial(crownCards, mapleCards);
  crownCards.name = 'dojo-garden-kronenkarten';
  const MAPLE_TINT = [
    [0xd8b49a, 0xe4c0a2, 0xc7a288],
    [0xe0c79a, 0xead49f, 0xcbb389],
  ];
  puffs.forEach((c, i) => {
    const s = c.s * 1.12;
    q.setFromEuler(new THREE.Euler(r() * 0.6, r() * Math.PI, r() * 0.6));
    m.compose(c.p, q, new THREE.Vector3(s * 1.25, s, s * 1.15));
    crownCards.setMatrixAt(i, m);
    const pal = MAPLE_TINT[c.hue];
    crownCards.setColorAt(i, new THREE.Color(pal[Math.floor(r() * pal.length)]));
  });
  crownCards.instanceMatrix.needsUpdate = true;
  if (crownCards.instanceColor) crownCards.instanceColor.needsUpdate = true;
  crownCards.castShadow = true;
  crownCards.userData.fullCount = puffs.length;
  group.add(crownCards);

  // --- Farne und Gräser -----------------------------------------------------
  //
  // Die unterste Schicht, und die, die einen Garten *bepflanzt* aussehen lässt
  // statt *bestückt*: Bewuchs am Fuß der Steine, an der Beetkante, im Schatten
  // der Sträucher. Ohne sie steht jeder Gegenstand auf einer sauberen Fläche –
  // und nichts verrät eine gebaute Szene zuverlässiger als ein sauberer
  // Übergang zwischen Ding und Boden.
  // Die Töne sind hell, weil sie den Blattatlas **multiplizieren**: Das Grün
  // steckt in der Textur. Der frühere Satz satter Grüns war für ein Material
  // ohne Karte richtig und wäre hier schwarzes Laub.
  // Der Farnhorst als Geometrie, damit seine Reichweite **abgelesen** und nicht
  // geschätzt wird. Der erste Anlauf hat mit `0,82 · 1,35` gerechnet und war um
  // sieben Prozent zu klein – gemessen ragte danach noch genau ein Horst einen
  // Zentimeter in den Raum. Ein Zentimeter ist harmlos; die geschätzte Zahl
  // dahinter ist es nicht, weil sie beim nächsten Verstellen von `cardScale`
  // wieder daneben liegt.
  const fernGeo = cardCluster({
    count: 26,
    radius: 1,
    seed: 0x1f4,
    kind: 'fern',
    hemisphere: true,
    squash: 0.55,
    cardScale: 0.62,
  });
  fernGeo.computeBoundingBox();
  const fernUnit = Math.max(
    fernGeo.boundingBox.max.x,
    -fernGeo.boundingBox.min.x,
    fernGeo.boundingBox.max.z,
    -fernGeo.boundingBox.min.z
  );
  const fernReach = 0.82 * fernUnit;
  const FERN = [0xa9bd8e, 0xc4d3a6, 0x8fa578, 0xd2dcb4];
  const fronds = [];
  const nearStone = (x, z) =>
    stones.some((s) => Math.hypot(s.x - x, s.z - z) < Math.max(s.scale[0], s.scale[2]) * 0.75);
  for (let i = 0; i < 78; i++) {
    let x;
    let z;
    if (i % 3 === 0) {
      // an der Beetkante entlang
      const side = r() < 0.5 ? -1 : 1;
      x = side * (G.halfX + (r() - 0.35) * 0.6);
      z = G.z0 - 0.8 + r() * (G.z1 - G.z0 + 1.6);
    } else if (i % 3 === 1) {
      // vor der grünen Rückwand
      x = (r() - 0.5) * (G.halfX * 2 + 2.4);
      z = G.z1 + (r() - 0.2) * 0.7;
    } else {
      // um Laterne und Becken herum
      // **Der Mindestabstand kommt aus der Reichweite des Horstes.**
      //
      // Hier stand `0,45 + r()·0,5`, und das war richtig, solange ein Farn ein
      // paar Wedel waren. Seit er ein Kartenbüschel ist, reicht er waagerecht
      // rund `f.s · 1,35`, also bis 1,11 m – bei 45 cm Abstand schließt er über
      // dem Becken (Radius 0,36 m) zusammen, und der Tsukubai verschwindet
      // vollständig unter Grün. Genau so war es gemeldet.
      //
      // Der Abstand wird deshalb aus der tatsächlichen Ausdehnung abgeleitet
      // statt gesetzt – dieselbe Lehre wie bei der Raumprüfung: Geschätzte
      // Faktoren werden bei der nächsten Größenänderung still falsch.
      const istBecken = r() < 0.5;
      const near = istBecken ? [1.9, G.z0 + 0.75] : [-1.85, G.z0 + 1.25];
      const objektRadius = istBecken ? 0.4 : 0.46; // Becken bzw. Laternenfuß
      const a = r() * Math.PI * 2;
      const d = objektRadius + fernReach + 0.15 + r() * 0.45;
      x = near[0] + Math.cos(a) * d;
      z = near[1] + Math.sin(a) * d;
    }
    if (nearStone(x, z)) continue;
    const fs = 0.42 + r() * 0.4;
    if (intrudesRoom(x, z, fs * fernUnit)) continue;
    fronds.push({
      x,
      z,
      s: fs,
      ry: r() * Math.PI * 2,
      col: new THREE.Color(FERN[Math.floor(r() * FERN.length)]),
    });
  }
  // Halbkugel statt Vollkugel: Ein Farnhorst wächst aus einem Punkt am Boden
  // nach oben. Die untere Hälfte einer Kartenschale läge im Erdreich, und man
  // bezahlte sie trotzdem – der einzige Ort im Garten, wo `hemisphere` die
  // richtige Antwort ist.
  const fernCards = foliageMaterial({
    atlas: leafAtlas('fern'),
    translucency: 0.65,
    // Bodennaher Bewuchs steht im Windschatten der Sträucher. Volle Auslenkung
    // sähe hier aus wie Seegras.
    windStrength: 0.035,
  });
  const frondMesh = new THREE.InstancedMesh(fernGeo, fernCards, fronds.length);
  applyFoliageMaterial(frondMesh, fernCards);
  frondMesh.name = 'dojo-garden-farne';
  fronds.forEach((f, i) => {
    q.setFromEuler(new THREE.Euler(0, f.ry, 0));
    // Etwas über den Boden gesetzt: Die Karten wachsen aus dem Mittelpunkt
    // nach außen **und nach unten** (Laub hängt), ohne Anhebung stäke die
    // Hälfte des Horstes im Erdreich.
    m.compose(
      new THREE.Vector3(f.x, y0 + 0.02 + f.s * 0.2, f.z),
      q,
      new THREE.Vector3(f.s, f.s, f.s)
    );
    frondMesh.setMatrixAt(i, m);
    frondMesh.setColorAt(i, f.col);
  });
  frondMesh.instanceMatrix.needsUpdate = true;
  if (frondMesh.instanceColor) frondMesh.instanceColor.needsUpdate = true;
  frondMesh.castShadow = true;
  frondMesh.userData.fullCount = fronds.length;
  group.add(frondMesh);

  // Das Wasser ist das einzige Teil des Gartens, das je Bild etwas braucht.
  return { water };
}

// --- Wald rings um das Dojo --------------------------------------------------
//
// Bisher stand um das Gebäude eine leere Wiese von 110 m Kantenlänge, und
// dahinter direkt die gemalte Kulisse. Nach Süden fiel das nicht auf, weil dort
// der Garten steht, nach Osten nicht, weil dort der Hain steht – aber jeder
// Blick nach Norden oder Westen ging über eine Ebene bis zum Horizont, und ein
// Dojo mitten auf einer leeren Fläche ist kein Dojo im Wald.
//
// **Warum das bezahlbar ist.** Ein Wald klingt teuer und ist es hier nicht:
// Was ihn teuer macht, wäre Bildfläche – und die hat er nicht. Von innen sieht
// man ihn durch Gitter und Papier in Streifen, von außen in der Ferne. Was er
// braucht, ist Anzahl, nicht Auflösung.
//
// Deshalb die gröbsten Bausteine, die das Repertoire hergibt: eine
// Ikosaeder-Krone in Detailstufe 0 (20 Dreiecke) und ein fünfseitiger Stamm
// ohne Deckel (10 Dreiecke). Bei rund 340 Bäumen sind das etwa 10 000
// Dreiecke – weniger als die vorderen Blattkarten des Gartens allein, und die
// stehen auf vier Metern Abstand.
//
// **Kein Schattenwurf.** Das Schattenfrustum reicht 12 m um die Sonnenachse
// (SUN.shadow.halfExtent); die nächsten Waldbäume stehen weiter draußen als
// die Kulisse davon erfasst. Ein Durchgang, der bezahlt wird und nichts
// liefert, ist genau das, was die Fernkronen des Gartens schon nicht tun.
function buildForest(group, r) {
  const y0 = EXTERIOR.ground.y;
  const F = EXTERIOR.forest;
  const G = EXTERIOR.garden;

  // Detailstufe 0: eine Ikosaederkugel mit 20 Dreiecken. `blobGeometry`
  // verrauscht sie und führt `mergeVertices()` aus, sonst wäre sie facettiert –
  // bei zwanzig Dreiecken sieht man jede einzelne Facette.
  // **Zwei Detailstufen, und die grobe ist wirklich grob.** Der erste Anlauf
  // hatte alles auf Stufe 0 – zwanzig Dreiecke, und von außen las sich der
  // Bestand als Haufen facettierter Kugeln. `mergeVertices()` glättet die
  // Normalen, aber es erfindet keine Silhouette: Bei zwanzig Dreiecken ist der
  // Umriss ein Zwanzigeck, und das sieht man.
  //
  // Auf Stufe 1 (80 Dreiecke) verschwindet der Effekt. Bezahlt wird sie nur im
  // Nahbereich – draußen ab 26 m ist eine Krone wenige Bildpunkte breit, dort
  // ist der Umriss ohnehin kein Thema.
  const crownNear = blobGeometry(1, 0x9e1, 0.74);
  const crownFar = blobGeometry(0, 0x9e3, 0.74);
  crownNear.computeBoundingBox();
  const crownReach = Math.max(crownNear.boundingBox.max.x, -crownNear.boundingBox.min.x);

  // Offener Zylinder: Der Deckel säße unter der Krone und der Boden im Erdreich.
  const trunkGeo = new THREE.CylinderGeometry(0.5, 1, 1, 5, 1, true);
  trunkGeo.translate(0, 0.5, 0);

  // Farbe nach Entfernung: Nadelgrün nahe, Dunstfarbe fern. Das ist dieselbe
  // Luftperspektive, die die gemalte Kulisse zeigt – ohne sie steht der Wald
  // als scharfe dunkle Wand davor und der Übergang wird zur Naht.
  const HAZE = new THREE.Color(0x93a8a4);
  const CONIFER = [0x1b2f18, 0x24401d, 0x172a15, 0x2c4a20, 0x30512a];

  const trees = [];
  const step = F.spacing;
  const n = Math.ceil(F.radius / step);
  for (let ix = -n; ix <= n; ix++) {
    for (let iz = -n; iz <= n; iz++) {
      // Gerastert und dann gestreut: reiner Zufall ergibt Klumpen und Lichtungen
      // an Stellen, wo keine hingehören, ein reines Raster einen Forst.
      const x = ix * step + (r() - 0.5) * step * 0.85;
      const z = iz * step + (r() - 0.5) * step * 0.85 + (ROOM.minZ + ROOM.maxZ) / 2;
      const dist = Math.hypot(x, z - (ROOM.minZ + ROOM.maxZ) / 2);
      if (dist > F.radius) continue;

      const rad = 1.5 + r() * 1.9;
      const reach = rad * crownReach * 1.25;
      // Nicht ins Gebäude und nicht bis an die Wand.
      if (intrudesRoom(x, z, reach + F.clearing)) continue;
      // Nicht ins Kiesbeet und nicht in die Pflanzung davor: Dort steht der
      // Garten, und ein Waldbaum mitten im Karesansui wäre kein Zuwachs.
      if (Math.abs(x) < G.halfX + 1.6 && z > G.z0 - 2.2 && z < G.z1 + 1.6) continue;

      // Dunst nach Entfernung, aber erst ab sechzehn Metern und schwächer als
      // im ersten Anlauf: Bei 0,62 war der ganze Bestand blaugrau und die
      // Farbunterschiede zwischen den Bäumen verschwunden. Die Bezugsgröße ist
      // der Abstand vom Raum, nicht von der Kamera – der Spieler steht immer
      // im Raum, für ihn fällt beides zusammen.
      const haze = Math.min(0.44, Math.max(0, (dist - 16) / 62));
      trees.push({
        x,
        z,
        rad,
        dist,
        // Hochformat statt Kugel. Eine Krone, die so breit wie hoch ist, liest
        // sich aus der Ferne als Ball; ein Nadelwald hat schmale, aufrechte
        // Silhouetten, und in einer Menge ist genau das der Unterschied
        // zwischen Wald und Steinschlag.
        squash: 1.7 + r() * 1.1,
        ry: r() * Math.PI,
        // Stammhöhe unter der Krone. Weiter außen höher, damit die Silhouette
        // nach hinten aufsteigt statt flach abzuschließen.
        h: 2.6 + r() * 3.4 + Math.min(2.4, dist * 0.06),
        col: new THREE.Color(CONIFER[Math.floor(r() * CONIFER.length)]).lerp(HAZE, haze),
      });
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  const kronenMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const [name, geo, list] of [
    // **Die Grenze liegt bei 34 m, nicht bei 26.** Sie bezieht sich auf den
    // Abstand vom *Raum*, weil der Spieler dort immer steht – aus der Luft
    // gesehen bekommt deshalb auch ein Baum dicht vor der Kamera die grobe
    // Stufe, und im Bild sind das die kantigen Formen im Vordergrund. Für den
    // Blick aus dem Raum ist die Bezugsgröße richtig; die 8 m mehr kosten rund
    // 3 000 Dreiecke und nehmen den Facetten den größten Teil ihrer Bühne.
    ['dojo-wald-kronen', crownNear, trees.filter((t) => t.dist < 34)],
    ['dojo-wald-kronen-fern', crownFar, trees.filter((t) => t.dist >= 34)],
  ]) {
    if (!list.length) continue;
    const crowns = new THREE.InstancedMesh(geo, kronenMaterial, list.length);
    crowns.name = name;
    list.forEach((t, i) => {
      q.setFromEuler(e.set(0, t.ry, 0));
      m.compose(
        new THREE.Vector3(t.x, y0 + t.h + t.rad * t.squash * 0.55, t.z),
        q,
        new THREE.Vector3(t.rad * 0.92, t.rad * t.squash, t.rad * 0.82)
      );
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, t.col);
    });
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    // Kein Schattenwurf: Das Schattenfrustum reicht 12 m um die Sonnenachse,
    // und die Sonne steht im Osten – die Schatten des Waldes fielen von der
    // Ostseite her ohnehin auf den Hain und von Norden und Westen vom Gebäude
    // weg. Ein Durchgang, der bezahlt wird und nichts liefert.
    crowns.castShadow = false;
    crowns.receiveShadow = false;
    crowns.userData.fullCount = list.length;
    group.add(crowns);
  }

  // --- Kartenlaub auf den nächsten Bäumen ----------------------------------
  //
  // Die erste Waldreihe steht dem Haus am nächsten und ist die einzige, an der
  // man von außen ein Blatt auflösen kann. Sie bekommt dieselbe Bauform wie der
  // Garten: dunkler Hüllkörper als Masse, Kartenbüschel darüber für Kontur und
  // Lichtspiel.
  //
  // **Nicht in Gartendichte.** Eine Waldkrone hat mit Halbachsen von rund
  // 2,3 × 5,5 × 2,1 m etwa das Elffache der Oberfläche eines Gartenpolsters;
  // gleiche Blattdichte wären über 2 000 Karten je Baum und bei dreißig Bäumen
  // 130 000 Dreiecke. Hier sind es 260 – gröbere Büschel, die auf zehn Metern
  // Abstand genau richtig sind und aus zwei Metern zu grob wären. Die Bäume
  // stehen aber nie näher als sechs Meter an der Wand.
  // **20 m, nicht 16.** Bei 16 m fielen nur fünf Bäume in die Auswahl – die
  // Waldlichtung hält den Bestand ohnehin auf Abstand, und `dist` misst vom
  // Raummittelpunkt, nicht von der Wand: Ein Baum acht Meter vor der Ostwand
  // steht bereits bei dist = 14. Zwanzig Meter fassen die ganze erste Reihe.
  const nahBaeume = trees.filter((t) => t.dist < 20);
  if (nahBaeume.length) {
    const laubMaterial = foliageMaterial({
      atlas: leafAtlas('bamboo'),
      translucency: 0.7,
      transColor: 0xa9c664,
      windStrength: 0.06,
    });
    const laubGeo = cardCluster({
      count: 260,
      radius: 1,
      seed: 0x7a1d,
      kind: 'bamboo',
      cardScale: 0.34,
      squash: 0.9,
    });
    const laub = new THREE.InstancedMesh(laubGeo, laubMaterial, nahBaeume.length);
    applyFoliageMaterial(laub, laubMaterial);
    laub.name = 'dojo-wald-nahlaub';
    nahBaeume.forEach((t, i) => {
      q.setFromEuler(e.set(0, t.ry, 0));
      m.compose(
        new THREE.Vector3(t.x, y0 + t.h + t.rad * t.squash * 0.55, t.z),
        q,
        new THREE.Vector3(t.rad * 0.92, t.rad * t.squash, t.rad * 0.82)
      );
      laub.setMatrixAt(i, m);
      // Dieselbe Farbe wie der Hüllkörper darunter, nur aufgehellt: Die Karten
      // sind das besonnte Äußere derselben Krone, nicht eine zweite Pflanze.
      laub.setColorAt(i, t.col.clone().lerp(new THREE.Color(0xffffff), 0.55));
    });
    laub.instanceMatrix.needsUpdate = true;
    if (laub.instanceColor) laub.instanceColor.needsUpdate = true;
    laub.castShadow = false;
    laub.receiveShadow = false;
    laub.userData.fullCount = nahBaeume.length;
    group.add(laub);
  }

  // **Stämme nur im Nahbereich.** Ab etwa fünfundzwanzig Metern ist ein Stamm
  // von 20 cm Durchmesser schmaler als ein Bildpunkt; man bezahlt ihn und sieht
  // ihn nicht. Was man dort sieht, ist die Kronenschicht – und die steht.
  const nah = trees.filter((t) => t.dist < 26);
  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshLambertMaterial({ color: 0x40342a, side: THREE.DoubleSide }),
    nah.length
  );
  trunks.name = 'dojo-wald-staemme';
  nah.forEach((t, i) => {
    q.setFromEuler(e.set(0, t.ry, 0));
    const rr = 0.09 + t.rad * 0.045;
    m.compose(new THREE.Vector3(t.x, y0, t.z), q, new THREE.Vector3(rr, t.h + t.rad * 0.4, rr));
    trunks.setMatrixAt(i, m);
  });
  trunks.instanceMatrix.needsUpdate = true;
  trunks.castShadow = false;
  trunks.receiveShadow = false;
  trunks.userData.fullCount = nah.length;
  group.add(trunks);

  return { trees: trees.length, staemme: nah.length };
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
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: groundTexture() }));
  ground.name = 'dojo-exterior-ground';
  ground.receiveShadow = true;
  group.add(ground);

  // --- Halme ---------------------------------------------------------------
  //
  // Zwei Gruppen, eine Instanz. Die Gruppe im Osten liefert die Schatten auf
  // dem Papier, die im Süden den Blick durch die Front.
  const culms = [];
  const r = rng(0xba3b0);
  for (const patch of [...EXTERIOR.grove, EXTERIOR.south]) {
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
        // Dichte des Laubs je Abschnitt – siehe `EXTERIOR.grove` in layout.js.
        tuffs: patch.tuffs ?? 6,
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
  //
  // **Weniger, dafür größere Schöpfe – seit sie aus Karten bestehen.**
  //
  // Die alten Schöpfe waren zwei gekreuzte Vierecke mit einer gemalten
  // Blattkarte darauf: vier Dreiecke, aber auch zwei sichtbare Rechtecke, und
  // aus der Nähe las sich der Hain als Scherenschnitt aus grellgrünen Sternen.
  // Ein Kartenbüschel kostet das Achtfache und braucht deshalb ein Achtel der
  // Zahl; die Fläche bleibt gleich, weil die Schöpfe entsprechend größer sind.
  // Reichweite eines Schopfes aus der Geometrie, nicht geschätzt. Ein
  // geschätzter Wert wäre genau die Sorte Zahl, die beim nächsten Verstellen
  // von `cardScale` still falsch wird – und dieser Fehler ist überhaupt erst
  // entstanden, weil die Schöpfe größer geworden sind.
  const leafGeo = cardCluster({
    count: 16,
    radius: 1,
    seed: 0xba11,
    kind: 'bamboo',
    cardScale: 0.52,
  });
  const leafReach = leafGeo.boundingSphere ? leafGeo.boundingSphere.radius : 1.3;

  const leaves = [];
  for (const c of culms) {
    const bunches = Math.max(1, c.tuffs - 1 + Math.floor(r() * 3));
    for (let b = 0; b < bunches; b++) {
      // **Deutlich tiefer.** Die Schöpfe saßen bei 0,68–0,98 der Halmhöhe, also
      // nur ganz oben. Genau auf Horizonthöhe war der Hain damit ein Feld
      // kahler Stangen, durch das man hindurchsah – das war der Hauptgrund,
      // warum der Streifen Ferne im Türausschnitt stehen blieb.
      const t = 0.34 + r() * 0.62;
      const size = 1.15 + r() * 0.95;
      const lx = c.x + (r() - 0.5) * 0.55;
      const lz = c.z + (r() - 0.5) * 0.55;
      // Der Osthain steht 90 cm vor der Wand, und seine Halme neigen sich um
      // bis zu 0,08 rad – über elf Meter Höhe sind das 88 cm zur Seite.
      // Zusammen mit einem Schopf von zwei Metern Reichweite landet das
      // Blattwerk mitten im Raum, ohne dass ein einziger Halm die Wand
      // berührt. Gemessen waren es 66 von 699 Schöpfen, bis zu 2,6 m tief.
      if (intrudesRoom(lx, lz, size * leafReach)) continue;
      leaves.push({
        x: lx,
        y: EXTERIOR.ground.y + c.height * t,
        z: lz,
        size,
        turn: r() * Math.PI,
      });
    }
  }
  const bambooCards = foliageMaterial({
    atlas: leafAtlas('bamboo'),
    // Bambusblätter sind dünn und stehen fast immer im Gegenlicht, weil der
    // Hain im Osten vor der Sonne steht. Von allen Pflanzen im Bild ist das
    // die, bei der Transluzenz am meisten trägt.
    translucency: 0.75,
    transColor: 0xa9c664,
    // Bambus bewegt sich am stärksten – das ist das Erkennungszeichen der
    // Pflanze. Die Halme selbst stehen still (sie tragen die Schattenkarte),
    // also muss das Laub die ganze Bewegung liefern.
    windStrength: 0.11,
  });
  const leafMesh = new THREE.InstancedMesh(leafGeo, bambooCards, leaves.length);
  applyFoliageMaterial(leafMesh, bambooCards);
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
  const garden = buildGarden(group, r);
  buildForest(group, r);
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
    // Die Halme stehen still – aber das Laub nicht mehr. `updateFoliage()` setzt
    // nur eine Uniform je Material; die Instanzmatrizen bleiben unangetastet,
    // die Schattenkarte bleibt gültig, und die Auslenkung passiert im
    // Vertex-Shader. Das ist der Grund, warum Bewegung hier bezahlbar ist und
    // ein wiegender Halm es nicht wäre.
    update(time) {
      updateFoliage(time);
      // Nur die beiden Texturversätze der Kräuselung – kein Netz, keine
      // Matrix, keine Schattenkarte.
      if (garden.water) updateWater(garden.water.material, time);
    },
    // Für den Sonnenstand: Wo der Hain steht, muss auch das Schattenfrustum
    // hinreichen. `SUN.shadow.halfExtent` ist darauf ausgelegt; hier wird die
    // Annahme festgehalten, damit sie beim nächsten Verschieben auffällt.
    grovePeak: Math.max(
      ...EXTERIOR.grove.map((g) => Math.abs(g.x1 - SUN.target[0])),
      Math.abs(EXTERIOR.south.z1 - SUN.target[2])
    ),
  };
}
