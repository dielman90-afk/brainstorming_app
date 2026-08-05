import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

// Verbindungen zwischen Karten. Zwei Arten teilen sich denselben Manager:
//
//   ungerichtet (`directed: false`) – die gewohnte Mindmap-Linie, eine dünne
//     Strebe ohne Anfang und Ende.
//   gerichtet (`directed: true`)    – der Pfeil eines Prozessflussdiagramms,
//     mit Spitze am Ziel und optionaler Zweigbeschriftung („ja"/„nein").
//
// Beides in einem Manager, weil das Mühsame identisch ist: Positionen pro Frame
// nachführen, serialisieren, beim Löschen einer Karte aufräumen. Ein zweiter
// Manager müsste das alles kopieren.

const SHAFT_R = 0.004; // Radius der Linie
const HEAD_LEN = 0.05; // Länge der Pfeilspitze
const HEAD_R = 0.016; // Radius der Pfeilspitze
const GAP = 0.012; // Luft zwischen Knotenrand und Pfeilspitze

const LINE_COLOR = 0x8fa6bd;
const FLOW_COLOR = 0xffb454; // Amber wie der Rest der Oberfläche

export class ConnectionManager {
  constructor(scene, cardManager) {
    this.scene = scene;
    this.cardManager = cardManager;
    // { a, b, directed, label, mesh, head?, labelPanel? }
    this.connections = [];
    this.material = new THREE.MeshBasicMaterial({ color: LINE_COLOR });
    this.flowMaterial = new THREE.MeshBasicMaterial({ color: FLOW_COLOR });
    this.geometry = new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, 1, 6, 1, true);
    // Kegel zeigt in +Y, genau wie der Zylinder – dieselbe Ausrichtungsrechnung
    // gilt damit für Schaft und Spitze.
    this.headGeometry = new THREE.ConeGeometry(HEAD_R, HEAD_LEN, 10);
    this._va = new THREE.Vector3();
    this._vb = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._mid = new THREE.Vector3();
    this._neg = new THREE.Vector3();
    this._local = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  _cardById(id) {
    return this.cardManager.cards.find((c) => c.id === id);
  }

  // Ungerichtete Kanten kennen keine Reihenfolge; bei gerichteten sind a→b und
  // b→a zwei verschiedene Kanten (Rückweg einer Schleife).
  _indexOf(cardA, cardB, directed) {
    return this.connections.findIndex((c) =>
      directed
        ? c.directed && c.a === cardA.id && c.b === cardB.id
        : !c.directed &&
          ((c.a === cardA.id && c.b === cardB.id) || (c.a === cardB.id && c.b === cardA.id))
    );
  }

  _create(cardA, cardB, { directed, label }) {
    const material = directed ? this.flowMaterial : this.material;
    const mesh = new THREE.Mesh(this.geometry, material);
    this.scene.add(mesh);
    const conn = { a: cardA.id, b: cardB.id, directed, label: label ?? '', mesh, head: null, labelPanel: null };
    if (directed) {
      conn.head = new THREE.Mesh(this.headGeometry, material);
      this.scene.add(conn.head);
    }
    this.connections.push(conn);
    if (conn.label) this._setLabel(conn, conn.label);
    return conn;
  }

  _dispose(conn) {
    conn.mesh.removeFromParent();
    conn.head?.removeFromParent();
    if (conn.labelPanel) {
      conn.labelPanel.mesh.removeFromParent();
      conn.labelPanel.dispose();
    }
  }

  // Ungerichtete Mindmap-Verbindung anlegen bzw. entfernen (Toggle).
  toggle(cardA, cardB) {
    if (!cardA || !cardB || cardA === cardB) return null;
    const existing = this._indexOf(cardA, cardB, false);
    if (existing >= 0) {
      this._dispose(this.connections[existing]);
      this.connections.splice(existing, 1);
      return 'removed';
    }
    this._create(cardA, cardB, { directed: false });
    return 'added';
  }

  // Gerichteter Pfeil für Flussdiagramme. Ein zweites Mal in dieselbe Richtung
  // entfernt ihn wieder – wie beim Toggle.
  connect(cardA, cardB, { label = '' } = {}) {
    if (!cardA || !cardB || cardA === cardB) return null;
    const existing = this._indexOf(cardA, cardB, true);
    if (existing >= 0) {
      this._dispose(this.connections[existing]);
      this.connections.splice(existing, 1);
      return 'removed';
    }
    this._create(cardA, cardB, { directed: true, label });
    return 'added';
  }

  // Zuletzt angelegte gerichtete Kante zwischen zwei Karten (für „beschriften").
  findDirected(cardA, cardB) {
    const i = this._indexOf(cardA, cardB, true);
    return i >= 0 ? this.connections[i] : null;
  }

  // Alle gerichteten Kanten, die an einer Karte hängen.
  edgesFrom(card) {
    return this.connections.filter((c) => c.directed && c.a === card.id);
  }

  setLabel(conn, text) {
    if (!conn) return;
    this._setLabel(conn, text);
  }

