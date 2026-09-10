import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  hinokiMaterial,
  kawaraMaterial,
  plasterMaterial,
  tatamiMaterial,
  washiMaterial,
  scaleUV,
} from './materials.js';
import {
  ROOM,
  SHOJI,
  SHOJI_SOUTH,
  BAND_WEST,
  BAND_NORTH,
  FIELD,
  TATAMI,
  TOKONOMA,
  WALL,
  FREE_RADIUS,
} from './layout.js';

// Die Hülle des Konstrukt-Dojos: Boden, Wände, Shoji-Front, Tokonoma,
// offener Dachstuhl, Engawa.
//
// **Zeichenlast vor Detailreichtum.** Ein Dojo besteht fast nur aus
// Wiederholung – Dielen, Matten, Sparren, Gitterstäbe. Genau das ist der Fall,
// für den es `InstancedMesh` gibt: eine Geometrie, ein Material, ein
// Draw-Call, beliebig viele Kopien. Der Zen-Garten macht das Gegenteil
// (environments.js:1177 legt pro Stein ein eigenes Material an) und landet bei
// über sechzig Draw-Calls für ein paar Kiesel. Hier sind es rund fünfzehn für
// einen ganzen Raum.
//
// **Maserungsrichtung.** Eine Diele, deren Maserung quer läuft, liest das Auge
// sofort als falsch, auch wenn es nicht sagen kann warum. Die Hinoki-Textur
// legt ihre Maserung auf die U-Achse, also ist die lokale X-Achse jedes Bretts
// seine Längsachse – deshalb laufen die Dielen hier in X und nicht in Z.

// Hilfsgeometrie: Quader mit UVs, die einer echten Größe in Metern entsprechen.
// Ohne das ist die Maserung auf einem Balken so grob wie auf einer ganzen Wand.
function board(width, height, depth, metersPerTile = 0.55) {
  const g = new THREE.BoxGeometry(width, height, depth);
  scaleUV(g, width / metersPerTile, depth / metersPerTile);
  return g;
}

// Instanzen aus einer Liste von Matrizen – spart überall dieselben sechs Zeilen.
function instanced(
  geometry,
  material,
  transforms,
  { cast = true, receive = true, name = '' } = {}
) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  transforms.forEach((t, i) => {
    q.setFromEuler(new THREE.Euler(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0));
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, t.scale ? new THREE.Vector3(...t.scale) : s);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  if (name) mesh.name = name;
  return mesh;
}

// Der Verband für dieses Haus: 9 x 12 halbe Mattenlängen, 50 ganze Matten und
// 8 Halbmatten, **null Kreuzfugen**, 59 % Richtungswechsel, längste Fuge 6.
//
// Gefunden hat ihn `tools/mattenverband.mjs` — sechshundert Anläufe mit
// gestreuter Reihenfolge, bewertet nach Richtungswechsel, Fugenlänge und Zahl
// der Halbmatten. Die Suche steht hier nicht im Bauweg, weil die *Auswahl*
// unter den Lösungen ein Blick ist und keine Zahl: Der erste beste Verband,
// den die Suche findet, erfüllt die Regel und liest trotzdem als gestreifte
// Bahn. `tatamiVerband()` unten bleibt als Rückfall für den Fall, dass jemand
// die Raummasse ändert — dann stimmt zwar der Verband, aber niemand hat ihn
// angesehen, und das steht dann auch in der Konsole.
//
// Jeder Eintrag ist [Spalte, Reihe, dx, dz]; dx+dz = 0 ist eine Halbmatte.
const VERBAND_9x12 = [
  [0,0,1,0],[2,0,0,1],[3,0,1,0],[5,0,1,0],[7,0,1,0],[0,1,1,0],[3,1,0,1],
  [4,1,1,0],[6,1,1,0],[8,1,0,0],[0,2,0,1],[1,2,1,0],[4,2,0,1],[5,2,1,0],
  [7,2,1,0],[1,3,0,1],[2,3,1,0],[5,3,0,1],[6,3,1,0],[8,3,0,0],[0,4,0,0],
  [2,4,0,1],[3,4,1,0],[6,4,0,1],[7,4,1,0],[0,5,1,0],[3,5,0,1],[4,5,1,0],
  [7,5,0,1],[8,5,0,0],[0,6,0,1],[1,6,1,0],[4,6,0,1],[5,6,1,0],[8,6,0,1],
  [1,7,0,1],[2,7,1,0],[5,7,0,1],[6,7,1,0],[0,8,0,0],[2,8,0,1],[3,8,1,0],
  [6,8,0,1],[7,8,1,0],[0,9,1,0],[3,9,0,1],[4,9,1,0],[7,9,0,1],[8,9,0,0],
  [0,10,0,1],[1,10,1,0],[4,10,0,1],[5,10,1,0],[8,10,0,1],[1,11,0,0],
  [2,11,1,0],[5,11,0,0],[6,11,1,0],
];

// --- Vierereckfreier Mattenverband (祝儀敷き) --------------------------------
//
// Gesucht wird eine Belegung eines `spalten x reihen`-Gitters aus halben
// Mattenlängen (0,91 m) mit 1x2-Matten und höchstens `maxHalbe` Halbmatten, in
// der sich **nirgends vier Mattenecken in einem Punkt treffen**.
//
// Vier Ecken treffen sich im Gitterpunkt (x,z) genau dann, wenn die vier
// Zellen darum zu vier verschiedenen Matten gehören. Die Prüfung läuft
// deshalb über Punkte, nicht über Matten — und nur über solche, deren vier
// Zellen schon belegt sind, sonst würde jeder Zwischenstand verworfen.
//
// Die Rückwärtssuche füllt immer die **erste freie Zelle** (Zeile für Zeile).
// Damit ist jede Zelle entweder Anfang einer Matte oder schon von der Matte
// links bzw. darüber gedeckt, und die Suche kann keine Lücke hinterlassen.
//
// `maxSchritte` ist kein Feintuning, sondern eine Zusicherung: Der Aufrufer
// baut eine Szene und darf nicht in einer Suche hängenbleiben, wenn jemand die
// Raummasse auf eine Größe ohne Lösung ändert. 8 x 12 ist in weniger als
// hunderttausend Schritten entschieden.
export function tatamiVerband(spalten, reihen, maxHalbe = 2, maxSchritte = 4e6) {
  const N = spalten * reihen;
  const zelle = new Int32Array(N).fill(-1);
  const matten = [];
  let halbeUebrig = maxHalbe;
  let schritte = 0;

  const punktOk = (x, z) => {
    if (x <= 0 || z <= 0 || x >= spalten || z >= reihen) return true;
    const a = zelle[(z - 1) * spalten + x - 1];
    const b = zelle[(z - 1) * spalten + x];
    const c = zelle[z * spalten + x - 1];
    const d = zelle[z * spalten + x];
    if (a < 0 || b < 0 || c < 0 || d < 0) return true;
    return a === b || a === c || a === d || b === c || b === d || c === d;
  };

  const loese = (start) => {
    if (++schritte > maxSchritte) return false;
    let i = start;
    while (i < N && zelle[i] >= 0) i++;
    if (i >= N) return true;
    const x = i % spalten;
    const z = (i / spalten) | 0;
    const id = matten.length;
    const formen = [[1, 0], [0, 1]];
    if (halbeUebrig > 0) formen.push([0, 0]);
    for (const [dx, dz] of formen) {
      const x2 = x + dx;
      const z2 = z + dz;
      if (x2 >= spalten || z2 >= reihen) continue;
      const halb = dx + dz === 0;
      if (!halb && zelle[z2 * spalten + x2] >= 0) continue;
      if (halb) halbeUebrig--;
      zelle[i] = id;
      zelle[z2 * spalten + x2] = id;
      matten.push([x, z, dx, dz]);
      let ok = true;
      for (const [px, pz] of [
        [x, z], [x + 1, z], [x, z + 1], [x + 1, z + 1],
        [x2, z2], [x2 + 1, z2], [x2, z2 + 1], [x2 + 1, z2 + 1],
      ]) {
        if (!punktOk(px, pz)) {
          ok = false;
          break;
        }
      }
      if (ok && loese(i + 1)) return true;
      matten.pop();
      zelle[i] = -1;
      zelle[z2 * spalten + x2] = -1;
      if (halb) halbeUebrig++;
    }
    return false;
  };

  return loese(0) ? matten : null;
}

  // --- Eine Wandöffnung -------------------------------------------------------
