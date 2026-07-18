import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

const ACTIONS = [
  { id: 'new', label: '＋ Neue Karte' },
  { id: 'related', label: '✨ Verwandte Ideen' },
  { id: 'cluster', label: '🗂 Cluster' },
  { id: 'summary', label: '📝 Zusammenfassen' },
  { id: 'delete', label: '🗑 Karte löschen' },
  { id: 'clear', label: '🧹 Alles löschen' },
  { id: 'environment', label: '🌐 Umgebung' },
];

const BTN_BG = '#27435c';
const BTN_BG_HOVER = '#3a6b93';

// Menü-Panel am linken Handgelenk; Buttons werden per Controller-Ray geklickt.
export class WristMenu {
  constructor(onAction) {
    this.group = new THREE.Group();
    this.group.name = 'wristMenu';
    this.group.visible = false;
    this.buttons = [];
    this.attachedHand = null;

    // 2-Spalten-Raster; ein ungerader letzter Button bekommt die volle Breite
    const BTN_W = 0.115;
    const BTN_H = 0.05;
    const GAP = 0.007;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x0b121a, transparent: true, opacity: 0.9 })
    );
    bg.position.z = -0.003;
    this.group.add(bg);

    const title = createTextPanel({
      width: 0.22,
      height: 0.03,
      text: 'Brainstorming',
      background: 'rgba(0,0,0,0)',
      fontSize: 28,
    });
    title.mesh.position.set(0, 0.125, 0.001);
    this.group.add(title.mesh);

    const topY = 0.08;
    ACTIONS.forEach((action, i) => {
      const row = Math.floor(i / 2);
      const isLastFullWidth = i === ACTIONS.length - 1 && ACTIONS.length % 2 === 1;
      const width = isLastFullWidth ? BTN_W * 2 + GAP : BTN_W;
      const x = isLastFullWidth ? 0 : (i % 2 === 0 ? -1 : 1) * (BTN_W + GAP) / 2;

      const panel = createTextPanel({
        width,
        height: BTN_H,
        text: action.label,
        background: BTN_BG,
        fontSize: 22,
      });
      panel.mesh.position.set(x, topY - row * (BTN_H + GAP), 0.001);
      panel.mesh.userData.onClick = () => onAction(action.id);
      panel.mesh.userData.setHover = (hovered) =>
        panel.setColors({ background: hovered ? BTN_BG_HOVER : BTN_BG });
      this.group.add(panel.mesh);
      this.buttons.push(panel.mesh);
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
    this.group.position.set(0, 0.08, 0.1);
    this.group.rotation.set(-Math.PI / 3, 0, 0);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
