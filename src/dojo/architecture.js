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
  const washi = washiMaterial({ emissive: 0xffeccc, emissiveIntensity: 0.16 });

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
    // Süd, nur als Brüstung – hier ist der Zugang
    board(ROOM.maxX - ROOM.minX, 0.5, t, 1.1).translate(0, 0.25, WALL.south + t / 2),
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
  // Giebeldreiecke: Zwischen Traufhöhe und Dachfläche klaffte an Nord- und
  // Südseite ein offenes Dreieck, durch das man in den Hintergrund sah. Ein
  // Raum, der nach oben offen ist, ist kein Raum.
  for (const z of [WALL.north, WALL.south]) {
    const shape = new THREE.Shape();
    shape.moveTo(ROOM.minX, ROOM.wallTop);
    shape.lineTo(0, ROOM.ridgeY + 0.12);
    shape.lineTo(ROOM.maxX, ROOM.wallTop);
    shape.closePath();
    const gable = new THREE.ShapeGeometry(shape);
    // **Erst drehen, dann verschieben.** `rotateY` dreht um den Ursprung, nicht
    // um den eigenen Mittelpunkt – in der umgekehrten Reihenfolge landete der
    // Südgiebel gespiegelt bei negativem z, also mitten im Raum, und ragte als
    // Spitze aus dem Dach. In der Silhouette war das sofort zu sehen.
    if (z > 0) gable.rotateY(Math.PI);
    gable.translate(0, 0, z + (z < 0 ? -t / 2 : t / 2));
    wallGeos.push(gable);
  }

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
        rz: Math.PI / 2,
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

  // --- Offener Dachstuhl ----------------------------------------------------
  //
  // Sichtbar von unten bis zum First. Ein geschlossener Deckel auf 3,6 m würde
  // den Raum halbieren; die Höhe ist der halbe Grund, warum ein Dojo
  // beeindruckt.
  const roof = new THREE.Group();
  roof.name = 'dojo-roof';

  // Querbalken (Hari) – dick, unregelmäßig verteilt, tragend aussehend
  const hariGeo = board(ROOM.maxX - ROOM.minX, 0.26, 0.22, 0.7);
  const hariT = [-5.2, -3.4, -1.6, 0.2, 2.0].map((z) => ({ x: 0, y: ROOM.wallTop + 0.13, z }));
  roof.add(instanced(hariGeo, hinokiDark, hariT, { receive: false, name: 'dojo-hari' }));

  // Firstbalken
  const ridge = new THREE.Mesh(board(0.2, 0.24, ROOM.maxZ - ROOM.minZ, 0.7), hinokiDark);
  ridge.position.set(0, ROOM.ridgeY, (ROOM.minZ + ROOM.maxZ) / 2);
  ridge.castShadow = true;
  roof.add(ridge);

  // Sparren: vom Traufbalken schräg zum First, beide Dachseiten
  const rise = ROOM.ridgeY - ROOM.wallTop;
  const run = (ROOM.maxX - ROOM.minX) / 2;
  const rafterLen = Math.hypot(rise, run);
  const rafterGeo = board(rafterLen, 0.1, 0.075, 0.6);
  const rafterT = [];
  const step = 0.52;
  for (let z = ROOM.minZ + 0.3; z <= ROOM.maxZ - 0.3; z += step) {
    for (const side of [-1, 1]) {
      rafterT.push({
        x: (side * run) / 2,
        y: (ROOM.wallTop + ROOM.ridgeY) / 2 + 0.1,
        z,
        rz: side * Math.atan2(rise, run) * -1,
      });
    }
  }
  roof.add(instanced(rafterGeo, hinoki, rafterT, { receive: false, name: 'dojo-rafters' }));

  // Dachschalung als geschlossene Fläche darüber – sonst sieht man durch das
  // Dach in den schwarzen Hintergrund und der Raum verliert seinen Abschluss.
  const deckGeos = [];
  for (const side of [-1, 1]) {
    deckGeos.push(
      new THREE.PlaneGeometry(rafterLen, ROOM.maxZ - ROOM.minZ)
        .rotateX(-Math.PI / 2)
        .rotateZ(side * Math.atan2(rise, run))
        .translate((side * run) / 2, (ROOM.wallTop + ROOM.ridgeY) / 2 + 0.17, (ROOM.minZ + ROOM.maxZ) / 2)
    );
  }
  const deck = new THREE.Mesh(mergeGeometries(deckGeos, false), new THREE.MeshStandardMaterial({
    color: 0x7d6650,
    roughness: 0.95,
    // Die Unterseite bekommt von der Sonne nichts ab – sie zeigt nach unten.
    // Ohne einen Eigenanteil bleibt sie schwarz und liest sich als Loch in den
    // Nachthimmel statt als Bretterschalung über den Sparren.
    emissive: 0x241c15,
    side: THREE.DoubleSide,
  }));
  deck.name = 'dojo-deck';
  deck.receiveShadow = true;
  roof.add(deck);
  group.add(roof);

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