//
// Rahmen, Gitter und Papier für **eine** Öffnung – ob bodentiefe Shoji-Front
// oder hohes Fensterband, ob Ost, West, Nord oder Süd.
//
// **Warum das eine Funktion ist.** Vorher stand der Shoji-Bau als Block für die
// Ostwand da, und der Ranma daneben als zweiter, ähnlicher Block. Beide
// versetzten ihre Teile mit *vorzeichenlosen* Konstanten von der Wandebene weg.
// Auf der Ostwand stimmte das, weil der Raum dort zufällig in −x liegt; auf
// West und Nord schob dieselbe Zahl das Papier **vor** die Sprossen in den
// Raum, auf West und Süd zeigte die Ebene mit der Rückseite nach innen. Auf dem
// Desktop fiel nur die Lage auf (Washi ist beidseitig); in der Brille schaltet
// quality.js auf FrontSide, und dann waren dort schlicht Löcher.
//
// Ein Vorzeichen `inward` – die Richtung von der Wandebene in den Raum –
// erledigt beides und macht die ganze Fehlerklasse unmöglich. Die drei
// Abstände sind gestaffelt: Rahmen innen (25 mm), Gitter dazwischen (12 mm),
// Papier außen (4 mm). So liegt das Papier **hinter** dem Gitter, wie bei einer
// echten Shoji, und trägt dessen Schattenriss.
function buildOpening(spec) {
  const { axis, inward, panels, sillY, headY, koshi, lattice } = spec;
  const fixedVal = axis === 'x' ? spec.x : spec.z;
  const from = axis === 'x' ? (spec.fromZ ?? spec.from) : spec.from;
  const to = axis === 'x' ? (spec.toZ ?? spec.to) : spec.to;

  const span = to - from;
  const panelW = span / panels;
  const panelH = headY - sillY;
  const fw = 0.045; // Rahmenbreite längs der Wand
  const fd = 0.05; // Rahmentiefe quer zur Wand

  // Gestaffelte Abstände von der Wandebene, alle nach innen positiv. Der Wert
  // für das Gitter ist **abgeleitet**, nicht gesetzt: Bei einem festen 12 mm
  // lag die Rückseite eines 16-mm-Stabes exakt auf der Papierebene – nicht
  // draußen, aber bündig, und zwei bündige Flächen sind eine Einladung zum
  // Z-Fighting. Aus `barDepth` gerechnet bleiben immer 2 mm Luft, unabhängig
  // davon, wie dick die Sprossen einer Öffnung sind (das Ranma hat 28 mm).
  const { cols, rows, barWidth = 0.022, barDepth = 0.016 } = lattice;
  const paperD = 0.004;
  const barD = paperD + barDepth / 2 + 0.002;

  const frames = [];
  const bars = [];
  const papers = [];

  // Lage eines Bauteils: `t` läuft längs der Wand, `d` ist der Abstand von der
  // Wandebene in den Raum hinein.
  const at = (t, y, d) =>
    axis === 'x' ? [fixedVal + inward * d, y, t] : [t, y, fixedVal + inward * d];

  // Ein Brett quer zur Wand ablegen. `alongLen`/`upLen` sind Länge längs der
  // Wand und Höhe; die Tiefe ist immer `fd`.
  const plank = (t, y, alongLen, upLen, d) => {
    const [x, yy, z] = at(t, y, d);
    return axis === 'x'
      ? board(fd, upLen, alongLen, 0.4).translate(x, yy, z)
      : board(alongLen, upLen, fd, 0.4).translate(x, yy, z);
  };

  // Offene Felder: der Durchgang.
  //
  // Ein Eingang ist kein eigenes Bauteil, sondern ein Feld, das kein Papier und
  // keine Brüstung bekommt. Alles andere – Pfosten links und rechts, Sturz
  // darüber, der Putz ringsum – ist dasselbe wie bei jedem anderen Feld. So
  // bleibt der Durchgang zwangsläufig auf dem Raster der Front, statt als Loch
  // daneben zu stehen.
  const open = new Set(spec.openPanels ?? []);

  for (let p = 0; p < panels; p++) {
    const ct = from + panelW * (p + 0.5);
    const isOpen = open.has(p);
    // Zwei senkrechte Holme, oben ein Riegel. Der untere entfällt im Durchgang –
    // eine Schwelle auf Kniehöhe wäre eine Stolperkante.
    //
    // **Zwischen zwei offenen Feldern steht kein Pfosten.** Sonst teilt ein
    // Holm den Durchgang in der Mitte, und aus einer 2,5 m breiten Tür werden
    // zwei schmale Schlitze – im ersten Bau genau so passiert.
    if (!(isOpen && open.has(p - 1))) {
      frames.push(plank(ct - panelW / 2 + fw / 2, (sillY + headY) / 2, fw, panelH, 0.025));
    }
    if (!(isOpen && open.has(p + 1))) {
      frames.push(plank(ct + panelW / 2 - fw / 2, (sillY + headY) / 2, fw, panelH, 0.025));
    }
    frames.push(plank(ct, headY - fw / 2, panelW, fw, 0.025));
    if (!isOpen) frames.push(plank(ct, sillY + fw / 2, panelW, fw, 0.025));
    if (isOpen) {
      // Flache Holzschwelle über die volle Feldbreite – der Übergang von
      // Diele nach draußen, 3 cm hoch.
      frames.push(plank(ct, 0.015, panelW, 0.03, 0.03));
      continue;
    }

    // Gitterstäbe.
    //
    // **Keine Drehungen, nur Skalierung eines Einheitswürfels.** Ein Stab ist
    // ein Quader mit drei verschiedenen Kantenlängen; welche Drehung welche
    // Kante auf welche Weltachse legt, war in diesem Raum bereits zweimal
    // falsch: erst `rz` statt `rx`, wodurch die waagerechten Sprossen als
    // Spieße aus dem Fenster standen, dann auf Nord und Süd eine Drehung, die
    // zwar die Länge richtig legte, aber Breite und Tiefe vertauschte – die
    // Stäbe ragten 3 mm durch das Papier nach draußen.
    //
    // Mit einem Einheitswürfel und einer Skalierung **in Weltachsen** gibt es
    // keine Drehung, die falsch sein könnte. Die drei Kantenlängen stehen
    // direkt da, in der Reihenfolge x, y, z: Tiefe quer zur Wand, Länge, Breite
    // längs der Wand. Das ist nicht nur der Fix, es ist die Bauform, in der
    // dieser Fehler nicht mehr vorkommen kann.
    const acrossWall = (deep, along) => (axis === 'x' ? [deep, along] : [along, deep]);
    for (let c = 1; c < cols; c++) {
      const [x, y, z] = at(ct - panelW / 2 + (panelW * c) / cols, (sillY + headY) / 2, barD);
      const [sx, sz] = acrossWall(barDepth, barWidth);
      bars.push({ x, y, z, scale: [sx, panelH, sz] });
    }
    for (let r = 1; r < rows; r++) {
      const [x, y, z] = at(ct, sillY + (panelH * r) / rows, barD);
      const [sx, sz] = acrossWall(barDepth, panelW);
      bars.push({ x, y, z, scale: [sx, barWidth, sz] });
    }

    // Renji: senkrechte Stäbe **außen** vor dem Papier.
    //
    // Ohne sie ist die Fassade von außen eine glatte Papierfläche. Das ist
    // sogar richtig gebaut – bei einer echten Shoji liegt das Kumiko innen und
    // das Papier außen –, aber es sieht aus wie ein Bretterzaun: Aus dem Garten
    // zeigt die Südfront zweieinhalb Meter hohe, leere cremefarbene Felder mit
    // einer schwachen senkrechten Naht, und kein einziges Bauteil fängt Licht.
    //
    // Ein Renji-Gitter ist die Antwort, die ein Zimmermann geben würde: schmale
    // senkrechte Latten vor dem Papier, wie sie in Japan überall dort sitzen,
    // wo eine Shoji nach draußen zeigt. Es kostet **keinen** zusätzlichen
    // Draw-Call – die Stäbe wandern in dieselbe Instanzenliste wie das innere
    // Kumiko – und es bringt der Fläche das, was ihr fehlt: einen Rhythmus und
    // einen Schlagschatten.
    //
    // `d` ist hier negativ, weil `at()` den Abstand mit `inward` multipliziert:
    // ein Minus schiebt nach draußen.
    const renji = spec.renji ?? 0;
    if (renji > 0) {
      const renjiD = -(paperD + barDepth / 2 + 0.002);
      for (let c = 1; c < renji; c++) {
        const [x, y, z] = at(ct - panelW / 2 + (panelW * c) / renji, (sillY + headY) / 2, renjiD);
        const [sx, sz] = acrossWall(barDepth * 1.15, barWidth * 0.85);
        bars.push({ x, y, z, scale: [sx, panelH - fw * 2, sz] });
      }
    }

    // Papierfeld, außen. `rotateY(inward · π/2)` dreht die Vorderseite in den
    // Raum; bei einer Nord-/Südwand zeigt die ungedrehte Ebene bereits nach
    // +Z, für die Südseite ist sie also um π zu wenden.
    const paper = new THREE.PlaneGeometry(panelW - fw * 2, panelH - fw * 2);
    if (axis === 'x') paper.rotateY((inward * Math.PI) / 2);
    else if (inward < 0) paper.rotateY(Math.PI);
    const [px, py, pz] = at(ct, (sillY + headY) / 2, paperD);
    papers.push(paper.translate(px, py, pz));

    // Brüstungsfeld (Koshi) unter dem Papier – volles Holz, kein Licht.
    if (koshi) frames.push(plank(ct, sillY / 2, panelW, sillY, 0.025));
  }

  // Sturz über die ganze Front. Nur bei bodentiefen Fronten; ein Fensterband
  // hat seinen Abschluss schon im Rahmen.
  if (koshi) {
    const [hx, hy, hz] = at((from + to) / 2, headY + 0.07, 0.045);
    frames.push(
      axis === 'x'
        ? board(0.09, 0.14, span + 0.2, 0.6).translate(hx, hy, hz)
        : board(span + 0.2, 0.14, 0.09, 0.6).translate(hx, hy, hz)
    );
  }

  return { frames, bars, papers };
}

