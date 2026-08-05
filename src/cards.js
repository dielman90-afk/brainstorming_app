import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

const CARD_W = 0.32;
const CARD_H = 0.18;

// Farbpalette (Claude-Design „Soft Spatial Minimal"): einheitliche
// Anthrazit-Glas-Basis, unterschieden nur über den hellen Akzentstreifen.
// Index 0 = Standard (Amber); Cluster nutzen Farben ab Index 1.
export const CARD_COLORS = [
  { base: '#28262e', hover: '#332f3a', accent: '#ffb454' }, // Amber (Standard)
  { base: '#26262e', hover: '#31313a', accent: '#7dd3fc' }, // Blau
  { base: '#26272c', hover: '#313339', accent: '#86efac' }, // Grün
  { base: '#2a272e', hover: '#35313a', accent: '#c4b5fd' }, // Violett
  { base: '#2b2529', hover: '#372f34', accent: '#fca5a5' }, // Rot
  { base: '#2a262e', hover: '#35313b', accent: '#f0abfc' }, // Pink
  { base: '#27262a', hover: '#323036', accent: '#e5e1e6' }, // Neutral
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

// Umschaltbare Kartenschrift (Barrierefreiheit): rein die Textgröße, die
// Kartenfläche bleibt gleich. Sehr lange Texte werden bei den großen Stufen
// entsprechend früher mit „…" abgeschnitten – wer beides will, zieht die Karte
// zusätzlich per Mausrad/Stick größer.
const CARD_FONT_SIZE = 36;
export const CARD_FONT_STEPS = [
  { id: 'normal', label: 'Normal', scale: 1 },
  { id: 'gross', label: 'Groß', scale: 1.22 },
  { id: 'sehr-gross', label: 'Sehr groß', scale: 1.5 },
];

// Knotenarten für Prozessflussdiagramme.
//
// `flowType === null` ist die gewohnte Ideenkarte – daran ändert sich nichts.
// Die Form sagt, um welche Art Schritt es geht; das ist die Konvention jedes
// Flussdiagramms und der Grund, warum eine Verzweigung auf einen Blick als
// solche zu erkennen ist.
export const FLOW_TYPES = [
  { id: 'start', label: 'Start', shape: 'stadium', colorIndex: 2, width: 0.30, height: 0.15, radius: 28 },
  { id: 'task', label: 'Tätigkeit', shape: 'rect', colorIndex: 0, width: 0.34, height: 0.18, radius: 20 },
  { id: 'decision', label: 'Entscheidung', shape: 'diamond', colorIndex: 1, width: 0.42, height: 0.28, radius: 24 },
  { id: 'end', label: 'Ende', shape: 'stadium', colorIndex: 4, width: 0.30, height: 0.15, radius: 28 },
];

export function flowTypeById(id) {
  return FLOW_TYPES.find((t) => t.id === id) ?? null;
}

const IDEA_LOOK = { shape: 'rect', width: CARD_W, height: CARD_H, radius: 28 };

export class IdeaCard {
  constructor(text, { fontScale = 1, flowType = null } = {}) {
    this.id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
    this.text = text;
    this.hovered = false;
    this.colorIndex = 0;
    this.scale = 1;
    this.fontScale = fontScale;
    this.flowType = flowType;

    this.group = new THREE.Group();
    this.group.userData.card = this;
    this._build();
  }

  // Panel und Auswahlrahmen (neu) aufbauen. Wird auch beim Wechsel der
  // Knotenart gerufen – Form und Maße hängen daran, eine Textur lässt sich
  // nachträglich nicht umformen.
  _build() {
    const look = flowTypeById(this.flowType) ?? IDEA_LOOK;
    if (this.flowType) this.colorIndex = look.colorIndex;
    const color = CARD_COLORS[this.colorIndex];

    // Maße und Umriss nach außen sichtbar: connections.js setzt Pfeile damit am
    // Knotenrand an statt in seiner Mitte.
    this.width = look.width;
    this.height = look.height;
    this.shape = look.shape;

    this.panel?.dispose();
    this.border?.geometry.dispose();
    this.border?.material.dispose();
    this.group.clear();

    this.panel = createTextPanel({
      width: look.width,
      height: look.height,
      text: this.text,
      shape: look.shape,
      background: [shade(color.base, 1.25), shade(color.base, 0.8)],
      accent: color.accent,
      border: 'rgba(255,255,255,0.10)',
      radius: look.radius,
      fontSize: Math.round(CARD_FONT_SIZE * this.fontScale),
    });

    this.border = new THREE.Mesh(
      new THREE.PlaneGeometry(look.width + 0.02, look.height + 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    this.border.position.z = -0.002;
    this.border.visible = false;

    this.group.add(this.border, this.panel.mesh);
  }

  // Knotenart setzen (null = zurück zur normalen Ideenkarte).
  setFlowType(id) {
    const next = id && flowTypeById(id) ? id : null;
    if (next === this.flowType) return;
    const wasSelected = this.border?.visible ?? false;
    this.flowType = next;
    if (!next) this.colorIndex = 0;
    this._build();
    this.border.visible = wasSelected;
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

  setFontScale(fontScale) {
    this.fontScale = fontScale;
    this.panel.setFontSize(CARD_FONT_SIZE * fontScale);
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
    // Meldet Auswahlwechsel nach außen – die Desktop-Oberfläche zeigt daran,
    // welche Form die gewählte Karte gerade hat.
    this.onSelect = null;
    this.fontStepIndex = 0;
  }

  get fontStep() {
    return CARD_FONT_STEPS[this.fontStepIndex];
  }

  // Schriftstufe setzen; gilt für vorhandene und künftige Karten.
  setFontStep(index) {
    this.fontStepIndex = THREE.MathUtils.euclideanModulo(index, CARD_FONT_STEPS.length);
    const { scale } = this.fontStep;
    for (const card of this.cards) card.setFontScale(scale);
    return this.fontStep;
  }

  cycleFontStep() {
    return this.setFontStep(this.fontStepIndex + 1);
  }

  addCard(text, { position, quaternion, colorIndex, scale, flowType = null } = {}) {
    const card = new IdeaCard(text, { fontScale: this.fontStep.scale, flowType });
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
    this.onSelect?.(this.selected);
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
        // Nur bei Prozessknoten gesetzt – Ideenkarten bleiben im alten Format,
        // damit gespeicherte Boards von früher unverändert lesbar sind.
        ...(card.flowType ? { flowType: card.flowType } : {}),
        position: card.group.getWorldPosition(new THREE.Vector3()).toArray(),
        quaternion: card.group.getWorldQuaternion(new THREE.Quaternion()).toArray(),
      })),
    };
  }

  loadJSON(data) {
    if (!data || !Array.isArray(data.cards)) {
      throw new Error('Ungültiges Board-Format.');
    }
    this.applyState(data.cards);
  }

  // Board auf eine Kartenliste (Format wie in toJSON().cards) bringen.
  //
  // Bewusst kein „alles löschen und neu aufbauen": Karten mit bekannter ID
  // werden an Ort und Stelle aktualisiert. Dadurch bleiben Objekt-Identität und
  // Auswahl erhalten und es entsteht kein Flackern – wichtig, weil Undo/Redo
  // diesen Weg für jeden Schritt nutzt.
  applyState(entries) {
    if (!Array.isArray(entries)) throw new Error('Ungültiges Board-Format.');
    const byId = new Map(this.cards.map((card) => [card.id, card]));
    const ordered = [];
    const keep = new Set();

    for (const entry of entries) {
      if (typeof entry?.text !== 'string') continue;
      const colorIndex = entry.colorIndex ?? 0;
      const scale = entry.scale ?? 1;
      const flowType = flowTypeById(entry.flowType) ? entry.flowType : null;
      let card = typeof entry.id === 'string' ? byId.get(entry.id) : undefined;

      if (card) {
        // Zuerst die Knotenart: sie baut das Panel neu auf und setzt dabei die
        // Farbe der Knotenart – ein davor gesetzter Farbwechsel wäre verloren.
        if (card.flowType !== flowType) card.setFlowType(flowType);
        if (card.text !== entry.text) card.setText(entry.text);
        if (card.colorIndex !== colorIndex) card.setColor(colorIndex);
        if (card.scale !== scale) card.setScale(scale);
        // Gerade gegriffene Karten hängen am Controller – zurück in die Szene,
        // sonst wären die gespeicherten Weltkoordinaten relativ zur Hand.
        if (card.group.parent !== this.scene) this.scene.attach(card.group);
        if (entry.position) card.group.position.fromArray(entry.position);
        if (entry.quaternion) card.group.quaternion.fromArray(entry.quaternion);
      } else {
        card = this.addCard(entry.text, {
          position: entry.position,
          quaternion: entry.quaternion,
          colorIndex,
          scale,
          flowType,
        });
        // IDs erhalten, damit gespeicherte Verbindungen weiter passen
        if (typeof entry.id === 'string' && entry.id) card.id = entry.id;
      }
      keep.add(card);
      ordered.push(card);
    }

    for (const card of [...this.cards]) {
      if (!keep.has(card)) this.removeCard(card);
    }
    this.cards = ordered;
    this.spawnBatch = Math.ceil(ordered.length / 6);
  }
}
