import * as THREE from 'three';

// Automatisches Mindmap-Layout.
//
// Neue Karten landen im Halbkreis in Entstehungsreihenfolge (`arrangeInArc`).
// Nach zwanzig Minuten Brainstorming heißt das: Zusammengehörige Karten stehen
// weit auseinander, unzusammenhängende nebeneinander, und die Linien kreuzen
// quer durch den Raum. Die Struktur steckt im Verbindungsgraphen, aber nicht im
// Raum. Dieses Modul dreht das um.
//
// **Radial statt kräftebasiert.** Ein Federmodell (Fruchterman-Reingold) könnte
// beliebige Graphen, würfelt aber bei jedem Lauf ein anderes Bild. Zweimal
// denselben Knopf drücken und zweimal etwas anderes bekommen zerstört das
// Vertrauen in die Funktion. Das radiale Verfahren ist deterministisch, braucht
// keine Iteration und sieht aus, wie Leute eine Mindmap erwarten.
//
// Nicht zu verwechseln mit `flowLayout.js`: Das arbeitet mit Rängen („wie weit
// hinten liegt dieser Knoten?"), was eine Richtung voraussetzt.
// Mindmap-Verbindungen sind bewusst ungerichtet.
//
// Zwei Schritte, bewusst getrennt:
//   1. Ein flaches Radiallayout in der Ebene (u = quer, v = hoch) – das ist die
//      Mindmap, wie man sie von Papier kennt.
//   2. Projektion dieser Ebene auf eine gekrümmte Wand um den Nutzer. Eine
//      ebene Scheibe wäre nur ein Bildschirm im Raum; gekrümmt bleibt alles
//      gleich weit weg und gleich gut lesbar.

// Ringe wachsen unterproportional – bei linearem Wachstum driftet die dritte
// Ebene aus dem bequemen Blickfeld.
const RINGS = [0, 1.1, 1.8, 2.35];
const RING_STEP = 0.45; // ab Ebene 4
const MAX_RING_GROWTH = 1.2; // wie weit ein Ring wegen Enge höchstens rausrückt
const MIN_RING_STEP = 0.5; // Elternteil und Kind dürfen sich nie berühren
const MIN_SEPARATION = 0.34; // Karten sind rund 0,3 m breit

// Breite und Höhe des Fächers. Die Senkrechte ist deutlich enger – dieselbe
// Begründung wie beim waagerechten Prozess-Layout: Zur Seite ist Platz, nach
// oben und unten nicht. Die Mindmap wird deshalb schon in der Ebene gestaucht,
// sie wird breit statt hoch.
//
// ±38° und nicht ±80°, obwohl in der Brille auch mehr bequem wäre: Am
// Schreibtisch sieht die Kamera nur rund 90° breit, ein weiterer Fächer liefe
// dort rechts und links aus dem Bild – und knapp an der Kante reicht nicht, die
// äußersten Karten wären halb abgeschnitten. Statt breiter wird die Wand lieber
// weiter weg gerückt – dann passt sie auf beiden Geräten ins Blickfeld.
const MAX_AZIMUTH = THREE.MathUtils.degToRad(38);
const MAX_ELEVATION = THREE.MathUtils.degToRad(20);
const VERTICAL_SQUASH = 0.38;

const MIN_DISTANCE = 2.2; // Abstand der Wand vom Nutzer
const EYE_Y = 1.5;
const ISLAND_GAP = 0.8; // Luft zwischen zwei Zusammenhangskomponenten
const LOOSE_GAP = 0.45; // Abstand der Reihe loser Karten zur Mindmap
const LOOSE_STEP_U = 0.42;
const LOOSE_STEP_V = 0.38;
const LOOSE_PER_ROW = 8;

function defaultRing(depth) {
  if (depth < RINGS.length) return RINGS[depth];
  return RINGS[RINGS.length - 1] + (depth - RINGS.length + 1) * RING_STEP;
}

// Nachbarschaft aus den ungerichteten Verbindungen. Beide Richtungen
// eingetragen, denn eine Mindmap-Linie hat keine.
export function buildAdjacency(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!ids.has(e.a) || !ids.has(e.b) || e.a === e.b) continue;
    const from = adjacency.get(e.a);
    const to = adjacency.get(e.b);
    if (!from.includes(e.b)) from.push(e.b);
    if (!to.includes(e.a)) to.push(e.a);
  }
  return adjacency;
}