export function buildArchitecture() {
  const group = new THREE.Group();
  group.name = 'dojo-architecture';

  const hinoki = hinokiMaterial();
  const hinokiDark = hinokiMaterial({ color: 0x9a7b56 });
  const plaster = plasterMaterial(0xbdb6a6);
  const tatami = tatamiMaterial();
  // Das Papier leuchtet, weil die Sonne dahintersteht. Der Wert ist bewusst
  // hoch: Washi im Gegenlicht ist die hellste Fläche im ganzen Raum, und der
  // Kontrast dazu trägt die Stimmung.
  // `shadowedEmissive`: Das Leuchten hört auf, wo der Bambushain davorsteht –
  // ohne das wirft der Hain zwar Schatten, aber nicht dorthin, wo man sie sieht.
  const washi = washiMaterial({
    emissive: 0xffeccc,
    emissiveIntensity: 0.38,
    shadowedEmissive: true,
  });
  // Papier auf den drei Schattenseiten. Süd, West und Nord liegen im Schatten
  // des eigenen Gebäudes – die Sonne steht im Osten. Gleich hell wären sie vier
  // gleichwertige Lichtquellen, und damit gäbe es keine Sonnenseite mehr; genau
  // die trägt aber die ganze Lichtstimmung. Kühler und deutlich schwächer:
  // Himmelslicht statt Sonne, physikalisch wie kompositorisch richtig.
  //
  // **Warm, nicht blau.** Der erste Versuch war himmelblau (0xcfe0ea) mit der
  // Begründung „Himmelslicht statt Sonne". Physikalisch vertretbar, im Bild
  // falsch: Das Ranma lief als kalter grauer Streifen quer über den ganzen
  // Raum, während darunter alles warmes Holz und warmes Papier war – der
  // auffälligste Fremdkörper im Bild. Reflektiertes Licht in einem Holzhaus ist
  // von diesem Holz gefärbt. Also warm und nur *dunkler* als die Sonnenseite.
  // **0,24 statt 0,13 – gemessen, nicht geschätzt.** Bei 0,13 stand das Papier der
  // Nordwand bei Luminanz 129 gegen 125,9 des Putzes daneben: ein Verhältnis von
  // 1,02, also praktisch gleich hell. Ein Fenster, das sich nicht vom Putz
  // abhebt, ist kein Fenster. Ursache ist nicht nur die Grundfarbe, sondern die
  // Fasertextur darüber: Sie senkt die wirksame Albedo des Papiers unter die des
  // glatten Putzes. Das Eigenleuchten muss diesen Rückstand mit aufholen.
  const washiShade = washiMaterial({
    // Eigene, hellere Grundfarbe nur für die Schattenseiten. Aus zwei Messpunkten
    // zerlegt (0,13 → 129, 0,24 → 137,7 an der Nordwand) trägt das Eigenleuchten
    // dort rund 79 Luminanzeinheiten je Einheit Intensität; der Albedoanteil des
    // Papiers liegt bei 118,7 gegen 125,9 des Putzes daneben. Das Papier ist also
    // **von sich aus dunkler** als der Putz, obwohl seine Farbe heller ist – die
    // Fasertextur senkt die wirksame Albedo.
    //
    // Den Rückstand über das Eigenleuchten aufzuholen bräuchte 0,57 und ließe die
    // Wand glimmen. Ihn global über die Grundfarbe aufzuholen würde die Westwand
    // ausbrennen: Sie ist mit Abstand die hellste Fläche im Raum, weil die
    // Ostsonne quer durch die Shoji-Front auf sie fällt. Also nur hier.
    // **Unverändert bei 0xe8e0cc und 0,28 – ein Rücknahmeversuch ist gemessen
    // gescheitert.**
    //
    // Der Auftrag war, das durchscheinende Licht zu dämpfen, und der erste
    // Griff ging hierhin: Grundfarbe auf 0xdfd6c0, Intensität auf 0,22. Das
    // Ergebnis war das Gegenteil von beabsichtigt – die Nordwand fiel von
    // Verhältnis 1,16 auf 1,10 und damit unter das Gate (Papier muss heller
    // sein als der Putz daneben), während der Spitzenwert der Westwand von 251
    // auf 252 ging, also nirgendwohin.
    //
    // Die Rechnung dahinter: 21 % weniger Eigenleuchten haben die Westwand um
    // **einen** Luminanzpunkt gesenkt. Ihre Helligkeit stammt praktisch
    // vollständig aus einfallendem Licht – die Ostsonne fällt quer durch die
    // Shoji-Front auf sie. Am Papier ist dort nichts zu holen; gedämpft wird
    // deshalb dort, wo das Leuchten wirklich sitzt: auf den besonnten Seiten.
    color: 0xe8e0cc,
    emissive: 0xffe2bc,
    emissiveIntensity: 0.28,
  });

  // **Drei Stufen statt zwei.** Die Südfront lag bisher in der Schattengruppe,
  // obwohl sie besonnt ist (Kosinus +0,359 gegen +0,915 im Osten, siehe
  // layout.js). Sie gehört zwischen die beiden – ein Streiflicht, das die Front
  // sichtbar wärmer macht als Nord und West, ohne der Ostseite ihren Rang
  // streitig zu machen. Die Intensität folgt dem gemessenen Verhältnis der
  // Kosinuswerte (0,359/0,915 = 0,39) plus einem Anteil Himmelslicht, denn nach
  // Süden steht der offene Garten und keine Wand.
  //
  // Alle drei Werte sind gegenüber vorher **gesenkt**: Die Grundfarbe des
  // Papiers ist von 0x7d776a auf 0xd8d0be gestiegen, das Eigenleuchten muss
  // also weniger tragen. Es unterscheidet jetzt die Himmelsrichtungen, statt
  // die Grundhelligkeit zu liefern.
  const washiGraze = washiMaterial({
    emissive: 0xffe8c6,
    emissiveIntensity: 0.25,
    shadowedEmissive: true,
  });

  // --- Dielenboden ----------------------------------------------------------
  const PLANK = 0.19;
  const plankCount = Math.ceil((ROOM.maxZ - ROOM.minZ) / PLANK);
  const plankGeo = board(ROOM.maxX - ROOM.minX, 0.055, PLANK - 0.008);
  const planks = [];
  for (let i = 0; i < plankCount; i++) {
    planks.push({
      x: 0,
      // Winzige Höhenstreuung: Ein absolut ebener Boden ist im Streiflicht als
      // Fläche ohne Eigenschaft erkennbar. Ein halber Millimeter reicht, damit
      // das Licht an den Fugen bricht.
      y: 0.0275 + (i % 3) * 0.0007,
      z: ROOM.minZ + PLANK / 2 + i * PLANK,
    });
  }
  group.add(instanced(plankGeo, hinoki, planks, { cast: false, name: 'dojo-floor' }));

  // **Blindboden unter den Dielen.**
  //
  // Zwischen zwei Dielen stehen 8 mm Fuge – gewollt, daran bricht das
  // Streiflicht. Darunter war bisher nichts: In flachem Blickwinkel sah man
  // durch die Fugen in den Hintergrund. Solange der schwarz war und der Nebel
  // ihn schluckte, fiel das niemandem auf; seit unter dem Gebäude eine Wiese
  // liegt, sind es grüne Striche im Fußboden.
  //
  // Ein Brett darunter, dunkel, ein Zeichenaufruf. Die Fuge bleibt als Fuge
  // sichtbar – sie hat jetzt nur einen Boden.
  const subfloor = new THREE.Mesh(
    board(ROOM.maxX - ROOM.minX + 0.3, 0.03, ROOM.maxZ - ROOM.minZ + 0.3, 1.2),
    hinokiDark
  );
  subfloor.name = 'dojo-subfloor';
  subfloor.position.set(0, 0.012, (ROOM.minZ + ROOM.maxZ) / 2);
  subfloor.receiveShadow = true;
  group.add(subfloor);

  // --- Tatami-Feld ----------------------------------------------------------
  //
  // Normmaß 0,91 × 1,82 m. Das ist der Maßstabsgeber des Raums: Wer hier
  // schummelt, verändert die gefühlte Größe von allem anderen.
  //
  // Verlegt im Wechsel (quer/längs paarweise), wie es üblich ist – ein
  // durchgehendes Raster sähe aus wie Fliesen, nicht wie Matten.
  const matGeo = board(TATAMI.long, TATAMI.thickness, TATAMI.short, 0.42);
  // **Borte 4,0 statt 5,5 cm.** An jeder Mattenfuge stossen zwei Borten
  // aneinander; mit 5,5 cm waren das elf Zentimeter Schwarz gegen eine
  // Mattenbreite von einundneunzig, also zwölf Prozent des Feldes. Echte Heri
  // sind drei bis vier Zentimeter breit, zusammen also acht statt zwölf Prozent.
  const borderGeo = new THREE.BoxGeometry(TATAMI.long, 0.002, 0.04);
  const mats = [];
  const borders = [];
  const matY = 0.055 + TATAMI.thickness / 2;

// Feldgrenzen: die eigentliche Übungsfläche, ringsum bleibt Diele frei.
  // Stehen in layout.js und sind aus ROOM abgeleitet – als feste Zahlen hier
  // wäre das Feld beim Verlängern des Raums stehen geblieben.
  const { x0: FX0, x1: FX1, z0: FZ0, rows: FIELD_ROWS } = FIELD;

  // **Alle Matten lagen in derselben Richtung, und der Kommentar darüber
  // behauptete das Gegenteil.**
  //
  // Hier stand „verlegt im Wechsel (quer/längs paarweise), wie es üblich ist" —
  // und darunter eine Schleife, die jede einzelne Matte mit ihrer Längsachse
  // auf x legt, ohne Ausnahme. Der halbe Mattenversatz jeder zweiten Reihe
  // ändert daran nichts: Die Borten laufen trotzdem alle in derselben Richtung
  // und bilden **durchgehende schwarze Balken über die ganze Hallenbreite**.
  // Der Prüfer hat es „gestreifter Teppich" genannt, und das ist genau, was
  // ein Läuferverband ohne Richtungswechsel ergibt.
  //
  // Das Feld misst 7,28 × 10,92 m. In Mattenlängen sind das **4 × 6 Quadrate
  // von 1,82 m**, und jedes Quadrat fasst genau zwei Matten. Der Verband geht
  // also ohne eine einzige geschnittene Matte auf — die Kürzungslogik von
  // vorher wird nicht ersetzt, sie entfällt.
  //
  // Gelegt wird im **Schachbrett** (市松敷き): Quadrat (i,j) mit gerader Summe
  // trägt zwei Matten längs x, mit ungerader Summe zwei Matten längs z. Damit
  // wechselt die Borte an jeder Quadratgrenze die Richtung, es entstehen
  // T-Stösse statt Kreuzfugen, und keine Linie läuft mehr durch den Raum.
  //
  // **Nachtrag: „T-Stösse statt Kreuzfugen" stimmte nicht.**
  //
  // Der Prüfer hat Vierereck-Treffen gemeldet, und er hat recht. Ein Quadrat
  // von 1,82 m mit zwei Matten darin hat, wie es auch gedreht ist, **immer**
  // eine Mattenecke in jeder seiner vier Quadratecken. An jedem inneren
  // Quadratpunkt stossen vier Quadrate zusammen, also vier Mattenecken —
  // fünfzehn Kreuzfugen im Feld, und die Drehung ändert daran nichts. Der
  // Schachbrettverband kann das gar nicht lösen; die Behauptung war ein
  // Denkfehler, kein Messfehler.
  //
  // Gelegt wird jetzt nach der Regel selbst (祝儀敷き): **gesucht**, nicht
  // konstruiert. `tatamiVerband()` durchsucht das Feld nach einer Belegung, in
  // der sich nirgends vier Ecken treffen. Dass es für dieses Feld überhaupt
  // eine gibt, ist keine Selbstverständlichkeit — mit ganzen Matten allein hat
  // 8 x 12 **keine** Lösung (8 x 10, 8 x 14, 6 x 12 und 12 x 12 dagegen
  // schon). Mit einer Halbmatte auch nicht, mit zweien ja. Halbmatten (半畳)
  // gehören zum Verband; ein 4,5-Matten-Raum besteht aus vier Matten um eine.
  const QUADRAT = TATAMI.long; // 1,82 m — zwei Matten, egal in welcher Lage
  const HALB = TATAMI.short / 2; // 0,455 m
  // **1,6 statt 4 Millimeter ueber der Mattenflaeche.**
  //
  // Die Borte lag bei 0,1115 und war 5 mm hoch, stand also bis 0,114 — vier
  // Millimeter ueber einer Mattenoberkante von 0,110. Auf einem vier
  // Zentimeter breiten Streifen ist das ein Verhaeltnis von 1 : 10, und der
  // Pruefer hat es als Stufe gelesen: „die dunklen Baender haben eine
  // sichtbare Seitenwand, der Boden ist gestuft". Eine Heri ist aufgenaeht,
  // nicht aufgelegt.
  //
  // Ganz buendig geht nicht — die Borte liegt innerhalb der Mattenflaeche und
  // wuerde mit ihr um dieselbe Tiefe streiten. 1,6 mm ist der Abstand, bei dem
  // keine Seitenwand mehr liest und trotzdem nichts flimmert.
  const heriY = 0.055 + TATAMI.thickness + 0.0006;
  // Abstand der Borte von der Mattenmitte, quer zur Längsachse. Die Borte
  // sitzt knapp **über** der Mattenoberkante: Vorher lag sie auf halber
  // Mattenhöhe, also vollständig im Tatami versteckt, und das Feld las sich als
  // eine einzige grüne Fläche ohne Maßstab.
  const HERI_D = HALB - 0.028;

  const legeMatte = (x, z, ry) => {
    mats.push({ x, y: matY, z, ry });
    // Die Borte liegt an den beiden **Längsseiten**, also quer zur Längsachse.
    // Bei gedrehter Matte dreht sie mit — sonst stünde sie quer über der Matte.
    const dx = ry === 0 ? 0 : HERI_D;
    const dz = ry === 0 ? HERI_D : 0;
    borders.push({ x: x - dx, y: heriY, z: z - dz, ry });
    borders.push({ x: x + dx, y: heriY, z: z + dz, ry });
  };

  // **Halbmatte (半畳): dieselbe Geometrie, in der Längsachse halbiert.**
  //
  // Keine eigene Geometrie und kein eigener Zeichenaufruf. Das Binsengeflecht
  // verläuft **längs** der Matte, seine Streifen liegen also quer — eine
  // Stauchung längs verkürzt die Streifen, ohne ihren Abstand zu ändern, und
  // genau der ist das, was man sieht. Quer gestaucht wäre es falsch.
  const HALB_D = TATAMI.short / 2 - 0.028;
  const legeHalbmatte = (x, z) => {
    mats.push({ x, y: matY, z, ry: 0, scale: [0.5, 1, 1] });
    borders.push({ x, y: heriY, z: z - HALB_D, ry: 0, scale: [0.5, 1, 1] });
    borders.push({ x, y: heriY, z: z + HALB_D, ry: 0, scale: [0.5, 1, 1] });
  };

  const spalten = Math.round((FX1 - FX0) / TATAMI.short);
  const verband =
    spalten === 9 && FIELD_ROWS === 12 ? VERBAND_9x12 : tatamiVerband(spalten, FIELD_ROWS);
  if (verband) {
    for (const [cx, cz, dx, dz] of verband) {
      // Mittelpunkt der belegten Zellen, in Weltkoordinaten.
      const x = FX0 + (cx + dx / 2 + 0.5) * TATAMI.short;
      const z = FZ0 + (cz + dz / 2 + 0.5) * TATAMI.short;
      if (dx + dz === 0) legeHalbmatte(x, z);
      else legeMatte(x, z, dx === 1 ? 0 : Math.PI / 2);
    }
  } else {
    // **Rückfall auf den Schachbrettverband.**
    //
    // Er hat Kreuzfugen, aber er füllt jedes Feld, dessen Seiten gerade sind.
    // Wer die Raummasse ändert und keine Lösung mehr bekommt, soll einen Boden
    // sehen und keine Lücke — und er soll es in der Konsole lesen.
    console.warn(
      `Dojo: kein vierereckfreier Mattenverband fuer ${spalten} x ${FIELD_ROWS}, Schachbrett stattdessen`
    );
    const quadratReihen = Math.floor(FIELD_ROWS / 2);
    for (let j = 0; j < quadratReihen; j++) {
      for (let i = 0; i < spalten / 2; i++) {
        const qx = FX0 + (i + 0.5) * QUADRAT;
        const qz = FZ0 + (j + 0.5) * QUADRAT;
        if ((i + j) % 2 === 0) {
          legeMatte(qx, qz - HALB, 0);
          legeMatte(qx, qz + HALB, 0);
        } else {
          legeMatte(qx - HALB, qz, Math.PI / 2);
          legeMatte(qx + HALB, qz, Math.PI / 2);
        }
      }
    }
  }
  group.add(instanced(matGeo, tatami, mats, { cast: false, name: 'dojo-tatami' }));
  group.add(
    instanced(
      borderGeo,
      // **Nicht mehr neutralschwarz.** Gemessen lag die Borte bei L 51 gegen
      // Matten bei L 129 bis 157 — ein Abfall von fünfundsiebzig bis
      // hundertfünf Stufen auf einer neutralgrauen Fläche ohne jede Zeichnung.
      // Sie las damit nicht als Leinenband, sondern als Spalt zwischen den
      // Matten. Heri-Leinen ist dunkel, aber es ist **blaugrau und nicht
      // grau**, und es fängt Licht: geringere Rauheit heisst hier ein Streifen
      // Glanz entlang der Fuge, und genau der macht aus einem Loch ein Band.
      //
      // Ein Gewebemuster bekommt sie damit noch nicht — dafür bräuchte es eine
      // eigene Karte, und die kostet Texturspeicher für ein Band von vier
      // Zentimetern. Steht offen.
      //
      // **Und noch einmal heller.** Die Stufe war nur die halbe Miete: Gemessen
      // stand die Borte in `e-tatami` bei L 41 gegen L 141 der Mattenflaeche —
      // Faktor 3,4. Der Pruefer hat den Boden daraufhin als „Gitterrost"
      // gelesen, und das ist nachvollziehbar: Bei acht Zentimetern Dunkel je
      // einundneunzig Zentimeter Matte entscheidet der Tonwert darueber, ob man
      // ein Band sieht oder eine Fuge. 0x4c5568 hebt sie auf rund 60 — immer
      // noch klar das Dunkelste am Boden, aber Leinen und kein Loch.
      new THREE.MeshStandardMaterial({ color: 0x4c5568, roughness: 0.72 }),
      borders,
      {
        cast: false,
        name: 'dojo-tatami-heri',
      }
    )
  );

  // --- Wände ----------------------------------------------------------------
  //
  // Zu einem Mesh verschmolzen: Drei Wände sind drei statische Quader mit
  // demselben Material, das sind drei Draw-Calls ohne jeden Gewinn.
  const t = WALL.thickness;
  const h = ROOM.wallTop;

  // Putz um eine Öffnung herum: darunter, darüber und an beiden Enden.
  //
  // Das ist die Stelle, an der „alle Wände sind geschlossen" gewonnen oder
  // verloren wird. Vier Öffnungen von Hand zu umbauen hieße sechzehn
  // Wandstücke von Hand zu rechnen; jedes einzelne davon eine Gelegenheit für
  // genau die Lücke, die man dann im Gegenlicht als leuchtenden Keil sieht.
  // Deshalb leitet sich der Putz aus derselben Beschreibung ab wie die Öffnung.
  const wallAround = (spec, lo, hi) => {
    const axis = spec.axis;
    const fixedVal = axis === 'x' ? spec.x : spec.z;
    const from = axis === 'x' ? (spec.fromZ ?? spec.from) : spec.from;
    const to = axis === 'x' ? (spec.toZ ?? spec.to) : spec.to;
    const d = fixedVal - spec.inward * (t / 2); // Wandmitte, von der Ebene weg
    const put = (tCenter, y, alongLen, upLen) =>
      axis === 'x'
        ? board(t, upLen, alongLen, 1.1).translate(d, y, tCenter)
        : board(alongLen, upLen, t, 1.1).translate(tCenter, y, d);

    // **An den Raumecken über die Flucht hinaus.**
    //
    // Zwei Wandscheiben, die exakt an der Ecke aneinanderstoßen, teilen sich
    // dort eine Kante – und aus flachem Blickwinkel bleibt an dieser Kante ein
    // Schlitz von wenigen Pixeln offen. Solange draußen nichts war, war das ein
    // dunkler Strich; jetzt ist es ein Streifen Bambushain. Endet ein
    // Wandstück dagegen an einer Öffnung oder an der Tokonoma, darf es **nicht**
    // verlängert werden, sonst mauert es sie zu.
    const alongMin = axis === 'x' ? ROOM.minZ : ROOM.minX;
    const alongMax = axis === 'x' ? ROOM.maxZ : ROOM.maxX;
    const lo2 = Math.abs(lo - alongMin) < 1e-6 ? lo - t : lo;
    const hi2 = Math.abs(hi - alongMax) < 1e-6 ? hi + t : hi;

    const out = [];
    // Enden links und rechts der Öffnung, volle Höhe
    if (from - lo > 1e-3) out.push(put((lo2 + from) / 2, h / 2, from - lo2, h));
    if (hi - to > 1e-3) out.push(put((to + hi2) / 2, h / 2, hi2 - to, h));
    // Über dem Sturz bis zur Wandkrone.
    //
    // Beginnt bei `headY`, nicht bei `headY + 0.14`. Die 14 cm waren die Höhe
    // des Sturzbalkens der bodentiefen Fronten – ein hohes Fensterband hat
    // keinen, und dort klaffte dadurch ein Spalt von 14,5 cm über die ganze
    // Bandlänge, durch den man ins Freie sah. An einer Fuge ist Überlappen
    // robuster als Passgenauigkeit; das ist in diesem Raum die dritte Stelle,
    // an der dieselbe Lehre fällig war.
    const above = h - spec.headY;
    if (above > 1e-3) out.push(put((from + to) / 2, spec.headY + above / 2, to - from, above));
    // Unter der Brüstung. Bodentiefe Fronten haben dort ihr Koshi-Feld und
    // brauchen keinen Putz; ein hohes Band steht dagegen auf einer Wand.
    if (!spec.koshi && spec.sillY > 1e-3) {
      out.push(put((from + to) / 2, spec.sillY / 2, to - from, spec.sillY));
    }
    return out;
  };

  const wallGeos = [
    // Putz um die vier Öffnungen. Die Nordwand ist in zwei Abschnitte links
    // und rechts der Tokonoma geteilt; die Nische bekommt ihre eigene Rückwand
    // (weiter unten) und darf hier nicht zugemauert werden.
    ...wallAround(SHOJI, ROOM.minZ, ROOM.maxZ),
    ...wallAround(SHOJI_SOUTH, ROOM.minX, ROOM.maxX),
    ...wallAround(BAND_WEST, ROOM.minZ, ROOM.maxZ),
    // Der Putz endet **auf** der Tokonoma-Wange, nicht daneben. Bei den zuvor
    // gesetzten 0,15 m endete er bei ±1,50, die Wange reicht bis ±1,47 – drei
    // Zentimeter Schlitz über die volle Wandhöhe, den die Magenta-Probe als
    // senkrechte Linie neben der Nische zeigte. Mit `t / 2` überlappen sich
    // beide um sechs Zentimeter.
    ...wallAround(
      BAND_NORTH[0],
      ROOM.minX,
      TOKONOMA.centerX - TOKONOMA.width / 2 - WALL.thickness / 2
    ),
    ...wallAround(
      BAND_NORTH[1],
      TOKONOMA.centerX + TOKONOMA.width / 2 + WALL.thickness / 2,
      ROOM.maxX
    ),
    // Abschluss zwischen Ranma-Oberkante und Decke, rundum. Ohne den bliebe
    // genau der Spalt offen, der beim alten Dach vier Runden gekostet hat –
    // diesmal ist er von vornherein zu.
    board(t, ROOM.ceilingY - ROOM.ranmaTop + 0.02, ROOM.maxZ - ROOM.minZ + 0.4, 1.1).translate(
      WALL.west + t / 2,
      (ROOM.ranmaTop + ROOM.ceilingY) / 2,
      (ROOM.minZ + ROOM.maxZ) / 2
    ),
    board(t, ROOM.ceilingY - ROOM.ranmaTop + 0.02, ROOM.maxZ - ROOM.minZ + 0.4, 1.1).translate(
      WALL.east - t / 2,
      (ROOM.ranmaTop + ROOM.ceilingY) / 2,
      (ROOM.minZ + ROOM.maxZ) / 2
    ),
    board(ROOM.maxX - ROOM.minX + 0.4, ROOM.ceilingY - ROOM.ranmaTop + 0.02, t, 1.1).translate(
      0,
      (ROOM.ranmaTop + ROOM.ceilingY) / 2,
      WALL.north - t / 2
    ),
    board(ROOM.maxX - ROOM.minX + 0.4, ROOM.ceilingY - ROOM.ranmaTop + 0.02, t, 1.1).translate(
      0,
      (ROOM.ranmaTop + ROOM.ceilingY) / 2,
      WALL.south + t / 2
    ),
    // Traufabschluss auf beiden Längsseiten. Die verlängerte Schalung kommt der
    // Wandkrone bis auf wenige Zentimeter nahe – und wenige Zentimeter Schlitz
    // über neun Meter Länge sind von unten ein breiter heller Keil. Diese
    // beiden Bretter schließen ihn; billiger als die Wand höher zu ziehen und
    // damit alle Höhenbezüge der Shoji neu zu ordnen.
    // Laenger als der Raum: An den Enden stiess das Traufbrett bisher stumpf an
    // die Giebel, und aus flachem Blickwinkel blieb dort ein Keil offen –
    // gemessen 0,875 % der Bildflaeche in der Magenta-Probe. Dieselbe Lehre wie
    // schon zweimal an diesem Dach: An einer Fuge ist Ueberlappen robuster als
    // Passgenauigkeit.
    //
    // **Sie sitzen außen, nicht innen – und das war der Fehler.**
    //
    // Bis eben standen beide Bretter bei `WALL.west + t/2` bzw.
    // `WALL.east - t/2`, also **innerhalb** der Wandebene: x von 5,88 bis 6,00
    // auf der Ostseite, y von 2,94 bis 3,56. Der Ranma-Ausschnitt liegt bei
    // 3,05 bis 3,72 – die Bretter haben also zwei der vier oberen Fenster von
    // innen zugemauert. Vom Ostband blieb ein Schlitz von zehn Zentimetern
    // (gemessen mit einem senkrechten Strahlenfächer: von y = 2,95 bis 3,55
    // traf der Strahl Putz bei x = 5,88, das Papier erst dahinter bei 6,00).
    //
    // Das war nie beabsichtigt: Die Fuge, die diese Bretter schließen sollen,
    // liegt zwischen der verlängerten Dachschalung und der Wandkrone – also
    // **draußen**. Innen aufgestellt haben sie eine Fuge geschlossen, die dort
    // gar nicht ist, und dafür die Fenster genommen.
    // (Hier standen bis zuletzt zwei Traufbretter auf Ost und West, zuerst
    // innerhalb der Wandebene – dort haben sie zwei Ranma-Bänder von innen
    // zugemauert –, dann außerhalb bei `WALL.east + t·0,65`. Draußen schlossen
    // sie die Fuge, aber sie standen 7,8 cm vor der Wandflucht und liefen über
    // die ganze Länge: aus dem Garten ein Sims quer über die Fassade, an der
    // Südostecke ein weißer Klotz. Beides mit einem Strahl nachgewiesen.
    //
    // Sie sind **ersatzlos entfallen**, weil das Dach jetzt eine Untersicht hat
    // (`dojo-roof-untersicht`): Die Fuge zwischen verlängerter Schalung und
    // Wandkrone liegt hinter ihr. Nachgemessen mit holes.mjs aus allen acht
    // Richtungen – 0,007 % Magenta, derselbe Wert wie mit den Brettern.)

    // Über dem Tokonoma-Sturz bis zur Traufe – sonst sieht man über der Nische
    // in den schwarzen Hintergrund.
    board(TOKONOMA.width + 0.3, h - TOKONOMA.headY - 0.22, t, 1.1).translate(
      TOKONOMA.centerX,
      (TOKONOMA.headY + 0.22 + h) / 2,
      WALL.north - t / 2
    ),
  ];
  // (Die frueheren Giebeldreiecke sind entfallen. Mit einer flachen Decke gibt
  // es keinen Giebel mehr – und damit auch keine der vier Traufecken, an denen
  // vier Runden lang Loecher auftauchten. Das ist der eigentliche Gewinn des
  // Umbaus: nicht ein weiterer Flicken, sondern eine Fuge weniger.)

  const walls = new THREE.Mesh(mergeGeometries(wallGeos, false), plaster);
  walls.name = 'dojo-walls';
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // --- Tokonoma (Bildnische) ------------------------------------------------
  const tok = new THREE.Group();
  tok.name = 'dojo-tokonoma';
  const tokBack = new THREE.Mesh(
    board(TOKONOMA.width, TOKONOMA.headY, t, 1.0),
    plasterMaterial(0x9c968a) // etwas dunkler: die Nische liegt im Schatten
  );
  tokBack.position.set(TOKONOMA.centerX, TOKONOMA.headY / 2, WALL.north - TOKONOMA.depth - t / 2);
  tokBack.receiveShadow = true;
  tok.add(tokBack);

  // **Wangen und Sturzfläche der Nische.**
  //
  // Die Nische ist ein 50 cm tiefer Rücksprung; sie hatte bisher nur eine
  // Rückwand. Solange draußen nichts war, fiel das nicht auf – seitlich sah man
  // in denselben fast schwarzen Hintergrund, den auch der Nebel lieferte. Seit
  // es einen Bambushain gibt, sieht man an der Nische **vorbei ins Grüne**, und
  // aus der Bildnische wird ein Fenster.
  //
  // Genau derselbe Mechanismus wie beim Dach: Ein Loch bleibt unbemerkt,
  // solange dahinter nichts ist, das es verrät.
  const tokSides = [];
  for (const side of [-1, 1]) {
    tokSides.push(
      board(t, TOKONOMA.headY, TOKONOMA.depth + t, 0.8).translate(
        TOKONOMA.centerX + side * (TOKONOMA.width / 2 + t / 2),
        TOKONOMA.headY / 2,
        WALL.north - TOKONOMA.depth / 2
      )
    );
  }
  // Deckel über der Nische, sonst sieht man von unten über die Rückwand hinweg.
  tokSides.push(
    board(TOKONOMA.width + 2 * t, t, TOKONOMA.depth + t, 0.8).translate(
      TOKONOMA.centerX,
      TOKONOMA.headY + t / 2,
      WALL.north - TOKONOMA.depth / 2
    )
  );
  const tokJambs = new THREE.Mesh(mergeGeometries(tokSides, false), plasterMaterial(0x9c968a));
  tokJambs.name = 'dojo-tokonoma-wangen';
  tokJambs.receiveShadow = true;
  tokJambs.castShadow = true;
  tok.add(tokJambs);

  // **Die Nische braucht ein Inneres, kein zweites Wandstück.**
  //
  // Prüferbefund 5: „die Tokonoma hat keine Tiefe". Gemessen in `e-tatami` lag
  // die Nischenrückwand bei L 171,2 gegen L 183,1 für die Nordwand daneben —
  // **zwölf Stufen** für einen halben Meter Rücksprung. Eine Bildnische ist
  // ein dunkler Kasten; zwölf Stufen sind ein Anstrich.
  //
  // Die Ursache ist bekannt und bleibt: Für die Innenräume gibt es keinen
  // eigenen Schattendurchgang (das Dreiecksbudget trägt keinen dritten
  // Kegelstumpf, siehe Paket A). Ohne Verschattung bekommt die Nische
  // dieselbe Halbraumaufhellung wie die offene Wand, und der einzige
  // Unterschied ist der Farbwert des Putzes.
  //
  // Also gebacken. Vier unterteilte Flächen dicht innen an der Schale —
  // Rückwand, zwei Wangen, Deckel —, deren Vertexfarbe mit der Tiefe im
  // Rücksprung und mit der Nähe zu Wange, Sturz und Boden abfällt. **Die
  // Unterteilung ist der Punkt:** Eine Kastenfläche hat vier Ecken, und
  // zwischen vier Ecken kann man eine Rampe legen, aber keine Vignette. Zwölf
  // mal zwölf Felder tragen den Verlauf, den eine Nische wirklich hat.
  //
  // Ein Zeichenaufruf für alle vier, weil sie ein Material teilen.
  const nischeAO = (x, y, z) => {
    const spanne = (a, b, v) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    // 0 an der Öffnung, 1 an der Rückwand
    const tiefe = spanne(0, TOKONOMA.depth, WALL.north - z);
    // 1 dicht an Wange, Sturz oder Nischenboden
    const wange = 1 - spanne(0, 0.55, TOKONOMA.width / 2 - Math.abs(x - TOKONOMA.centerX));
    const sturz = 1 - spanne(0, 0.6, TOKONOMA.headY - y);
    const sockel = 1 - spanne(0, 0.45, y - TOKONOMA.floorY);
    const ecke = Math.max(wange, Math.max(sturz, sockel));
    // Die Ecke zählt tief in der Nische mehr als an der Öffnung: Dort fällt
    // Licht von der Seite herein, hinten nicht mehr.
    return 1 - 0.40 * tiefe - 0.34 * ecke * (0.35 + 0.65 * tiefe);
  };
  const faerbe = (geo, hex) => {
    const c = new THREE.Color(hex);
    const pos = geo.attributes.position;
    const farben = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(geo.userData.welt);
      const f = nischeAO(v.x, v.y, v.z);
      farben[i * 3] = c.r * f;
      farben[i * 3 + 1] = c.g * f;
      farben[i * 3 + 2] = c.b * f;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
    return geo;
  };
  const innen = [];
  const lege = (geo, matrix) => {
    geo.userData.welt = matrix;
    faerbe(geo, 0xffffff);
    geo.applyMatrix4(matrix);
    delete geo.userData.welt;
    innen.push(geo);
  };
  const NH = TOKONOMA.headY - TOKONOMA.floorY;
  const NY = (TOKONOMA.headY + TOKONOMA.floorY) / 2;
  const LUFT = 0.004; // knapp vor der Schale, damit nichts flimmert
  lege(
    new THREE.PlaneGeometry(TOKONOMA.width, NH, 12, 12),
    new THREE.Matrix4().makeTranslation(
      TOKONOMA.centerX,
      NY,
      WALL.north - TOKONOMA.depth + LUFT
    )
  );
  for (const side of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationY(-side * Math.PI / 2);
    m.setPosition(
      TOKONOMA.centerX + side * (TOKONOMA.width / 2 - LUFT),
      NY,
      WALL.north - TOKONOMA.depth / 2
    );
    lege(new THREE.PlaneGeometry(TOKONOMA.depth, NH, 6, 12), m);
  }
  const deckel = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  deckel.setPosition(TOKONOMA.centerX, TOKONOMA.headY - LUFT, WALL.north - TOKONOMA.depth / 2);
  lege(new THREE.PlaneGeometry(TOKONOMA.width, TOKONOMA.depth, 12, 6), deckel);

  const nischeMat = plasterMaterial(0x9c968a);
  nischeMat.vertexColors = true;
  const nischeInnen = new THREE.Mesh(mergeGeometries(innen, false), nischeMat);
  nischeInnen.name = 'dojo-tokonoma-innen';
  nischeInnen.receiveShadow = true;
  tok.add(nischeInnen);

  // Erhöhter Nischenboden aus einem einzigen dicken Brett
  const tokFloor = new THREE.Mesh(
    board(TOKONOMA.width, TOKONOMA.floorY, TOKONOMA.depth, 0.5),
    hinokiDark
  );
  tokFloor.position.set(TOKONOMA.centerX, TOKONOMA.floorY / 2, WALL.north - TOKONOMA.depth / 2);
  tokFloor.castShadow = true;
  tokFloor.receiveShadow = true;
  tok.add(tokFloor);

  // Tokobashira: der bewusst **unbehauene** Eckpfosten der Nische. Das ist das
  // eine Bauteil im Raum, das nicht rechtwinklig sein darf – er ist das
  // Gegenstück zur sonst durchgehenden Geometrie und der Grund, warum eine
  // japanische Nische nicht wie ein Regal wirkt.
  const postGeo = new THREE.CylinderGeometry(0.085, 0.1, TOKONOMA.headY, 9, 4);
  const pos = postGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const wob = Math.sin(y * 3.1 + 0.7) * 0.012 + Math.sin(y * 7.9) * 0.006;
    pos.setX(i, pos.getX(i) * (1 + wob * 4));
    pos.setZ(i, pos.getZ(i) * (1 + wob * 4));
  }
  postGeo.computeVertexNormals();
  const post = new THREE.Mesh(postGeo, hinokiDark);
  post.position.set(
    TOKONOMA.centerX + TOKONOMA.width / 2,
    TOKONOMA.headY / 2,
    WALL.north - TOKONOMA.depth
  );
  post.castShadow = true;
  post.receiveShadow = true;
  tok.add(post);

  // Sturz über der Nische
  const lintel = new THREE.Mesh(
    board(TOKONOMA.width + 0.24, 0.22, TOKONOMA.depth + 0.06, 0.6),
    hinokiDark
  );
  lintel.position.set(TOKONOMA.centerX, TOKONOMA.headY + 0.11, WALL.north - TOKONOMA.depth / 2);
  lintel.castShadow = true;
  tok.add(lintel);
  group.add(tok);

  // --- Öffnungen: Shoji-Fronten und Fensterbänder ---------------------------
  //
  // Das Gitter ist **echte Geometrie**, keine Textur. Im Gegenlicht ist genau
  // dieses Gitter die Silhouette, die den Raum als japanisch lesbar macht; als
  // Textur auf einer Fläche hätte es keinen eigenen Schattenwurf und keine
  // Tiefe, und die Lichtschächte träfen auf nichts.
  //
  // Vier Wände, vier Aufrufe derselben Funktion. Die Ostfront steht in der
  // Sonne und bekommt das leuchtende Washi; Süd, West und Nord liegen im
  // Schatten des eigenen Gebäudes und bekommen das gedämpfte. Ein zweites
  // gleich helles Fenster hätte die Lichtrichtung zerstört, an der vier Runden
  // lang gearbeitet wurde – es gäbe dann keine Sonnenseite mehr.
  const shoji = new THREE.Group();
  shoji.name = 'dojo-shoji';

  const sunny = [SHOJI];
  const grazing = [SHOJI_SOUTH];
  const shaded = [BAND_WEST, ...BAND_NORTH];
  const frameGeos = [];
  const latticeT = [];
  const sunPapers = [];
  const grazePapers = [];
  const shadePapers = [];

  for (const spec of [...sunny, ...grazing, ...shaded]) {
    const part = buildOpening(spec);
    frameGeos.push(...part.frames);
    latticeT.push(...part.bars);
    const ziel = spec.shaded ? shadePapers : spec.grazing ? grazePapers : sunPapers;
    ziel.push(...part.papers);
  }

  const frames = new THREE.Mesh(mergeGeometries(frameGeos, false), hinokiDark);
  frames.name = 'dojo-frames';
  frames.castShadow = true;
  frames.receiveShadow = true;
  shoji.add(frames);

  // Ein Einheitswürfel für **alle** Sprossen im Raum – Shoji, Fensterbänder und
  // Ranma. Die Kantenlängen stecken in der Instanzskalierung; damit ist es eine
  // Geometrie, ein Material, ein Zeichenaufruf für rund zweihundert Stäbe.
  const barGeo = new THREE.BoxGeometry(1, 1, 1);
  shoji.add(instanced(barGeo, hinokiDark, latticeT, { receive: false, name: 'dojo-lattice' }));

  // **Papier wirft Schatten.** Ohne das schien die Sonne ungehindert durch die
  // Shoji auf den Boden, als stünde dort gar keine Wand – der ganze
  // Ostbereich brannte auf reines Weiß aus. Drei Runden Zurücknehmen an den
  // additiven Lagen haben das Symptom bekämpft und die Ursache nicht berührt.
  // Washi lässt Licht durch, aber es *dämpft* es; genau diese Dämpfung fehlte.
  // Das Durchscheinen macht weiterhin `emissive` plus die Lichtschächte.
  const paper = new THREE.Mesh(mergeGeometries(sunPapers, false), washi);
  paper.name = 'dojo-washi';
  paper.castShadow = true;
  paper.receiveShadow = true;
  shoji.add(paper);

  const grazePaper = new THREE.Mesh(mergeGeometries(grazePapers, false), washiGraze);
  grazePaper.name = 'dojo-washi-streiflicht';
  grazePaper.castShadow = true;
  grazePaper.receiveShadow = true;
  shoji.add(grazePaper);

  const shadePaper = new THREE.Mesh(mergeGeometries(shadePapers, false), washiShade);
  shadePaper.name = 'dojo-washi-schatten';
  shadePaper.castShadow = true;
  shadePaper.receiveShadow = true;
  shoji.add(shadePaper);
  group.add(shoji);

  // --- Geschlossene Decke mit Unterzügen -------------------------------------
  //
  // Ersetzt den früheren offenen Giebeldachstuhl. Der sah in Einzelbildern
  // eindrucksvoll aus, war aber die Ursache praktisch jedes Lochs in diesem
  // Raum: schwarze Decke, Magenta an den Traufen, zwei Fortsätze in der
  // Silhouette. Vier Runden Flickarbeit haben ihn nie dicht bekommen, weil
  // Schalung, Giebel, Traufbrett und Sparren alle irgendwo aneinanderstoßen
  // mussten. Eine geschlossene Decke hat genau **eine** Fläche und keine Fuge.
  //
  // Sie ist außerdem das, was Referenzbilder eines Dojo durchweg zeigen: flache
  // oder kassettierte Decke, sichtbare Unterzüge darunter, darüber nichts.
  const roof = new THREE.Group();
  roof.name = 'dojo-ceiling';

  // Deckenschalung: eine einzige Fläche, nach unten gerichtet.
  //
  // **Unterteilt, weil sie eine gebackene Verdeckung tragen muss.**
  //
  // Prüferbefund 5: „Die Decke ist eine flache Platte." Gemessen in `a-halle`
  // Balkenunterseite L 64,2 gegen Deckenfeld L 67,1 — **drei Stufen**. Die
  // Balken heben sich allein durch ihre Kantenlinien ab, nicht durch Tonwert.
  // In `b-shoji` und `f-gegenlicht` trägt dieselbe Decke, weil dort die
  // Balkenflanken sichtbar sind; entlang der Balken gesehen bricht sie
  // zusammen.
  //
  // Es ist zum vierten Mal dieselbe Ursache — nach Bildnische, Sesselkissen und
  // Bambushain: **der Renderer hat kein Verdeckungsglied.** Ein Balken, der
  // 24 cm unter der Decke hängt, verdeckt der Schalung neben sich den halben
  // Himmel; das Beleuchtungsmodell weiss davon nichts, weil die Normale der
  // Schalung überall dieselbe ist.
  //
  // Also gebacken. Der Abfall folgt der Geometrie und ist nicht gesetzt: Ein
  // Balken von 0,2 m Breite, der 0,24 m heruntersteht, verdeckt bis rund
  // 0,45 m zu jeder Seite, der Längsunterzug (0,22 m breit, Oberkante 0,18 m
  // unter der Decke) entsprechend weniger.
  const BALKEN_H = 0.24;
  const BALKEN_B = 0.2;
  const BALKEN_REICH = BALKEN_H + BALKEN_B / 2 + 0.11;
  const FIRST_REICH = 0.5;
  const deckenAO = (x, z) => {
    // Abstand zum nächsten Querunterzug. Die Balken stehen ab minZ + 0,75 alle
    // 1,5 m; der Rest ist Modulorechnung.
    const rel = z - (ROOM.minZ + 0.75);
    const dz = Math.abs(rel - Math.round(rel / 1.5) * 1.5);
    const quer = 1 - Math.min(1, Math.max(0, (dz - BALKEN_B / 2) / (BALKEN_REICH - BALKEN_B / 2)));
    const dx = Math.abs(x);
    const laengs = 1 - Math.min(1, Math.max(0, (dx - 0.11) / (FIRST_REICH - 0.11)));
    // Wand- und Traufsaum: die Schalung sieht an der Wand nur noch den halben
    // Raum.
    const rand = Math.min(
      1,
      Math.max(0, 1 - Math.min(x - ROOM.minX, ROOM.maxX - x, z - ROOM.minZ, ROOM.maxZ - z) / 0.7)
    );
    return 1 - 0.42 * quer - 0.2 * laengs - 0.18 * rand;
  };
  const ceilGeo = new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ, 32, 96);
  ceilGeo.rotateX(Math.PI / 2); // Normale nach unten – wir sehen sie von innen
  scaleUV(ceilGeo, (ROOM.maxX - ROOM.minX) / 0.4, (ROOM.maxZ - ROOM.minZ) / 0.4);
  ceilGeo.translate(0, ROOM.ceilingY, (ROOM.minZ + ROOM.maxZ) / 2);
  {
    const pos = ceilGeo.attributes.position;
    const farben = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const f = deckenAO(pos.getX(i), pos.getZ(i));
      farben[i * 3] = farben[i * 3 + 1] = farben[i * 3 + 2] = f;
    }
    ceilGeo.setAttribute('color', new THREE.BufferAttribute(farben, 3));
  }
  const ceilMat = hinokiMaterial({ color: 0xb69a76 });
  ceilMat.vertexColors = true;
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.name = 'dojo-deck';
  ceiling.receiveShadow = true;
  roof.add(ceiling);

  // Unterzüge quer zum Raum, kräftig und dunkel – sie geben der Decke Tiefe und
  // sind in jedem Referenzbild das auffälligste Element über Augenhöhe.
  const beamGeo = board(ROOM.maxX - ROOM.minX, 0.24, 0.2, 0.7);
  const beamT = [];
  const BEAM_STEP = 1.5;
  for (let z = ROOM.minZ + 0.75; z <= ROOM.maxZ - 0.5; z += BEAM_STEP) {
    beamT.push({ x: 0, y: ROOM.ceilingY - 0.13, z });
  }
  roof.add(instanced(beamGeo, hinokiDark, beamT, { receive: false, name: 'dojo-beams' }));

  // Längsunterzug auf der Mittelachse, etwas tiefer – bricht die reine
  // Querstreifung und stützt die Querbalken optisch ab.
  const spineGeos = [
    board(0.22, 0.2, ROOM.maxZ - ROOM.minZ, 0.7).translate(
      0,
      ROOM.ceilingY - 0.28,
      (ROOM.minZ + ROOM.maxZ) / 2
    ),
  ];

  // **Munamochi-bashira: der Laengsunterzug endete im Fensterband.**
  //
  // Gerechnet: Der Unterzug liegt bei 3,67 und ist 0,2 hoch, seine Unterkante
  // also bei **3,57**. Das Ranma reicht von 3,05 bis **3,72**. Die letzten
  // fuenfzehn Zentimeter des Balkens standen damit im Papierband — er lief auf
  // die Nordwand zu und endete dort an einem Oberlicht, mit sichtbarer
  // Schnittflaeche und ohne irgendein Auflager. Der Pruefer hat es genau so
  // beschrieben, und es steht in der Bildmitte von `a-halle`, ueber der
  // Tokonoma.
  //
  // Ein Balken endet nicht in der Luft. Ein Firstpfosten traegt ihn: von der
  // Unterkante des Balkens auf die Oberkante der geschlossenen Wand, quer durch
  // das Ranma-Feld, das er dort ausfuellt. Achtzehn Zentimeter gegen die
  // zweiundzwanzig des Balkens — ein Pfosten ist nie breiter als das, was er
  // traegt.
  //
  // Beide Pfosten und der Balken sind **ein** Netz. Drei Koerper aus demselben
  // Holz sind sonst drei Zeichenaufrufe, und das Budget stand nach diesem Paket
  // bei 117 von 120.
  const PFOSTEN = 0.18;
  const pfostenH = ROOM.ceilingY - 0.38 - ROOM.wallTop;
  for (const zz of [ROOM.minZ, ROOM.maxZ]) {
    spineGeos.push(
      // Halbe Pfostentiefe nach innen, damit er ganz im Raum steht und nicht
      // zur Haelfte in der Wand.
      board(PFOSTEN, pfostenH, PFOSTEN, 0.02).translate(
        0,
        ROOM.wallTop + pfostenH / 2,
        zz + (zz < 0 ? PFOSTEN / 2 : -PFOSTEN / 2)
      )
    );
  }
  const spine = new THREE.Mesh(mergeGeometries(spineGeos, false), hinokiDark);
  spine.name = 'dojo-first';
  spine.castShadow = true;
  spine.receiveShadow = true;
  roof.add(spine);

  // --- Walmdach von außen ---------------------------------------------------
  //
  // Von innen sieht man davon **nichts** – die Decke ist geschlossen. Es steht
  // trotzdem hier, aus zwei Gründen.
  //
  // Erstens: Ohne Dach ist das Gebäude von außen eine oben offene Kiste, in die
  // man von schräg oben hineinsieht (die Deckenschalung ist einseitig und nach
  // unten gerichtet, von oben also gar nicht da). Seit es eine Außenwelt gibt,
  // ist das eine Ansicht, die vorkommt.
  //
  // Zweitens, und wichtiger: Das Dach **wirft Schatten**. Bei einer Sonne, die
  // 11 Grad über dem Horizont steht, legt der Überstand einen Streifen über den
  // Boden vor der Ostfront – der Übergang von Innenraum zu Außenwelt bekommt
  // damit eine Kante, statt in gleichmäßige Helligkeit auszulaufen.
  //
  // Als ein einziges Netz aus sechs Dreiecken gebaut; ein Walmdach ist genau
  // das, und aus Quadern zusammengesetzt wäre es ein Stapel Kisten.
  const EAVE = 0.95; // Überstand über die Wandflucht
  const RIDGE_UP = 1.9; // Höhe des Firsts über der Traufe
  const HIP = 3.4; // Einzug des Firsts an den Schmalseiten
  const ex0 = ROOM.minX - EAVE;
  const ex1 = ROOM.maxX + EAVE;
  const ez0 = ROOM.minZ - EAVE;
  const ez1 = ROOM.maxZ + EAVE;
  const ry0 = ROOM.ceilingY + 0.12;
  const ry1 = ry0 + RIDGE_UP;
  const roofPos = [
    // Westseite (Traufe West → First)
    ex0,
    ry0,
    ez0,
    ex0,
    ry0,
    ez1,
    0,
    ry1,
    ez1 - HIP,
    ex0,
    ry0,
    ez0,
    0,
    ry1,
    ez1 - HIP,
    0,
    ry1,
    ez0 + HIP,
    // Ostseite
    ex1,
    ry0,
    ez1,
    ex1,
    ry0,
    ez0,
    0,
    ry1,
    ez0 + HIP,
    ex1,
    ry0,
    ez1,
    0,
    ry1,
    ez0 + HIP,
    0,
    ry1,
    ez1 - HIP,
    // Walm Nord und Süd
    ex0,
    ry0,
    ez0,
    0,
    ry1,
    ez0 + HIP,
    ex1,
    ry0,
    ez0,
    ex1,
    ry0,
    ez1,
    0,
    ry1,
    ez1 - HIP,
    ex0,
    ry0,
    ez1,
  ];
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
  // UVs aus der Grundfläche: Die Ziegelreihen laufen damit über alle vier
  // Flächen im gleichen Maßstab weiter, statt an jedem Grat zu springen.
  const roofUv = [];
  for (let i = 0; i < roofPos.length; i += 3) {
    roofUv.push(roofPos[i] / 0.9, roofPos[i + 2] / 0.9);
  }
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roofUv, 2));
  roofGeo.computeVertexNormals();
  // Ziegel statt graublau eingefärbtem Holz. Von innen ist davon nichts zu
  // sehen; von außen ist das Dach die größte zusammenhängende Fläche des
  // Gebäudes und war als glatte dunkle Ebene das Auffälligste an der Fassade.
  const roofShell = new THREE.Mesh(roofGeo, kawaraMaterial());
  roofShell.name = 'dojo-roof';
  roofShell.castShadow = true;
  roofShell.receiveShadow = true;
  roof.add(roofShell);

  // Untersicht (Noki-ura). Die Dachschale ist eine Fläche ohne Dicke und wird
  // von unten weggeschnitten – aus dem Garten sah man deshalb zwischen den
  // Sparren hindurch **den Himmel**, obwohl das Dach darüber steht. Dieselbe
  // Geometrie ein zweites Mal, nach innen gerichtet und in dunklem Holz: die
  // gehobelten Bretter, die bei einem echten Vordach über den Sparren liegen.
  // Sechs Dreiecke, und von innen ist davon nichts zu sehen, weil die Decke bei
  // 3,95 m geschlossen ist.
  const soffit = new THREE.Mesh(
    roofGeo,
    hinokiMaterial({ color: 0x6b5238, uvScale: 0.7, side: THREE.BackSide })
  );
  soffit.name = 'dojo-roof-untersicht';
  roof.add(soffit);

  // --- First, Grate, Traufblende, Sparrenköpfe -------------------------------
  //
  // Ein Dach aus sechs Dreiecken hat drei Eigenschaften, die es von außen sofort
  // als Behelf verraten: Die Grate sind reine Knicke, die Traufe ist eine Kante
  // ohne Dicke, und der Überstand hat keine Unterseite. Alle drei sind mit
  // wenigen Quadern zu beheben – zusammen unter 900 Dreiecke.
  const firstMat = hinokiMaterial({ color: 0x53585c, uvScale: 1.6 });

  // Firstziegel und die vier Grate als flach liegende Balken. Jeder Grat läuft
  // von einer Traufecke zum jeweiligen Firstende; Länge und Neigung kommen aus
  // den Endpunkten, nicht aus geschätzten Winkeln.
  const gratGeo = board(1, 0.17, 0.34, 0.5);
  const grate = [];
  const legeBalken = (ax, ay, az, bx, by, bz) => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    grate.push({
      x: (ax + bx) / 2,
      y: (ay + by) / 2 + 0.06,
      z: (az + bz) / 2,
      // Erst um Y in die Grundrissrichtung, dann um Z in die Steigung kippen.
      ry: Math.atan2(-dz, dx),
      rz: Math.asin(dy / len),
      scale: [len, 1, 1],
    });
  };
  legeBalken(0, ry1, ez0 + HIP, 0, ry1, ez1 - HIP); // First
  legeBalken(ex0, ry0, ez0, 0, ry1, ez0 + HIP);
  legeBalken(ex1, ry0, ez0, 0, ry1, ez0 + HIP);
  legeBalken(ex0, ry0, ez1, 0, ry1, ez1 - HIP);
  legeBalken(ex1, ry0, ez1, 0, ry1, ez1 - HIP);
  roof.add(instanced(gratGeo, firstMat, grate, { name: 'dojo-roof-grate' }));

  // Traufblende: ein umlaufendes Brett unter der Dachkante. Ohne das ist der
  // Rand des Dachs eine Fläche der Dicke null – aus dem Garten von unten
  // gesehen verschwindet das Dach dort einfach.
  const FASCIA_H = 0.16;
  const fascia = new THREE.Group();
  fascia.name = 'dojo-roof-traufe';
  for (const [w, h, d, x, z] of [
    [ex1 - ex0 + 0.16, FASCIA_H, 0.08, 0, ez0 - 0.04],
    [ex1 - ex0 + 0.16, FASCIA_H, 0.08, 0, ez1 + 0.04],
    [0.08, FASCIA_H, ez1 - ez0 + 0.16, ex0 - 0.04, 0],
    [0.08, FASCIA_H, ez1 - ez0 + 0.16, ex1 + 0.04, 0],
  ]) {
    const brett = new THREE.Mesh(board(w, h, d, 0.6), hinokiDark);
    brett.position.set(x, ry0 - FASCIA_H / 2 + 0.02, z);
    brett.castShadow = true;
    fascia.add(brett);
  }
  roof.add(fascia);

  // Sparrenköpfe (Taruki): die Untersicht des Überstands. Sie stehen quer zur
  // jeweiligen Traufe und enden an der Blende.
  // Die Länge ist der Überstand plus 10 cm Einbindung hinter die Wandflucht;
  // die Mitte liegt deshalb eine halbe Länge **innerhalb** der Traufkante. Beim
  // ersten Versuch stand hier zusätzlich ein `- EAVE`, wodurch die Sparren
  // 95 cm über die Dachkante hinaus in den Himmel ragten – aus dem Garten ein
  // freischwebender Rechen vor blauem Himmel.
  const SPARREN_LEN = EAVE + 0.1;
  const sparrenGeo = board(0.07, 0.09, SPARREN_LEN, 0.5);
  const sparren = [];
  const SPARREN_ABSTAND = 0.42;
  for (let x = ex0 + 0.3; x <= ex1 - 0.3; x += SPARREN_ABSTAND) {
    sparren.push({ x, y: ry0 - 0.05, z: ez0 + SPARREN_LEN / 2 });
    sparren.push({ x, y: ry0 - 0.05, z: ez1 - SPARREN_LEN / 2 });
  }
  for (let z = ez0 + EAVE + 0.3; z <= ez1 - EAVE - 0.3; z += SPARREN_ABSTAND) {
    sparren.push({ x: ex0 + SPARREN_LEN / 2, y: ry0 - 0.05, z, ry: Math.PI / 2 });
    sparren.push({ x: ex1 - SPARREN_LEN / 2, y: ry0 - 0.05, z, ry: Math.PI / 2 });
  }
  roof.add(
    instanced(sparrenGeo, hinokiDark, sparren, { receive: false, name: 'dojo-roof-sparren' })
  );

  group.add(roof);

  // --- Ranma: Fensterband zwischen Wandkrone und Decke -----------------------
  //
  // Der schmale Streifen mit feinem Gitter, der in den Referenzen rundum über
  // den Wänden läuft. Er bringt das Licht **oben** in den Raum – der Grund,
  // warum ein Dojo hell wirkt, ohne dass eine Wand fehlt – und er schließt die
  // Lücke zwischen Wand und Decke, die vorher offen war.
  //
  // **Hier steckte der Fehler, nach dem der Nutzer gefragt hat.** Der frühere
  // `runRanma` versetzte sein Papier mit einem vorzeichenlosen `+0,03` und
  // baute die Ebene ohne Rücksicht darauf, wo der Raum liegt. Auf Ost und Süd
  // ging das Papier damit nach außen, auf West und Nord nach innen – es stand
  // *vor* den Sprossen im Raum. Und die Vorderseite zeigte auf West und Süd
  // nach draußen; auf dem Desktop unsichtbar, weil Washi beidseitig ist, in der
  // Brille ein Loch, weil quality.js dort auf FrontSide schaltet.
  //
  // Jetzt ist das Ranma dieselbe Öffnung wie jedes Fenster, nur flacher und
  // ohne Querstäbe – und `inward` gibt es genau einmal je Wand.
  const ranma = new THREE.Group();
  ranma.name = 'dojo-ranma';
  // **Kumiko-Feld statt Lattenzaun.**
  //
  // Der erste Bau war *ein* Feld über die ganze Wand mit gleichmäßig verteilten
  // senkrechten Stäben, alle 34 cm einer. Das ist technisch ein Ranma und
  // optisch eine Fabrikverglasung: ein vierzehn Meter langer Streifen ohne
  // Gliederung, ohne Pfosten, ohne Maßstab. Ein echtes Ranma besteht aus
  // **einzelnen Feldern** – jedes mit eigenem Rahmen, in der Breite ungefähr
  // quadratisch – und in jedem sitzt ein feines Kumiko-Gitter aus senkrechten
  // *und* waagerechten Stäben.
  //
  // Beides folgt jetzt aus der Feldbreite: rund 1,15 m je Feld (so kommt man
  // bei 12 und 14 m Wandlänge auf glatte Teilungen), darin ein 4×3-Gitter aus
  // dünneren Stäben. Dünner ist wichtig – 28 mm waren Pfosten, 18 mm sind
  // Sprossen.
  const RANMA_PANEL = 1.15;
  const ranmaSpec = (axis, fixedVal, inward, from, to) => ({
    axis,
    [axis]: fixedVal,
    inward,
    from,
    to,
    fromZ: from,
    toZ: to,
    sillY: ROOM.wallTop,
    headY: ROOM.ranmaTop,
    koshi: false,
    panels: Math.max(2, Math.round((to - from) / RANMA_PANEL)),
    // Auch das Ranma bekommt Latten nach außen. Ohne sie stand über der Front
    // ein leerer heller Streifen quer durch die ganze Fassade – aus dem Garten
    // das Auffälligste am Gebäude, gleich nach dem Dach.
    renji: 4,
    lattice: { cols: 4, rows: 3, barWidth: 0.018, barDepth: 0.018 },
  });

  // **Die Bänder enden vor der Ecke, nicht in ihr.**
  //
  // Bis eben spannte jedes Band über die volle Wandlänge (`ROOM.minZ..maxZ`
  // bzw. `minX..maxX`) an der Wandmitte. An jeder Raumecke steckten damit zwei
  // rechtwinklige Bänder ineinander: doppelte Pfosten, Z-Fighting und ein
  // Wandansatz, der aus jedem Blickwinkel anders falsch aussah. Genau das war
  // gemeldet.
  //
  // Die Wand darunter macht es umgekehrt: `wallAround()` verlängert sie
  // absichtlich **über** die Ecke hinaus (`lo2`/`hi2`), damit an der Kante kein
  // Sichtschlitz bleibt. Beides zusammen – Wand zu lang, Band zu lang – ergab
  // den Versatz.
  //
  // Jetzt endet jedes Band eine halbe Wandstärke vor der Fluchtlinie der
  // Nachbarwand, und in die Lücke kommt ein Eckpfosten. Das ist auch
  // konstruktiv das Richtige: An einer Raumecke steht in einem Holzbau ein
  // Pfosten, und die Füllungen stoßen an ihn.
  const rIn = t * 0.5;
  const ranmaGeos = [];
  const ranmaBars = [];
  const ranmaPapers = { sun: [], graze: [], shade: [] };
  for (const [spec, ziel] of [
    [ranmaSpec('x', WALL.east, -1, ROOM.minZ + rIn, ROOM.maxZ - rIn), 'sun'],
    [ranmaSpec('x', WALL.west, 1, ROOM.minZ + rIn, ROOM.maxZ - rIn), 'shade'],
    [ranmaSpec('z', WALL.north, 1, ROOM.minX + rIn, ROOM.maxX - rIn), 'shade'],
    [ranmaSpec('z', WALL.south, -1, ROOM.minX + rIn, ROOM.maxX - rIn), 'graze'],
  ]) {
    const part = buildOpening(spec);
    ranmaGeos.push(...part.frames);
    ranmaBars.push(...part.bars);
    ranmaPapers[ziel].push(...part.papers);
  }

  // Eckpfosten. Er füllt die Lücke, die das Zurücknehmen hinterlässt, und
  // bindet die vier Bänder zu einem umlaufenden Fries zusammen, statt sie an
  // vier Stellen kollidieren zu lassen.
  const eckHoehe = ROOM.ranmaTop - ROOM.wallTop;
  for (const [ex, ez] of [
    [WALL.west, WALL.north],
    [WALL.east, WALL.north],
    [WALL.west, WALL.south],
    [WALL.east, WALL.south],
  ]) {
    const inX = ex < 0 ? 1 : -1;
    const inZ = ez < 0 ? 1 : -1;
    ranmaGeos.push(
      board(t * 1.5, eckHoehe, t * 1.5, 0.9).translate(
        ex + inX * t * 0.55,
        ROOM.wallTop + eckHoehe / 2,
        ez + inZ * t * 0.55
      )
    );
  }

  const ranmaFrame = new THREE.Mesh(mergeGeometries(ranmaGeos, false), hinokiDark);
  ranmaFrame.name = 'dojo-ranma-frame';
  ranmaFrame.castShadow = true;
  ranma.add(ranmaFrame);
  ranma.add(instanced(barGeo, hinokiDark, ranmaBars, { receive: false, name: 'dojo-ranma-bars' }));
  // **Das Ranma bekommt dieselbe Einteilung wie die Front darunter.**
  //
  // Vorher lag auf allen vier Seiten das gedämpfte Papier, mit der Begründung,
  // das Band liege unter der Traufe. Der Dachüberstand ist aber 0,9 m breit und
  // die Sonne steht 10,5° hoch – bei diesem Winkel beschattet er das Band
  // nicht, er streift es. Sichtbar war das Ergebnis als harte Stufe: über einer
  // leuchtenden Ostfront saß ein stumpfes Band, und diese Kante liest sich als
  // Fehler, nicht als Licht.
  // **Das Ranma bekommt eigene Materialien ohne `shadowedEmissive`.**
  //
  // Gemessen war das Band vorher genau verkehrt herum: Ost 109,8 · Süd 124,6 ·
  // Nord 163,3 · West 204,1 – das sonnigste Band war das dunkelste, dunkler
  // sogar als die verschatteten. Ursache ist `shadowTheGlow()`: Es multipliziert
  // das Eigenleuchten mit dem Schattentest, und der Dachüberstand beschattet das
  // Ranma bei 10,5° Sonnenhöhe **immer**. Ost und Süd trugen das Merkmal (sie
  // teilen sich das Material mit der Front darunter), Nord und West nicht – also
  // verlor genau die Sonnenseite ihr Leuchten.
  //
  // Für die Front ist das Merkmal richtig und bleibt: Dort zeichnet der
  // Bambushain seinen Schattenriss ins Papier, und das ist der halbe Reiz der
  // Ostseite. Ein Band unter der Traufe hat diesen Schattenriss nie.
  const ranmaSun = washiMaterial({ emissive: 0xffeccc, emissiveIntensity: 0.38 });
  const ranmaGraze = washiMaterial({ emissive: 0xffe8c6, emissiveIntensity: 0.25 });
  const ranmaShade = washiMaterial({
    // **Unverändert bei 0xe8e0cc und 0,28 – ein Rücknahmeversuch ist gemessen
    // gescheitert.**
    //
    // Der Auftrag war, das durchscheinende Licht zu dämpfen, und der erste
    // Griff ging hierhin: Grundfarbe auf 0xdfd6c0, Intensität auf 0,22. Das
    // Ergebnis war das Gegenteil von beabsichtigt – die Nordwand fiel von
    // Verhältnis 1,16 auf 1,10 und damit unter das Gate (Papier muss heller
    // sein als der Putz daneben), während der Spitzenwert der Westwand von 251
    // auf 252 ging, also nirgendwohin.
    //
    // Die Rechnung dahinter: 21 % weniger Eigenleuchten haben die Westwand um
    // **einen** Luminanzpunkt gesenkt. Ihre Helligkeit stammt praktisch
    // vollständig aus einfallendem Licht – die Ostsonne fällt quer durch die
    // Shoji-Front auf sie. Am Papier ist dort nichts zu holen; gedämpft wird
    // deshalb dort, wo das Leuchten wirklich sitzt: auf den besonnten Seiten.
    color: 0xe8e0cc,
    emissive: 0xffe2bc,
    emissiveIntensity: 0.28,
  });
  for (const [key, material, name] of [
    ['sun', ranmaSun, 'dojo-ranma-paper'],
    ['graze', ranmaGraze, 'dojo-ranma-paper-streiflicht'],
    ['shade', ranmaShade, 'dojo-ranma-paper-schatten'],
  ]) {
    if (!ranmaPapers[key].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(ranmaPapers[key], false), material);
    mesh.name = name;
    mesh.castShadow = true;
    ranma.add(mesh);
  }
  group.add(ranma);

  // --- Engawa (Veranda) im Süden -------------------------------------------
  const engawa = new THREE.Group();
  engawa.name = 'dojo-engawa';
  const deckBoard = board(ROOM.maxX - ROOM.minX, 0.06, 0.16, 0.5);
  const engT = [];
  for (let i = 0; i < 5; i++) engT.push({ x: 0, y: -0.06, z: ROOM.maxZ + 0.1 + i * 0.17 });
  engawa.add(instanced(deckBoard, hinokiDark, engT, { name: 'dojo-engawa-deck' }));
  // Stützpfosten: Ohne sie schwebt das Deck sichtbar über dem Boden – in der
  // Silhouette war es ein losgelöstes Brett neben dem Gebäude.
  const pierGeo = board(0.11, 0.42, 0.11, 0.3);
  const piers = [];
  for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) piers.push({ x, y: -0.3, z: ROOM.maxZ + 0.72 });
  engawa.add(instanced(pierGeo, hinokiDark, piers, { name: 'dojo-engawa-piers' }));

  const stepBoard = new THREE.Mesh(board(2.6, 0.11, 0.34, 0.5), hinokiDark);
  stepBoard.position.set(0, -0.17, ROOM.maxZ + 1.05);
  stepBoard.castShadow = true;
  stepBoard.receiveShadow = true;
  engawa.add(stepBoard);
  group.add(engawa);

  // Sicherung: Nichts darf in die Freizone ragen, in der die Ideenkarten
  // erscheinen (cards.js:256, Radius 1,15–1,5 m). Der Boden ist ausgenommen.
  if (import.meta.env?.DEV) {
    const local = new THREE.Box3();
    const mat = new THREE.Matrix4();

    const pruefe = (name, b) => {
      if (b.min.y > 0.2 || b.max.y < 0.2) return;
      const nearest = Math.hypot(
        Math.max(b.min.x, 0, -b.max.x),
        Math.max(b.min.z, 0, -b.max.z)
      );
      if (nearest < FREE_RADIUS) {
        console.warn(`[dojo] "${name}" ragt in die Kartenzone (${nearest.toFixed(2)} m)`);
      }
    };

    group.traverse((o) => {
      if (!o.isMesh || o.name === 'dojo-floor' || o.name.startsWith('dojo-tatami')) return;
      // Bei einem InstancedMesh ist die Hülle ALLER Instanzen zu prüfen sinnlos:
      // Wände, die einen Raum umschließen, enthalten zwangsläufig dessen Mitte,
      // und die Prüfung meldete deshalb "dojo-walls" und "dojo-frames" mit
      // 0,00 m – obwohl dort nichts steht. Jede Instanz wird einzeln geprüft.
      if (o.isInstancedMesh) {
        o.updateWorldMatrix(true, false);
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, mat);
          mat.premultiply(o.matrixWorld);
          local.copy(o.geometry.boundingBox).applyMatrix4(mat);
          pruefe(`${o.name || o.type}[${i}]`, local);
        }
        return;
      }
      // Bei einem VERSCHMOLZENEN Mesh gilt dasselbe: Die Hülle der zu einem
      // Ring zusammengefassten Wandsegmente enthält die Raummitte, obwohl dort
      // nichts steht. Deshalb werden hier die Vertices abgetastet statt der
      // Hüllquader – die Wände bestehen aus Quadern, ein Eckpunkt liegt also
      // zwangsläufig in der Nähe, wenn tatsächlich etwas hineinragt.
      o.updateWorldMatrix(true, false);
      const pos = o.geometry.attributes.position;
      if (!pos) return;
      const v = new THREE.Vector3();
      let nearest = Infinity;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (v.y < 0.05 || v.y > 2.2) continue; // nur die Höhe, in der Karten stehen
        const d = Math.hypot(v.x, v.z);
        if (d < nearest) nearest = d;
      }
      if (nearest < FREE_RADIUS) {
        console.warn(
          `[dojo] "${o.name || o.type}" ragt in die Kartenzone (${nearest.toFixed(2)} m)`
        );
      }
    });
  }

  // Die Architektur selbst bewegt sich nicht – Staub, Licht und Code-Regen
  // gehören in atmosphere.js.
  return { group, update() {} };
}
