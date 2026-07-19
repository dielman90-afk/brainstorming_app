import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';
import { makeRoundedPanel } from './wristMenu.js';

// Zeichenbares Whiteboard im Raum: Stift/Marker/Radierer, Farben, Strichstärken,
// Formen (Linie/Rechteck/Kreis mit Live-Vorschau), Wischen, Skalieren und
// KI-Skizzenanalyse ("Zu Karten"). Griffleiste oben zum Verschieben.

const BOARD_W = 1.6;
const BOARD_H = 1.0;
const CANVAS_W = 2048;
const CANVAS_H = 1280;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.5;

export const PEN_COLORS = ['#111827', '#e03131', '#1971c2', '#2f9e44', '#f76707', '#9c36b5'];
const SIZES = [
  { label: 'S', width: 4 },
  { label: 'M', width: 9 },
  { label: 'L', width: 18 },
];

const BTN_BG = '#2c2933';
const BTN_BG_HOVER = '#3b3644';
const BTN_BG_ACTIVE = '#5c4420';

export class Whiteboard {
  constructor(scene, { onSketch } = {}) {
    this.scene = scene;
    this.onSketch = onSketch;
    this.group = new THREE.Group();
    this.group.name = 'whiteboard';
    this.group.visible = false;
    this.scale = 1;
    this.tool = 'pen';
    this.colorIndex = 0;
    this.sizeIndex = 1;
    this.hasContent = false;
    this.buttons = [];
    this._toggleButtons = new Map(); // key -> panel (für Aktiv-Hervorhebung)
    this._stroke = null;

    // Zeichenfläche (Canvas-Textur, opak weiß)
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 8;
    this.texture.colorSpace = THREE.SRGBColorSpace;

    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshBasicMaterial({ map: this.texture })
    );
    this.surface.userData.drawSurface = this;
    this.group.add(this.surface);

