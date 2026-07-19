import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

const CARD_W = 0.32;
const CARD_H = 0.18;

// Farbpalette für Karten/Kategorien; Index 0 = Standard.
// Cluster bekommen automatisch Farben ab Index 1. "accent" ist der helle
// Farbstreifen am linken Kartenrand.
export const CARD_COLORS = [
  { base: '#1e2733', hover: '#2b3b4e', accent: '#8fa8c0' }, // Standard (dunkel)
  { base: '#1e3a5c', hover: '#2b4f7a', accent: '#4da3ff' }, // Blau
  { base: '#1d4d33', hover: '#2a6947', accent: '#4ad07a' }, // Grün
  { base: '#5c4a1e', hover: '#7a642b', accent: '#eec04a' }, // Ocker
  { base: '#5c2b2b', hover: '#7a3d3d', accent: '#ff7a7a' }, // Rot
  { base: '#462b5c', hover: '#5d3d7a', accent: '#bd8bff' }, // Violett
  { base: '#1e4d4d', hover: '#2b6969', accent: '#3fd9c8' }, // Türkis
];

// Farbe aufhellen/abdunkeln (für den dezenten Vertikal-Verlauf der Kartenfläche)
function shade(hex, factor) {
  const c = new THREE.Color(hex).multiplyScalar(factor);
  c.r = Math.min(1, c.r);
  c.g = Math.min(1, c.g);
  c.b = Math.min(1, c.b);
  return `#${c.getHexString()}`;
}

const MIN_SCALE = 0.45;
const MAX_SCALE = 2.2;

export class IdeaCard {
  constructor(text) {
    this.id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    this.text = text;
    this.hovered = false;
    this.colorIndex = 0;
    this.scale = 1;

    this.panel = createTextPanel({
      width: CARD_W,
      height: CARD_H,
      text,
      background: [shade(CARD_COLORS[0].base, 1.25), shade(CARD_COLORS[0].base, 0.8)],
      accent: CARD_COLORS[0].accent,
      border: 'rgba(255,255,255,0.10)',
      radius: 28,
    });

    this.border = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W + 0.02, CARD_H + 0.02),
      new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.border.position.z = -0.002;
    this.border.visible = false;

    this.group = new THREE.Group();
    this.group.add(this.border, this.panel.mesh);
    this.group.userData.card = this;
  }

  setText(text) {
    this.text = text;
    this.panel.setText(text);
  }

  setColor(index) {
    this.colorIndex = THREE.MathUtils.euclideanModulo(index, CARD_COLORS.length);
    this._applyBackground();
  }

  setSelected(selected) {
    this.border.visible = selected;
  }

  setHovered(hovered) {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this._applyBackground();
  }

  setScale(value) {
    this.scale = THREE.MathUtils.clamp(value, MIN_SCALE, MAX_SCALE);
    this.group.scale.setScalar(this.scale);
  }

  _applyBackground() {
    const color = CARD_COLORS[this.colorIndex];
    const base = this.hovered ? color.hover : color.base;
    this.panel.setColors({
      background: [shade(base, 1.25), shade(base, 0.8)],
      accent: color.accent,
    });
  }

  dispose() {
    this.panel.dispose();
    this.border.geometry.dispose();
    this.border.material.dispose();
  }
}

export class CardManager {
  constructor(scene) {
    this.scene = scene;
    this.cards = [];
    this.selected = null;
    this.spawnBatch = 0;
    this.onCardRemoved = null;
  }

  addCard(text, { position, quaternion, colorIndex, scale } = {}) {
    const card = new IdeaCard(text);
    if (position) card.group.position.fromArray(position);
    if (quaternion) card.group.quaternion.fromArray(quaternion);
    if (colorIndex) card.setColor(colorIndex);
    if (scale) card.setScale(scale);
    this.scene.add(card.group);
    this.cards.push(card);
    return card;
  }

  removeCard(card) {
    if (this.selected === card) this.select(null);
    this.onCardRemoved?.(card);
    card.group.removeFromParent();
    card.dispose();
    this.cards = this.cards.filter((c) => c !== card);
  }

  clear() {
    for (const card of [...this.cards]) this.removeCard(card);
  }

  select(card) {
    if (this.selected === card) return;
    this.selected?.setSelected(false);
    this.selected = card ?? null;
    this.selected?.setSelected(true);
  }

