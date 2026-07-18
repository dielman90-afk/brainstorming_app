import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

const CARD_W = 0.32;
const CARD_H = 0.18;
const CARD_BG = '#1e2733';
const CARD_BG_HOVER = '#2b3b4e';

export class IdeaCard {
  constructor(text) {
    this.id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    this.text = text;
    this.hovered = false;

    this.panel = createTextPanel({ width: CARD_W, height: CARD_H, text });

    this.border = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W + 0.02, CARD_H + 0.02),
      new THREE.MeshBasicMaterial({ color: 0x4dd0e1, transparent: true, opacity: 0.9 })
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

  setSelected(selected) {
    this.border.visible = selected;
  }

  setHovered(hovered) {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.panel.setColors({ background: hovered ? CARD_BG_HOVER : CARD_BG });
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
  }

  addCard(text, { position, quaternion } = {}) {
    const card = new IdeaCard(text);
    if (position) card.group.position.fromArray(position);
    if (quaternion) card.group.quaternion.fromArray(quaternion);
    this.scene.add(card.group);
    this.cards.push(card);
    return card;
  }

  removeCard(card) {
    if (this.selected === card) this.select(null);
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

  // Neue Karten im Halbkreis vor dem Nutzer platzieren.
  // Aufeinanderfolgende Batches werden vertikal gestaffelt, damit sie nicht überlappen.
  arrangeInArc(cards, camera, batch = 0) {
    if (!cards.length) return;
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();

    const baseAngle = Math.atan2(dir.x, dir.z);
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

  toJSON() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      // Welt-Koordinaten, damit auch gerade gegriffene Karten (Parent =
      // Controller) korrekt exportiert werden
      cards: this.cards.map((card) => ({
        id: card.id,
        text: card.text,
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
      this.addCard(entry.text, { position: entry.position, quaternion: entry.quaternion });
    }
  }
}
