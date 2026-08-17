// Sanftes Umsetzen von Objekten.
//
// In VR ist ein schlagartiger Umbau des Boards unangenehm: Zwanzig Karten
// springen gleichzeitig, und man weiß hinterher nicht, welche wohin gewandert
// ist. Über eine knappe halbe Sekunde animiert bleibt die Zuordnung erhalten –
// man sieht, dass *diese* Karte nach dort drüben gezogen ist.
//
// Bewusst winzig gehalten: eine Liste laufender Bewegungen, pro Frame ein
// Schritt. Keine Bibliothek für das, was in dreißig Zeilen passt.

const DEFAULT_DURATION = 0.45;

// Weiche Ein-/Ausblendung (smoothstep). Lineares Fahren wirkt mechanisch.
function ease(t) {
  return t * t * (3 - 2 * t);
}

export class Tweener {
  constructor() {
    this.moves = [];
  }

  get active() {
    return this.moves.length > 0;
  }

  // Ziel setzen. Ein bereits laufender Zug auf dasselbe Objekt wird ersetzt,
  // damit zwei Aufrufe kurz hintereinander nicht gegeneinander arbeiten.
  moveTo(object, position, quaternion = null, duration = DEFAULT_DURATION) {
    if (!object) return;
    this.cancel(object);
    // Sehr kurze Wege sofort setzen – eine 2-cm-Animation sieht nur nach
    // Wackeln aus.
    if (object.position.distanceTo(position) < 0.02 && !quaternion) {
      object.position.copy(position);
      return;
    }
    this.moves.push({
      object,
      fromPos: object.position.clone(),
      toPos: position.clone(),
      fromQuat: quaternion ? object.quaternion.clone() : null,
      toQuat: quaternion ? quaternion.clone() : null,
      duration: Math.max(duration, 0.01),
      t: 0,
    });
  }

  cancel(object) {
    this.moves = this.moves.filter((m) => m.object !== object);
  }

  clear() {
    this.moves.length = 0;
  }

  update(dt) {
    if (!this.moves.length) return;
    for (const move of this.moves) {
      move.t = Math.min(1, move.t + dt / move.duration);
      const k = ease(move.t);
      move.object.position.lerpVectors(move.fromPos, move.toPos, k);
      if (move.toQuat) move.object.quaternion.slerpQuaternions(move.fromQuat, move.toQuat, k);
    }
    this.moves = this.moves.filter((m) => m.t < 1);
  }

  // Alles sofort ans Ziel setzen – für Tests und für den Fall, dass gespeichert
  // wird, während noch etwas fährt.
  finish() {
    for (const move of this.moves) {
      move.object.position.copy(move.toPos);
      if (move.toQuat) move.object.quaternion.copy(move.toQuat);
    }
    this.moves.length = 0;
  }
}
