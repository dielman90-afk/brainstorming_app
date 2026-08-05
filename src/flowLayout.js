import * as THREE from 'three';

// Automatisches Anordnen eines Prozessflussdiagramms.
//
// Geschichtetes Layout („Sugiyama-light"): Jeder Knoten kommt in eine Zeile
// hinter alle seine Vorgänger, innerhalb einer Zeile werden Geschwister
// waagerecht verteilt. Alles rein lokal gerechnet – keine KI, keine Bibliothek.
//
// Ergebnis ist eine flache Tafel vor dem Nutzer, Fluss **von links nach rechts**.
//
// Waagerecht, weil der Platz nach unten schlicht ausgeht: Zwischen Boden und
// bequemer Blickhöhe liegen keine eineinhalb Meter, das reicht für vier bis
// fünf Zeilen. Zur Seite ist dagegen Platz ohne Ende – und lange Prozesse sind
// die Regel, während eine Verzweigung selten mehr als zwei, drei Äste hat. Also
// bekommt die Kette die Waagerechte und die Geschwister die Senkrechte.
//
// Der Gewinn in VR liegt genau darin: Man geht an einer wandfüllenden Kette
// entlang, statt zu scrollen.

const RANK_GAP = 0.62; // Abstand zwischen zwei Rängen (waagerecht, entlang des Flusses)
const SIBLING_GAP = 0.42; // Abstand zwischen Geschwistern desselben Rangs (senkrecht)
const MIN_DISTANCE = 2.0; // Mindestabstand der Tafel vom Nutzer
const EYE_Y = 1.5; // Höhe der Mittelachse des Diagramms
const MIN_Y = 0.6; // tiefer wird nicht gesetzt – sonst liegt ein Knoten am Boden

// Rückführungen finden: Kanten, die auf einen Knoten zeigen, der im selben
// Pfad schon weiter oben liegt („Unterlagen nachfordern" → zurück zur Prüfung).
//
// Sie müssen vor dem Rangieren raus. Die Rangvergabe fragt „wie weit hinten
// liegt dieser Knoten mindestens?" – im Kreis geführt gibt es darauf keine
// Antwort, der Rang würde bei jeder Runde weiterwachsen. Gezeichnet wird die
// Kante trotzdem, sie zeigt dann eben nach oben. Genau so gehört sie hin.
//
// Tiefensuche mit drei Zuständen: 0 = ungesehen, 1 = liegt gerade auf dem
// Pfad, 2 = abgearbeitet. Eine Kante auf einen Knoten im Zustand 1 zeigt auf
// einen Vorfahren, ist also eine Rückführung.
function findBackEdges(nodes, edges, adjacency) {
  const state = new Map(nodes.map((n) => [n.id, 0]));
  const back = new Set();

  const visit = (root) => {
    // Iterativ statt rekursiv – ein tiefer Prozess soll nicht den Aufrufstapel
    // sprengen.
    const stack = [{ id: root, next: 0 }];
    state.set(root, 1);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const targets = adjacency.get(frame.id) ?? [];
      if (frame.next >= targets.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const { to, index } = targets[frame.next++];
      const s = state.get(to) ?? 0;
      if (s === 1) back.add(index);
      else if (s === 0) {
        state.set(to, 1);
        stack.push({ id: to, next: 0 });
      }
    }
  };

  for (const node of nodes) if (state.get(node.id) === 0) visit(node.id);
  return back;
}