    // Rahmen + Rückwand (Board wirkt von beiden Seiten solide)
    const frame = makeRoundedPanel(BOARD_W + 0.08, BOARD_H + 0.3, {
      fill: 'rgba(20, 18, 24, 0.98)',
      border: 'rgba(255, 180, 84, 0.4)',
    });
    frame.material.alphaTest = 0.01;
    frame.position.z = -0.004;
    this.group.add(frame);

    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W + 0.08, BOARD_H + 0.3),
      new THREE.MeshBasicMaterial({ color: 0x18161c })
    );
    back.rotation.y = Math.PI;
    back.position.z = -0.006;
    this.group.add(back);

    // Griffleiste oben: greifen = verschieben, Stick beim Halten = Größe
    const handle = createTextPanel({
      width: BOARD_W - 0.2,
      height: 0.06,
      text: '⠿  Whiteboard – greifen zum Verschieben',
      background: '#1f1d25',
      color: '#b6afbd',
      fontSize: 26,
      singleLine: true,
      doubleSided: false,
      radius: 18,
    });
    handle.mesh.material.alphaTest = 0.01;
    handle.mesh.position.set(0, BOARD_H / 2 + 0.055, 0.002);
    handle.mesh.userData.grabTarget = {
      group: this.group,
      getScale: () => this.scale,
      setScale: (v) => this.setScale(v),
    };
    handle.mesh.userData.setHover = (h) =>
      handle.setColors({ background: h ? '#2c2833' : '#1f1d25' });
    this.handle = handle.mesh;
    this.group.add(handle.mesh);

    this._buildToolbar();
    scene.add(this.group);
  }

  // --- Werkzeugleiste ---

  _addButton({ key, label, width = 0.08, background = BTN_BG, color = '#eef3f8', onClick }) {
    const panel = createTextPanel({
      width,
      height: 0.07,
      text: label,
      background,
      color,
      fontSize: 34,
      weight: 600,
      singleLine: true,
      padding: 10,
      radius: 16,
      doubleSided: false,
    });
    panel.mesh.material.alphaTest = 0.01;
    panel.mesh.userData.onClick = onClick;
    panel.mesh.userData.setHover = (h) => {
      if (key && this._isActive(key)) return; // aktive Buttons behalten Hervorhebung
      panel.setColors({ background: h ? BTN_BG_HOVER : background });
    };
    if (key) this._toggleButtons.set(key, { panel, background });
    this.buttons.push(panel.mesh);
    this.group.add(panel.mesh);
    return panel.mesh;
  }

  _isActive(key) {
    if (key.startsWith('tool:')) return this.tool === key.slice(5);
    if (key.startsWith('color:')) return this.colorIndex === Number(key.slice(6));
    if (key.startsWith('size:')) return this.sizeIndex === Number(key.slice(5));
    return false;
  }

  _refreshToolbar() {
    for (const [key, { panel, background }] of this._toggleButtons) {
      if (key.startsWith('color:')) {
        panel.setColors({ border: this._isActive(key) ? '#ffffff' : 'rgba(255,255,255,0.15)' });
      } else {
        panel.setColors({ background: this._isActive(key) ? BTN_BG_ACTIVE : background });
      }
    }
  }

  _buildToolbar() {
    const y = -BOARD_H / 2 - 0.06;
    const GAP = 0.008;
    // Gesamtbreite der Leiste ≈ 1.43 m → zentriert unter dem Board
    let x = -0.715;
    const place = (mesh, width) => {
      mesh.position.set(x + width / 2, y, 0.002);
      x += width + GAP;
    };
    const sep = () => {
      x += 0.014;
    };

    for (const [tool, label] of [
      ['pen', '✏️'],
      ['marker', '🖊️'],
      ['eraser', '🧻'],
    ]) {
      place(this._addButton({ key: `tool:${tool}`, label, onClick: () => this.setTool(tool) }), 0.08);
    }
    sep();
    PEN_COLORS.forEach((color, i) => {
      place(
        this._addButton({
          key: `color:${i}`,
          label: '',
          width: 0.05,
          background: color,
          onClick: () => this.setColor(i),
        }),
        0.05
      );
    });
    sep();
    SIZES.forEach((size, i) => {
      place(
        this._addButton({ key: `size:${i}`, label: size.label, width: 0.05, onClick: () => this.setSize(i) }),
        0.05
      );
    });
    sep();
    for (const [tool, label] of [
      ['line', '╱'],
      ['rect', '▭'],
      ['circle', '◯'],
    ]) {
      place(this._addButton({ key: `tool:${tool}`, label, onClick: () => this.setTool(tool) }), 0.08);
    }
    sep();
    place(this._addButton({ label: '🧽', onClick: () => this.clearBoard() }), 0.08);
    place(this._addButton({ label: '➖', onClick: () => this.setScale(this.scale / 1.15) }), 0.07);
    place(this._addButton({ label: '➕', onClick: () => this.setScale(this.scale * 1.15) }), 0.07);
    place(
      this._addButton({ label: '🪄', background: '#ffb454', color: '#231b10', onClick: () => this.onSketch?.() }),
      0.08
    );

    this._refreshToolbar();
  }

  // --- Zustand ---

  setTool(tool) {
    this.tool = tool;
    this._refreshToolbar();
  }

  setColor(index) {
    this.colorIndex = index;
    this._refreshToolbar();
  }

  setSize(index) {
    this.sizeIndex = index;
    this._refreshToolbar();
  }

  setScale(value) {
    this.scale = THREE.MathUtils.clamp(value, MIN_SCALE, MAX_SCALE);
    this.group.scale.setScalar(this.scale);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  get uiTargets() {
    return this.group.visible ? [this.surface, this.handle, ...this.buttons] : [];
  }

  placeInFront(camera) {
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const pos = camPos.clone().addScaledVector(dir, 1.7);
    pos.y = THREE.MathUtils.clamp(camPos.y - 0.1, 0.9, 2.0);
    this.group.position.copy(pos);
    this.group.lookAt(camPos.x, pos.y, camPos.z);
  }

  // --- Zeichnen (uv aus dem Raycast der Zeichenfläche) ---

  _uvToPx(uv) {
    return { x: uv.x * CANVAS_W, y: (1 - uv.y) * CANVAS_H };
  }

  _applyStyle() {
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const base = SIZES[this.sizeIndex].width;
    if (this.tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 1;
      ctx.lineWidth = base * 4;
    } else if (this.tool === 'marker') {
      ctx.strokeStyle = PEN_COLORS[this.colorIndex];
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = base * 3;
    } else {
      ctx.strokeStyle = PEN_COLORS[this.colorIndex];
      ctx.globalAlpha = 1;
      ctx.lineWidth = base;
    }
  }

  _isShapeTool() {
    return this.tool === 'line' || this.tool === 'rect' || this.tool === 'circle';
  }

  strokeStart(uv) {
    const p = this._uvToPx(uv);
    this._stroke = { start: p, last: p };
    if (this._isShapeTool()) {
      this._stroke.snapshot = this.ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    } else {
      this._segment(p, p);
    }
  }

  strokeMove(uv) {
    if (!this._stroke) return;
    const p = this._uvToPx(uv);
    if (this._isShapeTool()) {
      this.ctx.putImageData(this._stroke.snapshot, 0, 0);
      this._shape(this._stroke.start, p);
    } else {
      this._segment(this._stroke.last, p);
      this._stroke.last = p;
    }
    this._markDirty();
  }

  strokeEnd() {
    this._stroke = null;
  }

  _segment(a, b) {
    this._applyStyle();
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this._markDirty();
  }

  _shape(a, b) {
    this._applyStyle();
    const ctx = this.ctx;
    ctx.beginPath();
    if (this.tool === 'line') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else if (this.tool === 'rect') {
      ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    } else {
      ctx.ellipse(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        Math.abs(b.x - a.x) / 2,
        Math.abs(b.y - a.y) / 2,
        0,
        0,
        Math.PI * 2
      );
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _markDirty() {
    this.hasContent = true;
    this.texture.needsUpdate = true;
  }

  clearBoard() {
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.texture.needsUpdate = true;
    // hasContent bleibt true, damit der geleerte Stand auch gespeichert wird
  }

  // --- Persistenz ---

  toDataURL() {
    return this.canvas.toDataURL('image/png');
  }

  loadDataURL(dataURL) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        this.ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        this.texture.needsUpdate = true;
        this.hasContent = true;
        resolve(true);
      };
      img.onerror = () => resolve(false);
      img.src = dataURL;
    });
  }

  toJSON() {
    return {
      visible: this.group.visible,
      position: this.group.position.toArray(),
      quaternion: this.group.quaternion.toArray(),
      scale: this.scale,
      image: this.hasContent ? this.toDataURL() : null,
    };
  }

  loadJSON(data) {
    if (!data) return;
    if (Array.isArray(data.position)) this.group.position.fromArray(data.position);
    if (Array.isArray(data.quaternion)) this.group.quaternion.fromArray(data.quaternion);
    if (typeof data.scale === 'number') this.setScale(data.scale);
    this.group.visible = Boolean(data.visible);
    if (typeof data.image === 'string' && data.image.startsWith('data:image')) {
      this.loadDataURL(data.image);
    }
  }
}