  _viewBasis(camera) {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    return { camPos, baseAngle: Math.atan2(dir.x, dir.z) };
  }

  // Neue Karten im Halbkreis vor dem Nutzer platzieren.
  // Aufeinanderfolgende Batches werden vertikal gestaffelt, damit sie nicht überlappen.
  arrangeInArc(cards, camera, batch = 0) {
    if (!cards.length) return;
    const { camPos, baseAngle } = this._viewBasis(camera);
    const step = THREE.MathUtils.degToRad(24);
    const radius = 1.15;
    const rowOffset = (((batch + 1) % 3) - 1) * 0.24;
    const y = THREE.MathUtils.clamp(camPos.y - 0.05 + rowOffset, 0.6, 2.1);

    cards.forEach((card, i) => {
      const angle = baseAngle + (i - (cards.length - 1) / 2) * step;
      card.group.position.set(
        camPos.x + Math.sin(angle) * radius,
        y,
        camPos.z + Math.cos(angle) * radius
      );
      card.group.lookAt(camPos.x, y, camPos.z);
    });
  }

  spawnIdeas(texts, camera) {
    const cards = texts.map((t) => this.addCard(t));
    this.arrangeInArc(cards, camera, this.spawnBatch++);
    return cards;
  }

  // Alle vorhandenen Karten neu vor dem Nutzer anordnen (z. B. beim VR-Start,
  // wenn sich die Kamera-Pose gegenüber der Desktop-Ansicht ändert).
  repositionAllInArc(camera) {
    const perRow = 6;
    for (let i = 0; i < this.cards.length; i += perRow) {
      const row = this.cards.slice(i, i + perRow);
      this.arrangeInArc(row, camera, Math.floor(i / perRow));
    }
    this.spawnBatch = Math.ceil(this.cards.length / perRow);
  }

  // Karten räumlich in Cluster-Spalten vor dem Nutzer gruppieren.
  // clusterDefs: [{ name, colorIndex, cards: IdeaCard[] }]
  applyClusters(clusterDefs, camera) {
    const { camPos, baseAngle } = this._viewBasis(camera);
    const n = clusterDefs.length;
    const step = THREE.MathUtils.degToRad(n <= 2 ? 50 : n === 3 ? 40 : 32);
    const radius = 1.5;
    const titleY = THREE.MathUtils.clamp(camPos.y + 0.3, 1.0, 2.2);

    clusterDefs.forEach((def, i) => {
      const angle = baseAngle + (i - (n - 1) / 2) * step;
      const cx = camPos.x + Math.sin(angle) * radius;
      const cz = camPos.z + Math.cos(angle) * radius;
      const tangent = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));

      const title = this.addCard(`📌 ${def.name}`, { colorIndex: def.colorIndex });
      title.group.position.set(cx, titleY, cz);
      title.group.lookAt(camPos.x, titleY, camPos.z);

      const cols = def.cards.length > 4 ? 2 : 1;
      def.cards.forEach((card, m) => {
        card.setColor(def.colorIndex);
        const row = Math.floor(m / cols);
        const tOff = cols === 1 ? 0 : (m % 2 === 0 ? -0.19 : 0.19);
        const y = titleY - 0.26 - row * 0.22;
        card.group.position.set(cx + tangent.x * tOff, y, cz + tangent.z * tOff);
        card.group.lookAt(camPos.x, y, camPos.z);
      });
    });
  }

  toJSON() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      // Welt-Koordinaten, damit auch gerade gegriffene Karten (Parent =
      // Controller) korrekt exportiert werden
      cards: this.cards.map((card) => ({
        id: card.id,
        text: card.text,
        colorIndex: card.colorIndex,
        scale: card.scale,
        position: card.group.getWorldPosition(new THREE.Vector3()).toArray(),
        quaternion: card.group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      })),
    };
  }

  loadJSON(data) {
    if (!data || !Array.isArray(data.cards)) {
      throw new Error('Ungültiges Board-Format.');
    }
    this.clear();
    for (const entry of data.cards) {
      if (typeof entry?.text !== 'string') continue;
      const card = this.addCard(entry.text, {
        position: entry.position,
        quaternion: entry.quaternion,
        colorIndex: entry.colorIndex,
        scale: entry.scale,
      });
      // IDs erhalten, damit gespeicherte Verbindungen weiter passen
      if (typeof entry.id === 'string' && entry.id) card.id = entry.id;
    }
  }
}
