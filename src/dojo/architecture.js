import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hinokiMaterial, plasterMaterial, tatamiMaterial, washiMaterial, scaleUV } from './materials.js';
import { ROOM, SHOJI, TATAMI, TOKONOMA, WALL, FREE_RADIUS } from './layout.js';

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
function instanced(geometry, material, transforms, { cast = true, receive = true, name = '' } = {}) {
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
  const washi = washiMaterial({ emissive: 0xffeccc, emissiveIntensity: 0.62 });

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

  // --- Tatami-Feld ----------------------------------------------------------
  //
  // Normmaß 0,91 × 1,82 m. Das ist der Maßstabsgeber des Raums: Wer hier
  // schummelt, verändert die gefühlte Größe von allem anderen.
  //
  // Verlegt im Wechsel (quer/längs paarweise), wie es üblich ist – ein
  // durchgehendes Raster sähe aus wie Fliesen, nicht wie Matten.
  const matGeo = board(TATAMI.long, TATAMI.thickness, TATAMI.short, 0.42);
  const borderGeo = new THREE.BoxGeometry(TATAMI.long, 0.005, 0.055);
  const mats = [];
  const borders = [];
  const matY = 0.055 + TATAMI.thickness / 2;

  // Feldgrenzen: die eigentliche Übungsfläche, ringsum bleibt Diele frei.
  const FX0 = -3.64;
  const FX1 = 3.64;
  const FZ0 = -5.0;
  const FIELD_ROWS = 6;

  for (let r = 0; r < FIELD_ROWS; r++) {
    const z = FZ0 + r * TATAMI.short + TATAMI.short / 2;
    // Jede zweite Reihe um eine halbe Matte versetzt – der übliche Verband.
    // Ohne Versatz entsteht ein durchgehendes Kreuzfugenraster, das wie
    // Fliesen aussieht und nicht wie ausgelegte Matten.
    const stagger = r % 2 === 1;
    let x = FX0;
    let first = true;
    while (x < FX1 - 1e-3) {
      // Randmatten werden gekürzt statt weggelassen. Der frühere Filter hat
      // jede Matte verworfen, die nicht ganz passte – übrig blieb ein
      // Flickenteppich mitten im Raum statt eines Feldes.
      let len = first && stagger ? TATAMI.long / 2 : TATAMI.long;
      len = Math.min(len, FX1 - x);
      const cx = x + len / 2;
      const sx = len / TATAMI.long;
      mats.push({ x: cx, y: matY, z, scale: [sx, 1, 1] });
      // Dunkle Leinenborte (Heri) an den Längsseiten – ohne sie zerfließt das
      // Feld zu einer grünen Fläche und die Mattengrenzen verschwinden.
      // Knapp **über** der Mattenoberkante. Vorher lag die Borte auf halber
      // Mattenhöhe, also vollständig im Tatami versteckt: Das Feld las sich als
      // eine einzige grüne Fläche, und damit fehlte dem Raum der Maßstab, an
      // dem man seine Größe überhaupt ablesen kann.
      const heriY = 0.055 + TATAMI.thickness + 0.0015;
      borders.push({ x: cx, y: heriY, z: z - TATAMI.short / 2 + 0.028, scale: [sx, 1, 1] });
      borders.push({ x: cx, y: heriY, z: z + TATAMI.short / 2 - 0.028, scale: [sx, 1, 1] });
      x += len;
      first = false;
    }
  }
  group.add(instanced(matGeo, tatami, mats, { cast: false, name: 'dojo-tatami' }));
  group.add(
    instanced(borderGeo, new THREE.MeshStandardMaterial({ color: 0x2f2b26, roughness: 0.88 }), borders, {
      cast: false,
      name: 'dojo-tatami-heri',
    })
  );

  // --- Wände ----------------------------------------------------------------
  //
  // Zu einem Mesh verschmolzen: Drei Wände sind drei statische Quader mit
  // demselben Material, das sind drei Draw-Calls ohne jeden Gewinn.
  const t = WALL.thickness;
  const h = ROOM.wallTop;
  const wallGeos = [
    // Nord (hinter dem Tokonoma), in zwei Stücken links und rechts der Nische
    board((ROOM.maxX - ROOM.minX) / 2 - TOKONOMA.width / 2 + 0.4, h, t, 1.1).translate(
      (ROOM.minX + TOKONOMA.centerX - TOKONOMA.width / 2) / 2 - 0.2,
      h / 2,
      WALL.north - t / 2
    ),
    board((ROOM.maxX - ROOM.minX) / 2 - TOKONOMA.width / 2 + 0.4, h, t, 1.1).translate(
      (ROOM.maxX + TOKONOMA.centerX + TOKONOMA.width / 2) / 2 + 0.2,
      h / 2,
      WALL.north - t / 2
    ),
    // West (Putzwand, davor steht der Waffenständer)
    board(t, h, ROOM.maxZ - ROOM.minZ, 1.1).translate(WALL.west + t / 2, h / 2, (ROOM.minZ + ROOM.maxZ) / 2),
    // Süd: **volle Wand.** Vorher stand hier nur eine 50-cm-Brüstung, darüber
    // war der Raum offen – wer sich umdrehte, sah in den fast schwarzen
    // Hintergrund. Ein Raum, aus dem man in ein Nichts blickt, ist kein Raum;
    // die Referenzen zeigen ausnahmslos vier geschlossene Wände.
    board(ROOM.maxX - ROOM.minX, h, t, 1.1).translate(0, h / 2, WALL.south + t / 2),
    // Abschluss zwischen Ranma-Oberkante und Decke, rundum. Ohne den bliebe
    // genau der Spalt offen, der beim alten Dach vier Runden gekostet hat –
    // diesmal ist er von vornherein zu.
    board(t, ROOM.ceilingY - ROOM.ranmaTop + 0.02, ROOM.maxZ - ROOM.minZ + 0.4, 1.1).translate(
      WALL.west + t / 2, (ROOM.ranmaTop + ROOM.ceilingY) / 2, (ROOM.minZ + ROOM.maxZ) / 2
    ),
    board(t, ROOM.ceilingY - ROOM.ranmaTop + 0.02, ROOM.maxZ - ROOM.minZ + 0.4, 1.1).translate(
      WALL.east - t / 2, (ROOM.ranmaTop + ROOM.ceilingY) / 2, (ROOM.minZ + ROOM.maxZ) / 2
    ),
    board(ROOM.maxX - ROOM.minX + 0.4, ROOM.ceilingY - ROOM.ranmaTop + 0.02, t, 1.1).translate(
      0, (ROOM.ranmaTop + ROOM.ceilingY) / 2, WALL.north - t / 2
    ),
    board(ROOM.maxX - ROOM.minX + 0.4, ROOM.ceilingY - ROOM.ranmaTop + 0.02, t, 1.1).translate(
      0, (ROOM.ranmaTop + ROOM.ceilingY) / 2, WALL.south + t / 2
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
    board(t, 0.62, ROOM.maxZ - ROOM.minZ + 1.0, 1.1).translate(
      WALL.west + t / 2, ROOM.wallTop + 0.2, (ROOM.minZ + ROOM.maxZ) / 2
    ),
    board(t, 0.62, ROOM.maxZ - ROOM.minZ + 1.0, 1.1).translate(
      WALL.east - t / 2, ROOM.wallTop + 0.2, (ROOM.minZ + ROOM.maxZ) / 2
    ),
    // Über dem Tokonoma-Sturz bis zur Traufe – sonst sieht man über der Nische
    // in den schwarzen Hintergrund.
    board(TOKONOMA.width + 0.3, h - TOKONOMA.headY - 0.22, t, 1.1).translate(
      TOKONOMA.centerX, (TOKONOMA.headY + 0.22 + h) / 2, WALL.north - t / 2
    ),
    // Ost: die Shoji-Front füllt nur z = fromZ…toZ und reicht bis headY. Der
    // Rest muss zu, sonst sieht man über und neben ihr in den schwarzen
    // Hintergrund – im ersten Durchgang war das ein leuchtendes Loch, das die
    // halbe Ostseite ausgebrannt hat.
    board(t, h - SHOJI.headY - 0.14, SHOJI.toZ - SHOJI.fromZ, 1.1).translate(
      WALL.east - t / 2, (SHOJI.headY + 0.14 + h) / 2, (SHOJI.fromZ + SHOJI.toZ) / 2
    ),
    board(t, h, SHOJI.fromZ - ROOM.minZ, 1.1).translate(
      WALL.east - t / 2, h / 2, (ROOM.minZ + SHOJI.fromZ) / 2
    ),
    board(t, h, ROOM.maxZ - SHOJI.toZ, 1.1).translate(
      WALL.east - t / 2, h / 2, (SHOJI.toZ + ROOM.maxZ) / 2
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

  // Erhöhter Nischenboden aus einem einzigen dicken Brett
  const tokFloor = new THREE.Mesh(board(TOKONOMA.width, TOKONOMA.floorY, TOKONOMA.depth, 0.5), hinokiDark);
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
  post.position.set(TOKONOMA.centerX + TOKONOMA.width / 2, TOKONOMA.headY / 2, WALL.north - TOKONOMA.depth);
  post.castShadow = true;
  post.receiveShadow = true;
  tok.add(post);

  // Sturz über der Nische
  const lintel = new THREE.Mesh(board(TOKONOMA.width + 0.24, 0.22, TOKONOMA.depth + 0.06, 0.6), hinokiDark);
  lintel.position.set(TOKONOMA.centerX, TOKONOMA.headY + 0.11, WALL.north - TOKONOMA.depth / 2);
  lintel.castShadow = true;
  tok.add(lintel);
  group.add(tok);

  // --- Shoji-Front (Ost) ----------------------------------------------------
  //
  // Das Gitter ist **echte Geometrie**, keine Textur. Im Gegenlicht ist genau
  // dieses Gitter die Silhouette, die den Raum als japanisch lesbar macht; als
  // Textur auf einer Fläche hätte es keinen eigenen Schattenwurf und keine
  // Tiefe, und die Lichtschächte träfen auf nichts.
  const shoji = new THREE.Group();
  shoji.name = 'dojo-shoji';
  const spanZ = SHOJI.toZ - SHOJI.fromZ;
  const panelW = spanZ / SHOJI.panels;
  const panelH = SHOJI.headY - SHOJI.sillY;
  const frameGeos = [];
  const latticeT = [];
  const papers = [];

  for (let p = 0; p < SHOJI.panels; p++) {
    const cz = SHOJI.fromZ + panelW * (p + 0.5);
    const fw = 0.045;
    // Rahmen: zwei senkrechte Holme, oben und unten ein Riegel
    frameGeos.push(
      board(0.05, panelH, fw, 0.4).translate(SHOJI.x - 0.025, (SHOJI.sillY + SHOJI.headY) / 2, cz - panelW / 2 + fw / 2),
      board(0.05, panelH, fw, 0.4).translate(SHOJI.x - 0.025, (SHOJI.sillY + SHOJI.headY) / 2, cz + panelW / 2 - fw / 2),
      board(0.05, fw, panelW, 0.4).translate(SHOJI.x - 0.025, SHOJI.sillY + fw / 2, cz),
      board(0.05, fw, panelW, 0.4).translate(SHOJI.x - 0.025, SHOJI.headY - fw / 2, cz)
    );
    // Gitterstäbe
    const { cols, rows: lrows, barWidth, barDepth } = SHOJI.lattice;
    for (let c = 1; c < cols; c++) {
      latticeT.push({
        x: SHOJI.x - 0.012,
        y: (SHOJI.sillY + SHOJI.headY) / 2,
        z: cz - panelW / 2 + (panelW * c) / cols,
        scale: [1, panelH / 1, 1],
      });
    }
    for (let r = 1; r < lrows; r++) {
      latticeT.push({
        x: SHOJI.x - 0.012,
        y: SHOJI.sillY + (panelH * r) / lrows,
        z: cz,
        // **Um X drehen, nicht um Z.** Der Stab ist ein Quader, dessen Laenge
        // auf der lokalen Y-Achse liegt. Eine Drehung um Z legt diese Achse auf
        // world-X – also **in den Raum hinein**: Die waagerechten Sprossen
        // standen dadurch als Staebe aus dem Fenster heraus. Um X gedreht liegt
        // sie auf world-Z, also entlang des Fensters, wo sie hingehoert.
        rx: Math.PI / 2,
        scale: [1, panelW / 1, 1],
      });
    }
    papers.push(
      new THREE.PlaneGeometry(panelW - fw * 2, panelH - fw * 2)
        .rotateY(-Math.PI / 2)
        .translate(SHOJI.x - 0.004, (SHOJI.sillY + SHOJI.headY) / 2, cz)
    );
    // Brüstungsfeld (Koshi) unter dem Papier – volles Holz, kein Licht
    frameGeos.push(board(0.05, SHOJI.sillY, panelW, 0.4).translate(SHOJI.x - 0.025, SHOJI.sillY / 2, cz));
  }
  const frames = new THREE.Mesh(mergeGeometries(frameGeos, false), hinokiDark);
  frames.castShadow = true;
  frames.receiveShadow = true;
  shoji.add(frames);

  const barGeo = new THREE.BoxGeometry(SHOJI.lattice.barDepth, 1, SHOJI.lattice.barWidth);
  shoji.add(instanced(barGeo, hinokiDark, latticeT, { receive: false, name: 'dojo-lattice' }));

  const paper = new THREE.Mesh(mergeGeometries(papers, false), washi);
  paper.name = 'dojo-washi';
  // **Papier wirft Schatten.** Ohne das schien die Sonne ungehindert durch die
  // Shoji auf den Boden, als stünde dort gar keine Wand – der ganze
  // Ostbereich brannte auf reines Weiß aus. Drei Runden Zurücknehmen an den
  // additiven Lagen haben das Symptom bekämpft und die Ursache nicht berührt.
  // Washi lässt Licht durch, aber es *dämpft* es; genau diese Dämpfung fehlte.
  // Das Durchscheinen macht weiterhin `emissive` plus die Lichtschächte.
  paper.castShadow = true;
  paper.receiveShadow = true;
  shoji.add(paper);

  // Sturz und Schwelle über die ganze Front
  const head = new THREE.Mesh(board(0.09, 0.14, spanZ + 0.2, 0.6), hinokiDark);
  head.position.set(SHOJI.x - 0.045, SHOJI.headY + 0.07, (SHOJI.fromZ + SHOJI.toZ) / 2);
  head.castShadow = true;
  shoji.add(head);
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
  const ceilGeo = new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ);
  ceilGeo.rotateX(Math.PI / 2); // Normale nach unten – wir sehen sie von innen
  scaleUV(ceilGeo, (ROOM.maxX - ROOM.minX) / 0.4, (ROOM.maxZ - ROOM.minZ) / 0.4);
  ceilGeo.translate(0, ROOM.ceilingY, (ROOM.minZ + ROOM.maxZ) / 2);
  const ceiling = new THREE.Mesh(ceilGeo, hinokiMaterial({ color: 0xb69a76 }));
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
  const spine = new THREE.Mesh(board(0.22, 0.2, ROOM.maxZ - ROOM.minZ, 0.7), hinokiDark);
  spine.position.set(0, ROOM.ceilingY - 0.28, (ROOM.minZ + ROOM.maxZ) / 2);
  spine.castShadow = true;
  roof.add(spine);
  group.add(roof);

  // --- Ranma: Fensterband zwischen Wandkrone und Decke -----------------------
  //
  // Der schmale Streifen mit feinem Gitter, der in den Referenzen rundum über
  // den Wänden läuft. Er bringt das Licht **oben** in den Raum – der Grund,
  // warum ein Dojo hell wirkt, ohne dass eine Wand fehlt – und er schließt die
  // Lücke zwischen Wand und Decke, die vorher offen war.
  const ranma = new THREE.Group();
  ranma.name = 'dojo-ranma';
  const ranmaH = ROOM.ranmaTop - ROOM.wallTop;
  const ranmaGeos = [];
  const ranmaBars = [];
  const RANMA_STEP = 0.34;

  const runRanma = (fixedAxis, fixedVal, from, to, along) => {
    // Rahmen oben und unten über die ganze Länge
    const len = to - from;
    const mid = (from + to) / 2;
    for (const y of [ROOM.wallTop + 0.03, ROOM.ranmaTop - 0.03]) {
      const g = along === 'z'
        ? board(0.1, 0.06, len, 0.4).translate(fixedVal, y, mid)
        : board(len, 0.06, 0.1, 0.4).translate(mid, y, fixedVal);
      ranmaGeos.push(g);
    }
    // Senkrechte Sprossen
    for (let t = from + RANMA_STEP; t < to - 0.05; t += RANMA_STEP) {
      ranmaBars.push(along === 'z'
        ? { x: fixedVal, y: (ROOM.wallTop + ROOM.ranmaTop) / 2, z: t }
        : { x: t, y: (ROOM.wallTop + ROOM.ranmaTop) / 2, z: fixedVal });
    }
    // Papierfeld dahinter – dieselbe Wirkung wie bei der Shoji-Front
    const paperGeo = along === 'z'
      ? new THREE.PlaneGeometry(len, ranmaH - 0.06).rotateY(-Math.PI / 2).translate(fixedVal + 0.03, (ROOM.wallTop + ROOM.ranmaTop) / 2, mid)
      : new THREE.PlaneGeometry(len, ranmaH - 0.06).translate(mid, (ROOM.wallTop + ROOM.ranmaTop) / 2, fixedVal + 0.03);
    return paperGeo;
  };

  const ranmaPapers = [
    runRanma('x', WALL.east - 0.06, ROOM.minZ, ROOM.maxZ, 'z'),
    runRanma('x', WALL.west + 0.06, ROOM.minZ, ROOM.maxZ, 'z'),
    runRanma('z', WALL.north + 0.06, ROOM.minX, ROOM.maxX, 'x'),
    runRanma('z', WALL.south - 0.06, ROOM.minX, ROOM.maxX, 'x'),
  ];
  const ranmaFrame = new THREE.Mesh(mergeGeometries(ranmaGeos, false), hinokiDark);
  ranmaFrame.castShadow = true;
  ranma.add(ranmaFrame);
  const ranmaBarGeo = new THREE.BoxGeometry(0.028, ranmaH - 0.06, 0.028);
  ranma.add(instanced(ranmaBarGeo, hinokiDark, ranmaBars, { receive: false, name: 'dojo-ranma-bars' }));
  const ranmaPaper = new THREE.Mesh(mergeGeometries(ranmaPapers, false), washi);
  ranmaPaper.name = 'dojo-ranma-paper';
  ranma.add(ranmaPaper);
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
  for (const x of [-4.6, -2.3, 0, 2.3, 4.6]) piers.push({ x, y: -0.30, z: ROOM.maxZ + 0.72 });
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
    const box = new THREE.Box3();
    group.traverse((o) => {
      if (!o.isMesh || o.name === 'dojo-floor' || o.name.startsWith('dojo-tatami')) return;
      box.setFromObject(o);
      if (box.min.y > 0.2 || box.max.y < 0.2) return;
      const nearest = Math.hypot(Math.max(box.min.x, 0, -box.max.x), Math.max(box.min.z, 0, -box.max.z));
      if (nearest < FREE_RADIUS) {
        console.warn(`[dojo] "${o.name || o.type}" ragt in die Kartenzone (${nearest.toFixed(2)} m)`);
      }
    });
  }

  // Die Architektur selbst bewegt sich nicht – Staub, Licht und Code-Regen
  // gehören in atmosphere.js.
  return { group, update() {} };
}