// Wurzel: die ausgewählte Karte, sonst die mit den meisten Verbindungen. Bei
// Gleichstand entscheidet die Reihenfolge in `nodes` – damit bleibt das
// Ergebnis reproduzierbar.
export function pickRoot(nodes, adjacency, preferredId = null) {
  if (preferredId && nodes.some((n) => n.id === preferredId)) return preferredId;
  let best = null;
  let bestDegree = -1;
  for (const node of nodes) {
    const degree = adjacency.get(node.id)?.length ?? 0;
    if (degree > bestDegree) {
      best = node.id;
      bestDegree = degree;
    }
  }
  return best;
}

// Spannbaum per Breitensuche. Macht aus dem Graphen einen Baum und löst Kreise
// nebenbei: Wer schon besucht ist, wird kein zweites Kind. Querverbindungen
// werden weiterhin gezeichnet – nur eben nicht fürs Layout benutzt.
export function buildTree(rootId, adjacency) {
  const parent = new Map([[rootId, null]]);
  const children = new Map([[rootId, []]]);
  const depth = new Map([[rootId, 0]]);
  const order = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    for (const next of adjacency.get(id) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, id);
      children.set(next, []);
      depth.set(next, depth.get(id) + 1);
      children.get(id).push(next);
      order.push(next);
      queue.push(next);
    }
  }
  // Teilbaumgrößen von hinten nach vorn aufsummieren – die Breitensuche liefert
  // Eltern garantiert vor ihren Kindern, rückwärts also Kinder zuerst.
  const size = new Map(order.map((id) => [id, 1]));
  for (let i = order.length - 1; i > 0; i--) {
    const id = order[i];
    const p = parent.get(id);
    size.set(p, size.get(p) + size.get(id));
  }
  return { parent, children, depth, order, size };
}

// Winkel je Knoten. Der eigentliche Kniff: Jedem Kind denselben Sektor zu geben
// sieht falsch aus – ein Zweig mit sechs Nachfahren würde in dasselbe Viertel
// gequetscht wie ein einzelnes Blatt. Der Sektor ist deshalb **proportional zur
// Größe des Teilbaums**, und innerhalb eines Zweigs wiederholt sich das
// rekursiv. Das ist die radiale Fassung des Reingold-Tilford-Verfahrens.
export function assignAngles(tree) {
  const { children, order, size } = tree;
  const root = order[0];
  // Der Fächer beginnt eine Vierteldrehung versetzt. Ohne das säßen zwei Kinder
  // genau über- und untereinander statt links und rechts – bei einer breiten,
  // flachen Wand die schlechteste aller Aufteilungen. Mit dem Versatz liegt der
  // Fächer symmetrisch zur Waagerechten.
  const angle = new Map([[root, Math.PI / 2]]);
  const sector = new Map([[root, 2 * Math.PI]]);

  for (const id of order) {
    const kids = children.get(id) ?? [];
    if (!kids.length) continue;
    // Blätter zählen mit (Größe 1), sonst bekäme ein Ast aus lauter Blättern
    // keinen Platz.
    const total = kids.reduce((sum, k) => sum + size.get(k), 0);
    const own = sector.get(id);
    // Die Wurzel verteilt den vollen Kreis, tiefere Knoten nur ihren ererbten
    // Sektor – sonst überlappen Nachbaräste.
    let cursor = angle.get(id) - own / 2;
    for (const kid of kids) {
      const share = (size.get(kid) / total) * own;
      angle.set(kid, cursor + share / 2);
      sector.set(kid, share);
      cursor += share;
    }
  }
  return { angle, sector };
}

