import * as THREE from 'three';
import { createTextPanel } from './textPanel.js';

const ACTIONS = [
  { id: 'new', label: '＋ Neue Karte' },
  { id: 'related', label: '✨ Verwandte Ideen' },
  { id: 'cluster', label: '🗂 Cluster' },
  { id: 'summary', label: '📝 Zusammenfassen' },
  { id: 'delete', label: '🗑 Karte löschen' },
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

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.19, 0.31),
      new THREE.MeshBasicMaterial({ color: 0x0b121a, transparent: true, opacity: 0.9 })
    );
    bg.position.z = -0.003;
    this.group.add(bg);

    const title = createTextPanel({
      width: 0.17,
      height: 0.03,
      text: 'Brainstorming',
      background: 'rgba(0,0,0,0)',
      fontSize: 28,
    });
    title.mesh.position.set(0, 0.13, 0.001);
    this.group.add(title.mesh);

    ACTIONS.forEach((action, i) => {
      const panel = createTextPanel({
        width: 0.17,
        height: 0.045,
        text: action.label,
        background: BTN_BG,
        fontSize: 26,
      });
      panel.mesh.position.set(0, 0.085 - i * 0.052, 0.001);
      panel.mesh.userData.onClick = () => onAction(action.id);
      panel.mesh.userData.setHover = (hovered) =>
        panel.setColors({ background: hovered ? BTN_BG_HOVER : BTN_BG });
      this.group.add(panel.mesh);
      this.buttons.push(panel.mesh);
    });
  }

  attachToGrip(grip, handedness) {
    if (this.attachedHand === 'left' && handedness !== 'left') return;
    grip.add(this.group);
    this.attachedHand = handedness;
    // Über dem Handgelenk, zum Gesicht geneigt – Werte bei Bedarf anpassen
    this.group.position.set(0, 0.08, 0.1);
    this.group.rotation.set(-Math.PI / 3, 0, 0);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }
}
