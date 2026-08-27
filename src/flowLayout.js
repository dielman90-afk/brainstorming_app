import * as THREE from 'three';
import { inHeimat } from './heimat.js';

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
const SIBLING_GAP = 0.42; // Wunschabstand zwischen Geschwistern desselben Rangs
const MIN_SIBLING_GAP = 0.22; // enger wird nicht gestaucht – sonst überlappen sie
const MIN_DISTANCE = 2.0; // Mindestabstand der Tafel vom Nutzer
const EYE_Y = 1.5; // Höhe der Mittelachse des Diagramms
const LOW_Y = 0.6; // bis hierhin soll eine Spalte möglichst passen

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
export function computeLayout(nodes, edges, { origin, right, forward, boden = 0 }) {
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

    // Bei vielen Geschwistern den Abstand **stauchen**, nicht die Position
    // klemmen. Ein `Math.max(..., MIN_Y)` je Knoten hätte alle betroffenen auf
    // exakt dieselbe Höhe gesetzt – sie lägen aufeinander statt untereinander.
    // Der Fußpunkt gibt vor, wie viel Platz die Spalte hat; unter
    // MIN_SIBLING_GAP wird nicht weiter gestaucht, dann wächst die Spalte eben
    // nach unten hinaus.
    const steps = Math.max(column.length - 1, 1);
    const gap = Math.max(Math.min(SIBLING_GAP, (2 * (EYE_Y - LOW_Y)) / steps), MIN_SIBLING_GAP);
    const top = ((column.length - 1) * gap) / 2;

    column.forEach((node, i) => {
      const position = origin
        .clone()
        .addScaledVector(forward, distance)
        .addScaledVector(right, x);
      // **`EYE_Y` ist eine Höhe über dem Boden, keine Welthöhe.** Solange der
      // Boden bei null lag, war das dasselbe; auf der Kugel steht der Nutzer
      // bei y ≈ 26,9, und ein Diagramm auf y = 1,5 läge dreiundzwanzig Meter
      // unter seinen Füßen.
      position.y = boden + EYE_Y + top - i * gap;
      placed.set(node.id, position);
    });
  });
  return placed;
}

// Prozessknoten des Boards auf die Tafel legen und zum Nutzer drehen.
//
// `scene` wird gebraucht, um gegriffene Knoten zurückzuhängen – siehe unten.
export function layoutFlow(cards, connections, camera, scene = null, { heimat = null, boden = 0 } = {}) {
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

  const placed = computeLayout(nodes, edges, { origin: camPos, right, forward, boden });
  // Wohin die Knoten gehängt werden. Auf dem Planeten ist das die Weltgruppe,
  // sonst die Szene — dieselbe Unterscheidung wie in `CardManager`.
  const ziel = heimat ?? scene;
  for (const node of nodes) {
    const target = placed.get(node.id);
    if (!target) continue;
    // Gerade gegriffene Knoten hängen am Controller – zurück in die Szene,
    // sonst wäre die gesetzte Weltposition relativ zur Hand.
    //
    // Ausdrücklich an die Szene, nicht an `parent.parent`: Der Elternteil eines
    // Controllers ist das Player-Rig, nicht die Szene. Der Knoten wäre dann
    // dort hängengeblieben und bei jeder Fortbewegung mitgefahren. Dasselbe
    // Muster wie in `CardManager.applyState`.
    // **An die Heimat, nicht an die Szene.** Auf dem Planeten hängen Karten an
    // der Weltgruppe; wer sie hier in die Szene umhängt, löst sie vom Planeten,
    // und beim nächsten Schritt läuft die Welt unter ihnen weg.
    if (ziel && node.group.parent !== ziel) ziel.attach(node.group);
    // **`target` steht in Weltkoordinaten** — `computeLayout` baut es aus
    // `camPos` auf. `group.position` ist aber die Lage **im Elter**, und der ist
    // auf dem Planeten die Weltgruppe mit der Drehung des Rundgangs. Hier stand
    // ein blankes `copy(target)`: Dieselbe Verwechslung wie beim Mausziehen,
    // und sie warf das ganze Flussdiagramm quer über den Planeten, sobald man
    // ein paar Schritte gegangen war.
    //
    // Die Höhe wird vorher gesichert, weil `inHeimat` den Vektor an Ort und
    // Stelle umrechnet und `lookAt` ein **Weltziel** braucht.
    const weltY = target.y;
    node.group.position.copy(inHeimat(ziel ?? scene, scene, target));
    node.group.lookAt(camPos.x, weltY, camPos.z);
  }
  return nodes.length;
}