// Zeilennummer je Knoten: längster Pfad vom Start, damit ein Knoten immer
// unterhalb *aller* seiner Vorgänger liegt.
export function rankNodes(nodes, edges) {
  const ids = new Set(nodes.map((n) => n.id));
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e, index) => {
    if (!ids.has(e.a) || !ids.has(e.b) || e.a === e.b) return;
    adjacency.get(e.a).push({ to: e.b, index });
  });

  const back = findBackEdges(nodes, edges, adjacency);
  const forward = new Map(nodes.map((n) => [n.id, []]));
  const indegree = new Map(nodes.map((n) => [n.id, 0]));
  for (const [from, targets] of adjacency) {
    for (const { to, index } of targets) {
      if (back.has(index)) continue;
      forward.get(from).push(to);
      indegree.set(to, indegree.get(to) + 1);
    }
  }

  // Startknoten: nichts zeigt (vorwärts) auf sie. Ohne Rückführungen ist der
  // Rest ein gerichteter Graph ohne Kreise – die Entspannung terminiert.
  const rank = new Map();
  const roots = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (const id of roots.length ? roots : nodes.slice(0, 1).map((n) => n.id)) rank.set(id, 0);

  for (let round = 0; round < nodes.length + 1; round++) {
    let changed = false;
    for (const [from, targets] of forward) {
      const r = rank.get(from);
      if (r === undefined) continue;
      for (const to of targets) {
        if ((rank.get(to) ?? -1) < r + 1) {
          rank.set(to, r + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Unerreichbare Knoten hinten anhängen, statt sie liegen zu lassen
  const maxRank = Math.max(0, ...rank.values());
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, maxRank + 1);
  return rank;
}

// Positionen berechnen. Getrennt vom Anwenden, damit sich das Ergebnis testen
// lässt, ohne eine Szene aufzubauen.
export function computeLayout(nodes, edges, { origin, right, forward }) {
  const rank = rankNodes(nodes, edges);
  const rows = new Map();
  for (const n of nodes) {
    const r = rank.get(n.id);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(n);
  }

  const placed = new Map();
  const sortedRanks = [...rows.keys()].sort((a, b) => a - b);

  // Je länger die Kette, desto weiter weg die Tafel – sonst laufen die äußeren
  // Knoten aus dem Blickfeld und man müsste den Kopf verrenken.
  const width = (sortedRanks.length - 1) * RANK_GAP;
  const distance = Math.max(MIN_DISTANCE, width * 0.6);

  sortedRanks.forEach((r, rankIndex) => {
    const column = rows.get(r);
    // Ganze Kette mittig vor dem Nutzer statt am ersten Knoten ausgerichtet
    const x = (rankIndex - (sortedRanks.length - 1) / 2) * RANK_GAP;
    const top = ((column.length - 1) * SIBLING_GAP) / 2;
    column.forEach((node, i) => {
      const position = origin
        .clone()
        .addScaledVector(forward, distance)
        .addScaledVector(right, x);
      position.y = Math.max(EYE_Y + top - i * SIBLING_GAP, MIN_Y);
      placed.set(node.id, position);
    });
  });
  return placed;
}

// Prozessknoten des Boards auf die Tafel legen und zum Nutzer drehen.
export function layoutFlow(cards, connections, camera) {
  const nodes = cards.filter((c) => c.flowType);
  if (!nodes.length) return 0;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = connections.filter((c) => c.directed && ids.has(c.a) && ids.has(c.b));

  const camPos = new THREE.Vector3();
  camera.getWorldPosition(camPos);
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  // forward × up ergibt die Rechte des Betrachters (Three.js ist rechtshändig,
  // die Kamera blickt entlang -Z). Kein negate() – solange der Rang nur die
  // Geschwister symmetrisch verteilte, war das Vorzeichen egal; jetzt trägt es
  // die Flussrichtung und ein Dreher ließe den Prozess nach links laufen.
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const placed = computeLayout(nodes, edges, { origin: camPos, right, forward });
  for (const node of nodes) {
    const target = placed.get(node.id);
    if (!target) continue;
    // Gerade gegriffene Knoten hängen am Controller – zurück in die Szene,
    // sonst wäre die gesetzte Weltposition relativ zur Hand.
    if (node.group.parent && node.group.parent.type !== 'Scene') {
      node.group.parent.parent?.attach?.(node.group);
    }
    node.group.position.copy(target);
    node.group.lookAt(camPos.x, target.y, camPos.z);
  }
  return nodes.length;
}