// Ringradien: Grundwert, aber weiter raus, wenn ein Ring eng besetzt ist.
// Sonst rücken zwölf Geschwister auf Ring 1 so dicht zusammen, dass sich die
// Karten überlappen.
//
// Der nötige Radius wird ausgerechnet, nicht geschätzt: Auf einem Ring wachsen
// alle Abstände linear mit dem Radius. Es genügt also, die Positionen einmal
// auf dem Einheitsring zu bestimmen, den kleinsten Abstand zu suchen und den
// Radius so zu wählen, dass daraus MIN_SEPARATION wird. Die Stauchung der
// Senkrechten steckt in den Einheitspositionen schon drin – zwei Nachbarn, die
// übereinander liegen, sind dadurch enger beieinander als zwei nebeneinander.
//
// Ein Schätzwert über den Sektorwinkel wäre viel zu vorsichtig gewesen: Der
// Sektor eines Blatts sagt nichts über den Abstand zu seinen Nachbarn, und die
// Ringe wären auch bei harmlosen Bäumen unnötig weit rausgerückt.
function ringRadii(tree, angle) {
  const maxDepth = Math.max(0, ...tree.depth.values());
  const radii = [0];
  for (let d = 1; d <= maxDepth; d++) {
    const unit = tree.order
      .filter((id) => tree.depth.get(id) === d)
      .map((id) => [Math.cos(angle.get(id)), Math.sin(angle.get(id)) * VERTICAL_SQUASH]);
    let closest = Infinity;
    for (let i = 0; i < unit.length; i++)
      for (let j = i + 1; j < unit.length; j++)
        closest = Math.min(closest, Math.hypot(unit[i][0] - unit[j][0], unit[i][1] - unit[j][1]));

    const needed = Number.isFinite(closest) && closest > 1e-6 ? MIN_SEPARATION / closest : 0;
    // Nach oben gedeckelt: Ein extrem enger Ring tief im Baum würde den Radius
    // sonst auf zwanzig Meter treiben.
    const grown = Math.min(Math.max(defaultRing(d), needed), defaultRing(d) + MAX_RING_GROWTH);
    // Ringe müssen wachsen, sonst landet ein Kind neben seinem Elternteil –
    // dadurch schiebt ein aufgeweiteter Ring auch alle folgenden mit raus.
    radii.push(Math.max(grown, radii[d - 1] + MIN_RING_STEP));
  }
  return radii;
}

// Eine Zusammenhangskomponente in der Ebene anordnen. Reine Rechnung, ohne
// Szene testbar – Muster von `flowLayout.js`.
export function computeComponent(nodes, edges, { preferredRoot = null } = {}) {
  const adjacency = buildAdjacency(nodes, edges);
  const rootId = pickRoot(nodes, adjacency, preferredRoot);
  const tree = buildTree(rootId, adjacency);
  const { angle } = assignAngles(tree);
  const radii = ringRadii(tree, angle);

  const local = new Map();
  const bounds = { minU: 0, maxU: 0, minV: 0, maxV: 0 };
  for (const id of tree.order) {
    const r = radii[tree.depth.get(id)];
    const a = angle.get(id);
    const u = Math.cos(a) * r;
    const v = Math.sin(a) * r * VERTICAL_SQUASH;
    local.set(id, { u, v });
    bounds.minU = Math.min(bounds.minU, u);
    bounds.maxU = Math.max(bounds.maxU, u);
    bounds.minV = Math.min(bounds.minV, v);
    bounds.maxV = Math.max(bounds.maxV, v);
  }
  return { local, rootId, tree, bounds, width: bounds.maxU - bounds.minU };
}

