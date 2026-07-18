import * as THREE from 'three';

// Verbindungslinien zwischen Karten (Mindmap). Als dünne Zylinder gerendert,
// damit sie auch in VR gut sichtbar sind; Positionen folgen den Karten pro Frame.
export class ConnectionManager {
  constructor(scene, cardManager) {
    this.scene = scene;
    this.cardManager = cardManager;
    this.connections = []; // { a: cardId, b: cardId, mesh }
    this.material = new THREE.MeshBasicMaterial({ color: 0x8fa6bd });
    this.geometry = new THREE.CylinderGeometry(0.004, 0.004, 1, 6, 1, true);
    this._va = new THREE.Vector3();
    this._vb = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }

  _cardById(id) {
    return this.cardManager.cards.find((c) => c.id === id);
  }

  _indexOf(cardA, cardB) {
    return this.connections.findIndex(
      (c) => (c.a === cardA.id && c.b === cardB.id) || (c.a === cardB.id && c.b === cardA.id)
    );
  }

  // Legt eine Verbindung an bzw. entfernt eine bestehende (Toggle).
  toggle(cardA, cardB) {
    if (!cardA || !cardB || cardA === cardB) return null;
    const existing = this._indexOf(cardA, cardB);
    if (existing >= 0) {
      this.connections[existing].mesh.removeFromParent();
      this.connections.splice(existing, 1);
      return 'removed';
    }
    const mesh = new THREE.Mesh(this.geometry, this.material);
    this.scene.add(mesh);
    this.connections.push({ a: cardA.id, b: cardB.id, mesh });
    return 'added';
  }

  removeForCard(card) {
    this.connections = this.connections.filter((conn) => {
      if (conn.a !== card.id && conn.b !== card.id) return true;
      conn.mesh.removeFromParent();
      return false;
    });
  }

  clear() {
    for (const conn of this.connections) conn.mesh.removeFromParent();
    this.connections = [];
  }

  update() {
    for (const conn of this.connections) {
      const a = this._cardById(conn.a);
      const b = this._cardById(conn.b);
      if (!a || !b) continue;
      a.group.getWorldPosition(this._va);
      b.group.getWorldPosition(this._vb);
      conn.mesh.position.copy(this._va).add(this._vb).multiplyScalar(0.5);
      this._dir.copy(this._vb).sub(this._va);
      const length = this._dir.length();
      conn.mesh.scale.set(1, Math.max(length, 0.001), 1);
      conn.mesh.quaternion.setFromUnitVectors(this._up, this._dir.normalize());
    }
  }

  toJSON() {
    return this.connections.map(({ a, b }) => ({ a, b }));
  }

  loadJSON(list) {
    this.clear();
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      const a = this._cardById(entry?.a);
      const b = this._cardById(entry?.b);
      if (a && b) this.toggle(a, b);
    }
  }
}