  _setLabel(conn, text) {
    const label = String(text ?? '').trim();
    conn.label = label;
    if (!label) {
      if (conn.labelPanel) {
        conn.labelPanel.mesh.removeFromParent();
        conn.labelPanel.dispose();
        conn.labelPanel = null;
      }
      return;
    }
    if (conn.labelPanel) {
      conn.labelPanel.setText(label);
      return;
    }
    conn.labelPanel = createTextPanel({
      width: 0.09,
      height: 0.045,
      text: label,
      background: '#1d1b22',
      color: '#f0eef2',
      border: 'rgba(255, 180, 84, 0.5)',
      fontSize: 26,
      radius: 14,
      padding: 12,
      singleLine: true,
      doubleSided: false,
    });
    conn.labelPanel.mesh.renderOrder = 12;
    conn.labelPanel.mesh.material.depthTest = false;
    this.scene.add(conn.labelPanel.mesh);
  }

  removeForCard(card) {
    this.connections = this.connections.filter((conn) => {
      if (conn.a !== card.id && conn.b !== card.id) return true;
      this._dispose(conn);
      return false;
    });
  }

  clear() {
    for (const conn of this.connections) this._dispose(conn);
    this.connections = [];
  }

  // Abstand vom Kartenmittelpunkt bis zu ihrem Rand in Richtung `dirWorld`.
  //
  // Ohne das liefe der Pfeil bis in die Mitte des Zielknotens und seine Spitze
  // läge hinter der Karte – man sähe eine Linie, die im Knoten verschwindet,
  // statt eines Pfeils, der auf ihn zeigt.
  _edgeDistance(card, dirWorld) {
    const half = { w: ((card.width ?? 0.32) / 2) * card.scale, h: ((card.height ?? 0.18) / 2) * card.scale };
    card.group.getWorldQuaternion(this._quat).invert();
    const d = this._local.copy(dirWorld).applyQuaternion(this._quat);
    const ax = Math.abs(d.x);
    const ay = Math.abs(d.y);
    if (card.shape === 'diamond') {
      // Rand der Raute: |x|/hw + |y|/hh = 1
      const denom = ax / half.w + ay / half.h;
      return denom > 1e-6 ? 1 / denom : half.w;
    }
    // Rechteck/Stadion: die näher liegende der beiden Kanten begrenzt
    const tx = ax > 1e-6 ? half.w / ax : Infinity;
    const ty = ay > 1e-6 ? half.h / ay : Infinity;
    const t = Math.min(tx, ty);
    return Number.isFinite(t) ? t : half.w;
  }

  update(camera = null) {
    for (const conn of this.connections) {
      const a = this._cardById(conn.a);
      const b = this._cardById(conn.b);
      if (!a || !b) continue;
      a.group.getWorldPosition(this._va);
      b.group.getWorldPosition(this._vb);
      this._dir.copy(this._vb).sub(this._va);
      const span = this._dir.length();
      if (span < 1e-6) continue;
      this._dir.divideScalar(span);

      if (!conn.directed) {
        // Mindmap: unverändert von Mitte zu Mitte
        conn.mesh.position.copy(this._va).addScaledVector(this._dir, span / 2);
        conn.mesh.scale.set(1, span, 1);
        conn.mesh.quaternion.setFromUnitVectors(this._up, this._dir);
        continue;
      }

      // Pfeil: am Rand des Quellknotens beginnen, kurz vor dem Zielknoten enden
      const from = this._edgeDistance(a, this._dir);
      const to = this._edgeDistance(b, this._neg.copy(this._dir).negate());
      const startAt = Math.min(from, span * 0.45);
      const endAt = Math.max(span - to - GAP, startAt + 0.01);
      const shaftLen = Math.max(endAt - startAt - HEAD_LEN, 0.001);

      conn.mesh.quaternion.setFromUnitVectors(this._up, this._dir);
      conn.mesh.position.copy(this._va).addScaledVector(this._dir, startAt + shaftLen / 2);
      conn.mesh.scale.set(1, shaftLen, 1);

      conn.head.quaternion.copy(conn.mesh.quaternion);
      conn.head.position.copy(this._va).addScaledVector(this._dir, endAt - HEAD_LEN / 2);

      if (conn.labelPanel) {
        this._mid.copy(this._va).addScaledVector(this._dir, startAt + (endAt - startAt) / 2);
        conn.labelPanel.mesh.position.copy(this._mid);
        // Beschriftung immer zum Betrachter drehen – ein Pfeil kann in jede
        // Richtung laufen, ein mitgedrehtes Schild wäre oft von der Seite zu
        // sehen.
        if (camera) conn.labelPanel.mesh.quaternion.copy(camera.quaternion);
      }
    }
  }

  toJSON() {
    return this.connections.map(({ a, b, directed, label }) => ({
      a,
      b,
      // Ungerichtete Kanten bleiben im alten Format `{ a, b }`, damit früher
      // gespeicherte Boards Zeichen für Zeichen gleich aussehen.
      ...(directed ? { directed: true } : {}),
      ...(label ? { label } : {}),
    }));
  }

  loadJSON(list) {
    this.clear();
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const a = this._cardById(entry?.a);
      const b = this._cardById(entry?.b);
      if (!a || !b) continue;
      if (entry.directed) this.connect(a, b, { label: entry.label });
      else this.toggle(a, b);
    }
  }
}