// Zusammenhangskomponenten finden. Ein echtes Board hat selten *einen* Graphen,
// sondern drei Gruppen und zwanzig lose Karten.
function findComponents(nodes, adjacency) {
  const seen = new Set();
  const groups = [];
  const loose = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const group = [];
    const queue = [node.id];
    seen.add(node.id);
    while (queue.length) {
      const id = queue.shift();
      group.push(id);
      for (const next of adjacency.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    // Karten ohne jede Verbindung kommen nicht in die Mindmap, sondern in eine
    // Reihe darunter – sonst zerfasert das Bild.
    if (group.length === 1) loose.push(node);
    else groups.push(group.map((id) => nodes.find((n) => n.id === id)));
  }
  return { groups, loose };
}

// Das ganze Board rechnen: erst jede Komponente für sich, dann seitlich
// nebeneinander, dann die losen Karten darunter, dann alles auf die gekrümmte
// Wand projizieren.
export function computeMindmap(nodes, edges, { origin, right, forward, preferredRoot = null } = {}) {
  const adjacency = buildAdjacency(nodes, edges);
  const { groups, loose } = findComponents(nodes, adjacency);

  const laid = groups.map((group) => {
    const ids = new Set(group.map((n) => n.id));
    const inner = edges.filter((e) => ids.has(e.a) && ids.has(e.b));
    const rootHint = group.some((n) => n.id === preferredRoot) ? preferredRoot : null;
    return computeComponent(group, inner, { preferredRoot: rootHint });
  });

  // Komponenten nebeneinander, die Reihe insgesamt mittig.
  const plane = new Map();
  const totalWidth =
    laid.reduce((sum, c) => sum + c.width, 0) + Math.max(0, laid.length - 1) * ISLAND_GAP;
  let cursor = -totalWidth / 2;
  let minV = 0;
  let maxV = 0;
  for (const component of laid) {
    const offset = cursor - component.bounds.minU; // `cursor` ist die linke Kante
    for (const [id, p] of component.local) plane.set(id, { u: p.u + offset, v: p.v });
    minV = Math.min(minV, component.bounds.minV);
    maxV = Math.max(maxV, component.bounds.maxV);
    cursor += component.width + ISLAND_GAP;
  }

  // Lose Karten in Reihen darunter. Mehrere Reihen, damit zwanzig davon die
  // Wand nicht auf zehn Meter Breite ziehen.
  const looseTop = minV - LOOSE_GAP;
  loose.forEach((node, i) => {
    const row = Math.floor(i / LOOSE_PER_ROW);
    const inRow = loose.slice(row * LOOSE_PER_ROW, (row + 1) * LOOSE_PER_ROW);
    const column = i - row * LOOSE_PER_ROW;
    plane.set(node.id, {
      u: (column - (inRow.length - 1) / 2) * LOOSE_STEP_U,
      v: looseTop - row * LOOSE_STEP_V,
    });
  });
  if (loose.length) {
    minV = Math.min(minV, looseTop - Math.floor((loose.length - 1) / LOOSE_PER_ROW) * LOOSE_STEP_V);
  }

  // Abstand der Wand: so weit weg, dass die ganze Ebene in den bequemen
  // Winkelbereich passt. Bei einem kleinen Board bleibt es bei MIN_DISTANCE,
  // ein breites Board rückt weiter weg statt aus dem Blick zu laufen – dieselbe
  // Regel wie beim Prozess-Layout.
  let extentU = 0;
  let extentV = 0;
  for (const p of plane.values()) {
    extentU = Math.max(extentU, Math.abs(p.u));
    extentV = Math.max(extentV, Math.abs(p.v));
  }
  const distance = Math.max(MIN_DISTANCE, extentU / MAX_AZIMUTH, extentV / MAX_ELEVATION);

  const placed = new Map();
  for (const [id, p] of plane) {
    // Bogenlänge auf der Wand = Strecke in der Ebene.
    const azimuth = p.u / distance;
    const elevation = p.v / distance;
    const position = origin
      .clone()
      .addScaledVector(right, Math.sin(azimuth) * Math.cos(elevation) * distance)
      .addScaledVector(forward, Math.cos(azimuth) * Math.cos(elevation) * distance);
    position.y = EYE_Y + Math.sin(elevation) * distance;
    placed.set(id, position);
  }

  return { placed, plane, components: laid, loose, distance };
}

// Auf das Board anwenden. `tweener` ist optional: ohne ihn springen die Karten,
// mit ihm fahren sie über eine knappe halbe Sekunde – in VR deutlich
// angenehmer, weil man die Zuordnung behält.
export function layoutMindmap(cards, connections, camera, scene = null, tweener = null, options = {}) {
  // Prozessknoten bleiben liegen; die haben ihr eigenes Layout.
  const nodes = cards.filter((c) => !c.flowType);
  if (!nodes.length) return 0;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = connections.filter((c) => !c.directed && ids.has(c.a) && ids.has(c.b));

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const { placed } = computeMindmap(nodes, edges, {
    origin: camPos,
    right,
    forward,
    preferredRoot: options.preferredRoot ?? null,
  });

  const target = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  for (const node of nodes) {
    const position = placed.get(node.id);
    if (!position) continue;
    // Gerade gegriffene Karten hängen am Controller – zurück in die Szene,
    // sonst wäre die gesetzte Weltposition relativ zur Hand. Ausdrücklich an
    // die Szene, nicht an `parent.parent`: Der Elternteil eines Controllers ist
    // das Player-Rig, die Karte würde sonst bei jeder Fortbewegung mitfahren.
    if (scene && node.group.parent !== scene) scene.attach(node.group);
    // Zum Nutzer gedreht, ohne zu kippen. Die Argumente stehen absichtlich in
    // dieser Reihenfolge: `Matrix4.lookAt(auge, ziel, oben)` richtet die
    // **-Z**-Achse aufs Ziel, eine Karte schaut aber entlang **+Z**. Genau
    // deshalb dreht `Object3D.lookAt` die beiden intern ebenfalls um.
    target.set(camPos.x, position.y, camPos.z);
    look.lookAt(target, position, up);
    quat.setFromRotationMatrix(look);
    if (tweener) tweener.moveTo(node.group, position, quat);
    else {
      node.group.position.copy(position);
      node.group.quaternion.copy(quat);
    }
  }
  return nodes.length;
}
