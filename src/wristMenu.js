import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

const ACTIONS = [
  { id: 'new', label: '＋ Neue Karte' },
  { id: 'topic', label: '🚀 Themen-Start' },
  { id: 'related', label: '✨ Verwandte Ideen' },
  { id: 'cluster', label: '📂 Cluster anwenden' },
  { id: 'summary', label: '📝 Zusammenfassen' },
  { id: 'color', label: '🎨 Farbe' },
  { id: 'connect', label: '🔗 Verbinden' },
  { id: 'delete', label: '🗑️ Karte löschen', danger: true },
  { id: 'clear', label: '🧹 Alles löschen', danger: true },
  { id: 'environment', label: '🌐 Umgebung' },
];

const COLORS = {
  panelFill: 'rgba(13, 20, 30, 0.98)',
  panelBorder: 'rgba(95, 170, 210, 0.55)',
  accent: '#6fd7e6',
  base: '#24384f',
  hover: '#37587a',
  dangerBase: '#4a2a34',
  dangerHover: '#6d3a48',
  text: '#eef3f8',
};

// Abgerundetes Panel als Canvas-Textur (Füllung + feiner Rahmen + Glow)
function makeRoundedPanel(width, height, { fill, border }, pxPerMeter = 1400) {
  const w = Math.round(width * pxPerMeter);
  const h = Math.round(height * pxPerMeter);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const r = 34;
  const inset = 6;
  const rr = (x, y, ww, hh, rad) => {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
    ctx.arcTo(x, y + hh, x, y, rad);
    ctx.arcTo(x, y, x + ww, y, rad);
    ctx.closePath();
  };
  rr(inset, inset, w - inset * 2, h - inset * 2, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = border;
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  return mesh;
}

// UI-Ebene "flach" halten: keine tiefenbasierte Sortierung (die bei bewegtem
// Blickwinkel kippt und den Hintergrund über Buttons malt), sondern feste
// Zeichenreihenfolge per renderOrder. depthWrite aus → reine Maler-Reihenfolge.
function flatLayer(mesh, order) {
  mesh.material.depthWrite = false;
  mesh.material.depthTest = false;
  mesh.renderOrder = order;
  mesh.traverse((child) => {
    if (child.material) {
      child.material.depthWrite = false;
      child.material.depthTest = false;
      child.renderOrder = order;
    }
  });
  return mesh;
}

// Menü-Panel am Handgelenk; Buttons werden per Controller-Ray geklickt.
export class WristMenu {
  constructor(onAction) {
    this.group = new THREE.Group();
    this.group.name = 'wristMenu';
    this.group.visible = false;
    this.buttons = [];
    this.attachedHand = null;

    const BTN_W = 0.138;
    const BTN_H = 0.05;
    const GAP_X = 0.01;
    const GAP_Y = 0.009;
    const PAD = 0.022;
    const HEADER_H = 0.042;
    const rows = Math.ceil(ACTIONS.length / 2);

    const panelW = 2 * BTN_W + GAP_X + PAD * 2;
    const panelH = PAD + HEADER_H + 0.014 + rows * BTN_H + (rows - 1) * GAP_Y + PAD;

    const panel = makeRoundedPanel(panelW, panelH, {
      fill: COLORS.panelFill,
      border: COLORS.panelBorder,
    });
    panel.position.z = -0.004;
    flatLayer(panel, 20); // Hintergrund zuerst
    this.group.add(panel);

    const top = panelH / 2;
    const headerY = top - PAD - HEADER_H / 2;

    const title = createTextPanel({
      width: panelW - PAD * 2,
      height: HEADER_H,
      text: '🧠 Brainstorming',
      background: 'transparent',
      color: COLORS.accent,
      weight: 700,
      singleLine: true,
      fontSize: 30,
      doubleSided: false,
    });
    title.mesh.position.set(0, headerY, 0.002);
    flatLayer(title.mesh, 22);
    this.group.add(title.mesh);

    // Trennlinie unter dem Header
    const divider = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW - PAD * 2, 0.0016),
      new THREE.MeshBasicMaterial({ color: 0x6fd7e6, transparent: true, opacity: 0.5 })
    );
    const dividerY = headerY - HEADER_H / 2 - 0.006;
    divider.position.set(0, dividerY, 0.002);
    flatLayer(divider, 22);
    this.group.add(divider);

    const gridTopY = dividerY - 0.01 - BTN_H / 2;
    const colX = (BTN_W + GAP_X) / 2;

    ACTIONS.forEach((action, i) => {
      const row = Math.floor(i / 2);
      const x = (i % 2 === 0 ? -1 : 1) * colX;
      const y = gridTopY - row * (BTN_H + GAP_Y);
      const base = action.danger ? COLORS.dangerBase : COLORS.base;
      const hover = action.danger ? COLORS.dangerHover : COLORS.hover;

      const panelBtn = createTextPanel({
        width: BTN_W,
        height: BTN_H,
        text: action.label,
        background: base,
        color: COLORS.text,
        weight: 600,
        singleLine: true,
        fontSize: 25,
        padding: 24,
        radius: 22,
        doubleSided: false,
      });
      panelBtn.mesh.position.set(x, y, 0.002);
      flatLayer(panelBtn.mesh, 21);
      panelBtn.mesh.userData.onClick = () => onAction(action.id);
      panelBtn.mesh.userData.setHover = (hovered) =>
        panelBtn.setColors({ background: hovered ? hover : base });
      this.group.add(panelBtn.mesh);
      this.buttons.push(panelBtn.mesh);
    });
  }

  // Grips beider Controller registrieren; das Menü sitzt bevorzugt am linken.
  // Robust gegen beliebige Verbindungsreihenfolge und fehlende handedness-Angabe.
  registerGrip(handedness, grip) {
    if (handedness === 'left') this.leftGrip = grip;
    else if (handedness === 'right') this.rightGrip = grip;
    else this.fallbackGrip ??= grip;

    const target = this.leftGrip || this.rightGrip || this.fallbackGrip || grip;
    const hand = this.leftGrip ? 'left' : this.rightGrip ? 'right' : 'unknown';
    this._attach(target, hand);
  }

  _attach(grip, handedness) {
    grip.add(this.group); // Object3D wird automatisch vom alten Grip gelöst
    this.attachedHand = handedness;
    // Über dem Handgelenk, zum Gesicht geneigt – Werte bei Bedarf anpassen
    this.group.position.set(0, 0.07, 0.11);
    this.group.rotation.set(-Math.PI / 3, 0, 0);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
